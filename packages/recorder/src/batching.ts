import { KEEPALIVE_MAX_BODY_BYTES, MAX_REPLAY_BATCH_BYTES } from "@pathminty/contracts";

/**
 * Soft packing target for event payload bytes (leave room for the JSON envelope).
 * Hard rejection uses MAX_REPLAY_BATCH_BYTES (2 MiB full HTTP body).
 */
export const DEFAULT_RECORDER_POLICY = Object.freeze({
  flushIntervalMs: 5_000,
  maxBatchEvents: 80,
  /** Soft flush threshold for encoded event array bytes. */
  maxBatchBytes: 512 * 1024,
  /** Hard limit for the full POST body (matches collector). */
  hardBatchBytes: MAX_REPLAY_BATCH_BYTES,
  /** Never set fetch keepalive above this (browser ~64 KiB cap). */
  keepaliveMaxBodyBytes: KEEPALIVE_MAX_BODY_BYTES,
  maxSessionDurationMs: 15 * 60 * 1_000,
  mousemoveSamplingMs: 50,
  maskAllInputs: true as const,
});

export type RecorderPolicy = typeof DEFAULT_RECORDER_POLICY;

export type PendingBatch = Readonly<{
  sequence: number;
  batchId: string;
  events: readonly unknown[];
  final: boolean;
  /** Encoded event-array byte length (not full HTTP body). */
  byteLength: number;
}>;

export type BatchTransport = {
  send(batch: PendingBatch): Promise<void>;
};

export type SequenceAllocator = {
  allocate(): number;
  createBatchId(): string;
};

export class BatchTooLargeError extends Error {
  override readonly name = "BatchTooLargeError";
  constructor(message = "Replay batch exceeds the hard size limit") {
    super(message);
  }
}

export function isBatchTooLargeError(error: unknown): boolean {
  return (
    error instanceof BatchTooLargeError ||
    (error instanceof Error && error.name === "BatchTooLargeError")
  );
}

/** Keepalive is safe only for small bodies (browser effective cap ~64 KiB). */
export function shouldUseKeepalive(
  bodyBytes: number,
  limit: number = KEEPALIVE_MAX_BODY_BYTES,
): boolean {
  return bodyBytes > 0 && bodyBytes <= limit;
}

export function isWithinHardBatchLimit(
  bodyBytes: number,
  hardLimit: number = MAX_REPLAY_BATCH_BYTES,
): boolean {
  return bodyBytes <= hardLimit;
}

export function measureUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Buffers events and flushes on interval, event count, soft byte size, or final.
 *
 * Sequence and batchId are allocated once when a flush is prepared. Network
 * failures keep the same pair for idempotent retry. Permanent hard-limit
 * failures drop the inflight batch so later batches are not poisoned.
 */
export function createBatchUploader(
  transport: BatchTransport,
  allocator: SequenceAllocator,
  policy: Pick<
    RecorderPolicy,
    "maxBatchEvents" | "maxBatchBytes" | "hardBatchBytes"
  > = DEFAULT_RECORDER_POLICY,
): {
  push(event: unknown): void;
  flush(final?: boolean): Promise<void>;
  size(): number;
} {
  let events: unknown[] = [];
  let inflight: PendingBatch | null = null;
  let chain: Promise<void> = Promise.resolve();

  function estimateEventBytes(items: readonly unknown[]): number {
    try {
      return measureUtf8Bytes(JSON.stringify(items));
    } catch {
      return items.length * 256;
    }
  }

  function shouldFlushBySize(items: readonly unknown[]): boolean {
    if (items.length >= policy.maxBatchEvents) return true;
    return estimateEventBytes(items) >= policy.maxBatchBytes;
  }

  function prepare(final: boolean): PendingBatch | null {
    if (inflight) {
      if (final && !inflight.final) {
        inflight = { ...inflight, final: true };
      }
      return inflight;
    }
    if (events.length === 0 && !final) return null;

    const pending = events;
    events = [];
    inflight = {
      sequence: allocator.allocate(),
      batchId: allocator.createBatchId(),
      events: pending,
      final,
      byteLength: estimateEventBytes(pending),
    };
    return inflight;
  }

  function enqueueFlush(final: boolean): Promise<void> {
    chain = chain
      .catch(() => undefined)
      .then(async () => {
        const batch = prepare(final);
        if (!batch) return;
        try {
          await transport.send(batch);
          inflight = null;
        } catch (error) {
          if (isBatchTooLargeError(error)) {
            // Drop permanently oversized batch; free the sequence slot for later work.
            inflight = null;
            return;
          }
          // Network/transient: keep inflight (sequence + batchId) for retry.
          throw error;
        }
      });
    return chain;
  }

  return {
    push(event: unknown) {
      // Pack: if adding this event would blow the soft limit, flush first
      // (unless the buffer is empty — a single FullSnapshot may be large).
      if (events.length > 0 && shouldFlushBySize([...events, event])) {
        void enqueueFlush(false);
      }
      events.push(event);
      if (shouldFlushBySize(events)) {
        void enqueueFlush(false);
      }
    },
    flush(final = false) {
      return enqueueFlush(final);
    },
    size() {
      return events.length + (inflight?.events.length ?? 0);
    },
  };
}
