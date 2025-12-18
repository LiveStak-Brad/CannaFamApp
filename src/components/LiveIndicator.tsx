"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LiveIndicator() {
  const pathname = usePathname();
  const [isLive, setIsLive] = useState(false);

  // Don't show on the live page itself
  const isLivePage = pathname === "/live";

  useEffect(() => {
    const sb = supabaseBrowser();
    let cancelled = false;

    // Initial check
    async function checkLive() {
      try {
        const { data } = await sb.rpc("cfm_get_live_state");
        if (cancelled) return;
        const row = Array.isArray(data) ? (data as any[])[0] : data;
        setIsLive(!!row?.is_live);
      } catch {
        if (!cancelled) setIsLive(false);
      }
    }

    checkLive();

    // Subscribe to realtime changes instead of polling
    const channel = sb
      .channel("live-indicator")
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "cfm_live_state" },
        (payload: any) => {
          if (!cancelled) {
            setIsLive(!!payload.new?.is_live);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, []);

  if (!isLive || isLivePage) return null;

  return (
    <Link
      href="/live"
      className="fixed top-20 right-4 z-50 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full shadow-lg transition-all animate-pulse"
    >
      <span className="w-2 h-2 bg-white rounded-full" />
      <span className="text-sm font-bold tracking-wide">LIVE</span>
    </Link>
  );
}
