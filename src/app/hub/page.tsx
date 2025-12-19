import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { HubCheckInButton, HubSpinButton } from "./ui";

export const runtime = "nodejs";

type MemberProfile = {
  id: string;
  favorited_username: string;
  photo_url: string | null;
  lifetime_gifted_total_usd?: number | null;
  bio: string | null;
  public_link: string | null;
  instagram_link: string | null;
  x_link: string | null;
  tiktok_link: string | null;
  youtube_link: string | null;
};

export default async function HubPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { data: adminRow } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = !!adminRow?.role;

  let { data: memberRaw } = await sb
    .from("cfm_members")
    .select("id,favorited_username,photo_url,lifetime_gifted_total_usd,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
    .eq("user_id", user.id)
    .maybeSingle();

  let member = (memberRaw as unknown as MemberProfile | null) ?? null;

  if (!isAdmin && !member) {
    const suggested = String((user.user_metadata as any)?.favorited_username ?? "").trim();
    if (suggested) {
      const { error: insertErr } = await sb.from("cfm_members").insert({
        user_id: user.id,
        favorited_username: suggested,
        points: 0,
      });

      if (!insertErr) {
        const refetch = await sb
          .from("cfm_members")
          .select("id,favorited_username,photo_url,lifetime_gifted_total_usd,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
          .eq("user_id", user.id)
          .maybeSingle();
        member = (refetch.data as unknown as MemberProfile | null) ?? null;
      }
    }
  }

  const approved = isAdmin || !!member;

  const today = todayISODate();
  const { data: checkedToday } = approved
    ? await sb
        .from("cfm_checkins")
        .select("id")
        .eq("user_id", user.id)
        .eq("checkin_date", today)
        .maybeSingle()
    : { data: null };

  const { data: spunToday } = approved
    ? await sb
        .from("cfm_daily_spins")
        .select("id, points_awarded")
        .eq("user_id", user.id)
        .eq("spin_date", today)
        .maybeSingle()
    : { data: null };

  const { data: leaderboard } = approved
    ? await sb.rpc("cfm_leaderboard", { limit_n: 10 })
    : { data: null };

  const userTotals = Array.isArray(leaderboard)
    ? leaderboard.find((r: any) => r.user_id === user.id) ?? null
    : null;

  const myUsername = String(member?.favorited_username ?? "").trim();

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">👤 Hub</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Signed in as {user.email ?? ""}.
          </p>
        </div>

        {!approved ? (
          <Card title="Create your profile">
            <div className="space-y-3 text-sm text-[color:var(--muted)]">
              <p>
                You're signed in. Create your member profile to start earning points.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <Button as="link" href="/hub/claim" variant="secondary">
                  Create profile
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {approved ? (
          <Card title="Profile">
            <div className="space-y-3">
              {member?.favorited_username ? (
                <div className="flex items-center gap-3">
                  <GifterRingAvatar
                    size={48}
                    imageUrl={member.photo_url}
                    name={member.favorited_username ?? "Member"}
                    totalUsd={
                      typeof member.lifetime_gifted_total_usd === "number" ? member.lifetime_gifted_total_usd : null
                    }
                    showDiamondShimmer
                  />
                  <div className="text-sm font-semibold">{member.favorited_username ?? "Member"}</div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button as="link" href="/me" variant="secondary">
                  Edit profile
                </Button>
                {myUsername ? (
                  <Button
                    as="link"
                    href={`/u/${encodeURIComponent(myUsername)}`}
                    variant="secondary"
                  >
                    View profile
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        <Card title="Daily Spin">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">🎡 Spin for points</div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                One spin per day. You can earn 1–5 points.
              </div>
              {spunToday ? (
                <div className="mt-2 text-sm font-semibold">
                  Today: +{spunToday.points_awarded ?? 0}
                </div>
              ) : null}
            </div>
            <HubSpinButton disabled={!approved} spunToday={!!spunToday} />
          </div>
        </Card>

        <Card title="Your points">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold">
                {isAdmin ? "Admin" : userTotals?.total_points ?? 0}
              </div>
              {!isAdmin ? (
                <div className="mt-1 text-sm font-semibold">
                  🔥 Streak (consecutive check-in days): {userTotals?.streak_points ?? 0}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                Daily check-in: +1/day
              </div>
              <div className="mt-3">
                <PointsExplainerButton />
              </div>
            </div>
            <HubCheckInButton disabled={!approved} checkedToday={!!checkedToday} />
          </div>
        </Card>

        <Card title="Weekly leaderboard">
          <div className="space-y-2">
            {leaderboard?.length ? (
              leaderboard.map((m: any, idx: number) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-[color:var(--muted)]">#{idx + 1}</span>{" "}
                    <span className="font-semibold">{m.favorited_username}</span>
                    <span className="ml-2 text-xs text-[color:var(--muted)]">
                      🔥 {m.streak_points ?? 0}
                    </span>
                  </div>
                  <div className="font-semibold">{m.total_points ?? 0}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[color:var(--muted)]">
                No leaderboard entries yet.
              </div>
            )}

            <div className="pt-2">
              <Button as="link" href="/leaderboard" variant="secondary">
                View full leaderboard
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3">
          <Button as="link" href="/#share-live" variant="secondary">
            Share Live
          </Button>
          <Button as="link" href="/feed" variant="secondary">
            Highlight feed
          </Button>
          {isAdmin ? (
            <Button as="link" href="/admin" variant="secondary">
              Admin
            </Button>
          ) : null}
          <Link href="/" className="text-center text-xs text-[color:var(--muted)] underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    </Container>
  );
}
