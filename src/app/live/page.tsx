import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { LiveClient } from "./ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LivePage({
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
    live = data as any;
  } catch {
    live = null;
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

  return <LiveClient initialLive={live} myUserId={user?.id ?? null} nextPath={next} />;
}
