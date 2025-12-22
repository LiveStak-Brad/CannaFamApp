"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function runVipRollup(formData: FormData): Promise<void> {
  void formData;
  const user = await requireOwner();
  const admin = supabaseAdmin();
  console.info("[cfm][vip-rollup] start", { user_id: user.id });

  const { data, error } = await (admin as any).rpc("cfm_run_vip_monthly_rollup");
  if (error) {
    console.error("[cfm][vip-rollup] error", { user_id: user.id, message: error.message });
    redirect(`/admin/monetization-test?vip=error&msg=${encodeURIComponent(String(error.message ?? ""))}`);
  }

  console.info("[cfm][vip-rollup] ok", { user_id: user.id });
  revalidatePath("/admin/monetization-test");
  void data;
  redirect("/admin/monetization-test?vip=ok");
}
