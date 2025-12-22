"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayISODate } from "@/lib/utils";
import { env } from "@/lib/env";

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

async function getBaseUrlFromRequestOrEnv() {
  const base = env.siteUrl?.trim();
  if (base) return base;

  const h = await headers();
  const xfProto = (h.get("x-forwarded-proto") ?? "").trim();
  const xfHost = (h.get("x-forwarded-host") ?? "").trim();
  const host = (h.get("host") ?? "").trim();

  const proto = xfProto || "https";
  const finalHost = xfHost || host;
  if (finalHost) return `${proto}://${finalHost}`;

  const origin = (h.get("origin") ?? "").trim();
  return origin;
}

export async function sendMemberInvite(memberId: string) {
  try {
    await requireAdmin();

    if (!env.supabaseServiceRoleKey) {
      return {
        ok: false as const,
        message:
          "Missing SUPABASE_SERVICE_ROLE_KEY on the server (Vercel env). This is required to send invites.",
      };
    }

    const sb = supabaseAdmin();

    const mid = String(memberId ?? "").trim();
    if (!mid) return { ok: false as const, message: "memberId is required." };

    const { data: member, error: memberErr } = await sb
      .from("cfm_members")
      .select("id,user_id,favorited_username")
      .eq("id", mid)
      .maybeSingle();
    if (memberErr) return { ok: false as const, message: memberErr.message };
    if (!member) return { ok: false as const, message: "Member not found." };
    if (member.user_id) {
      return { ok: true as const, message: "Member is already linked." };
    }

    const { data: app, error: appErr } = await sb
      .from("cfm_applications")
      .select("email,status")
      .eq("favorited_username", member.favorited_username)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appErr) return { ok: false as const, message: appErr.message };

    const email = String(app?.email ?? "").trim().toLowerCase();
    if (!email) {
      return { ok: false as const, message: "No approved application email found for this member." };
    }

    const baseUrl = await getBaseUrlFromRequestOrEnv();
    if (!baseUrl) {
      return {
        ok: false as const,
        message:
          "Missing site URL. Set NEXT_PUBLIC_SITE_URL in your Vercel env (recommended), or ensure the request has forwarded host headers.",
      };
    }

    const redirectTo = new URL("/auth/callback", baseUrl);
    redirectTo.searchParams.set("next", "/");

    const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo.toString(),
    });
    if (inviteErr) return { ok: false as const, message: inviteErr.message };

    revalidatePath("/admin");
    return { ok: true as const, message: `Invite sent to ${email}.` };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Invite failed",
    };
  }
}

export async function linkMemberByEmail(memberId: string, email: string) {
  await requireAdmin();
  const sb = supabaseAdmin();

  const mid = String(memberId ?? "").trim();
  if (!mid) throw new Error("memberId is required.");
  const em = String(email ?? "").trim().toLowerCase();
  if (!em) throw new Error("Email is required.");

  const { data: member, error: memberErr } = await sb
    .from("cfm_members")
    .select("id,user_id")
    .eq("id", mid)
    .maybeSingle();

  if (memberErr) throw new Error(memberErr.message);
  if (!member) throw new Error("Member not found.");

  const uid = await findAuthUserIdByEmail(sb, em);
  if (!uid) {
    throw new Error(
      "No auth user found for that email. Ask them to log in once (magic link) then try again.",
    );
  }

  if (member.user_id) {
    if (member.user_id === uid) {
      return { ok: true as const, message: "Already linked." };
    }
    throw new Error("That member record is already linked to another account.");
  }

  const { error: updateErr } = await sb
    .from("cfm_members")
    .update({ user_id: uid })
    .eq("id", member.id)
    .is("user_id", null);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath("/admin");
  revalidatePath("/hub");
  revalidatePath("/leaderboard");
  revalidatePath("/members");

  return { ok: true as const, message: "Member linked successfully." };
}

