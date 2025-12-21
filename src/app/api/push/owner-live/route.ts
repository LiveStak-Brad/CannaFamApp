import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdminOrNull } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function safeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim(),
  );
}

export async function POST(request: NextRequest) {
  try {
    const ownerProfileId = mustEnv("CFM_OWNER_PROFILE_ID");
    const onesignalAppId = mustEnv("ONESIGNAL_APP_ID");
    const onesignalRestApiKey = mustEnv("ONESIGNAL_REST_API_KEY");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

    const authHeader = String(request.headers.get("authorization") ?? "").trim();
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
        },
      },
    });

    const {
      data: { user },
    } = await (bearer ? supabase.auth.getUser(bearer) : supabase.auth.getUser());

    if (!user) return safeJson({ error: "Unauthorized" }, 401);
    if (user.id !== ownerProfileId) return safeJson({ error: "Forbidden (not owner)" }, 403);

    const admin = supabaseAdminOrNull();
    if (!admin) return safeJson({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const { data: liveRow, error: liveErr } = await admin
      .from("cfm_live_state")
      .select("id,is_live,host_user_id,started_at,title")
      .limit(1)
      .maybeSingle();

    if (liveErr) return safeJson({ error: liveErr.message }, 500);
    if (!liveRow) return safeJson({ error: "Live state not found" }, 500);

    const liveId = String((liveRow as any)?.id ?? "").trim();
    const startedAt = String((liveRow as any)?.started_at ?? "").trim();
    const isLive = Boolean((liveRow as any)?.is_live);
    const hostUserId = String((liveRow as any)?.host_user_id ?? "").trim();

    if (!isLive) return safeJson({ ok: true, sent: 0, reason: "Not live" });
    if (hostUserId !== ownerProfileId) {
      return safeJson({ ok: true, sent: 0, reason: "Host is not owner (blocked)" });
    }
    if (!liveId || !startedAt) {
      return safeJson({ error: "Live state missing id/started_at" }, 500);
    }

    const body = (await request.json().catch(() => ({}))) as { stream_id?: string };
    const providedStreamId = String(body?.stream_id ?? "").trim();
    const streamId = isUuid(providedStreamId) ? providedStreamId : liveId;

    const idempotencyKey = `owner_live:${liveId}:${startedAt}`;

    const { data: claimed, error: claimErr } = await (admin as any).rpc("cfm_try_claim_push_send", {
      p_event_type: "owner_live",
      p_idempotency_key: idempotencyKey,
      p_stream_id: streamId,
      p_post_id: null,
      p_requested_by_profile_id: user.id,
      p_payload: {
        type: "live",
        streamer_id: ownerProfileId,
        stream_id: streamId,
        started_at: startedAt,
      },
    });

    if (claimErr) return safeJson({ error: claimErr.message }, 500);
    if (!claimed) return safeJson({ ok: true, already_sent: true, idempotency_key: idempotencyKey });

    const { data: recRows, error: recErr } = await admin
      .from("cfm_notification_prefs")
      .select("profile_id")
      .eq("live_alerts_enabled", true);

    if (recErr) return safeJson({ error: recErr.message }, 500);

    const externalIds = (recRows ?? [])
      .map((r: any) => String(r.profile_id ?? "").trim())
      .filter(Boolean);

    if (!externalIds.length) return safeJson({ ok: true, sent: 0, reason: "No opted-in users" });

    const webBaseUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cannafamapp.com").trim();
    const normalizedWebBaseUrl = webBaseUrl.endsWith("/") ? webBaseUrl.slice(0, -1) : webBaseUrl;
    const deepLinkUrl = `${normalizedWebBaseUrl}/viewlive?stream_id=${encodeURIComponent(streamId)}`;
    const webIconUrl = `${normalizedWebBaseUrl}/icon.png`;

    const batches = chunk(externalIds, 2000);

    const batchResults: any[] = [];
    for (const batch of batches) {
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Basic ${onesignalRestApiKey}`,
        },
        body: JSON.stringify({
          app_id: onesignalAppId,
          include_external_user_ids: batch,
          channel_for_external_user_ids: "push",
          headings: { en: "CannaStreams is LIVE" },
          contents: { en: "Tap to join now." },
          chrome_web_icon: webIconUrl,
          url: deepLinkUrl,
          data: {
            type: "live",
            streamer_id: ownerProfileId,
            stream_id: streamId,
            deep_link_url: `cannafam://viewlive?stream_id=${encodeURIComponent(streamId)}`,
          },
        }),
      });

      const json = await res.json().catch(() => null);
      batchResults.push({ ok: res.ok, status: res.status, response: json });
    }

    return safeJson({
      ok: true,
      idempotency_key: idempotencyKey,
      recipients: externalIds.length,
      batches: batches.length,
      batchResults,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeJson({ error: message }, 500);
  }
}
