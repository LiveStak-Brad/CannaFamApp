"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

type CoinPackage = {
  sku: string;
  price_usd_cents: number;
  coins: number;
};

type Props = {
  webPackages: CoinPackage[];
  defaultStreamId: string | null;
};

function formatUsd(cents: number) {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return `$${(n / 100).toFixed(2)}`;
}

function makeIdempotencyKey(prefix: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = (globalThis as any)?.crypto;
    const id = typeof c?.randomUUID === "function" ? c.randomUUID() : String(Math.random()).slice(2);
    return `${prefix}:${id}`;
  } catch {
    return `${prefix}:${String(Math.random()).slice(2)}`;
  }
}

export function MonetizationTestClient({ webPackages, defaultStreamId }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const firstSku = webPackages[0]?.sku ?? "";
  const [sku, setSku] = useState(firstSku);

  useEffect(() => {
    if (!sku && firstSku) setSku(firstSku);
  }, [firstSku, sku]);

  const [giftCoins, setGiftCoins] = useState("100");
  const [giftType, setGiftType] = useState("test");
  const [streamId, setStreamId] = useState(defaultStreamId ?? "");
  const [paymentIntentId, setPaymentIntentId] = useState("");

  const selected = useMemo(() => webPackages.find((p) => p.sku === sku) ?? null, [sku, webPackages]);

  return (
    <div className="space-y-3">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <div className="space-y-2">
        <div className="text-xs font-semibold text-[color:var(--muted)]">Web coin purchase (Stripe)</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            disabled={pending || webPackages.length === 0}
            className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)] focus:ring-[rgba(209,31,42,0.55)]"
          >
            {webPackages.length === 0 ? <option value="">No web coin packages configured</option> : null}
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
          Start web coin checkout
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-[color:var(--muted)]">Finalize by PaymentIntent (pi_...)</div>
        <input
          className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)]"
          value={paymentIntentId}
          onChange={(e) => setPaymentIntentId(e.target.value)}
          placeholder="pi_..."
        />
        <Button
          type="button"
          disabled={pending || !paymentIntentId.trim()}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              try {
                const pi = paymentIntentId.trim();
                if (!pi.startsWith("pi_")) throw new Error("PaymentIntent must start with pi_");

                const res = await fetch("/api/coins/web/finalize", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ payment_intent_id: pi }),
                });
                const json = (await res.json().catch(() => null)) as any;
                if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? "Finalize failed"));

                setMsg({ tone: "success", text: json?.duplicate ? "Already finalized (duplicate). Refreshing…" : "Finalized. Refreshing…" });
                window.location.reload();
              } catch (e) {
                setMsg({ tone: "error", text: e instanceof Error ? e.message : "Finalize failed" });
              }
            });
          }}
        >
          Finalize payment
        </Button>
        <div className="text-xs text-[color:var(--muted)]">
          Requires metadata on the PaymentIntent (type/user_id/coins).
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-[color:var(--muted)]">Coin gift spend (ledger)</div>
        <input
          className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)]"
          value={streamId}
          onChange={(e) => setStreamId(e.target.value)}
          placeholder="stream_id"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)]"
            value={giftCoins}
            onChange={(e) => setGiftCoins(e.target.value)}
            placeholder="coins"
          />
          <input
            className="w-full rounded-xl bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--border)]"
            value={giftType}
            onChange={(e) => setGiftType(e.target.value)}
            placeholder="gift_type"
          />
        </div>
        <Button
          type="button"
          disabled={pending || !streamId}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              try {
                const coins = Math.floor(Number(giftCoins));
                if (!Number.isFinite(coins) || coins <= 0) throw new Error("Invalid coins");

                const idempotencyKey = makeIdempotencyKey("gift_test");

                const res = await fetch("/api/gifts/send", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    stream_id: streamId,
                    gift_type: giftType,
                    coins,
                    idempotency_key: idempotencyKey,
                  }),
                });
                const json = (await res.json().catch(() => null)) as any;
                if (!res.ok) throw new Error(String(json?.error ?? "Gift failed"));

                setMsg({ tone: "success", text: "Gift sent. Refreshing…" });
                window.location.reload();
              } catch (e) {
                setMsg({ tone: "error", text: e instanceof Error ? e.message : "Gift failed" });
              }
            });
          }}
        >
          Send test coin gift
        </Button>
        <div className="text-xs text-[color:var(--muted)]">
          Recipient is enforced server-side.
        </div>
      </div>
    </div>
  );
}
