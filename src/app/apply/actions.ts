"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

type Result =
  | { ok: true }
  | { ok: false; message: string };

export async function submitApplication(formData: FormData): Promise<Result> {
  const favorited_username = String(formData.get("favorited_username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const bio = String(formData.get("short_bio") ?? "").trim() || null;
  const wants_banner = formData.get("wants_banner") === "on";

  if (!favorited_username) {
    return { ok: false, message: "Favorited username is required." };
  }

  const file = formData.get("photo");
  let photo_url: string | null = null;

  try {
    const sb = supabaseAdmin();

    if (file instanceof File && file.size > 0) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `applications/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await sb.storage
        .from(env.photoBucket)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        return { ok: false, message: uploadError.message };
      }

      const { data } = sb.storage.from(env.photoBucket).getPublicUrl(path);
      photo_url = data.publicUrl;
    }

    const { error } = await sb.from("cfm_applications").insert({
      favorited_username,
      email,
      bio,
      wants_banner,
      photo_url,
      status: "pending",
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/members");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Unknown error" };
  }
}
