import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type AdminRole = "owner" | "admin" | "moderator";

async function tryAutoLinkApprovedMember(user: { id: string; email?: string | null }) {
  const email = (user.email ?? "").toLowerCase().trim();
  if (!email) return false;

  const admin = supabaseAdmin();

  const { data: app, error: appErr } = await admin
    .from("cfm_applications")
    .select("favorited_username")
    .eq("status", "approved")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (appErr || !app?.favorited_username) return false;

  const { data: member, error: memberErr } = await admin
    .from("cfm_members")
    .select("id,user_id")
    .eq("favorited_username", app.favorited_username)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memberErr || !member) return false;

  if (member.user_id) {
    return member.user_id === user.id;
  }

  const { error: updateErr } = await admin
    .from("cfm_members")
    .update({ user_id: user.id })
    .eq("id", member.id)
    .is("user_id", null);

  if (updateErr) return false;
  return true;
}

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
    const linked = await tryAutoLinkApprovedMember(user);
    if (linked) return user;
    redirect("/hub/claim");
  }
  return user;
}
