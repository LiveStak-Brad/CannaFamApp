import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AwardRow = {
  id: string;
  user_id: string;
  award_type: string | null;
  week_start: string | null;
  week_end: string | null;
  notes: string | null;
  created_at: string | null;
};

type PublicMemberIdRow = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  lifetime_gifted_total_usd?: number | null;
};

const CATEGORIES = [
  "🏆 MVP",
  "🌱 Rookie",
  "🎯 Top Sniper",
  "💎 Top Supporter",
  "📣 Most Shares",
  "🔥 Most Consistent",
];

export default async function AwardsPage() {
  await requireUser();
  const sb = await supabaseServer();

  const { data: awards } = await sb
    .from("cfm_awards")
    .select("id,user_id,award_type,week_start,week_end,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  let publicByUserId = new Map<string, PublicMemberIdRow>();
  try {
    const { data: publicMembers } = await sb
      // This view does not exist yet in some DBs; it is intended for Phase 7 SQL.
      .from("cfm_public_member_ids")
      .select("user_id,favorited_username,photo_url,bio,lifetime_gifted_total_usd")
      .limit(2000);

    for (const m of (publicMembers ?? []) as any[]) {
      if (!m?.user_id) continue;
      publicByUserId.set(String(m.user_id), {
        user_id: String(m.user_id),
        favorited_username: String(m.favorited_username ?? ""),
        photo_url: (m.photo_url ?? null) as string | null,
        bio: (m.bio ?? null) as string | null,
        lifetime_gifted_total_usd:
          typeof m.lifetime_gifted_total_usd === "number" ? (m.lifetime_gifted_total_usd as number) : null,
      });
    }
  } catch {
    publicByUserId = new Map();
  }

  const latestByType = new Map<string, AwardRow>();
  for (const a of (awards ?? []) as AwardRow[]) {
    const t = String(a.award_type ?? "").trim();
    if (!t) continue;
    const prev = latestByType.get(t);
    if (!prev) {
      latestByType.set(t, a);
      continue;
    }
    const aTime = a.created_at ?? "";
    const pTime = prev.created_at ?? "";
    if (aTime > pTime) latestByType.set(t, a);
  }

  return (
    <Container>
      <div className="space-y-2">
        <h1 className="text-base font-semibold">🏅 Weekly Awards</h1>

        <Card>
          <div className="space-y-1.5">
            {CATEGORIES.map((cat) => {
              const win = latestByType.get(cat) ?? null;
              const profile = win ? publicByUserId.get(win.user_id) ?? null : null;

              return (
                <div
                  key={cat}
                  className="flex items-center gap-2.5 rounded-lg border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2"
                >
                  <div className="shrink-0">
                    <GifterRingAvatar
                      size={36}
                      imageUrl={profile?.photo_url ?? null}
                      name={profile?.favorited_username ?? (win ? "Winner" : "You")}
                      totalUsd={
                        typeof profile?.lifetime_gifted_total_usd === "number" ? profile.lifetime_gifted_total_usd : null
                      }
                      showDiamondShimmer
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-tight">{cat}</div>
                    <div className="truncate text-xs text-[color:var(--muted)]">
                      {profile ? profile.favorited_username : win ? "Winner selected" : "Compete to win!"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </Container>
  );
}
