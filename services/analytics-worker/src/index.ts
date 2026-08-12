import {
  applyShopifyRefundToOrder,
  assessReplayReconstruction,
  attachOrderToSession,
  findSessionForOrder,
  parseShopifyOrderPayload,
  summarizeReplayBatches,
} from "@pathminty/analytics";
import { R2ReplayObjectStore } from "@pathminty/cloudflare";
import {
  SessionSummaryJobSchema,
  ShopifyWebhookJobSchema,
  type CheckoutIndex,
  type OrderFact,
  type SessionSummaryJob,
  type ShopifyWebhookJob,
} from "@pathminty/contracts";
import { log } from "@pathminty/observability";

function isShopifyWebhooksQueue(queueName: string) {
  return queueName.includes("shopify-webhooks");
}

async function processSessionJob(
  message: Message<SessionSummaryJob>,
  objectStore: R2ReplayObjectStore,
) {
  const result = SessionSummaryJobSchema.safeParse(message.body);

  if (!result.success) {
    log("error", "session_job_rejected", {
      messageId: message.id,
      attempts: message.attempts,
    });
    message.ack();
    return;
  }

  try {
    const chunks = await objectStore.listChunks(
      result.data.shopId,
      result.data.sessionId,
    );
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);

    // Manifest is updated on every summary pass; completedAt reflects the
    // latest processed job, not only a final browser flush.
    await objectStore.putManifest({
      schemaVersion: 1,
      shopId: result.data.shopId,
      sessionId: result.data.sessionId,
      chunkCount: chunks.length,
      totalBytes,
      completedAt: result.data.enqueuedAt,
    });

    const replayBatches = await objectStore.getBatches(
      result.data.shopId,
      result.data.sessionId,
    );
    if (replayBatches.length === 0) {
      log("info", "session_summary_skipped_empty", {
        messageId: message.id,
        shopId: result.data.shopId,
        sessionId: result.data.sessionId,
      });
      message.ack();
      return;
    }

    let summary = summarizeReplayBatches(replayBatches, {
      isFinal: result.data.isFinal,
    });

    // Preserve order attribution if a prior commerce join already wrote revenue.
    const existing = await objectStore.getSessionSummary(
      result.data.shopId,
      result.data.sessionId,
    );
    if (existing?.orderId) {
      summary = {
        ...summary,
        ...(existing.checkoutTokens
          ? { checkoutTokens: existing.checkoutTokens }
          : {}),
        orderId: existing.orderId,
        ...(typeof existing.netRevenueMinor === "number"
          ? { netRevenueMinor: existing.netRevenueMinor }
          : {}),
        ...(existing.currency ? { currency: existing.currency } : {}),
        ...(existing.purchasedAt ? { purchasedAt: existing.purchasedAt } : {}),
      };
    }

    await objectStore.putSessionSummary(summary);

    const reconstruction = assessReplayReconstruction(replayBatches);

    log("info", "replay_session_processed", {
      messageId: message.id,
      jobId: result.data.jobId,
      shopId: result.data.shopId,
      sessionId: result.data.sessionId,
      chunkCount: chunks.length,
      totalBytes,
      eventCount: summary.eventCount,
      clickCount: summary.clickCount,
      status: summary.status,
      isFinal: result.data.isFinal,
      reconstruction: reconstruction.reconstruction,
    });
    message.ack();
  } catch (error) {
    log(
      "error",
      "session_job_failed",
      {
        messageId: message.id,
        attempts: message.attempts,
        shopId: result.data.shopId,
        sessionId: result.data.sessionId,
      },
      error,
    );
    message.retry({ delaySeconds: Math.min(60, 2 ** message.attempts) });
  }
}

async function upsertOrderAndJoin(
  objectStore: R2ReplayObjectStore,
  shopId: string,
  order: OrderFact,
) {
  const existing = await objectStore.getOrderFact(shopId, order.shopifyOrderId);
  let next: OrderFact = order;
  if (existing) {
    // Keep the higher refund total; re-parsed create/update may reset refunds to 0.
    next = {
      ...order,
      refundsMinor: Math.max(existing.refundsMinor, order.refundsMinor),
      sessionId: order.sessionId ?? existing.sessionId,
      netRevenueMinor: order.netRevenueMinor,
    };
    // Recompute net with preserved refunds if create/update had lower refunds.
    if (next.refundsMinor !== order.refundsMinor) {
      const gmv = BigInt(next.gmvMinor);
      const disc = BigInt(next.discountsMinor);
      const ref = BigInt(next.refundsMinor);
      const can = BigInt(next.cancellationsMinor);
      const net = gmv - disc - ref - can;
      next = {
        ...next,
        netRevenueMinor: Number(net > 0n ? net : 0n),
      };
    }
  }

  let indexedSessionId: string | null = null;
  if (next.checkoutToken) {
    const index = await objectStore.getCheckoutIndex(shopId, next.checkoutToken);
    if (index?.sessionId) indexedSessionId = index.sessionId;
  }

  if (!next.sessionId) {
    const sessions = await objectStore.listSessionSummaries(shopId, 100);
    const match = findSessionForOrder(sessions, {
      orderedAtMs: Date.parse(next.orderedAt),
      checkoutToken: next.checkoutToken ?? null,
      indexedSessionId,
    });
    if (match) {
      next = { ...next, sessionId: match.sessionId };
      const attributed = attachOrderToSession(match, next);
      await objectStore.putSessionSummary(attributed);
    }
  } else {
    const summary = await objectStore.getSessionSummary(shopId, next.sessionId);
    if (summary) {
      await objectStore.putSessionSummary(attachOrderToSession(summary, next));
    }
  }

  await objectStore.putOrderFact(next);

  if (next.checkoutToken) {
    const now = next.updatedAt;
    const prior = await objectStore.getCheckoutIndex(shopId, next.checkoutToken);
    const index: CheckoutIndex = {
      schemaVersion: 1,
      shopId,
      checkoutToken: next.checkoutToken,
      ...(next.sessionId ? { sessionId: next.sessionId } : {}),
      shopifyOrderId: next.shopifyOrderId,
      ...(prior?.clientId ? { clientId: prior.clientId } : {}),
      occurredAt: prior?.occurredAt ?? next.orderedAt,
      updatedAt: now,
    };
    await objectStore.putCheckoutIndex(index);
  }

  return next;
}

