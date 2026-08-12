import { describe, expect, it, vi } from "vitest";

import {
  buildCollectorForwardInit,
  collectorResponseToClient,
  INTERNAL_COLLECTOR_REPLAY_URL,
  loadStorefrontInstallation,
  rejectUnlessPost,
  STOREFRONT_CAPTURE_PATH,
} from "../src/capture-proxy";

describe("capture proxy guards", () => {
  it("rejects non-POST methods", () => {
    expect(rejectUnlessPost("GET")?.status).toBe(405);
    expect(rejectUnlessPost("POST")).toBeNull();
  });

  it("uses the same-origin storefront capture path", () => {
    expect(STOREFRONT_CAPTURE_PATH).toBe("/apps/pathminty/capture");
    expect(INTERNAL_COLLECTOR_REPLAY_URL).toContain("/v1/replay-batches");
    expect(INTERNAL_COLLECTOR_REPLAY_URL).toContain("collector.internal");
  });

  it("loads only tenant-matching installations", async () => {
    const store = {
      get: vi.fn(() =>
        Promise.resolve({
          shopId: "pathminty-demo-store.myshopify.com",
          publicToken: "a".repeat(48),
          pixelId: "gid://shopify/WebPixel/1",
          connectedAt: "2026-08-11T08:00:00.000Z",
        }),
      ),
    };
    const ok = await loadStorefrontInstallation(
      store,
      "pathminty-demo-store.myshopify.com",
    );
    expect(ok?.shopId).toBe("pathminty-demo-store.myshopify.com");

    const mismatch = await loadStorefrontInstallation(
      store,
      "other-store.myshopify.com",
    );
    expect(mismatch).toBeNull();
  });

  it("forwards JSON and site token without leaking the token on the client response", () => {
    const request = new Request("https://shop.example/apps/pathminty/capture", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      // Body stream optional in test env; init still carries headers/token.
      body: null,
    });
    const init = buildCollectorForwardInit(request, "a".repeat(48));
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-pathminty-site-token"]).toBe("a".repeat(48));

    const upstream = new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: {
        "content-type": "application/json",
        "x-pathminty-site-token": "should-not-leak",
      },
    });
    const client = collectorResponseToClient(upstream);
    expect(client.status).toBe(202);
    expect(client.headers.get("content-type")).toBe("application/json");
    expect(client.headers.get("x-pathminty-site-token")).toBeNull();
  });
});
