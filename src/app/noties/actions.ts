"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function markNotieRead(id: string) {
  const user = await requireUser();
  const sb = await supabaseServer();

  const nid = String(id ?? "").trim();
  if (!nid) throw new Error("Notification id is required.");

  const { error } = await sb
    .from("cfm_noties")
    .update({ is_read: true })
    .eq("id", nid)
    .or(`user_id.eq.${user.id},member_id.eq.${user.id}`);

  if (error) throw new Error(error.message);

  revalidatePath("/noties");
  revalidatePath("/");
  return { ok: true as const };
}

export async function markAllNotiesRead() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const { error } = await sb
    .from("cfm_noties")
    .update({ is_read: true })
    .or(`user_id.eq.${user.id},member_id.eq.${user.id}`)
    .eq("is_read", false);

  if (error) throw new Error(error.message);

  revalidatePath("/noties");
  revalidatePath("/");
  return { ok: true as const };
}
