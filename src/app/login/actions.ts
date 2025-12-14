"use server";

import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

type Result =
  | { ok: true }
  | { ok: false; message: string };

export async function sendMagicLink(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Email is required." };

  const h = await headers();
  const origin = h.get("origin") ?? "";
  if (!origin) return { ok: false, message: "Missing request origin." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function signInWithPassword(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email) return { ok: false, message: "Email is required." };
  if (!password) return { ok: false, message: "Password is required." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function signUpWithPassword(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email) return { ok: false, message: "Email is required." };
  if (!password) return { ok: false, message: "Password is required." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function sendPasswordReset(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Email is required." };

  const h = await headers();
  const origin = h.get("origin") ?? "";
  if (!origin) return { ok: false, message: "Missing request origin." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/account`,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
