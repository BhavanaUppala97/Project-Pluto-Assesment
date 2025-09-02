// apps/server/src/server.ts
import http from "http";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { makeAsyncQueue, watchTickers } from "./watchers"; // <- or "./watchers" if your file is plural

// --- Load generated message classes robustly (handles different export shapes)
const pb: any = await import("../../../proto/gen/price_pb.js");

const SubscribeRequest =
  pb.SubscribeRequest ??
  pb.default?.SubscribeRequest ??
  Object.values(pb).find((v: any) => v?.typeName?.endsWith(".SubscribeRequest"));

const PriceUpdate =
  pb.PriceUpdate ??
  pb.default?.PriceUpdate ??
  Object.values(pb).find((v: any) => v?.typeName?.endsWith(".PriceUpdate"));

if (!SubscribeRequest || !PriceUpdate) {
  console.error("[proto] exports in price_pb.js:", Object.keys(pb));
  throw new Error("Missing SubscribeRequest or PriceUpdate. Re-run: pnpm run gen");
}

// --- Build a Connect v2-compatible descriptor --------------------------------
const methods: any = {
  Subscribe: { name: "Subscribe", I: SubscribeRequest, O: PriceUpdate, kind: "server_streaming" },
};

// Make methods object iterable (what Connect v2 expects)
Object.defineProperty(methods, Symbol.iterator, {
  enumerable: false,
  value: function* () { for (const m of Object.values(this)) yield m; },
});

// Construct service and set parent on each method (Connect uses method.parent)
const PriceService: any = { typeName: "pluto.v1.PriceService", methods };
for (const m of Object.values(methods)) (m as any).parent = PriceService;
// -----------------------------------------------------------------------------


// Wire up Connect router with our implementation
const handler = connectNodeAdapter({
  routes: (router: any) => {
    router.service(PriceService, {
      async *subscribe(req: any, ctx: any): AsyncGenerator<any> {
        const tickers = (req.tickers ?? [])
          .map((t: string) => t.trim().toUpperCase())
          .filter(Boolean)
          .sort();
        console.log("[rpc] subscribe", tickers);

        const q = makeAsyncQueue<any>();
        const off = watchTickers(tickers, (e) => {
          const PU: any = PriceUpdate;
          q.push(new PU({ ticker: e.ticker, price: e.price, tsMs: BigInt(e.ts_ms) }));
        });

        ctx?.signal?.addEventListener?.("abort", () => {
          off(); q.end(); console.log("[rpc] client aborted");
        });

        for await (const msg of q) yield msg;
      },
    });
  },
});

// Minimal HTTP server with CORS + /healthz, Connect mounted at /rpc
const PORT = Number(process.env.PORT ?? 8080);
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-grpc-web, *");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  if (req.url === "/healthz") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url?.startsWith("/rpc")) {
    req.url = req.url.slice("/rpc".length) || "/";
    // @ts-ignore connect handler is (req, res)
    handler(req, res);
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT} (ConnectRPC at /rpc)`);
  console.log("Chromium opens in headed mode when the first ticker is watched.");
});