async function processShopifyWebhook(
  message: Message<ShopifyWebhookJob>,
  objectStore: R2ReplayObjectStore,
) {
  const result = ShopifyWebhookJobSchema.safeParse(message.body);
  if (!result.success) {
    log("error", "shopify_webhook_rejected", {
      messageId: message.id,
      attempts: message.attempts,
    });
    message.ack();
    return;
  }

  const job = result.data;
  // Never log payload contents — may contain residual customer fields.
  try {
    if (job.topic === "ORDERS_CREATE" || job.topic === "ORDERS_UPDATED") {
      const parsed = parseShopifyOrderPayload(job.shop, job.payload, job.receivedAt);
      if (!parsed) {
        log("info", "shopify_order_skipped_invalid", {
          messageId: message.id,
          shopId: job.shop,
          topic: job.topic,
          webhookId: job.webhookId,
        });
        message.ack();
        return;
      }
      const saved = await upsertOrderAndJoin(objectStore, job.shop, parsed);
      log("info", "shopify_order_processed", {
        messageId: message.id,
        shopId: job.shop,
        topic: job.topic,
        webhookId: job.webhookId,
        shopifyOrderId: saved.shopifyOrderId,
        hasSession: Boolean(saved.sessionId),
        netRevenueMinor: saved.netRevenueMinor,
        currency: saved.currency,
      });
      message.ack();
      return;
    }

    if (job.topic === "REFUNDS_CREATE") {
      const body =
        typeof job.payload === "object" && job.payload !== null
          ? (job.payload as Record<string, unknown>)
          : null;
      const orderIdRaw = body?.order_id;
      const orderId =
        typeof orderIdRaw === "number"
          ? String(Math.trunc(orderIdRaw))
          : typeof orderIdRaw === "string"
            ? orderIdRaw
            : null;
      if (!orderId) {
        log("info", "shopify_refund_skipped_no_order", {
          messageId: message.id,
          shopId: job.shop,
          webhookId: job.webhookId,
        });
        message.ack();
        return;
      }
      const existing = await objectStore.getOrderFact(job.shop, orderId);
      if (!existing) {
        // Order may arrive later; retry a few times then drop.
        if (message.attempts < 3) {
          message.retry({ delaySeconds: 30 });
          return;
        }
        log("info", "shopify_refund_order_missing", {
          messageId: message.id,
          shopId: job.shop,
          webhookId: job.webhookId,
        });
        message.ack();
        return;
      }
      const updated = applyShopifyRefundToOrder(existing, job.payload, job.receivedAt);
      await objectStore.putOrderFact(updated);
      if (updated.sessionId) {
        const summary = await objectStore.getSessionSummary(
          job.shop,
          updated.sessionId,
        );
        if (summary) {
          await objectStore.putSessionSummary(attachOrderToSession(summary, updated));
        }
      }
      log("info", "shopify_refund_processed", {
        messageId: message.id,
        shopId: job.shop,
        webhookId: job.webhookId,
        shopifyOrderId: updated.shopifyOrderId,
        refundsMinor: updated.refundsMinor,
        netRevenueMinor: updated.netRevenueMinor,
      });
      message.ack();
      return;
    }

    // Compliance topics: acknowledge only for now (retention jobs land later).
    log("info", "shopify_webhook_ack_only", {
      messageId: message.id,
      shopId: job.shop,
      topic: job.topic,
      webhookId: job.webhookId,
    });
    message.ack();
  } catch (error) {
    log(
      "error",
      "shopify_webhook_failed",
      {
        messageId: message.id,
        attempts: message.attempts,
        shopId: job.shop,
        topic: job.topic,
        webhookId: job.webhookId,
      },
      error,
    );
    message.retry({ delaySeconds: Math.min(60, 2 ** message.attempts) });
  }
}

export default {
  async queue(batch, env) {
    const objectStore = new R2ReplayObjectStore(env.REPLAY_BUCKET);

    if (isShopifyWebhooksQueue(batch.queue)) {
      for (const message of batch.messages) {
        await processShopifyWebhook(
          message as Message<ShopifyWebhookJob>,
          objectStore,
        );
      }
      return;
    }

    for (const message of batch.messages) {
      await processSessionJob(message as Message<SessionSummaryJob>, objectStore);
    }
  },
} satisfies ExportedHandler<Cloudflare.Env, SessionSummaryJob | ShopifyWebhookJob>;
