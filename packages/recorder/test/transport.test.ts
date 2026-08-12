import { KEEPALIVE_MAX_BODY_BYTES, MAX_REPLAY_BATCH_BYTES } from "@pathminty/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  BatchTooLargeError,
  createBatchUploader,
  isWithinHardBatchLimit,
  measureUtf8Bytes,
  shouldUseKeepalive,
  type PendingBatch,
} from "../src/index";

describe("keepalive decision", () => {
  it("enables keepalive only at or below the 60 KiB browser-safe cap", () => {
    expect(shouldUseKeepalive(1)).toBe(true);
    expect(shouldUseKeepalive(KEEPALIVE_MAX_BODY_BYTES)).toBe(true);
    expect(shouldUseKeepalive(KEEPALIVE_MAX_BODY_BYTES + 1)).toBe(false);
    expect(shouldUseKeepalive(128 * 1024)).toBe(false);
    expect(shouldUseKeepalive(0)).toBe(false);
  });
});

describe("hard batch limit", () => {
  it("admits realistic full-snapshot sized bodies under 2 MiB", () => {
    expect(MAX_REPLAY_BATCH_BYTES).toBe(2 * 1024 * 1024);
    expect(isWithinHardBatchLimit(900 * 1024)).toBe(true);
    expect(isWithinHardBatchLimit(MAX_REPLAY_BATCH_BYTES)).toBe(true);
    expect(isWithinHardBatchLimit(MAX_REPLAY_BATCH_BYTES + 1)).toBe(false);
  });

  it("measures utf-8 body bytes accurately", () => {
    expect(measureUtf8Bytes("abc")).toBe(3);
    expect(measureUtf8Bytes("héllo")).toBe(6);
  });
});

describe("oversize batch handling does not poison later batches", () => {
  it("drops a permanently oversized inflight batch and accepts later work", async () => {
    const send = vi.fn((batch: PendingBatch): Promise<void> => {
      if (batch.sequence === 0) {
        return Promise.reject(new BatchTooLargeError("too large"));
      }
      return Promise.resolve();
    });

    let nextId = 0;
    const uploader = createBatchUploader(
      { send },
      {
        allocate: () => {
          const value = nextId;
          nextId += 1;
          return value;
        },
        createBatchId: () =>
          `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
      },
    );

    uploader.push({ type: 2, data: { huge: true }, timestamp: 1 });
    await uploader.flush(false);

    uploader.push({ type: 3, data: { source: 2 }, timestamp: 2 });
    await uploader.flush(false);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]?.sequence).toBe(0);
    expect(send.mock.calls[1]?.[0]?.sequence).toBe(1);
    // Second batch succeeded (no throw); oversized first was dropped, not retried.
  });

  it("keeps sequence+batchId on retry for transient network failures", async () => {
    const send = vi
      .fn((_batch: PendingBatch): Promise<void> => Promise.resolve())
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);

    const uploader = createBatchUploader(
      { send },
      {
        allocate: () => 7,
        createBatchId: () => "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
      },
    );

    uploader.push({ type: 2, timestamp: 1, data: {} });
    await expect(uploader.flush(false)).rejects.toThrow("network");
    await uploader.flush(false);

    expect(send.mock.calls[0]?.[0]?.sequence).toBe(7);
    expect(send.mock.calls[1]?.[0]?.sequence).toBe(7);
    expect(send.mock.calls[0]?.[0]?.batchId).toBe(send.mock.calls[1]?.[0]?.batchId);
  });
});
