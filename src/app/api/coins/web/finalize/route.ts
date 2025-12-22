import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return safeJson({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      session_id?: string;
      payment_intent_id?: string;
    };

    const sessionId = String(body?.session_id ?? "").trim();
    const paymentIntentId = String(body?.payment_intent_id ?? "").trim();

    if (!sessionId && !paymentIntentId) {
      return safeJson({ ok: false, error: "Missing session_id or payment_intent_id" }, 400);
    }

    if (sessionId) {
      if (!sessionId.startsWith("cs_")) return safeJson({ ok: false, error: "Invalid session_id" }, 400);

      console.info("[cfm][coins][finalize] start", { user_id: user.id, session_id: sessionId });

      const session = await stripe().checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });

      const status = String((session as any).status ?? "").trim();
      const paymentStatus = String((session as any).payment_status ?? "").trim();
      const clientRef = String((session as any).client_reference_id ?? "").trim();

      console.info("[cfm][coins][finalize] session", {
        session_id: sessionId,
        status,
        payment_status: paymentStatus,
        client_reference_id_present: Boolean(clientRef),
      });

      if (clientRef && clientRef !== user.id) {
        return safeJson({ ok: false, error: "Session does not belong to current user" }, 403);
      }

      if (paymentStatus !== "paid") {
        return safeJson({ ok: false, error: `Not paid (${paymentStatus || status || "unknown"})` }, 400);
      }

      const meta: any = (session as any).metadata ?? {};
      const pi: any = (session as any).payment_intent ?? null;

      const type = String(meta?.type ?? "").trim() || String(pi?.metadata?.type ?? "").trim();
      const userId = String(meta?.user_id ?? "").trim() || String(pi?.metadata?.user_id ?? "").trim() || user.id;
      const coinsRaw = String(meta?.coins ?? "").trim() || String(pi?.metadata?.coins ?? "").trim();
      const coins = Number(coinsRaw || 0);

      const amountUsdCents =
        typeof (session as any).amount_total === "number" && (session as any).amount_total > 0
          ? Number((session as any).amount_total)
          : typeof pi?.amount_received === "number" && pi.amount_received > 0
            ? Number(pi.amount_received)
            : Number(pi?.amount ?? 0);

      const idempotencyKey =
        String(meta?.idempotency_key ?? "").trim() ||
        String(pi?.metadata?.idempotency_key ?? "").trim() ||
        `stripe:cs:${sessionId}`;

      console.info("[cfm][coins][finalize] extracted", {
        type,
        user_id: userId,
        coins,
        amount_usd_cents: amountUsdCents,
        idempotency_key_present: Boolean(idempotencyKey),
        payment_intent_id: String(pi?.id ?? ""),
      });

      if (type !== "coin_purchase") {
        return safeJson({ ok: false, error: "Not a coin_purchase session" }, 400);
      }

      if (userId !== user.id) {
        return safeJson({ ok: false, error: "Coin purchase user mismatch" }, 403);
      }

      if (!Number.isFinite(coins) || coins <= 0) {
        return safeJson({ ok: false, error: "Invalid coins" }, 400);
      }

      if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
        return safeJson({ ok: false, error: "Invalid amount" }, 400);
      }

      const admin = supabaseAdminOrNull();
      if (!admin) return safeJson({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

      const providerOrderId = String(pi?.id ?? sessionId).trim();

      const { data, error } = await (admin as any).rpc("cfm_finalize_coin_purchase", {
        p_provider: "stripe",
        p_provider_order_id: providerOrderId,
        p_user_id: user.id,
        p_coins: Math.floor(coins),
        p_amount_usd_cents: Math.floor(amountUsdCents),
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        const msg = String(error.message ?? "").toLowerCase();
        const isDup = msg.includes("duplicate") || msg.includes("already") || msg.includes("unique");
        console.error("[cfm][coins][finalize] rpc error", {
          session_id: sessionId,
          provider_order_id: providerOrderId,
          error: error.message,
          duplicate_hint: isDup,
        });
        if (isDup) return safeJson({ ok: true, duplicate: true }, 200);
        return safeJson({ ok: false, error: error.message }, 500);
      }

      console.info("[cfm][coins][finalize] ok", { session_id: sessionId, provider_order_id: providerOrderId });

      return safeJson({ ok: true, result: data ?? null }, 200);
    }

    if (!paymentIntentId.startsWith("pi_")) {
      return safeJson({ ok: false, error: "Invalid payment_intent_id" }, 400);
    }

    console.info("[cfm][coins][finalize] start", { user_id: user.id, payment_intent_id: paymentIntentId });

    const pi: any = await stripe().paymentIntents.retrieve(paymentIntentId);
    const piStatus = String(pi?.status ?? "").trim();
    if (piStatus !== "succeeded") {
      return safeJson({ ok: false, error: `Not succeeded (${piStatus || "unknown"})` }, 400);
    }

    const meta: any = pi?.metadata ?? {};
    const type = String(meta?.type ?? "").trim();
    const userId = String(meta?.user_id ?? "").trim();
    const coinsRaw = String(meta?.coins ?? "").trim();
    const coins = Number(coinsRaw || 0);

    const amountUsdCents =
      typeof pi?.amount_received === "number" && pi.amount_received > 0
        ? Number(pi.amount_received)
        : Number(pi?.amount ?? 0);

    const idempotencyKey = String(meta?.idempotency_key ?? "").trim() || `stripe:pi:${paymentIntentId}`;

    console.info("[cfm][coins][finalize] extracted", {
      type,
      user_id: userId,
      coins,
      amount_usd_cents: amountUsdCents,
      idempotency_key_present: Boolean(idempotencyKey),
      payment_intent_id: paymentIntentId,
    });

    if (type !== "coin_purchase") {
      return safeJson({ ok: false, error: "Not a coin_purchase payment intent" }, 400);
    }

    if (!userId || userId !== user.id) {
      return safeJson({ ok: false, error: "Coin purchase user mismatch" }, 403);
    }

    if (!Number.isFinite(coins) || coins <= 0) {
      return safeJson({ ok: false, error: "Invalid coins" }, 400);
    }

    if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
      return safeJson({ ok: false, error: "Invalid amount" }, 400);
    }

    const admin = supabaseAdminOrNull();
    if (!admin) return safeJson({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const providerOrderId = paymentIntentId;

    const { data, error } = await (admin as any).rpc("cfm_finalize_coin_purchase", {
      p_provider: "stripe",
      p_provider_order_id: providerOrderId,
      p_user_id: user.id,
      p_coins: Math.floor(coins),
      p_amount_usd_cents: Math.floor(amountUsdCents),
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      const isDup = msg.includes("duplicate") || msg.includes("already") || msg.includes("unique");
      console.error("[cfm][coins][finalize] rpc error", {
        payment_intent_id: paymentIntentId,
        provider_order_id: providerOrderId,
        error: error.message,
        duplicate_hint: isDup,
      });
      if (isDup) return safeJson({ ok: true, duplicate: true }, 200);
      return safeJson({ ok: false, error: error.message }, 500);
    }

    console.info("[cfm][coins][finalize] ok", { payment_intent_id: paymentIntentId, provider_order_id: providerOrderId });

    return safeJson({ ok: true, result: data ?? null }, 200);

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cfm][coins][finalize] error", { message });
    return safeJson({ ok: false, error: message }, 500);
  }
}
