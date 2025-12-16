"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";

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

    try {
      const admin = supabaseAdminOrNull();
      if (!admin) {
        console.error("Notifications disabled: missing SUPABASE_SERVICE_ROLE_KEY");
      }
      if (admin) {
        const { error: notieErr } = await admin.from("cfm_noties").insert({
          member_id: target,
          user_id: target,
          actor_user_id: user.id,
          type: "follow",
          entity_type: "user",
          entity_id: target,
          message: "followed you",
          post_id: null,
          comment_id: null,
          is_read: false,
        });
        if (notieErr) console.error("Failed to create follow notie", notieErr.message);
      }
    } catch (e) {
      console.error(
        "setFollow notie insert failed",
        e instanceof Error ? e.message : String(e),
      );
    }
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
  revalidatePath("/noties");
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
