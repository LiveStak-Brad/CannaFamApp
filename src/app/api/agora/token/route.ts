import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

type ReqBody = {
  role?: "viewer" | "host";
};

function mustEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(request: NextRequest) {
  const appId = mustEnv("AGORA_APP_ID");
  const certificate = mustEnv("AGORA_APP_CERTIFICATE");

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
  } = await supabase.auth.getUser();

  const body = (await request.json().catch(() => ({}))) as ReqBody;
  const requestedRole = body.role === "host" ? "host" : "viewer";

  const channel = "cannafam-live";
  const now = Math.floor(Date.now() / 1000);
  const expire = now + 60 * 60;

  const hostUserId = String(process.env.CFM_LIVE_HOST_USER_ID ?? "").trim();

  const isHost = !!user && requestedRole === "host" && hostUserId && user.id === hostUserId;

  const uid = user?.id ? String(user.id) : `anon-${crypto.randomUUID()}`;

  const { RtcTokenBuilder, RtcRole } = require("agora-access-token") as any;

  const role = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const token = RtcTokenBuilder.buildTokenWithAccount(appId, certificate, channel, uid, role, expire);

  return NextResponse.json({
    appId,
    channel,
    uid,
    token,
    role: isHost ? "host" : "viewer",
    expiresAt: expire,
  });
}
