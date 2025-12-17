"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

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
}: {
  initialLive: LiveState;
  myUserId: string | null;
  nextPath: string;
}) {
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

  const [live, setLive] = useState<LiveState>(initialLive);
  const [rows, setRows] = useState<LiveChatRow[]>([]);
  const [text, setText] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const [agoraReady, setAgoraReady] = useState(false);
  const videoRef = useRef<HTMLDivElement | null>(null);

  const isLoggedIn = !!myUserId;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await sb.rpc("cfm_get_live_state");
        if (!mounted) return;
        if (data) setLive(data as any);
      } catch {
      }

      try {
        const { data } = await sb
          .from("cfm_live_chat")
          .select("id,live_id,sender_user_id,message,type,metadata,is_deleted,deleted_by,deleted_at,created_at")
          .eq("live_id", (initialLive as any).id)
          .order("created_at", { ascending: false })
          .limit(80);
        if (!mounted) return;
        setRows(((data ?? []) as any[]).reverse() as any);
      } catch {
      }

      try {
        const channel = sb
          .channel(`live-chat-${(initialLive as any).id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "cfm_live_chat",
              filter: `live_id=eq.${(initialLive as any).id}`,
            },
            (payload: any) => {
              const row = payload.new as any;
              setRows((prev) => {
                const next = [...prev, row];
                return next.slice(-200);
              });
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "cfm_live_chat",
              filter: `live_id=eq.${(initialLive as any).id}`,
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
  }, [sb, initialLive]);

  useEffect(() => {
    let cleanup: null | (() => void) = null;
    let cancelled = false;

    (async () => {
      if (!videoRef.current) return;

      try {
        const res = await fetch("/api/agora/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "viewer" }),
        });

        if (!res.ok) return;
        const json = (await res.json()) as any;
        const token = String(json?.token ?? "");
        const uid = String(json?.uid ?? "");
        const appId = String(json?.appId ?? "");
        const channel = String(json?.channel ?? "");

        if (!token || !appId || !channel) return;

        const rtcMod: any = await import("agora-rtc-sdk-ng");
        const AgoraRTC = (rtcMod?.default ?? rtcMod) as any;
        if (cancelled) return;

        const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        await client.join(appId, channel, token, uid || null);
        await client.setClientRole("audience");

        client.on("user-published", async (user: any, mediaType: any) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video") {
            user.videoTrack?.play(videoRef.current!);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
        });

        client.on("user-unpublished", () => {
        });

        setAgoraReady(true);

        cleanup = () => {
          try {
            client.removeAllListeners();
            client.leave();
          } catch {
          }
        };
      } catch {
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, []);

  const title = String(live.title ?? "CannaFam Live");

  const canChat = isLoggedIn;

  async function send(type: "chat" | "emote", message: string) {
    const msg = String(message ?? "").trim();
    if (!msg) return;

    startTransition(async () => {
      const { error } = await sb.from("cfm_live_chat").insert({
        live_id: live.id,
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
      const res = await fetch("/api/live/exit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey(live) }),
      });
      if (!res.ok) {
        toast("Could not exit live.", "error");
        return;
      }
      router.push(nextPath && nextPath.startsWith("/") ? nextPath : "/hub");
      router.refresh();
    } catch {
      toast("Could not exit live.", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">LIVE</span>
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <Button type="button" variant="secondary" onClick={exitLive} disabled={pending}>
          Exit Live
        </Button>
      </div>

      <div className="absolute inset-0">
        <div ref={videoRef} className="h-full w-full" />
        {!agoraReady ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Connecting...</div>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto w-full max-w-xl px-4 pb-4">
          <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur">
            <div className="max-h-[38vh] overflow-auto px-4 pt-4">
              <div className="space-y-2">
                {rows
                  .filter((r) => !r.is_deleted)
                  .slice(-80)
                  .map((r) => {
                    const t = r.type;
                    const msg = String(r.message ?? "");
                    const cls =
                      t === "tip"
                        ? "text-blue-200"
                        : t === "system"
                          ? "text-white/70"
                          : "text-white";
                    return (
                      <div key={r.id} className={`text-sm ${cls}`}>
                        {msg}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  {DEFAULT_EMOTES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      onClick={() => {
                        if (!canChat) return;
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
                  <Button as="link" href="/support" variant="secondary">
                    Tip
                  </Button>
                  <Button as="link" href="/live" variant="secondary">
                    Share
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
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
                >
                  Send
                </Button>
              </div>

              {!isLoggedIn ? (
                <div className="mt-2 text-xs text-white/60">
                  Log in to comment & react.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