export async function addAdmin(userId: string, role: "admin" | "moderator" = "admin") {
  // Owner can assign any role, Admin can only assign moderator
  if (role === "admin") {
    await requireOwner();
  } else {
    await requireAdmin();
  }

  const uid = String(userId ?? "").trim();
  if (!uid) throw new Error("userId is required.");

  const sb = await supabaseServer();
  const { error } = await sb.from("cfm_admins").upsert({
    user_id: uid,
    role: role,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/hub");
  revalidatePath("/feed");
  revalidatePath("/leaderboard");
  revalidatePath("/members");
  const msg = role === "moderator" ? "Moderator role granted." : "Admin role granted.";
  return { ok: true as const, message: msg };
}

export async function removeAdmin(userId: string) {
  // Check caller's role first
  await requireAdmin();

  const uid = String(userId ?? "").trim();
  if (!uid) throw new Error("userId is required.");

  const sb = await supabaseServer();

  // Get the target user's role
  const { data: existing, error: existingErr } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", uid)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  
  const targetRole = String((existing as any)?.role ?? "");
  if (targetRole === "owner") {
    throw new Error("Cannot remove the owner.");
  }
  
  // Admins can only remove moderators, not other admins
  if (targetRole === "admin") {
    await requireOwner();
  }

  const { error } = await sb.from("cfm_admins").delete().eq("user_id", uid);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/hub");
  revalidatePath("/feed");
  revalidatePath("/leaderboard");
  revalidatePath("/members");
  return { ok: true as const, message: "Role removed." };
}

async function findAuthUserIdByEmail(sb: ReturnType<typeof supabaseAdmin>, email: string) {
  const target = String(email ?? "").trim().toLowerCase();
  if (!target) return null;

  // Note: supabase-js does not currently expose a getUserByEmail helper.
  // We page through users and match client-side.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = (data?.users ?? []).find(
      (u) => (u.email ?? "").trim().toLowerCase() === target,
    );
    if (match?.id) return match.id;

    const count = (data?.users ?? []).length;
    if (count < 200) break;
  }

  return null;
}

export async function approveApplication(applicationId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();

  const { data: app, error: appErr } = await sb
    .from("cfm_applications")
    .select("id,favorited_username,photo_url,bio,email")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr) throw new Error(appErr.message);
  if (!app) throw new Error("Application not found.");

  const { error: updateErr } = await sb
    .from("cfm_applications")
    .update({ status: "approved" })
    .eq("id", applicationId);
  if (updateErr) throw new Error(updateErr.message);

  const { data: existing } = await sb
    .from("cfm_members")
    .select("id,user_id")
    .eq("favorited_username", app.favorited_username)
    .maybeSingle();

  let memberId: string | null = existing?.id ?? null;
  let memberUserId: string | null = (existing?.user_id as string | null) ?? null;

  if (!memberId) {
    const { error: insertErr } = await sb.from("cfm_members").insert({
      favorited_username: app.favorited_username,
      photo_url: app.photo_url,
      bio: app.bio,
      points: 0,
    });
    if (insertErr) throw new Error(insertErr.message);

    const { data: created, error: createdErr } = await sb
      .from("cfm_members")
      .select("id,user_id")
      .eq("favorited_username", app.favorited_username)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (createdErr) throw new Error(createdErr.message);
    memberId = created?.id ?? null;
    memberUserId = (created?.user_id as string | null) ?? null;
  }

  if (memberId && !memberUserId) {
    const email = String(app.email ?? "").trim().toLowerCase();
    if (email) {
      const uid = await findAuthUserIdByEmail(sb, email);
      if (uid) {
        await sb
          .from("cfm_members")
          .update({ user_id: uid })
          .eq("id", memberId)
          .is("user_id", null);
      }
    }
  }

  revalidatePath("/admin");
  revalidatePath("/members");
}

