import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

    const authHeader = String(request.headers.get("authorization") ?? "").trim();
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
    const expire = now + 60 * 60;

    const hostUserId = String(process.env.CFM_LIVE_HOST_USER_ID ?? "").trim();

    const isHost = !!user && requestedRole === "host" && hostUserId && user.id === hostUserId;

    const { RtcTokenBuilder, RtcRole } = require("agora-access-token") as any;
    const role = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const uid = isHost ? uidFromUuid(String(user?.id ?? "")) : Math.floor(Math.random() * 2000000000) + 1;
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
