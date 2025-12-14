"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Result =
  | { ok: true }
  | { ok: false; message: string };

export async function claimMembership(formData: FormData): Promise<Result> {
  const user = await requireUser();

  const favorited_username = String(
    formData.get("favorited_username") ?? "",
  ).trim();

  if (!favorited_username) {
    return { ok: false, message: "Favorited username is required." };
  }

  const email = (user.email ?? "").toLowerCase();
  if (!email) {
    return { ok: false, message: "Your account has no email address." };
  }

  const sb = supabaseAdmin();

  const { data: app, error: appErr } = await sb
    .from("cfm_applications")
    .select("id,email,status")
    .eq("favorited_username", favorited_username)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (appErr) return { ok: false, message: appErr.message };
  if (!app) {
    return {
      ok: false,
      message: "No approved application found for that username.",
    };
  }

  if (!app.email) {
    return {
      ok: false,
      message:
        "This approved application has no email on file. Ask the admin to link your account.",
    };
  }

  if (String(app.email).toLowerCase() !== email) {
    return {
      ok: false,
      message:
        "Email mismatch. Sign in with the email used on your application.",
    };
  }

  const { data: member, error: memberErr } = await sb
    .from("cfm_members")
    .select("id,user_id")
    .eq("favorited_username", favorited_username)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memberErr) return { ok: false, message: memberErr.message };
  if (!member) {
    return {
      ok: false,
      message:
        "Approved application found, but no member record exists yet. Ask the admin to approve again.",
    };
  }

  if (member.user_id) {
    if (member.user_id === user.id) {
      revalidatePath("/hub");
      return { ok: true };
    }
    return {
      ok: false,
      message: "That member record is already linked to another account.",
    };
  }

  const { error: updateErr } = await sb
    .from("cfm_members")
    .update({ user_id: user.id })
    .eq("id", member.id)
    .is("user_id", null);

  if (updateErr) return { ok: false, message: updateErr.message };

  revalidatePath("/hub");
  return { ok: true };
}
