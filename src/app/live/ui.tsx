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

  const [topToday, setTopToday] = useState<TopGifterRow[]>([]);
  const [topWeekly, setTopWeekly] = useState<TopGifterRow[]>([]);
  const [topAllTime, setTopAllTime] = useState<TopGifterRow[]>([]);
  const [topModalOpen, setTopModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"today" | "weekly" | "all_time">("today");

  const [agoraReady, setAgoraReady] = useState(false);
  const videoRef = useRef<HTMLDivElement | null>(null);

  const isLoggedIn = !!myUserId;

  async function loadTopGifters() {
    try {
      const [{ data: d1 }, { data: d2 }, { data: d3 }] = await Promise.all([
        sb.rpc("cfm_top_gifters", { period: "today" }),
        sb.rpc("cfm_top_gifters", { period: "weekly" }),
        sb.rpc("cfm_top_gifters", { period: "all_time" }),
      ]);
      setTopToday(((d1 ?? []) as any[]) as TopGifterRow[]);
      setTopWeekly(((d2 ?? []) as any[]) as TopGifterRow[]);
      setTopAllTime(((d3 ?? []) as any[]) as TopGifterRow[]);
    } catch {
    }
  }

  const medal = (r: number) => {
    if (r === 1) return { label: "#1", cls: "border-yellow-400/40 bg-yellow-400/15" };
    if (r === 2) return { label: "#2", cls: "border-gray-300/40 bg-gray-300/15" };
    if (r === 3) return { label: "#3", cls: "border-orange-400/40 bg-orange-400/15" };
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

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await sb.rpc("cfm_get_live_state");
        if (!mounted) return;
        if (data) setLive(data as any);
      } catch {
      }

      await loadTopGifters();

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
    const t = setInterval(() => {
      loadTopGifters();
    }, 30000);
    return () => clearInterval(t);
  }, [sb]);

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

  const title = "CannaStreams";

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
      <div className="mx-auto flex h-full w-full max-w-xl flex-col px-3 pb-3 pt-3">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl border border-white/10 bg-black">
            <div ref={videoRef} className="absolute inset-0" />

            {!agoraReady ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Connecting...</div>
            ) : null}

            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">LIVE</span>
                <div className="text-sm font-semibold text-white">{title}</div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={exitLive}
                  disabled={pending}
                  aria-label="Exit Live"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white"
                >
                  <span className="text-xl leading-none">×</span>
                </button>

                <div className="flex flex-col gap-2">
                  {top3.map((g) => {
                    const m = medal(Number(g.rank ?? 0));
                    const name = String(g.display_name ?? "Member");
                    return (
                      <button
                        key={String(g.profile_id)}
                        type="button"
                        onClick={() => openProfile(String(g.profile_id))}
                        className={`flex items-center gap-2 rounded-2xl border px-2 py-1 text-left ${m.cls}`}
                      >
                        {renderAvatar(name, g.avatar_url, 26)}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="max-w-[130px] truncate text-[12px] font-semibold text-white">{name}</div>
                            <div className="shrink-0 text-[10px] font-semibold text-white/90">{m.label}</div>
                          </div>
                          <div className="text-[11px] text-white/80">{fmtAmount(g.total_amount ?? 0)}</div>
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
                    className="text-right text-[11px] font-semibold text-white/85"
                  >
                    Top Gifters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-3 w-full max-w-[420px]">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/45 backdrop-blur">
            <div className="border-b border-white/10 px-4 py-3">
              <div className="text-sm font-semibold text-white">CannaFam Chat</div>
            </div>

            <div className="max-h-[34vh] overflow-auto px-4 py-4">
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
                <div className="mt-2 text-xs text-white/60">Log in to comment & react.</div>
              ) : null}
            </div>
          </div>
        </div>

        {topModalOpen ? (
          <div className="fixed inset-0 z-[60] bg-white">
            <div className="mx-auto flex h-full w-full max-w-xl flex-col">
              <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-4">
                <div className="text-base font-semibold">Top Gifters</div>
                <button
                  type="button"
                  className="rounded-full border border-[color:var(--border)] px-3 py-1 text-sm"
                  onClick={() => setTopModalOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="flex gap-2 px-4 pt-3">
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                    topTab === "today" ? "bg-black text-white" : "bg-white"
                  }`}
                  onClick={() => setTopTab("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                    topTab === "weekly" ? "bg-black text-white" : "bg-white"
                  }`}
                  onClick={() => setTopTab("weekly")}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                    topTab === "all_time" ? "bg-black text-white" : "bg-white"
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
                    const m = medal(r);
                    const name = String(g.display_name ?? "Member");
                    return (
                      <button
                        key={`${String(g.profile_id)}-${r}`}
                        type="button"
                        onClick={() => {
                          setTopModalOpen(false);
                          openProfile(String(g.profile_id));
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                          r <= 3 ? m.cls : "border-[color:var(--border)] bg-white"
                        }`}
                      >
                        <div className="w-10 shrink-0 text-sm font-semibold">{m.label}</div>
                        {renderAvatar(name, g.avatar_url, 34)}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{name}</div>
                          <div className="text-xs text-[color:var(--muted)]">{fmtAmount(g.total_amount ?? 0)}</div>
                        </div>
                      </button>
                    );
                  })}

                  {!modalRows.length ? (
                    <div className="text-sm text-[color:var(--muted)]">No gifts yet.</div>
                  ) : null}
                </div>
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
    </div>
    </div>
  );
}
