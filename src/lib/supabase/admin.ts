import { createClient } from "@supabase/supabase-js";
import { assertServiceEnv, env } from "@/lib/env";

export function supabaseAdmin() {
  assertServiceEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

export function supabaseAdminOrNull() {
  try {
    return supabaseAdmin();
  } catch (e) {
    console.error(
      "supabaseAdminOrNull failed",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
