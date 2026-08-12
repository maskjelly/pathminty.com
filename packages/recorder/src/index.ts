export {
  BatchTooLargeError,
  DEFAULT_RECORDER_POLICY,
  createBatchUploader,
  isBatchTooLargeError,
  isWithinHardBatchLimit,
  measureUtf8Bytes,
  shouldUseKeepalive,
  type BatchTransport,
  type PendingBatch,
  type RecorderPolicy,
  type SequenceAllocator,
} from "./batching";
export {
  hasAnalyticsConsent,
  nextLoaderAction,
  privacyApiReady,
  shouldLoadRuntime,
  type LoaderPrivacyApi,
  type LoaderShopify,
} from "./loader-logic";
export {
  PRIVATE_BLOCK_SELECTOR,
  PRIVATE_MASK_TEXT_SELECTOR,
  RRWEB_MASK_INPUT_OPTIONS,
  SENSITIVE_ROUTE_PATTERN,
  createRrwebPrivacyOptions,
  isSensitiveStorefrontRoute,
  sanitizeRecordedRoute,
  type RrwebRecordPrivacyOptions,
} from "./privacy";
export {
  STORAGE_KEYS,
  allocateSequence,
  getOrCreateSessionIdentity,
  peekSequence,
  type SequenceStore,
  type SessionIdentity,
} from "./sequence";
export {
  RRWEB_FULL_SNAPSHOT_TYPE,
  isRrwebFullSnapshotEvent,
  shouldFlushImmediatelyAfterEvent,
} from "./snapshot";

export type RecorderTransportBatch = Readonly<{
  events: readonly unknown[];
  final: boolean;
}>;

export interface RecorderTransport {
  send(batch: RecorderTransportBatch): Promise<void>;
}

export interface RecorderDriver {
  start(emit: (event: unknown) => void): () => void;
}

export interface RecorderController {
  flush(final?: boolean): Promise<void>;
  stop(): Promise<void>;
}

export function createRecorderController(
  driver: RecorderDriver,
  transport: RecorderTransport,
): RecorderController {
  let events: unknown[] = [];
  let stopped = false;
  const stopDriver = driver.start((event) => {
    if (!stopped) events.push(event);
  });

  async function flush(final = false): Promise<void> {
    if (events.length === 0 && !final) return;

    const pending = events;
    events = [];

    try {
      await transport.send({ events: pending, final });
    } catch (error) {
      events = [...pending, ...events];
      throw error;
    }
  }

  return {
    flush,
    async stop() {
      if (stopped) return;
      stopped = true;
      stopDriver();
      await flush(true);
    },
  };
}
