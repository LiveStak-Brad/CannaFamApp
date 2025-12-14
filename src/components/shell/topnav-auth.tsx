import Link from "next/link";
import { getAuthedUserOrNull } from "@/lib/auth";
import { logout } from "@/app/logout/actions";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase/server";

export async function TopNavAuth() {
  const user = await getAuthedUserOrNull();

  const navBtnClass = "px-2 py-1.5 text-xs sm:px-4 sm:py-3 sm:text-sm";
  const mobileMenuBtnClass =
    "inline-flex items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold transition active:translate-y-[1px] bg-[color:var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:border-[rgba(209,31,42,0.45)]";
  const mobileMenuItemClass =
    "block w-full rounded-lg px-3 py-2 text-sm font-semibold text-[color:var(--foreground)] hover:bg-[rgba(255,255,255,0.04)]";

  if (!user) {
    return (
      <Button
        as="link"
        href="/login"
        variant="secondary"
        className={navBtnClass}
      >
        Login
      </Button>
    );
  }

  const sb = await supabaseServer();
  const { data: adminRow } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = !!adminRow?.role;

  let unread = 0;
  try {
    const { count } = await sb
      .from("cfm_noties")
      .select("id", { count: "exact", head: true })
      .eq("member_id", user.id)
      .eq("is_read", false);
    unread = count ?? 0;
  } catch {
    unread = 0;
  }

  return (
    <>
      <div className="hidden max-w-full flex-wrap items-center justify-end gap-1 sm:flex sm:gap-2">
        {isAdmin ? (
          <Button
            as="link"
            href="/admin"
            variant="secondary"
            className={navBtnClass}
          >
            Admin
          </Button>
        ) : null}
        <Button
          as="link"
          href="/noties"
          variant="secondary"
          className={navBtnClass}
        >
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span>Noties</span>
            <span aria-hidden>🔔</span>
            {unread > 0 ? (
              <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[rgba(209,31,42,0.9)] px-2 py-[1px] text-[11px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
        </Button>
        <Button
          as="link"
          href="/account"
          variant="secondary"
          className={navBtnClass}
        >
          Account
        </Button>
        <form action={logout}>
          <Button type="submit" variant="secondary" className={navBtnClass}>
            Logout
          </Button>
        </form>
      </div>

      <div className="flex items-center sm:hidden">
        <details className="relative">
          <summary
            aria-label="Open menu"
            className={
              mobileMenuBtnClass +
              " list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden"
            }
          >
            <span className="inline-flex items-center gap-2">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
              <span>Menu</span>
            </span>
          </summary>
          <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[color:var(--border)] bg-[rgba(7,10,8,0.95)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            {isAdmin ? (
              <Link href="/admin" className={mobileMenuItemClass}>
                Admin
              </Link>
            ) : null}
            <Link href="/noties" className={mobileMenuItemClass}>
              <span className="inline-flex w-full items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden>🔔</span>
                  <span>Noties</span>
                </span>
                {unread > 0 ? (
                  <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[rgba(209,31,42,0.9)] px-2 py-[1px] text-[11px] font-semibold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </span>
            </Link>
            <Link href="/account" className={mobileMenuItemClass}>
              Account
            </Link>
            <form action={logout}>
              <button type="submit" className={mobileMenuItemClass + " text-left"}>
                Logout
              </button>
            </form>
          </div>
        </details>
      </div>
    </>
  );
}
