"use client";

import { useState, useTransition } from "react";
import { logLinkVisit } from "@/app/support/actions";

type LinkItem = {
  type: string;
  icon: string;
  label: string;
  description: string;
  url: string;
};

type LinksClientProps = {
  links: LinkItem[];
  initialVisited: string[];
  canEarn: boolean;
};

export function LinksClient({ links, initialVisited, canEarn }: LinksClientProps) {
  const [pending, startTransition] = useTransition();
  const [visited, setVisited] = useState<Set<string>>(new Set(initialVisited));

  const handleClick = (link: LinkItem) => {
    window.open(link.url, "_blank", "noopener,noreferrer");

    if (!canEarn) return;
    if (visited.has(link.type)) return;

    startTransition(async () => {
      try {
        const res = await logLinkVisit(link.type);
        if (res.ok) {
          setVisited((prev) => new Set([...prev, link.type]));
        }
      } catch {
        // silently fail
      }
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {links.map((link) => {
        const done = visited.has(link.type);
        return (
          <button
            key={link.type}
            type="button"
            disabled={pending}
            onClick={() => handleClick(link)}
            className={`flex items-center gap-4 rounded-xl border border-[color:var(--border)] px-4 py-4 text-left transition hover:bg-[rgba(255,255,255,0.05)] ${
              done ? "bg-[rgba(255,255,255,0.02)] opacity-80" : "bg-[color:var(--card)]"
            }`}
          >
            <span className="text-2xl">{link.icon}</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[color:var(--foreground)]">
                {link.label}
              </div>
              <div className="text-xs text-[color:var(--muted)]">{link.description}</div>
            </div>
            {canEarn ? (
              <div className="min-w-[32px] text-right">
                {done ? (
                  <span className="text-base">✅</span>
                ) : (
                  <span className="text-xs font-semibold text-[color:var(--muted)]">+1</span>
                )}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
