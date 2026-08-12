import { describe, expect, it } from "vitest";

import {
  replayChunkKey,
  replayManifestKey,
  sessionSummaryKey,
  shopifyEventKey,
} from "../src/index";

describe("replay object keys", () => {
  it("sorts chunk sequences lexicographically with batchId collision safety", () => {
    const batch = {
      shopId: "pathminty-demo-store.myshopify.com",
      sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
      sequence: 42,
      batchId: "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
    };

    expect(replayChunkKey(batch)).toBe(
      "replays/v1/pathminty-demo-store.myshopify.com/cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d/chunks/00000042_2c907c67-d57f-47aa-ac9d-e275ca730bf2.json",
    );

    const earlier = replayChunkKey({
      ...batch,
      sequence: 9,
      batchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const later = replayChunkKey({
      ...batch,
      sequence: 10,
      batchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(earlier < later).toBe(true);
  });

  it("prevents different batchIds from sharing a sequence object key", () => {
    const base = {
      shopId: "pathminty-demo-store.myshopify.com",
      sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
      sequence: 0,
    };
    const first = replayChunkKey({
      ...base,
      batchId: "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
    });
    const second = replayChunkKey({
      ...base,
      batchId: "3c907c67-d57f-47aa-ac9d-e275ca730bf3",
    });
    expect(first).not.toBe(second);
  });

  it("keeps the manifest inside the session prefix", () => {
    expect(
      replayManifestKey(
        "pathminty-demo-store.myshopify.com",
        "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
      ),
    ).toBe(
      "replays/v1/pathminty-demo-store.myshopify.com/cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d/manifest.json",
    );
  });

  it("partitions Shopify events by shop, day, and type", () => {
    expect(
      shopifyEventKey(
        {
          shopId: "pathminty-demo-store.myshopify.com",
          occurredAt: "2026-08-11T08:00:00.000Z",
          type: "checkout_completed",
        },
        "event-1",
      ),
    ).toBe(
      "shopify-events/v1/pathminty-demo-store.myshopify.com/2026-08-11/checkout_completed/event-1.json",
    );
  });

  it("keeps one replaceable summary per tenant session", () => {
    expect(
      sessionSummaryKey(
        "pathminty-demo-store.myshopify.com",
        "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
      ),
    ).toBe(
      "session-summaries/v1/pathminty-demo-store.myshopify.com/cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d.json",
    );
  });
});
