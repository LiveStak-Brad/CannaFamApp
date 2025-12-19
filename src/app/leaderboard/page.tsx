import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import {
  LeaderboardClient,
  type AwardRow,
  type GiftLeaderboardRow,
  type LeaderboardRow,
  type PublicProfile,
} from "./ui";

export const runtime = "nodejs";

export default async function LeaderboardPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { data, error } = await sb.rpc("cfm_leaderboard", { limit_n: 100 });
  const rows = (data ?? []) as LeaderboardRow[];

  const usernames = rows.map((r) => r.favorited_username).filter(Boolean);
  const { data: profiles } = usernames.length
    ? await sb
        .from("cfm_public_members")
        .select(
          "favorited_username,photo_url,lifetime_gifted_total_usd,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link",
        )
        .in("favorited_username", usernames)
    : { data: [] };

  const { data: awards } = await sb
    .from("cfm_awards")
    .select("id,user_id,award_type,week_start,week_end,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const typedProfiles = (profiles ?? []) as PublicProfile[];
  const typedAwards = (awards ?? []) as AwardRow[];

  // Use cfm_top_gifters RPC for consistent gift leaderboard data
  let giftRowsToday: GiftLeaderboardRow[] = [];
  let giftRowsWeekly: GiftLeaderboardRow[] = [];
  let giftRowsAllTime: GiftLeaderboardRow[] = [];

  try {
    const [{ data: d1 }, { data: d2 }, { data: d3 }] = await Promise.all([
      sb.rpc("cfm_top_gifters", { period: "today" }),
      sb.rpc("cfm_top_gifters", { period: "weekly" }),
      sb.rpc("cfm_top_gifters", { period: "all_time" }),
    ]);

    const mapRows = (data: any[]): GiftLeaderboardRow[] =>
      (data ?? []).map((r: any) => ({
        user_id: String(r.profile_id ?? ""),
        favorited_username: String(r.display_name ?? "Member"),
        total_cents: Math.round(Number(r.total_amount ?? 0) * 100),
        photo_url: r.avatar_url ?? null,
        rank: Number(r.rank ?? 0),
      }));

    giftRowsToday = mapRows(d1 as any[]);
    giftRowsWeekly = mapRows(d2 as any[]);
    giftRowsAllTime = mapRows(d3 as any[]);
  } catch {
    giftRowsToday = [];
    giftRowsWeekly = [];
    giftRowsAllTime = [];
  }

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🏆 Leaderboard</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Top members by points.
          </p>
          <div className="pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <PointsExplainerButton />
              <Link
                href="/gifter-levels"
                className="text-xs font-semibold underline underline-offset-4 text-[color:var(--muted)]"
              >
                Gifter Levels
              </Link>
            </div>
          </div>
        </div>

        <Card>
          <LeaderboardClient
            rows={rows}
            giftRowsToday={giftRowsToday}
            giftRowsWeekly={giftRowsWeekly}
            giftRowsAllTime={giftRowsAllTime}
            errorMessage={error?.message ?? null}
            profiles={typedProfiles}
            awards={typedAwards}
            myUserId={user.id}
          />
        </Card>
      </div>
    </Container>
  );
}
