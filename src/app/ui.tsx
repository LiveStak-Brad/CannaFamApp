"use client";

import { useState, useTransition } from "react";
import { logLinkVisit } from "@/app/support/actions";
const HOME_LINK_ITEMS = [
  { type: "buy_coins", label: "💰 Buy Coins", url: "https://favorited.com/coins" },
  { type: "instagram", label: "📸 Instagram", url: "https://instagram.com/cannastreams_official" },
  { type: "facebook", label: "📘 Facebook", url: "https://facebook.com/cannastreamsstl" },
  { type: "tiktok", label: "🎵 TikTok", url: "https://tiktok.com/@cannastreams" },
  { type: "youtube", label: "▶️ YouTube", url: "https://www.youtube.com/bradmorris" },
  { type: "x", label: "𝕏 X (Twitter)", url: "https://x.com/cannastreams_x" },
  { type: "snapchat", label: "👻 Snapchat", url: "https://snapchat.com/t/fubxYw5n" },
] as const;

export type HomeLinkVisitsProps = {
  initialVisited: string[];
  discordJoined: boolean;
  canEarn: boolean;
};

export function HomeLinkVisits({ initialVisited, discordJoined, canEarn }: HomeLinkVisitsProps) {
  const [pending, startTransition] = useTransition();
  const [visited, setVisited] = useState<Set<string>>(new Set(initialVisited));
  const [joinedDiscord, setJoinedDiscord] = useState(discordJoined);

  const handleClick = (linkType: string, url: string) => {
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
        // silently fail for home page
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

  const visitedCount = visited.size;

  return (
    <div className="space-y-3">
      {canEarn ? (
        <div className="text-xs text-[color:var(--muted)]">
          {visitedCount}/7 visited today (+1 point each)
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2">
        <a
          href="https://fav.gg/@cannastreams"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[rgba(209,31,42,0.15)] px-4 py-3 text-sm font-semibold transition hover:bg-[rgba(209,31,42,0.25)]"
        >
          🔴 Watch Live
        </a>

        <button
          type="button"
          disabled={pending}
          onClick={handleDiscordClick}
          className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(88,101,242,0.15)] px-4 py-3 text-left text-sm font-semibold transition hover:bg-[rgba(88,101,242,0.25)]"
        >
          <span className="flex-1">💬 Join Discord</span>
          {canEarn && !joinedDiscord ? (
            <span className="text-xs text-[color:var(--muted)]">+1 (one-time)</span>
          ) : joinedDiscord ? (
            <span className="text-xs text-[color:var(--muted)]">✅ Joined</span>
          ) : null}
        </button>

        {HOME_LINK_ITEMS.map((item) => {
          const done = visited.has(item.type);
          return (
            <button
              key={item.type}
              type="button"
              disabled={pending}
              onClick={() => handleClick(item.type, item.url)}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left text-sm font-semibold transition hover:bg-[rgba(255,255,255,0.05)]"
            >
              <span className="text-base">{done ? "✅" : "☐"}</span>
              <span className="flex-1">{item.label}</span>
              {canEarn && !done ? (
                <span className="text-xs text-[color:var(--muted)]">+1</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
