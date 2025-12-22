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
        <div className="grid grid-cols-2 gap-2">
          {packs.map((p) => {
            const isBest = p.sku === bestValueSku;
            const isWhale = p.sku === whaleSku;
            const priceUsd = Number(p.price_usd_cents ?? 0) / 100;
            const coins = Number(p.coins ?? 0);
            const baseCoins = priceUsd * 90; // web rate is 90 coins/$1
            const bonusPct = baseCoins > 0 ? Math.round(((coins - baseCoins) / baseCoins) * 100) : 0;
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

            // Convert sku to plain English
            const packName = p.sku.replace(/_/g, " ").replace(/web /i, "").replace(/coins?/i, "").trim();

            return (
              <div key={p.sku} className={`rounded-xl border ${accent} ${bg} p-2.5 flex flex-col`}>
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold">{fmtCoins(coins)}</span>
                  {isBest ? (
                    <span className="rounded-full bg-[rgba(25,192,96,0.18)] px-1.5 py-0.5 text-[8px] font-semibold text-green-200">
                      Best
                    </span>
                  ) : isWhale ? (
                    <span className="rounded-full bg-[rgba(209,31,42,0.16)] px-1.5 py-0.5 text-[8px] font-semibold text-red-100">
                      Whale
                    </span>
                  ) : bonusPct > 0 ? (
                    <span className="text-[9px] text-[color:var(--muted)]">+{bonusPct}%</span>
                  ) : null}
                </div>
                <Button type="button" disabled={pending} onClick={() => startCheckout(p.sku)} className="mt-2 text-xs py-1.5">
                  {formatUsd(p.price_usd_cents)}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
