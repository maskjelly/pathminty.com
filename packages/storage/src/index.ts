import type {
  CheckoutIndex,
  OrderFact,
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
  putOrderFact(order: OrderFact): Promise<void>;
  getOrderFact(shopId: string, shopifyOrderId: string): Promise<OrderFact | null>;
  listOrderFacts(shopId: string, limit: number): Promise<OrderFact[]>;
  putCheckoutIndex(index: CheckoutIndex): Promise<void>;
  getCheckoutIndex(
    shopId: string,
    checkoutToken: string,
  ): Promise<CheckoutIndex | null>;
  deleteShopObjects(shopId: string): Promise<number>;
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

export function orderFactPrefix(shopId: string): string {
  return `orders/v1/${shopId}/`;
}

export function orderFactKey(shopId: string, shopifyOrderId: string): string {
  return `${orderFactPrefix(shopId)}${encodeURIComponent(shopifyOrderId)}.json`;
}

export function checkoutIndexKey(shopId: string, checkoutToken: string): string {
  return `checkout-index/v1/${shopId}/${encodeURIComponent(checkoutToken)}.json`;
}

export function shopObjectPrefixes(shopId: string): readonly string[] {
  return [
    `replays/v1/${shopId}/`,
    sessionSummaryPrefix(shopId),
    `shopify-events/v1/${shopId}/`,
    orderFactPrefix(shopId),
    `checkout-index/v1/${shopId}/`,
  ];
}
