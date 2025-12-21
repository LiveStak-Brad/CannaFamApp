import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function base64Url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getGoogleAccessToken() {
  const raw = mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw) as { client_email?: string; private_key?: string };
  const clientEmail = String(creds.client_email ?? "").trim();
  const privateKey = String(creds.private_key ?? "").trim();
  if (!clientEmail || !privateKey) throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${signingInput}.${base64Url(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`Google OAuth failed: ${String(json?.error_description ?? json?.error ?? res.status)}`);
  }

  const token = String(json?.access_token ?? "").trim();
  if (!token) throw new Error("Google OAuth missing access_token");
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return safeJson({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      purchase_token?: string;
      subscription_id?: string;
      package_name?: string;
    };

    const purchaseToken = String(body?.purchase_token ?? "").trim();
    const subscriptionId = String(body?.subscription_id ?? "").trim();
    const packageName = String(body?.package_name ?? "").trim() || String(process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "").trim();

    if (!purchaseToken) return safeJson({ error: "Missing purchase_token" }, 400);
    if (!subscriptionId) return safeJson({ error: "Missing subscription_id" }, 400);
    if (!packageName) return safeJson({ error: "Missing package_name" }, 400);

    const accessToken = await getGoogleAccessToken();

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName,
    )}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      return safeJson({ error: "Google verification failed", details: json ?? null }, 400);
    }

    const expiryMs = Number(json?.expiryTimeMillis ?? 0);
    const now = Date.now();
    const isActive = Number.isFinite(expiryMs) && expiryMs > now;
    const expiresAtIso = isActive ? new Date(expiryMs).toISOString() : (Number.isFinite(expiryMs) && expiryMs > 0 ? new Date(expiryMs).toISOString() : null);

    const admin = supabaseAdminOrNull();
    if (!admin) return safeJson({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const { error: memberErr } = await admin
      .from("cfm_members")
      .update({ is_verified: isActive })
      .eq("user_id", user.id);

    if (memberErr) return safeJson({ error: memberErr.message }, 500);

    return safeJson({
      ok: true,
      platform: "android",
      package_name: packageName,
      subscription_id: subscriptionId,
      is_active: isActive,
      expires_at: expiresAtIso,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeJson({ error: message }, 500);
  }
}
