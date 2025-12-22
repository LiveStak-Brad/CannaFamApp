"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { VipBadge, VIP_TIER_COLORS, type VipTier } from "@/components/ui/vip-badge";
import { parseLifetimeUsd } from "@/lib/utils";
import { MiniProfileModal } from "@/components/ui/mini-profile";

const DEFAULT_PROFILE_PHOTO_URL = "/no-profile-pic.png";

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
  live_id: string | null;
  sender_user_id: string | null;
  message: string | null;
  type: "chat" | "emote" | "system" | "tip";
  metadata: any;
  created_at: string;
};

type TopGifterRow = { 
  profile_id: string; 
  display_name: string; 
  avatar_url: string | null; 
  total_amount: number | null; 
  rank: number;
};

function fmtCoins(coins: number) {
  const v = Math.floor(Number(coins ?? 0));
  if (!Number.isFinite(v) || v <= 0) return "0 coins";
  return `${new Intl.NumberFormat("en-US").format(v)} coins`;
}

type ViewerRow = {
  user_id: string;
  display_name: string | null;
  is_online: boolean;
  joined_at: string;
  last_seen_at?: string;
};

export function HostLiveClient({
  initialLive,
  myUserId,
}: {
  initialLive: LiveState;
  myUserId: string;
}) {
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

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

  const [live, setLive] = useState<LiveState>(initialLive);
  const [broadcasting, setBroadcasting] = useState(false);
  const [agoraReady, setAgoraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [rtcViewerCount, setRtcViewerCount] = useState(0);

  const [miniProfileOpen, setMiniProfileOpen] = useState(false);
  const [miniProfileSubject, setMiniProfileSubject] = useState<any | null>(null);
  const [miniProfileLeaderboard, setMiniProfileLeaderboard] = useState<any[]>([]);
  const [miniProfileAwards, setMiniProfileAwards] = useState<any[]>([]);
  const [bannedUserIdMap, setBannedUserIdMap] = useState<Record<string, true>>({});

  // Top gifters state (Today, Weekly, All-Time like web view)
  const [topToday, setTopToday] = useState<TopGifterRow[]>([]);
  const [topWeekly, setTopWeekly] = useState<TopGifterRow[]>([]);
  const [topAllTime, setTopAllTime] = useState<TopGifterRow[]>([]);
  const [topLive, setTopLive] = useState<TopGifterRow[]>([]);
  const [topModalOpen, setTopModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"today" | "weekly" | "all_time">("today");

  const top3 = topLive.slice(0, 3);
  const modalRows = topTab === "today" ? topLive : topTab === "weekly" ? topWeekly : topAllTime;

  const showMiniProfile = useCallback(
    async (userId: string) => {
      const uid = String(userId ?? "").trim();
      if (!uid) return;

      try {
        const profileRes = await sb
          .from("cfm_public_member_ids")
          .select("user_id,favorited_username,photo_url,lifetime_gifted_total_usd,vip_tier")
          .eq("user_id", uid)
          .maybeSingle();

        const subject = {
          user_id: uid,
          favorited_username: String((profileRes.data as any)?.favorited_username ?? "Member"),
          photo_url: (profileRes.data as any)?.photo_url ?? null,
          lifetime_gifted_total_usd: parseLifetimeUsd((profileRes.data as any)?.lifetime_gifted_total_usd),
          vip_tier: ((profileRes.data as any)?.vip_tier ?? null) as VipTier | null,
        };
        setMiniProfileSubject(subject);
        setMiniProfileLeaderboard([]);
        setMiniProfileAwards([]);
        setMiniProfileOpen(true);
      } catch {
        setMiniProfileSubject({ user_id: uid, favorited_username: "Member" });
        setMiniProfileLeaderboard([]);
        setMiniProfileAwards([]);
        setMiniProfileOpen(true);
      }

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
    },
    [sb],
  );

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
      if (uid === myUserId) return;
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
    [myUserId, sb],
  );

  const unbanUser = useCallback(
    async (userId: string) => {
      const uid = String(userId ?? "").trim();
      if (!uid) return;
      if (uid === myUserId) return;
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
    [myUserId, sb],
  );

  const allTimeRankByUserId = useMemo(() => {
    const map: Record<string, number> = {};
    topAllTime.slice(0, 3).forEach((g, i) => {
      const uid = String(g.profile_id ?? "").trim();
      if (uid) map[uid] = i + 1;
    });
    return map;
  }, [topAllTime]);

  // Viewers state
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [viewerListOpen, setViewerListOpen] = useState(false);

  useEffect(() => {
    if (!viewerListOpen) return;
    void refreshBans(viewers.map((v) => String((v as any)?.user_id ?? "").trim()).filter(Boolean));
  }, [refreshBans, viewerListOpen, viewers]);

  // Gift flash animation state
  const [giftFlash, setGiftFlash] = useState<{ message: string; key: number } | null>(null);
  const giftFlashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Falling emotes state
  const [fallingEmotes, setFallingEmotes] = useState<{ id: string; emoji: string; leftPct: number }[]>([]);
  const seenEmoteIdsRef = useRef<Record<string, boolean>>({});

  const videoRef = useRef<HTMLDivElement | null>(null);
  const rtcClientRef = useRef<any>(null);
  const rtcLocalTracksRef = useRef<{ mic?: any; cam?: any } | null>(null);
  const rtcLeftRef = useRef(false);
  const autoStartedRef = useRef(false);

  const rtcDebugEnabled = process.env.NODE_ENV !== "production";
  const rtcLog = useCallback((...args: any[]) => {
    if (!rtcDebugEnabled) return;
    try { console.log("[RTC][host]", ...args); } catch {}
  }, [rtcDebugEnabled]);

  // Chat state (read-only display)
  const [chatRows, setChatRows] = useState<LiveChatRow[]>([]);
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [memberByUserId, setMemberByUserId] = useState<
    Record<
      string,
      {
        photo_url: string | null;
        lifetime_gifted_total_usd: number | null;
        favorited_username: string | null;
        vip_tier?: VipTier | null;
      }
    >
  >({});

  const liveId = live?.id ?? "";

  const liveSessionKey = useMemo(() => {
    return (
      String((live as any)?.started_at ?? "").trim() ||
      String((live as any)?.updated_at ?? "").trim() ||
      String((live as any)?.id ?? "").trim() ||
      "live"
    );
  }, [live]);

  const renderAvatar = (userId: string, name: string, url: string | null, size = 28) => {
    const uid = String(userId ?? "").trim();
    const cached = uid ? memberByUserId[uid] ?? null : null;
    const totalUsd = parseLifetimeUsd((cached as any)?.lifetime_gifted_total_usd);

    const resolvedUrl =
      url ??
      cached?.photo_url ??
      (DEFAULT_PROFILE_PHOTO_URL ? DEFAULT_PROFILE_PHOTO_URL : null);

    return (
      <GifterRingAvatar
        size={size}
        imageUrl={resolvedUrl}
        name={name}
        totalUsd={totalUsd}
        showDiamondShimmer
      />
    );
  };

  const sortedViewers = useMemo(() => {
    const next = [...viewers];
    next.sort((a, b) => {
      const ao = !!a.is_online;
      const bo = !!b.is_online;
      if (ao !== bo) return ao ? -1 : 1;
      const at = new Date(String(a.joined_at ?? 0)).getTime();
      const bt = new Date(String(b.joined_at ?? 0)).getTime();
      return bt - at;
    });
    return next;
  }, [viewers]);

  // Load top gifters (Today, Weekly, All-Time)
  const loadTopGifters = useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        sb.rpc("cfm_top_gifters", { period: "today" }),
        sb.rpc("cfm_top_gifters", { period: "weekly" }),
        sb.rpc("cfm_top_gifters", { period: "all_time" }),
      ]);
      console.log("[HostLive loadTopGifters] today:", r1.data, r1.error);
      console.log("[HostLive loadTopGifters] weekly:", r2.data, r2.error);
      console.log("[HostLive loadTopGifters] all_time:", r3.data, r3.error);
      setTopToday(((r1.data ?? []) as any[]) as TopGifterRow[]);
      setTopWeekly(((r2.data ?? []) as any[]) as TopGifterRow[]);
      setTopAllTime(((r3.data ?? []) as any[]) as TopGifterRow[]);
    } catch (e) {
      console.error("[HostLive loadTopGifters] error:", e);
    }
  }, [sb]);

  const loadTopLiveGifters = useCallback(async () => {
    if (!liveId) return;
    try {
      const r1 = await sb.rpc("cfm_live_top_gifters", { p_live_id: liveId });
      setTopLive(((r1.data ?? []) as any[]) as TopGifterRow[]);
    } catch {
      setTopLive([]);
    }
  }, [liveId, sb]);

  // Load viewers using RPC function
  const loadViewers = useCallback(async () => {
    if (!liveId) return;
    try {
      const { data, error } = await sb.rpc("cfm_get_live_viewers", { p_live_id: liveId });
      console.log("[HostLive loadViewers]", data, error);
      if (data) {
        const rows = (data as any[]).map((v: any) => ({
          user_id: v.user_id,
          display_name: v.display_name,
          is_online: v.is_online,
          joined_at: v.joined_at,
          last_seen_at: v.last_seen_at,
        }));
        setViewers(rows as ViewerRow[]);
        setTotalViews(rows.length);
        setViewerCount(rows.filter((v) => v.is_online).length);
      }
    } catch (e) {
      console.error("[HostLive loadViewers] error:", e);
    }
  }, [sb, liveId]);

  // Track previous online state to detect leaves
  const prevOnlineRef = useRef<Record<string, boolean>>({});

  // Viewer history: always fetch immediately + repoll + realtime subscription (never gate on auth/is_live)
  useEffect(() => {
    if (!liveId) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await loadViewers();
    };

    void tick();
    const poll = setInterval(tick, 10000);

    const viewerChannel = sb
      .channel(`live-viewers-host-${liveId}-${liveSessionKey}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "cfm_live_viewers", filter: `live_id=eq.${liveId}` },
        (payload: any) => {
          // Detect leave events: UPDATE where is_online goes from true to false
          if (payload?.eventType === "UPDATE" && payload?.new && payload?.old) {
            const wasOnline = payload.old.is_online === true;
            const nowOffline = payload.new.is_online === false;
            if (wasOnline && nowOffline) {
              const uid = String(payload.new.user_id ?? "").trim();
              const displayName = nameByUserId[uid] || memberByUserId[uid]?.favorited_username || "Someone";
              // Add a synthetic leave message to chat
              setChatRows((prev) => [
                ...prev,
                {
                  id: `leave-${uid}-${Date.now()}`,
                  live_id: liveId,
                  sender_user_id: uid,
                  message: `${displayName} has left`,
                  type: "system",
                  metadata: { event: "leave" },
                  created_at: new Date().toISOString(),
                },
              ]);
            }
          }
          void tick();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(poll);
      sb.removeChannel(viewerChannel);
    };
  }, [liveId, liveSessionKey, loadViewers, memberByUserId, nameByUserId, sb]);

  useEffect(() => {
    setChatRows([]);
    setNameByUserId({});
    setMemberByUserId({});
    setViewers([]);
    setViewerCount(0);
    setTotalViews(0);
    setTopLive([]);
    setTopModalOpen(false);
    setViewerListOpen(false);

    if (giftFlashTimeoutRef.current) {
      clearTimeout(giftFlashTimeoutRef.current);
      giftFlashTimeoutRef.current = null;
    }
    setGiftFlash(null);
  }, [liveSessionKey]);

  // Load data on mount and periodically
  useEffect(() => {
    loadTopGifters();
    loadTopLiveGifters();
    const t1 = setInterval(loadTopGifters, 30000);
    const t1b = setInterval(loadTopLiveGifters, 15000);
    return () => {
      clearInterval(t1);
      clearInterval(t1b);
    };
  }, [liveSessionKey, loadTopGifters, loadTopLiveGifters, loadViewers]);

  // Auto-start live on mount
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    startBroadcast();
  }, []);

  // Set live state in database
  async function setLiveState(nextIsLive: boolean) {
    try {
      const { data, error } = await sb.rpc("cfm_set_live", {
        next_is_live: nextIsLive,
        next_title: live.title || "CannaFam Live",
      } as any);
      if (!error && data) {
        setLive((prev) => ({ ...prev, ...(data as any) }));
      }
    } catch (e) {
      console.error("Failed to set live state:", e);
    }
  }

  const hardLeaveRtcSession = useCallback(async (reason: string) => {
    if (rtcLeftRef.current) return;
    rtcLeftRef.current = true;
    rtcLog("leave", { reason, at: new Date().toISOString() });

    const client = rtcClientRef.current;
    const tracks = rtcLocalTracksRef.current;

    try {
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

      setBroadcasting(false);
      setAgoraReady(false);

      try { await setLiveState(false); } catch {}
    }
  }, [rtcLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void hardLeaveRtcSession("unmount");
    };
  }, [hardLeaveRtcSession]);

  // Start broadcasting
  async function startBroadcast() {
    if (!videoRef.current) return;

    try {
      // Set live state first
      await setLiveState(true);

      // Get host token
      const res = await fetch("/api/agora/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "host", client: "web" }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        setError(`Failed to get host token: ${errText}`);
        try { await setLiveState(false); } catch {}
        return;
      }

      const json = await res.json();
      console.log("[HostLiveClient] Token response:", json);

      if (json.role !== "host") {
        setError("Not authorized as host");
        try { await setLiveState(false); } catch {}
        return;
      }

      const { token, uid, appId, channel } = json;

      // Load Agora SDK
      const rtcMod: any = await import("agora-rtc-sdk-ng");
      const AgoraRTC = rtcMod?.default ?? rtcMod;

      const client = AgoraRTC.createClient({ mode: "live", codec: "h264" });
      rtcClientRef.current = client;
      rtcLeftRef.current = false;

      client.on("connection-state-change", (cur: any, prev: any, reason: any) => {
        rtcLog("conn", { prev, cur, reason });
      });

      // Join channel
      await client.join(appId, channel, token, uid);
      await client.setClientRole("host");

      // Create and publish tracks
      const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
      const [mic, cam] = tracks;
      rtcLocalTracksRef.current = { mic, cam };

      // Play local video
      cam?.play(videoRef.current!);

      // Publish tracks
      await client.publish([mic, cam].filter(Boolean));

      void triggerOwnerLivePush();

      setBroadcasting(true);
      setAgoraReady(true);

      // Track RTC remote users separately (do not overwrite DB-backed viewerCount)
      client.on("user-joined", () => {
        setRtcViewerCount(client.remoteUsers?.length ?? 0);
      });
      client.on("user-left", () => {
        setRtcViewerCount(client.remoteUsers?.length ?? 0);
      });

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await hardLeaveRtcSession("start_error");
    }
  }

  // Stop broadcasting and exit
  async function stopBroadcast() {
    await hardLeaveRtcSession("stop_button");
    router.push("/");
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      void hardLeaveRtcSession("beforeunload");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void hardLeaveRtcSession("visibility_hidden");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hardLeaveRtcSession]);

  // Load chat messages
  useEffect(() => {
    if (!liveId) return;

    (async () => {
      const { data } = await sb
        .from("cfm_live_chat")
        .select("id,live_id,sender_user_id,message,type,metadata,created_at")
        .eq("live_id", liveId)
        .order("created_at", { ascending: false })
        .limit(80);
      setChatRows(((data ?? []) as any[]).reverse());
    })();

    const channel = sb
      .channel(`host-live-chat-${liveId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cfm_live_chat", filter: `live_id=eq.${liveId}` },
        (payload: any) => {
          const row = payload.new;
          setChatRows((prev) => [...prev, row].slice(-200));
          
          // Trigger gift flash animation for gifts
          const isGift = row.type === "tip" || (row.type === "system" && row.metadata?.event === "gift");
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

          // Spawn falling emote for emote messages
          if (row.type === "emote") {
            const rid = String(row.id ?? "");
            if (rid && !seenEmoteIdsRef.current[rid]) {
              seenEmoteIdsRef.current[rid] = true;
              const emoji = String(row.message ?? "");
              if (emoji) {
                const id = `${Date.now()}-${Math.random()}`;
                const leftPct = 8 + Math.random() * 84;
                setFallingEmotes((prev) => [...prev, { id, emoji, leftPct }].slice(-30));
                setTimeout(() => {
                  setFallingEmotes((prev) => prev.filter((e) => e.id !== id));
                }, 6500);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [liveId, liveSessionKey, loadTopLiveGifters, sb]);

  // Load usernames for chat
  useEffect(() => {
    const unknownIds = [...new Set(chatRows.map(r => r.sender_user_id).filter(Boolean).filter(id => !nameByUserId[id!]))];
    if (unknownIds.length === 0) return;

    (async () => {
      const { data } = await sb
        .from("cfm_public_member_ids")
        .select("user_id,favorited_username,photo_url,lifetime_gifted_total_usd,vip_tier")
        .in("user_id", unknownIds);
      if (data) {
        const map: Record<string, string> = {};
        const memberPatch: Record<
          string,
          { photo_url: string | null; lifetime_gifted_total_usd: number | null; favorited_username: string | null; vip_tier?: VipTier | null }
        > = {};
        data.forEach((r: any) => {
          const uid = String(r?.user_id ?? "").trim();
          const uname = String(r?.favorited_username ?? "").trim();
          if (uid && uname) map[uid] = uname;
          if (uid) {
            memberPatch[uid] = {
              photo_url: (r?.photo_url ?? null) as string | null,
              lifetime_gifted_total_usd: parseLifetimeUsd((r as any)?.lifetime_gifted_total_usd),
              favorited_username: uname || null,
              vip_tier: (r as any)?.vip_tier ?? null,
            };
          }
        });
        setNameByUserId(prev => ({ ...prev, ...map }));
        if (Object.keys(memberPatch).length) {
          setMemberByUserId((prev) => ({ ...prev, ...memberPatch }));
        }
      }
    })();
  }, [chatRows, sb]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = Array.from(
          new Set(
            [...topLive, ...topWeekly, ...topAllTime]
              .map((g) => String((g as any)?.profile_id ?? "").trim())
              .filter(Boolean)
              .concat(viewers.map((v) => String((v as any)?.user_id ?? "").trim()).filter(Boolean))
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
  }, [memberByUserId, sb, topAllTime, topLive, topWeekly, viewers]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatRows.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Phone-sized container with video filling it and chat overlaying */}
      <div className="relative h-full w-full max-w-[420px] max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-black">
        {/* Video fills entire container */}
        <div ref={videoRef} className="absolute inset-0" />

        {/* Falling emotes overlay */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
          {fallingEmotes.map((e) => (
            <div
              key={e.id}
              className="absolute top-0 text-2xl"
              style={{ left: `${e.leftPct}%`, animation: "cfm-host-fall 6.5s linear forwards" }}
            >
              {e.emoji}
            </div>
          ))}
        </div>
        <style>{`
          @keyframes cfm-host-fall {
            0% { transform: translateY(-10%) scale(1); opacity: 0; }
            8% { opacity: 1; }
            100% { transform: translateY(220%) scale(1.2); opacity: 0; }
          }
        `}</style>

        {/* Top overlay */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
          <div className="flex items-center gap-2">
            {broadcasting ? (
              <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white animate-pulse">🔴 LIVE</span>
            ) : (
              <span className="rounded-full bg-gray-600 px-2 py-1 text-[11px] font-semibold text-white">PREVIEW</span>
            )}
            <span className="text-sm font-semibold text-white">CannaStreams</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Viewer count - clickable to open modal */}
            <button
              onClick={() => setViewerListOpen(true)}
              className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              👁️ {viewerCount} | 👥 {totalViews}
            </button>
            {/* Close button */}
            <button
              type="button"
              onClick={stopBroadcast}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-red-600"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Top 3 Gifters - positioned on right side below close button (like mobile) */}
        <div className="absolute right-3 top-16 z-20 flex flex-col gap-1.5">
          {top3.map((g) => {
            const rank = Number(g.rank ?? 0);
            const allTimeRank = allTimeRankByUserId[String(g.profile_id ?? "").trim()] ?? 0;
            const medalEmoji = allTimeRank === 1 ? "🥇" : allTimeRank === 2 ? "🥈" : allTimeRank === 3 ? "🥉" : (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "");
            const bgColor = rank === 1 ? "rgba(234,179,8,0.35)" : rank === 2 ? "rgba(156,163,175,0.35)" : "rgba(249,115,22,0.35)";
            const borderColor = rank === 1 ? "rgba(234,179,8,0.6)" : rank === 2 ? "rgba(156,163,175,0.6)" : "rgba(249,115,22,0.6)";
            const amount = Number(g.total_amount ?? 0);
            const name = String(g.display_name ?? "Member");
            const uid = String(g.profile_id ?? "").trim();
            const vipTier = (uid ? (memberByUserId[uid] as any)?.vip_tier : null) as VipTier | null;
            return (
              <div
                key={`${g.profile_id}-${rank}`}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 backdrop-blur-sm"
                style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
              >
                <span className="text-sm">{medalEmoji}</span>
                {renderAvatar(String(g.profile_id ?? ""), name, g.avatar_url, 24)}
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-white truncate max-w-[110px]">
                    <span className="inline-flex items-center gap-2">
                      <span className="truncate">{name}</span>
                      <VipBadge tier={vipTier} />
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-green-400">{fmtCoins(Math.round(amount * 100))}</span>
                </div>
              </div>
            );
          })}

          {/* Trophy button to open leaderboard */}
          <button
            type="button"
            onClick={() => {
              setTopTab("today");
              setTopModalOpen(true);
            }}
            className="flex h-10 w-10 items-center justify-center self-end rounded-full border border-yellow-500/40 bg-yellow-500/20 text-lg backdrop-blur-sm hover:bg-yellow-500/30"
            title="Top Gifters"
          >
            🏆
          </button>
        </div>

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
          @keyframes vip-entrance {
            0% { opacity: 0; transform: scale(0.8) translateX(-10px); filter: brightness(1.5); }
            30% { opacity: 1; transform: scale(1.1) translateX(0); filter: brightness(1.8); }
            60% { transform: scale(1) translateX(0); filter: brightness(1.3); }
            100% { transform: scale(1) translateX(0); filter: brightness(1); }
          }
          .animate-vip-entrance {
            animation: vip-entrance 1.2s ease-out forwards;
          }
          @keyframes fade-out {
            0% { opacity: 1; }
            70% { opacity: 0.7; }
            100% { opacity: 0.5; }
          }
          .animate-fade-out {
            animation: fade-out 2s ease-out forwards;
          }
        `}</style>

        {/* Status messages */}
        {!agoraReady && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Starting broadcast...
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-red-400">
            <div>Error: {error}</div>
            <button
              onClick={() => { setError(null); startBroadcast(); }}
              className="rounded-full bg-white/10 px-4 py-2 text-white hover:bg-white/20"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Chat Display (read-only) - overlaying bottom of video like mobile */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col p-3">
          {/* Chat messages - with slight black background for readability */}
          <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-2xl bg-black/35 backdrop-blur-sm p-3">
            {chatRows.slice(-30).map((row) => {
              const kind = row.type;
              const msg = String(row.message ?? "");
              const meta = row.metadata as any;
              const senderId = String(row.sender_user_id ?? "").trim();
              const senderName = String(nameByUserId[senderId] ?? "Member");
              const isGift = kind === "tip" || (kind === "system" && meta?.event === "gift");
              const isJoin = kind === "system" && meta?.event === "join";
              const avatar = renderAvatar(senderId, senderName, null, 24);
              
              // Green for joins (like mobile) - VIP special entrance
              if (isJoin) {
                const vipTier = (senderId ? (memberByUserId[senderId] as any)?.vip_tier : null) as VipTier | null;
                const tierColor = vipTier ? VIP_TIER_COLORS[vipTier] : null;
                const isVip = !!vipTier;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`flex w-full items-center gap-2 text-left text-[15px] font-semibold ${isVip ? "animate-vip-entrance" : ""}`}
                    style={tierColor ? { color: tierColor } : { color: "#4ade80" }}
                    onClick={() => {
                      if (senderId) showMiniProfile(senderId);
                    }}
                  >
                    <div className="shrink-0">{avatar}</div>
                    <div className="inline-flex items-center gap-1 min-w-0 truncate">
                      {isVip ? <span className="mr-0.5">✨</span> : null}
                      {msg}
                      <VipBadge tier={vipTier} />
                    </div>
                  </button>
                );
              }
              
              // Red name for leaves (host-only)
              const isLeave = kind === "system" && meta?.event === "leave";
              if (isLeave) {
                const vipTier = (senderId ? (memberByUserId[senderId] as any)?.vip_tier : null) as VipTier | null;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center gap-2 text-left text-[15px] font-medium animate-fade-out"
                    onClick={() => {
                      if (senderId) showMiniProfile(senderId);
                    }}
                  >
                    <div className="shrink-0">{avatar}</div>
                    <div className="inline-flex items-center gap-1 min-w-0 truncate">
                      <span className="text-red-400 font-semibold">{senderName}</span>
                      <VipBadge tier={vipTier} />
                      <span className="text-white/60">has left</span>
                    </div>
                  </button>
                );
              }
              
              // Red for gifts (like mobile)
              if (isGift) {
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center gap-2 text-left text-[15px] text-red-400 font-semibold"
                    onClick={() => {
                      if (senderId) showMiniProfile(senderId);
                    }}
                  >
                    <div className="shrink-0">{avatar}</div>
                    <div className="min-w-0 truncate">{msg}</div>
                  </button>
                );
              }
              
              // Regular chat
              return (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-start gap-2 text-left text-[15px] font-medium text-white"
                  onClick={() => {
                    if (senderId) showMiniProfile(senderId);
                  }}
                >
                  <div className="shrink-0">{avatar}</div>
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-white/70 font-semibold">
                      {senderName}
                      <VipBadge tier={(senderId ? (memberByUserId[senderId] as any)?.vip_tier : null) ?? null} />:
                    </span>{" "}
                    {msg}
                  </div>
                </button>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Controls - Flip Camera & Filters (greyed out) */}
          <div className="mt-3 flex justify-center gap-4">
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl opacity-50 cursor-not-allowed"
              title="Available on mobile"
              disabled
            >
              🔄
            </button>
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl opacity-50 cursor-not-allowed"
              title="Available on mobile"
              disabled
            >
              🪄
            </button>
          </div>
        </div>
      </div>

      {/* Viewer List Modal - same as web view screen */}
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
                  <div className="text-2xl font-bold text-white">{viewerCount}</div>
                  <div className="text-xs text-white/60">👁️ Watching Now</div>
                </div>
                <div className="flex-1 text-center">
                  <div className="text-2xl font-bold text-white">{totalViews}</div>
                  <div className="text-xs text-white/60">👥 Total Since Start</div>
                </div>
              </div>

              {viewers.length > 0 ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-white mb-2">Viewers</div>
                  <div className="space-y-2 max-h-[300px] overflow-auto">
                    {sortedViewers.map((v) => {
                      const uid = String((v as any)?.user_id ?? "").trim();
                      const name = String((v as any)?.display_name ?? "Member");
                      const isOnline = !!(v as any)?.is_online;
                      const isBanned = !!bannedUserIdMap[uid];
                      return (
                        <div key={uid} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => uid && showMiniProfile(uid)}
                          >
                            {renderAvatar(uid, name, null, 32)}
                            <div className="min-w-0 truncate text-sm text-white">{name}</div>
                          </button>
                          {uid && uid !== myUserId ? (
                            <div className="ml-auto flex items-center gap-2">
                              {isBanned ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white"
                                  onClick={() => unbanUser(uid)}
                                >
                                  Unban
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-full bg-[#d11f2a] px-3 py-1 text-xs font-bold text-white"
                                  onClick={() => banUser(uid)}
                                >
                                  Ban
                                </button>
                              )}
                            </div>
                          ) : null}
                          {isOnline ? (
                            <span className="text-xs font-semibold text-green-400">IN LIVE</span>
                          ) : (
                            <span className="text-xs text-white/40"> </span>
                          )}
                        </div>
                      );
                    })}
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

      {/* Mini Profile Modal */}
      <MiniProfileModal
        open={miniProfileOpen}
        subject={miniProfileSubject}
        leaderboard={miniProfileLeaderboard}
        awards={miniProfileAwards}
        myUserId={myUserId}
        liveKick={undefined}
        liveBan={{
          canBan: true,
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

      {/* Leaderboard Modal - same as web view screen with Daily/Weekly/All-Time tabs */}
      {topModalOpen ? (
        <div className="fixed inset-0 z-[60] bg-[#0b0b0c]">
          <div className="mx-auto flex h-full w-full max-w-xl flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div className="text-lg font-bold text-white">💰 Top Gifters</div>
              <button
                type="button"
                className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
                onClick={() => setTopModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="flex gap-2 px-4 pt-4">
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
                  const r = Number(g.rank ?? 0);
                  const name = String(g.display_name ?? "Member");
                  const amount = Number(g.total_amount ?? 0);
                  const uid = String(g.profile_id ?? "").trim();
                  const vipTier = (uid ? (memberByUserId[uid] as any)?.vip_tier : null) as VipTier | null;
                  const medalEmoji = r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : null;
                  const bgClass = r === 1 ? "bg-yellow-500/20 border-yellow-500/40" : r === 2 ? "bg-gray-400/20 border-gray-400/40" : r === 3 ? "bg-orange-500/20 border-orange-500/40" : "bg-white/5 border-white/10";
                  return (
                    <div
                      key={`${String(g.profile_id)}-${r}`}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:bg-white/10 ${bgClass}`}
                    >
                      <div className="w-10 shrink-0 text-center">
                        {medalEmoji ? (
                          <span className="text-2xl">{medalEmoji}</span>
                        ) : (
                          <span className="text-sm font-bold text-white/60">#{r}</span>
                        )}
                      </div>
                      {renderAvatar(String(g.profile_id ?? ""), name, g.avatar_url, 40)}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">
                          <span className="inline-flex items-center gap-2">
                            <span className="truncate">{name}</span>
                            <VipBadge tier={vipTier} />
                          </span>
                        </div>
                        <div className="text-lg font-bold text-green-400">{fmtCoins(Math.round(amount * 100))}</div>
                      </div>
                    </div>
                  );
                })}

                {modalRows.length === 0 ? (
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
    </div>
  );
}
