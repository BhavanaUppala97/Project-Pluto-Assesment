// apps/web/lib/connect.ts
"use client";

import { createConnectTransport } from "@connectrpc/connect-web";

/**
 * Creates a Connect client and returns the generated message classes you need.
 * We load the generated JS dynamically so it works regardless of generator flavor.
 */
export async function newClient() {
  // 1) Load Connect v2. In v2 the Promise client creator is named `createClient`.
  const Connect: any = await import("@connectrpc/connect");
  const makeClient = Connect.createPromiseClient ?? Connect.createClient;
  if (!makeClient) {
    console.error("Connect exports:", Object.keys(Connect ?? {}));
    throw new Error("createPromiseClient/MethodKind not found — @connectrpc/connect v2 is required");
  }

  // 2) Transport to your server adapter mounted at /rpc
  const transport = createConnectTransport({ baseUrl: "http://localhost:8080/rpc" });

  // 3) Load generated message classes (no default export in Buf v2)
  const pb: any =
    (await import("../../../proto/gen/price_pb.js").catch(() => null)) ??
    (await import("../../../proto/gen/price_pb").catch(() => null));

  const SubscribeRequest =
    pb?.SubscribeRequest ?? pb?.default?.SubscribeRequest ??
    Object.values(pb ?? {}).find((v: any) => v?.typeName?.endsWith?.(".SubscribeRequest"));

  const PriceUpdate =
    pb?.PriceUpdate ?? pb?.default?.PriceUpdate ??
    Object.values(pb ?? {}).find((v: any) => v?.typeName?.endsWith?.(".PriceUpdate"));

  if (!SubscribeRequest || !PriceUpdate) {
    console.error("pb exports:", Object.keys(pb ?? {}));
    throw new Error("SubscribeRequest/PriceUpdate not found. Re-run `pnpm run gen`.");
  }

  // 4) Define the service locally (don’t import price_connect.js)
  const PriceService = {
    typeName: "pluto.v1.PriceService",
    methods: {
      Subscribe: {
        name: "Subscribe",
        I: SubscribeRequest,
        O: PriceUpdate,
        // we avoid importing MethodKind – a string works at runtime
        kind: "server_streaming" as const,
      },
    },
  } as const;

  // Connect expects methods to be iterable and to have a parent reference
  Object.defineProperty(PriceService.methods, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      for (const m of Object.values(this)) yield m;
    },
  });
  for (const m of PriceService.methods as any) (m as any).parent = PriceService;

  // 5) Create client
  const client = makeClient(PriceService as any, transport);
  return { client, SubscribeRequest, PriceUpdate };
}
