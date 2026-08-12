import {
  assessReplayReconstruction,
  summarizeReplayBatches,
} from "@pathminty/analytics";
import { R2ReplayObjectStore } from "@pathminty/cloudflare";
import { SessionSummaryJobSchema, type SessionSummaryJob } from "@pathminty/contracts";
import { log } from "@pathminty/observability";

export default {
  async queue(batch, env) {
    const objectStore = new R2ReplayObjectStore(env.REPLAY_BUCKET);

    for (const message of batch.messages) {
      const result = SessionSummaryJobSchema.safeParse(message.body);

      if (!result.success) {
        log("error", "session_job_rejected", {
          messageId: message.id,
          attempts: message.attempts,
        });
        message.ack();
        continue;
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
          continue;
        }

        const summary = summarizeReplayBatches(replayBatches, {
          isFinal: result.data.isFinal,
        });
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
  },
} satisfies ExportedHandler<Cloudflare.Env, SessionSummaryJob>;
