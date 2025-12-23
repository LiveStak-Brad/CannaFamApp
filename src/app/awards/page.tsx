import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type WeeklyAwardResultRow = {
  id: string;
  week_start: string;
  award_key: string;
  user_id: string;
  score: number;
  breakdown: any;
  created_at: string;
};

type PublicMemberIdRow = {
  user_id: string;
  favorited_username: string;
  photo_url: string | null;
  bio: string | null;
  lifetime_gifted_total_usd?: number | null;
};

const AWARDS: Array<{ key: string; label: string }> = [
  { key: "mvp", label: "🏆 MVP" },
  { key: "top_supporter", label: "💎 Top Supporter" },
  { key: "top_sniper", label: "🎯 Top Sniper" },
  { key: "rookie", label: "🌱 Rookie of the Week" },
  { key: "chatterbox", label: "💬 Chatterbox" },
  { key: "hype_machine", label: "📣 Hype Machine" },
  { key: "streak_champion", label: "🔥 Streak Champion" },
];

export default async function AwardsPage() {
  const sb = await supabaseServer();

  const { data: latest } = await sb
    .from("weekly_awards_results")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestWeekStart = String((latest as any)?.week_start ?? "").trim();

  const { data: rows } = latestWeekStart
    ? await sb
        .from("weekly_awards_results")
        .select("id,week_start,award_key,user_id,score,breakdown,created_at")
        .eq("week_start", latestWeekStart)
        .order("award_key", { ascending: true })
        .limit(200)
    : { data: [] as any[] };

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

  const byAwardKey = new Map<string, WeeklyAwardResultRow>();
  for (const r of (rows ?? []) as WeeklyAwardResultRow[]) {
    const k = String((r as any)?.award_key ?? "").trim();
    if (!k) continue;
    byAwardKey.set(k, r);
  }

  return (
    <Container>
      <div className="space-y-2">
        <h1 className="text-base font-semibold">🏅 Weekly Awards</h1>

        <Card>
          <div className="space-y-1.5">
            {AWARDS.map((a) => {
              const win = byAwardKey.get(a.key) ?? null;
              const profile = win ? publicByUserId.get(win.user_id) ?? null : null;

              return (
                <div
                  key={a.key}
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
                    <div className="text-sm font-bold leading-tight">{a.label}</div>
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
