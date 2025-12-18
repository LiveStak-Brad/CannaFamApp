import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HostLiveClient } from "./ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HostLivePage() {
  const user = await getAuthedUserOrNull();
  
  if (!user) {
    redirect("/login?next=/hostlive");
  }

  const sb = await supabaseServer();

  let live: any = null;
  let hostUserId: string | null = null;
  try {
    const { data } = await sb.rpc("cfm_get_live_state");
    const row = Array.isArray(data) ? (data[0] as any) : (data as any);
    live = row;
    hostUserId = row?.host_user_id ?? null;
  } catch {
    live = null;
  }

  // Only the host can access this page
  if (!hostUserId || user.id !== hostUserId) {
    return (
      <Container>
        <Card title="Access Denied">
          <div className="text-sm text-[color:var(--muted)]">You are not authorized to access the host controls.</div>
        </Card>
      </Container>
    );
  }

  if (!live) {
    return (
      <Container>
        <Card title="Live">
          <div className="text-sm text-[color:var(--muted)]">Live is unavailable right now.</div>
        </Card>
      </Container>
    );
  }

  return <HostLiveClient initialLive={live} myUserId={user.id} />;
}
