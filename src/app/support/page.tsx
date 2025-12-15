import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/utils";
import { SupportChecklist, LinkVisitsChecklist } from "./ui";
import { SiteGiftButton } from "@/app/feed/ui";

export const runtime = "nodejs";

export default async function SupportPage() {
  const sb = await supabaseServer();

  const user = await getAuthedUserOrNull();
  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const canEarn = !!user && !!member;

  const { data: monetizationSettings } = await sb
    .from("cfm_monetization_settings")
    .select("enable_post_gifts,allow_custom_amount,min_gift_cents,max_gift_cents")
    .limit(1)
    .maybeSingle();

  const enablePostGifts = !!(monetizationSettings as any)?.enable_post_gifts;
  const allowCustom = !!(monetizationSettings as any)?.allow_custom_amount;
  const minCents = Number((monetizationSettings as any)?.min_gift_cents ?? 100);
  const maxCents = Number((monetizationSettings as any)?.max_gift_cents ?? 20000);

  const { data: presetRows } = await sb
    .from("cfm_gift_presets")
    .select("amount_cents")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const giftPresets = ((presetRows ?? []) as Array<{ amount_cents: number }>).map((r) => Number(r.amount_cents));
  const presets = giftPresets.length ? giftPresets : [100, 300, 500, 1000, 2000];

  const today = todayISODate();
  const { count: todayCount } = canEarn
    ? await sb
        .from("cfm_shares")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("share_date", today)
    : { count: 0 };

  const used = todayCount ?? 0;
  const DAILY_CAP = 5;

  // Link visits today
  let visitedToday: string[] = [];
  if (canEarn) {
    try {
      const { data: visits } = await sb
        .from("cfm_link_visits")
        .select("link_type")
        .eq("user_id", user!.id)
        .eq("visit_date", today);
      visitedToday = (visits ?? []).map((v: any) => String(v.link_type));
    } catch {
      visitedToday = [];
    }
  }

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">👏 Support</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Daily share-to-earn (self-reported).
          </p>
          <div className="pt-2">
            <PointsExplainerButton />
          </div>
        </div>

        <Card title="Share-to-earn">
          {!canEarn ? (
            <div className="space-y-2 text-sm text-[color:var(--muted)]">
              <div>
                Log in and claim/link your membership to earn points for sharing.
              </div>
            </div>
          ) : null}
          <SupportChecklist initialTodayCount={used} dailyCap={DAILY_CAP} canEarn={canEarn} />
        </Card>

        <Card title="Link visits">
          {!canEarn ? (
            <div className="space-y-2 text-sm text-[color:var(--muted)]">
              <div>
                Log in and claim/link your membership to earn points for visiting links.
              </div>
            </div>
          ) : null}
          <LinkVisitsChecklist initialVisited={visitedToday} canEarn={canEarn} />
        </Card>

        <Card title="Voluntary support">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <p>
              Voluntary support helps fund hosting, development, and growth. No
              perks or advantages.
            </p>
            <SiteGiftButton
              returnPath="/support"
              canGift={enablePostGifts}
              presets={presets}
              allowCustom={allowCustom}
              minCents={minCents}
              maxCents={maxCents}
              notice={
                !user
                  ? "You can gift anonymously. Log in + claim membership to appear on the gifter leaderboard."
                  : !member
                    ? "You can gift, but it will be counted as anonymous until you claim/link your membership."
                    : null
              }
            />
            <Button
              as="link"
              href="https://paypal.me/bradmorrismusic"
              target="_blank"
              rel="noreferrer"
            >
              Support CannaFam
            </Button>
          </div>
        </Card>
      </div>
    </Container>
  );
}
