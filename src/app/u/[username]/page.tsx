import Link from "next/link";
import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { AdminPostComposer } from "@/components/ui/admin-post-composer";
import { DailyPostComposer, type DailyPostDraft, type MentionCandidate } from "@/components/ui/daily-post-composer";
import { GifterRingAvatar } from "@/components/ui/gifter-ring-avatar";
import { VipBadge, type VipTier } from "@/components/ui/vip-badge";
import { requireApprovedMember } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";
import { todayISODate } from "@/lib/utils";
import { FollowButton } from "./ui";

export const runtime = "nodejs";

type PublicProfile = {
  user_id: string | null;
  favorited_username: string;
  photo_url: string | null;
  lifetime_gifted_total_usd?: number | null;
  vip_tier?: VipTier | null;
  bio: string | null;
  public_link: string | null;
  instagram_link: string | null;
  x_link: string | null;
  tiktok_link: string | null;
  youtube_link: string | null;
};

type FeedComment = {
  id: string;
  post_id: string | null;
  content: string;
  created_at: string | null;
  is_hidden?: boolean | null;
};

type AwardRow = {
  id: string;
  user_id: string | null;
  award_type: string | null;
  week_start: string | null;
  week_end: string | null;
  notes: string | null;
  created_at: string | null;
};

