import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function buildReturnUrl(siteUrl: string, returnPathRaw: string, params: Record<string, string>) {
  const site = String(siteUrl ?? "").trim();
  const base = site.endsWith("/") ? site.slice(0, -1) : site;
  const returnPath = String(returnPathRaw ?? "/").trim() || "/";
  const path = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
  const url = new URL(`${base}${path}`);

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  return url.toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amountCents = Number(body.amount_cents ?? 0);
    const returnPath = String(body.return_path ?? "/").trim() || "/";
    const postId = body.post_id ? String(body.post_id).trim() : null;

    if (!Number.isFinite(amountCents) || amountCents < 100) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const sb = await supabaseServer();

    // Get monetization settings
    const { data: settings } = await sb
      .from("cfm_monetization_settings")
      .select("enable_post_gifts,min_gift_cents,max_gift_cents")
      .limit(1)
      .maybeSingle();

    const enableGifts = !!(settings as any)?.enable_post_gifts;
    if (!enableGifts) {
      return NextResponse.json({ error: "Gifting is currently disabled" }, { status: 400 });
    }

    const minCents = Number((settings as any)?.min_gift_cents ?? 100);
    const maxCents = Number((settings as any)?.max_gift_cents ?? 20000);

    if (amountCents < minCents || amountCents > maxCents) {
      return NextResponse.json({ error: `Amount must be between $${(minCents/100).toFixed(2)} and $${(maxCents/100).toFixed(2)}` }, { status: 400 });
    }

    // Get user from auth header if present
    let gifterUserId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) {
        gifterUserId = user.id;
      }
    }

    // Create gift record using admin client to bypass RLS
    const admin = supabaseAdminOrNull();
    const dbClient = admin || sb;
    
    const { data: giftRow, error: giftErr } = await dbClient
      .from("cfm_post_gifts")
      .insert({
        post_id: postId,
        gifter_user_id: gifterUserId,
        recipient_user_id: null,
        amount_cents: amountCents,
        currency: "usd",
        provider: "stripe",
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (giftErr) {
      return NextResponse.json({ error: giftErr.message }, { status: 500 });
    }
    if (!giftRow?.id) {
      return NextResponse.json({ error: "Failed to create gift record" }, { status: 500 });
    }

    // Create Stripe checkout session
    const s = stripe();
    const session = await s.checkout.sessions.create({
      mode: "payment",
      success_url: buildReturnUrl(env.siteUrl, returnPath, {
        gift: "success",
        gift_id: String(giftRow.id),
      }),
      cancel_url: buildReturnUrl(env.siteUrl, returnPath, {
        gift: "cancel",
        gift_id: String(giftRow.id),
      }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Gift",
            },
          },
        },
      ],
      metadata: {
        gift_id: String(giftRow.id),
        post_id: postId ?? "",
        gifter_user_id: gifterUserId ?? "",
      },
    });

    await sb
      .from("cfm_post_gifts")
      .update({ stripe_session_id: session.id })
      .eq("id", giftRow.id);

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Gift API error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
