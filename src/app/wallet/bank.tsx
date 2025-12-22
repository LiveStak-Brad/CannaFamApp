"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

type CoinPackage = {
  sku: string;
  price_usd_cents: number;
  coins: number;
};

function formatUsd(cents: number) {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return `$${(n / 100).toFixed(2)}`;
}

export function WalletBankClient({ webPackages }: { webPackages: CoinPackage[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const firstSku = webPackages[0]?.sku ?? "";
  const [sku, setSku] = useState(firstSku);

  useEffect(() => {
    if (!sku && firstSku) setSku(firstSku);
  }, [firstSku, sku]);

  const selected = useMemo(() => webPackages.find((p) => p.sku === sku) ?? null, [sku, webPackages]);

  return (
    <div className="space-y-3">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            disabled={pending || webPackages.length === 0}
            className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
          >
            {webPackages.length === 0 ? <option value="">No coin packages configured</option> : null}
            {webPackages.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} • {formatUsd(p.price_usd_cents)} • {p.coins.toLocaleString()} coins
              </option>
            ))}
          </select>
          {selected ? (
            <div className="text-xs text-[color:var(--muted)]">
              Selected: {formatUsd(selected.price_usd_cents)} → {selected.coins.toLocaleString()} coins
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          disabled={pending || !sku || webPackages.length === 0}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              try {
                const res = await fetch("/api/coins/web/create-checkout", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ sku }),
                });
                const json = (await res.json().catch(() => null)) as any;
                if (!res.ok) throw new Error(String(json?.error ?? "Checkout failed"));
                const url = String(json?.url ?? "").trim();
                if (!url) throw new Error("Checkout URL missing");
                window.location.href = url;
              } catch (e) {
                setMsg({ tone: "error", text: e instanceof Error ? e.message : "Checkout failed" });
              }
            });
          }}
        >
          Buy coins
        </Button>
      </div>
    </div>
  );
}
