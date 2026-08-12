/**
 * Full first-party rrweb storefront runtime.
 * Bundled by scripts/build-extension.mjs into pathminty-recorder-runtime.js (IIFE).
 * Loaded by pathminty-recorder-loader.js only after analytics consent.
 * Re-checks consent, route blocking, and privacy masking before recording.
 */
import { record } from "@rrweb/record";

import {
  BatchTooLargeError,
  createBatchUploader,
  DEFAULT_RECORDER_POLICY,
  isWithinHardBatchLimit,
  measureUtf8Bytes,
  shouldUseKeepalive,
} from "./batching";
import {
  createRrwebPrivacyOptions,
  isSensitiveStorefrontRoute,
  sanitizeRecordedRoute,
} from "./privacy";
import { allocateSequence, getOrCreateSessionIdentity } from "./sequence";
import { shouldFlushImmediatelyAfterEvent } from "./snapshot";

type RecorderConfig = {
  /** Same-origin app proxy path, e.g. /apps/pathminty/capture */
  collectorUrl: string;
  shopId: string;
};

/** Best-effort retry after a failed flush (pagehide / navigation / brief offline). */
const PENDING_UPLOAD_KEY = "pathminty:pendingUpload";

type PendingUploadEnvelope = {
  schemaVersion: 1;
  shopId: string;
  visitorId: string;
  sessionId: string;
  sequence: number;
  batchId: string;
  capturedAt: string;
  route: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  document: { width: number; height: number };
  encoding: "rrweb";
  source: "storefront";
  payload: unknown[];
  isFinal: boolean;
};

type ShopifyPrivacy = {
  analyticsProcessingAllowed?: () => boolean;
};

type ShopifyGlobal = {
  customerPrivacy?: ShopifyPrivacy;
  loadFeatures?: (
    features: Array<{ name: string; version: string }>,
    callback: (error: unknown) => void,
  ) => void;
};

declare global {
  interface Window {
    Shopify?: ShopifyGlobal;
  }
}

function captureDocumentSize(): { width: number; height: number } {
  const root = document.documentElement;
  const body = document.body;
  const width = Math.max(
    root.scrollWidth,
    root.clientWidth,
    body?.scrollWidth ?? 0,
    window.innerWidth,
    1,
  );
  const height = Math.max(
    root.scrollHeight,
    root.clientHeight,
    body?.scrollHeight ?? 0,
    window.innerHeight,
    1,
  );
  return {
    width: Math.min(50_000, Math.round(width)),
    height: Math.min(200_000, Math.round(height)),
  };
}

