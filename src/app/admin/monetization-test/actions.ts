"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function runVipRollup(formData: FormData): Promise<void> {
  void formData;
  await requireOwner();
  const admin = supabaseAdmin();
  const { data, error } = await (admin as any).rpc("cfm_run_vip_monthly_rollup", {});
  if (error) throw new Error(error.message);
  revalidatePath("/admin/monetization-test");
  void data;
}
