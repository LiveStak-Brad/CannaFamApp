import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/shell/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/utils";
import { HomeLinkVisits } from "./ui";
import { SiteGiftButton } from "@/app/feed/ui";
import { HubCheckInButton, HubSpinButton } from "@/app/hub/ui";
import { SupportChecklist } from "@/app/support/ui";
import { LiveAlertsToggle } from "@/app/account/ui";

export const runtime = "nodejs";

export default async function Home() {
  const user = await getAuthedUserOrNull();
  const sb = await supabaseServer();

  // Check if user is an approved member
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

  // Fetch today's visited links if logged in
  let visitedToday: string[] = [];
  let discordJoined = false;
  if (canEarn) {
    const today = todayISODate();
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

    // Check if user has ever joined Discord (one-time, not daily)
    try {
      const { data: discordVisit } = await sb
        .from("cfm_link_visits")
        .select("id")
        .eq("user_id", user!.id)
        .eq("link_type", "discord")
        .limit(1)
        .maybeSingle();
      discordJoined = !!discordVisit;
    } catch {
      discordJoined = false;
    }
  }

  // Fetch daily spin and check-in status
  let checkedToday = false;
  let spunToday = false;
  let spunPointsToday: number | null = null;
  if (canEarn) {
    const today = todayISODate();
    try {
      const { data: checkin } = await sb
        .from("cfm_checkins")
        .select("id")
        .eq("user_id", user!.id)
        .eq("checkin_date", today)
        .maybeSingle();
      checkedToday = !!checkin;
    } catch {
      checkedToday = false;
    }

    try {
      const { data: spin } = await sb
        .from("cfm_daily_spins")
        .select("id, points_awarded")
        .eq("user_id", user!.id)
        .eq("spin_date", today)
        .maybeSingle();
      spunToday = !!spin;
      spunPointsToday = spin?.points_awarded ?? null;
    } catch {
      spunToday = false;
    }
  }

  let shareCountToday = 0;
  if (canEarn) {
    const today = todayISODate();
    try {
      const { count } = await sb
        .from("cfm_shares")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("share_date", today);
      shareCountToday = count ?? 0;
    } catch {
      shareCountToday = 0;
    }
  }
  return (
    <Container>
      <div className="space-y-5">
        <div className="relative mx-auto aspect-square w-[220px] overflow-hidden rounded-full">
          <Image
            src="/marketing.png"
            alt="CannaFam"
            fill
            sizes="220px"
            className="object-cover"
            priority
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(7,10,8,0) 32%, rgba(7,10,8,0.92) 68%, rgba(7,10,8,1) 100%)",
            }}
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">CannaFam (CFM)</h1>
          <p className="text-sm text-[color:var(--muted)]">
            CFM means <span className="font-semibold text-[color:var(--foreground)]">CannaFam Member</span>.
            It's a loyalty-based supporter group for CannaStreams.
          </p>
        </div>

        <Card title="How CFM works">
          <div className="space-y-3 text-sm text-[color:var(--foreground)]">
            <p>
              CFM members support during live streams through chat activity, tapping, gifting,
              moderation, and promotion.
            </p>
            <p className="text-[color:var(--muted)]">
              To be recognizable in chat, add <span className="font-semibold text-[color:var(--foreground)]">CFM</span> to your Favorited username
              or bio.
            </p>
            <p className="text-[color:var(--muted)]">50 free coins are available via the link in the Favorited bio.</p>
          </div>
        </Card>

        <Card title="Live Alerts">
          {user ? (
            <LiveAlertsToggle />
          ) : (
            <div className="space-y-2 text-sm text-[color:var(--muted)]">
              <div>Log in to enable push notifications when the owner account goes live.</div>
              <Button as="link" href="/login" variant="secondary">
                Login
              </Button>
            </div>
          )}
        </Card>

        {canEarn ? (
          <Card title="Daily Activities">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">🎡 Daily Spin</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    One spin per day. Earn 1–5 points.
                  </div>
                  {spunPointsToday !== null ? (
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      Today: +{spunPointsToday}
                    </div>
                  ) : null}
                </div>
                <HubSpinButton disabled={!canEarn} spunToday={spunToday} />
              </div>
              <div className="border-t border-[color:var(--border)]" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">✅ Daily Check-in</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    +1 point per day
                  </div>
                </div>
                <HubCheckInButton disabled={!canEarn} checkedToday={checkedToday} />
              </div>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-3">
          {!member ? (
            <Button as="link" href="/signup" variant="primary">
              Create account
            </Button>
          ) : null}
          <Button as="link" href="/members" variant="secondary">
            View Member Roster
          </Button>
          {!user ? (
            <Button as="link" href="/login" variant="secondary">
              Member Login
            </Button>
          ) : null}
        </div>

        <Card title="CannaStreams links">
          <HomeLinkVisits initialVisited={visitedToday} discordJoined={discordJoined} canEarn={canEarn} />
        </Card>

        <Card title="Send a gift">
          <div className="space-y-3 text-sm text-[color:var(--muted)]">
            <div>
              Gifts help fund hosting, development, and growth.
            </div>
            <SiteGiftButton
              returnPath="/"
              canGift={enablePostGifts}
              presets={presets}
              allowCustom={allowCustom}
              minCents={minCents}
              maxCents={maxCents}
              notice={
                !user
                  ? "You can gift anonymously. Log in + create your profile to appear on the gifter leaderboard."
                  : !member
                    ? "You can gift, but it will be counted as anonymous until you create your profile."
                    : null
              }
            />
          </div>
        </Card>

        <div id="share-live">
          <Card title="Share Live">
          <div className="space-y-3">
            {!canEarn ? (
              <div className="text-sm text-[color:var(--muted)]">
                Log in and create your profile to earn points for sharing.
              </div>
            ) : null}
            <SupportChecklist initialTodayCount={shareCountToday} dailyCap={5} canEarn={canEarn} />
          </div>
          </Card>
        </div>

        <div className="text-xs text-[color:var(--muted)]">
          <Link href="/signup" className="underline underline-offset-4">
            Create account
          </Link>
          <span className="px-2">|</span>
          <Link href="/members" className="underline underline-offset-4">
            Members
          </Link>
        </div>
      </div>
    </Container>
  );
}
