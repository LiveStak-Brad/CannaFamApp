"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireApprovedMember } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";

const LINK_VISIT_TYPES = [
  "buy_coins",
  "instagram",
  "tiktok",
  "facebook",
  "discord",
  "x",
  "youtube",
  "snapchat",
] as const;
export type LinkVisitType = (typeof LINK_VISIT_TYPES)[number];

const LINK_VISIT_DAILY_CAP = 7;

export async function logLiveShare(platform: string) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  const allowed = ["Facebook", "Instagram", "TikTok", "X", "Discord", "Other"];
  if (!allowed.includes(platform)) throw new Error("Invalid platform.");

  const today = todayISODate();

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
      todayCount: used,
      pointsEarnedToday: used,
      remaining: 0,
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
  if (insertErr && !wasDuplicate) {
    throw new Error(insertErr.message);
  }

  if (insertedNew) {
  }

  const newCount = Math.min(DAILY_CAP, used + (insertedNew ? 1 : 0));
  revalidatePath("/");
  revalidatePath("/hub");

  return {
    ok: true as const,
    message: insertedNew
      ? `Logged live share: ${platform} (+1 point)`
      : `Already logged today for ${platform}.`,
    todayCount: newCount,
    pointsEarnedToday: newCount,
    remaining: Math.max(0, DAILY_CAP - newCount),
  };
}

export async function logLinkVisit(linkType: string) {
  const user = await requireApprovedMember();
  const sb = await supabaseServer();

  if (!LINK_VISIT_TYPES.includes(linkType as LinkVisitType)) {
    throw new Error("Invalid link type.");
  }

  const today = todayISODate();

  // Check daily cap
  const { count: todayCount, error: countErr } = await sb
    .from("cfm_link_visits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("visit_date", today);

  if (countErr) throw new Error(countErr.message);

  const used = todayCount ?? 0;
  if (used >= LINK_VISIT_DAILY_CAP) {
    return {
      ok: false as const,
      message: `Daily limit reached. Max ${LINK_VISIT_DAILY_CAP} link visits/day.`,
      alreadyVisited: true,
    };
  }

  // Check if already visited this link today
  const { data: existing } = await sb
    .from("cfm_link_visits")
    .select("id")
    .eq("user_id", user.id)
    .eq("link_type", linkType)
    .eq("visit_date", today)
    .maybeSingle();

  if (existing) {
    return {
      ok: true as const,
      message: `Already visited ${linkType} today.`,
      alreadyVisited: true,
    };
  }

  const { error: insertErr } = await sb.from("cfm_link_visits").insert({
    user_id: user.id,
    link_type: linkType,
    visit_date: today,
  });

  if (insertErr) {
    const msg = insertErr.message.toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return {
        ok: true as const,
        message: `Already visited ${linkType} today.`,
        alreadyVisited: true,
      };
    }
    throw new Error(insertErr.message);
  }

  revalidatePath("/");
  revalidatePath("/noties");
  revalidatePath("/leaderboard");

  return {
    ok: true as const,
    message: `🔎 Link visit logged (+1 point).`,
    alreadyVisited: false,
  };
}
