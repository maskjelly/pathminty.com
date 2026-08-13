export {
  buildCollectorForwardInit,
  collectorResponseToClient,
  forwardReplayBatchToCollector,
  installationKey,
  INTERNAL_COLLECTOR_REPLAY_URL,
  loadStorefrontInstallation,
  rejectUnlessPost,
  STOREFRONT_CAPTURE_PATH,
  type CollectorFetcher,
  type InstallationStore,
} from "./capture-proxy";

import type {
  CheckoutIndex,
  OrderFact,
  ReplayBatch,
  SessionCompletedJob,
  SessionSummary,
  ShopifyPixelEvent,
} from "@pathminty/contracts";
import {
  CheckoutIndexSchema,
  OrderFactSchema,
  ReplayBatchSchema,
  SessionSummarySchema,
} from "@pathminty/contracts";
import {
  checkoutIndexKey,
  orderFactKey,
  orderFactPrefix,
  replayChunkKey,
  replayManifestKey,
  replaySessionPrefix,
  sessionSummaryKey,
  sessionSummaryPrefix,
  shopifyEventKey,
  shopObjectPrefixes,
  type ReplayManifest,
  type ReplayObjectStore,
  type SessionJobPublisher,
} from "@pathminty/storage";

export class R2ReplayObjectStore implements ReplayObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  async putChunk(batch: ReplayBatch, bytes: Uint8Array): Promise<void> {
    await this.bucket.put(replayChunkKey(batch), bytes, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: {
        batchId: batch.batchId,
        encoding: batch.encoding,
        shopId: batch.shopId,
        sessionId: batch.sessionId,
      },
    });
  }

  async putShopifyEvent(
    event: ShopifyPixelEvent,
    objectId: string,
    bytes: Uint8Array,
  ): Promise<void> {
    await this.bucket.put(shopifyEventKey(event, objectId), bytes, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: {
        eventType: event.type,
        shopId: event.shopId,
      },
    });
  }

  async listChunks(shopId: string, sessionId: string) {
    const prefix = `${replaySessionPrefix(shopId, sessionId)}chunks/`;
    const chunks = [];
    let cursor: string | undefined;

    do {
      const page = await this.bucket.list(
        cursor === undefined ? { prefix } : { prefix, cursor },
      );
      chunks.push(
        ...page.objects.map((object) => ({
          key: object.key,
          size: object.size,
          uploadedAt: object.uploaded,
        })),
      );
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);

    return chunks;
  }

  async getBatches(shopId: string, sessionId: string): Promise<ReplayBatch[]> {
    const chunks = await this.listChunks(shopId, sessionId);
    const batches = await Promise.all(
      chunks
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(async (chunk) => {
          const object = await this.bucket.get(chunk.key);
          if (!object) throw new Error(`Replay chunk is missing: ${chunk.key}`);
          const parsed = ReplayBatchSchema.safeParse(await object.json<unknown>());
          if (!parsed.success) throw new Error(`Replay chunk is invalid: ${chunk.key}`);
          return parsed.data;
        }),
    );

    return batches;
  }

  async putManifest(manifest: ReplayManifest): Promise<void> {
    await this.bucket.put(
      replayManifestKey(manifest.shopId, manifest.sessionId),
      JSON.stringify(manifest),
      { httpMetadata: { contentType: "application/json" } },
    );
  }

  async putSessionSummary(summary: SessionSummary): Promise<void> {
    await this.bucket.put(
      sessionSummaryKey(summary.shopId, summary.sessionId),
      JSON.stringify(summary),
      {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          device: summary.device,
          endedAt: summary.endedAt,
          lastSeenAt: summary.lastSeenAt,
          status: summary.status,
          shopId: summary.shopId,
        },
      },
    );
  }

  async getSessionSummary(
    shopId: string,
    sessionId: string,
  ): Promise<SessionSummary | null> {
    const object = await this.bucket.get(sessionSummaryKey(shopId, sessionId));
    if (!object) return null;
    const parsed = SessionSummarySchema.safeParse(await object.json<unknown>());
    if (!parsed.success) throw new Error("Stored session summary is invalid");
    return parsed.data;
  }

  async listSessionSummaries(shopId: string, limit: number): Promise<SessionSummary[]> {
    const page = await this.bucket.list({
      prefix: sessionSummaryPrefix(shopId),
      limit: Math.min(Math.max(limit, 1), 100),
    });
    const summaries = await Promise.all(
      page.objects.map(async (item) => {
        const object = await this.bucket.get(item.key);
        if (!object) return null;
        const parsed = SessionSummarySchema.safeParse(await object.json<unknown>());
        return parsed.success ? parsed.data : null;
      }),
    );

    return summaries
      .filter((summary): summary is SessionSummary => summary !== null)
      .sort((left, right) => {
        const leftSeen = left.lastSeenAt ?? left.endedAt;
        const rightSeen = right.lastSeenAt ?? right.endedAt;
        return rightSeen.localeCompare(leftSeen);
      });
  }

  async putOrderFact(order: OrderFact): Promise<void> {
    await this.bucket.put(
      orderFactKey(order.shopId, order.shopifyOrderId),
      JSON.stringify(order),
      {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          shopId: order.shopId,
          currency: order.currency,
          ...(order.sessionId ? { sessionId: order.sessionId } : {}),
        },
      },
    );
  }

  async getOrderFact(
    shopId: string,
    shopifyOrderId: string,
  ): Promise<OrderFact | null> {
    const object = await this.bucket.get(orderFactKey(shopId, shopifyOrderId));
    if (!object) return null;
    const parsed = OrderFactSchema.safeParse(await object.json<unknown>());
    if (!parsed.success) throw new Error("Stored order fact is invalid");
    return parsed.data;
  }

  async listOrderFacts(shopId: string, limit: number): Promise<OrderFact[]> {
    const page = await this.bucket.list({
      prefix: orderFactPrefix(shopId),
      limit: Math.min(Math.max(limit, 1), 200),
    });
    const orders = await Promise.all(
      page.objects.map(async (item) => {
        const object = await this.bucket.get(item.key);
        if (!object) return null;
        const parsed = OrderFactSchema.safeParse(await object.json<unknown>());
        return parsed.success ? parsed.data : null;
      }),
    );
    return orders
      .filter((order): order is OrderFact => order !== null)
      .sort((left, right) => right.orderedAt.localeCompare(left.orderedAt));
  }

  async putCheckoutIndex(index: CheckoutIndex): Promise<void> {
    await this.bucket.put(
      checkoutIndexKey(index.shopId, index.checkoutToken),
      JSON.stringify(index),
      {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          shopId: index.shopId,
          ...(index.sessionId ? { sessionId: index.sessionId } : {}),
        },
      },
    );
  }

  async getCheckoutIndex(
    shopId: string,
    checkoutToken: string,
  ): Promise<CheckoutIndex | null> {
    const object = await this.bucket.get(checkoutIndexKey(shopId, checkoutToken));
    if (!object) return null;
    const parsed = CheckoutIndexSchema.safeParse(await object.json<unknown>());
    if (!parsed.success) throw new Error("Stored checkout index is invalid");
    return parsed.data;
  }

  async deleteShopObjects(shopId: string): Promise<number> {
    let deleted = 0;
    for (const prefix of shopObjectPrefixes(shopId)) {
      let cursor: string | undefined;
      do {
        const page = await this.bucket.list(
          cursor === undefined ? { prefix } : { prefix, cursor },
        );
        if (page.objects.length > 0) {
          await Promise.all(
            page.objects.map((object) => this.bucket.delete(object.key)),
          );
          deleted += page.objects.length;
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor !== undefined);
    }
    return deleted;
  }
}

export class CloudflareSessionJobPublisher implements SessionJobPublisher {
  constructor(private readonly queue: Queue<SessionCompletedJob>) {}

  async publishSessionCompleted(job: SessionCompletedJob): Promise<void> {
    await this.queue.send(job, { contentType: "json" });
  }
}
