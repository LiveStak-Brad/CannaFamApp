"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";

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

type ViewerRow = {
  user_id: string;
  display_name: string | null;
  is_online: boolean;
  joined_at: string;
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

  const [live, setLive] = useState<LiveState>(initialLive);
  const [broadcasting, setBroadcasting] = useState(false);
  const [agoraReady, setAgoraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);

  // Top gifters state (Today, Weekly, All-Time like web view)
  const [topToday, setTopToday] = useState<TopGifterRow[]>([]);
  const [topWeekly, setTopWeekly] = useState<TopGifterRow[]>([]);
  const [topAllTime, setTopAllTime] = useState<TopGifterRow[]>([]);
  const [topModalOpen, setTopModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"today" | "weekly" | "all_time">("today");

  // Viewers state
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [viewerListOpen, setViewerListOpen] = useState(false);

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

  const liveId = live?.id ?? "";

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
        }));
        setViewers(rows as ViewerRow[]);
        setTotalViews(rows.length);
        setViewerCount(rows.filter((v) => v.is_online).length);
      }
    } catch (e) {
      console.error("[HostLive loadViewers] error:", e);
    }
  }, [sb, liveId]);

  // Load data on mount and periodically
  useEffect(() => {
    loadTopGifters();
    loadViewers();
    const t1 = setInterval(loadTopGifters, 30000);
    const t2 = setInterval(loadViewers, 10000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [loadTopGifters, loadViewers]);

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
        return;
      }

      const json = await res.json();
      console.log("[HostLiveClient] Token response:", json);

      if (json.role !== "host") {
        setError("Not authorized as host");
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

      setBroadcasting(true);
      setAgoraReady(true);

      // Track viewer count
      client.on("user-joined", () => {
        setViewerCount(client.remoteUsers?.length ?? 0);
      });
      client.on("user-left", () => {
        setViewerCount(client.remoteUsers?.length ?? 0);
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
  }, [liveId, sb]);

  // Load usernames for chat
  useEffect(() => {
    const unknownIds = [...new Set(chatRows.map(r => r.sender_user_id).filter(Boolean).filter(id => !nameByUserId[id!]))];
    if (unknownIds.length === 0) return;

    (async () => {
      const { data } = await sb
        .from("cfm_public_member_ids")
        .select("user_id,favorited_username")
        .in("user_id", unknownIds);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((r: any) => { map[r.user_id] = r.favorited_username; });
        setNameByUserId(prev => ({ ...prev, ...map }));
      }
    })();
  }, [chatRows, sb]);

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
          {topToday.slice(0, 3).map((g) => {
            const rank = Number(g.rank ?? 0);
            const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
            const bgColor = rank === 1 ? "rgba(234,179,8,0.35)" : rank === 2 ? "rgba(156,163,175,0.35)" : "rgba(249,115,22,0.35)";
            const borderColor = rank === 1 ? "rgba(234,179,8,0.6)" : rank === 2 ? "rgba(156,163,175,0.6)" : "rgba(249,115,22,0.6)";
            const amount = Number(g.total_amount ?? 0);
            return (
              <div
                key={`${g.profile_id}-${rank}`}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 backdrop-blur-sm"
                style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
              >
                <span className="text-sm">{medalEmoji}</span>
                {g.avatar_url ? (
                  <img src={g.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover object-top" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white">
                    {g.display_name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-white truncate max-w-[70px]">{g.display_name}</span>
                  <span className="text-[10px] font-bold text-green-400">${amount.toFixed(2)}</span>
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
              
              // Green for joins (like mobile)
              if (isJoin) {
                return (
                  <div key={row.id} className="text-[15px] text-green-400 font-semibold">
                    {msg}
                  </div>
                );
              }
              
              // Red for gifts (like mobile)
              if (isGift) {
                return (
                  <div key={row.id} className="text-[15px] text-red-400 font-semibold">
                    {msg}
                  </div>
                );
              }
              
              // Regular chat
              return (
                <div key={row.id} className="text-[15px] font-medium text-white">
                  <span className="text-white/70 font-semibold">{senderName}:</span>{" "}
                  {msg}
                </div>
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
                    {viewers.map((v) => (
                      <div key={v.user_id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
                          {(v.display_name || "M").charAt(0).toUpperCase()}
                        </div>
                        <div className="text-sm text-white">{v.display_name || "Member"}</div>
                        {v.is_online ? (
                          <span className="ml-auto text-xs text-green-400">● Online</span>
                        ) : (
                          <span className="ml-auto text-xs text-white/40">Offline</span>
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

      {/* Leaderboard Modal - same as web view screen with Today/Weekly/All-Time tabs */}
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
                {(topTab === "today" ? topToday : topTab === "weekly" ? topWeekly : topAllTime).map((g) => {
                  const r = Number(g.rank ?? 0);
                  const name = String(g.display_name ?? "Member");
                  const amount = Number(g.total_amount ?? 0);
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
                      {g.avatar_url ? (
                        <img src={g.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover object-top" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white">
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">{name}</div>
                        <div className="text-lg font-bold text-green-400">${amount.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}

                {(topTab === "today" ? topToday : topTab === "weekly" ? topWeekly : topAllTime).length === 0 ? (
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
