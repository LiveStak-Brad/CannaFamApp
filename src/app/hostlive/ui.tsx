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
  total_amount: number; 
  rank: number;
};

type ViewerRow = {
  user_id: string;
  username: string | null;
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

  // Top gifters state
  const [topToday, setTopToday] = useState<TopGifterRow[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  // Viewers state
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [viewerListOpen, setViewerListOpen] = useState(false);

  const videoRef = useRef<HTMLDivElement | null>(null);
  const agoraCleanupRef = useRef<(() => void) | null>(null);
  const autoStartedRef = useRef(false);

  // Chat state (read-only display)
  const [chatRows, setChatRows] = useState<LiveChatRow[]>([]);
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const liveId = live?.id ?? "";

  // Load top gifters
  const loadTopGifters = useCallback(async () => {
    try {
      const { data } = await sb.rpc("cfm_top_gifters_today");
      if (data) setTopToday(data as TopGifterRow[]);
    } catch {}
  }, [sb]);

  // Load viewers
  const loadViewers = useCallback(async () => {
    if (!liveId) return;
    try {
      const { data } = await sb
        .from("cfm_live_viewers")
        .select("user_id,username,is_online,joined_at")
        .eq("live_id", liveId);
      if (data) {
        setViewers(data as ViewerRow[]);
        setTotalViews(data.length);
        setViewerCount(data.filter((v: any) => v.is_online).length);
      }
    } catch {}
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (agoraCleanupRef.current) {
        agoraCleanupRef.current();
      }
    };
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

      // Join channel
      await client.join(appId, channel, token, uid);
      await client.setClientRole("host");

      // Create and publish tracks
      const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
      const [mic, cam] = tracks;

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

      // Cleanup function
      agoraCleanupRef.current = async () => {
        try {
          setBroadcasting(false);
          await setLiveState(false);
          try { client.unpublish([mic, cam].filter(Boolean)); } catch {}
          try { mic?.stop?.(); mic?.close?.(); } catch {}
          try { cam?.stop?.(); cam?.close?.(); } catch {}
          try { client.leave(); } catch {}
        } catch {}
      };

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Stop broadcasting and exit
  async function stopBroadcast() {
    if (agoraCleanupRef.current) {
      await agoraCleanupRef.current();
    }
    router.push("/");
  }

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
          setChatRows((prev) => [...prev, payload.new].slice(-200));
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

        {/* Top 3 Gifters - positioned on right side below close button */}
        {topToday.length > 0 ? (
          <div className="absolute right-3 top-16 z-20 flex flex-col gap-1">
            {topToday.slice(0, 3).map((g) => {
              const rank = Number(g.rank ?? 0);
              const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
              const bgColor = rank === 1 ? "rgba(234,179,8,0.25)" : rank === 2 ? "rgba(156,163,175,0.25)" : "rgba(249,115,22,0.25)";
              const borderColor = rank === 1 ? "rgba(234,179,8,0.5)" : rank === 2 ? "rgba(156,163,175,0.5)" : "rgba(249,115,22,0.5)";
              return (
                <div
                  key={`${g.profile_id}-${rank}`}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] text-white"
                  style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
                >
                  <span>{medalEmoji}</span>
                  {g.avatar_url ? (
                    <img src={g.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold">
                      {g.display_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-semibold truncate max-w-[60px]">{g.display_name}</span>
                    <span className="text-[9px] text-white/70">${g.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

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

        {/* Chat Display (read-only) - overlaying bottom of video */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col">
          {/* Chat messages */}
          <div className="max-h-40 overflow-y-auto bg-gradient-to-t from-black/80 to-transparent p-3">
            {chatRows.slice(-20).map((row) => {
              const kind = row.type;
              const isGift = kind === "tip" || (kind === "system" && (row.metadata as any)?.event === "gift");
              const isJoin = kind === "system" && (row.metadata as any)?.event === "join";
              
              if (isJoin) {
                return (
                  <div key={row.id} className="mb-1 text-xs text-green-400/70">
                    {row.message}
                  </div>
                );
              }
              if (isGift) {
                return (
                  <div key={row.id} className="mb-1 text-sm font-semibold text-yellow-400">
                    🎁 {row.message}
                  </div>
                );
              }
              
              return (
                <div key={row.id} className="mb-1 text-sm">
                  <span className="font-semibold text-purple-400">
                    {nameByUserId[row.sender_user_id ?? ""] || "Member"}:
                  </span>{" "}
                  <span className="text-white/90">{row.message}</span>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Controls - Flip Camera, Filters, Trophy */}
          <div className="bg-black/60 p-2">
            <div className="flex justify-center gap-4">
              <button
                onClick={() => toast("Flip camera not available on web", "info")}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl hover:bg-white/20"
                title="Flip Camera"
              >
                🔄
              </button>
              <button
                onClick={() => toast("Filters not available on web", "info")}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl hover:bg-white/20"
                title="Filters"
              >
                🪄
              </button>
              <button
                onClick={() => setLeaderboardOpen(true)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl hover:bg-white/20"
                title="Leaderboard"
              >
                🏆
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Viewer List Modal */}
      {viewerListOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setViewerListOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Viewers</h3>
              <button onClick={() => setViewerListOpen(false)} className="text-2xl text-white/60 hover:text-white">×</button>
            </div>
            <div className="mb-4 flex gap-4">
              <div className="flex-1 rounded-xl bg-white/10 p-3 text-center">
                <div className="text-2xl font-bold text-white">{viewerCount}</div>
                <div className="text-xs text-white/60">👁️ Watching Now</div>
              </div>
              <div className="flex-1 rounded-xl bg-white/10 p-3 text-center">
                <div className="text-2xl font-bold text-white">{totalViews}</div>
                <div className="text-xs text-white/60">👥 Total Joined</div>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {viewers.map((v) => (
                <div key={v.user_id} className="flex items-center gap-2 border-b border-white/10 py-2">
                  <div className={`h-2 w-2 rounded-full ${v.is_online ? "bg-green-500" : "bg-gray-500"}`} />
                  <span className="text-sm text-white">{v.username || "Member"}</span>
                </div>
              ))}
              {viewers.length === 0 ? (
                <div className="text-center text-sm text-white/50">No viewers yet</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Leaderboard Modal */}
      {leaderboardOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLeaderboardOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">🏆 Top Gifters Today</h3>
              <button onClick={() => setLeaderboardOpen(false)} className="text-2xl text-white/60 hover:text-white">×</button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {topToday.map((g) => {
                const rank = Number(g.rank ?? 0);
                const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
                return (
                  <div key={g.profile_id} className="flex items-center gap-3 border-b border-white/10 py-3">
                    <span className="w-8 text-center text-lg">{medalEmoji}</span>
                    {g.avatar_url ? (
                      <img src={g.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                        {g.display_name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-white">{g.display_name}</div>
                      <div className="text-sm text-green-400">${g.total_amount.toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
              {topToday.length === 0 ? (
                <div className="text-center text-sm text-white/50">No gifters yet today</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
