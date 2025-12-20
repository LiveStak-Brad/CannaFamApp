"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertPublicEnv, env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  assertPublicEnv();
  if (!client) {
    client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll() {
          if (typeof document === "undefined") return [];
          const raw = document.cookie ?? "";
          if (!raw) return [];
          return raw
            .split(";")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((kv) => {
              const idx = kv.indexOf("=");
              const name = idx >= 0 ? kv.slice(0, idx) : kv;
              const value = idx >= 0 ? kv.slice(idx + 1) : "";
              return { name, value };
            });
        },
        setAll(cookiesToSet) {
          if (typeof document === "undefined") return;
          for (const { name, value, options } of cookiesToSet) {
            let cookie = `${name}=${value}`;
            const path = (options as any)?.path ?? "/";
            if (path) cookie += `; Path=${path}`;
            const maxAge = (options as any)?.maxAge;
            if (typeof maxAge === "number") cookie += `; Max-Age=${maxAge}`;
            const expires = (options as any)?.expires;
            if (expires) cookie += `; Expires=${new Date(expires).toUTCString()}`;
            const sameSite = (options as any)?.sameSite;
            if (sameSite) cookie += `; SameSite=${sameSite}`;
            if ((options as any)?.secure) cookie += "; Secure";
            document.cookie = cookie;
          }
        },
      },
    });
  }
  return client;
}
