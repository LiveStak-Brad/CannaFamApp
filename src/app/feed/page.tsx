import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/utils";
import {
  FeedAdminPostControls,
  FeedMedia,
  GiftButton,
  GiftSummary,
  FeedShareButton,
  LikeButton,
  CommentsButton,
  MyDailyPostComposer,
  type FeedPost,
  type GiftTopGifter,
  type LikerProfile,
  type MyDailyPost,
} from "./ui";
import Link from "next/link";
import { AdminPostComposer } from "@/components/ui/admin-post-composer";

export const runtime = "nodejs";

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sb = await supabaseServer();

  const user = await getAuthedUserOrNull();
  const { data: adminRow } = user
    ? await sb
        .from("cfm_admins")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const isAdmin = !!adminRow?.role;
  const canEditPosts = !!adminRow?.role && (adminRow.role === "owner" || adminRow.role === "admin");
  const { data: member } = user
    ? await sb.from("cfm_members").select("id").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const canEarn = !!user && !!member;
  const leaderboardEligible = !!user && (!!member || isAdmin);

  const today = todayISODate();
  const { data: myDailyPostRow } = canEarn
    ? await sb
        .from("cfm_feed_posts")
        .select("id,title,content,media_url,media_type")
        .eq("post_type", "member")
        .eq("author_user_id", user!.id)
        .eq("post_date", today)
        .maybeSingle()
    : { data: null };

  const myDailyPost = (myDailyPostRow ?? null) as MyDailyPost | null;

  const giftParam = typeof searchParams?.gift === "string" ? searchParams?.gift : null;
  const giftNotice =
    giftParam === "success"
      ? "✅ Gift checkout completed. If payment succeeds, it will show up shortly."
      : giftParam === "cancel"
        ? "Gift checkout canceled."
        : null;

  const { data: awards } = await sb
    .from("cfm_awards")
    .select("id,user_id,award_type,week_start,week_end,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  let leaderboard: any[] = [];
  try {
    const { data: lb } = await sb.rpc("cfm_leaderboard", { limit_n: 500 });
    leaderboard = (lb ?? []) as any[];
  } catch {
    leaderboard = [];
  }

  const { data: posts, error: postsErr } = await sb
    .from("cfm_feed_posts")
    .select("id,title,content,post_type,created_at,media_url,media_type,author_user_id,post_date")
    .order("created_at", { ascending: false })
    .limit(50);

  if (postsErr) {
    return (
      <Container>
        <Card title="Feed">
          <div className="text-sm text-red-200">{postsErr.message}</div>
        </Card>
      </Container>
    );
  }

  const filteredPosts = (posts ?? []).filter((p: any) => {
    const t = String(p?.post_type ?? "").trim().toLowerCase();
    if (t !== "member") return true;
    return String(p?.post_date ?? "") === today;
  });

  const postIds = filteredPosts.map((p) => p.id);

  const authorIds = Array.from(
    new Set(
      filteredPosts
        .map((p: any) => String(p?.author_user_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const authorById = new Map<string, { favorited_username: string; photo_url: string | null }>();
  if (authorIds.length) {
    const { data: authors } = await sb
      .from("cfm_public_member_ids")
      .select("user_id,favorited_username,photo_url")
      .in("user_id", authorIds)
      .limit(2000);

    for (const a of (authors ?? []) as any[]) {
      if (!a?.user_id) continue;
      authorById.set(String(a.user_id), {
        favorited_username: String(a.favorited_username ?? "Member"),
        photo_url: (a.photo_url ?? null) as string | null,
      });
    }
  }

  // Monetization settings + presets (safe defaults)
  const { data: monetizationSettings } = await sb
    .from("cfm_monetization_settings")
    .select("enable_post_gifts,allow_custom_amount,min_gift_cents,max_gift_cents,currency")
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

  // Gift totals + top gifters per post (paid only)
  const giftsByPost = new Map<
    string,
    {
      totalCents: number;
      topGifters: GiftTopGifter[];
    }
  >();

  if (postIds.length) {
    try {
      const { data: giftRows } = await sb
        .from("cfm_post_gifts")
        .select("post_id,gifter_user_id,amount_cents,status")
        .in("post_id", postIds)
        .in("status", ["paid"])
        .limit(5000);

      const rows = (giftRows ?? []) as Array<{
        post_id: string;
        gifter_user_id: string | null;
        amount_cents: number;
        status: string;
      }>;

      const gifterIds = Array.from(
        new Set(rows.map((r) => (r.gifter_user_id ? String(r.gifter_user_id) : "")).filter(Boolean)),
      );
      const gifterProfiles = new Map<string, { favorited_username: string; photo_url: string | null }>();

      if (gifterIds.length) {
        const { data: gifters } = await sb
          .from("cfm_public_member_ids")
          .select("user_id,favorited_username,photo_url")
          .in("user_id", gifterIds)
          .limit(2000);

        for (const g of (gifters ?? []) as any[]) {
          if (!g?.user_id) continue;
          gifterProfiles.set(String(g.user_id), {
            favorited_username: String(g.favorited_username ?? ""),
            photo_url: (g.photo_url ?? null) as string | null,
          });
        }
      }

      const totalsByPost = new Map<string, number>();
      const totalsByPostAndGifter = new Map<string, Map<string, number>>();

      for (const r of rows) {
        const pid = String(r.post_id);
        const uid = r.gifter_user_id ? String(r.gifter_user_id) : "";
        const cents = Number(r.amount_cents ?? 0);
        if (!pid || !Number.isFinite(cents) || cents <= 0) continue;

        totalsByPost.set(pid, (totalsByPost.get(pid) ?? 0) + cents);
        if (uid) {
          const byUser = totalsByPostAndGifter.get(pid) ?? new Map<string, number>();
          byUser.set(uid, (byUser.get(uid) ?? 0) + cents);
          totalsByPostAndGifter.set(pid, byUser);
        }
      }

      for (const pid of postIds) {
        const totalCents = totalsByPost.get(pid) ?? 0;
        const byUser = totalsByPostAndGifter.get(pid) ?? new Map<string, number>();
        const top = Array.from(byUser.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([uid, total]) => {
            const prof = gifterProfiles.get(uid);
            return {
              favorited_username: prof?.favorited_username ?? "Member",
              photo_url: prof?.photo_url ?? null,
              total_cents: total,
            };
          });

        giftsByPost.set(pid, { totalCents, topGifters: top });
      }
    } catch {
    }
  }

  // Public-safe member list for @mention autocomplete
  const { data: mentionCandidatesRaw } = await sb
    .from("cfm_public_member_ids")
    .select("user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
    .limit(2000);
  const mentionCandidates = (mentionCandidatesRaw ?? []) as any[];

  // Comments + comment upvotes (optional until SQL is applied)
  type CommentRow = {
    id: string;
    post_id: string;
    user_id: string;
    content: string;
    created_at: string | null;
    is_hidden: boolean | null;
  };

  type UpvoteRow = {
    comment_id: string;
    user_id: string;
  };

  let comments: CommentRow[] = [];
  let upvotes: UpvoteRow[] = [];
  let commenterProfiles = new Map<
    string,
    {
      favorited_username: string;
      photo_url: string | null;
      bio?: string | null;
      public_link?: string | null;
      instagram_link?: string | null;
      x_link?: string | null;
      tiktok_link?: string | null;
      youtube_link?: string | null;
    }
  >();

  try {
    const { data: commentRows } = postIds.length
      ? await sb
          .from("cfm_feed_comments")
          .select("id,post_id,user_id,content,created_at,is_hidden")
          .in("post_id", postIds)
          .order("created_at", { ascending: true })
      : { data: [] };
    comments = (commentRows ?? []) as any;

    const commentIds = comments.map((c) => c.id);
    const { data: upvoteRows } = commentIds.length
      ? await sb
          .from("cfm_feed_comment_upvotes")
          .select("comment_id,user_id")
          .in("comment_id", commentIds)
      : { data: [] };
    upvotes = (upvoteRows ?? []) as any;

    const commenterIds = Array.from(new Set(comments.map((c) => c.user_id)));
    const { data: publicMembers } = commenterIds.length
      ? await sb
          .from("cfm_public_member_ids")
          .select("user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
          .in("user_id", commenterIds)
      : { data: [] };

    for (const m of (publicMembers ?? []) as any[]) {
      if (!m?.user_id) continue;
      commenterProfiles.set(String(m.user_id), {
        favorited_username: String(m.favorited_username ?? ""),
        photo_url: (m.photo_url ?? null) as string | null,
        bio: (m.bio ?? null) as string | null,
        public_link: (m.public_link ?? null) as string | null,
        instagram_link: (m.instagram_link ?? null) as string | null,
        x_link: (m.x_link ?? null) as string | null,
        tiktok_link: (m.tiktok_link ?? null) as string | null,
        youtube_link: (m.youtube_link ?? null) as string | null,
      });
    }
  } catch {
    comments = [];
    upvotes = [];
    commenterProfiles = new Map();
  }

  const commentsByPost = new Map<string, CommentRow[]>();
  for (const c of comments) {
    commentsByPost.set(c.post_id, [...(commentsByPost.get(c.post_id) ?? []), c]);
  }

  const upvoteCountByComment = new Map<string, number>();
  const upvotedByMe = new Set<string>();
  for (const u of upvotes) {
    upvoteCountByComment.set(u.comment_id, (upvoteCountByComment.get(u.comment_id) ?? 0) + 1);
    if (user && u.user_id === user.id) upvotedByMe.add(u.comment_id);
  }

  const { data: likes } = postIds.length
    ? await sb
        .from("cfm_feed_likes")
        .select("post_id,user_id")
        .in("post_id", postIds)
    : { data: [] };

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();

  for (const l of likes ?? []) {
    likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
    if (user && l.user_id === user.id) likedByMe.add(l.post_id);
  }

  const likerProfilesByPost = new Map<string, LikerProfile[]>();
  if (likes?.length) {
    const userIds = Array.from(new Set((likes ?? []).map((l) => l.user_id)));

    const byUser = new Map<
      string,
      {
        favorited_username: string;
        photo_url: string | null;
        bio?: string | null;
        public_link?: string | null;
        instagram_link?: string | null;
        x_link?: string | null;
        tiktok_link?: string | null;
        youtube_link?: string | null;
      }
    >();

    try {
      const { data: publicMembers, error: publicErr } = await sb
        .from("cfm_public_member_ids")
        .select("user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
        .in("user_id", userIds);

      if (publicErr) throw new Error(publicErr.message);

      for (const m of (publicMembers ?? []) as any[]) {
        if (!m?.user_id) continue;
        byUser.set(String(m.user_id), {
          favorited_username: String(m.favorited_username ?? ""),
          photo_url: (m.photo_url ?? null) as string | null,
          bio: (m.bio ?? null) as string | null,
          public_link: (m.public_link ?? null) as string | null,
          instagram_link: (m.instagram_link ?? null) as string | null,
          x_link: (m.x_link ?? null) as string | null,
          tiktok_link: (m.tiktok_link ?? null) as string | null,
          youtube_link: (m.youtube_link ?? null) as string | null,
        });
      }
    } catch {
      if (isAdmin) {
        const { data: likerMembers } = await sb
          .from("cfm_members")
          .select("user_id,favorited_username,photo_url,bio,public_link,instagram_link,x_link,tiktok_link,youtube_link")
          .in("user_id", userIds);

        for (const m of likerMembers ?? []) {
          if (!m.user_id) continue;
          byUser.set(m.user_id, {
            favorited_username: m.favorited_username,
            photo_url: m.photo_url,
            bio: (m as any).bio ?? null,
            public_link: (m as any).public_link ?? null,
            instagram_link: (m as any).instagram_link ?? null,
            x_link: (m as any).x_link ?? null,
            tiktok_link: (m as any).tiktok_link ?? null,
            youtube_link: (m as any).youtube_link ?? null,
          });
        }
      }
    }

    for (const l of likes ?? []) {
      const info = byUser.get(l.user_id);
      if (!info) continue;
      likerProfilesByPost.set(l.post_id, [
        ...(likerProfilesByPost.get(l.post_id) ?? []),
        {
          user_id: l.user_id,
          favorited_username: info.favorited_username,
          photo_url: info.photo_url,
          bio: (info as any).bio ?? null,
          public_link: (info as any).public_link ?? null,
          instagram_link: (info as any).instagram_link ?? null,
          x_link: (info as any).x_link ?? null,
          tiktok_link: (info as any).tiktok_link ?? null,
          youtube_link: (info as any).youtube_link ?? null,
        },
      ]);
    }
  }

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">📰 Feed</h1>
          <p className="text-sm text-[color:var(--muted)]">
            Admin-posted highlights. Members can like each post once.
          </p>
          <div className="pt-2">
            <PointsExplainerButton />
          </div>
        </div>

        {giftNotice ? (
          <Card>
            <div className="text-sm text-[color:var(--muted)]">{giftNotice}</div>
          </Card>
        ) : null}

        {canEditPosts ? <AdminPostComposer title="Post to the feed (admin)" /> : null}

        <MyDailyPostComposer canPost={canEarn} existing={myDailyPost} />

        <div className="space-y-3">
          {filteredPosts?.length ? (
            filteredPosts.map((p: any) => (
              <Card key={p.id} title={p.title ?? ""}>
                <div id={p.id} className="space-y-3">
                  <div className="text-xs text-[color:var(--muted)]">
                    {p.post_type ? p.post_type.toUpperCase() : ""}{" "}
                    {p.created_at ? ` • ${new Date(p.created_at).toLocaleString()}` : ""}
                    {p.author_user_id ? (() => {
                      const uid = String(p.author_user_id ?? "").trim();
                      const info = uid ? authorById.get(uid) ?? null : null;
                      const uname = String(info?.favorited_username ?? "").trim();
                      if (!uname) return "";
                      return (
                        <>
                          {" • "}
                          <Link className="underline underline-offset-4" href={`/u/${encodeURIComponent(uname)}`}>
                            @{uname}
                          </Link>
                        </>
                      );
                    })() : null}
                  </div>
                  <FeedAdminPostControls post={p as FeedPost} isAdmin={canEditPosts} />
                  <div className="text-sm text-[color:var(--foreground)] whitespace-pre-wrap">
                    {p.content}
                  </div>
                  {p.media_url && p.media_type ? (
                    <FeedMedia mediaUrl={p.media_url} mediaType={p.media_type} />
                  ) : null}

                  <GiftSummary
                    totalCents={giftsByPost.get(p.id)?.totalCents ?? 0}
                    topGifters={giftsByPost.get(p.id)?.topGifters ?? []}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CommentsButton
                        postId={p.id}
                        canComment={canEarn}
                        myUserId={user?.id ?? null}
                        mentionCandidates={mentionCandidates}
                        comments={commentsByPost.get(p.id) ?? []}
                        commenterProfiles={commenterProfiles}
                        upvoteCountByComment={upvoteCountByComment}
                        upvotedByMe={upvotedByMe}
                        isAdmin={canEditPosts}
                        awards={(awards ?? []) as any}
                        leaderboard={(leaderboard ?? []) as any}
                      />
                      <GiftButton
                        postId={p.id}
                        canGift={enablePostGifts}
                        presets={presets}
                        allowCustom={allowCustom}
                        minCents={minCents}
                        maxCents={maxCents}
                        notice={
                          enablePostGifts && !leaderboardEligible
                            ? !user
                              ? "You can gift anonymously. Log in + create your profile to appear on the gifter leaderboard."
                              : "You can gift, but it will be counted as anonymous until you create your profile."
                            : null
                        }
                      />
                      <FeedShareButton
                        postId={p.id}
                        title={p.title ?? "CFM highlight"}
                        content={p.content ?? ""}
                        canEarn={canEarn}
                      />
                      <LikeButton
                        postId={p.id}
                        liked={likedByMe.has(p.id)}
                        likeCount={likeCount.get(p.id) ?? 0}
                        likers={likerProfilesByPost.get(p.id) ?? []}
                        awards={(awards ?? []) as any}
                        leaderboard={(leaderboard ?? []) as any}
                        canEarn={canEarn}
                        myUserId={user?.id ?? null}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card>
              <div className="text-sm text-[color:var(--muted)]">
                No posts yet.
              </div>
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}
