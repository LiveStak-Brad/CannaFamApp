import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return safeJson({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      to_user_id?: string;
      stream_id?: string;
      post_id?: string;
      gift_type?: string;
      coins?: number;
      idempotency_key?: string;
    };

    const ownerId = mustEnv("CFM_OWNER_PROFILE_ID");

    const streamId = String(body?.stream_id ?? "").trim();
    const postId = String(body?.post_id ?? "").trim();
    const giftType = String(body?.gift_type ?? "").trim();
    const coins = Number(body?.coins ?? 0);
    const idempotencyKey = String(body?.idempotency_key ?? "").trim();

    // Must have either stream_id (live) or post_id (feed post)
    if (!streamId && !postId) return safeJson({ error: "Missing stream_id or post_id" }, 400);
    if (!Number.isFinite(coins) || coins <= 0) return safeJson({ error: "Invalid coins" }, 400);
    if (!idempotencyKey) return safeJson({ error: "Missing idempotency_key" }, 400);

    // Single-streamer: force gifts to the owner to prevent abuse.
    const toUserId = ownerId;

    const { data: giftRes, error: giftErr } = await sb.rpc("cfm_send_gift", {
      p_to_user_id: toUserId,
      p_stream_id: streamId || null,
      p_gift_type: giftType,
      p_coins: Math.floor(coins),
      p_idempotency_key: idempotencyKey,
    });

    if (giftErr) return safeJson({ error: giftErr.message }, 400);

    // If this is a post gift, add a comment to the post
    if (postId) {
      try {
        // Get gifter's username
        const { data: memberData } = await sb
          .from("cfm_members")
          .select("favorited_username")
          .eq("user_id", user.id)
          .single();
        const gifterName = memberData?.favorited_username || "Someone";

        // Insert gift comment
        await sb.from("cfm_feed_comments").insert({
          post_id: postId,
          user_id: user.id,
          content: `🎁 ${gifterName} gifted ${coins.toLocaleString()} coins!`,
          is_gift: true,
        });

        // Also record in cfm_post_gifts with the post_id
        await sb.from("cfm_post_gifts").insert({
          post_id: postId,
          gifter_user_id: user.id,
          recipient_user_id: toUserId,
          amount_cents: coins,
          currency: "coins",
          provider: "coins",
          status: "paid",
          paid_at: new Date().toISOString(),
        });
      } catch (commentErr) {
        console.error("Failed to add gift comment:", commentErr);
      }
    }

    const { data: walletRes } = await sb.rpc("cfm_get_wallet", { p_user_id: user.id });

    return safeJson({ ok: true, gift: giftRes, wallet: walletRes, post_id: postId || null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeJson({ error: message }, 500);
  }
}
