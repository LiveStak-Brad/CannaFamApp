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
  { href: "/apply", label: "Apply" },
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
];

function shouldShow(item: NavItem, state: NavSessionState) {
  if (state === "guest") {
    return [
      "/",
      "/apply",
      "/members",
      "/feed",
      "/support",
      "/leaderboard",
      "/awards",
      "/hub",
      "/login",
    ].includes(
      item.href,
    );
  }

  if (item.href === "/login") return false;
  if (item.href === "/apply") return false;
  if (item.adminOnly) return state === "admin";
  if (item.requiresApproval) return state === "member" || state === "admin";
  return true;
}

export function BottomNav({
  state,
}: {
  state: NavSessionState;
}) {
  const pathname = usePathname();

  const items = ALL_ITEMS.filter((i) => shouldShow(i, state));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-[rgba(7,10,8,0.90)] backdrop-blur">
      <div className="mx-auto w-full max-w-xl px-2 py-2">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {items.map((item) => {
            const active = pathname === item.href;
            const cls =
              "min-w-[92px] shrink-0 rounded-xl px-3 py-2 text-center text-xs font-semibold transition" +
              (active
                ? " bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                : " text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-[rgba(255,255,255,0.04)]");

            return (
              <Link key={item.href} href={item.href} className={cls}>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
