"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { GiftModal } from "@/app/feed/ui";
import { MiniProfileModal, type MiniProfileSubject, type MiniProfilePointsRow, type MiniProfileAwardRow } from "@/components/ui/mini-profile";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { VipBadge, VIP_TIER_COLORS, type VipTier } from "@/components/ui/vip-badge";
import { RoleBadge, type RoleType } from "@/components/ui/role-badge";
import { parseLifetimeUsd } from "@/lib/utils";

// No default photo - GifterRingAvatar shows initials when imageUrl is null

const DEFAULT_EMOTES = ["🔥", "😂", "❤️", "👀", "😭"];

type LiveState = {
  id: string;
  is_live: boolean;
  channel_name: string;
  host_user_id: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
};

type LiveChatRow = {
  id: string;
  created_at: string | null;
  live_id: string | null;
  sender_user_id: string | null;
  message: string | null;
  type: "chat" | "emote" | "system" | "tip";
  metadata: any;
  is_deleted: boolean;
  deleted_by: string | null;
  deleted_at: string | null;
};

type TopGifterRow = {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  total_amount: number | null;
  rank: number;
};

function sessionKey(live: LiveState) {
  return (
    String(live.started_at ?? "").trim() ||
    String(live.updated_at ?? "").trim() ||
    String(live.id ?? "").trim() ||
    "live"
  );
}

