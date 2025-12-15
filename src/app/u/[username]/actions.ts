"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedMember } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function setFollow(targetUserId: string, shouldFollow: boolean) {
  const user = await requireApprovedMember();
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
}
