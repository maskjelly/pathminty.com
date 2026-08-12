/**
 * Re-export pure capture-proxy helpers for the gateway route.
 * Implementation lives in @pathminty/cloudflare for testability.
 */
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
} from "@pathminty/cloudflare";
