"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function setFollow(targetUserId: string, shouldFollow: boolean) {
  const user = await requireUser();
  const sb = await supabaseServer();

  const target = String(targetUserId ?? "").trim();
  if (!target) throw new Error("Invalid target user.");
  if (target === String(user.id)) throw new Error("You can’t follow yourself.");

  if (shouldFollow) {
    const { error } = await sb.from("cfm_follows").insert({
      follower_user_id: user.id,
      followed_user_id: target,
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from("cfm_follows")
      .delete()
      .eq("follower_user_id", user.id)
      .eq("followed_user_id", target);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/u");
  revalidatePath("/members");
  revalidatePath("/leaderboard");
  revalidatePath("/feed");
}

export async function getIsFollowing(targetUserId: string): Promise<boolean> {
  const user = await requireUser();
  const sb = await supabaseServer();

  const target = String(targetUserId ?? "").trim();
  if (!target) return false;
  if (target === String(user.id)) return false;

  const { data } = await sb
    .from("cfm_follows")
    .select("id")
    .eq("follower_user_id", user.id)
    .eq("followed_user_id", target)
    .maybeSingle();

  return !!data;
}
