import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

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

export default async function WalletPage() {
  const user = await requireUser();
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
    .limit(50);

  const w = (wallet ?? null) as any as WalletRow | null;
  const tx = ((txRows ?? []) as any[]) as TxRow[];

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Wallet</h1>
          <div className="text-sm text-[color:var(--muted)]">Your coin balance and recent activity.</div>
        </div>

        <Card title="Balance">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-semibold">Coins:</span> {Number(w?.balance ?? 0).toLocaleString()}
            </div>
            <div>
              <span className="font-semibold">Lifetime purchased:</span> {Number(w?.lifetime_purchased ?? 0).toLocaleString()}
            </div>
            <div>
              <span className="font-semibold">Lifetime spent:</span> {Number(w?.lifetime_spent ?? 0).toLocaleString()}
            </div>
          </div>
        </Card>

        <Card title="Recent activity">
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
