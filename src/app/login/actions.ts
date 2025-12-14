"use server";

import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

type Result =
  | { ok: true }
  | { ok: false; message: string };

async function getBaseUrlFromRequestOrEnv() {
  const base = env.siteUrl?.trim();
  if (base) return base;

  const h = await headers();
  const origin = h.get("origin") ?? "";
  return origin;
}

export async function sendMagicLink(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Email is required." };

  const baseUrl = await getBaseUrlFromRequestOrEnv();
  if (!baseUrl) return { ok: false, message: "Missing site URL." };
  const emailRedirectTo = new URL("/auth/callback", baseUrl).toString();

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
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

  const baseUrl = await getBaseUrlFromRequestOrEnv();
  if (!baseUrl) return { ok: false, message: "Missing site URL." };
  const emailRedirectTo = new URL("/auth/callback", baseUrl).toString();

  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
    },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function sendPasswordReset(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Email is required." };

  const baseUrl = await getBaseUrlFromRequestOrEnv();
  if (!baseUrl) return { ok: false, message: "Missing site URL." };
  const redirectTo = new URL("/auth/callback", baseUrl);
  redirectTo.searchParams.set("next", "/account");

  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
