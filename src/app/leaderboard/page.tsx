import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
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

  let giftRows: GiftLeaderboardRow[] = [];
  try {
    const { data: gifts } = await sb
      .from("cfm_post_gifts")
      .select("gifter_user_id,amount_cents,status")
      .eq("status", "paid")
      .not("gifter_user_id", "is", null)
      .limit(5000);

    const totals = new Map<string, number>();
    for (const g of (gifts ?? []) as any[]) {
      const uid = String(g?.gifter_user_id ?? "").trim();
      const cents = Number(g?.amount_cents ?? 0);
      if (!uid || !Number.isFinite(cents) || cents <= 0) continue;
      totals.set(uid, (totals.get(uid) ?? 0) + cents);
    }

    if (totals.size) {
      const userIds = Array.from(totals.keys());
      const { data: gifterProfiles } = await sb
        .from("cfm_public_member_ids")
        .select("user_id,favorited_username")
        .in("user_id", userIds)
        .limit(2000);

      const nameById = new Map<string, string>();
      for (const p of (gifterProfiles ?? []) as any[]) {
        const uid = String(p?.user_id ?? "").trim();
        const uname = String(p?.favorited_username ?? "").trim();
        if (!uid || !uname) continue;
        nameById.set(uid, uname);
      }

      giftRows = userIds
        .map((uid) => ({
          user_id: uid,
          favorited_username: nameById.get(uid) ?? "Member",
          total_cents: totals.get(uid) ?? 0,
        }))
        .sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0))
        .slice(0, 100);
    }
  } catch {
    giftRows = [];
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
            <PointsExplainerButton />
          </div>
        </div>

        <Card>
          <LeaderboardClient
            rows={rows}
            giftRows={giftRows}
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
