"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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

function fmtCoins(coins: number) {
  const n = Math.floor(Number(coins ?? 0));
  if (!Number.isFinite(n) || n <= 0) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

export function WalletBankClient({ webPackages }: { webPackages: CoinPackage[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const packs = useMemo(() => {
    const rows = Array.isArray(webPackages) ? [...webPackages] : [];
    rows.sort((a, b) => Number(a.price_usd_cents ?? 0) - Number(b.price_usd_cents ?? 0));
    return rows;
  }, [webPackages]);

  const bestValueSku = useMemo(() => {
    let bestSku = "";
    let best = -Infinity;
    for (const p of packs) {
      const price = Number(p.price_usd_cents ?? 0) / 100;
      const coins = Number(p.coins ?? 0);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!Number.isFinite(coins) || coins <= 0) continue;
      const v = coins / price;
      if (v > best) {
        best = v;
        bestSku = p.sku;
      }
    }
    return bestSku;
  }, [packs]);

  const whaleSku = useMemo(() => {
    let sku = "";
    let maxCoins = -Infinity;
    for (const p of packs) {
      const coins = Number(p.coins ?? 0);
      if (!Number.isFinite(coins) || coins <= 0) continue;
      if (coins > maxCoins) {
        maxCoins = coins;
        sku = p.sku;
      }
    }
    return sku;
  }, [packs]);

  const startCheckout = useCallback(
    (sku: string) => {
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
    },
    [startTransition],
  );

  return (
    <div className="space-y-3">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {packs.length === 0 ? (
        <div className="text-sm text-[color:var(--muted)]">No coin packages configured.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packs.map((p) => {
            const isBest = p.sku === bestValueSku;
            const isWhale = p.sku === whaleSku;
            const priceUsd = Number(p.price_usd_cents ?? 0) / 100;
            const coins = Number(p.coins ?? 0);
            const coinsPerDollar = priceUsd > 0 ? Math.round(coins / priceUsd) : 0;
            const accent = isBest
              ? "border-[rgba(25,192,96,0.55)]"
              : isWhale
                ? "border-[rgba(209,31,42,0.55)]"
                : "border-[color:var(--border)]";
            const bg = isBest
              ? "bg-[rgba(25,192,96,0.08)]"
              : isWhale
                ? "bg-[rgba(209,31,42,0.06)]"
                : "bg-[rgba(255,255,255,0.02)]";

            return (
              <div key={p.sku} className={`rounded-2xl border ${accent} ${bg} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[color:var(--muted)]">{p.sku}</div>
                    <div className="mt-1 text-2xl font-semibold">{fmtCoins(coins)} coins</div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                      {formatUsd(p.price_usd_cents)} • {Number(coinsPerDollar).toLocaleString()} coins / $1
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isBest ? (
                      <span className="rounded-full bg-[rgba(25,192,96,0.18)] px-2 py-1 text-[10px] font-semibold text-green-200">
                        Best value
                      </span>
                    ) : isWhale ? (
                      <span className="rounded-full bg-[rgba(209,31,42,0.16)] px-2 py-1 text-[10px] font-semibold text-red-100">
                        Whale pack
                      </span>
                    ) : null}
                    <Button type="button" disabled={pending} onClick={() => startCheckout(p.sku)}>
                      Buy for {formatUsd(p.price_usd_cents)}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
