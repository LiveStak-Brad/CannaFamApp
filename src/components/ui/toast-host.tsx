"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToasts, type ToastEvent } from "@/components/ui/toast";

type RenderToast = ToastEvent & { expiresAt: number };

export function ToastHost() {
  const [toasts, setToasts] = useState<RenderToast[]>([]);

  useEffect(() => {
    return subscribeToasts((evt) => {
      const expiresAt = Date.now() + 3500;
      setToasts((prev) => [{ ...evt, expiresAt }, ...prev].slice(0, 3));
    });
  }, []);

  useEffect(() => {
    if (!toasts.length) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, 250);

    return () => clearInterval(interval);
  }, [toasts.length]);

  const rendered = useMemo(() => toasts.slice(0, 3), [toasts]);

  if (!rendered.length) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
      <div className="w-full max-w-xl space-y-2">
        {rendered.map((t) => {
          const cls =
            t.tone === "error"
              ? "border-[rgba(209,31,42,0.30)] bg-[rgba(209,31,42,0.14)] text-red-100"
              : t.tone === "success"
                ? "border-[rgba(25,192,96,0.25)] bg-[rgba(25,192,96,0.12)] text-[color:var(--foreground)]"
                : "border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] text-[color:var(--foreground)]";

          return (
            <div key={t.id} className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${cls}`}>
              {t.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}