export async function rejectApplication(applicationId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("cfm_applications")
    .update({ status: "rejected" })
    .eq("id", applicationId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function removeMember(memberId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb.from("cfm_members").delete().eq("id", memberId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/members");
}

export async function createFeedPost(formData: FormData) {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const post_type = String(formData.get("post_type") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title) throw new Error("Title is required.");
  if (!post_type) throw new Error("Post type is required.");
  if (!content) throw new Error("Content is required.");

  const sb = supabaseAdmin();

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

    const objectPath = `feed/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await media.arrayBuffer());

    const { error: uploadErr } = await sb.storage
      .from("cfm-photos")
      .upload(objectPath, bytes, { contentType: mime, upsert: false });

    if (uploadErr) {
      throw new Error(`Media upload failed: ${uploadErr.message}`);
    }

    const { data: publicData } = sb.storage
      .from("cfm-photos")
      .getPublicUrl(objectPath);

    media_url = publicData.publicUrl;
  }

  const { error } = await sb.from("cfm_feed_posts").insert({
    title,
    post_type,
    content,
    media_url,
    media_type,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath("/feed");
}

export async function grantDailyGiftBonus(userId: string) {
  await requireAdmin();

  const authed = await supabaseServer();
  const {
    data: { user },
    error: userErr,
  } = await authed.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  if (!user) throw new Error("Not authenticated.");

  const sb = supabaseAdmin();

  const uid = String(userId ?? "").trim();
  if (!uid) throw new Error("userId is required.");

  const today = todayISODate();

  const { data: existingGift, error: existingErr } = await sb
    .from("cfm_daily_gift_bonus")
    .select("id")
    .eq("user_id", uid)
    .eq("bonus_date", today)
    .limit(1)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existingGift) {
    return {
      ok: true as const,
      message: "Already granted for this user today.",
    };
  }

  const { error: insertErr } = await sb.from("cfm_daily_gift_bonus").insert({
    created_by: user.id,
    user_id: uid,
    gift_date: today,
    bonus_date: today,
    notes: "1k+ coin gift confirmed",
  });

  const insertMsg = (insertErr?.message ?? "").toLowerCase();
  const insertedNew = !insertErr;
  const wasDuplicate = insertMsg.includes("duplicate") || insertMsg.includes("unique");
  if (insertErr && !wasDuplicate) throw new Error(insertErr.message);

  revalidatePath("/admin");
  revalidatePath("/hub");
  revalidatePath("/leaderboard");

  return {
    ok: true as const,
    message: insertedNew
      ? "Gift bonus granted (+5 points)."
      : "Already granted for this user today.",
  };
}

export async function assignAward(formData: FormData) {
  await requireAdmin();

  const user_id = String(formData.get("user_id") ?? "").trim();
  const award_type = String(formData.get("award_type") ?? "").trim();
  const week_start = String(formData.get("week_start") ?? "").trim();
  const week_end = String(formData.get("week_end") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!user_id) throw new Error("Member user_id is required (must be linked).");
  if (!award_type) throw new Error("Award type is required.");
  if (!week_start) throw new Error("Week start is required.");
  if (!week_end) throw new Error("Week end is required.");

  const sb = supabaseAdmin();
  const { error } = await sb.from("cfm_awards").insert({
    user_id,
    award_type,
    week_start,
    week_end,
    notes,
  });

  if (error) throw new Error(error.message);

  try {
    const msg = `Award: ${award_type}`;
    const { error: notieErr } = await sb.from("cfm_noties").insert({
      member_id: user_id,
      user_id,
      actor_user_id: null,
      type: "award",
      entity_type: "award",
      entity_id: null,
      post_id: null,
      comment_id: null,
      message: msg,
      is_read: false,
    });
    if (notieErr) console.error("Failed to create award notie", notieErr.message);

    const { data: followerRows } = await sb
      .from("cfm_follows")
      .select("follower_user_id")
      .eq("followed_user_id", user_id)
      .limit(1000);
    const followerIds = Array.from(
      new Set(
        (followerRows ?? [])
          .map((r: any) => String(r?.follower_user_id ?? "").trim())
          .filter((id) => id && id !== user_id),
      ),
    );
    const ids = followerIds.slice(0, 200);
    if (ids.length) {
      const rows = ids.map((uid) => ({
        member_id: uid,
        user_id: uid,
        actor_user_id: user_id,
        type: "follow_award",
        entity_type: "award",
        entity_id: null,
        post_id: null,
        comment_id: null,
        message: "won an award",
        is_read: false,
      }));
      const { error: fErr } = await sb.from("cfm_noties").insert(rows);
      if (fErr) console.error("Failed to notify followers of award", fErr.message);
    }
  } catch (e) {
    console.error(
      "assignAward notie fanout failed",
      e instanceof Error ? e.message : String(e),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/feed");
  revalidatePath("/awards");
  revalidatePath("/noties");

  return { ok: true as const, message: "Award assigned." };
}
