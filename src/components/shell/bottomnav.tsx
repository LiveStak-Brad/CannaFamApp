"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSessionState = "guest" | "unapproved" | "member" | "admin";

type NavItem = {
  href: string;
  label: string;
  requiresAuth?: boolean;
  requiresApproval?: boolean;
  adminOnly?: boolean;
};

const ALL_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/members", label: "Members" },
  { href: "/feed", label: "Feed" },
  { href: "/support", label: "Support" },
  { href: "/hub", label: "Hub" },
  {
    href: "/leaderboard",
    label: "Leaderboard",
  },
  { href: "/awards", label: "Awards" },
  { href: "/admin", label: "Admin", requiresAuth: true, adminOnly: true },
  { href: "/login", label: "Login" },
  { href: "/signup", label: "Sign up" },
];

function shouldShow(item: NavItem, state: NavSessionState) {
  if (state === "guest") {
    return [
      "/",
      "/members",
      "/feed",
      "/support",
      "/leaderboard",
      "/awards",
      "/hub",
      "/login",
      "/signup",
    ].includes(
      item.href,
    );
  }

  if (item.href === "/login") return false;
  if (item.href === "/signup") return false;
  if (item.adminOnly) return state === "admin";
  if (item.requiresApproval) return state === "member" || state === "admin";
  return true;
}

export function BottomNav({
  state,
  anonymousGiftTotalCents,
}: {
  state: NavSessionState;
  anonymousGiftTotalCents?: number;
}) {
  const pathname = usePathname();

  const items = ALL_ITEMS.filter((i) => shouldShow(i, state));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-[color:var(--card)] backdrop-blur">
      <div className="mx-auto w-full max-w-xl px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="flex items-stretch gap-1 overflow-x-auto overscroll-x-contain touch-pan-x snap-x snap-mandatory [-webkit-overflow-scrolling:touch]">
          {items.map((item) => {
            const active = pathname === item.href;
            const cls =
              "min-w-[76px] shrink-0 snap-start rounded-xl px-3 py-2 text-center text-[11px] font-semibold transition sm:min-w-[92px] sm:text-xs" +
              (active
                ? " bg-[color:var(--accent)] text-white shadow-[0_0_0_1px_var(--accent-2)]"
                : " text-[color:var(--foreground)] hover:text-[color:var(--accent)] hover:bg-[color:var(--border)]");

            return (
              <Link key={item.href} href={item.href} className={cls}>
                {item.label}
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
