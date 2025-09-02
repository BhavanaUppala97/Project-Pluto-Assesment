// apps/server/src/watchers.ts
//
// Playwright scraping helpers + tiny async queue used by the server.

import { chromium, Browser, Page } from "playwright";

export type PriceEvent = { ticker: string; price: number; ts_ms: number };

export function makeAsyncQueue<T>() {
  const buf: T[] = [];
  let ended = false;
  let pendingResolve: ((v: IteratorResult<T>) => void) | null = null;

  return {
    push(value: T) {
      if (ended) return;
      if (pendingResolve) {
        pendingResolve({ value, done: false });
        pendingResolve = null;
      } else {
        buf.push(value);
      }
    },
    end() {
      if (ended) return;
      ended = true;
      pendingResolve?.({ value: undefined as any, done: true });
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      while (true) {
        if (buf.length) {
          yield buf.shift() as T;
          continue;
        }
        if (ended) return;
        const v = await new Promise<IteratorResult<T>>((resolve) => (pendingResolve = resolve));
        if (v.done) return;
        yield v.value;
      }
    },
  };
}

let browser: Browser | null = null;
async function ensureBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: false }); // show the page as per assignment
  }
  return browser;
}

function pickFirst<T>(arr: T[]): T | undefined {
  return Array.isArray(arr) && arr.length ? arr[0] : undefined;
}

/**
 * Watch the provided tickers on TradingView (BINANCE market) and call `onUpdate`
 * whenever the displayed price changes. Returns an `off()` function to stop.
 */
export function watchTickers(tickers: string[], onUpdate: (e: PriceEvent) => void): () => void {
  let closed = false;
  const stops: Array<() => void> = [];

  (async () => {
    const b = await ensureBrowser();

    for (const t of tickers) {
      const ticker = t.toUpperCase();
      const page: Page = await b.newPage();

      await page.goto(`https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`, {
        waitUntil: "domcontentloaded",
      });

      // The price is rendered in several different places depending on the layout.
      // Try a few robust selectors and poll once per second.
      const selectors: string[] = [
        'div[data-name="price"]',
        '[data-role="quote-bar-price"]',
        'div[data-qa="tv-symbol-price-quote__value"]',
      ];

      let last = NaN;
      const timer = setInterval(async () => {
        try {
          const selector = pickFirst(selectors);
          if (!selector) return;

          const txt = await page.evaluate<string, string>(
            (sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText || "",
            selector
          );

          const now = Date.now();
          const price = Number(txt.replace(/[^\d.]/g, "")); // simple parse
          if (!Number.isFinite(price)) return;
          if (price !== last) {
            last = price;
            onUpdate({ ticker, price, ts_ms: now });
          }
        } catch {
          /* ignore transient errors */
        }
      }, 1000);

      stops.push(() => { clearInterval(timer); page.close().catch(() => {}); });
    }
  })().catch((e) => console.error("[watchers] error", e));

  return () => {
    if (closed) return;
    closed = true;
    for (const s of stops) s();
  };
}
