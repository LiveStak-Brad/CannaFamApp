import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { MembersClient } from "./ui";

export const runtime = "nodejs";

export default async function MembersPage() {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("cfm_public_members")
    .select("id,favorited_username,photo_url,bio")
    .order("created_at", { ascending: true });

  const { data: awards } = await sb
    .from("cfm_awards")
    .select("id,user_id,award_type,week_start,week_end,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

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
        />
      </div>
    </Container>
  );
}
