import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { GIFTER_TIERS, getGifterLevel } from "@cannafam/shared";

export const runtime = "nodejs";

function fmtUsd(n: number) {
  const v = Number(n ?? 0);
  const whole = Math.round(v);
  return `$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export default async function GifterLevelsPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { data: member } = await sb
    .from("cfm_members")
    .select("favorited_username,photo_url,lifetime_gifted_total_usd")
    .eq("user_id", user.id)
    .maybeSingle();

  const username = String((member as any)?.favorited_username ?? user.user_metadata?.favorited_username ?? "Member").trim() || "Member";
  const photoUrl = ((member as any)?.photo_url ?? null) as string | null;
  const totalUsd = typeof (member as any)?.lifetime_gifted_total_usd === "number" ? ((member as any).lifetime_gifted_total_usd as number) : 0;

  const level = getGifterLevel(totalUsd);

  const tiers = GIFTER_TIERS;

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">💎 Gifter Levels</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Levels are based on your lifetime gifted total.
          </p>
          <div className="pt-1 text-xs text-[color:var(--muted)]">
            <Link href="/leaderboard" className="underline underline-offset-4">Back to leaderboard</Link>
          </div>
        </div>

        <Card title="Your Current Level">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <GifterRingAvatar
                size={72}
                imageUrl={photoUrl}
                name={username}
                totalUsd={totalUsd}
                showDiamondShimmer
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{username}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">Lifetime gifted</div>
                <div className="text-lg font-semibold">{fmtUsd(totalUsd)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Tier</div>
                <div className="mt-1 text-sm font-semibold">{level.tierName}</div>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Level</div>
                <div className="mt-1 text-sm font-semibold">{level.displayLevel}</div>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">$ to next level</div>
                <div className="mt-1 text-sm font-semibold">{fmtUsd(level.nextLevelUsd)}</div>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Progress</div>
                <div className="mt-1 text-sm font-semibold">{level.progressPct}%</div>
              </div>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, level.progressPct))}%`, backgroundColor: level.ringColor }}
              />
            </div>
          </div>
        </Card>

        <Card title="Tiers">
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--muted)]">
              Grey through Obsidian have 50 levels each. Diamond is an infinite tier.
            </div>

            <div className="rounded-xl border border-[color:var(--border)] overflow-hidden">
              <div className="grid grid-cols-12 gap-0 border-b border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-xs font-semibold">
                <div className="col-span-6">Tier</div>
                <div className="col-span-2">Levels</div>
                <div className="col-span-4">Lifetime range</div>
              </div>
              <div className="divide-y divide-[color:var(--border)]">
                {tiers.map((t, idx) => {
                  const next = idx < tiers.length - 1 ? tiers[idx + 1] : null;
                  const isDiamond = t.key === "diamond";
                  const start = t.entryUsd;
                  const end = isDiamond ? null : next?.entryUsd ?? null;
                  return (
                    <div key={t.key} className="grid grid-cols-12 items-center px-4 py-3 text-sm">
                      <div className="col-span-6 flex items-center gap-2 min-w-0">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                        <div className="truncate">
                          {t.name}
                        </div>
                      </div>
                      <div className="col-span-2 text-[color:var(--muted)]">
                        {isDiamond ? "1+" : "1–50"}
                      </div>
                      <div className="col-span-4 text-[color:var(--muted)]">
                        {isDiamond ? `${fmtUsd(start)}+` : `${fmtUsd(start)} – ${fmtUsd(end ?? 0)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm">
              <div className="font-semibold">Diamond (Elite)</div>
              <div className="mt-1 text-[color:var(--muted)]">
                Diamond starts at {fmtUsd(1_000_000)} lifetime gifted. It has infinite levels with no cap.
                Each Diamond level costs more than the previous.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
