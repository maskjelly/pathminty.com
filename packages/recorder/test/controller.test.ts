import { describe, expect, it, vi } from "vitest";

import {
  allocateSequence,
  createBatchUploader,
  createRecorderController,
  createRrwebPrivacyOptions,
  getOrCreateSessionIdentity,
  isSensitiveStorefrontRoute,
  peekSequence,
  sanitizeRecordedRoute,
  type PendingBatch,
} from "../src/index";

describe("createRecorderController", () => {
  it("flushes captured events through the injected transport", async () => {
    let emit: ((event: unknown) => void) | undefined;
    const send = vi.fn(async () => {});
    const controller = createRecorderController(
      {
        start(next) {
          emit = next;
          return () => {};
        },
      },
      { send },
    );

    emit?.({ type: "click" });
    await controller.flush();

    expect(send).toHaveBeenCalledWith({ events: [{ type: "click" }], final: false });
  });

  it("restores a failed batch for retry", async () => {
    let emit: ((event: unknown) => void) | undefined;
    const send = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const controller = createRecorderController(
      {
        start(next) {
          emit = next;
          return () => {};
        },
      },
      { send },
    );

    emit?.({ type: "scroll" });
    await expect(controller.flush()).rejects.toThrow("offline");
    await controller.flush();

    expect(send).toHaveBeenLastCalledWith({
      events: [{ type: "scroll" }],
      final: false,
    });
  });
});

describe("sequence allocation across navigations", () => {
  it("allocates monotonically increasing sequences without resetting", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(allocateSequence(storage)).toBe(0);
    expect(allocateSequence(storage)).toBe(1);
    expect(allocateSequence(storage)).toBe(2);
    expect(peekSequence(storage)).toBe(3);

    // Simulates a new document that reuses the same sessionStorage.
    expect(allocateSequence(storage)).toBe(3);
  });

  it("allocates sequence before upload so retries keep the same pair", async () => {
    // sequence + batchId pair is fixed for the in-flight batch
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    const send = vi
      .fn(async (_batch: PendingBatch) => {})
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);

    let nextBatch = 0;
    const uploader = createBatchUploader(
      { send },
      {
        allocate: () => allocateSequence(storage),
        createBatchId: () => {
          nextBatch += 1;
          return `00000000-0000-4000-8000-${String(nextBatch).padStart(12, "0")}`;
        },
      },
    );

    uploader.push({ type: 2, timestamp: 1, data: {} });
    await expect(uploader.flush(false)).rejects.toThrow("network");
    await uploader.flush(false);

    expect(send).toHaveBeenCalledTimes(2);
    // Retries reuse the same pre-allocated sequence and batchId for R2 idempotency.
    const first = send.mock.calls[0]?.[0];
    const second = send.mock.calls[1]?.[0];
    expect(first?.sequence).toBe(0);
    expect(second?.sequence).toBe(0);
    expect(first?.batchId).toBe(second?.batchId);
  });

  it("creates stable session identity in session storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const first = getOrCreateSessionIdentity(
      storage,
      () => "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d",
    );
    const second = getOrCreateSessionIdentity(storage, () => "should-not-be-used");
    expect(first.sessionId).toBe(second.sessionId);
    expect(first.visitorId).toBe(second.visitorId);
  });
});

describe("privacy configuration", () => {
  it("masks inputs and blocks private selectors", () => {
    const options = createRrwebPrivacyOptions();
    expect(options.maskAllInputs).toBe(true);
    expect(options.maskInputOptions.password).toBe(true);
    expect(options.maskInputOptions.email).toBe(true);
    expect(options.maskInputOptions.textarea).toBe(true);
    expect(options.maskInputOptions.select).toBe(true);
    expect(options.blockSelector).toContain("[data-pathminty-private]");
    expect(options.blockSelector).toContain("input[type='password']");
    expect(options.recordCrossOriginIframes).toBe(false);
  });

  it("skips sensitive storefront routes and strips query strings", () => {
    expect(isSensitiveStorefrontRoute("/checkout")).toBe(true);
    expect(isSensitiveStorefrontRoute("/account/orders")).toBe(true);
    expect(isSensitiveStorefrontRoute("/products/shirt")).toBe(false);
    expect(sanitizeRecordedRoute("/products/shirt", "?variant=1", "#reviews")).toBe(
      "/products/shirt",
    );
  });
});
