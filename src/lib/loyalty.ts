"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayISODate } from "@/lib/utils";

function yesterdayISODate(today: string) {
  const [yyyy, mm, dd] = today.split("-").map((v) => Number(v));
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function awardPointsAndUpdateStreak(
  userId: string,
  pointsDelta: number,
  activityDate: string = todayISODate(),
) {
  if (!userId) throw new Error("userId is required");
  if (!Number.isFinite(pointsDelta)) throw new Error("pointsDelta is required");

  const admin = supabaseAdmin();

  const { data: member, error: memberErr } = await admin
    .from("cfm_members")
    .select("id, points, streak_count, last_activity_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (memberErr) throw new Error(memberErr.message);
  if (!member) throw new Error("Member record not found.");

  const today = activityDate;
  const yesterday = yesterdayISODate(today);

  const last = member.last_activity_date as string | null;
  const currentStreak = Number(member.streak_count ?? 0);

  let nextStreak = currentStreak;
  let shouldCountToday = true;

  if (last === today) {
    shouldCountToday = false;
  } else if (last === yesterday) {
    nextStreak = Math.max(0, currentStreak) + 1;
  } else {
    nextStreak = 1;
  }

  const streakPoint = shouldCountToday ? 1 : 0;
  const nextPoints = Number(member.points ?? 0) + pointsDelta + streakPoint;

  const updatePayload: Record<string, unknown> = {
    points: nextPoints,
  };

  if (shouldCountToday) {
    updatePayload.streak_count = nextStreak;
    updatePayload.last_activity_date = today;
    updatePayload.last_streak_date = today;
  }

  const { error: updateErr } = await admin
    .from("cfm_members")
    .update(updatePayload)
    .eq("id", member.id);

  if (updateErr) throw new Error(updateErr.message);

  return {
    ok: true as const,
    points: nextPoints,
    streak_count: shouldCountToday ? nextStreak : currentStreak,
  };
}
