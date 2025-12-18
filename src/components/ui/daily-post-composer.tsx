"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { deleteMyDailyPost, upsertMyDailyPost } from "@/app/feed/actions";

export type DailyPostDraft = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
};

export type MentionCandidate = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
};

function MediaPreview({ mediaUrl, mediaType }: { mediaUrl: string; mediaType: string }) {
  if (mediaType === "video") {
    return (
      <video
        className="w-full rounded-xl border border-[color:var(--border)] bg-black"
        controls
        preload="metadata"
        src={mediaUrl}
      />
    );
  }

  return (
    <img
      src={mediaUrl}
      alt="Daily post media"
      className="w-full rounded-xl border border-[color:var(--border)] object-cover"
      referrerPolicy="no-referrer"
    />
  );
}

export function DailyPostComposer({
  title,
  existing,
  mentionCandidates = [],
}: {
  title?: string;
  existing: DailyPostDraft | null;
  mentionCandidates?: MentionCandidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);
  const [content, setContent] = useState(existing?.content ?? "");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const mentionMatches = useMemo(() => {
    const q = (mentionQuery ?? "").trim().toLowerCase();
    if (!q) return [] as MentionCandidate[];
    return mentionCandidates
      .filter((m) => (m.favorited_username ?? "").toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [mentionCandidates, mentionQuery]);

  function updateMentionState(nextText: string) {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? nextText.length;
    const before = nextText.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at === -1) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    if (at > 0) {
      const ch = before[at - 1];
      if (ch && !/\s/.test(ch)) {
        setMentionQuery(null);
        setMentionStart(null);
        return;
      }
    }
    const q = before.slice(at + 1);
    if (!q.length || /\s/.test(q)) {
      setMentionQuery(null);
      setMentionStart(null);
      return;
    }
    setMentionQuery(q);
    setMentionStart(at);
  }

  function insertMention(username: string) {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? content.length;
    const start = mentionStart ?? content.lastIndexOf("@", cursor);
    if (start < 0) return;
    const before = content.slice(0, start);
    const after = content.slice(cursor);
    const next = `${before}@${username} ${after}`;
    setContent(next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + 1 + username.length + 1;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <Card title={title ?? "Your daily post"}>
      <div className="space-y-3">
        <div className="text-sm text-[color:var(--muted)]">
          Limit 1 post per day. You can edit or delete your post for today. Use @username to tag members.
        </div>

        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            const fd = new FormData(e.currentTarget);
            fd.set("content", content);
            startTransition(async () => {
              try {
                const res = await upsertMyDailyPost(fd);
                setMsg({ tone: "success", text: res.message });
                router.refresh();
              } catch (err) {
                setMsg({
                  tone: "error",
                  text: err instanceof Error ? err.message : "Save failed",
                });
              }
            });
          }}
        >
          <Input
            label="Title (optional)"
            name="title"
            defaultValue={existing?.title ?? ""}
            placeholder="Optional title"
          />
          <div className="space-y-2">
            <label className="block">
              <div className="text-sm font-semibold text-[color:var(--foreground)]">Post</div>
              <textarea
                ref={composerRef}
                name="content"
                className="mt-2 w-full min-h-28 rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
                value={content}
                onChange={(e) => {
                  const next = e.target.value;
                  setContent(next);
                  updateMentionState(next);
                }}
                onSelect={(e) => {
                  updateMentionState((e.target as HTMLTextAreaElement).value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMentionQuery(null);
                    setMentionStart(null);
                  }
                }}
                required
                placeholder="Share an update for today"
              />
            </label>

            {mentionQuery && mentionMatches.length ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-2">
                <div className="text-xs text-[color:var(--muted)] px-2 py-1">Tag a member</div>
                <div className="max-h-48 overflow-auto">
                  {mentionMatches.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.04)]"
                      onClick={() => insertMention(m.favorited_username)}
                    >
                      {m.photo_url ? (
                        <img
                          src={m.photo_url}
                          alt={m.favorited_username}
                          className="h-6 w-6 rounded-full border border-[color:var(--border)] object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)]" />
                      )}
                      <div className="font-semibold">@{m.favorited_username}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Media (optional)</div>
            <input
              type="file"
              name="media"
              accept="image/*,video/*"
              className="block w-full text-sm text-[color:var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[color:var(--border)] file:bg-black/20 file:px-3 file:py-2 file:text-sm file:text-[color:var(--foreground)]"
            />
            <div className="text-xs text-[color:var(--muted)]">One image or video.</div>
          </div>

          {existing?.media_url && existing?.media_type ? (
            <div className="pt-1">
              <MediaPreview mediaUrl={existing.media_url} mediaType={existing.media_type} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : existing ? "Update" : "Post"}
            </Button>
            {existing ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  const ok = window.confirm("Delete your post for today? This cannot be undone.");
                  if (!ok) return;
                  setMsg(null);
                  startTransition(async () => {
                    try {
                      const res = await deleteMyDailyPost();
                      setMsg({ tone: "success", text: res.message });
                      router.refresh();
                    } catch (err) {
                      setMsg({
                        tone: "error",
                        text: err instanceof Error ? err.message : "Delete failed",
                      });
                    }
                  });
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </Card>
  );
}
