import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function finalizeCoinPurchaseOrError(params: {
  admin: any;
  providerOrderId: string;
  userId: string;
  coins: number;
  amountUsdCents: number;
  idempotencyKey: string;
  eventId: string;
}) {
  const { admin, providerOrderId, userId, coins, amountUsdCents, idempotencyKey, eventId } = params;

  console.info("[cfm][stripe-webhook] finalize attempt", {
    event_id: eventId,
    provider_order_id: providerOrderId,
    user_id: userId,
    coins,
    amount_usd_cents: amountUsdCents,
    idempotency_key_present: Boolean(idempotencyKey),
  });

  const { data, error } = await admin.rpc("cfm_finalize_coin_purchase", {
    p_provider: "stripe",
    p_provider_order_id: providerOrderId,
    p_user_id: userId,
    p_coins: Math.floor(coins),
    p_amount_usd_cents: Math.floor(amountUsdCents),
    p_idempotency_key: idempotencyKey || `stripe:event:${eventId}`,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    const isDup = msg.includes("duplicate") || msg.includes("already") || msg.includes("unique");
    console.error("[cfm][stripe-webhook] finalize error", {
      event_id: eventId,
      provider_order_id: providerOrderId,
      error: error.message,
      duplicate_hint: isDup,
    });
    if (isDup) return { ok: true, duplicate: true };
    return { ok: false, error: error.message };
  }

  console.info("[cfm][stripe-webhook] finalize ok", {
    event_id: eventId,
    provider_order_id: providerOrderId,
  });

  return { ok: true, result: data ?? null };
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!sig) return safeJson({ ok: false, error: "Missing stripe-signature" }, 400);

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret);
  } catch (e) {
    console.error("[cfm][stripe-webhook] signature error", {
      error: e instanceof Error ? e.message : "Invalid signature",
    });
    return safeJson({ ok: false, error: e instanceof Error ? e.message : "Invalid signature" }, 400);
  }

  console.info("[cfm][stripe-webhook] received", {
    type: event.type,
    event_id: event.id,
  });

  const admin = (() => {
    try {
      return supabaseAdmin();
    } catch (e) {
      return null;
    }
  })();

  if (!admin) {
    console.error("[cfm][stripe-webhook] missing service role key", { event_id: event.id });
    return safeJson({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      console.info("[cfm][stripe-webhook] checkout.session.completed", {
        event_id: event.id,
        session_id: String(session.id ?? ""),
        payment_intent: String((session.payment_intent as any) ?? ""),
        type: String(session.metadata?.type ?? ""),
      });

      const type = String(session.metadata?.type ?? "").trim();
      if (type !== "coin_purchase") {
        return safeJson({ ok: true, ignored: true });
      }

      const userId = String(session.metadata?.user_id ?? "").trim();
      const coins = Number(session.metadata?.coins ?? 0);

      const amountUsdCents =
        typeof session.amount_total === "number" ? session.amount_total : Number(session.amount_total ?? 0);

      if (!userId) return safeJson({ ok: false, error: "Missing user_id metadata" }, 400);
      if (!Number.isFinite(coins) || coins <= 0) return safeJson({ ok: false, error: "Invalid coins metadata" }, 400);
      if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
        return safeJson({ ok: false, error: "Invalid amount_total" }, 400);
      }

      const providerOrderId = String((session.payment_intent as any) ?? session.id ?? "").trim();
      if (!providerOrderId) return safeJson({ ok: false, error: "Missing session id" }, 400);

      const idempotencyKey =
        String(session.metadata?.idempotency_key ?? "").trim() || `stripe:event:${event.id}`;

      const res = await finalizeCoinPurchaseOrError({
        admin,
        providerOrderId,
        userId,
        coins,
        amountUsdCents,
        idempotencyKey,
        eventId: event.id,
      });
      return safeJson(res, res.ok ? 200 : 500);
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;

      console.info("[cfm][stripe-webhook] payment_intent.succeeded", {
        event_id: event.id,
        payment_intent_id: String(pi.id ?? ""),
        type: String(pi.metadata?.type ?? ""),
      });

      const type = String(pi.metadata?.type ?? "").trim();
      if (type !== "coin_purchase") {
        return safeJson({ ok: true, ignored: true });
      }

      const userId = String(pi.metadata?.user_id ?? "").trim();
      const coins = Number(pi.metadata?.coins ?? 0);

      const amountUsdCents =
        typeof (pi as any).amount_received === "number" && (pi as any).amount_received > 0
          ? Number((pi as any).amount_received)
          : Number((pi as any).amount ?? 0);

      if (!userId) return safeJson({ ok: false, error: "Missing user_id metadata" }, 400);
      if (!Number.isFinite(coins) || coins <= 0) return safeJson({ ok: false, error: "Invalid coins metadata" }, 400);
      if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
        return safeJson({ ok: false, error: "Invalid amount" }, 400);
      }

      const providerOrderId = String(pi.id ?? "").trim();
      if (!providerOrderId) return safeJson({ ok: false, error: "Missing payment_intent id" }, 400);

      const idempotencyKey = String(pi.metadata?.idempotency_key ?? "").trim() || `stripe:event:${event.id}`;

      const res = await finalizeCoinPurchaseOrError({
        admin,
        providerOrderId,
        userId,
        coins,
        amountUsdCents,
        idempotencyKey,
        eventId: event.id,
      });
      console.info("[cfm][stripe-webhook] finalize result", {
        event_id: event.id,
        provider_order_id: providerOrderId,
        result: res.ok ? "success" : "failure",
        error: res.error,
      });
      return safeJson(res, res.ok ? 200 : 500);
    }

    return safeJson({ ok: true, ignored: true, type: event.type });
  } catch (e) {
    console.error("[cfm][stripe-webhook] handler error", {
      error: e instanceof Error ? e.message : "Webhook handler failed",
    });
    return safeJson({ ok: false, error: e instanceof Error ? e.message : "Webhook handler failed" }, 500);
  }
}
