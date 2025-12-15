"use client";

import { useEffect, useState, useTransition } from "react";
import { setFollow } from "./actions";

export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [following, setFollowing] = useState(initialFollowing);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        className={
          "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition active:translate-y-[1px] disabled:opacity-60 " +
          (following
            ? "border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--foreground)]"
            : "bg-[color:var(--primary)] text-white")
        }
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const next = !following;
            setFollowing(next);
            try {
              await setFollow(targetUserId, next);
              setMsg(next ? "Following" : "Unfollowed");
            } catch (e) {
              setFollowing(initialFollowing);
              setMsg(e instanceof Error ? e.message : "Follow failed");
            }
          });
        }}
      >
        {pending ? "..." : following ? "Following" : "Follow"}
      </button>
      {msg ? <div className="text-xs text-[color:var(--muted)]">{msg}</div> : null}
    </div>
  );
}
