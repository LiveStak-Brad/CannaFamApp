import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LiveClient } from "@/app/live/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ViewLivePage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const next = String(sp?.next ?? "").trim();

  const user = await getAuthedUserOrNull();
  const sb = await supabaseServer();

  let live: any = null;
  try {
    const { data } = await sb.rpc("cfm_get_live_state");
    live = Array.isArray(data) ? (data[0] as any) : (data as any);
  } catch {
    live = null;
  }

  // If not live, show message
  if (!live?.is_live) {
    return (
      <Container>
        <Card title="Live">
          <div className="text-sm text-[color:var(--muted)]">No live stream is currently active. Check back soon!</div>
        </Card>
      </Container>
    );
  }

  return <LiveClient initialLive={live} myUserId={user?.id ?? null} nextPath={next} forceHostMode={false} />;
}
