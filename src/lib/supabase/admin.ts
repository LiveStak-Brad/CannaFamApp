import { createClient } from "@supabase/supabase-js";
import { assertServiceEnv, env } from "@/lib/env";

export function supabaseAdmin() {
  assertServiceEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
