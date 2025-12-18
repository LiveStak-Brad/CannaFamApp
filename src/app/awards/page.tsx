import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
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
      .select("user_id,favorited_username,photo_url,bio")
      .limit(2000);

    for (const m of (publicMembers ?? []) as any[]) {
      if (!m?.user_id) continue;
      publicByUserId.set(String(m.user_id), {
        user_id: String(m.user_id),
        favorited_username: String(m.favorited_username ?? ""),
        photo_url: (m.photo_url ?? null) as string | null,
        bio: (m.bio ?? null) as string | null,
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
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🏅 Awards</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Weekly winners and shoutouts.
          </p>
        </div>

        <Card title="Weekly Awards">
          <div className="space-y-2">
            {CATEGORIES.map((cat) => {
              const win = latestByType.get(cat) ?? null;
              const profile = win ? publicByUserId.get(win.user_id) ?? null : null;

              return (
                <div
                  key={cat}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{cat}</div>
                    {profile ? (
                      <div className="mt-1 flex items-center gap-2 text-sm">
                        {profile.photo_url ? (
                          <img
                            src={profile.photo_url}
                            alt={profile.favorited_username}
                            className="h-6 w-6 rounded-full border border-[color:var(--border)] object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                        <div className="truncate text-[color:var(--muted)]">
                          {profile.favorited_username}
                        </div>
                      </div>
                    ) : win ? (
                      <div className="mt-1 text-sm text-[color:var(--muted)]">
                        Winner selected.
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-[color:var(--muted)]">
                        Your photo here — start competing now.
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-[color:var(--muted)]">—</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </Container>
  );
}
