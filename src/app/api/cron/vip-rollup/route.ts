import { NextResponse, type NextRequest } from "next/server";
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

export async function POST(request: NextRequest) {
  try {
    const secret = mustEnv("CFM_CRON_SECRET");
    const provided = String(request.headers.get("x-cron-secret") ?? "").trim();
    if (!provided || provided !== secret) return safeJson({ error: "Forbidden" }, 403);

    const admin = supabaseAdminOrNull();
    if (!admin) return safeJson({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

    const { data, error } = await (admin as any).rpc("cfm_run_vip_monthly_rollup", {});
    if (error) return safeJson({ error: error.message }, 500);

    return safeJson({ ok: true, result: data ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeJson({ error: message }, 500);
  }
}
