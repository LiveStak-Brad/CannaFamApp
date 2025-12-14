import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/utils";
import { SupportChecklist, LinkVisitsChecklist } from "./ui";

export const runtime = "nodejs";

export default async function SupportPage() {
  const sb = await supabaseServer();

  const user = await getAuthedUserOrNull();
  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const canEarn = !!user && !!member;

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
