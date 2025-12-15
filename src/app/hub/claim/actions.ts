"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

type Result =
  | { ok: true }
  | { ok: false; message: string };

export async function createMyProfile(formData: FormData): Promise<Result> {
  const user = await requireUser();

  const favorited_username = String(
    formData.get("favorited_username") ?? "",
  ).trim();

  if (!favorited_username) {
    return { ok: false, message: "Favorited username is required." };
  }

  const sb = await supabaseServer();

  const { data: existing, error: existingErr } = await sb
    .from("cfm_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingErr) return { ok: false, message: existingErr.message };
  if (existing?.id) {
    revalidatePath("/hub");
    return { ok: true };
  }

  const { error: insertErr } = await sb.from("cfm_members").insert({
    user_id: user.id,
    favorited_username,
    points: 0,
  });

  if (insertErr) return { ok: false, message: insertErr.message };

  revalidatePath("/hub");
  return { ok: true };
}
