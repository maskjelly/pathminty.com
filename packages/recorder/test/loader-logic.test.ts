import { describe, expect, it } from "vitest";

import {
  hasAnalyticsConsent,
  nextLoaderAction,
  privacyApiReady,
  shouldLoadRuntime,
  type LoaderShopify,
} from "../src/loader-logic";

function shopifyWithConsent(allowed: boolean | undefined): LoaderShopify {
  if (allowed === undefined) {
    return {};
  }
  return {
    customerPrivacy: {
      analyticsProcessingAllowed: () => allowed,
    },
  };
}

describe("loader consent gating", () => {
  it("requires the Customer Privacy API before loading runtime", () => {
    expect(privacyApiReady(undefined)).toBe(false);
    expect(privacyApiReady({})).toBe(false);
    expect(privacyApiReady(shopifyWithConsent(true))).toBe(true);
    expect(shouldLoadRuntime(shopifyWithConsent(true), false)).toBe(true);
    expect(shouldLoadRuntime({}, false)).toBe(false);
  });

  it("loads runtime only when analytics is allowed and not already requested", () => {
    expect(hasAnalyticsConsent(shopifyWithConsent(true))).toBe(true);
    expect(hasAnalyticsConsent(shopifyWithConsent(false))).toBe(false);
    expect(shouldLoadRuntime(shopifyWithConsent(true), false)).toBe(true);
    expect(shouldLoadRuntime(shopifyWithConsent(true), true)).toBe(false);
    expect(shouldLoadRuntime(shopifyWithConsent(false), false)).toBe(false);
  });

  it("never asks to load twice via nextLoaderAction", () => {
    expect(nextLoaderAction(shopifyWithConsent(true), false)).toBe("load-runtime");
    expect(nextLoaderAction(shopifyWithConsent(true), true)).toBe("already-requested");
    expect(nextLoaderAction(shopifyWithConsent(false), false)).toBe(
      "waiting-for-consent",
    );
    expect(nextLoaderAction({}, false)).toBe("wait-for-privacy-api");
  });
});
