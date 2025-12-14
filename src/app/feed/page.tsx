import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { PointsExplainerButton } from "@/components/ui/points-explainer";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import {
  FeedAdminPostControls,
  FeedMedia,
  FeedShareButton,
  LikeButton,
  LikeCountButton,
  CommentsButton,
  type FeedPost,
  type LikerProfile,
} from "./ui";

export const runtime = "nodejs";

export default async function FeedPage() {
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
    .select("id,title,content,post_type,created_at,media_url,media_type")
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

  const postIds = (posts ?? []).map((p) => p.id);

  // Public-safe member list for @mention autocomplete
  const { data: mentionCandidatesRaw } = await sb
    .from("cfm_public_member_ids")
    .select("user_id,favorited_username,photo_url,bio")
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
    { favorited_username: string; photo_url: string | null; bio?: string | null }
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
          .select("user_id,favorited_username,photo_url,bio")
          .in("user_id", commenterIds)
      : { data: [] };

    for (const m of (publicMembers ?? []) as any[]) {
      if (!m?.user_id) continue;
      commenterProfiles.set(String(m.user_id), {
        favorited_username: String(m.favorited_username ?? ""),
        photo_url: (m.photo_url ?? null) as string | null,
        bio: (m.bio ?? null) as string | null,
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
      { favorited_username: string; photo_url: string | null; bio?: string | null }
    >();

    try {
      const { data: publicMembers, error: publicErr } = await sb
        .from("cfm_public_member_ids")
        .select("user_id,favorited_username,photo_url,bio")
        .in("user_id", userIds);

      if (publicErr) throw new Error(publicErr.message);

      for (const m of (publicMembers ?? []) as any[]) {
        if (!m?.user_id) continue;
        byUser.set(String(m.user_id), {
          favorited_username: String(m.favorited_username ?? ""),
          photo_url: (m.photo_url ?? null) as string | null,
          bio: (m.bio ?? null) as string | null,
        });
      }
    } catch {
      if (isAdmin) {
        const { data: likerMembers } = await sb
          .from("cfm_members")
          .select("user_id,favorited_username,photo_url,bio")
          .in("user_id", userIds);

        for (const m of likerMembers ?? []) {
          if (!m.user_id) continue;
          byUser.set(m.user_id, {
            favorited_username: m.favorited_username,
            photo_url: m.photo_url,
            bio: (m as any).bio ?? null,
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

        <div className="space-y-3">
          {posts?.length ? (
            posts.map((p) => (
              <Card key={p.id} title={p.title ?? ""}>
                <div id={p.id} className="space-y-3">
                  <div className="text-xs text-[color:var(--muted)]">
                    {p.post_type ? p.post_type.toUpperCase() : ""}{" "}
                    {p.created_at ? ` • ${new Date(p.created_at).toLocaleString()}` : ""}
                  </div>
                  <FeedAdminPostControls post={p as FeedPost} isAdmin={canEditPosts} />
                  <div className="text-sm text-[color:var(--foreground)] whitespace-pre-wrap">
                    {p.content}
                  </div>
                  {p.media_url && p.media_type ? (
                    <FeedMedia mediaUrl={p.media_url} mediaType={p.media_type} />
                  ) : null}
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[color:var(--muted)]">
                      <LikeCountButton
                        count={likeCount.get(p.id) ?? 0}
                        canOpen={(likeCount.get(p.id) ?? 0) > 0}
                        likers={likerProfilesByPost.get(p.id) ?? []}
                        awards={(awards ?? []) as any}
                        leaderboard={(leaderboard ?? []) as any}
                      />
                    </div>
                    <div className="flex items-center gap-2">
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
                      <FeedShareButton
                        postId={p.id}
                        title={p.title ?? "CFM highlight"}
                        content={p.content ?? ""}
                        canEarn={canEarn}
                      />
                      <LikeButton postId={p.id} liked={likedByMe.has(p.id)} canEarn={canEarn} />
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
