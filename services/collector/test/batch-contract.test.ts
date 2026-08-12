import { describe, expect, it } from "vitest";

import {
  MAX_REPLAY_BATCH_BYTES,
  ReplayBatchSchema,
  ShopIdSchema,
} from "@pathminty/contracts";

describe("collector batch boundary contracts", () => {
  it("rejects invalid shop tenants", () => {
    expect(ShopIdSchema.safeParse("not-a-shop").success).toBe(false);
    expect(ShopIdSchema.safeParse("../evil.myshopify.com").success).toBe(false);
  });

  it("rejects oversize payload arrays beyond the contract cap", () => {
    const events = Array.from({ length: 5_001 }, (_, index) => ({
      type: "page_view" as const,
      at: index,
    }));
    const result = ReplayBatchSchema.safeParse({
      schemaVersion: 1,
      batchId: "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
      shopId: "pathminty-demo-store.myshopify.com",
      visitorId: "visitor_demo_01",
      sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
      sequence: 0,
      capturedAt: "2026-08-11T08:00:00.000Z",
      route: "/",
      viewport: { width: 1200, height: 800, devicePixelRatio: 1 },
      encoding: "json",
      payload: events,
      isFinal: false,
    });
    expect(result.success).toBe(false);
  });

  it("exposes a hard body byte budget for the collector edge", () => {
    // 2 MiB admits realistic Shopify full-DOM snapshots while staying bounded.
    expect(MAX_REPLAY_BATCH_BYTES).toBe(2 * 1024 * 1024);
  });
});
