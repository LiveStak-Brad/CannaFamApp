"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { GiftModal } from "@/app/feed/ui";
import { createSiteGiftCheckoutSession } from "@/app/feed/actions";
import { MiniProfileModal, type MiniProfileSubject, type MiniProfilePointsRow, type MiniProfileAwardRow } from "@/components/ui/mini-profile";

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
  live_id: string | null;
  sender_user_id: string | null;
  message: string | null;
  type: "chat" | "emote" | "system" | "tip";
  metadata: any;
  is_deleted: boolean;
  deleted_by: string | null;
  deleted_at: string | null;
  created_at: string;
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

  const [hostPending, startHostTransition] = useTransition();
  const [isHost, setIsHost] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const [topToday, setTopToday] = useState<TopGifterRow[]>([]);
  const [topWeekly, setTopWeekly] = useState<TopGifterRow[]>([]);
  const [topAllTime, setTopAllTime] = useState<TopGifterRow[]>([]);
  const [topModalOpen, setTopModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"today" | "weekly" | "all_time">("today");

  // Gift modal state
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftPending, startGiftTransition] = useTransition();
  const [giftPresets, setGiftPresets] = useState<number[]>([100, 300, 500, 1000, 2000]);
  const [giftSettings, setGiftSettings] = useState<{ allowCustom: boolean; minCents: number; maxCents: number; enabled: boolean }>({
    allowCustom: true,
    minCents: 100,
    maxCents: 20000,
    enabled: true,
  });

  const [agoraReady, setAgoraReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [viewerListOpen, setViewerListOpen] = useState(false);
  const [lastRtcEvent, setLastRtcEvent] = useState<string | null>(null);

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
        console.log("[LiveClient] Viewer idle timeout - disconnecting Agora to stop billing");
        try {
          if (agoraCleanupRef.current) {
            agoraCleanupRef.current();
            agoraCleanupRef.current = null;
          }
        } catch {
        }
        setAgoraReady(false);
        setHasRemoteVideo(false);
        setRemoteUid(null);
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
  }, [idlePaused, isHostMode, live.is_live]);

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
          .select("user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
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

      const profile = (profileRes.data as any) ?? null;
      const lbRows = ((lbRes.data ?? []) as MiniProfilePointsRow[]);
      const awards = ((awardsRes.data ?? []) as MiniProfileAwardRow[]);

      if (profile) {
        setMiniProfileSubject({
          user_id: profile.user_id,
          favorited_username: profile.favorited_username ?? "Member",
          photo_url: profile.photo_url,
          bio: profile.bio,
          public_link: profile.public_link,
          instagram_link: profile.instagram_link,
          x_link: profile.x_link,
          tiktok_link: profile.tiktok_link,
          youtube_link: profile.youtube_link,
        });
      } else {
        setMiniProfileSubject({
          user_id: uid,
          favorited_username: nameByUserId[uid] || "Member",
        });
      }

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
  }

  // Database-backed viewer tracking
  type ViewerInfo = { id: string; name: string; joinedAt: number; isOnline: boolean };
  const [viewers, setViewers] = useState<ViewerInfo[]>([]);
  const viewerHeartbeatRef = useRef<NodeJS.Timeout | null>(null);
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

  const medal = (r: number) => {
    if (r === 1) return { label: "🥇", cls: "border-yellow-400/40 bg-yellow-400/15" };
    if (r === 2) return { label: "🥈", cls: "border-gray-300/40 bg-gray-300/15" };
    if (r === 3) return { label: "🥉", cls: "border-orange-400/40 bg-orange-400/15" };
    return { label: `#${r}`, cls: "border-white/10 bg-white/5" };
  };

  const fmtAmount = (n: number | null) => {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v) || v <= 0) return "$0";
    return `$${v.toFixed(v < 10 ? 2 : 0)}`;
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

  const renderAvatar = (name: string, url: string | null, size = 28) => {
    const initial = String(name ?? "?").trim().slice(0, 1).toUpperCase();
    if (url) {
      return (
        <img
          src={url}
          alt={name}
          className="rounded-full object-cover object-top"
          style={{ width: size, height: size }}
          referrerPolicy="no-referrer"
        />
      );
    }
    return (
      <div
        className="flex items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white"
        style={{ width: size, height: size }}
      >
        {initial}
      </div>
    );
  };

  const top3 = topToday.slice(0, 3);
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

  const chatLiveId = useMemo(() => {
    const v = String((live as any)?.id ?? "").trim();
    if (v) return v;
    const fallback = String((initialLive as any)?.id ?? "").trim();
    return fallback;
  }, [initialLive, live]);

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

  useEffect(() => {
    if (isHostMode) return;
    if (!isLoggedIn || !myUserId) {
      setKicked(false);
      setKickReason(null);
      return;
    }

    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;

    let cancelled = false;

    const disconnect = () => {
      try {
        if (agoraCleanupRef.current) {
          agoraCleanupRef.current();
          agoraCleanupRef.current = null;
        }
      } catch {
      }
      setAgoraReady(false);
      setHasRemoteVideo(false);
      setRemoteUid(null);
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
  }, [isHostMode]);

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
              const isGift = row.type === "tip" || (row.type === "system" && row.metadata?.event === "gift");
              if (isGift) {
                const msg = String(row.message ?? "");
                if (giftFlashTimeoutRef.current) {
                  clearTimeout(giftFlashTimeoutRef.current);
                }
                setGiftFlash({ message: msg, key: Date.now() });
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
  }, [loadTopGifters, sb, chatLiveId]);

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
            // Auto-disconnect Agora when stream ends (is_live becomes false)
            if (row.is_live === false && agoraCleanupRef.current) {
              console.log("[LiveClient] Stream ended - auto-disconnecting Agora to stop billing");
              agoraCleanupRef.current();
              agoraCleanupRef.current = null;
              setAgoraReady(false);
              setHasRemoteVideo(false);
              setRemoteUid(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(liveStateChannel);
    };
  }, [sb, chatLiveId]);

  // Database-backed viewer tracking
  useEffect(() => {
    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) return;
    if (!live.is_live) return;
    if (idlePaused) return;
    if (!isLoggedIn && !isHostMode) return;
    if (!isHostMode && kicked) return;

    // Load viewers (works for all users)
    const loadViewers = async () => {
      try {
        const { data, error } = await sb.rpc("cfm_get_live_viewers", { p_live_id: liveId });
        console.log("[loadViewers] data:", data, "error:", error);
        if (data && Array.isArray(data)) {
          setViewers(
            data.map((v: any) => ({
              id: String(v.user_id),
              name: String(v.display_name ?? "Viewer"),
              joinedAt: new Date(v.joined_at).getTime(),
              isOnline: Boolean(v.is_online),
            }))
          );
        }
      } catch (e) {
        console.error("[loadViewers] error:", e);
      }
    };

    // Join as viewer (only if logged in)
    if (myUserId) {
      (async () => {
        try { 
          await sb.rpc("cfm_join_live_viewer", { p_live_id: liveId }); 
          // Reload viewers after joining
          setTimeout(loadViewers, 500);
        } catch {}
      })();
    }

    loadViewers();
    // Quick poll to catch new viewers faster
    const quickPoll = setTimeout(loadViewers, 2000);
    const quickPoll2 = setTimeout(loadViewers, 5000);

    // Heartbeat every 30 seconds (only if logged in)
    if (myUserId) {
      viewerHeartbeatRef.current = setInterval(async () => {
        try { await sb.rpc("cfm_viewer_heartbeat", { p_live_id: liveId }); } catch {}
        loadViewers();
      }, 30000);
    } else {
      // Logged-out viewers cannot watch; don't poll viewer list.
    }

    // Subscribe to realtime changes on cfm_live_viewers
    const viewerChannel = sb
      .channel(`live-viewers-${liveId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "cfm_live_viewers", filter: `live_id=eq.${liveId}` },
        () => {
          loadViewers();
        }
      )
      .subscribe();

    return () => {
      // Leave as viewer (only if logged in)
      if (myUserId) {
        (async () => {
          try { await sb.rpc("cfm_leave_live_viewer", { p_live_id: liveId }); } catch {}
        })();
      }
      if (viewerHeartbeatRef.current) {
        clearInterval(viewerHeartbeatRef.current);
      }
      clearTimeout(quickPoll);
      clearTimeout(quickPoll2);
      sb.removeChannel(viewerChannel);
    };
  }, [idlePaused, isHostMode, isLoggedIn, kicked, live.is_live, sb, chatLiveId, myUserId]);

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

        const { data } = await sb.from("cfm_public_member_ids").select("user_id,favorited_username").in("user_id", ids);
        if (cancelled) return;

        const patch: Record<string, string> = {};
        for (const row of (data ?? []) as any[]) {
          const uid = String(row?.user_id ?? "").trim();
          const uname = String(row?.favorited_username ?? "").trim();
          if (uid && uname) patch[uid] = uname;
        }

        if (Object.keys(patch).length) {
          setNameByUserId((prev) => ({ ...prev, ...patch }));
        }
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nameByUserId, rows, sb]);

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
    let cleanup: null | (() => void) = null;
    let cancelled = false;
    let tokenRefresh: NodeJS.Timeout | null = null;

    (async () => {
      if (!videoRef.current) return;

      // Don't connect to Agora if stream is not live (unless host mode)
      if (!isHostMode && !live.is_live) {
        console.log("[LiveClient] Stream not live - skipping Agora connection");
        return;
      }

      if (!isHostMode && !isLoggedIn) {
        console.log("[LiveClient] Login required - skipping Agora connection");
        return;
      }

      if (!isHostMode && kicked) {
        console.log("[LiveClient] Viewer kicked - skipping Agora connection");
        return;
      }

      if (!isHostMode && idlePaused) {
        console.log("[LiveClient] Viewer paused - skipping Agora connection");
        return;
      }

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
          console.error("[LiveClient] Token request failed:", res.status, errText);
          return;
        }
        const json = (await res.json()) as any;
        console.log("[LiveClient] Token response:", { role: json?.role, isHostMode });
        const token = String(json?.token ?? "");
        const uidNum = Number(json?.uid ?? 0);
        const appId = String(json?.appId ?? "");
        const channel = String(json?.channel ?? "");
        const role = String(json?.role ?? "viewer");

        if (!token || !appId || !channel) return;

        setLocalRtc({ appId, channel, uid: uidNum ? String(uidNum) : "", role });

        const rtcMod: any = await import("agora-rtc-sdk-ng");
        const AgoraRTC = (rtcMod?.default ?? rtcMod) as any;
        if (cancelled) return;

        const client = AgoraRTC.createClient({ mode: "live", codec: "h264" });

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

        const playRemoteIfPossible = async (user: any) => {
          if (!videoRef.current) return;
          try {
            await client.subscribe(user, "video");
            if (user?.videoTrack) {
              user.videoTrack.play(videoRef.current!);
              setRemoteUid(String(user.uid ?? ""));
              setHasRemoteVideo(true);
              setLastRtcEvent(`subscribed-video:${String(user?.uid ?? "")}`);
            }
          } catch {
          }

          try {
            await client.subscribe(user, "audio");
            user?.audioTrack?.play?.();
          } catch {
          }
        };

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
        try {
          setRemoteCount(Number((client.remoteUsers ?? []).length));
          setLastRtcEvent(`joined:${channel}`);
        } catch {
        }

        const canHost = isHostMode && role === "host";
        setIsHost(canHost);

        if (canHost) {
          await client.setClientRole("host");
          const tracks = (await AgoraRTC.createMicrophoneAndCameraTracks()) as any[];
          const mic = tracks?.[0];
          const cam = tracks?.[1];
          cam?.play(videoRef.current!);
          await client.publish([mic, cam].filter(Boolean));
          setBroadcasting(true);

          cleanup = () => {
            try {
              setBroadcasting(false);
              if (tokenRefresh) clearInterval(tokenRefresh);
              client.removeAllListeners();
              try {
                client.unpublish([mic, cam].filter(Boolean));
              } catch {
              }
              try {
                mic?.stop?.();
                mic?.close?.();
              } catch {
              }
              try {
                cam?.stop?.();
                cam?.close?.();
              } catch {
              }
              client.leave();
            } catch {
            }
          };
        } else {
          await client.setClientRole("audience");

          try {
            const existing = (client.remoteUsers ?? []) as any[];
            for (const u of existing) {
              await playRemoteIfPossible(u);
            }
            setRemoteCount(Number((client.remoteUsers ?? []).length));
          } catch {
          }

          tokenRefresh = setInterval(async () => {
            try {
              if (cancelled) return;
              if (!live.is_live) return;
              if (idlePaused) return;
              if (!isLoggedIn) return;

              const rr = await fetch("/api/agora/token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  role: "viewer",
                  client: "web",
                }),
              });
              if (!rr.ok) return;
              const j = (await rr.json().catch(() => null)) as any;
              const nextToken = String(j?.token ?? "");
              if (!nextToken) return;
              await client.renewToken(nextToken);
            } catch {
            }
          }, 4 * 60 * 1000);

          cleanup = () => {
            try {
              if (tokenRefresh) clearInterval(tokenRefresh);
              client.removeAllListeners();
              client.leave();
            } catch {
            }
          };
        }

        setAgoraReady(true);
        
        // Store cleanup function in ref so it can be called when stream ends
        agoraCleanupRef.current = cleanup;
      } catch {
      }
    })();

    // Add beforeunload handler to cleanup on tab close/refresh
    const handleBeforeUnload = () => {
      if (cleanup) cleanup();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Add visibilitychange handler to cleanup when tab is hidden (optional - more aggressive)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && cleanup) {
        cleanup();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (cleanup) cleanup();
    };
  }, [idleEpoch, idlePaused, isHostMode, live.is_live, myUserId]);

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

  async function send(type: "chat" | "emote", message: string) {
    const msg = String(message ?? "").trim();
    if (!msg) return;

    const liveId = String(chatLiveId ?? "").trim();
    if (!liveId) {
      toast("Live session not ready.", "error");
      return;
    }

    startTransition(async () => {
      const { error } = await sb.from("cfm_live_chat").insert({
        live_id: liveId,
        sender_user_id: myUserId,
        message: msg,
        type,
      } as any);

      if (error) {
        toast(error.message, "error");
        return;
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
                  <Button type="button" className="mt-4 w-full" onClick={() => router.push(nextPath)}>
                    Go back
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
                    const m = medal(Number(g.rank ?? 0));
                    const name = String(g.display_name ?? "Member");
                    return (
                      <button
                        key={String(g.profile_id)}
                        type="button"
                        onClick={() => openProfile(String(g.profile_id))}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-left ${m.cls}`}
                      >
                        <span className="text-sm">{m.label}</span>
                        {renderAvatar(name, g.avatar_url, 24)}
                        <div className="min-w-0">
                          <div className="max-w-[100px] truncate text-[11px] font-semibold text-white">{name}</div>
                          <div className="text-[11px] font-bold text-green-400">{fmtAmount(g.total_amount ?? 0)}</div>
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
                        const isGift = t === "tip" || (t === "system" && meta?.event === "gift");
                        
                        // Green for joins, red for gifts/tips, default for others
                        if (isJoin) {
                          return (
                            <div key={r.id} className="text-[15px] text-green-400 font-semibold">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => senderId && showMiniProfile(senderId)}
                              >
                                {badge ? <span className="mr-1">{badge}</span> : null}{msg}
                              </button>
                            </div>
                          );
                        }
                        
                        if (isGift) {
                          return (
                            <div key={r.id} className="text-[15px] text-red-400 font-semibold">
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={() => senderId && showMiniProfile(senderId)}
                              >
                                {badge ? <span className="mr-1">{badge}</span> : null}{msg}
                              </button>
                            </div>
                          );
                        }
                        
                        const cls = t === "system" ? "text-white/70" : "text-white";
                        return (
                          <div key={r.id} className={`text-[15px] font-medium ${cls}`}>
                            <button
                              type="button"
                              className="text-white/70 font-semibold hover:underline"
                              onClick={() => senderId && showMiniProfile(senderId)}
                            >
                              {badge ? <span className="mr-1">{badge}</span> : null}{senderName}:
                            </button>{" "}
                            {msg}
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
                  Today
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
                        {renderAvatar(name, g.avatar_url, 40)}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-white">{name}</div>
                          <div className="text-lg font-bold text-green-400">${amount.toFixed(2)}</div>
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
                      {viewers.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
                            {v.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-sm text-white">{v.name}</div>
                          {isHost && myUserId && v.id !== myUserId ? (
                            <button
                              type="button"
                              className="ml-auto rounded-full bg-[#d11f2a] px-3 py-1 text-xs font-bold text-white"
                              onClick={() => kickViewer(v.id)}
                            >
                              Kick
                            </button>
                          ) : (
                            <span className="ml-auto" />
                          )}
                          {v.isOnline ? (
                            <span className="text-xs text-green-400">● Online</span>
                          ) : (
                            <span className="text-xs text-white/40">Offline</span>
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
        notice={!isLoggedIn ? "You can gift anonymously. Log in to appear on the gifter leaderboard." : null}
        onClose={() => setGiftModalOpen(false)}
        onStartCheckout={(amountCents) => {
          startGiftTransition(async () => {
            try {
              const res = await createSiteGiftCheckoutSession(amountCents, "/live");
              if (!res?.url) throw new Error("Checkout failed.");
              window.location.href = res.url;
            } catch (e) {
              toast(e instanceof Error ? e.message : "Checkout failed", "error");
            }
          });
        }}
      />
    </div>
    </div>
  );
}
