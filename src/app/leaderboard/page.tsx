import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import {
  LeaderboardClient,
  type AwardRow,
  type LeaderboardRow,
  type PublicProfile,
} from "./ui";

export const runtime = "nodejs";

export default async function LeaderboardPage() {
  await requireUser();
  const sb = await supabaseServer();

  const { data, error } = await sb.rpc("cfm_leaderboard", { limit_n: 100 });
  const rows = (data ?? []) as LeaderboardRow[];

  const usernames = rows.map((r) => r.favorited_username).filter(Boolean);
  const { data: profiles } = usernames.length
    ? await sb
        .from("cfm_public_members")
        .select("favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
        .in("favorited_username", usernames)
    : { data: [] };

  const { data: awards } = await sb
    .from("cfm_awards")
    .select("id,user_id,award_type,week_start,week_end,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const typedProfiles = (profiles ?? []) as PublicProfile[];
  const typedAwards = (awards ?? []) as AwardRow[];

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🏆 Leaderboard</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Top members by points.
          </p>
          <div className="pt-2">
            <PointsExplainerButton />
          </div>
        </div>

        <Card>
          <LeaderboardClient
            rows={rows}
            errorMessage={error?.message ?? null}
            profiles={typedProfiles}
            awards={typedAwards}
          />
        </Card>
      </div>
    </Container>
  );
}
