"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function PointsExplainerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close points explainer"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl px-4 pb-4">
        <Card title="How points work">
          <div className="space-y-4 text-sm">
            <div className="text-[color:var(--muted)]">
              Points are calculated automatically from your activity.
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">✅ Check-in</div>
                <div className="text-[color:var(--muted)]">+1 per day</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">🔥 Streak</div>
                <div className="text-[color:var(--muted)]">
                  Shows your current consecutive-day check-in streak (also contributes to total).
                </div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">🔗 Shares</div>
                <div className="text-[color:var(--muted)]">+1 each, max 5/day</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">❤️ Likes</div>
                <div className="text-[color:var(--muted)]">+1 each</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">💬 Comments</div>
                <div className="text-[color:var(--muted)]">+1 each, max 3/day</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">⬆️ Comment upvotes</div>
                <div className="text-[color:var(--muted)]">+1 each, max 3/day</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">🎡 Daily Spin</div>
                <div className="text-[color:var(--muted)]">Random 1–5 per day</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">🎁 Gift bonus</div>
                <div className="text-[color:var(--muted)]">+5 per day (admin confirmed)</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">🔎 Link visits</div>
                <div className="text-[color:var(--muted)]">+1 each, max 7/day</div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold">💬 Discord</div>
                <div className="text-[color:var(--muted)]">+1 (one-time)</div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function PointsExplainerButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={className}
        onClick={() => setOpen(true)}
      >
        How points work
      </Button>
      <PointsExplainerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
