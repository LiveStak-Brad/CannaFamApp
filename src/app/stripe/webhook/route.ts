import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") ?? "";
  if (!sig) return safeJson({ ok: false, error: "Missing stripe-signature" }, 400);

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret);
  } catch (e) {
    return safeJson({ ok: false, error: e instanceof Error ? e.message : "Invalid signature" }, 400);
  }

  const admin = (() => {
    try {
      return supabaseAdmin();
    } catch (e) {
      return null;
    }
  })();

  if (!admin) {
    return safeJson({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const giftId = String(session.metadata?.gift_id ?? "").trim();
      if (!giftId) return safeJson({ ok: true, ignored: true });

      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      const { data: existing } = await admin
        .from("cfm_post_gifts")
        .select("id,status,stripe_event_id,gifter_user_id,amount_cents,post_id")
        .eq("id", giftId)
        .maybeSingle();

      if (existing?.stripe_event_id && existing.stripe_event_id === event.id) {
        return safeJson({ ok: true, duplicate: true });
      }

      const { error } = await admin
        .from("cfm_post_gifts")
        .update({
          status: "paid",
          stripe_payment_intent_id: paymentIntentId,
          stripe_event_id: event.id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", giftId);

      if (error) return safeJson({ ok: false, error: error.message }, 500);

      // If this is a site gift (post_id is "Live" or null), insert a chat message into the active live stream
      const postId = existing?.post_id;
      const isLiveGift = !postId || postId === "Live";
      
      if (isLiveGift) {
        // Get the current active live stream
        const { data: liveState } = await admin
          .from("cfm_live_state")
          .select("id,is_live")
          .eq("is_live", true)
          .maybeSingle();

        if (liveState?.id) {
          // Get gifter's display name
          const gifterUserId = existing?.gifter_user_id;
          let gifterName = "Anonymous";
          
          if (gifterUserId) {
            const { data: profile } = await admin
              .from("cfm_public_member_ids")
              .select("favorited_username")
              .eq("user_id", gifterUserId)
              .maybeSingle();
            if (profile?.favorited_username) {
              gifterName = profile.favorited_username;
            }
          }

          const amountCents = existing?.amount_cents ?? 0;
          const amountDollars = (amountCents / 100).toFixed(2);

          // Insert gift notification into live chat
          await admin.from("cfm_live_chat").insert({
            live_id: liveState.id,
            sender_user_id: gifterUserId || null,
            message: `🎁 ${gifterName} gifted $${amountDollars}!`,
            type: "system",
            metadata: { event: "gift", amount_cents: amountCents, gifter_name: gifterName },
          });
        }
      }

      return safeJson({ ok: true });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const giftId = String(session.metadata?.gift_id ?? "").trim();
      if (!giftId) return safeJson({ ok: true, ignored: true });

      const { error } = await admin
        .from("cfm_post_gifts")
        .update({ status: "canceled", stripe_event_id: event.id })
        .eq("id", giftId)
        .in("status", ["pending"]);

      if (error) return safeJson({ ok: false, error: error.message }, 500);
      return safeJson({ ok: true });
    }

    return safeJson({ ok: true, ignored: true, type: event.type });
  } catch (e) {
    return safeJson({ ok: false, error: e instanceof Error ? e.message : "Webhook handler failed" }, 500);
  }
}
