"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";

export function NotiesNavButton({
  userId,
  initialUnread,
  className,
  mode,
}: {
  userId: string;
  initialUnread: number;
  className: string;
  mode: "desktop" | "mobile";
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [unread, setUnread] = useState<number>(Number(initialUnread ?? 0));
  const refreshTimer = useRef<number | null>(null);

  async function refreshUnread() {
    try {
      const { count, error } = await sb
        .from("cfm_noties")
        .select("id", { count: "exact", head: true })
        .or(`user_id.eq.${userId},member_id.eq.${userId}`)
        .eq("is_read", false);
      if (error) return;
      setUnread(count ?? 0);
    } catch {
    }
  }

  function scheduleRefresh() {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshUnread();
    }, 200);
  }

  useEffect(() => {
    refreshUnread();

    const ch1 = sb
      .channel(`noties-${userId}-uid`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cfm_noties", filter: `user_id=eq.${userId}` },
        () => scheduleRefresh(),
      )
      .subscribe();

    const ch2 = sb
      .channel(`noties-${userId}-mid`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cfm_noties", filter: `member_id=eq.${userId}` },
        () => scheduleRefresh(),
      )
      .subscribe();

    const onFocus = () => refreshUnread();
    const onVis = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      sb.removeChannel(ch1);
      sb.removeChannel(ch2);
    };
  }, [sb, userId]);

  if (mode === "mobile") {
    return (
      <Button as="link" href="/noties" variant="secondary" className={className + " relative"}>
        <span className="inline-flex items-center" aria-hidden>
          🔔
        </span>
        <span className="sr-only">Noties</span>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[rgba(209,31,42,0.95)]" />
        ) : null}
      </Button>
    );
  }

  return (
    <Button as="link" href="/noties" variant="secondary" className={className}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span>Noties</span>
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[rgba(209,31,42,0.9)] px-2 py-[1px] text-[11px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </span>
    </Button>
  );
}
