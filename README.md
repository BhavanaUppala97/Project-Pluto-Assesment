# Project-Pluto-Assesment
A tiny full-stack app that streams live crypto prices from TradingView (BINANCE) into a Next.js UI via a server-streaming RPC.

Frontend: Next.js (App Router) + @connectrpc/connect-web

Backend: Node + Connect RPC (@connectrpc/connect-node) + Playwright (Chromium) to scrape prices

Schema: Protocol Buffers (generated JS with Buf)

How it works (end-to-end)

The browser calls PriceService.Subscribe(tickers[]) over Connect RPC.

The Node server starts (or reuses) a Playwright Chromium session and opens the TradingView symbol page for each ticker.

When the DOM price changes, the server emits a PriceUpdate into an async generator, which Connect turns into a server stream to the browser.

The Next.js client consumes the stream and updates the UI in real time.

What we changed / fixed

These were the key changes needed to make the assessment run reliably on Windows + modern Connect v2.

Upgraded to Connect v2 + Buf v2 runtime

Dependencies aligned on:
@connectrpc/connect@^2, @connectrpc/connect-web@^2,
@connectrpc/connect-node@^2, @bufbuild/protobuf@^2

No more reliance on *_connect.js (generator version mismatches caused runtime errors).

Instead, we define the service descriptor locally:

{
  typeName: "pluto.v1.PriceService",
  methods: {
    Subscribe: {
      name: "Subscribe",
      I: SubscribeRequest,
      O: PriceUpdate,
      kind: MethodKind.ServerStreaming
    }
  }
}


We still use the generated message classes from proto/gen/price_pb.js.

Dynamic imports with graceful fallbacks

Works whether Buf emits .js or extension-less modules and avoids ESM packaging pitfalls (especially in Next.js).

Windows friendliness

Import Playwright helpers as ./watchers (no .ts suffix).

Keep node_modules out of Git (long path issues); commit only source.

Safer server stream

Async queue feeding PriceUpdate messages; on client abort we clean up Playwright watchers.

Repository layout
proto/
  price.proto          # RPC schema
  gen/                 # Generated JS (pb.js, d.ts) – created by pnpm run gen

apps/
  server/
    src/
      server.ts        # Connect server + routes
      watchers.ts      # Playwright helpers (open page, watch DOM, emit prices)
    package.json

  web/
    app/
      page.tsx         # UI and streaming client
    lib/
      connect.ts       # Connect v2 client, dynamic imports, local service descriptor
    package.json

package.json           # workspace root (pnpm workspaces)
pnpm-workspace.yaml
buf.gen.yaml           # Buf codegen config
buf.work.yaml

Prerequisites

Node 20+ (Node 22 works too)

PNPM (via Corepack)

corepack enable
corepack prepare pnpm@latest --activate


Windows only (Playwright): allow Chromium to install on first run

Install & generate

From the repo root:

# 1) Install workspace deps
pnpm install

# 2) Generate protobuf JS (price_pb.js) with Buf
pnpm run gen

# 3) Install Playwright Chromium for the server app
pnpm --filter @pluto/server exec playwright install chromium


If pnpm run gen ever fails, ensure your buf.gen.yaml uses current plugins; then retry.

Run the app (dev)
# from repository root
pnpm dev


Server: http://localhost:8080
 (Connect RPC mounted at /rpc, health at /healthz)

Web: http://localhost:3000

Open the web app, add a ticker like BTCUSD, and you’ll see “waiting…” until the server opens Chromium, loads TradingView, and the first price arrives. The price then updates continuously.

On the first watched ticker, Chromium opens in headed mode—don’t close it.
Stop the app with Ctrl + C in the terminal. If a Node process lingers on Windows:
taskkill /F /IM node.exe

One-line reset (if things get weird)
# kill node, clean, reinstall, regenerate, reinstall chromium, run
taskkill /F /IM node.exe 2>$null
rd -r -fo node_modules 2>$null
rd -r -fo apps\server\node_modules 2>$null
rd -r -fo apps\web\node_modules 2>$null
rd -r -fo apps\web\.next 2>$null
pnpm install
pnpm run gen
pnpm --filter @pluto/server exec playwright install chromium
pnpm dev
