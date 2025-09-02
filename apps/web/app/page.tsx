// apps/web/app/page.tsx
"use client";

import React from "react";
import { newClient } from "../lib/connect";

type PM = Record<string, { price: number; ts: number }>;

export default function Home() {
  const [input, setInput] = React.useState("");
  const [tickers, setTickers] = React.useState<string[]>([]);
  const [prices, setPrices] = React.useState<PM>({});
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    (async () => {
      abortRef.current?.abort();
      if (!tickers.length) return;

      const { client, SubscribeRequest } = await newClient();
      const ctl = new AbortController();
      abortRef.current = ctl;

      const req = new SubscribeRequest({ tickers });
      try {
        const stream = client.Subscribe(req as any, { signal: ctl.signal });
        for await (const u of stream) {
          const t = u.ticker.toUpperCase();
          const p = Number(u.price);
          const ts = Number(u.tsMs?.toString?.() ?? Date.now());
          setPrices((prev) => ({ ...prev, [t]: { price: p, ts } }));
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("[web] stream error", e);
      }
    })();
    return () => abortRef.current?.abort();
  }, [tickers]);

  return (
    <main style={{ maxWidth: 680, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Crypto Prices (BINANCE)</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          placeholder="Ticker (e.g. BTCUSD)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button
          onClick={() => {
            const t = input.trim().toUpperCase();
            if (t && !tickers.includes(t)) setTickers((s) => [...s, t]);
            setInput("");
          }}
        >
          Add
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        {tickers.map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderBottom: "1px solid #eee" }}>
            <strong style={{ width: 120 }}>{t}</strong>
            <span style={{ opacity: 0.7 }}>
              {prices[t] ? `${prices[t].price}  ·  ${new Date(prices[t].ts).toLocaleTimeString()}` : "waiting..."}
            </span>
            <button
              style={{ marginLeft: "auto" }}
              onClick={() => {
                setTickers((s) => s.filter((x) => x !== t));
                setPrices((p) => {
                  const n = { ...p };
                  delete n[t];
                  return n;
                });
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
