"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { createAdminPost } from "@/app/feed/actions";

export function AdminPostComposer({ title }: { title?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<null | { tone: "success" | "error"; text: string }>(null);

  return (
    <Card title={title ?? "Admin post"}>
      <div className="space-y-3">
        <div className="text-sm text-[color:var(--muted)]">
          Admins can post unlimited updates. Members are limited to 1 daily post.
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
                await createAdminPost(fd);
                setMsg({ tone: "success", text: "Post created." });
                e.currentTarget.reset();
                router.refresh();
              } catch (err) {
                setMsg({
                  tone: "error",
                  text: err instanceof Error ? err.message : "Create failed",
                });
              }
            });
          }}
        >
          <Input label="Title" name="title" required placeholder="Post title" />
          <Input
            label="Post type"
            name="post_type"
            required
            placeholder="announcement | gift | snipe | award | leaderboard"
          />
          <Textarea label="Content" name="content" required placeholder="Write the update" />

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

          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Post"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
