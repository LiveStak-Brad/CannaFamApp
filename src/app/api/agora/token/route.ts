import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ReqBody = {
  role?: "viewer" | "host";
  client?: "web" | "mobile";
};

function uidFromUuid(uuid: string) {
  let h = 0;
  const s = String(uuid ?? "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const u = Math.abs(h) % 2147483647;
  return u === 0 ? 1 : u;
}

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(request: NextRequest) {
  try {
    const appId = mustEnv("AGORA_APP_ID");
    const certificate = mustEnv("AGORA_APP_CERTIFICATE");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

    const authHeader = String(request.headers.get("authorization") ?? "").trim();
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
          },
        },
      },
    );

    const {
      data: { user },
    } = await (bearer ? supabase.auth.getUser(bearer) : supabase.auth.getUser());

    const body = (await request.json().catch(() => ({}))) as ReqBody;
    const requestedRole = body.role === "host" ? "host" : "viewer";

    const channel = "cannafam-live";
    const now = Math.floor(Date.now() / 1000);
    const expire =
      requestedRole === "host"
        ? now + 60 * 60
        : now + 15 * 60;

    const hostUserId = String(process.env.CFM_LIVE_HOST_USER_ID ?? "").trim();

    const isHost = !!user && requestedRole === "host" && hostUserId && user.id === hostUserId;

    if (requestedRole === "viewer" && !user) {
      return NextResponse.json(
        { error: "Login required to watch" },
        { status: 401 },
      );
    }

    if (requestedRole === "host" && !isHost) {
      return NextResponse.json(
        {
          error: "Not authorized as live host",
          details: {
            expectedHostUserId: hostUserId || null,
            authedUserId: user?.id ?? null,
            hasUser: !!user,
            bearerPresent: !!bearer,
          },
        },
        { status: 403 },
      );
    }

    // CRITICAL: Check if stream is live before issuing viewer tokens
    // This prevents Agora minute usage when not streaming
    if (!isHost) {
      const { data: liveState } = await supabase.rpc("cfm_get_live_state");
      const live = Array.isArray(liveState) ? liveState[0] : liveState;
      const isLive = !!live?.is_live;
      
      if (!isLive) {
        return NextResponse.json(
          { error: "Stream is not live", isLive: false },
          { status: 403 },
        );
      }

      const liveId = String(live?.id ?? "").trim();
      if (liveId && user?.id) {
        const client = bearer
          ? createClient(supabaseUrl, supabaseAnonKey, {
              auth: { persistSession: false },
              global: { headers: { Authorization: `Bearer ${bearer}` } },
            })
          : supabase;

        const { data: kick } = await client
          .from("cfm_live_kicks")
          .select("id")
          .eq("live_id", liveId)
          .eq("kicked_user_id", user.id)
          .maybeSingle();

        if (kick?.id) {
          return NextResponse.json(
            { error: "Removed by host" },
            { status: 403 },
          );
        }
      }
    }

    const { RtcTokenBuilder, RtcRole } = require("agora-access-token") as any;
    const role = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const uid = isHost
      ? uidFromUuid(String(user?.id ?? ""))
      : uidFromUuid(String(user?.id ?? ""));
    const token = RtcTokenBuilder.buildTokenWithUid(appId, certificate, channel, uid, role, expire);

    return NextResponse.json({
      appId,
      channel,
      uid,
      token,
      role: isHost ? "host" : "viewer",
      expiresAt: expire,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
