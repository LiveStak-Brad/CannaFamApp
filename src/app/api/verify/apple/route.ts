import { NextRequest, NextResponse } from "next/server";
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

type AppleVerifyReceiptResponse = {
  status: number;
  environment?: string;
  latest_receipt_info?: Array<{
    expires_date_ms?: string;
    product_id?: string;
    original_transaction_id?: string;
  }>;
  receipt?: any;
};

async function verifyWithApple(receiptData: string) {
  const sharedSecret = mustEnv("APPLE_IAP_SHARED_SECRET");

  const payload = {
    "receipt-data": receiptData,
    password: sharedSecret,
    "exclude-old-transactions": true,
  };

  const doPost = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as AppleVerifyReceiptResponse | null;
    return { ok: res.ok, status: res.status, json };
  };

  // Production first; retry sandbox if Apple says so.
  const prod = await doPost("https://buy.itunes.apple.com/verifyReceipt");
  const prodStatus = Number(prod.json?.status ?? -1);
  if (prodStatus === 21007) {
    const sandbox = await doPost("https://sandbox.itunes.apple.com/verifyReceipt");
    return sandbox;
  }
  return prod;
}

export async function POST(req: NextRequest) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) return safeJson({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      receipt_data?: string;
      product_id?: string;
    };

    const receiptData = String(body?.receipt_data ?? "").trim();
    if (!receiptData) return safeJson({ error: "Missing receipt_data" }, 400);

    const verified = await verifyWithApple(receiptData);
    if (!verified.ok || !verified.json) {
      return safeJson({ error: "Apple verification request failed" }, 502);
    }

    const appStatus = Number(verified.json.status ?? -1);
    if (appStatus !== 0) {
      return safeJson({ error: "Apple verification failed", status: appStatus }, 400);
    }

    const items = Array.isArray(verified.json.latest_receipt_info)
      ? verified.json.latest_receipt_info
      : [];

    // Pick the max expires_date_ms
    let maxExpiryMs = 0;
    let chosenProduct = "";
    for (const it of items) {
      const ms = Number(String(it?.expires_date_ms ?? "0"));
      if (Number.isFinite(ms) && ms > maxExpiryMs) {
        maxExpiryMs = ms;
        chosenProduct = String(it?.product_id ?? "").trim();
      }
    }

    const now = Date.now();
    const isActive = maxExpiryMs > now;
    const expiresAtIso = maxExpiryMs ? new Date(maxExpiryMs).toISOString() : null;

    const admin = supabaseAdminOrNull();
    if (!admin) return safeJson({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const { error: memberErr } = await admin
      .from("cfm_members")
      .update({ is_verified: isActive })
      .eq("user_id", user.id);

    if (memberErr) return safeJson({ error: memberErr.message }, 500);

    return safeJson({
      ok: true,
      platform: "ios",
      product_id: chosenProduct || String(body?.product_id ?? "").trim() || null,
      is_active: isActive,
      expires_at: expiresAtIso,
      environment: String(verified.json.environment ?? "").trim() || null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeJson({ error: message }, 500);
  }
}
