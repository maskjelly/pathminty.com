/**
 * Pure helpers for the consent-gated theme loader (no rrweb).
 * Kept tiny and unit-testable; bundled only into pathminty-recorder-loader.js.
 */

export type LoaderPrivacyApi = {
  analyticsProcessingAllowed?: () => boolean;
};

export type LoaderShopify = {
  customerPrivacy?: LoaderPrivacyApi;
  loadFeatures?: (
    features: Array<{ name: string; version: string }>,
    callback: (error: unknown) => void,
  ) => void;
};

export function hasAnalyticsConsent(shopify: LoaderShopify | undefined): boolean {
  return shopify?.customerPrivacy?.analyticsProcessingAllowed?.() === true;
}

export function privacyApiReady(shopify: LoaderShopify | undefined): boolean {
  return typeof shopify?.customerPrivacy?.analyticsProcessingAllowed === "function";
}

/**
 * Decide the next loader action. Does not load scripts — callers act on the result.
 */
export function nextLoaderAction(
  shopify: LoaderShopify | undefined,
  runtimeAlreadyRequested: boolean,
):
  | "load-runtime"
  | "waiting-for-consent"
  | "wait-for-privacy-api"
  | "already-requested" {
  if (!privacyApiReady(shopify)) return "wait-for-privacy-api";
  if (!hasAnalyticsConsent(shopify)) return "waiting-for-consent";
  if (runtimeAlreadyRequested) return "already-requested";
  return "load-runtime";
}

/**
 * When consent is already granted and runtime was requested, action is a no-op load.
 * Callers still guard with runtimeAlreadyRequested before injecting.
 */
export function shouldLoadRuntime(
  shopify: LoaderShopify | undefined,
  runtimeAlreadyRequested: boolean,
): boolean {
  return (
    !runtimeAlreadyRequested && privacyApiReady(shopify) && hasAnalyticsConsent(shopify)
  );
}
