import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type AdminRole = "owner" | "admin" | "moderator";

export async function getAuthedUserOrNull() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function requireUser() {
  const user = await getAuthedUserOrNull();
  if (!user) redirect("/login");
  return user;
}

export async function getMyAdminRole(): Promise<AdminRole | null> {
  const user = await getAuthedUserOrNull();
  if (!user) return null;

  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("cfm_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return null;
  const role = String((data as any)?.role ?? "").trim();
  if (role === "owner" || role === "admin" || role === "moderator") return role;
  return null;
}

export async function requireOwner() {
  const user = await requireUser();
  const role = await getMyAdminRole();
  if (role !== "owner") redirect("/hub");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const role = await getMyAdminRole();
  if (role !== "owner" && role !== "admin") redirect("/hub");
  return user;
}

export async function requireMod() {
  const user = await requireUser();
  const role = await getMyAdminRole();
  if (role !== "owner" && role !== "admin" && role !== "moderator") redirect("/hub");
  return user;
}

export async function requireApprovedMember() {
  const user = await requireUser();

  const role = await getMyAdminRole();
  if (role) return user;

  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("cfm_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    redirect("/hub/claim");
  }
  return user;
}
