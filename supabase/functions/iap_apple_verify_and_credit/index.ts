import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APPLE_VERIFY_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

const PRODUCT_TO_PACK: Record<string, { coins: number; amountUsdCents: number }> = {
  "com.cannafam.coins.60": { coins: 60, amountUsdCents: 99 },
  "com.cannafam.coins.180": { coins: 180, amountUsdCents: 299 },
  "com.cannafam.coins.300": { coins: 300, amountUsdCents: 499 },
  "com.cannafam.coins.600": { coins: 600, amountUsdCents: 999 },
  "com.cannafam.coins.1200": { coins: 1200, amountUsdCents: 1999 },
  "com.cannafam.coins.3000": { coins: 3000, amountUsdCents: 4999 },
  "com.cannafam.coins.6000": { coins: 6000, amountUsdCents: 9999 },
};

type VerifyBody = {
  receipt_data?: string;
  transaction_id?: string;
  product_id?: string;
};

type AppleTx = {
  transaction_id?: string;
  original_transaction_id?: string;
  product_id?: string;
  purchase_date_ms?: string;
  quantity?: string;
};

async function verifyWithApple(params: { receiptData: string; sharedSecret: string }) {
  const basePayload = {
    "receipt-data": params.receiptData,
    password: params.sharedSecret,
  };

  const attempt = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basePayload),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        http_status: res.status,
        apple: json,
        error: `Apple verifyReceipt HTTP ${res.status}`,
      };
    }

    return { ok: true, apple: json, http_status: res.status };
  };

  const prod = await attempt(APPLE_VERIFY_PROD);
  if (!prod.ok) return prod;

  const status = Number(prod.apple?.status ?? -1);
  if (status === 21007) {
    const sandbox = await attempt(APPLE_VERIFY_SANDBOX);
    return sandbox;
  }

  if (status === 21008) {
    const prod2 = await attempt(APPLE_VERIFY_PROD);
    return prod2;
  }

  return prod;
}

function normalizeTransactions(apple: any): AppleTx[] {
  const a: AppleTx[] = [];

  for (const tx of (apple?.receipt?.in_app ?? []) as any[]) a.push(tx);
  for (const tx of (apple?.latest_receipt_info ?? []) as any[]) a.push(tx);

  return a;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sharedSecret = Deno.env.get("APPLE_IAP_SHARED_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }
  if (!sharedSecret) {
    return jsonResponse(500, { ok: false, error: "Missing APPLE_IAP_SHARED_SECRET" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return jsonResponse(401, { ok: false, error: "Missing Authorization" });

  const bearerPrefix = "bearer ";
  const token = authHeader.toLowerCase().startsWith(bearerPrefix) ? authHeader.slice(bearerPrefix.length).trim() : "";
  if (!token) return jsonResponse(401, { ok: false, error: "Missing Bearer token" });

  let body: VerifyBody | null = null;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    body = null;
  }

  const receiptDataRaw = String(body?.receipt_data ?? "");
  const receiptData = receiptDataRaw.trim().replace(/\s+/g, "");
  const requestedTxId = String(body?.transaction_id ?? "").trim();
  const requestedProductId = String(body?.product_id ?? "").trim();

  const receiptLower = receiptData.toLowerCase();
  if (!receiptData || receiptLower === "undefined" || receiptLower === "null" || receiptData.length < 20) {
    return jsonResponse(400, { ok: false, error: "Invalid receipt_data" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonResponse(401, { ok: false, error: "Unauthorized" });
  }

  const userId = userData.user.id;

  const appleVerify = await verifyWithApple({ receiptData, sharedSecret });
  if (!appleVerify.ok) {
    return jsonResponse(502, {
      ok: false,
      error: appleVerify.error ?? "Apple verifyReceipt failed",
      http_status: appleVerify.http_status,
      apple: appleVerify.apple ?? null,
    });
  }

  const apple = appleVerify.apple ?? null;
  const status = Number(apple?.status ?? -1);
  if (status !== 0) {
    return jsonResponse(400, {
      ok: false,
      error: `Apple verifyReceipt status ${status}`,
      apple,
    });
  }

  const allTx = normalizeTransactions(apple);

  const filtered = allTx
    .map((tx) => ({
      transaction_id: String(tx?.transaction_id ?? "").trim(),
      product_id: String(tx?.product_id ?? "").trim(),
    }))
    .filter((tx) => !!tx.transaction_id && !!tx.product_id);

  const selected = (requestedTxId ? filtered.filter((t) => t.transaction_id === requestedTxId) : filtered)
    .filter((t) => !!PRODUCT_TO_PACK[t.product_id]);

  const uniqByTx = new Map<string, { transaction_id: string; product_id: string }>();
  for (const t of selected) {
    if (!uniqByTx.has(t.transaction_id)) uniqByTx.set(t.transaction_id, t);
  }

  const txs = [...uniqByTx.values()];

  if (!txs.length) {
    return jsonResponse(400, {
      ok: false,
      error: requestedTxId
        ? "Transaction not found in receipt (or unsupported product)."
        : "No supported transactions found in receipt.",
      requested: { transaction_id: requestedTxId || null, product_id: requestedProductId || null },
    });
  }

  const results: any[] = [];
  let creditedTotal = 0;
  let coinsCreditedForRequestedTx = 0;

  for (const tx of txs) {
    const pack = PRODUCT_TO_PACK[tx.product_id];

    const idempotencyKey = `apple:tx:${tx.transaction_id}`;

    const { data, error } = await supabase.rpc("cfm_finalize_coin_purchase", {
      p_provider: "apple",
      p_provider_order_id: tx.transaction_id,
      p_user_id: userId,
      p_coins: pack.coins,
      p_amount_usd_cents: pack.amountUsdCents,
      p_idempotency_key: idempotencyKey,
    });

    const payload = (data ?? null) as any;
    const payloadErr = String(payload?.error ?? "").trim();

    if (error || payloadErr) {
      results.push({
        transaction_id: tx.transaction_id,
        product_id: tx.product_id,
        ok: false,
        error: error?.message ?? payloadErr,
      });
      continue;
    }

    const duplicate = Boolean(payload?.duplicate ?? false);
    const credited = duplicate ? 0 : pack.coins;

    creditedTotal += credited;
    if (requestedTxId && tx.transaction_id === requestedTxId) coinsCreditedForRequestedTx = credited;

    results.push({
      transaction_id: tx.transaction_id,
      product_id: tx.product_id,
      ok: true,
      duplicate,
      credited_coins: credited,
    });
  }

  if (requestedTxId) {
    return jsonResponse(200, {
      ok: true,
      coins_credited: coinsCreditedForRequestedTx,
      credited_total: creditedTotal,
      results,
    });
  }

  return jsonResponse(200, {
    ok: true,
    credited_total: creditedTotal,
    results,
  });
});
