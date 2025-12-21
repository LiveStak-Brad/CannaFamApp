"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";
import { requireAdmin, requireApprovedMember } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";

type PublicMemberIdRow = { user_id: string | null };
type AdminRow = { user_id: string | null };
type FeedCommentRow = { id: string; post_id: string | null; user_id: string | null };
type FeedPostRow = { id: string; author_user_id: string | null };
type FollowRow = { follower_user_id: string | null };
type AdminClient = NonNullable<ReturnType<typeof supabaseAdminOrNull>>;

function guessExtFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "video/mp4") return "mp4";
  if (m === "video/webm") return "webm";
  if (m === "video/quicktime") return "mov";
  return null;
}

export async function createAdminPost(formData: FormData) {
  const user = await requireAdmin();
  const sb = await supabaseServer();

  const title = String(formData.get("title") ?? "").trim();
  const post_type = String(formData.get("post_type") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title) throw new Error("Title is required.");
  if (!post_type) throw new Error("Post type is required.");
  if (!content) throw new Error("Content is required.");

  if (post_type.toLowerCase() === "member") {
    throw new Error("'member' post type is reserved for member daily posts.");
  }

  const media = formData.get("media");
  let media_url: string | null = null;
  let media_type: string | null = null;

  if (media instanceof File && media.size > 0) {
    const mime = (media.type || "").toLowerCase();
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
      throw new Error("Media must be an image or video.");
    }

    media_type = mime.startsWith("video/") ? "video" : "image";

    const originalExt = (media.name.split(".").pop() || "").toLowerCase();
    const ext =
      (originalExt && /^[a-z0-9]+$/.test(originalExt) ? originalExt : "") ||
      guessExtFromMime(mime) ||
      (media_type === "video" ? "mp4" : "jpg");

    const objectPath = `feed/admin/${user.id}/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await media.arrayBuffer());

    const admin = supabaseAdminOrNull();
    const uploader = admin ?? sb;

    const { error: uploadErr } = await uploader.storage
      .from("cfm-photos")
      .upload(objectPath, bytes, { contentType: mime, upsert: false });

    if (uploadErr) {
      const hint = admin
        ? ""
        : " (If this is failing in prod, ensure cfm-photos storage policies allow admin uploads or set SUPABASE_SERVICE_ROLE_KEY.)";
      throw new Error(`Media upload failed: ${uploadErr.message}${hint}`);
    }

    const { data: publicData } = uploader.storage.from("cfm-photos").getPublicUrl(objectPath);
    media_url = publicData.publicUrl;
  }

  const { data: postRow, error } = await sb
    .from("cfm_feed_posts")
    .insert({
      title,
      post_type,
      content,
      media_url,
      media_type,
      author_user_id: user.id,
    })
    .select("id,author_user_id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  try {
    const admin = supabaseAdminOrNull();
    const inserted = (postRow ?? null) as FeedPostRow | null;
    const pid = String(inserted?.id ?? "").trim();
    if (!admin) {
      console.error("Notifications disabled: missing SUPABASE_SERVICE_ROLE_KEY");
    }
    if (admin && pid) {
      const broadcastType = post_type.toLowerCase() === "announcement" ? "announcement" : "system";

      const { data: memberRows } = await admin
        .from("cfm_public_member_ids")
        .select("user_id")
        .limit(5000);

      const memberIds = Array.from(
        new Set(
          (memberRows ?? [])
            .map((r) => String((r as PublicMemberIdRow | null)?.user_id ?? "").trim())
            .filter((id) => id && id !== user.id),
        ),
      );

      const message = title ? title : content.slice(0, 80);
      const makeRow = (uid: string) => ({
        member_id: uid,
        user_id: uid,
        actor_user_id: user.id,
        type: broadcastType,
        entity_type: "post",
        entity_id: pid,
        post_id: pid,
        comment_id: null,
        message,
        is_read: false,
      });

      const BATCH = 500;
      for (let i = 0; i < memberIds.length; i += BATCH) {
        const chunk = memberIds.slice(i, i + BATCH);
        const { error: bErr } = await admin.from("cfm_noties").insert(chunk.map(makeRow));
        if (bErr) {
          console.error("Failed to broadcast admin noties", bErr.message);
          break;
        }
      }

      await notifyFollowers({
        admin,
        actorUserId: user.id,
        type: "follow_post",
        entityType: "post",
        entityId: pid,
        postId: pid,
        commentId: null,
        message: "posted",
      });
      await notifyMentionedUsers({
        admin,
        actorUserId: user.id,
        text: content,
        postId: pid,
        commentId: null,
      });
      revalidatePath("/noties");
    }
  } catch (e) {
    console.error(
      "Noties fanout failed after admin post",
      e instanceof Error ? e.message : String(e),
    );
  }

  revalidatePath("/feed");
  revalidatePath("/admin");
}

export async function upsertMyDailyPost(formData: FormData) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const titleRaw = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("Post content is required.");
  if (content.length > 2000) throw new Error("Post is too long (max 2000 chars).");

  const today = todayISODate();

  const { data: existing, error: existingErr } = await sb
    .from("cfm_feed_posts")
    .select("id,media_url,media_type")
    .eq("post_type", "member")
    .eq("author_user_id", user.id)
    .eq("post_date", today)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  const media = formData.get("media");
  let media_url: string | null = (existing as any)?.media_url ?? null;
  let media_type: string | null = (existing as any)?.media_type ?? null;

  if (media instanceof File && media.size > 0) {
    const mime = (media.type || "").toLowerCase();
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
      throw new Error("Media must be an image or video.");
    }

    media_type = mime.startsWith("video/") ? "video" : "image";

    const originalExt = (media.name.split(".").pop() || "").toLowerCase();
    const ext =
      (originalExt && /^[a-z0-9]+$/.test(originalExt) ? originalExt : "") ||
      guessExtFromMime(mime) ||
      (media_type === "video" ? "mp4" : "jpg");

    const objectPath = `feed/member/${user.id}/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await media.arrayBuffer());

    const { error: uploadErr } = await sb.storage
      .from("cfm-photos")
      .upload(objectPath, bytes, { contentType: mime, upsert: false });
    if (uploadErr) throw new Error(`Media upload failed: ${uploadErr.message}`);

    const { data: publicData } = sb.storage.from("cfm-photos").getPublicUrl(objectPath);
    media_url = publicData.publicUrl;
  }

  const title = titleRaw ? titleRaw : null;

  if (existing?.id) {
    const { error: updateErr } = await sb
      .from("cfm_feed_posts")
      .update({ title, content, media_url, media_type })
      .eq("id", existing.id)
      .eq("post_type", "member")
      .eq("author_user_id", user.id)
      .eq("post_date", today);
    if (updateErr) throw new Error(updateErr.message);
    revalidatePath("/feed");
    revalidatePath("/hub");
    return { ok: true as const, message: "Post updated." };
  }

  const { data: insertedRow, error: insertErr } = await sb
    .from("cfm_feed_posts")
    .insert({
      title,
      content,
      post_type: "member",
      author_user_id: user.id,
      post_date: today,
      media_url,
      media_type,
    })
    .select("id")
    .maybeSingle();

  const msg = (insertErr?.message ?? "").toLowerCase();
  const wasDup = msg.includes("duplicate") || msg.includes("unique");
  if (insertErr && !wasDup) throw new Error(insertErr.message);

  if (insertErr && wasDup) {
    const { data: row, error: rowErr } = await sb
      .from("cfm_feed_posts")
      .select("id")
      .eq("post_type", "member")
      .eq("author_user_id", user.id)
      .eq("post_date", today)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (row?.id) {
      const { error: updateErr } = await sb
        .from("cfm_feed_posts")
        .update({ title, content, media_url, media_type })
        .eq("id", row.id)
        .eq("post_type", "member")
        .eq("author_user_id", user.id)
        .eq("post_date", today);
      if (updateErr) throw new Error(updateErr.message);
    }

    revalidatePath("/feed");
    revalidatePath("/hub");
    return { ok: true as const, message: "Post saved." };
  }

  const pid = String(insertedRow?.id ?? "").trim();
  if (pid) {
    try {
      const admin = supabaseAdminOrNull();
      if (!admin) {
        console.error("Notifications disabled: missing SUPABASE_SERVICE_ROLE_KEY");
      }
      if (admin) {
        await notifyFollowers({
          admin,
          actorUserId: user.id,
          type: "follow_post",
          entityType: "post",
          entityId: pid,
          postId: pid,
          commentId: null,
          message: "posted",
        });
        await notifyMentionedUsers({
          admin,
          actorUserId: user.id,
          text: content,
          postId: pid,
          commentId: null,
        });
        revalidatePath("/noties");
      }
    } catch (e) {
      console.error(
        "Noties fanout failed after member post",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  revalidatePath("/feed");
  revalidatePath("/hub");
  return { ok: true as const, message: "Post saved." };
}

export async function deleteMyDailyPost() {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const today = todayISODate();
  const { error } = await sb
    .from("cfm_feed_posts")
    .delete()
    .eq("post_type", "member")
    .eq("author_user_id", user.id)
    .eq("post_date", today);
  if (error) throw new Error(error.message);

  revalidatePath("/feed");
  revalidatePath("/hub");
  return { ok: true as const, message: "Post deleted." };
}

function extractMentionUsernames(text: string) {
  const matches = String(text ?? "").matchAll(/@([A-Za-z0-9_]{2,30})/g);
  const out: string[] = [];
  for (const m of matches) {
    const u = String(m?.[1] ?? "").trim();
    if (!u) continue;
    out.push(u);
  }
  return Array.from(new Set(out)).slice(0, 10);
}

async function notifyMentionedUsers({
  admin,
  actorUserId,
  text,
  postId,
  commentId,
}: {
  admin: AdminClient;
  actorUserId: string;
  text: string;
  postId: string;
  commentId: string | null;
}) {
  const usernames = extractMentionUsernames(text);
  if (!usernames.length) return;

  const mentionedUserIds = new Set<string>();
  for (const uname of usernames) {
    const { data: m } = await admin
      .from("cfm_public_member_ids")
      .select("user_id")
      .ilike("favorited_username", uname)
      .limit(1)
      .maybeSingle();
    const uid = String(((m as PublicMemberIdRow | null)?.user_id ?? "")).trim();
    if (uid && uid !== actorUserId) mentionedUserIds.add(uid);
  }

  for (const uid of mentionedUserIds) {
    const { error: notieErr } = await admin.from("cfm_noties").insert({
      member_id: uid,
      user_id: uid,
      actor_user_id: actorUserId,
      type: "mention",
      entity_type: commentId ? "comment" : "post",
      entity_id: commentId ? commentId : postId,
      post_id: postId,
      comment_id: commentId,
      message: "mentioned you",
      is_read: false,
    });
    if (notieErr) console.error("Failed to create mention notie", notieErr.message);
  }
}

async function notifyFollowers({
  admin,
  actorUserId,
  type,
  entityType,
  entityId,
  postId,
  commentId,
  message,
}: {
  admin: AdminClient;
  actorUserId: string;
  type: string;
  entityType: string;
  entityId: string;
  postId: string | null;
  commentId: string | null;
  message: string;
}) {
  const { data: followerRows } = await admin
    .from("cfm_follows")
    .select("follower_user_id")
    .eq("followed_user_id", actorUserId)
    .limit(1000);

  const followerIds = Array.from(
    new Set(
      (followerRows ?? [])
        .map((r) => String((r as FollowRow | null)?.follower_user_id ?? "").trim())
        .filter((id) => id && id !== actorUserId),
    ),
  );

  const CAP = 200;
  const ids = followerIds.slice(0, CAP);
  if (!ids.length) return;

  const rows = ids.map((uid) => ({
    member_id: uid,
    user_id: uid,
    actor_user_id: actorUserId,
    type,
    entity_type: entityType,
    entity_id: entityId,
    post_id: postId,
    comment_id: commentId,
    message,
    is_read: false,
  }));

  const { error } = await admin.from("cfm_noties").insert(rows);
  if (error) console.error("Failed to notify followers", error.message);
}

export async function toggleLike(postId: string, liked: boolean) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  let insertedNew = false;
  if (liked) {
    const { error } = await sb
      .from("cfm_feed_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from("cfm_feed_likes").insert({
      post_id: postId,
      user_id: user.id,
    });
    if (error) throw new Error(error.message);
    insertedNew = true;
  }

  if (insertedNew) {
    try {
      const admin = supabaseAdminOrNull();
      if (!admin) {
        console.error("Notifications disabled: missing SUPABASE_SERVICE_ROLE_KEY");
      }
      if (admin && postId) {
        const { data: post } = await admin
          .from("cfm_feed_posts")
          .select("id,author_user_id")
          .eq("id", String(postId))
          .maybeSingle();
        const p = (post ?? null) as FeedPostRow | null;
        const ownerId = String(p?.author_user_id ?? "").trim();
        const pid = String(p?.id ?? "").trim();
        if (ownerId && pid && ownerId !== user.id) {
          const { error: notieErr } = await admin.from("cfm_noties").insert({
            member_id: ownerId,
            user_id: ownerId,
            actor_user_id: user.id,
            type: "like",
            entity_type: "post",
            entity_id: pid,
            post_id: pid,
            comment_id: null,
            message: "liked your post",
            is_read: false,
          });
          if (notieErr) console.error("Failed to create like notie", notieErr.message);
          revalidatePath("/noties");
        }
      }
    } catch (e) {
      console.error(
        "toggleLike notie insert failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  revalidatePath("/feed");
}

export async function logFeedPostShare(postId: string) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  if (!postId) throw new Error("Post id is required.");

  const today = todayISODate();
  const platform = `feed:${postId}`;

  const { count: todayCount, error: countErr } = await sb
    .from("cfm_shares")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("share_date", today);

  if (countErr) throw new Error(countErr.message);

  const DAILY_CAP = 5;
  const used = todayCount ?? 0;
  if (used >= DAILY_CAP) {
    return {
      ok: false as const,
      message: `Daily limit reached. Max ${DAILY_CAP} shares/day.`,
    };
  }

  const { error: insertErr } = await sb.from("cfm_shares").insert({
    user_id: user.id,
    platform,
    share_date: today,
  });

  const insertMsg = (insertErr?.message ?? "").toLowerCase();
  const insertedNew = !insertErr;
  const wasDuplicate = insertMsg.includes("duplicate") || insertMsg.includes("unique");
  if (insertErr && !wasDuplicate) throw new Error(insertErr.message);

  if (insertErr && wasDuplicate) {
  }

  revalidatePath("/feed");
  revalidatePath("/hub");

  return {
    ok: true as const,
    message: insertedNew
      ? "Share logged (+1 point)."
      : "Already logged for this post today.",
  };
}

export async function createPostGiftCheckoutSession(postId: string, amountCents: number) {
  void postId;
  void amountCents;
  throw new Error("Legacy USD gifting has been removed. Use coin gifting via POST /api/gifts/send.");
}

export async function createSiteGiftCheckoutSession(amountCents: number, returnPath: string) {
  void amountCents;
  void returnPath;
  throw new Error("Legacy USD gifting has been removed. Use coin gifting via POST /api/gifts/send.");
}

export async function updateFeedPost(formData: FormData) {
  await requireAdmin();
  const sb = await supabaseServer();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const post_type = String(formData.get("post_type") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!id) throw new Error("Post id is required.");
  if (!title) throw new Error("Title is required.");
  if (!post_type) throw new Error("Post type is required.");
  if (!content) throw new Error("Content is required.");

  const { error } = await sb
    .from("cfm_feed_posts")
    .update({ title, post_type, content })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/feed");
  revalidatePath("/admin");

  return { ok: true as const, message: "Post updated." };
}

export async function deleteFeedPost(postId: string) {
  await requireAdmin();
  const sb = await supabaseServer();

  const id = String(postId ?? "").trim();
  if (!id) throw new Error("Post id is required.");

  const { error } = await sb.from("cfm_feed_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/feed");
  revalidatePath("/admin");

  return { ok: true as const, message: "Post deleted." };
}

export async function addFeedComment(postId: string, content: string, parentCommentId?: string | null) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const pid = String(postId ?? "").trim();
  const text = String(content ?? "").trim();
  const parentId = String(parentCommentId ?? "").trim() || null;
  if (!pid) throw new Error("Post id is required.");
  if (!text) throw new Error("Comment cannot be empty.");
  if (text.length > 500) throw new Error("Comment is too long (max 500 chars).");

  if (parentId) {
    const { data: parentRow, error: parentErr } = await sb
      .from("cfm_feed_comments")
      .select("id,post_id,parent_comment_id,user_id")
      .eq("id", parentId)
      .maybeSingle();
    if (parentErr) throw new Error(parentErr.message);

    const parent = (parentRow ?? null) as any;
    const parentPostId = String(parent?.post_id ?? "").trim();
    const parentParentId = String(parent?.parent_comment_id ?? "").trim();

    if (!parentPostId) throw new Error("Parent comment not found.");
    if (parentPostId !== pid) throw new Error("Reply must be on the same post.");
    if (parentParentId) throw new Error("Only one level of replies is allowed.");
  }

  const { data: commentRow, error } = await sb
    .from("cfm_feed_comments")
    .insert({
      post_id: pid,
      user_id: user.id,
      content: text,
      parent_comment_id: parentId,
    })
    .select("id,post_id,user_id")
    .maybeSingle();

  if (error) throw new Error(error.message);

  const insertedComment = (commentRow ?? null) as FeedCommentRow | null;
  const commentId = String(insertedComment?.id ?? "").trim();
  if (commentId) {
    try {
      const admin = supabaseAdminOrNull();
      if (!admin) {
        console.error("Notifications disabled: missing SUPABASE_SERVICE_ROLE_KEY");
        revalidatePath("/noties");
        return { ok: true as const, message: "Comment posted.", commentId: insertedComment?.id ?? null };
      }

      const { data: post } = await admin
        .from("cfm_feed_posts")
        .select("id,author_user_id")
        .eq("id", pid)
        .maybeSingle();
      const p = (post ?? null) as FeedPostRow | null;
      const ownerId = String(p?.author_user_id ?? "").trim();
      if (ownerId && ownerId !== user.id) {
        const msgText = parentId ? "replied to a comment on your post" : "commented on your post";
        const { error: notieErr } = await admin.from("cfm_noties").insert({
          member_id: ownerId,
          user_id: ownerId,
          actor_user_id: user.id,
          type: "comment",
          entity_type: "post",
          entity_id: pid,
          post_id: pid,
          comment_id: commentId,
          message: msgText,
          is_read: false,
        });
        if (notieErr) console.error("Failed to create comment notie", notieErr.message);
      }

      if (parentId) {
        const { data: parentRow } = await admin
          .from("cfm_feed_comments")
          .select("id,user_id")
          .eq("id", parentId)
          .maybeSingle();
        const parentOwnerId = String((parentRow as any)?.user_id ?? "").trim();
        if (parentOwnerId && parentOwnerId !== user.id) {
          const { error: replyNotieErr } = await admin.from("cfm_noties").insert({
            member_id: parentOwnerId,
            user_id: parentOwnerId,
            actor_user_id: user.id,
            type: "comment",
            entity_type: "comment",
            entity_id: parentId,
            post_id: pid,
            comment_id: commentId,
            message: "replied to your comment",
            is_read: false,
          });
          if (replyNotieErr) console.error("Failed to create reply notie", replyNotieErr.message);
        }
      }

      await notifyFollowers({
        admin,
        actorUserId: user.id,
        type: "follow_comment",
        entityType: "comment",
        entityId: commentId,
        postId: pid,
        commentId,
        message: parentId ? "replied" : "commented",
      });

      await notifyMentionedUsers({
        admin,
        actorUserId: user.id,
        text,
        postId: pid,
        commentId,
      });

      revalidatePath("/noties");
    } catch (e) {
      console.error(
        "addFeedComment notie fanout failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  revalidatePath("/feed");
  return { ok: true as const, message: "Comment posted.", commentId: insertedComment?.id ?? null };
}

export async function toggleCommentUpvote(commentId: string, upvoted: boolean) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const cid = String(commentId ?? "").trim();
  if (!cid) throw new Error("Comment id is required.");

  let insertedNew = false;
  if (upvoted) {
    const { error } = await sb
      .from("cfm_feed_comment_upvotes")
      .delete()
      .eq("comment_id", cid)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from("cfm_feed_comment_upvotes")
      .insert({ comment_id: cid, user_id: user.id });
    const msg = (error?.message ?? "").toLowerCase();
    const wasDup = msg.includes("duplicate") || msg.includes("unique");
    if (error && !wasDup) throw new Error(error.message);
    insertedNew = !error;
  }

  if (!upvoted && insertedNew) {
    try {
      const admin = supabaseAdminOrNull();
      if (!admin) {
        console.error("Notifications disabled: missing SUPABASE_SERVICE_ROLE_KEY");
        revalidatePath("/noties");
        return { ok: true as const, message: upvoted ? "Upvote removed." : "Upvoted." };
      }
      const { data: comment } = await admin
        .from("cfm_feed_comments")
        .select("id,user_id,post_id")
        .eq("id", cid)
        .maybeSingle();

      const c = (comment ?? null) as FeedCommentRow | null;
      const ownerId = String(c?.user_id ?? "").trim();
      const postId = String(c?.post_id ?? "").trim();
      if (ownerId && ownerId !== user.id) {
        const { error: notieErr } = await admin.from("cfm_noties").insert({
          member_id: ownerId,
          user_id: ownerId,
          actor_user_id: user.id,
          type: "comment_upvote",
          entity_type: "comment",
          entity_id: cid,
          post_id: postId || null,
          comment_id: cid,
          message: "upvoted your comment",
          is_read: false,
        });
        if (notieErr) console.error("Failed to create upvote notie", notieErr.message);
      }
    } catch (e) {
      console.error(
        "toggleCommentUpvote notie insert failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  revalidatePath("/noties");

  revalidatePath("/feed");
  return { ok: true as const, message: upvoted ? "Upvote removed." : "Upvoted." };
}

export async function hideFeedComment(commentId: string, hide: boolean) {
  await requireAdmin();
  const sb = await supabaseServer();

  const cid = String(commentId ?? "").trim();
  if (!cid) throw new Error("Comment id is required.");

  const { error } = await sb
    .from("cfm_feed_comments")
    .update({ is_hidden: !!hide })
    .eq("id", cid);
  if (error) throw new Error(error.message);

  revalidatePath("/feed");
  return { ok: true as const, message: hide ? "Comment hidden." : "Comment unhidden." };
}

export async function deleteFeedComment(commentId: string) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const cid = String(commentId ?? "").trim();
  if (!cid) throw new Error("Comment id is required.");

  // RLS will enforce owner/admin rules.
  const { error } = await sb.from("cfm_feed_comments").delete().eq("id", cid);
  if (error) throw new Error(error.message);

  revalidatePath("/feed");
  return { ok: true as const, message: "Comment deleted." };
}

export async function updateFeedComment(commentId: string, content: string) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const cid = String(commentId ?? "").trim();
  const text = String(content ?? "").trim();
  if (!cid) throw new Error("Comment id is required.");
  if (!text) throw new Error("Comment cannot be empty.");
  if (text.length > 500) throw new Error("Comment is too long (max 500 chars)." );

  // RLS should enforce that only the owner (or admin, if you allow it) can edit.
  const { error } = await sb
    .from("cfm_feed_comments")
    .update({ content: text })
    .eq("id", cid)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/feed");
  return { ok: true as const, message: "Comment updated." };
}
