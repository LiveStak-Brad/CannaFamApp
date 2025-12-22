"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Notice } from "@/components/ui/notice";

export function CoinsFinalizeNotice() {
  const sp = useSearchParams();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const coins = String(sp.get("coins") ?? "").trim();
    const sessionId = String(sp.get("session_id") ?? "").trim();

    if (coins !== "success") return;
    if (!sessionId) return;

    let cancelled = false;

    (async () => {
      try {
        setMsg({ tone: "success", text: "Finalizing coin purchase..." });

        const res = await fetch("/api/coins/web/finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setMsg({ tone: "error", text: String(json?.error ?? "Failed to finalize coin purchase") });
          return;
        }

        setMsg({ tone: "success", text: "Coins credited successfully." });
      } catch (e) {
        if (cancelled) return;
        setMsg({ tone: "error", text: e instanceof Error ? e.message : "Failed to finalize coin purchase" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sp]);

  return msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null;
}
