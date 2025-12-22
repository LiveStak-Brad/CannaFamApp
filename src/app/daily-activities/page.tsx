import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HubCheckInButton, HubSpinButton } from "@/app/hub/ui";
import { DailyActivitiesLinks, DailyActivitiesShare } from "./ui";

export const runtime = "nodejs";

export default async function DailyActivitiesPage() {
  const user = await getAuthedUserOrNull();
  const sb = await supabaseServer();

  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const canEarn = !!user && !!member;

  let visitedToday: string[] = [];
  let discordJoined = false;
  let checkedToday = false;
  let spunToday = false;
  let spunPointsToday: number | null = null;
  let shareCountToday = 0;

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

  if (!canEarn) {
    return (
      <Container>
        <div className="space-y-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Daily Activities</h1>
            <p className="text-sm text-[color:var(--muted)]">
              Earn points through daily engagement
            </p>
          </div>

          <Card title="Login Required">
            <div className="space-y-4">
              <p className="text-sm text-[color:var(--muted)]">
                Create an account and complete your profile to access daily activities and earn points.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <Button as="link" href="/signup" variant="primary">
                  Create Account
                </Button>
                <Button as="link" href="/login" variant="secondary">
                  Log In
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Daily Activities</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Earn points through daily engagement
          </p>
        </div>

        {/* Daily Rewards */}
        <Card title="🎁 Daily Rewards">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">🎡 Daily Spin</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  One spin per day. Earn 1–5 points.
                </div>
                {spunPointsToday !== null ? (
                  <div className="mt-1 text-xs text-green-500 font-semibold">
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

        {/* Share & Support */}
        <Card title="📤 Share CannaFam App">
          <DailyActivitiesShare initialShareCount={shareCountToday} canEarn={canEarn} />
        </Card>

        {/* CannaStreams Links */}
        <Card title="🔗 CannaStreams Links">
          <DailyActivitiesLinks 
            initialVisited={visitedToday} 
            discordJoined={discordJoined} 
            canEarn={canEarn} 
          />
        </Card>

        {/* Instagram Footer */}
        <div className="text-center">
          <a
            href="https://instagram.com/cannafamapp"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[color:var(--muted)] underline underline-offset-4"
          >
            📸 Instagram: @cannafamapp
          </a>
        </div>
      </div>
    </Container>
  );
}
