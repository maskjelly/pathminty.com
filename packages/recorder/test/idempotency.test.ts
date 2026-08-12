import { describe, expect, it, vi } from "vitest";

import { allocateSequence, createBatchUploader } from "../src/index";

function chunkKey(input: {
  shopId: string;
  sessionId: string;
  sequence: number;
  batchId: string;
}) {
  // Mirrors packages/storage replayChunkKey — sequence pad + batchId collision guard.
  return `replays/v1/${input.shopId}/${input.sessionId}/chunks/${String(
    input.sequence,
  ).padStart(8, "0")}_${input.batchId}.json`;
}

describe("cross-navigation sequence and R2 key collision prevention", () => {
  it("keeps ordered unique keys as sequences advance across navigations", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    const keys = [0, 1, 2].map((index) => {
      const sequence = allocateSequence(storage);
      return chunkKey({
        shopId: "pathminty-demo-store.myshopify.com",
        sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
        sequence,
        batchId: `2c907c67-d57f-47aa-ac9d-e275ca730bf${index}`,
      });
    });

    expect(new Set(keys).size).toBe(3);
    expect(keys[0]! < keys[1]!).toBe(true);
    expect(keys[1]! < keys[2]!).toBe(true);
  });

  it("retries with the same sequence and batchId for idempotency", async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(undefined);

    const uploader = createBatchUploader(
      { send },
      {
        allocate: () => allocateSequence(storage),
        createBatchId: () => "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
      },
    );

    uploader.push({ type: 3, data: {}, timestamp: 1 });
    await expect(uploader.flush(false)).rejects.toThrow("network");
    await uploader.flush(false);

    const first = send.mock.calls[0]?.[0] as {
      sequence: number;
      batchId: string;
    };
    const second = send.mock.calls[1]?.[0] as {
      sequence: number;
      batchId: string;
    };
    expect(first.sequence).toBe(second.sequence);
    expect(first.batchId).toBe(second.batchId);

    const key = chunkKey({
      shopId: "pathminty-demo-store.myshopify.com",
      sessionId: "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
      sequence: first.sequence,
      batchId: first.batchId,
    });
    expect(key).toContain("chunks/00000000_2c907c67-d57f-47aa-ac9d-e275ca730bf2.json");
  });
});
