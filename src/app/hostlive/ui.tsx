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

  const videoRef = useRef<HTMLDivElement | null>(null);
  const agoraCleanupRef = useRef<(() => void) | null>(null);
  const autoStartedRef = useRef(false);

  // Chat state
  const [chatRows, setChatRows] = useState<LiveChatRow[]>([]);
  const [chatText, setChatText] = useState("");
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const liveId = live?.id ?? "";

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

  // Send chat message
  async function sendChat() {
    const msg = chatText.trim();
    if (!msg || !liveId) return;
    setChatText("");

    await sb.from("cfm_live_chat").insert({
      live_id: liveId,
      sender_user_id: myUserId,
      message: msg,
      type: "chat",
    });
  }

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatRows.length]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="mx-auto flex h-full w-full max-w-xl flex-col px-3 pb-3 pt-3">
        {/* Video Preview */}
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl border border-white/10 bg-black">
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
                {/* Viewer count */}
                <span className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[11px] font-semibold text-white">
                  👁️ {viewerCount}
                </span>
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
          </div>
        </div>

        {/* Chat Section */}
        <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/50">
          <div className="flex-1 overflow-y-auto p-3">
            {chatRows.map((row) => (
              <div key={row.id} className="mb-2 text-sm">
                <span className="font-semibold text-purple-400">
                  {nameByUserId[row.sender_user_id ?? ""] || "Member"}:
                </span>{" "}
                <span className="text-white/90">{row.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-white/10 p-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Send a message..."
                className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={sendChat}
                className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
