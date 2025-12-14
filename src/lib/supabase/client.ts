"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertPublicEnv, env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  assertPublicEnv();
  if (!client) {
    client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}
