"use server";

import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";
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
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
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
  const xfProto = (h.get("x-forwarded-proto") ?? "").trim();
  const xfHost = (h.get("x-forwarded-host") ?? "").trim();
  const host = (h.get("host") ?? "").trim();

  const proto = xfProto || "https";
  const finalHost = xfHost || host;
  if (finalHost) return `${proto}://${finalHost}`;

  const origin = (h.get("origin") ?? "").trim();
  return origin;
}

export async function sendMagicLink(formData: FormData): Promise<Result> {
  try {
    const email = String(formData.get("email") ?? formData.get("identifier") ?? "")
      .trim()
      .toLowerCase();
    if (!email) return { ok: false, message: "Email is required." };
    if (!email.includes("@")) {
      return { ok: false, message: "Magic link requires an email address." };
    }

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
    const identifierRaw = String(formData.get("identifier") ?? formData.get("email") ?? "").trim();
    const identifier = identifierRaw.toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!identifier) return { ok: false, message: "Email or username is required." };
    if (!password) return { ok: false, message: "Password is required." };

    let email = identifier;
    const looksLikeEmail = email.includes("@");
    if (!looksLikeEmail) {
      const username = identifierRaw.replace(/^@/, "").trim();
      const admin = supabaseAdminOrNull();
      if (!admin) {
        return { ok: false, message: "Username login is not available right now. Please use your email." };
      }

      const lookupMember = async (uname: string) => {
        const { data, error } = await admin
          .from("cfm_members")
          .select("user_id")
          .ilike("favorited_username", uname)
          .limit(1)
          .maybeSingle();
        return { data, error };
      };

      const first = await lookupMember(username);
      if (first.error) return { ok: false, message: first.error.message || formatErrorMessage(first.error) };
      const second = !first.data ? await lookupMember(`@${username}`) : { data: first.data, error: null };
      if (second.error) return { ok: false, message: second.error.message || formatErrorMessage(second.error) };

      const userId = String((second.data as any)?.user_id ?? "").trim();
      if (!userId) {
        return { ok: false, message: "Username not found. Try your email, or create your profile first." };
      }

      const { data: u, error: userErr } = await admin.auth.admin.getUserById(userId);
      if (userErr) return { ok: false, message: userErr.message || formatErrorMessage(userErr) };
      const resolved = String(u.user?.email ?? "").trim().toLowerCase();
      if (!resolved) {
        return { ok: false, message: "Could not resolve email for that username. Please use your email." };
      }
      email = resolved;
    }

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
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const username = String(formData.get("username") ?? formData.get("favorited_username") ?? "")
      .trim()
      .replace(/^@/, "");
    if (!email) return { ok: false, message: "Email is required." };
    if (!password) return { ok: false, message: "Password is required." };
    if (!username) return { ok: false, message: "Username is required." };

    const baseUrl = await getBaseUrlFromRequestOrEnv();
    if (!baseUrl) return { ok: false, message: "Missing site URL." };
    const emailRedirectTo = new URL("/auth/callback", baseUrl).toString();

    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          username,
          favorited_username: username,
        },
      },
    });
    if (error) return { ok: false, message: error.message || formatErrorMessage(error) };

    const newUserId = String((data as any)?.user?.id ?? "").trim();
    if (newUserId) {
      const admin = supabaseAdminOrNull();
      if (admin) {
        try {
          const { error: upsertErr } = await admin
            .from("cfm_members")
            .upsert(
              {
                user_id: newUserId,
                username,
                favorited_username: username,
                points: 0,
              },
              { onConflict: "user_id" },
            );
          if (upsertErr) {
            console.warn("signUpWithPassword: failed to pre-create cfm_members", upsertErr);
          }

          try {
            const { data: csRow, error: csErr } = await admin
              .from("cfm_members")
              .select("user_id")
              .ilike("favorited_username", "cannastreams")
              .limit(1)
              .maybeSingle();
            if (csErr) {
              console.warn("signUpWithPassword: cannastreams lookup failed", csErr);
            } else {
              const csId = String((csRow as any)?.user_id ?? "").trim();
              if (csId && csId !== newUserId) {
                const { error: f1 } = await admin.from("cfm_follows").upsert(
                  { follower_user_id: newUserId, followed_user_id: csId },
                  { onConflict: "follower_user_id,followed_user_id" },
                );
                if (f1) console.warn("signUpWithPassword: auto-follow cannastreams failed", f1);

                const { error: f2 } = await admin.from("cfm_follows").upsert(
                  { follower_user_id: csId, followed_user_id: newUserId },
                  { onConflict: "follower_user_id,followed_user_id" },
                );
                if (f2) console.warn("signUpWithPassword: auto-follow back failed", f2);
              }
            }
          } catch (e) {
            console.warn("signUpWithPassword: auto-follow cannastreams failed", e);
          }
        } catch (e) {
          console.warn("signUpWithPassword: failed to pre-create cfm_members", e);
        }
      } else {
        console.warn(
          "signUpWithPassword: SUPABASE_SERVICE_ROLE_KEY is missing; cannot pre-create cfm_members row",
        );
      }
    }

    return { ok: true };
  } catch (err) {
    console.error("signUpWithPassword failed", err);
    return { ok: false, message: formatErrorMessage(err) };
  }
}

export async function sendPasswordReset(formData: FormData): Promise<Result> {
  try {
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
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
