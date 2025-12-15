"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { deleteMyDailyPost, upsertMyDailyPost } from "@/app/feed/actions";

export type DailyPostDraft = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
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
}: {
  title?: string;
  existing: DailyPostDraft | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);

  return (
    <Card title={title ?? "Your daily post"}>
      <div className="space-y-3">
        <div className="text-sm text-[color:var(--muted)]">
          Limit 1 post per day. You can edit or delete your post for today.
        </div>

        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            const fd = new FormData(e.currentTarget);
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
          <Textarea
            label="Post"
            name="content"
            defaultValue={existing?.content ?? ""}
            required
            placeholder="Share an update for today"
          />

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
