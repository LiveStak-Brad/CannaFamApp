import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeSiteUrl(siteUrl: string) {
  const site = String(siteUrl ?? "").trim();
  const base = site.endsWith("/") ? site.slice(0, -1) : site;
  return base || "";
}

function isWebOriginAllowed(req: NextRequest, baseUrl: string) {
  const origin = String(req.headers.get("origin") ?? "").trim();
  const referer = String(req.headers.get("referer") ?? "").trim();
  return (
    (origin && origin === baseUrl) ||
    (referer && (referer === baseUrl || referer.startsWith(`${baseUrl}/`)))
  );
}

function getClientIp(req: NextRequest) {
  const xff = String(req.headers.get("x-forwarded-for") ?? "").trim();
  if (xff) return xff.split(",")[0]?.trim() || "";
  return String(req.headers.get("x-real-ip") ?? "").trim();
}

type RateRec = { count: number; resetAt: number };
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function rateLimitOrNull(key: string): string | null {
  const g = globalThis as any;
  if (!g.__cfmRateLimit) g.__cfmRateLimit = new Map<string, RateRec>();
  const m: Map<string, RateRec> = g.__cfmRateLimit;
  const now = Date.now();

  const rec = m.get(key);
  if (!rec || rec.resetAt <= now) {
    m.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }

  if (rec.count >= RATE_MAX) {
    const secs = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
    return `Rate limit exceeded. Try again in ${secs}s.`;
  }

  rec.count += 1;
  m.set(key, rec);
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return safeJson({ error: "Unauthorized" }, 401);

    const ip = getClientIp(req);
    const rlKey = `coins_web_checkout:${user.id}:${ip}`;
    const rlMsg = rateLimitOrNull(rlKey);
    if (rlMsg) return safeJson({ error: rlMsg }, 429);

    const body = (await req.json().catch(() => ({}))) as { sku?: string };
    const sku = String(body?.sku ?? "").trim();
    if (!sku) return safeJson({ error: "Missing sku" }, 400);

    const { data: pack, error: packErr } = await sb
      .from("coin_packages")
      .select("platform,sku,price_usd_cents,coins,is_active")
      .eq("platform", "web")
      .eq("sku", sku)
      .eq("is_active", true)
      .maybeSingle();

    if (packErr) return safeJson({ error: packErr.message }, 500);
    if (!pack) return safeJson({ error: "Package not found" }, 404);

    const priceUsdCents = Number((pack as any).price_usd_cents ?? 0);
    const coins = Number((pack as any).coins ?? 0);

    if (!Number.isFinite(priceUsdCents) || priceUsdCents <= 0) {
      return safeJson({ error: "Invalid package price" }, 500);
    }
    if (!Number.isFinite(coins) || coins <= 0) {
      return safeJson({ error: "Invalid package coins" }, 500);
    }

    const base = normalizeSiteUrl(env.siteUrl);
    if (!base) return safeJson({ error: "Missing NEXT_PUBLIC_SITE_URL" }, 500);

    if (!isWebOriginAllowed(req, base)) {
      return safeJson({ error: "Forbidden" }, 403);
    }

    const successUrl = `${base}/account?coins=success&sku=${encodeURIComponent(sku)}`;
    const cancelUrl = `${base}/account?coins=cancel&sku=${encodeURIComponent(sku)}`;

    const idempotencyKey = `web:coins:${randomUUID()}`;

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: priceUsdCents,
            product_data: {
              name: `Coins (${coins.toLocaleString()})`,
            },
          },
        },
      ],
      metadata: {
        type: "coin_purchase",
        user_id: user.id,
        sku,
        coins: String(coins),
        idempotency_key: idempotencyKey,
      },
    });

    return safeJson({ url: session.url, session_id: session.id, idempotency_key: idempotencyKey });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeJson({ error: message }, 500);
  }
}