export function LiveClient({
  initialLive,
  myUserId,
  nextPath,
  forceHostMode,
}: {
  initialLive: LiveState;
  myUserId: string | null;
  nextPath: string;
  forceHostMode?: boolean;
}) {
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

  const isHostMode = useMemo(() => {
    if (forceHostMode) return true;
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("host") === "1";
    } catch {
      return false;
    }
  }, [forceHostMode]);

  const [live, setLive] = useState<LiveState>(initialLive);
  const [rows, setRows] = useState<LiveChatRow[]>([]);
  const [text, setText] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [memberByUserId, setMemberByUserId] = useState<
    Record<
      string,
      { photo_url: string | null; lifetime_gifted_total_usd: number | null; favorited_username: string | null; vip_tier?: VipTier | null }
    >
  >({});
  const [roleByUserId, setRoleByUserId] = useState<Record<string, RoleType>>({});

  const [hostPending, startHostTransition] = useTransition();
  const [isHost, setIsHost] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const [topToday, setTopToday] = useState<TopGifterRow[]>([]);
  const [topWeekly, setTopWeekly] = useState<TopGifterRow[]>([]);
  const [topAllTime, setTopAllTime] = useState<TopGifterRow[]>([]);
  const [topLive, setTopLive] = useState<TopGifterRow[]>([]);
  const [topModalOpen, setTopModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"today" | "weekly" | "all_time">("today");

  // Gift modal state
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftPending, startGiftTransition] = useTransition();
  const [giftPresets, setGiftPresets] = useState<number[]>([10, 30, 50, 100, 200]);
  const [giftSettings, setGiftSettings] = useState<{ allowCustom: boolean; minCents: number; maxCents: number; enabled: boolean }>({
    allowCustom: true,
    minCents: 10,
    maxCents: 20000,
    enabled: true,
  });

  const [agoraReady, setAgoraReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [lastRtcEvent, setLastRtcEvent] = useState<string | null>(null);

  const [streamEnded, setStreamEnded] = useState(false);

  const rtcClientRef = useRef<any>(null);
  const rtcLocalTracksRef = useRef<{ mic?: any; cam?: any } | null>(null);
  const rtcTokenRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const rtcAwaySinceRef = useRef<number | null>(null);
  const rtcAbortJoinRef = useRef(0);
  const rtcJoinInFlightRef = useRef(false);
  const rtcLeftRef = useRef(false);
  const rtcSessionKeyRef = useRef<string>("");

  const rtcDebugEnabled = process.env.NODE_ENV !== "production";
  const rtcLog = useCallback((...args: any[]) => {
    if (!rtcDebugEnabled) return;
    try { console.log("[RTC]", ...args); } catch {}
  }, [rtcDebugEnabled]);

  const viewerDebugEnabled = process.env.NODE_ENV !== "production";
  const viewerLog = useCallback((...args: any[]) => {
    if (!viewerDebugEnabled) return;
    try { console.log(...args); } catch {}
  }, [viewerDebugEnabled]);

  const hardLeaveRtcSession = useCallback(async (reason: string) => {
    if (rtcLeftRef.current) return;
    rtcAbortJoinRef.current += 1;
    rtcLeftRef.current = true;
    rtcJoinInFlightRef.current = false;
    rtcLog("leave", { reason, at: new Date().toISOString(), sessionKey: rtcSessionKeyRef.current });

    const client = rtcClientRef.current;
    const tracks = rtcLocalTracksRef.current;

    try {
      if (rtcTokenRefreshRef.current) {
        clearInterval(rtcTokenRefreshRef.current);
        rtcTokenRefreshRef.current = null;
      }

      try { client?.removeAllListeners?.(); } catch {}

      try {
        if (tracks?.mic || tracks?.cam) {
          try { await client?.unpublish?.([tracks.mic, tracks.cam].filter(Boolean)); } catch {}
        }
      } catch {}

      try { tracks?.mic?.stop?.(); } catch {}
      try { tracks?.mic?.close?.(); } catch {}
      try { tracks?.cam?.stop?.(); } catch {}
      try { tracks?.cam?.close?.(); } catch {}

      try { await client?.leave?.(); } catch {}
    } finally {
      rtcLocalTracksRef.current = null;
      rtcClientRef.current = null;
      rtcSessionKeyRef.current = "";

      setBroadcasting(false);
      setAgoraReady(false);
      setHasRemoteVideo(false);
      setRemoteUid(null);
      setLocalRtc(null);
      setRemoteCount(0);
      setLastRtcEvent(`left:${reason}`);
    }
  }, [rtcLog]);

  const forceExitViewer = useCallback(
    async (reason: string) => {
      if (isHostMode) return;
      try {
        if (myUserId) {
          const lid =
            String((live as any)?.id ?? "").trim() ||
            String((initialLive as any)?.id ?? "").trim();
          if (lid) {
            await sb.rpc("cfm_leave_live_viewer", { p_live_id: lid });
          }
        }
      } catch {}
      setStreamEnded(true);
      await hardLeaveRtcSession(reason);
      try {
        router.push(nextPath && nextPath.startsWith("/") ? nextPath : "/");
        router.refresh();
      } catch {}
    },
    [hardLeaveRtcSession, initialLive, isHostMode, live, myUserId, nextPath, router, sb],
  );

  const [idlePaused, setIdlePaused] = useState(false);
  const [idleEpoch, setIdleEpoch] = useState(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityAtRef = useRef<number>(Date.now());

  function resumeWatching() {
    if (isHostMode) return;
    lastActivityAtRef.current = Date.now();
    setIdlePaused(false);
    setIdleEpoch((n) => n + 1);
  }

  useEffect(() => {
    if (isHostMode) return;

    const onActivity = () => {
      lastActivityAtRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];

    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true } as any);
    }

    const checkIdle = () => {
      if (idlePaused) return;
      if (!live.is_live) return;
      const last = lastActivityAtRef.current || Date.now();
      if (Date.now() - last >= 5 * 60 * 1000) {
        rtcLog("idle_timeout");
        void hardLeaveRtcSession("idle_timeout");
        setIdlePaused(true);
      }
    };

    idleTimerRef.current = setInterval(checkIdle, 5000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, onActivity as any);
      }
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      idleTimerRef.current = null;
    };
  }, [hardLeaveRtcSession, idlePaused, isHostMode, live.is_live, rtcLog]);

  // Gift flash animation state
  const [giftFlash, setGiftFlash] = useState<{ message: string; key: number } | null>(null);
  const giftFlashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mini profile popup state - using proper MiniProfileModal
  const [miniProfileOpen, setMiniProfileOpen] = useState(false);
  const [miniProfileSubject, setMiniProfileSubject] = useState<MiniProfileSubject | null>(null);
  const [miniProfileLeaderboard, setMiniProfileLeaderboard] = useState<MiniProfilePointsRow[]>([]);
  const [miniProfileAwards, setMiniProfileAwards] = useState<MiniProfileAwardRow[]>([]);

  async function showMiniProfile(userId: string) {
    const uid = String(userId ?? "").trim();
    if (!uid) return;
    
    try {
      const [profileRes, lbRes, awardsRes] = await Promise.all([
        sb
          .from("cfm_public_member_ids")
          .select(
            "user_id,favorited_username,photo_url,lifetime_gifted_total_usd,vip_tier,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link",
          )
          .eq("user_id", uid)
          .maybeSingle(),
        sb.rpc("cfm_leaderboard", { limit_n: 500 }),
        sb
          .from("cfm_awards")
          .select("id,user_id,award_type,week_start,week_end,notes,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const profileRow = (profileRes as any)?.data ?? null;
      const subj: MiniProfileSubject | null = profileRow
        ? {
            user_id: profileRow.user_id ?? uid,
            favorited_username: String(profileRow.favorited_username ?? nameByUserId[uid] ?? "Member"),
            photo_url: profileRow.photo_url ?? null,
            lifetime_gifted_total_usd: parseLifetimeUsd((profileRow as any)?.lifetime_gifted_total_usd),
            vip_tier: (profileRow as any)?.vip_tier ?? null,
            bio: profileRow.bio ?? null,
            public_link: profileRow.public_link ?? null,
            instagram_link: profileRow.instagram_link ?? null,
            x_link: profileRow.x_link ?? null,
            tiktok_link: profileRow.tiktok_link ?? null,
            youtube_link: profileRow.youtube_link ?? null,
          }
        : {
            user_id: uid,
            favorited_username: nameByUserId[uid] || "Member",
          };

      const lbRows = (((lbRes as any)?.data ?? []) as any[]) as MiniProfilePointsRow[];
      const awards = (((awardsRes as any)?.data ?? []) as any[]) as MiniProfileAwardRow[];

      setMiniProfileSubject(subj);
      setMiniProfileLeaderboard(lbRows);
      setMiniProfileAwards(awards);

      setMiniProfileOpen(true);
    } catch {
      setMiniProfileSubject({
        user_id: uid,
        favorited_username: nameByUserId[uid] || "Member",
      });
      setMiniProfileOpen(true);
    }

    if (isHost) {
      void (async () => {
        try {
          const { data } = await sb
            .from("cfm_live_bans")
            .select("banned_user_id")
            .eq("banned_user_id", uid)
            .is("revoked_at", null)
            .maybeSingle();
          const isB = !!(data as any)?.banned_user_id;
          setBannedUserIdMap((prev) => {
            const next = { ...prev };
            if (isB) next[uid] = true;
            else delete (next as any)[uid];
            return next;
          });
        } catch {
        }
      })();
    }
  }

  // Database-backed viewer tracking
  type ViewerInfo = { id: string; name: string; joinedAt: number; isOnline: boolean };
  const [viewers, setViewers] = useState<ViewerInfo[]>([]);
  const viewerHeartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const viewerUserIdRef = useRef<string | null>(null);
  const viewerJoinKeyRef = useRef<string>("");
  const agoraCleanupRef = useRef<(() => void) | null>(null);
  const [localRtc, setLocalRtc] = useState<{ appId: string; channel: string; uid: string; role: string } | null>(null);
  const videoRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [fallingEmotes, setFallingEmotes] = useState<{ id: string; emoji: string; leftPct: number }[]>([]);
  const seenRemoteEmotesRef = useRef<Record<string, true>>({});
  const lastLocalEmoteAtRef = useRef<number>(0);

  const isLoggedIn = !!myUserId;
  const [kicked, setKicked] = useState(false);
  const [kickReason, setKickReason] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const hostWasLiveRef = useRef(false);
  const hostEndRedirectedRef = useRef(false);

  useEffect(() => {
    if (isHostMode) return;
    if (!isLoggedIn) return;
    if (!kicked) return;
    const t = setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          window.location.assign("/");
          return;
        }
        router.replace("/");
        router.refresh();
      } catch {}
    }, 1200);
    return () => clearTimeout(t);
  }, [isHostMode, isLoggedIn, kicked, router]);

  useEffect(() => {
    if (!isHostMode) return;
    if (live.is_live) hostWasLiveRef.current = true;
  }, [isHostMode, live.is_live]);

  useEffect(() => {
    if (!isHostMode) return;
    if (live.is_live) return;
    if (!hostWasLiveRef.current) return;
    if (hostEndRedirectedRef.current) return;
    hostEndRedirectedRef.current = true;

    const t = setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          window.location.assign("/");
          return;
        }
        router.replace("/");
        router.refresh();
      } catch {}
    }, 300);

    return () => clearTimeout(t);
  }, [isHostMode, live.is_live, router]);

  const chatLiveId = useMemo(() => {
    const v = String((live as any)?.id ?? "").trim();
    if (v) return v;
    const fallback = String((initialLive as any)?.id ?? "").trim();
    return fallback;
  }, [initialLive, live]);

  const liveSessionKey = useMemo(() => sessionKey(live), [live]);

  useEffect(() => {
    setRows([]);
    setNameByUserId({});
    setMemberByUserId({});
    setRoleByUserId({});
    setViewers([]);
    setViewerListOpen(false);
    setTopLive([]);
    setTopModalOpen(false);
    setStreamEnded(false);
    setKicked(false);
    setKickReason(null);
    setBanned(false);
    setBanReason(null);
    hostWasLiveRef.current = false;
    hostEndRedirectedRef.current = false;

    if (giftFlashTimeoutRef.current) {
      clearTimeout(giftFlashTimeoutRef.current);
      giftFlashTimeoutRef.current = null;
    }
    setGiftFlash(null);
  }, [liveSessionKey]);

  // Fetch admin/moderator roles once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await sb.from("cfm_admins").select("user_id,role");
        if (cancelled) return;
        const roles: Record<string, RoleType> = {};
        for (const a of (data ?? []) as any[]) {
          const uid = String(a?.user_id ?? "").trim();
          const role = String(a?.role ?? "").trim();
          if (uid && (role === "owner" || role === "admin" || role === "moderator")) {
            roles[uid] = role as RoleType;
          }
        }
        setRoleByUserId(roles);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [sb]);

  const loadTopGifters = useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        sb.rpc("cfm_top_gifters", { period: "today" }),
        sb.rpc("cfm_top_gifters", { period: "weekly" }),
        sb.rpc("cfm_top_gifters", { period: "all_time" }),
      ]);
      console.log("[loadTopGifters] today:", r1.data, r1.error);
      console.log("[loadTopGifters] weekly:", r2.data, r2.error);
      console.log("[loadTopGifters] all_time:", r3.data, r3.error);
      setTopToday(((r1.data ?? []) as any[]) as TopGifterRow[]);
      setTopWeekly(((r2.data ?? []) as any[]) as TopGifterRow[]);
      setTopAllTime(((r3.data ?? []) as any[]) as TopGifterRow[]);
    } catch (e) {
      console.error("[loadTopGifters] error:", e);
    }
  }, [sb]);

  const loadTopLiveGifters = useCallback(async () => {
    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;
    try {
      const r1 = await sb.rpc("cfm_live_top_gifters", { p_live_id: liveId });
      setTopLive(((r1.data ?? []) as any[]) as TopGifterRow[]);
    } catch {
      setTopLive([]);
    }
  }, [chatLiveId, sb]);

  const medal = (r: number) => {
    if (r === 1) return { label: "🥇", cls: "border-yellow-400/40 bg-yellow-400/15" };
    if (r === 2) return { label: "🥈", cls: "border-gray-300/40 bg-gray-300/15" };
    if (r === 3) return { label: "🥉", cls: "border-orange-400/40 bg-orange-400/15" };
    return { label: `#${r}`, cls: "border-white/10 bg-white/5" };
  };

  const fmtCoins = (coins: number | null) => {
    const v = Math.floor(Number(coins ?? 0));
    if (!Number.isFinite(v) || v <= 0) return "0 coins";
    return `${new Intl.NumberFormat("en-US").format(v)} coins`;
  };

  async function openProfile(userId: string) {
    const uid = String(userId ?? "").trim();
    if (!uid) return;

    try {
      const { data } = await sb
        .from("cfm_public_member_ids")
        .select("favorited_username")
        .eq("user_id", uid)
        .maybeSingle();

      const uname = String((data as any)?.favorited_username ?? "").trim();
      if (uname) {
        router.push(`/u/${encodeURIComponent(uname)}`);
        return;
      }
    } catch {
    }

    router.push("/members");
  }

  const renderAvatar = (userId: string, name: string, url: string | null, size = 28) => {
    const uid = String(userId ?? "").trim();
    const cached = uid ? memberByUserId[uid] ?? null : null;
    const lifetimeCoins = parseLifetimeUsd((cached as any)?.lifetime_gifted_total_usd);

    const resolvedUrl = url ?? cached?.photo_url ?? null;
    return (
      <GifterRingAvatar
        size={size}
        imageUrl={resolvedUrl}
        name={name}
        totalUsd={lifetimeCoins}
        showDiamondShimmer
      />
    );
  };

  const top3 = topLive.slice(0, 3);
  const modalRows = topTab === "today" ? topToday : topTab === "weekly" ? topWeekly : topAllTime;

  // Map user IDs to their all-time rank (1, 2, or 3) for badge display
  const allTimeRankByUserId = useMemo(() => {
    const map: Record<string, number> = {};
    topAllTime.slice(0, 3).forEach((g, i) => {
      const uid = String(g.profile_id ?? "").trim();
      if (uid) map[uid] = i + 1;
    });
    return map;
  }, [topAllTime]);

  const getBadge = (userId: string) => {
    const rank = allTimeRankByUserId[userId];
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return "";
  };

  const sortedViewers = useMemo(() => {
    const next = [...viewers];
    next.sort((a, b) => {
      const ao = !!a.isOnline;
      const bo = !!b.isOnline;
      if (ao !== bo) return ao ? -1 : 1;
      return (b.joinedAt ?? 0) - (a.joinedAt ?? 0);
    });
    return next;
  }, [viewers]);

  useEffect(() => {
    void loadTopLiveGifters();
    const t = setInterval(() => {
      void loadTopLiveGifters();
    }, 15000);
    return () => clearInterval(t);
  }, [liveSessionKey, loadTopLiveGifters]);

  const kickViewer = useCallback(
    async (viewerUserId: string) => {
      const lid = String(chatLiveId ?? "").trim();
      const uid = String(viewerUserId ?? "").trim();
      if (!lid || !uid) return;
      if (uid === myUserId) return;
      try {
        await sb.rpc("cfm_kick_live_viewer", {
          p_live_id: lid,
          p_user_id: uid,
          p_reason: null,
        });
        toast("Viewer removed", "success");
      } catch {
        toast("Kick failed", "error");
      }
    },
    [chatLiveId, myUserId, sb],
  );

  const [bannedUserIdMap, setBannedUserIdMap] = useState<Record<string, true>>({});

  const refreshBans = useCallback(
    async (idsRaw: string[]) => {
      const ids = Array.from(new Set(idsRaw.map((x) => String(x ?? "").trim()).filter(Boolean)));
      if (!ids.length) {
        setBannedUserIdMap({});
        return;
      }
      try {
        const { data } = await sb
          .from("cfm_live_bans")
          .select("banned_user_id")
          .in("banned_user_id", ids)
          .is("revoked_at", null);
        const next: Record<string, true> = {};
        for (const row of (data ?? []) as any[]) {
          const uid = String((row as any)?.banned_user_id ?? "").trim();
          if (uid) next[uid] = true;
        }
        setBannedUserIdMap(next);
      } catch {
      }
    },
    [sb],
  );

  const banUser = useCallback(
    async (userId: string) => {
      const uid = String(userId ?? "").trim();
      if (!uid) return;
      try {
        const { data, error } = await sb.rpc("cfm_ban_user", { p_banned_user_id: uid, p_reason: null });
        const payload: any = data ?? null;
        const payloadError = String(payload?.error ?? "").trim();
        if (error || payloadError) throw new Error(error?.message ?? payloadError);
        setBannedUserIdMap((prev) => ({ ...prev, [uid]: true }));
        toast("User banned", "success");
      } catch {
        toast("Ban failed", "error");
      }
    },
    [sb],
  );

  const unbanUser = useCallback(
    async (userId: string) => {
      const uid = String(userId ?? "").trim();
      if (!uid) return;
      try {
        const { data, error } = await sb.rpc("cfm_unban_user", { p_banned_user_id: uid });
        const payload: any = data ?? null;
        const payloadError = String(payload?.error ?? "").trim();
        if (error || payloadError) throw new Error(error?.message ?? payloadError);
        setBannedUserIdMap((prev) => {
          const next = { ...prev };
          delete (next as any)[uid];
          return next;
        });
        toast("User unbanned", "success");
      } catch {
        toast("Unban failed", "error");
      }
    },
    [sb],
  );

  useEffect(() => {
    if (!isHost) return;
    if (!viewerListOpen) return;
    void refreshBans(viewers.map((v) => String((v as any)?.id ?? "").trim()).filter(Boolean));
  }, [isHost, refreshBans, viewerListOpen, viewers]);

  useEffect(() => {
    if (isHostMode) return;
    if (!isLoggedIn || !myUserId) {
      setKicked(false);
      setKickReason(null);
      setBanned(false);
      setBanReason(null);
      return;
    }

    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;

    let cancelled = false;

    const disconnect = () => {
      void hardLeaveRtcSession("kicked");
    };

    (async () => {
      try {
        const { data } = await sb
          .from("cfm_live_kicks")
          .select("id,reason")
          .eq("live_id", liveId)
          .eq("kicked_user_id", myUserId)
          .maybeSingle();
        if (cancelled) return;
        if (data?.id) {
          setKicked(true);
          setKickReason(String((data as any)?.reason ?? "").trim() || null);
          disconnect();
        }
      } catch {
      }
    })();

    const ch = sb
      .channel(`live-kicks-${liveId}-${myUserId}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "cfm_live_kicks", filter: `live_id=eq.${liveId}` },
        (payload: any) => {
          const row = (payload as any)?.new ?? null;
          const kickedUserId = String(row?.kicked_user_id ?? "").trim();
          if (kickedUserId && kickedUserId === myUserId) {
            setKicked(true);
            setKickReason(String(row?.reason ?? "").trim() || null);
            disconnect();
            toast("Removed by host", "error");
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [chatLiveId, isHostMode, isLoggedIn, myUserId, sb]);

  useEffect(() => {
    if (isHostMode) return;
    if (!isLoggedIn || !myUserId) return;

    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;

    let cancelled = false;

    const disconnect = () => {
      void hardLeaveRtcSession("banned");
    };

    (async () => {
      try {
        const { data } = await sb
          .from("cfm_live_bans")
          .select("id,reason")
          .eq("banned_user_id", myUserId)
          .is("revoked_at", null)
          .maybeSingle();
        if (cancelled) return;
        if ((data as any)?.id) {
          setBanned(true);
          setBanReason(String((data as any)?.reason ?? "").trim() || "You have been banned");
          disconnect();
          toast("You have been banned", "error");
        }
      } catch {
      }
    })();

    const ch = sb
      .channel(`live-bans-${liveId}-${myUserId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "cfm_live_bans", filter: `banned_user_id=eq.${myUserId}` },
        (payload: any) => {
          const row = (payload as any)?.new ?? null;
          const bannedUserId = String(row?.banned_user_id ?? "").trim();
          const revokedAt = row?.revoked_at ?? null;
          if (bannedUserId && bannedUserId === myUserId && revokedAt == null) {
            setBanned(true);
            setBanReason(String(row?.reason ?? "").trim() || "You have been banned");
            disconnect();
            toast("You have been banned", "error");
            return;
          }

          if (bannedUserId && bannedUserId === myUserId && revokedAt != null) {
            setBanned(false);
            setBanReason(null);

            // Allow re-join attempts immediately after unban (no restart required)
            viewerJoinKeyRef.current = "";
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [chatLiveId, hardLeaveRtcSession, isHostMode, isLoggedIn, myUserId, sb]);

  const triggerOwnerLivePush = useCallback(async () => {
    try {
      await fetch("/api/push/owner-live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
    }
  }, []);

  // Auto-start live when host opens /hostlive
  useEffect(() => {
    if (!isHostMode) return;
    if (live.is_live) return; // Already live
    
    // Auto-start the live stream
    (async () => {
      try {
        const { data, error } = await sb.rpc("cfm_set_live", {
          next_is_live: true,
          next_title: live.title || "CannaFam Live",
        } as any);
        if (!error && data) {
          setLive((prev) => ({ ...(prev as any), ...(data as any) }));
        }
      } catch {
        // Fallback
        try {
          const now = new Date().toISOString();
          await sb.from("cfm_live_state").update({
            is_live: true,
            started_at: live.started_at ?? now,
            ended_at: null,
            updated_at: now,
          }).eq("id", live.id);
          const { data: fresh } = await sb.rpc("cfm_get_live_state");
          const row = Array.isArray(fresh) ? (fresh[0] as any) : (fresh as any);
          if (row) setLive(row);
        } catch {}
      }
    })();
  }, [isHostMode, live.id, live.is_live, live.started_at, live.title, sb]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await sb.rpc("cfm_get_live_state");
        if (!mounted) return;
        const row = Array.isArray(data) ? (data[0] as any) : (data as any);
        if (row) setLive(row);
      } catch {
      }

      await loadTopGifters();

      const liveId = String(chatLiveId ?? "").trim();
      if (!liveId) return;

      try {
        const { data } = await sb
          .from("cfm_live_chat")
          .select("id,live_id,sender_user_id,message,type,metadata,is_deleted,deleted_by,deleted_at,created_at")
          .eq("live_id", liveId)
          .order("created_at", { ascending: false })
          .limit(80);
        if (!mounted) return;
        setRows(((data ?? []) as any[]).reverse() as any);
      } catch {
      }

      try {
        const channel = sb
          .channel(`live-chat-${liveId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "cfm_live_chat",
              filter: `live_id=eq.${liveId}`,
            },
            (payload: any) => {
              const row = payload.new as any;
              setRows((prev) => {
                const next = [...prev, row];
                return next.slice(-200);
              });
              
              // Trigger gift flash animation for gift messages
              const isGift = row.type === "tip" || row.metadata?.event === "gift";
              if (isGift) {
                const msg = String(row.message ?? "");
                if (giftFlashTimeoutRef.current) {
                  clearTimeout(giftFlashTimeoutRef.current);
                }
                setGiftFlash({ message: msg, key: Date.now() });
                void loadTopLiveGifters();
                giftFlashTimeoutRef.current = setTimeout(() => {
                  setGiftFlash(null);
                }, 5000);
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "cfm_live_chat",
              filter: `live_id=eq.${liveId}`,
            },
            (payload: any) => {
              const row = payload.new as any;
              setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
            },
          )
          .subscribe();

        return () => {
          sb.removeChannel(channel);
        };
      } catch {
      }
    })();

    return () => {
      mounted = false;
    };
  }, [liveSessionKey, loadTopGifters, loadTopLiveGifters, sb, chatLiveId]);

  // Subscribe to live state changes to auto-disconnect when stream ends
  useEffect(() => {
    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;

    const liveStateChannel = sb
      .channel(`live-state-${liveId}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "cfm_live_state", filter: `id=eq.${liveId}` },
        (payload: any) => {
          const row = payload.new as any;
          if (row) {
            setLive((prev) => ({ ...prev, ...row }));
            if (row.is_live === false) {
              void forceExitViewer("stream_end");
            }
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(liveStateChannel);
    };
  }, [chatLiveId, forceExitViewer, sb]);

  // Fallback: poll live state to ensure viewers disconnect even if realtime is blocked by RLS
  useEffect(() => {
    if (isHostMode) return;

    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;

    if (streamEnded) return;
    if (!live.is_live) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const { data } = await sb.rpc("cfm_get_live_state");
        if (cancelled) return;
        const row = Array.isArray(data) ? (data[0] as any) : (data as any);
        const nextLive = !!row?.is_live;

        if (!nextLive) {
          setLive((prev) => ({ ...(prev as any), ...(row as any) }));
          await forceExitViewer("stream_end_poll");
        }
      } catch {
      }
    };

    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [chatLiveId, forceExitViewer, isHostMode, live.is_live, sb, streamEnded]);

  // Page lifecycle safety: force exit immediately on background/pagehide/freeze
  useEffect(() => {
    if (isHostMode) return;

    const onAway = (reason: string) => {
      if (rtcAwaySinceRef.current == null) rtcAwaySinceRef.current = Date.now();
      void forceExitViewer(reason);
    };

    const onResume = (reason: string) => {
      const since = rtcAwaySinceRef.current;
      rtcAwaySinceRef.current = null;
      if (since != null && Date.now() - since >= 5000) {
        void forceExitViewer(reason);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        onAway("background_visibility_hidden");
        return;
      }
      if (document.visibilityState === "visible") {
        onResume("away_5s_resume_visibility");
      }
    };

    const handlePageHide = () => {
      onAway("background_pagehide");
    };

    const handleFreeze = () => {
      onAway("background_freeze");
    };

    const handleFocus = () => {
      onResume("away_5s_resume_focus");
    };

    const handlePageShow = () => {
      onResume("away_5s_resume_pageshow");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    (document as any).addEventListener?.("freeze", handleFreeze);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      (document as any).removeEventListener?.("freeze", handleFreeze);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [chatLiveId, forceExitViewer, isHostMode, myUserId, sb]);

  // Database-backed viewer tracking
  useEffect(() => {
    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;
    let cancelled = false;

    // Load viewers (works for all users)
    const loadViewers = async () => {
      try {
        const { data, error } = await sb.rpc("cfm_get_live_viewers", { p_live_id: liveId });
        if (cancelled) return;
        console.log("[loadViewers] data:", data, "error:", error);
        if (data && Array.isArray(data)) {
          setViewers(
            data.map((v: any) => ({
              id: String(v.user_id),
              name: String(v.display_name ?? "Viewer"),
              joinedAt: new Date(v.joined_at).getTime(),
              isOnline: Boolean(v.is_online),
            })),
          );
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[loadViewers] error:", e);
      }
    };

    viewerLog("[viewers] effect", { liveId, liveSessionKey, myUserId, isHostMode, kicked, idlePaused, isLive: live.is_live });

    const attemptJoin = async (uidRaw: string | null | undefined) => {
      const resolvedUserId = String(uidRaw ?? "").trim() || null;
      const shouldTrackMe = !!resolvedUserId && !isHostMode && !kicked && !banned && !idlePaused && !!live.is_live;
      viewerLog("[join] gate", { liveId, liveSessionKey, resolvedUserId, isHostMode, kicked, idlePaused, isLive: live.is_live, shouldTrackMe });
      if (!shouldTrackMe) return;

      const joinKey = `${liveSessionKey}:${liveId}:${resolvedUserId}`;
      if (viewerJoinKeyRef.current === joinKey) return;
      viewerUserIdRef.current = resolvedUserId;

      try {
        viewerLog("[join] attempting", { liveId, liveSessionKey, myUserId: resolvedUserId, isHostMode, kicked, isLive: live.is_live });
        const { data, error } = await sb.rpc("cfm_join_live_viewer", { p_live_id: liveId });
        viewerLog("[join] result", { data, error });
        const payload: any = data ?? null;
        const payloadError = String(payload?.error ?? "").trim();

        if (error || payloadError) {
          if (String(error?.message ?? payloadError) === "You are banned") {
            setBanned(true);
            setBanReason("You have been banned");
            void hardLeaveRtcSession("banned");
            toast("You have been banned", "error");
          }
          try {
            console.warn("[cfm_join_live_viewer]", {
              liveId,
              userId: resolvedUserId,
              error: error?.message ?? payloadError,
            });
          } catch {}
          return;
        }

        viewerJoinKeyRef.current = joinKey;
      } catch (e) {
        try {
          console.warn("[cfm_join_live_viewer]", { liveId, userId: resolvedUserId, error: e });
        } catch {}
        return;
      }

      setTimeout(loadViewers, 500);

      if (viewerHeartbeatRef.current) {
        clearInterval(viewerHeartbeatRef.current);
      }

      viewerHeartbeatRef.current = setInterval(async () => {
        try {
          viewerLog("[heartbeat] attempting", { liveId, liveSessionKey, myUserId: resolvedUserId, isHostMode, kicked, isLive: live.is_live });
          const { data, error } = await sb.rpc("cfm_viewer_heartbeat", { p_live_id: liveId });
          viewerLog("[heartbeat] result", { data, error });
          const hbPayload: any = data ?? null;
          const hbPayloadError = String(hbPayload?.error ?? "").trim();
          if (error || hbPayloadError) {
            if (String(error?.message ?? hbPayloadError) === "You are banned") {
              setBanned(true);
              setBanReason("You have been banned");
              void hardLeaveRtcSession("banned");
              toast("You have been banned", "error");
              return;
            }
            try {
              console.warn("[cfm_viewer_heartbeat]", {
                liveId,
                userId: resolvedUserId,
                error: error?.message ?? hbPayloadError,
              });
            } catch {}
          }
        } catch (e) {
          try {
            console.warn("[cfm_viewer_heartbeat]", { liveId, userId: resolvedUserId, error: e });
          } catch {}
        }
        loadViewers();
      }, 30000);
    };

    // Attempt join immediately using server-provided user id
    void attemptJoin(myUserId);

    // If server didn't provide, attempt join once session is loaded...
    (async () => {
      try {
        const { data } = await sb.auth.getUser();
        if (cancelled) return;
        void attemptJoin(data?.user?.id ?? null);
      } catch {}
    })();

    // ...and retry when auth becomes available later (Vercel/server auth race)
    const authSub = sb.auth.onAuthStateChange((_event: any, session: any) => {
      void attemptJoin(session?.user?.id ?? null);
    });

    loadViewers();
    const poll = setInterval(loadViewers, 10000);

    // Subscribe to realtime changes on cfm_live_viewers
    const viewerChannel = sb
      .channel(`live-viewers-${liveId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "cfm_live_viewers", filter: `live_id=eq.${liveId}` },
        () => {
          loadViewers();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);

      try {
        (authSub as any)?.data?.subscription?.unsubscribe?.();
      } catch {}

      // Leave as viewer (only if logged in)
      const leaveUserId = String(viewerUserIdRef.current ?? myUserId ?? "").trim();
      if (leaveUserId && !isHostMode) {
        (async () => {
          try {
            const { data, error } = await sb.rpc("cfm_leave_live_viewer", { p_live_id: liveId });
            const payload: any = data ?? null;
            const payloadError = String(payload?.error ?? "").trim();
            if (error || payloadError) {
              try {
                console.warn("[cfm_leave_live_viewer]", { liveId, userId: leaveUserId, error: error?.message ?? payloadError });
              } catch {}
            }
          } catch (e) {
            try {
              console.warn("[cfm_leave_live_viewer]", { liveId, userId: leaveUserId, error: e });
            } catch {}
          }
        })();
      }

      if (viewerHeartbeatRef.current) {
        clearInterval(viewerHeartbeatRef.current);
      }
      sb.removeChannel(viewerChannel);
    };
  }, [banned, idlePaused, isHostMode, isLoggedIn, kicked, live.is_live, liveSessionKey, sb, chatLiveId, myUserId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ids = Array.from(
          new Set(
            rows
              .map((r) => String(r.sender_user_id ?? "").trim())
              .filter(Boolean)
              .filter((id) => !nameByUserId[id]),
          ),
        );
        if (!ids.length) return;

        const { data } = await sb
          .from("cfm_public_member_ids")
          .select("user_id,favorited_username,photo_url,lifetime_gifted_total_usd,vip_tier")
          .in("user_id", ids);
        if (cancelled) return;

        const patch: Record<string, string> = {};
        const memberPatch: Record<string, { photo_url: string | null; lifetime_gifted_total_usd: number | null; favorited_username: string | null; vip_tier?: VipTier | null }> = {};
        for (const row of (data ?? []) as any[]) {
          const uid = String(row?.user_id ?? "").trim();
          const uname = String(row?.favorited_username ?? "").trim();
          const photoUrl = (row?.photo_url ?? null) as string | null;
          const lifetimeCoins = parseLifetimeUsd((row as any)?.lifetime_gifted_total_usd);
          const vipTier = (row as any)?.vip_tier ?? null;

          if (uid && uname) patch[uid] = uname;
          if (uid) {
            memberPatch[uid] = {
              photo_url: photoUrl,
              lifetime_gifted_total_usd: lifetimeCoins,
              favorited_username: uname || null,
              vip_tier: vipTier,
            };
          }
        }

        if (Object.keys(patch).length) {
          setNameByUserId((prev) => ({ ...prev, ...patch }));
        }

        if (Object.keys(memberPatch).length) {
          setMemberByUserId((prev) => ({ ...prev, ...memberPatch }));
        }
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nameByUserId, rows, sb]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = Array.from(
          new Set(
            [...topLive, ...topToday, ...topWeekly, ...topAllTime]
              .map((g) => String((g as any)?.profile_id ?? "").trim())
              .filter(Boolean)
              .concat(viewers.map((v) => String((v as any)?.id ?? "").trim()).filter(Boolean))
              .filter((id) => !memberByUserId[id]),
          ),
        );
        if (!ids.length) return;

        const { data } = await sb
          .from("cfm_public_member_ids")
          .select("user_id,favorited_username,photo_url,lifetime_gifted_total_usd,vip_tier")
          .in("user_id", ids)
          .limit(2000);
        if (cancelled) return;

        const memberPatch: Record<
          string,
          { photo_url: string | null; lifetime_gifted_total_usd: number | null; favorited_username: string | null; vip_tier?: VipTier | null }
        > = {};
        for (const row of (data ?? []) as any[]) {
          const uid = String(row?.user_id ?? "").trim();
          if (!uid) continue;
          memberPatch[uid] = {
            photo_url: (row?.photo_url ?? null) as string | null,
            lifetime_gifted_total_usd: parseLifetimeUsd((row as any)?.lifetime_gifted_total_usd),
            favorited_username: String(row?.favorited_username ?? "").trim() || null,
            vip_tier: (row as any)?.vip_tier ?? null,
          };
        }

        if (Object.keys(memberPatch).length) {
          setMemberByUserId((prev) => ({ ...prev, ...memberPatch }));
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberByUserId, sb, topAllTime, topLive, topToday, topWeekly]);

  useEffect(() => {
    const t = setInterval(() => {
      loadTopGifters();
    }, 30000);
    return () => clearInterval(t);
  }, [loadTopGifters]);

  useEffect(() => {
    try {
      const el = chatEndRef.current;
      if (!el) return;
      setTimeout(() => {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "end" });
        } catch {
        }
      }, 0);
    } catch {
    }
  }, [rows.length]);

  const spawnEmote = (emoji: string) => {
    try {
      const id = crypto.randomUUID();
      const leftPct = 8 + Math.random() * 84;
      setFallingEmotes((prev) => [...prev, { id, emoji, leftPct }].slice(-30));
      setTimeout(() => {
        setFallingEmotes((prev) => prev.filter((e) => e.id !== id));
      }, 6500);
    } catch {
    }
  };

  useEffect(() => {
    try {
      const recent = (rows.slice(-12) as any[]).filter((r) => String(r?.type ?? "") === "emote");
      if (!recent.length) return;

      for (const r of recent) {
        const id = String(r?.id ?? "").trim();
        if (!id) continue;
        if (seenRemoteEmotesRef.current[id]) continue;
        seenRemoteEmotesRef.current[id] = true;

        const emoji = String(r?.message ?? "").trim();
        if (!emoji) continue;

        const sender = String(r?.sender_user_id ?? "").trim();
        if (sender && myUserId && sender === String(myUserId)) {
          if (Date.now() - (lastLocalEmoteAtRef.current || 0) < 2000) continue;
        }

        spawnEmote(emoji);
      }
    } catch {
    }
  }, [myUserId, rows]);

  const shareLive = async () => {
    try {
      const url = `${window.location.origin}/live`;
      const nav: any = navigator as any;
      if (nav?.share) {
        await nav.share({ url, title: "CannaStreams Live" });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast("Link copied.", "success");
        return;
      }
    } catch {
    }

    toast("Could not share.", "error");
  };

  useEffect(() => {
    let cancelled = false;

    const shouldConnect =
      !!videoRef.current &&
      !streamEnded &&
      (isHostMode || (live.is_live && isLoggedIn && !kicked && !idlePaused));

    if (!shouldConnect) {
      if (rtcClientRef.current || rtcJoinInFlightRef.current) {
        hardLeaveRtcSession("gated");
      }
      return;
    }

    if (rtcClientRef.current || rtcJoinInFlightRef.current) return;

    rtcLeftRef.current = false;
    rtcJoinInFlightRef.current = true;

    rtcLog("join_start", { isHostMode, isLoggedIn, at: new Date().toISOString() });

    (async () => {
      const abortKey = rtcAbortJoinRef.current;
      try {
        const res = await fetch("/api/agora/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            role: isHostMode ? "host" : "viewer",
            client: "web",
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          rtcLog("token_fail", { status: res.status, errText });
          return;
        }

        const json = (await res.json()) as any;
        const token = String(json?.token ?? "");
        const uidNum = Number(json?.uid ?? 0);
        const appId = String(json?.appId ?? "");
        const channel = String(json?.channel ?? "");
        const role = String(json?.role ?? "viewer");
        const sessionKeyStr = `${role}:${channel}:${uidNum}`;

        if (!token || !appId || !channel) return;
        if (cancelled) return;
        if (rtcAbortJoinRef.current !== abortKey) return;

        rtcSessionKeyRef.current = sessionKeyStr;
        setLocalRtc({ appId, channel, uid: uidNum ? String(uidNum) : "", role });

        const rtcMod: any = await import("agora-rtc-sdk-ng");
        const AgoraRTC = (rtcMod?.default ?? rtcMod) as any;
        if (cancelled) return;
        if (rtcAbortJoinRef.current !== abortKey) return;

        const client = AgoraRTC.createClient({ mode: "live", codec: "h264" });
        rtcClientRef.current = client;

        client.on("connection-state-change", (cur: any, prev: any, reason: any) => {
          rtcLog("conn", { prev, cur, reason });
        });

        client.on("user-joined", (user: any) => {
          try {
            const uid = String(user?.uid ?? "");
            setLastRtcEvent(`user-joined:${uid}`);
            setRemoteCount(Number((client.remoteUsers ?? []).length));
          } catch {
          }
        });

        client.on("user-left", (user: any) => {
          try {
            setLastRtcEvent(`user-left:${String(user?.uid ?? "")}`);
            setRemoteCount(Number((client.remoteUsers ?? []).length));
          } catch {
          }
        });

        client.on("user-published", async (user: any, mediaType: any) => {
          try {
            await client.subscribe(user, mediaType);
            if (!videoRef.current) return;
            if (mediaType === "video") {
              user.videoTrack?.play(videoRef.current!);
              setRemoteUid(String(user.uid ?? ""));
              setHasRemoteVideo(true);
              setLastRtcEvent(`user-published-video:${String(user?.uid ?? "")}`);
            }
            if (mediaType === "audio") {
              user.audioTrack?.play();
              setLastRtcEvent(`user-published-audio:${String(user?.uid ?? "")}`);
            }
            setRemoteCount(Number((client.remoteUsers ?? []).length));
          } catch {
          }
        });

        client.on("user-unpublished", (user: any, mediaType: any) => {
          try {
            if (mediaType === "video") {
              const uidStr = String(user?.uid ?? "");
              setHasRemoteVideo(false);
              setRemoteUid((prev) => (prev === uidStr ? null : prev));
            }
          } catch {
          }
        });

        await client.join(appId, channel, token, uidNum || null);

        if (cancelled) return;
        if (rtcAbortJoinRef.current !== abortKey) return;

        rtcLog("join_ok", { channel, uid: uidNum, role });
        setRemoteCount(Number((client.remoteUsers ?? []).length));
        setLastRtcEvent(`joined:${channel}`);

        const canHost = isHostMode && role === "host";
        setIsHost(canHost);

        if (canHost) {
          await client.setClientRole("host");
          const tracks = (await AgoraRTC.createMicrophoneAndCameraTracks()) as any[];
          const mic = tracks?.[0];
          const cam = tracks?.[1];
          rtcLocalTracksRef.current = { mic, cam };
          cam?.play(videoRef.current!);
          await client.publish([mic, cam].filter(Boolean));
          void triggerOwnerLivePush();
          setBroadcasting(true);
        } else {
          await client.setClientRole("audience");

          rtcTokenRefreshRef.current = setInterval(async () => {
            try {
              if (cancelled) return;
              if (document.visibilityState !== "visible") return;
              if (!live.is_live) {
                hardLeaveRtcSession("stream_end");
                return;
              }
              if (idlePaused || !isLoggedIn) {
                hardLeaveRtcSession("gated");
                return;
              }

              const rr = await fetch("/api/agora/token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ role: "viewer", client: "web" }),
              });
              if (!rr.ok) {
                hardLeaveRtcSession(`token_refresh_fail:${rr.status}`);
                return;
              }
              const j = (await rr.json().catch(() => null)) as any;
              const nextToken = String(j?.token ?? "");
              if (!nextToken) {
                hardLeaveRtcSession("token_refresh_empty");
                return;
              }
              await client.renewToken(nextToken);
            } catch {
              hardLeaveRtcSession("token_refresh_exception");
            }
          }, 10 * 60 * 1000);
        }

        setAgoraReady(true);
        agoraCleanupRef.current = () => {
          void hardLeaveRtcSession("agoraCleanupRef");
        };
      } catch {
        await hardLeaveRtcSession("join_exception");
      } finally {
        rtcJoinInFlightRef.current = false;
      }
    })();

    const handleBeforeUnload = () => {
      void hardLeaveRtcSession("beforeunload");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      rtcAwaySinceRef.current = null;
      void hardLeaveRtcSession("effect_cleanup");
    };
  }, [hardLeaveRtcSession, idlePaused, isHostMode, isLoggedIn, kicked, live.is_live, rtcLog, streamEnded]);

  const title = "CannaStreams";

  const canChat = isLoggedIn;

  async function setLiveState(nextIsLive: boolean) {
    startHostTransition(async () => {
      try {
        const { data, error } = await sb.rpc("cfm_set_live", {
          next_is_live: nextIsLive,
          next_title: title,
        } as any);

        if (!error && data) {
          setLive((prev) => ({ ...(prev as any), ...(data as any) }));
          return;
        }
      } catch {
      }

      try {
        const now = new Date().toISOString();
        const patch: any = {
          is_live: nextIsLive,
          updated_at: now,
        };
        if (nextIsLive) {
          patch.started_at = live.started_at ?? now;
          patch.ended_at = null;
        } else {
          patch.ended_at = now;
        }

        const { error } = await sb.from("cfm_live_state").update(patch).eq("id", live.id);
        if (error) throw new Error(error.message);
        const { data: fresh } = await sb.rpc("cfm_get_live_state");
        const row = Array.isArray(fresh) ? (fresh[0] as any) : (fresh as any);
        if (row) setLive(row);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update live state.", "error");
      }
    });
  }

  async function send(type: "chat" | "emote" | "tip", message: string, metadata?: Record<string, any>) {
    const msg = String(message ?? "").trim();
    if (!msg) return;

    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) {
      toast("Live session not ready.", "error");
      return;
    }

    startTransition(async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      const authedUserId = String(user?.id ?? "").trim();
      if (!authedUserId) {
        toast("Log in to comment & react.", "error");
        return;
      }

      const payload = {
        live_id: liveId,
        sender_user_id: authedUserId,
        message: msg,
        type,
        metadata: metadata ?? {},
      } as any;

      const { data: inserted, error } = await sb.from("cfm_live_chat").insert(payload).select("*").maybeSingle();

      if (error) {
        const m = String((error as any)?.message ?? "");
        if (m.toLowerCase().includes("row-level security") || m.toLowerCase().includes("not authorized")) {
          toast("Only approved members can chat during live.", "error");
          return;
        }

        if (authedUserId) {
          try {
            const { data: isBanned } = await sb.rpc("cfm_is_banned", { p_user_id: authedUserId } as any);
            if (isBanned) {
              setBanned(true);
              setBanReason("You have been banned");
              void hardLeaveRtcSession("banned");
              toast("You have been banned", "error");
              return;
            }
          } catch {
          }
        }
        toast(m || error.message, "error");
        return;
      }

      if (inserted && inserted.id) {
        setRows((prev) => {
          if (prev.some((r) => r.id === inserted.id)) return prev;
          return [...prev, inserted as any].slice(-220);
        });
      }

      if (type === "chat") setText("");
    });
  }

  async function exitLive() {
    try {
      // If host is live, end the stream first
      if (isHost && live.is_live) {
        await sb.rpc("cfm_set_live", {
          next_is_live: false,
          next_title: null,
        });
      }
      
      const res = await fetch("/api/live/exit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey(live) }),
      });
      if (!res.ok) {
        toast("Could not exit live.", "error");
        return;
      }
      router.push(nextPath && nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      toast("Could not exit live.", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="mx-auto flex h-full w-full max-w-xl flex-col px-3 pb-3 pt-3">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl border border-white/10 bg-black">
            <div ref={videoRef} className="absolute inset-0" />

            {!isHostMode && !isLoggedIn ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
                <div className="w-full max-w-[320px] rounded-2xl border border-white/10 bg-black/60 p-5 text-center backdrop-blur">
                  <div className="text-base font-semibold text-white">Log in to watch</div>
                  <div className="mt-2 text-sm text-white/70">Viewing requires an account to prevent watch-time abuse.</div>
                  <Button type="button" className="mt-4 w-full" onClick={() => router.push("/login")}
                  >
                    Go to login
                  </Button>
                </div>
              </div>
            ) : null}

            {!isHostMode && isLoggedIn && kicked ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
                <div className="w-full max-w-[320px] rounded-2xl border border-white/10 bg-black/60 p-5 text-center backdrop-blur">
                  <div className="text-base font-semibold text-white">Removed by host</div>
                  <div className="mt-2 text-sm text-white/70">
                    {kickReason ? kickReason : "You were removed from this live."}
                  </div>
                  <div className="mt-4 text-xs font-semibold text-white/70">Sending you home…</div>
                </div>
              </div>
            ) : null}

            {!isHostMode && isLoggedIn && banned ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
                <div className="w-full max-w-[320px] rounded-2xl border border-white/10 bg-black/60 p-5 text-center backdrop-blur">
                  <div className="text-base font-semibold text-white">You have been banned</div>
                  <div className="mt-2 text-sm text-white/70">
                    {banReason ? banReason : "You are banned from this live."}
                  </div>
                  <Button type="button" className="mt-4 w-full" onClick={() => forceExitViewer("banned")}
                  >
                    Go Back
                  </Button>
                </div>
              </div>
            ) : null}

            {idlePaused && !isHostMode ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
                <div className="w-full max-w-[320px] rounded-2xl border border-white/10 bg-black/60 p-5 text-center backdrop-blur">
                  <div className="text-base font-semibold text-white">Paused to save watch time</div>
                  <div className="mt-2 text-sm text-white/70">No activity detected for 5 minutes.</div>
                  <Button type="button" className="mt-4 w-full" onClick={resumeWatching}>
                    Tap to continue watching
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {fallingEmotes.map((e) => (
                <div
                  key={e.id}
                  className="absolute top-0 text-2xl"
                  style={{ left: `${e.leftPct}%`, animation: "cfm-fall 6.5s linear forwards" }}
                >
                  {e.emoji}
                </div>
              ))}
            </div>

            <style jsx global>{`
              @keyframes cfm-fall {
                0% {
                  transform: translateY(-10%) scale(1);
                  opacity: 0;
                }
                8% {
                  opacity: 1;
                }
                100% {
                  transform: translateY(220%) scale(1.2);
                  opacity: 0;
                }
              }
              @keyframes vip-entrance {
                0% {
                  opacity: 0;
                  transform: scale(0.8) translateX(-10px);
                  filter: brightness(1.5);
                }
                30% {
                  opacity: 1;
                  transform: scale(1.1) translateX(0);
                  filter: brightness(1.8);
                }
                60% {
                  transform: scale(1) translateX(0);
                  filter: brightness(1.3);
                }
                100% {
                  transform: scale(1) translateX(0);
                  filter: brightness(1);
                }
              }
              .animate-vip-entrance {
                animation: vip-entrance 1.2s ease-out forwards;
              }
            `}</style>

            {!agoraReady ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Connecting...</div>
            ) : null}

            {/* Host broadcasting indicator */}
            {agoraReady && isHost && broadcasting ? (
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white animate-pulse">🔴 BROADCASTING</span>
              </div>
            ) : null}

            {/* Host waiting to broadcast */}
            {agoraReady && isHost && !broadcasting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70">
                <div>Starting broadcast...</div>
              </div>
            ) : null}

            {agoraReady && !isHost && !hasRemoteVideo ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70">
                <div>Waiting for host video...</div>
                <div className="text-[11px] text-white/50">
                  Remote users: {remoteCount}
                  {lastRtcEvent ? ` • ${lastRtcEvent}` : ""}
                </div>
                {localRtc ? (
                  <div className="text-[11px] text-white/50">
                    Local: {localRtc.uid || "(anon)"} • {localRtc.channel} • {localRtc.role} • {localRtc.appId.slice(0, 6)}…
                  </div>
                ) : null}
              </div>
            ) : null}

            {agoraReady && !isHost && hasRemoteVideo && remoteUid ? (
              <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-semibold text-white">
                Host: {remoteUid}
              </div>
            ) : null}

            {/* Gift Flash Animation */}
            {giftFlash ? (
              <div
                key={giftFlash.key}
                className="pointer-events-none absolute inset-x-0 top-1/3 z-50 flex items-center justify-center animate-gift-flash"
              >
                <div className="rounded-2xl bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 px-8 py-4 shadow-2xl">
                  <div
                    className="text-center text-3xl font-black text-white drop-shadow-lg"
                    style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive", textShadow: "2px 2px 4px rgba(0,0,0,0.5)" }}
                  >
                    {giftFlash.message}
                  </div>
                </div>
              </div>
            ) : null}
            <style>{`
              @keyframes gift-flash {
                0% { opacity: 0; transform: scale(0.5) translateY(20px); }
                15% { opacity: 1; transform: scale(1.1) translateY(0); }
                25% { transform: scale(1) translateY(0); }
                85% { opacity: 1; transform: scale(1) translateY(0); }
                100% { opacity: 0; transform: scale(0.9) translateY(-20px); }
              }
              .animate-gift-flash {
                animation: gift-flash 5s ease-out forwards;
              }
            `}</style>

            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
              <div className="flex items-center gap-2">
                {live.is_live ? (
                  <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">LIVE</span>
                ) : (
                  <span className="rounded-full bg-gray-600 px-2 py-1 text-[11px] font-semibold text-white">OFFLINE</span>
                )}
                <div className="text-sm font-semibold text-white">{title}</div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewerListOpen(true)}
                    className="flex items-center gap-1 rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[11px] font-semibold text-white"
                    title="Viewers"
                  >
                    <span>👁️ {viewers.filter((v) => v.isOnline).length}</span>
                    <span className="text-white/60">|</span>
                    <span>👥 {viewers.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={exitLive}
                    disabled={pending}
                    aria-label="Exit Live"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white"
                  >
                    <span className="text-xl leading-none">×</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {top3.map((g) => {
                    const streamRank = Number(g.rank ?? 0);
                    const allTimeRank = allTimeRankByUserId[String(g.profile_id ?? "").trim()] ?? 0;
                    const m = medal(streamRank);
                    const label = allTimeRank === 1 ? "🥇" : allTimeRank === 2 ? "🥈" : allTimeRank === 3 ? "🥉" : m.label;
                    const uid = String(g.profile_id ?? "").trim();
                    const name = String(g.display_name ?? "Member");
                    const vipTier = (uid ? (memberByUserId[uid] as any)?.vip_tier : null) as VipTier | null;
                    return (
                      <button
                        key={String(g.profile_id)}
                        type="button"
                        onClick={() => openProfile(String(g.profile_id))}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-left ${m.cls}`}
                      >
                        <span className="text-sm">{label}</span>
                        {renderAvatar(String(g.profile_id ?? ""), name, g.avatar_url, 24)}
                        <div className="min-w-0">
                          <div className="max-w-[140px] truncate text-[11px] font-semibold text-white">
                            <span className="inline-flex items-center gap-2">
                              <span className="truncate">{name}</span>
                              <VipBadge tier={vipTier} />
                            </span>
                          </div>
                          <div className="text-[11px] font-bold text-green-400">
                            {fmtCoins(Math.round(Number(g.total_amount ?? 0)))}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setTopTab("today");
                      setTopModalOpen(true);
                    }}
                    className="text-right text-lg"
                    title="Top Gifters"
                  >
                    🏆
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-10 p-2">
              <div className="flex h-[35%] max-h-[280px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur">
                <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
                  <div className="space-y-2">
                    {rows
                      .filter((r) => !r.is_deleted)
                      .slice(-80)
                      .map((r) => {
                        const t = r.type;
                        const msg = String(r.message ?? "");
                        const meta = r.metadata as any;
                        const senderId = String(r.sender_user_id ?? "").trim();
                        const senderName = String(nameByUserId[senderId] ?? "Member");
                        const badge = getBadge(senderId);
                        const isJoin = t === "system" && meta?.event === "join";
                        const isGift = t === "tip" || meta?.event === "gift";

                        const avatar = renderAvatar(senderId, senderName, null, 24);
                        
                        // Green for joins, highlight for gifts, default for others
                        // VIP special entrance: colored name + badge + sparkle
                        if (isJoin) {
                          const vipTier = (senderId ? (memberByUserId[senderId] as any)?.vip_tier : null) as VipTier | null;
                          const tierColor = vipTier ? VIP_TIER_COLORS[vipTier] : null;
                          const isVip = !!vipTier;
                          return (
                            <div
                              key={r.id}
                              className={`flex items-center gap-2 text-[15px] font-semibold ${isVip ? "animate-vip-entrance" : ""}`}
                              style={tierColor ? { color: tierColor } : { color: "#4ade80" }}
                            >
                              <div className="shrink-0">{avatar}</div>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 min-w-0 truncate hover:underline"
                                onClick={() => senderId && showMiniProfile(senderId)}
                              >
                                {badge ? <span className="mr-1">{badge}</span> : null}
                                <RoleBadge role={roleByUserId[senderId] ?? null} />
                                {isVip ? <span className="mr-0.5">✨</span> : null}
                                {msg}
                                <VipBadge tier={vipTier} />
                              </button>
                            </div>
                          );
                        }
                        
                        if (isGift) {
                          return (
                            <div key={r.id} className="flex items-center gap-2 text-[15px] text-[color:var(--accent)] font-semibold">
                              <div className="shrink-0">{avatar}</div>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 min-w-0 truncate hover:underline"
                                onClick={() => senderId && showMiniProfile(senderId)}
                              >
                                {badge ? <span className="mr-1">{badge}</span> : null}
                                <RoleBadge role={roleByUserId[senderId] ?? null} />
                                {msg}
                              </button>
                            </div>
                          );
                        }
                        
                        const cls = t === "system" ? "text-white/70" : "text-white";
                        return (
                          <div key={r.id} className={`flex items-start gap-2 text-[15px] font-medium ${cls}`}>
                            <div className="shrink-0">{avatar}</div>
                            <div className="min-w-0">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-white/70 font-semibold hover:underline"
                                onClick={() => senderId && showMiniProfile(senderId)}
                              >
                                {badge ? <span className="mr-1">{badge}</span> : null}
                                <RoleBadge role={roleByUserId[senderId] ?? null} />
                                {senderName}
                                <VipBadge tier={(senderId ? (memberByUserId[senderId] as any)?.vip_tier : null) ?? null} />:
                              </button>{" "}
                              {msg}
                            </div>
                          </div>
                        );
                      })}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                <div className="border-t border-white/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      {DEFAULT_EMOTES.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="px-1 py-1 text-[20px] font-semibold text-white"
                          onClick={() => {
                            if (!canChat) return;
                            lastLocalEmoteAtRef.current = Date.now();
                            spawnEmote(e);
                            send("emote", e);
                          }}
                          disabled={!canChat || pending}
                          aria-label={`Send ${e}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={giftPending || !giftSettings.enabled}
                        onClick={() => setGiftModalOpen(true)}
                      >
                        Gift
                      </Button>
                      <button
                        type="button"
                        onClick={shareLive}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white"
                        aria-label="Share"
                      >
                        <span className="text-[18px] leading-none">↗</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && canChat && text.trim()) {
                          e.preventDefault();
                          send("chat", text);
                        }
                      }}
                      placeholder={isLoggedIn ? "Message" : "Log in to comment & react"}
                      disabled={!canChat || pending}
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        if (!canChat) return;
                        send("chat", text);
                      }}
                      disabled={!canChat || pending}
                      className="px-4 py-2 text-xs"
                    >
                      Send
                    </Button>
                  </div>

                  {!isLoggedIn ? <div className="mt-2 text-xs text-white/60">Log in to comment & react.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {topModalOpen ? (
          <div className="fixed inset-0 z-[60] bg-[#0b0b0c]">
            <div className="mx-auto flex h-full w-full max-w-xl flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Top Gifters</div>
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
                  onClick={() => setTopModalOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    topTab === "today" ? "border-red-500 bg-red-600 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                  onClick={() => setTopTab("today")}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    topTab === "weekly" ? "border-red-500 bg-red-600 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                  onClick={() => setTopTab("weekly")}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    topTab === "all_time" ? "border-red-500 bg-red-600 text-white" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                  onClick={() => setTopTab("all_time")}
                >
                  All-Time
                </button>
              </div>

              <div className="flex-1 overflow-auto px-4 py-4">
                <div className="space-y-2">
                  {modalRows.map((g) => {
                    const uid = String(g.profile_id ?? "").trim();
                    if (!uid) return null;
                    const r = Number(g.rank ?? 0) || 0;
                    const name = String(g.display_name ?? "Member");
                    const amount = Number(g.total_amount ?? 0);
                    const vipTier = (memberByUserId[uid] as any)?.vip_tier ?? null;
                    const medalEmoji = r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : null;
                    const bgClass = r === 1 ? "bg-yellow-500/20 border-yellow-500/40" : r === 2 ? "bg-gray-400/20 border-gray-400/40" : r === 3 ? "bg-orange-500/20 border-orange-500/40" : "bg-white/5 border-white/10";
                    return (
                      <button
                        key={`${String(g.profile_id)}-${r}`}
                        type="button"
                        onClick={() => {
                          setTopModalOpen(false);
                          showMiniProfile(String(g.profile_id));
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:bg-white/10 ${bgClass}`}
                      >
                        <div className="w-10 shrink-0 text-center">
                          {medalEmoji ? (
                            <span className="text-2xl">{medalEmoji}</span>
                          ) : (
                            <span className="text-sm font-bold text-white/60">#{r}</span>
                          )}
                        </div>
                        {renderAvatar(uid, name, g.avatar_url, 40)}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-white">
                            <span className="inline-flex items-center gap-2">
                              <span className="truncate">{name}</span>
                              <VipBadge tier={vipTier} />
                            </span>
                          </div>
                          <div className="text-lg font-bold text-green-400">{fmtCoins(Math.round(amount))}</div>
                        </div>
                      </button>
                    );
                  })}

                  {!modalRows.length ? (
                    <div className="py-8 text-center">
                      <div className="text-4xl mb-2">💸</div>
                      <div className="text-sm text-white/50">No gifts yet for this period.</div>
                      <div className="text-xs text-white/30 mt-1">Be the first to gift!</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {viewerListOpen ? (
          <div className="fixed inset-0 z-[60] bg-[#0b0b0c]">
            <div className="mx-auto flex h-full w-full max-w-xl flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                <div className="text-lg font-semibold text-white">👥 Viewers</div>
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
                  onClick={() => setViewerListOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <div className="mb-4 flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-bold text-white">{viewers.filter((v) => v.isOnline).length}</div>
                    <div className="text-xs text-white/60">👁️ Watching Now</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-2xl font-bold text-white">{viewers.length}</div>
                    <div className="text-xs text-white/60">👥 Total Since Start</div>
                  </div>
                </div>

                {viewers.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-white mb-2">Viewers</div>
                    <div className="space-y-2 max-h-[300px] overflow-auto">
                      {sortedViewers.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => showMiniProfile(String(v.id))}
                          >
                            <div className="shrink-0">
                              {(() => {
                                const lifetimeCoins = parseLifetimeUsd(
                                  (memberByUserId[String(v.id)] as any)?.lifetime_gifted_total_usd,
                                );
                                return (
                                  <GifterRingAvatar
                                    size={32}
                                    imageUrl={memberByUserId[String(v.id)]?.photo_url ?? null}
                                    name={v.name}
                                    totalUsd={lifetimeCoins}
                                    showDiamondShimmer
                                  />
                                );
                              })()}
                            </div>
                            <div className="min-w-0 truncate text-sm text-white">{v.name}</div>
                          </button>
                          {isHost && myUserId && v.id !== myUserId ? (
                            <div className="ml-auto flex items-center gap-2">
                              {bannedUserIdMap[String(v.id)] ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white"
                                  onClick={() => unbanUser(v.id)}
                                >
                                  Unban
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-full bg-[#d11f2a] px-3 py-1 text-xs font-bold text-white"
                                  onClick={() => banUser(v.id)}
                                >
                                  Ban
                                </button>
                              )}
                              {v.isOnline ? (
                                <button
                                  type="button"
                                  className="rounded-full bg-[#d11f2a] px-3 py-1 text-xs font-bold text-white"
                                  onClick={() => kickViewer(v.id)}
                                >
                                  Kick
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="ml-auto" />
                          )}
                          {v.isOnline ? (
                            <span className="text-xs font-semibold text-green-400">IN LIVE</span>
                          ) : (
                            <span className="text-xs text-white/40"> </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-white/50 text-center">
                    No viewers yet
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

      {!isLoggedIn ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20">
          <div className="rounded-2xl border border-white/10 bg-black/70 px-5 py-4 text-center">
            <div className="text-sm font-semibold text-white">Log in to continue</div>
            <div className="mt-1 text-xs text-white/70">Watch-only preview. Chat and reactions are disabled.</div>
            <div className="mt-3 flex justify-center">
              <Button as="link" href={`/login?next=${encodeURIComponent("/live")}`}>Log in</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mini Profile Modal */}
      <MiniProfileModal
        open={miniProfileOpen}
        subject={miniProfileSubject}
        leaderboard={miniProfileLeaderboard}
        awards={miniProfileAwards}
        myUserId={myUserId}
        liveKick={{
          liveId: chatLiveId,
          canKick: !!isHost,
          onKick: async (uid: string) => {
            await kickViewer(uid);
          },
        }}
        liveBan={{
          canBan: !!isHost,
          isBanned: !!bannedUserIdMap[String(miniProfileSubject?.user_id ?? "").trim()],
          onBan: async (uid: string) => {
            await banUser(uid);
          },
          onUnban: async (uid: string) => {
            await unbanUser(uid);
          },
        }}
        onClose={() => {
          setMiniProfileOpen(false);
          setMiniProfileSubject(null);
        }}
      />

      {/* Gift Modal */}
      <GiftModal
        open={giftModalOpen}
        postId="Live"
        pending={giftPending}
        presets={giftPresets}
        allowCustom={giftSettings.allowCustom}
        minCents={giftSettings.minCents}
        maxCents={giftSettings.maxCents}
        notice={!isLoggedIn ? "Log in to gift coins during live." : null}
        onClose={() => setGiftModalOpen(false)}
        onStartCheckout={(coins) => {
          if (!isLoggedIn) {
            toast("Log in to gift coins.", "error");
            return;
          }
          startGiftTransition(async () => {
            try {
              const idempotencyKey = `live_gift_${myUserId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
              const liveId = String(chatLiveId ?? live.id ?? "").trim();
              const res = await fetch("/api/gifts/send", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  stream_id: liveId,
                  gift_type: "coins",
                  coins,
                  idempotency_key: idempotencyKey,
                }),
              });
              const json = (await res.json().catch(() => null)) as any;
              if (!res.ok) {
                const errMsg = String(json?.error ?? "Gift failed");
                if (errMsg.toLowerCase().includes("insufficient")) {
                  const go = window.confirm("You don't have enough coins. Would you like to buy more?");
                  if (go) window.location.href = "/wallet";
                  return;
                }
                throw new Error(errMsg);
              }
              toast(`Sent ${coins.toLocaleString()} coins!`, "success");
              setGiftModalOpen(false);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Gift failed", "error");
            }
          });
        }}
      />
    </div>
    </div>
  );
}
