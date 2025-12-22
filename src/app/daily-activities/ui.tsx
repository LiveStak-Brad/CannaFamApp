"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { logLinkVisit, logLiveShare } from "@/app/support/actions";
import { Button } from "@/components/ui/button";

const APP_SHARE_URL = "https://cannafamapp.com/mobile";

const LINK_ITEMS = [
  { type: "instagram", icon: "📸", label: "Instagram @cannafamapp", url: "https://instagram.com/cannafamapp" },
  { type: "facebook", icon: "📘", label: "Facebook", url: "https://facebook.com/cannastreamsstl" },
  { type: "tiktok", icon: "🎵", label: "TikTok", url: "https://tiktok.com/@cannastreams" },
  { type: "youtube", icon: "▶️", label: "YouTube", url: "https://www.youtube.com/bradmorris" },
  { type: "x", icon: "𝕏", label: "X (Twitter)", url: "https://x.com/cannastreams_x" },
  { type: "snapchat", icon: "👻", label: "Snapchat", url: "https://snapchat.com/t/fubxYw5n" },
];

const SHARE_PLATFORMS = ["Facebook", "Instagram", "TikTok", "X", "Discord", "Other"] as const;

type DailyActivitiesLinksProps = {
  initialVisited: string[];
  discordJoined: boolean;
  canEarn: boolean;
};

export function DailyActivitiesLinks({ initialVisited, discordJoined, canEarn }: DailyActivitiesLinksProps) {
  const [pending, startTransition] = useTransition();
  const [visited, setVisited] = useState<Set<string>>(new Set(initialVisited));
  const [joinedDiscord, setJoinedDiscord] = useState(discordJoined);

  const visitedCount = visited.size;

  const handleLinkClick = (linkType: string, url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");

    if (!canEarn) return;
    if (visited.has(linkType)) return;

    startTransition(async () => {
      try {
        const res = await logLinkVisit(linkType);
        if (res.ok) {
          setVisited((prev) => new Set([...prev, linkType]));
        }
      } catch {
        // silently fail
      }
    });
  };

  const handleDiscordClick = () => {
    window.open("http://cannadiscord.com", "_blank", "noopener,noreferrer");

    if (!canEarn) return;
    if (joinedDiscord) return;

    startTransition(async () => {
      try {
        const res = await logLinkVisit("discord");
        if (res.ok) {
          setJoinedDiscord(true);
        }
      } catch {
        // silently fail
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-[color:var(--muted)]">
        {visitedCount}/6 visited today (+1 point each)
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Link
          href="/hostlive"
          className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(209,31,42,0.15)] px-4 py-3 text-sm font-semibold transition hover:bg-[rgba(209,31,42,0.25)]"
        >
          <span className="text-lg">🔴</span>
          <span className="flex-1">Watch Live</span>
        </Link>

        <button
          type="button"
          disabled={pending}
          onClick={handleDiscordClick}
          className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(88,101,242,0.15)] px-4 py-3 text-left text-sm font-semibold transition hover:bg-[rgba(88,101,242,0.25)]"
        >
          <span className="text-lg">💬</span>
          <span className="flex-1">Join Discord</span>
          {canEarn && !joinedDiscord ? (
            <span className="text-xs text-[color:var(--muted)]">+1 (one-time)</span>
          ) : joinedDiscord ? (
            <span className="text-xs text-[color:var(--muted)]">✅ Joined</span>
          ) : null}
        </button>

        {LINK_ITEMS.map((item) => {
          const done = visited.has(item.type);
          return (
            <button
              key={item.type}
              type="button"
              disabled={pending}
              onClick={() => handleLinkClick(item.type, item.url)}
              className={`flex items-center gap-3 rounded-xl border border-[color:var(--border)] px-4 py-3 text-left text-sm font-semibold transition hover:bg-[rgba(255,255,255,0.05)] ${
                done ? "bg-[rgba(255,255,255,0.02)] opacity-70" : "bg-[color:var(--card)]"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {canEarn ? (
                done ? (
                  <span className="text-xs">✅</span>
                ) : (
                  <span className="text-xs text-[color:var(--muted)]">+1</span>
                )
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DailyActivitiesShareProps = {
  initialShareCount: number;
  canEarn: boolean;
};

export function DailyActivitiesShare({ initialShareCount, canEarn }: DailyActivitiesShareProps) {
  const [pending, startTransition] = useTransition();
  const [shareCount, setShareCount] = useState(initialShareCount);
  const [platform, setPlatform] = useState<typeof SHARE_PLATFORMS[number]>("Facebook");
  const [message, setMessage] = useState<string | null>(null);

  const remaining = Math.max(0, 5 - shareCount);

  const handleShare = async () => {
    if (!canEarn || shareCount >= 5) return;

    setMessage(null);

    const shareText = `Join CannaFam — the official supporters community for CannaStreams! ${APP_SHARE_URL}`;

    try {
      const nav = (globalThis as any).navigator as any | undefined;
      if (nav?.share) {
        await nav.share({
          title: "CannaFam",
          text: shareText,
          url: APP_SHARE_URL,
        });
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(shareText);
        setMessage("Copied to clipboard! Paste and share.");
      }
    } catch {
      // User cancelled or error
    }

    startTransition(async () => {
      try {
        const res = await logLiveShare(platform);
        if (res.ok) {
          setShareCount((prev) => Math.min(5, prev + 1));
          setMessage(`🔗 Share logged (+1). ${shareCount + 1}/5 today.`);
        } else {
          setMessage(res.message || "Share logging failed");
        }
      } catch {
        setMessage("Share logging failed");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-[color:var(--muted)]">
        Earn points for sharing. Max 5/day.
      </div>

      {message ? (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3 text-xs text-[color:var(--muted)]">
          {message}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Today</div>
          <div className="text-xs text-[color:var(--muted)]">
            {shareCount} share(s) logged • {remaining} remaining
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={pending || shareCount >= 5}
          onClick={handleShare}
        >
          {pending ? "Sharing..." : "Share"}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-[color:var(--muted)]">Platform intent</div>
        <div className="flex flex-wrap gap-2">
          {SHARE_PLATFORMS.map((p) => {
            const active = platform === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)]"
                    : "border-[color:var(--border)] bg-transparent text-[color:var(--muted)] hover:bg-[color:var(--card)]"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
