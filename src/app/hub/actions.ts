"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";

function guessExtFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return null;
}

export async function checkIn() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const today = todayISODate();

  const { error: insertError } = await sb.from("cfm_checkins").insert({
    user_id: user.id,
    checkin_date: today,
  });

  if (insertError) {
    const msg = insertError.message.toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("unique")) {
      throw new Error(insertError.message);
    }
    revalidatePath("/hub");
    return { ok: true as const, message: "✅ Already checked in today." };
  }

  revalidatePath("/hub");
  return { ok: true as const, message: "✅ Check-in logged (+1)" };
}

export async function dailySpin() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const today = todayISODate();
  const pointsAwarded = randomInt(1, 6); // 1..5

  const { error: insertErr } = await sb.from("cfm_daily_spins").insert({
    user_id: user.id,
    spin_date: today,
    points_awarded: pointsAwarded,
  });

  if (insertErr) {
    const msg = insertErr.message.toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("unique")) {
      throw new Error(insertErr.message);
    }
    revalidatePath("/hub");
    return { ok: true as const, message: "🎡 Already spun today." };
  }

  revalidatePath("/hub");
  revalidatePath("/leaderboard");
  return { ok: true as const, message: `🎡 You spun +${pointsAwarded}` };
}

export async function updateMyProfile(formData: FormData) {
  const user = await requireUser();
  const sb = await supabaseServer();

  const usernameRaw = String(formData.get("favorited_username") ?? "");
  const favorited_username = usernameRaw.trim();

  const bioRaw = String(formData.get("bio") ?? "");
  const bio = bioRaw.trim() || null;

  const photo = formData.get("photo");
  let photo_url: string | null = null;

  if (!favorited_username) throw new Error("Username is required.");

  if (photo instanceof File && photo.size > 0) {
    const mime = (photo.type || "").toLowerCase();
    if (!mime.startsWith("image/")) {
      throw new Error("Profile photo must be an image.");
    }

    const originalExt = (photo.name.split(".").pop() || "").toLowerCase();
    const ext =
      (originalExt && /^[a-z0-9]+$/.test(originalExt) ? originalExt : "") ||
      guessExtFromMime(mime) ||
      "jpg";

    const objectPath = `profiles/${user.id}/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await photo.arrayBuffer());

    const { error: uploadErr } = await sb.storage
      .from("cfm-photos")
      .upload(objectPath, bytes, { contentType: mime, upsert: false });

    if (uploadErr) {
      throw new Error(`Photo upload failed: ${uploadErr.message}`);
    }

    const { data: publicData } = sb.storage.from("cfm-photos").getPublicUrl(objectPath);
    photo_url = publicData.publicUrl;
  }

  const { error } = await sb
    .from("cfm_members")
    .update(photo_url ? { favorited_username, photo_url, bio } : { favorited_username, bio })
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/hub");
  revalidatePath("/leaderboard");
  revalidatePath("/members");
  revalidatePath("/feed");
}