(() => {
  "use strict";

  const host = document.querySelector("[data-pathminty-recorder]");
  if (!(host instanceof HTMLElement)) return;

  const setStatus = (status: string) => {
    host.dataset.pathmintyRecorderStatus = status;
  };

  let config: RecorderConfig | null = null;
  try {
    config = JSON.parse(host.dataset.config || "null") as RecorderConfig | null;
  } catch {
    return;
  }
  if (!config?.collectorUrl || !config?.shopId) return;
  // Same-origin only — never fall back to a public cross-origin collector URL.
  if (
    config.collectorUrl.includes("pathminty-collector") ||
    config.collectorUrl.includes("/v1/replay-batches")
  ) {
    setStatus("invalid-collector-url");
    return;
  }
  setStatus("runtime-configured");

  const privacyApi = () => window.Shopify?.customerPrivacy;
  const hasConsent = () => privacyApi()?.analyticsProcessingAllowed?.() === true;

  let started = false;
  let stopCurrent = () => undefined;

  function start() {
    // Defense in depth: loader gates load; runtime re-checks before capture.
    if (started || !hasConsent()) return;

    const route = sanitizeRecordedRoute(
      location.pathname,
      location.search,
      location.hash,
    );
    if (isSensitiveStorefrontRoute(route)) {
      setStatus("skipped-sensitive-route");
      return;
    }

    started = true;
    setStatus("recording");

    const storage = sessionStorage;
    const identity = getOrCreateSessionIdentity(storage, () => crypto.randomUUID());
    const privacy = createRrwebPrivacyOptions();

    const postEnvelope = async (envelope: PendingUploadEnvelope, useKeepalive: boolean) => {
      const body = JSON.stringify(envelope);
      const bodyBytes = measureUtf8Bytes(body);
      if (!isWithinHardBatchLimit(bodyBytes, DEFAULT_RECORDER_POLICY.hardBatchBytes)) {
        setStatus("batch-too-large");
        throw new BatchTooLargeError(
          `Replay batch body ${bodyBytes} exceeds ${DEFAULT_RECORDER_POLICY.hardBatchBytes}`,
        );
      }
      const keepalive =
        useKeepalive &&
        shouldUseKeepalive(bodyBytes, DEFAULT_RECORDER_POLICY.keepaliveMaxBodyBytes);

      // Relative same-origin URL on the merchant storefront (app proxy).
      // Site token is injected by the gateway — never sent from the browser.
      const response = await fetch(config!.collectorUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body,
        keepalive,
      });
      if (!response.ok) throw new Error("Collector rejected the batch");
    };

    const clearPendingUpload = () => {
      try {
        storage.removeItem(PENDING_UPLOAD_KEY);
      } catch {
        // ignore quota / private mode
      }
    };

    const stashPendingUpload = (envelope: PendingUploadEnvelope) => {
      try {
        storage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(envelope));
      } catch {
        // sessionStorage full or blocked — best-effort only
      }
    };

    // Retry a batch that failed on the previous document (same session).
    // Sequence+batchId are stable so the collector remains idempotent.
    try {
      const rawPending = storage.getItem(PENDING_UPLOAD_KEY);
      if (rawPending) {
        const pending = JSON.parse(rawPending) as PendingUploadEnvelope;
        if (
          pending?.schemaVersion === 1 &&
          pending.shopId === config!.shopId &&
          pending.sessionId === identity.sessionId &&
          typeof pending.sequence === "number" &&
          Array.isArray(pending.payload)
        ) {
          void postEnvelope(pending, true)
            .then(() => {
              clearPendingUpload();
              setStatus("uploaded");
            })
            .catch(() => {
              setStatus("upload-error");
            });
        } else {
          clearPendingUpload();
        }
      }
    } catch {
      clearPendingUpload();
    }

    const uploader = createBatchUploader(
      {
        async send(batch) {
          const envelope: PendingUploadEnvelope = {
            schemaVersion: 1,
            batchId: batch.batchId,
            shopId: config!.shopId,
            visitorId: identity.visitorId,
            sessionId: identity.sessionId,
            sequence: batch.sequence,
            capturedAt: new Date().toISOString(),
            route: sanitizeRecordedRoute(
              location.pathname,
              location.search,
              location.hash,
            ),
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio || 1,
            },
            document: captureDocumentSize(),
            encoding: "rrweb",
            source: "storefront",
            payload: [...batch.events],
            isFinal: batch.final,
          };

          try {
            await postEnvelope(envelope, true);
            clearPendingUpload();
            setStatus("uploaded");
          } catch (error) {
            if (!(error instanceof BatchTooLargeError)) {
              stashPendingUpload(envelope);
            }
            throw error;
          }
        },
      },
      {
        allocate: () => allocateSequence(storage),
        createBatchId: () => crypto.randomUUID(),
      },
      DEFAULT_RECORDER_POLICY,
    );

    const stopRecording = record({
      emit(event) {
        uploader.push(event);
        // Flush FullSnapshot immediately so a real session appears without the 5s wait.
        if (shouldFlushImmediatelyAfterEvent(event)) {
          void uploader.flush(false).catch(() => {
            setStatus("upload-error");
          });
        }
      },
      maskAllInputs: privacy.maskAllInputs,
      maskInputOptions: privacy.maskInputOptions,
      maskTextSelector: privacy.maskTextSelector,
      blockSelector: privacy.blockSelector,
      recordCrossOriginIframes: privacy.recordCrossOriginIframes,
      inlineStylesheet: privacy.inlineStylesheet,
      collectFonts: privacy.collectFonts,
      recordCanvas: privacy.recordCanvas,
      slimDOMOptions: privacy.slimDOMOptions,
      sampling: {
        mousemove: DEFAULT_RECORDER_POLICY.mousemoveSamplingMs,
        mouseInteraction: true,
        scroll: 150,
        input: "last",
      },
    });

    const interval = window.setInterval(() => {
      void uploader.flush(false).catch(() => {
        setStatus("upload-error");
      });
    }, DEFAULT_RECORDER_POLICY.flushIntervalMs);

    const sessionDeadline = window.setTimeout(() => {
      void uploader.flush(true).catch(() => undefined);
      stopCurrent();
      setStatus("session-duration-cap");
    }, DEFAULT_RECORDER_POLICY.maxSessionDurationMs);

    // Flush early when the tab is backgrounded — more reliable than pagehide alone
    // when shoppers hop to cart/checkout.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void uploader.flush(false).catch(() => {
          setStatus("upload-error");
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPageHide = () => {
      window.clearInterval(interval);
      window.clearTimeout(sessionDeadline);
      document.removeEventListener("visibilitychange", onVisibility);
      void uploader.flush(true).catch(() => {
        setStatus("upload-error");
      });
    };
    window.addEventListener("pagehide", onPageHide, { once: true });

    stopCurrent = () => {
      if (!started) return;
      started = false;
      window.clearInterval(interval);
      window.clearTimeout(sessionDeadline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (typeof stopRecording === "function") stopRecording();
    };
  }

  const syncWithPrivacy = () => {
    const privacy = privacyApi();
    if (typeof privacy?.analyticsProcessingAllowed !== "function") return false;
    if (hasConsent()) start();
    else {
      stopCurrent();
      setStatus("waiting-for-consent");
    }
    return true;
  };

  let privacyLoadRequested = false;
  const initializePrivacy = () => {
    if (syncWithPrivacy()) return true;
    if (privacyLoadRequested) return false;

    const loadFeatures = window.Shopify?.loadFeatures;
    if (typeof loadFeatures !== "function") return false;

    privacyLoadRequested = true;
    setStatus("loading-privacy");
    loadFeatures([{ name: "consent-tracking-api", version: "0.1" }], (error) => {
      if (error) {
        setStatus("privacy-api-error");
        return;
      }
      syncWithPrivacy();
    });
    return false;
  };

  if (!initializePrivacy()) {
    let attempts = 0;
    const privacyReadyInterval = window.setInterval(() => {
      attempts += 1;
      if (initializePrivacy() || attempts >= 40) {
        window.clearInterval(privacyReadyInterval);
      }
    }, 250);
  }

  document.addEventListener("visitorConsentCollected", () => {
    syncWithPrivacy();
  });
})();
