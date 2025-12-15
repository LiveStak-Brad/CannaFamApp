"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";
import { getAuthedUserOrNull, requireAdmin, requireApprovedMember } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

type PublicMemberIdRow = { user_id: string | null };
type AdminRow = { user_id: string | null };
type FeedCommentRow = { id: string; post_id: string | null; user_id: string | null };

function extractMentionUsernames(text: string) {
  const matches = String(text ?? "").matchAll(/@([A-Za-z0-9_]+)/g);
  const out: string[] = [];
  for (const m of matches) {
    const u = String(m?.[1] ?? "").trim();
    if (!u) continue;
    out.push(u);
  }
  return Array.from(new Set(out)).slice(0, 10);
}

export async function toggleLike(postId: string, liked: boolean) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

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

  if (insertedNew) {
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
  return createGiftCheckoutSession({ postId, amountCents, returnPath: "/feed" });
}

export async function createSiteGiftCheckoutSession(amountCents: number, returnPath: string) {
  const rp = String(returnPath ?? "").trim() || "/";
  return createGiftCheckoutSession({ postId: null, amountCents, returnPath: rp });
}

async function createGiftCheckoutSession({
  postId,
  amountCents,
  returnPath,
}: {
  postId: string | null;
  amountCents: number;
  returnPath: string;
}) {
  const sb = await supabaseServer();

  const user = await getAuthedUserOrNull();
  let gifterUserId: string | null = null;
  if (user) {
    const { data: adminRow } = await sb
      .from("cfm_admins")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: memberRow } = await sb
      .from("cfm_members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRow?.role || memberRow?.id) gifterUserId = user.id;
  }

  const pid = postId ? String(postId).trim() : "";

  const cents = Number(amountCents);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Invalid amount.");

  const { data: settings } = await sb
    .from("cfm_monetization_settings")
    .select(
      "enable_post_gifts,allow_custom_amount,min_gift_cents,max_gift_cents,currency",
    )
    .limit(1)
    .maybeSingle();

  const enablePostGifts = (settings as any)?.enable_post_gifts ?? false;
  if (!enablePostGifts) throw new Error("Gifting is currently disabled.");

  const allowCustom = (settings as any)?.allow_custom_amount ?? false;
  const minCents = Number((settings as any)?.min_gift_cents ?? 100);
  const maxCents = Number((settings as any)?.max_gift_cents ?? 20000);
  const currency = String((settings as any)?.currency ?? "usd").toLowerCase();

  const { data: presets } = await sb
    .from("cfm_gift_presets")
    .select("amount_cents")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const presetCents = new Set<number>((presets ?? []).map((p: any) => Number(p.amount_cents)));

  const isPreset = presetCents.size ? presetCents.has(cents) : [100, 300, 500, 1000, 2000].includes(cents);
  if (!isPreset) {
    if (!allowCustom) throw new Error("Custom amount is disabled.");
    if (cents < minCents || cents > maxCents) {
      throw new Error(`Amount must be between ${minCents} and ${maxCents} cents.`);
    }
  }

  if (pid) {
    const { data: post, error: postErr } = await sb
      .from("cfm_feed_posts")
      .select("id")
      .eq("id", pid)
      .maybeSingle();
    if (postErr) throw new Error(postErr.message);
    if (!post) throw new Error("Post not found.");
  }

  const recipientUserId: string | null = null;

  const { data: giftRow, error: giftErr } = await sb
    .from("cfm_post_gifts")
    .insert({
      post_id: pid || null,
      gifter_user_id: gifterUserId,
      recipient_user_id: recipientUserId,
      amount_cents: cents,
      currency,
      provider: "stripe",
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (giftErr) throw new Error(giftErr.message);
  if (!giftRow?.id) throw new Error("Failed to create gift record.");

  const s = stripe();
  const session = await s.checkout.sessions.create({
    mode: "payment",
    success_url: `${env.siteUrl}${returnPath}?gift=success&gift_id=${encodeURIComponent(String(giftRow.id))}${pid ? `&post_id=${encodeURIComponent(pid)}` : ""}`,
    cancel_url: `${env.siteUrl}${returnPath}?gift=cancel&gift_id=${encodeURIComponent(String(giftRow.id))}${pid ? `&post_id=${encodeURIComponent(pid)}` : ""}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: cents,
          product_data: {
            name: "Gift",
          },
        },
      },
    ],
    metadata: {
      gift_id: String(giftRow.id),
      post_id: pid,
      gifter_user_id: gifterUserId ?? "",
      recipient_user_id: recipientUserId ?? "",
    },
  });

  await sb
    .from("cfm_post_gifts")
    .update({ stripe_session_id: session.id })
    .eq("id", giftRow.id);

  return { ok: true as const, url: session.url };
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

export async function addFeedComment(postId: string, content: string) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const pid = String(postId ?? "").trim();
  const text = String(content ?? "").trim();
  if (!pid) throw new Error("Post id is required.");
  if (!text) throw new Error("Comment cannot be empty.");
  if (text.length > 500) throw new Error("Comment is too long (max 500 chars).");

  const { data: commentRow, error } = await sb
    .from("cfm_feed_comments")
    .insert({
      post_id: pid,
      user_id: user.id,
      content: text,
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

      const usernames = extractMentionUsernames(text);
      if (usernames.length) {
        const mentionedUserIds = new Set<string>();
        for (const uname of usernames) {
          const { data: m } = await admin
            .from("cfm_public_member_ids")
            .select("user_id")
            .ilike("favorited_username", uname)
            .limit(1)
            .maybeSingle();
          const uid = String(((m as PublicMemberIdRow | null)?.user_id ?? "")).trim();
          if (uid && uid !== user.id) mentionedUserIds.add(uid);
        }

        for (const uid of mentionedUserIds) {
          const { error: notieErr } = await admin.from("cfm_noties").insert({
            member_id: uid,
            actor_user_id: user.id,
            type: "mention",
            post_id: pid,
            comment_id: commentId,
          });
          if (notieErr) console.error("Failed to create mention notie", notieErr.message);
        }
      }

      const { data: adminUsers } = await admin.from("cfm_admins").select("user_id");
      const adminIds = Array.from(
        new Set(
          (adminUsers ?? [])
            .map((r) => String(((r as AdminRow | null)?.user_id ?? "")).trim())
            .filter((id) => id && id !== user.id),
        ),
      );

      for (const aid of adminIds) {
        const { error: notieErr } = await admin.from("cfm_noties").insert({
          member_id: aid,
          actor_user_id: user.id,
          type: "new_comment",
          post_id: pid,
          comment_id: commentId,
        });
        if (notieErr) console.error("Failed to create admin comment notie", notieErr.message);
      }
    } catch {
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
          actor_user_id: user.id,
          type: "comment_upvote",
          post_id: postId || null,
          comment_id: cid,
        });
        if (notieErr) console.error("Failed to create upvote notie", notieErr.message);
      }
    } catch {
    }
  }

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
