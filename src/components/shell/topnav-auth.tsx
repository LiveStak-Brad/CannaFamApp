import { getAuthedUserOrNull } from "@/lib/auth";
import { logout } from "@/app/logout/actions";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase/server";

export async function TopNavAuth() {
  const user = await getAuthedUserOrNull();

  if (!user) {
    return (
      <Button as="link" href="/login" variant="secondary">
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
    <div className="flex items-center gap-2">
      {isAdmin ? (
        <Button as="link" href="/admin" variant="secondary">
          Admin
        </Button>
      ) : null}
      <Button as="link" href="/noties" variant="secondary">
        <span className="inline-flex items-center gap-2">
          <span>Noties 🔔</span>
          {unread > 0 ? (
            <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[rgba(209,31,42,0.9)] px-2 py-[1px] text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
      </Button>
      <Button as="link" href="/account" variant="secondary">
        Account
      </Button>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          Logout
        </Button>
      </form>
    </div>
  );
}
