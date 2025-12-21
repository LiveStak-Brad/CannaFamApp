import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { runVipRollup } from "./actions";
import { MonetizationTestClient } from "./ui";

export const runtime = "nodejs";

type WalletRow = {
  user_id: string;
  balance: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  updated_at: string;
};

type TxRow = {
  id: string;
  type: string;
  direction: string;
  amount: number;
  source: string;
  related_id: string | null;
  idempotency_key: string;
  created_at: string;
};

export default async function MonetizationTestPage() {
  const user = await requireOwner();
  const sb = await supabaseServer();

  const { data: wallet } = await sb
    .from("coin_wallets")
    .select("user_id,balance,lifetime_purchased,lifetime_spent,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: txRows } = await sb
    .from("coin_transactions")
    .select("id,type,direction,amount,source,related_id,idempotency_key,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: memberRow } = await sb
    .from("cfm_members")
    .select("vip_tier,is_verified")
    .eq("user_id", user.id)
    .maybeSingle();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const monthStartISO = monthStart.toISOString().slice(0, 10);

  const { data: vipRow } = await sb
    .from("vip_monthly_status")
    .select("month_start,tier,monthly_spent_coins,computed_at")
    .eq("user_id", user.id)
    .eq("month_start", monthStartISO)
    .maybeSingle();

  const { data: liveState } = await sb
    .from("cfm_live_state")
    .select("id")
    .limit(1)
    .maybeSingle();

  const defaultStreamId = String((liveState as any)?.id ?? "").trim() || null;

  const { data: webPackages } = await sb
    .from("coin_packages")
    .select("sku,price_usd_cents,coins")
    .eq("platform", "web")
    .eq("is_active", true)
    .order("price_usd_cents", { ascending: true });

  const w = (wallet ?? null) as any as WalletRow | null;
  const tx = ((txRows ?? []) as any[]) as TxRow[];
  const vipTier = String((memberRow as any)?.vip_tier ?? "").trim() || null;
  const isVerified = Boolean((memberRow as any)?.is_verified);

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Monetization Test</h1>
          <div className="text-sm text-[color:var(--muted)]">Owner-only verification panel.</div>
        </div>

        <Card title="Current status">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-semibold">Wallet balance:</span> {Number(w?.balance ?? 0).toLocaleString()} coins
            </div>
            <div>
              <span className="font-semibold">Lifetime purchased:</span> {Number(w?.lifetime_purchased ?? 0).toLocaleString()} coins
            </div>
            <div>
              <span className="font-semibold">Lifetime spent:</span> {Number(w?.lifetime_spent ?? 0).toLocaleString()} coins
            </div>
            <div>
              <span className="font-semibold">VIP tier:</span> {vipTier ?? "(none)"}
            </div>
            <div>
              <span className="font-semibold">Verified:</span> {isVerified ? "true" : "false"}
            </div>
            <div>
              <span className="font-semibold">VIP month ({monthStartISO}):</span>{" "}
              {vipRow ? `${String((vipRow as any).tier ?? "(none)")} • ${Number((vipRow as any).monthly_spent_coins ?? 0).toLocaleString()} spent` : "(no row)"}
            </div>
          </div>
        </Card>

        <Card
          title="VIP rollup"
          footer={
            <form action={runVipRollup}>
              <Button type="submit">Run VIP rollup now</Button>
            </form>
          }
        >
          <div className="text-sm text-[color:var(--muted)]">
            Runs the server-side rollup for the current month and updates your VIP tier.
          </div>
        </Card>

        <Card title="Test actions">
          <MonetizationTestClient
            webPackages={(webPackages ?? []) as any}
            defaultStreamId={defaultStreamId}
          />
        </Card>

        <Card title="Recent ledger (coin_transactions)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[color:var(--muted)]">
                  <th className="py-2 pr-3">created</th>
                  <th className="py-2 pr-3">type</th>
                  <th className="py-2 pr-3">dir</th>
                  <th className="py-2 pr-3">amount</th>
                  <th className="py-2 pr-3">source</th>
                </tr>
              </thead>
              <tbody>
                {tx.map((r) => (
                  <tr key={r.id} className="border-t border-[color:var(--border)]">
                    <td className="py-2 pr-3 whitespace-nowrap">{String(r.created_at).slice(0, 19)}</td>
                    <td className="py-2 pr-3">{r.type}</td>
                    <td className="py-2 pr-3">{r.direction}</td>
                    <td className="py-2 pr-3">{Number(r.amount).toLocaleString()}</td>
                    <td className="py-2 pr-3">{r.source}</td>
                  </tr>
                ))}
                {!tx.length ? (
                  <tr>
                    <td className="py-2 text-[color:var(--muted)]" colSpan={5}>
                      No transactions.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Container>
  );
}
