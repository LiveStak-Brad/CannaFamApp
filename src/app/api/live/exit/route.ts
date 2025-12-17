import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function sessionKey(live: any) {
  return (
    String(live?.started_at ?? "").trim() ||
    String(live?.updated_at ?? "").trim() ||
    String(live?.id ?? "").trim() ||
    "live"
  );
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  const body = (await request.json().catch(() => ({}))) as { sessionKey?: string };
  const providedKey = String(body?.sessionKey ?? "").trim();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let live: any = null;
  try {
    const { data } = await supabase.rpc("cfm_get_live_state");
    live = data as any;
  } catch {
    live = null;
  }

  const key = providedKey || (live ? sessionKey(live) : "live");

  response.cookies.set("cfm_live_seen", key, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
