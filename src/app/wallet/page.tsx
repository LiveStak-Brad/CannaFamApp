import { Container } from "@/components/shell/container";
import { Card } from "@/components/ui/card";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { WalletBankClient } from "./bank";
import { CoinsFinalizeNotice } from "../account/coins-finalize";

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

type CoinPackage = {
  sku: string;
  price_usd_cents: number;
  coins: number;
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

  const { data: webPackages } = await sb
    .from("coin_packages")
    .select("sku,price_usd_cents,coins")
    .eq("platform", "web")
    .eq("is_active", true)
    .order("price_usd_cents", { ascending: true });

  const w = (wallet ?? null) as any as WalletRow | null;
  const tx = ((txRows ?? []) as any[]) as TxRow[];
  const packs = ((webPackages ?? []) as any[]) as CoinPackage[];

  return (
    <Container>
      <div className="space-y-2">
        <Suspense fallback={null}>
          <CoinsFinalizeNotice />
        </Suspense>

        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">🪙 Wallet</h1>
          <div className="text-lg font-bold">{Number(w?.balance ?? 0).toLocaleString()} coins</div>
        </div>

        <Card title="Buy Coins">
          <WalletBankClient webPackages={packs} />
        </Card>

        <Card title="Recent Activity">
          <div className="space-y-1 text-xs">
            {tx.slice(0, 5).map((r) => (
              <div key={r.id} className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">{r.direction === "in" ? "+" : "-"}{Number(r.amount).toLocaleString()}</span>
                <span className="capitalize">{r.type.replace(/_/g, " ")}</span>
                <span className="text-[color:var(--muted)]">{String(r.created_at).slice(5, 10)}</span>
              </div>
            ))}
            {!tx.length ? (
              <div className="text-[color:var(--muted)] py-1">No transactions yet</div>
            ) : null}
          </div>
        </Card>
      </div>
    </Container>
  );
}
