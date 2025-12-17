import Link from "next/link";
import { getAuthedUserOrNull } from "@/lib/auth";
import { logout } from "@/app/logout/actions";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase/server";
import { NotiesNavButton } from "@/components/shell/noties-nav-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export async function TopNavAuth() {
  const user = await getAuthedUserOrNull();

  const sb = await supabaseServer();
  let isLive = false;
  try {
    const { data } = await sb.rpc("cfm_get_live_state");
    isLive = !!(data as any)?.is_live;
  } catch {
    isLive = false;
  }

  const navBtnClass = "px-2 py-1.5 text-xs sm:px-4 sm:py-3 sm:text-sm";
  const mobileMenuBtnClass =
    "inline-flex items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold transition active:translate-y-[1px] bg-[color:var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:border-[color:var(--accent)]";
  const mobileMenuItemClass =
    "block w-full rounded-lg px-3 py-2 text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--border)]";

  const liveBtnClass =
    "rounded-full bg-gradient-to-r from-[color:var(--gradient-start)] to-[color:var(--gradient-end)] px-3 py-1.5 text-xs font-semibold text-white shadow-none hover:opacity-90 border border-[color:var(--accent)]/40";

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {isLive ? (
          <Button as="link" href="/live" className={liveBtnClass}>
            LIVE
          </Button>
        ) : null}
        <Button as="link" href="/login" variant="secondary" className={navBtnClass}>
          Login
        </Button>
        <Button as="link" href="/signup" variant="secondary" className={navBtnClass}>
          Sign up
        </Button>
      </div>
    );
  }

  const { data: adminRow } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = !!adminRow?.role;

  let unread = 0;
  try {
    const { count, error } = await sb
      .from("cfm_noties")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${user.id},member_id.eq.${user.id}`)
      .eq("is_read", false);
    if (error) console.error("Failed to load unread noties", error.message);
    unread = count ?? 0;
  } catch {
    unread = 0;
  }

  return (
    <>
      <div className="hidden max-w-full flex-wrap items-center justify-end gap-1 sm:flex sm:gap-2">
        {isLive ? (
          <Button as="link" href="/live" className={liveBtnClass}>
            LIVE
          </Button>
        ) : null}
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
        <NotiesNavButton userId={user.id} initialUnread={unread} className={navBtnClass} mode="desktop" />
        <ThemeToggle />
        
        <details className="relative">
          <summary
            aria-label="Open menu"
            className={
              "inline-flex items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-xs sm:px-4 sm:py-3 sm:text-sm font-semibold transition active:translate-y-[1px] bg-[color:var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] hover:border-[color:var(--accent)] list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden"
            }
          >
            <span>Account</span>
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </summary>
          <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-solid)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] z-50">
            <Link href="/account" className={mobileMenuItemClass}>
              Account
            </Link>
            <Link href="/me" className={mobileMenuItemClass}>
              Edit Profile
            </Link>
            <div className="my-1 border-t border-[color:var(--border)]" />
            <Link href="/terms" className={mobileMenuItemClass}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={mobileMenuItemClass}>
              Privacy Policy
            </Link>
            <Link href="/safety" className={mobileMenuItemClass}>
              Community Guidelines
            </Link>
            <div className="my-1 border-t border-[color:var(--border)]" />
            <form action={logout}>
              <button type="submit" className={mobileMenuItemClass + " text-left"}>
                Logout
              </button>
            </form>
          </div>
        </details>
      </div>

      <div className="flex items-center gap-2 sm:hidden">
        {isLive ? (
          <Button as="link" href="/live" className={liveBtnClass}>
            LIVE
          </Button>
        ) : null}
        <NotiesNavButton
          userId={user.id}
          initialUnread={unread}
          className={navBtnClass}
          mode="mobile"
        />

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
          <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[color:var(--border)] bg-[color:var(--card-solid)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            {isAdmin ? (
              <Link href="/admin" className={mobileMenuItemClass}>
                Admin
              </Link>
            ) : null}
            <Link href="/account" className={mobileMenuItemClass}>
              Account
            </Link>
            <Link href="/me" className={mobileMenuItemClass}>
              Edit Profile
            </Link>
            <div className="my-1 border-t border-[color:var(--border)]" />
            <Link href="/terms" className={mobileMenuItemClass}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={mobileMenuItemClass}>
              Privacy Policy
            </Link>
            <Link href="/safety" className={mobileMenuItemClass}>
              Community Guidelines
            </Link>
            <div className="my-1 border-t border-[color:var(--border)]" />
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
