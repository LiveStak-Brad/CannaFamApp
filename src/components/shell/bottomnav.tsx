"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSessionState = "guest" | "unapproved" | "member" | "admin";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/feed", label: "Feed", icon: "🔥" },
  { href: "/live", label: "Live", icon: "▶️" },
  { href: "/awards", label: "Awards", icon: "🎖️" },
  { href: "/support", label: "Support", icon: "🔗" },
];

export function BottomNav({
  state,
  anonymousGiftTotalCents,
}: {
  state: NavSessionState;
  anonymousGiftTotalCents?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--card)] backdrop-blur">
      <div className="mx-auto w-full max-w-xl px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="flex items-stretch justify-around gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const cls =
              "flex flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition min-w-[56px]" +
              (active
                ? " bg-[color:var(--accent)] text-white"
                : " text-[color:var(--foreground)] hover:text-[color:var(--accent)] hover:bg-[color:var(--border)]");

            return (
              <Link key={item.href} href={item.href} className={cls}>
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {typeof anonymousGiftTotalCents === "number" && anonymousGiftTotalCents > 0 ? (
          <div className="mt-2 text-center text-[11px] text-[color:var(--muted)]">
            Anonymous gifted: ${(anonymousGiftTotalCents / 100).toFixed(2)}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
