import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull, requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { AdminActions } from "./ui";

export const runtime = "nodejs";

export default async function AdminPage() {
  await requireAdmin();
  const sb = await supabaseServer();

  const user = await getAuthedUserOrNull();
  const { data: myAdminRow } = user
    ? await sb.from("cfm_admins").select("role").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const isOwner = String((myAdminRow as any)?.role ?? "") === "owner";

  const { data: apps, error: appsErr } = await sb
    .from("cfm_applications")
    .select("id,favorited_username,email,photo_url,bio,wants_banner,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: members, error: membersErr } = await sb
    .from("cfm_members")
    .select("id,user_id,favorited_username,photo_url,bio,points,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: posts, error: postsErr } = await sb
    .from("cfm_feed_posts")
    .select("id,title,post_type,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: admins, error: adminsErr } = await sb
    .from("cfm_admins")
    .select("user_id,role,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const adminUserIds = Array.from(new Set((admins ?? []).map((a: any) => String(a.user_id))));
  const { data: adminMembers } = adminUserIds.length
    ? await sb
        .from("cfm_members")
        .select("user_id,favorited_username")
        .in("user_id", adminUserIds)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🛠️ Admin</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Application review, member management, feed posts, and awards.
          </p>
        </div>

        {appsErr ? (
          <Card title="Applications error">
            <div className="text-sm text-red-200">{appsErr.message}</div>
          </Card>
        ) : null}
        {membersErr ? (
          <Card title="Members error">
            <div className="text-sm text-red-200">{membersErr.message}</div>
          </Card>
        ) : null}
        {postsErr ? (
          <Card title="Feed error">
            <div className="text-sm text-red-200">{postsErr.message}</div>
          </Card>
        ) : null}

        {adminsErr ? (
          <Card title="Admins error">
            <div className="text-sm text-red-200">{adminsErr.message}</div>
          </Card>
        ) : null}

        <AdminActions
          apps={apps ?? []}
          members={members ?? []}
          posts={posts ?? []}
          admins={(admins ?? []) as any}
          adminMembers={(adminMembers ?? []) as any}
          isOwner={isOwner}
        />
      </div>
    </Container>
  );
}
