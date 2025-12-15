import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { assertPublicEnv, env } from "@/lib/env";

function safeNextPath(next: string | null) {
  const n = String(next ?? "").trim();
  if (n.startsWith("/")) return n;
  return "/hub";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");
  const next = safeNextPath(url.searchParams.get("next"));

  if (err || errDesc) {
    const loginUrl = new URL("/login", url);
    loginUrl.searchParams.set("error", err ?? "auth_error");
    if (errDesc) loginUrl.searchParams.set("message", errDesc);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(new URL(next, url));

  if (!code && !(token_hash && type)) {
    console.error("/auth/callback missing params", {
      hasCode: !!code,
      hasTokenHash: !!token_hash,
      type,
    });
    const loginUrl = new URL("/login", url);
    loginUrl.searchParams.set("error", "missing_params");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  assertPublicEnv();

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("/auth/callback exchangeCodeForSession failed", error);
      const msg = String((error as any)?.message ?? "");
      if (msg.toLowerCase().includes("code challenge") && msg.toLowerCase().includes("code verifier")) {
        const loginUrl = new URL("/login", url);
        loginUrl.searchParams.set("message", "Email verified. Please sign in with your email + password.");
        loginUrl.searchParams.set("next", next);
        return NextResponse.redirect(loginUrl);
      }
      const loginUrl = new URL("/login", url);
      loginUrl.searchParams.set("error", "invalid_or_expired");
      loginUrl.searchParams.set("message", error.message);
      loginUrl.searchParams.set("next", next);
      return NextResponse.redirect(loginUrl);
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (error) {
      console.error("/auth/callback verifyOtp failed", { type, error });
      const loginUrl = new URL("/login", url);
      loginUrl.searchParams.set("error", "invalid_or_expired");
      loginUrl.searchParams.set("message", error.message);
      loginUrl.searchParams.set("next", next);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}
