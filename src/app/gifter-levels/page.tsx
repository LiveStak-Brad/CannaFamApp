import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { GIFTER_TIERS, getGifterLevel } from "@/lib/gifterLevel";

export const runtime = "nodejs";

function fmtCoins(n: number) {
  const v = Math.floor(Number(n ?? 0));
  if (!Number.isFinite(v) || v <= 0) return "0 coins";
  return `${new Intl.NumberFormat("en-US").format(v)} coins`;
}

export default async function GifterLevelsPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { data: member } = await sb
    .from("cfm_members")
    .select("favorited_username,photo_url,lifetime_gifted_total_coins")
    .eq("user_id", user.id)
    .maybeSingle();

  const username = String((member as any)?.favorited_username ?? user.user_metadata?.favorited_username ?? "Member").trim() || "Member";
  const photoUrl = ((member as any)?.photo_url ?? null) as string | null;
  const totalCoins = Math.floor(Number((member as any)?.lifetime_gifted_total_coins ?? 0));
  const totalUsd = totalCoins / 100;

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
                <div className="text-lg font-semibold">{fmtCoins(totalCoins)}</div>
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
                <div className="text-xs text-[color:var(--muted)]">Coins to next level</div>
                <div className="mt-1 text-sm font-semibold">{fmtCoins(Math.round(level.nextLevelUsd * 100))}</div>
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
                  const startCoins = Math.round(start * 100);
                  const endCoins = end === null ? null : Math.round(end * 100);
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
                        {isDiamond ? `${fmtCoins(startCoins)}+` : `${fmtCoins(startCoins)} – ${fmtCoins(endCoins ?? 0)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm">
              <div className="font-semibold">Diamond (Elite)</div>
              <div className="mt-1 text-[color:var(--muted)]">
                Diamond starts at {fmtCoins(100_000_000)} lifetime gifted. It has infinite levels with no cap.
                Each Diamond level costs more than the previous.
              </div>
            </div>
          </div>
        </Card>

        <Card title="VIP tiers">
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--muted)]">VIP resets monthly and is based on coins spent in the month.</div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-xs font-semibold">VIP Bronze</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-xs font-semibold">VIP Silver</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-xs font-semibold">VIP Gold</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-xs font-semibold">VIP Diamond</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">VIP Bronze</div>
                <div className="mt-1 font-semibold">25,000 coins / month</div>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">VIP Silver</div>
                <div className="mt-1 font-semibold">50,000 coins / month</div>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">VIP Gold</div>
                <div className="mt-1 font-semibold">100,000 coins / month</div>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">VIP Diamond</div>
                <div className="mt-1 font-semibold">200,000 coins / month</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
