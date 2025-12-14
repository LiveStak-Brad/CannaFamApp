"use client";

import type { FC } from "react";
import { useState, useTransition } from "react";
import { logLiveShare, logLinkVisit } from "@/app/support/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ShareModal } from "@/components/ui/share-modal";

const PLATFORMS = ["Facebook", "Instagram", "TikTok", "X", "Discord", "Other"] as const;

const LIVE_LINK = "https://fav.gg/@cannastreams";
const LIVE_MESSAGE =
  "Watch Live: https://fav.gg/@cannastreams\n\n50 free coins link is in the Favorited bio.";

export type SupportChecklistProps = {
  initialTodayCount: number;
  dailyCap: number;
  canEarn?: boolean;
};

export const SupportChecklist: FC<SupportChecklistProps> = ({
  initialTodayCount,
  dailyCap,
  canEarn = true,
}) => {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("Facebook");
  const [todayCount, setTodayCount] = useState(initialTodayCount);

  return (
    <div className="space-y-3">
      <div className="text-sm text-[color:var(--muted)]">
        Earn points for sharing the live link. Max {dailyCap}/day.
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <div className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Today</div>
          <div className="mt-1 text-xs text-[color:var(--muted)]">
            {todayCount} share(s) logged • {Math.max(0, dailyCap - todayCount)} remaining
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!canEarn}
          onClick={() => setOpen(true)}
        >
          Share Live
        </Button>
      </div>

      <ShareModal
        open={open}
        title="Share Live"
        link={LIVE_LINK}
        message={LIVE_MESSAGE}
        confirmLabel="I shared it"
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          if (!canEarn) return;
          setMsg(null);
          startTransition(async () => {
            try {
              const res = await logLiveShare(platform);
              if (!res.ok) {
                setMsg({ tone: "error", text: res.message });
                setTodayCount(res.todayCount);
                return;
              }
              setMsg({
                tone: "success",
                text: `🔗 Share logged (+1). ${res.todayCount}/${dailyCap} today.`,
              });
              setTodayCount(res.todayCount);
              setOpen(false);
            } catch (e) {
              setMsg({
                tone: "error",
                text: e instanceof Error ? e.message : "Share logging failed",
              });
            }
          });
        }}
      />

      <div className="space-y-2">
        <div className="text-xs font-semibold text-[color:var(--muted)]">Platform intent</div>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}
          className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="text-xs text-[color:var(--muted)]">
          Pick where you plan to share. Points are awarded only after you confirm.
        </div>
      </div>
    </div>
  );
};

const LINK_VISIT_ITEMS = [
  { type: "buy_coins", label: "💰 Buy Coins", url: "https://favorited.com/coins" },
  { type: "instagram", label: "📸 Instagram", url: "https://instagram.com/cannastreams" },
  { type: "tiktok", label: "🎵 TikTok", url: "https://tiktok.com/@cannastreams" },
  { type: "facebook", label: "📘 Facebook", url: "https://facebook.com/cannastreams" },
  { type: "x", label: "𝕏 X (Twitter)", url: "https://x.com/cannastreams" },
  { type: "youtube", label: "▶️ YouTube", url: "https://youtube.com/@cannastreams" },
  { type: "snapchat", label: "👻 Snapchat", url: "https://snapchat.com/t/fubxYw5n" },
] as const;

export type LinkVisitsChecklistProps = {
  initialVisited: string[];
  canEarn: boolean;
};

export const LinkVisitsChecklist: FC<LinkVisitsChecklistProps> = ({
  initialVisited,
  canEarn,
}) => {
  const [pending, startTransition] = useTransition();
  const [visited, setVisited] = useState<Set<string>>(new Set(initialVisited));
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const handleClick = (linkType: string, url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");

    if (!canEarn) return;
    if (visited.has(linkType)) return;

    setMsg(null);
    startTransition(async () => {
      try {
        const res = await logLinkVisit(linkType);
        if (res.ok) {
          setVisited((prev) => new Set([...prev, linkType]));
          if (!res.alreadyVisited) {
            setMsg({ tone: "success", text: res.message });
          }
        } else {
          setMsg({ tone: "error", text: res.message });
        }
      } catch (e) {
        setMsg({ tone: "error", text: e instanceof Error ? e.message : "Failed to log visit" });
      }
    });
  };

  const visitedCount = visited.size;
  const dailyCap = 7;

  return (
    <div className="space-y-3">
      <div className="text-sm text-[color:var(--muted)]">
        Visit links to earn points. Max {dailyCap}/day (1 per link).
      </div>
      <div className="text-xs text-[color:var(--muted)]">
        {visitedCount}/{dailyCap} visited today
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <div className="space-y-2">
        {LINK_VISIT_ITEMS.map((item) => {
          const done = visited.has(item.type);
          return (
            <button
              key={item.type}
              type="button"
              disabled={pending}
              onClick={() => handleClick(item.type, item.url)}
              className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left transition hover:bg-[rgba(255,255,255,0.05)]"
            >
              <span className="text-lg">{done ? "✅" : "☐"}</span>
              <span className="text-sm font-semibold">{item.label}</span>
              {done ? (
                <span className="ml-auto text-xs text-[color:var(--muted)]">+1</span>
              ) : (
                <span className="ml-auto text-xs text-[color:var(--muted)]">Click to visit</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
