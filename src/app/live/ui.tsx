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

  const isHostMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("host") === "1";
    } catch {
      return false;
    }
  }, []);

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

  const [agoraReady, setAgoraReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [lastRtcEvent, setLastRtcEvent] = useState<string | null>(null);
  const [localRtc, setLocalRtc] = useState<{ appId: string; channel: string; uid: string; role: string } | null>(null);
  const videoRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [fallingEmotes, setFallingEmotes] = useState<{ id: string; emoji: string; leftPct: number }[]>([]);
  const seenRemoteEmotesRef = useRef<Record<string, true>>({});
  const lastLocalEmoteAtRef = useRef<number>(0);

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

  const chatLiveId = useMemo(() => {
    const v = String((live as any)?.id ?? "").trim();
    if (v) return v;
    const fallback = String((initialLive as any)?.id ?? "").trim();
    return fallback;
  }, [initialLive, live]);

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
  }, [sb, chatLiveId]);

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
  }, [sb]);

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

    (async () => {
      if (!videoRef.current) return;

      try {
        const res = await fetch("/api/agora/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: isHostMode ? "host" : "viewer", client: "web" }),
        });

        if (!res.ok) return;
        const json = (await res.json()) as any;
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
            setLastRtcEvent(`user-joined:${String(user?.uid ?? "")}`);
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

          cleanup = () => {
            try {
              client.removeAllListeners();
              client.leave();
            } catch {
            }
          };
        }

        setAgoraReady(true);
      } catch {
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [isHostMode]);

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

            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">LIVE</span>
                <div className="text-sm font-semibold text-white">{title}</div>
                {isHost ? (
                  <button
                    type="button"
                    disabled={hostPending}
                    onClick={() => setLiveState(!live.is_live)}
                    className="ml-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-semibold text-white"
                  >
                    {live.is_live ? "End Live" : "Go Live"}
                  </button>
                ) : null}
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

            <div className="absolute inset-x-0 bottom-0 z-10 p-3">
              <div className="flex h-[40%] max-h-[320px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/35 backdrop-blur">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="text-center text-sm font-semibold text-white">CannaFam Chat</div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
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
                            <span className="text-white/70">
                              {String(nameByUserId[String(r.sender_user_id ?? "").trim()] ?? "Member")}:
                            </span>{" "}
                            {msg}
                          </div>
                        );
                      })}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                <div className="border-t border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
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
                      <Button as="link" href="/support" variant="secondary" className="px-3 py-2 text-xs">
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
