import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isAllowedDuringLive(pathname: string) {
  if (pathname.startsWith("/live")) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/signup")) return true;
  if (pathname.startsWith("/logout")) return true;
  if (pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/apply")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  if (hostname === "cannafamapp.com") {
    const url = request.nextUrl.clone();
    url.hostname = "www.cannafamapp.com";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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

  await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const needsAuth =
    pathname.startsWith("/hub") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/feed") ||
    pathname.startsWith("/admin");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && !isAllowedDuringLive(pathname)) {
    try {
      const { data: live } = await supabase.rpc("cfm_get_live_state");
      const isLive = Boolean((live as any)?.is_live);
      if (isLive) {
        const sessionKey =
          String((live as any)?.started_at ?? (live as any)?.updated_at ?? (live as any)?.id ?? "").trim() ||
          "live";

        const seen = String(request.cookies.get("cfm_live_seen")?.value ?? "").trim();
        if (seen !== sessionKey) {
          const url = request.nextUrl.clone();
          url.pathname = "/live";
          url.searchParams.set("next", pathname);
          return NextResponse.redirect(url);
        }
      }
    } catch {
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|OneSignalSDKWorker.js|OneSignalSDKUpdaterWorker.js).*)",
  ],
};
