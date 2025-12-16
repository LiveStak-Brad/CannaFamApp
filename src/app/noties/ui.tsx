"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markAllNotiesRead, markNotieRead } from "./actions";

export type NotieRow = {
  id: string;
  type: string;
  is_read: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  actor_user_id?: string | null;
  message?: string | null;
  created_at?: string | null;
};

export type ActorProfile = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
};

function labelFor(n: NotieRow) {
  const t = String(n.type ?? "").trim();
  if (n.message) return String(n.message);
  if (t === "like") return "❤️ Someone liked your post";
  if (t === "comment") return "💬 Someone commented on your post";
  if (t === "mention") return "@ You were mentioned";
  if (t === "follow") return "👥 New follower";
  if (t === "follow_post") return "📝 Someone you follow posted";
  if (t === "follow_comment") return "💬 Someone you follow commented";
  if (t === "award") return "🏆 You received an award";
  if (t === "comment_upvote") return "⬆️ Someone upvoted your comment";
  if (t === "new_comment") return "💬 New comment";
  return "🔔 Notification";
}

function fmtWhen(ts: string | null | undefined) {
  if (!ts) return "";
  try {
    const d = new Date(String(ts));
    const ms = Date.now() - d.getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 14) return `${days}d ago`;
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function hrefFor(n: NotieRow, actor: ActorProfile | null) {
  const et = String(n.entity_type ?? "").trim();
  const eid = String(n.entity_id ?? "").trim();
  const pid = String(n.post_id ?? "").trim();
  if (et === "post" && eid) return `/feed#${encodeURIComponent(eid)}`;
  if (pid) return `/feed#${encodeURIComponent(pid)}`;
  if (et === "award") return "/awards";
  if ((et === "user" || n.type === "follow") && actor?.favorited_username) {
    return `/u/${encodeURIComponent(actor.favorited_username)}`;
  }
  return "/noties";
}

export function NotiesClient({
  initialNoties,
  actorProfiles,
}: {
  initialNoties: NotieRow[];
  actorProfiles: Record<string, ActorProfile>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"all" | "mentions" | "awards" | "follows">("all");
  const [noties, setNoties] = useState<NotieRow[]>(initialNoties);

  const unreadCount = useMemo(() => noties.filter((n) => !n.is_read).length, [noties]);

  const filtered = useMemo(() => {
    if (tab === "all") return noties;
    if (tab === "mentions") return noties.filter((n) => n.type === "mention");
    if (tab === "awards") return noties.filter((n) => n.type === "award");
    if (tab === "follows") {
      return noties.filter((n) => String(n.type ?? "").startsWith("follow"));
    }
    return noties;
  }, [noties, tab]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={tab === "all" ? "secondary" : undefined}
            onClick={() => setTab("all")}
            disabled={pending}
          >
            All
          </Button>
          <Button
            type="button"
            variant={tab === "mentions" ? "secondary" : undefined}
            onClick={() => setTab("mentions")}
            disabled={pending}
          >
            Mentions
          </Button>
          <Button
            type="button"
            variant={tab === "awards" ? "secondary" : undefined}
            onClick={() => setTab("awards")}
            disabled={pending}
          >
            Awards
          </Button>
          <Button
            type="button"
            variant={tab === "follows" ? "secondary" : undefined}
            onClick={() => setTab("follows")}
            disabled={pending}
          >
            Follows
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-[color:var(--muted)]">Unread: {unreadCount}</div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || unreadCount === 0}
            onClick={() => {
              startTransition(async () => {
                setNoties((prev) => prev.map((n) => ({ ...n, is_read: true })));
                await markAllNotiesRead();
                router.refresh();
              });
            }}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {filtered.length ? (
        <div className="space-y-2">
          {filtered.map((n) => {
            const actorId = String(n.actor_user_id ?? "").trim();
            const actor = actorId ? actorProfiles[actorId] ?? null : null;
            const href = hrefFor(n, actor);

            return (
              <button
                key={n.id}
                type="button"
                className="block w-full text-left"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    setNoties((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
                    await markNotieRead(n.id);
                    router.push(href);
                    router.refresh();
                  });
                }}
              >
                <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {actor?.photo_url ? (
                        <img
                          src={actor.photo_url}
                          alt={actor.favorited_username}
                          className="h-9 w-9 rounded-full border border-[color:var(--border)] object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)]" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {actor?.favorited_username ? `${actor.favorited_username}: ` : ""}
                          {labelFor(n)}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--muted)] truncate">{fmtWhen(n.created_at)}</div>
                      </div>
                    </div>
                    {!n.is_read ? (
                      <div className="text-xs font-semibold text-[rgba(209,31,42,0.95)]">NEW</div>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-[color:var(--muted)]">No notifications yet.</div>
      )}
    </div>
  );
}
