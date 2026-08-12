import type {
  ReplayBatch,
  SessionCompletedJob,
  SessionSummary,
  ShopifyPixelEvent,
} from "@pathminty/contracts";

export type ReplayChunkMetadata = Readonly<{
  key: string;
  size: number;
  uploadedAt: Date;
}>;

export type ReplayManifest = Readonly<{
  schemaVersion: 1;
  shopId: string;
  sessionId: string;
  chunkCount: number;
  totalBytes: number;
  completedAt: string;
}>;

export interface ReplayObjectStore {
  putChunk(batch: ReplayBatch, bytes: Uint8Array): Promise<void>;
  putShopifyEvent(
    event: ShopifyPixelEvent,
    objectId: string,
    bytes: Uint8Array,
  ): Promise<void>;
  listChunks(shopId: string, sessionId: string): Promise<ReplayChunkMetadata[]>;
  getBatches(shopId: string, sessionId: string): Promise<ReplayBatch[]>;
  putManifest(manifest: ReplayManifest): Promise<void>;
  putSessionSummary(summary: SessionSummary): Promise<void>;
  getSessionSummary(shopId: string, sessionId: string): Promise<SessionSummary | null>;
  listSessionSummaries(shopId: string, limit: number): Promise<SessionSummary[]>;
}

export interface SessionJobPublisher {
  publishSessionCompleted(job: SessionCompletedJob): Promise<void>;
}

export function replaySessionPrefix(shopId: string, sessionId: string): string {
  return `replays/v1/${shopId}/${sessionId}/`;
}

/**
 * Chunk key layout:
 *   replays/v1/{shopId}/{sessionId}/chunks/{sequence:08d}_{batchId}.json
 *
 * Sequence is zero-padded so lexicographic order == chronological order.
 * batchId is appended so a race that somehow reused a sequence cannot overwrite
 * a different accepted batch; retries must reuse the same sequence+batchId.
 */
export function replayChunkKey(
  batch: Pick<ReplayBatch, "shopId" | "sessionId" | "sequence" | "batchId">,
): string {
  return `${replaySessionPrefix(batch.shopId, batch.sessionId)}chunks/${String(
    batch.sequence,
  ).padStart(8, "0")}_${batch.batchId}.json`;
}

export function replayManifestKey(shopId: string, sessionId: string): string {
  return `${replaySessionPrefix(shopId, sessionId)}manifest.json`;
}

export function sessionSummaryPrefix(shopId: string): string {
  return `session-summaries/v1/${shopId}/`;
}

export function sessionSummaryKey(shopId: string, sessionId: string): string {
  return `${sessionSummaryPrefix(shopId)}${sessionId}.json`;
}

export function shopifyEventKey(
  event: Pick<ShopifyPixelEvent, "shopId" | "occurredAt" | "type">,
  objectId: string,
): string {
  const day = event.occurredAt.slice(0, 10);
  return `shopify-events/v1/${event.shopId}/${day}/${event.type}/${objectId}.json`;
}
