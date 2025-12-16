"use client";

import { useEffect, useState, useTransition } from "react";
import { getIsFollowing, setFollow } from "@/app/follow/actions";

export function FollowInline({
  targetUserId,
  myUserId,
  initialFollowing,
}: {
  targetUserId: string;
  myUserId?: string | null;
  initialFollowing?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [following, setFollowing] = useState<boolean>(!!initialFollowing);
  const [hydrated, setHydrated] = useState<boolean>(typeof initialFollowing !== "undefined");
  const [msg, setMsg] = useState<string | null>(null);

  const target = String(targetUserId ?? "").trim();
  const loggedIn = !!myUserId;
  const self = myUserId ? String(myUserId) === target : false;

  useEffect(() => {
    let cancelled = false;
    if (hydrated) return;
    if (!target) return;
    if (self) return;

    (async () => {
      try {
        const v = await getIsFollowing(target);
        if (cancelled) return;
        setFollowing(v);
        setHydrated(true);
      } catch {
        if (cancelled) return;
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, self, target]);

  if (!loggedIn) return null;
  if (!target || self) return null;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="text-xs font-semibold text-sky-400 underline underline-offset-4 disabled:opacity-60"
        onClick={(e) => {
          e.stopPropagation();
          setMsg(null);
          startTransition(async () => {
            const next = !following;
            setFollowing(next);
            try {
              await setFollow(target, next);
              setMsg(null);
            } catch (err) {
              setFollowing((prev) => !prev);
              setMsg(err instanceof Error ? err.message : "Follow failed");
            }
          });
        }}
      >
        {pending ? "..." : following ? "Following" : "Follow"}
      </button>
      {msg ? <span className="text-[10px] text-[color:var(--muted)]">{msg}</span> : null}
    </span>
  );
}
