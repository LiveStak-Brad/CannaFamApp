import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { MembersClient } from "./ui";
import type { RoleType } from "@/components/ui/role-badge";

export const runtime = "nodejs";

export default async function MembersPage() {
  const user = await requireUser();
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("cfm_public_member_ids")
    .select("user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link,lifetime_gifted_total_usd")
    .order("favorited_username", { ascending: true });

  const { data: awards } = await sb
    .from("cfm_awards")
    .select("id,user_id,award_type,week_start,week_end,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: admins } = await sb
    .from("cfm_admins")
    .select("user_id,role");
  const roleByUserId: Record<string, RoleType> = {};
  for (const a of (admins ?? []) as any[]) {
    const uid = String(a?.user_id ?? "").trim();
    const role = String(a?.role ?? "").trim();
    if (uid && (role === "owner" || role === "admin" || role === "moderator")) {
      roleByUserId[uid] = role as RoleType;
    }
  }

  let leaderboard: any[] = [];
  try {
    const { data: lb } = await sb.rpc("cfm_leaderboard", { limit_n: 500 });
    leaderboard = (lb ?? []) as any[];
  } catch {
    leaderboard = [];
  }

  if (error) {
    return (
      <Container>
        <Card title="Members">
          <div className="text-sm text-red-200">{error.message}</div>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">👥 Members</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Approved CFM members.
          </p>
        </div>

        <MembersClient
          members={(data ?? []) as any}
          awards={(awards ?? []) as any}
          leaderboard={(leaderboard ?? []) as any}
          myUserId={user.id}
          roleByUserId={roleByUserId}
        />
      </div>
    </Container>
  );
}
