import { describe, expect, it } from "vitest";

import {
  KEEPALIVE_MAX_BODY_BYTES,
  MAX_REPLAY_BATCH_BYTES,
  OrderFactSchema,
  ReplayBatchSchema,
  SessionSummaryJobSchema,
  ShopifyPixelEventSchema,
  ShopifyWebhookJobSchema,
  StorefrontInstallationSchema,
} from "../src/index";

const validJsonBatch = {
  schemaVersion: 1 as const,
  batchId: "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
  shopId: "pathminty-demo-store.myshopify.com",
  visitorId: "visitor_demo_01",
  sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
  sequence: 0,
  capturedAt: "2026-08-11T08:00:00.000Z",
  route: "/collections/new",
  viewport: { width: 390, height: 844, devicePixelRatio: 3 },
  encoding: "json" as const,
  payload: [
    {
      type: "pointer_down" as const,
      at: 1_723_363_200_000,
      x: 0.42,
      y: 0.68,
      pointer: "touch" as const,
      target: "main > button:nth-of-type(2)",
    },
  ],
  isFinal: false,
};

const validRrwebBatch = {
  schemaVersion: 1 as const,
  batchId: "3c907c67-d57f-47aa-ac9d-e275ca730bf3",
  shopId: "pathminty-demo-store.myshopify.com",
  visitorId: "visitor_demo_01",
  sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
  sequence: 1,
  capturedAt: "2026-08-11T08:00:05.000Z",
  route: "/collections/new",
  viewport: { width: 390, height: 844, devicePixelRatio: 3 },
  encoding: "rrweb" as const,
  source: "storefront" as const,
  payload: [
    {
      type: 4,
      data: { href: "https://example.com/", width: 390, height: 844 },
      timestamp: 1_000,
    },
    {
      type: 2,
      data: {
        node: { type: 0, childNodes: [] },
        initialOffset: { top: 0, left: 0 },
      },
      timestamp: 1_001,
    },
  ],
  isFinal: false,
};

describe("ReplayBatchSchema", () => {
  it("accepts a valid json replay batch", () => {
    expect(ReplayBatchSchema.safeParse(validJsonBatch).success).toBe(true);
  });

  it("accepts a valid rrweb replay batch", () => {
    expect(ReplayBatchSchema.safeParse(validRrwebBatch).success).toBe(true);
  });

  it("rejects an invalid tenant identifier", () => {
    expect(
      ReplayBatchSchema.safeParse({ ...validJsonBatch, shopId: "../../other-shop" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    expect(
      ReplayBatchSchema.safeParse({ ...validJsonBatch, unexpected: "field" }).success,
    ).toBe(false);
  });

  it("rejects free-form replay events that could carry customer text in json mode", () => {
    expect(
      ReplayBatchSchema.safeParse({
        ...validJsonBatch,
        payload: [{ type: "custom", at: 1, value: "customer@example.com" }],
      }).success,
    ).toBe(false);
  });

  it("rejects oversize sequence values", () => {
    expect(
      ReplayBatchSchema.safeParse({ ...validJsonBatch, sequence: 10_000_000 }).success,
    ).toBe(false);
  });

  it("documents the max accepted batch byte budget and keepalive cap", () => {
    expect(MAX_REPLAY_BATCH_BYTES).toBe(2 * 1024 * 1024);
    expect(KEEPALIVE_MAX_BODY_BYTES).toBe(60 * 1024);
    expect(KEEPALIVE_MAX_BODY_BYTES).toBeLessThan(MAX_REPLAY_BATCH_BYTES);
  });

  it("accepts document dimensions on an rrweb batch", () => {
    expect(
      ReplayBatchSchema.safeParse({
        ...validRrwebBatch,
        document: { width: 1_280, height: 4_000 },
      }).success,
    ).toBe(true);
  });

  it("accepts a canonical Shopify shop domain", () => {
    expect(
      StorefrontInstallationSchema.safeParse({
        shopId: validJsonBatch.shopId,
        publicToken: "a".repeat(48),
        pixelId: "gid://shopify/WebPixel/1",
        connectedAt: "2026-08-11T08:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts a minimized Shopify pixel event", () => {
    expect(
      ShopifyPixelEventSchema.safeParse({
        schemaVersion: 1,
        shopId: validJsonBatch.shopId,
        type: "checkout_completed",
        eventId: "sh-evt-1",
        occurredAt: "2026-08-11T08:00:00.000Z",
        path: "/checkouts/complete",
        orderId: "gid://shopify/Order/1",
        total: { amountMinor: 49900, currency: "INR" },
      }).success,
    ).toBe(true);
  });

  it("accepts summary jobs for non-final batches", () => {
    expect(
      SessionSummaryJobSchema.safeParse({
        schemaVersion: 1,
        jobId: "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
        shopId: validJsonBatch.shopId,
        sessionId: validJsonBatch.sessionId,
        sequence: 3,
        isFinal: false,
        enqueuedAt: "2026-08-11T08:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts order facts and webhook jobs", () => {
    expect(
      OrderFactSchema.safeParse({
        schemaVersion: 1,
        shopId: validJsonBatch.shopId,
        shopifyOrderId: "123",
        checkoutToken: "tok",
        sessionId: validJsonBatch.sessionId,
        currency: "USD",
        gmvMinor: 5_000,
        discountsMinor: 0,
        refundsMinor: 0,
        cancellationsMinor: 0,
        netRevenueMinor: 5_000,
        orderedAt: "2026-08-11T08:00:00.000Z",
        updatedAt: "2026-08-11T08:00:00.000Z",
      }).success,
    ).toBe(true);

    expect(
      ShopifyWebhookJobSchema.safeParse({
        schemaVersion: 1,
        webhookId: "wh-1",
        shop: validJsonBatch.shopId,
        topic: "ORDERS_CREATE",
        receivedAt: "2026-08-11T08:00:00.000Z",
        payload: { id: 1 },
      }).success,
    ).toBe(true);
  });
});
