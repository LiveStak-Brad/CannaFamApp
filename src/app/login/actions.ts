"use server";

import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

type Result =
  | { ok: true }
  | { ok: false; message: string };

function formatErrorMessage(err: unknown) {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || err.name || "Unknown error.";
  try {
    const s = JSON.stringify(err);
    return s && s !== "{}" ? s : "Unknown error.";
  } catch {
    return String(err);
  }
}

export async function resendSignupVerification(formData: FormData): Promise<Result> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return { ok: false, message: "Email is required." };

    const baseUrl = await getBaseUrlFromRequestOrEnv();
    if (!baseUrl) return { ok: false, message: "Missing site URL." };
    const emailRedirectTo = new URL("/auth/callback", baseUrl).toString();

    const sb = await supabaseServer();
    const { error } = await sb.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) return { ok: false, message: error.message || formatErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    console.error("resendSignupVerification failed", err);
    return { ok: false, message: formatErrorMessage(err) };
  }
}

async function getBaseUrlFromRequestOrEnv() {
  const base = env.siteUrl?.trim();
  if (base) return base;

  const h = await headers();
  const origin = h.get("origin") ?? "";
  return origin;
}

export async function sendMagicLink(formData: FormData): Promise<Result> {
  try {
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

    if (error) return { ok: false, message: error.message || formatErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    console.error("sendMagicLink failed", err);
    return { ok: false, message: formatErrorMessage(err) };
  }
}

export async function signInWithPassword(formData: FormData): Promise<Result> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email) return { ok: false, message: "Email is required." };
    if (!password) return { ok: false, message: "Password is required." };

    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message || formatErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    console.error("signInWithPassword failed", err);
    return { ok: false, message: formatErrorMessage(err) };
  }
}

export async function signUpWithPassword(formData: FormData): Promise<Result> {
  try {
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
    if (error) return { ok: false, message: error.message || formatErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    console.error("signUpWithPassword failed", err);
    return { ok: false, message: formatErrorMessage(err) };
  }
}

export async function sendPasswordReset(formData: FormData): Promise<Result> {
  try {
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
    if (error) return { ok: false, message: error.message || formatErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    console.error("sendPasswordReset failed", err);
    return { ok: false, message: formatErrorMessage(err) };
  }
}