type DailyPostRow = {
  id: string;
  title: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string | null;
  post_date: string | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatCoins(coins: number) {
  const n = Math.floor(Number(coins ?? 0));
  if (!Number.isFinite(n) || n <= 0) return "0 coins";
  return `${new Intl.NumberFormat("en-US").format(n)} coins`;
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const authedUser = await requireApprovedMember();
  const sb = await supabaseServer();
  const admin = supabaseAdminOrNull();

  const resolvedParams = await params;

  let uname = String(resolvedParams.username ?? "");
  try {
    uname = decodeURIComponent(uname);
  } catch {
  }
  uname = uname.trim();

  if (!uname) {
    return (
      <Container>
        <Card title="Profile">
          <div className="text-sm text-[color:var(--muted)]">Invalid profile URL.</div>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Lookup: <span className="font-mono">{uname || "(empty)"}</span>
          </div>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Params: <span className="font-mono">{JSON.stringify(resolvedParams)}</span>
          </div>
        </Card>
      </Container>
    );
  }

  const profileFields =
    "user_id,favorited_username,photo_url,lifetime_gifted_total_usd,vip_tier,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link";

  let profile: PublicProfile | null = null;
  let lookupErrMsg = "";

  if (admin) {
    const exactRes = await admin
      .from("cfm_members")
      .select(profileFields)
      .eq("favorited_username", uname)
      .order("created_at", { ascending: false })
      .limit(1);

    const exactRows = (exactRes.data ?? []) as any[];
    if (exactRes.error) lookupErrMsg = exactRes.error.message;

    if (exactRows.length) {
      profile = (exactRows[0] as unknown as PublicProfile) ?? null;
    } else {
      const likeRes = await admin
        .from("cfm_members")
        .select(profileFields)
        .ilike("favorited_username", uname)
        .order("created_at", { ascending: false })
        .limit(1);
      const likeRows = (likeRes.data ?? []) as any[];
      if (likeRes.error) lookupErrMsg = likeRes.error.message;
      profile = (likeRows[0] as unknown as PublicProfile) ?? null;
    }
  } else {
    const rpcRes = await sb.rpc("cfm_get_member_profile", { username: uname });
    if (rpcRes.error) lookupErrMsg = rpcRes.error.message;
    const data = rpcRes.data as unknown;
    const rows = Array.isArray(data) ? (data as any[]) : data ? [data] : [];
    profile = (rows[0] as unknown as PublicProfile) ?? null;
  }

  lookupErrMsg = String(lookupErrMsg || "").trim();
  if (!profile?.favorited_username) {
    return (
      <Container>
        <Card title="Profile">
          <div className="text-sm text-[color:var(--muted)]">Member not found.</div>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Lookup: <span className="font-mono">{uname || "(empty)"}</span>
          </div>
          {lookupErrMsg ? (
            <div className="mt-2 text-xs text-[color:var(--muted)]">{lookupErrMsg}</div>
          ) : null}
        </Card>
      </Container>
    );
  }

  const linkedUserId = String(profile.user_id ?? "").trim() || null;

  const isOwnProfile = !!linkedUserId && String(authedUser.id) === String(linkedUserId);

  const followerCount = linkedUserId
    ? (await sb
        .from("cfm_follows")
        .select("id", { count: "exact", head: true })
        .eq("followed_user_id", linkedUserId)).count ?? 0
    : 0;

  const followingCount = linkedUserId
    ? (await sb
        .from("cfm_follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_user_id", linkedUserId)).count ?? 0
    : 0;

  const isFollowing = linkedUserId
    ? !!(await sb
        .from("cfm_follows")
        .select("id")
        .eq("follower_user_id", authedUser.id)
        .eq("followed_user_id", linkedUserId)
        .maybeSingle()).data
    : false;

  const { data: adminRow } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", authedUser.id)
    .maybeSingle();
  const adminRole = String((adminRow as any)?.role ?? "").trim();
  const canAdminPost = adminRole === "owner" || adminRole === "admin";

  let latestDailyPost: DailyPostRow | null = null;
  if (linkedUserId) {
    const { data } = await sb
      .from("cfm_feed_posts")
      .select("id,title,content,media_url,media_type,created_at,post_date")
      .eq("post_type", "member")
      .eq("author_user_id", linkedUserId)
      .order("post_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestDailyPost = (data ?? null) as unknown as DailyPostRow | null;
  }

  let myDailyPostToday: DailyPostDraft | null = null;
  if (isOwnProfile) {
    const today = todayISODate();
    const { data } = await sb
      .from("cfm_feed_posts")
      .select("id,title,content,media_url,media_type")
      .eq("post_type", "member")
      .eq("author_user_id", authedUser.id)
      .eq("post_date", today)
      .maybeSingle();
    myDailyPostToday = (data ?? null) as unknown as DailyPostDraft | null;
  }

  let pointsRow: any | null = null;
  if (linkedUserId) {
    try {
      const { data: lb } = await sb.rpc("cfm_leaderboard", { limit_n: 500 });
      const rows = (lb ?? []) as any[];
      pointsRow = rows.find((r) => String(r.user_id) === String(linkedUserId)) ?? null;
    } catch {
      pointsRow = null;
    }
  }

  let comments: FeedComment[] = [];
  if (linkedUserId) {
    const { data: commentRows } = await sb
      .from("cfm_feed_comments")
      .select("id,post_id,content,created_at,is_hidden")
      .eq("user_id", linkedUserId)
      .or("is_hidden.is.null,is_hidden.eq.false")
      .order("created_at", { ascending: false })
      .limit(20);
    comments = (commentRows ?? []) as unknown as FeedComment[];
  }

  let awards: AwardRow[] = [];
  if (linkedUserId) {
    const { data: awardRows } = await sb
      .from("cfm_awards")
      .select("id,user_id,award_type,week_start,week_end,notes,created_at")
      .eq("user_id", linkedUserId)
      .order("created_at", { ascending: false })
      .limit(50);
    awards = (awardRows ?? []) as unknown as AwardRow[];
  }

  let supportEarnedCoins = 0;
  if (linkedUserId) {
    try {
      const { data: postRows } = await sb
        .from("cfm_feed_posts")
        .select("id")
        .eq("author_user_id", linkedUserId)
        .limit(5000);

      const postIds = (postRows ?? []).map((p: any) => p.id).filter(Boolean);
      const { data: giftRows } = await sb
        .from("cfm_post_gifts")
        .select("amount_cents")
        .in("post_id", postIds)
        .eq("status", "paid")
        .limit(2000);

      for (const g of (giftRows ?? []) as any[]) {
        const cents = Number(g?.amount_cents ?? 0);
        if (!Number.isFinite(cents) || cents <= 0) continue;
        supportEarnedCoins += cents;
      }
    } catch {
      supportEarnedCoins = 0;
    }
  }

  const awardCounts = new Map<string, number>();
  for (const a of awards) {
    const t = String(a.award_type ?? "").trim();
    if (!t) continue;
    awardCounts.set(t, (awardCounts.get(t) ?? 0) + 1);
  }

  const socials: Array<{ label: string; href: string }> = [];
  if (profile?.public_link) socials.push({ label: "Link", href: profile.public_link });
  if (profile?.instagram_link) socials.push({ label: "IG", href: profile.instagram_link });
  if (profile?.x_link) socials.push({ label: "X", href: profile.x_link });
  if (profile?.tiktok_link) socials.push({ label: "TikTok", href: profile.tiktok_link });
  if (profile?.youtube_link) socials.push({ label: "YouTube", href: profile.youtube_link });

  // Fetch mention candidates for tagging
  let mentionCandidates: MentionCandidate[] = [];
  if (isOwnProfile) {
    const { data: mentionCandidatesRaw } = await sb
      .from("cfm_public_member_ids")
      .select("user_id,favorited_username,photo_url,lifetime_gifted_total_usd")
      .limit(2000);
    mentionCandidates = (mentionCandidatesRaw ?? []) as MentionCandidate[];
  }

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold inline-flex items-center gap-2">
            <span>👤 {profile.favorited_username}</span>
            <VipBadge tier={(profile as any)?.vip_tier ?? null} />
          </h1>
          <p className="text-sm text-[color:var(--muted)]">Member profile</p>
        </div>

        <Card title="Profile">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <GifterRingAvatar
                size={80}
                imageUrl={profile?.photo_url ?? null}
                name={profile?.favorited_username ?? "Member"}
                totalUsd={
                  typeof profile?.lifetime_gifted_total_usd === "number" ? profile.lifetime_gifted_total_usd : null
                }
                showDiamondShimmer
              />

              <div className="min-w-0 flex-1 space-y-2">
                {linkedUserId ? (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
                    <span>Followers: {followerCount}</span>
                    <span>Following: {followingCount}</span>
                    <Link href="/gifter-levels" className="font-semibold underline underline-offset-4">
                      Gifter Levels
                    </Link>
                  </div>
                ) : null}

                {!isOwnProfile && linkedUserId ? (
                  <FollowButton targetUserId={linkedUserId} initialFollowing={isFollowing} />
                ) : null}

                {profile?.bio ? (
                  <div className="text-sm text-[color:var(--muted)] whitespace-pre-wrap">
                    {profile.bio}
                  </div>
                ) : (
                  <div className="text-sm text-[color:var(--muted)]">No bio yet.</div>
                )}

                {socials.length ? (
                  <div className="flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-xs"
                      >
                        {s.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {pointsRow ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Total points</div>
                <div className="mt-1 text-3xl font-semibold">{pointsRow.total_points ?? 0}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
                  <span>🔥 {pointsRow.streak_points ?? 0}</span>
                  <span>🔗 {pointsRow.share_points ?? 0}</span>
                  <span>❤️ {pointsRow.like_points ?? 0}</span>
                  {typeof pointsRow.comment_points !== "undefined" ? (
                    <span>💬 {pointsRow.comment_points ?? 0}</span>
                  ) : null}
                  {typeof pointsRow.comment_upvote_points !== "undefined" ? (
                    <span>⬆️ {pointsRow.comment_upvote_points ?? 0}</span>
                  ) : null}
                  <span>✅ {pointsRow.checkin_points ?? 0}</span>
                  <span>🎁 {pointsRow.gift_bonus_points ?? 0}</span>
                  <span>🎡 {pointsRow.spin_points ?? 0}</span>
                  {typeof pointsRow.link_visit_points !== "undefined" ? (
                    <span>🔎 {pointsRow.link_visit_points ?? 0}</span>
                  ) : null}
                  {typeof pointsRow.gift_dollar_points !== "undefined" ? (
                    <span>💰 {Number(pointsRow.gift_dollar_points ?? 0).toLocaleString()} coins</span>
                  ) : null}
                  {typeof pointsRow.follow_points !== "undefined" ? (
                    <span>👥 {pointsRow.follow_points ?? 0}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {linkedUserId ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div className="text-xs text-[color:var(--muted)]">Support earned</div>
                <div className="mt-1 text-2xl font-semibold">{formatCoins(supportEarnedCoins)}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  All gifts go to CannaStreams to support the platform.
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {isOwnProfile ? (
          canAdminPost ? (
            <AdminPostComposer title="Post to the feed (admin)" />
          ) : (
            <DailyPostComposer title="Post to your profile" existing={myDailyPostToday} mentionCandidates={mentionCandidates} />
          )
        ) : null}

        <Card title="Daily post">
          {!linkedUserId ? (
            <div className="text-sm text-[color:var(--muted)]">
              This member hasn’t linked their account yet.
            </div>
          ) : latestDailyPost ? (
            <div className="space-y-3">
              <div className="text-xs text-[color:var(--muted)]">
                {latestDailyPost.post_date ? `${latestDailyPost.post_date}` : ""}
                {latestDailyPost.created_at ? ` • ${fmtTime(latestDailyPost.created_at)}` : ""}
              </div>
              {latestDailyPost.title ? (
                <div className="text-base font-semibold">{latestDailyPost.title}</div>
              ) : null}
              <div className="text-sm text-[color:var(--foreground)] whitespace-pre-wrap">
                {latestDailyPost.content}
              </div>
              {latestDailyPost.media_url && latestDailyPost.media_type ? (
                latestDailyPost.media_type === "video" ? (
                  <video
                    className="w-full rounded-xl border border-[color:var(--border)] bg-black"
                    controls
                    preload="metadata"
                    src={latestDailyPost.media_url}
                  />
                ) : (
                  <img
                    src={latestDailyPost.media_url}
                    alt="Daily post media"
                    className="w-full rounded-xl border border-[color:var(--border)] object-cover"
                    referrerPolicy="no-referrer"
                  />
                )
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No daily post yet.</div>
          )}
        </Card>

        <Card title="Recent comments">
          {!linkedUserId ? (
            <div className="text-sm text-[color:var(--muted)]">
              This member hasn’t linked their account yet.
            </div>
          ) : comments.length ? (
            <div className="space-y-3">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-[color:var(--muted)]">{fmtTime(c.created_at)}</div>
                    {c.post_id ? (
                      <Link
                        href={`/feed#${encodeURIComponent(String(c.post_id))}`}
                        className="text-xs text-[color:var(--muted)] underline underline-offset-4"
                      >
                        View
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm whitespace-pre-wrap">{c.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No comments yet.</div>
          )}
        </Card>

        <Card title="Awards">
          {!linkedUserId ? (
            <div className="text-sm text-[color:var(--muted)]">
              Awards will appear once this member links their account.
            </div>
          ) : awardCounts.size ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Array.from(awardCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => (
                    <div
                      key={t}
                      className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs"
                    >
                      {t} x{n}
                    </div>
                  ))}
              </div>

              <div className="space-y-2">
                {awards.slice(0, 10).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
                  >
                    <div className="text-sm font-semibold">{String(a.award_type ?? "")}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {(a.week_start && a.week_end) ? `${a.week_start} → ${a.week_end}` : ""}
                      {a.created_at ? ` • ${fmtTime(a.created_at)}` : ""}
                    </div>
                    {a.notes ? (
                      <div className="mt-2 text-sm text-[color:var(--muted)] whitespace-pre-wrap">
                        {a.notes}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No awards yet.</div>
          )}
        </Card>
      </div>
    </Container>
  );
}
