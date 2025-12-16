import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { centralDayRangeUTC, todayISODate } from "@/lib/utils";
import { NotiesClient, type ActorProfile, type NotieRow } from "./ui";

export const runtime = "nodejs";

type Checklist = {
  comments_today: number;
  comments_capped: number;
  upvotes_received_today: number;
  upvotes_received_capped: number;
  shares_today: number;
  shares_capped: number;
  likes_total: number;
  wheel_spins_today: number;
  wheel_spins_capped: number;
  checkins_today: number;
  checkins_capped: number;
  gift_bonus_today: number;
  streak_current: number;
  link_visits_today: number;
  link_visits_capped: number;
};

type Notie = NotieRow;

function clamp(n: number, max: number) {
  return Math.max(0, Math.min(max, n));
}

export default async function NotiesPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const today = todayISODate();
  const { start: startOfTodayUTC, end: startOfTomorrowUTC } = centralDayRangeUTC(today);

  let noties: Notie[] = [];
  let notiesErrorMessage: string | null = null;
  const { data: notiesData, error: notiesErr } = await sb
    .from("cfm_noties")
    .select("id,type,is_read,entity_type,entity_id,post_id,comment_id,actor_user_id,message,created_at")
    .or(`user_id.eq.${user.id},member_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (notiesErr) {
    notiesErrorMessage = notiesErr.message;
    noties = [];
  } else {
    noties = (notiesData ?? []) as Notie[];
  }

  const actorIds = Array.from(
    new Set(
      (noties ?? [])
        .map((n) => String((n as any)?.actor_user_id ?? "").trim())
        .filter((v) => v),
    ),
  );

  let actorProfiles: Record<string, ActorProfile> = {};
  if (actorIds.length) {
    try {
      const { data: rows } = await sb
        .from("cfm_public_member_ids")
        .select("user_id,favorited_username,photo_url")
        .in("user_id", actorIds)
        .limit(500);
      actorProfiles = Object.fromEntries(
        (rows ?? []).map((r: any) => {
          const uid = String(r.user_id ?? "").trim();
          return [
            uid,
            {
              user_id: uid,
              favorited_username: String(r.favorited_username ?? "").trim(),
              photo_url: r.photo_url ?? null,
            } satisfies ActorProfile,
          ];
        }),
      );
    } catch {
      actorProfiles = {};
    }
  }

  const [
    { count: commentsToday },
    { count: checkinsToday },
    { count: spinsToday },
    { count: sharesToday },
    { count: giftBonusToday },
  ] = await Promise.all([
    sb
      .from("cfm_feed_comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfTodayUTC)
      .lt("created_at", startOfTomorrowUTC),
    sb
      .from("cfm_checkins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("checkin_date", today),
    sb
      .from("cfm_daily_spins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("spin_date", today),
    sb
      .from("cfm_shares")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("share_date", today),
    sb
      .from("cfm_daily_gift_bonus")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("bonus_date", today),
  ]);

  // Upvotes received today: upvotes made today on comments authored by this user.
  const { data: upvoteRows } = await sb
    .from("cfm_feed_comment_upvotes")
    .select("comment_id")
    .gte("created_at", startOfTodayUTC)
    .lt("created_at", startOfTomorrowUTC)
    .limit(5000);

  let upvotesReceivedToday = 0;
  if ((upvoteRows ?? []).length) {
    const commentIds = Array.from(new Set((upvoteRows ?? []).map((r: any) => String(r.comment_id))));
    const { data: myCommentIds } = await sb
      .from("cfm_feed_comments")
      .select("id")
      .eq("user_id", user.id)
      .in("id", commentIds)
      .limit(5000);

    const ownedSet = new Set((myCommentIds ?? []).map((r: any) => String(r.id)));
    for (const r of upvoteRows ?? []) {
      if (ownedSet.has(String((r as any).comment_id))) upvotesReceivedToday++;
    }
  }

  // Leaderboard totals for lifetime-like items (likes, streak)
  let myTotals: any | null = null;
  try {
    const { data: lb } = await sb.rpc("cfm_leaderboard", { limit_n: 500 });
    const rows = (lb ?? []) as any[];
    myTotals = rows.find((r) => String(r.user_id) === String(user.id)) ?? null;
  } catch {
    myTotals = null;
  }

  // Link visits (0-7/day) if table exists; otherwise default to 0.
  let linkVisitsToday = 0;
  try {
    const { count } = await sb
      .from("cfm_link_visits")
      .select("link_type", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("visit_date", today);
    linkVisitsToday = count ?? 0;
  } catch {
    linkVisitsToday = 0;
  }

  const checklist: Checklist = {
    comments_today: commentsToday ?? 0,
    comments_capped: clamp(commentsToday ?? 0, 3),
    upvotes_received_today: upvotesReceivedToday,
    upvotes_received_capped: clamp(upvotesReceivedToday, 3),
    shares_today: sharesToday ?? 0,
    shares_capped: clamp(sharesToday ?? 0, 5),
    likes_total: Number(myTotals?.like_points ?? 0),
    wheel_spins_today: spinsToday ?? 0,
    wheel_spins_capped: clamp(spinsToday ?? 0, 1),
    checkins_today: checkinsToday ?? 0,
    checkins_capped: clamp(checkinsToday ?? 0, 1),
    gift_bonus_today: giftBonusToday ?? 0,
    streak_current: Number(myTotals?.streak_points ?? 0),
    link_visits_today: linkVisitsToday,
    link_visits_capped: clamp(linkVisitsToday, 7),
  };

  const checklistRows = [
    {
      label: "🔥 Streak (current)",
      current: checklist.streak_current,
      max: Math.max(1, checklist.streak_current),
      href: "/hub",
      hint: "Keep checking in daily to build your streak.",
      showMax: false as const,
    },
    {
      label: "✅ Daily check-in",
      current: checklist.checkins_capped,
      max: 1,
      href: "/hub",
      hint: "Check in once per day.",
      showMax: true as const,
    },
    {
      label: "💬 Comments",
      current: checklist.comments_capped,
      max: 3,
      href: "/feed",
      hint: "Post comments (points cap at 3/day).",
      showMax: true as const,
    },
    {
      label: "⬆️ Upvotes received",
      current: checklist.upvotes_received_capped,
      max: 3,
      href: "/feed",
      hint: "Earn upvotes on your comments (points cap at 3/day).",
      showMax: true as const,
    },
    {
      label: "🔗 Live link shares",
      current: checklist.shares_capped,
      max: 5,
      href: "/support",
      hint: "Log shares from Support (points cap at 5/day).",
      showMax: true as const,
    },
    {
      label: "🔎 Link visits",
      current: checklist.link_visits_capped,
      max: 7,
      href: "/",
      hint: "Visit the social links on home page (7/day + Discord one-time).",
      showMax: true as const,
    },
    {
      label: "🎡 Daily spin",
      current: checklist.wheel_spins_capped,
      max: 1,
      href: "/hub",
      hint: "Spin once per day.",
      showMax: true as const,
    },
    {
      label: "🎁 Daily gift bonus",
      current: checklist.gift_bonus_today > 0 ? 1 : 0,
      max: 1,
      href: "/feed",
      hint: "If you sent 1k+ coins today, ask an admin to grant your +5.",
      showMax: true as const,
    },
    {
      label: "❤️ Likes (lifetime)",
      current: checklist.likes_total,
      max: Math.max(1, checklist.likes_total),
      href: "/feed",
      hint: "Like posts to earn points (no daily cap).",
      showMax: false as const,
    },
  ];

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">🔔 Noties</h1>
          <p className="text-sm text-[color:var(--muted)]">Notifications and your daily checklist.</p>
          <p className="text-xs text-[color:var(--muted)]">Daily limits reset at 12:00am Central Time.</p>
        </div>

        <Card title="Notifications">
          {notiesErrorMessage ? (
            <div className="mb-2 text-sm text-red-200">{notiesErrorMessage}</div>
          ) : null}
          <NotiesClient initialNoties={noties} actorProfiles={actorProfiles} />
        </Card>

        <Card title="Daily Checklist">
          <div className="space-y-2">
            {checklistRows.map((r) => {
              const done = r.current >= r.max;
              return (
                <Link
                  key={r.label}
                  href={r.href}
                  className="block rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {done ? "✅ " : "☐ "}
                        {r.label}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--muted)] truncate">{r.hint}</div>
                    </div>
                    <div className="text-sm font-semibold">
                      {r.showMax ? `${r.current}/${r.max}` : `${r.current}`}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </Container>
  );
}
