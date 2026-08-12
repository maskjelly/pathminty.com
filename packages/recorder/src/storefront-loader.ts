/**
 * Tiny consent-gated theme loader (target ≪ 10KB minified).
 * Bundled to pathminty-recorder-loader.js — schema javascript for the app embed.
 * Loads pathminty-recorder-runtime.js from Shopify CDN (asset_url) only after consent.
 */
import {
  hasAnalyticsConsent,
  privacyApiReady,
  shouldLoadRuntime,
  type LoaderShopify,
} from "./loader-logic";

declare global {
  interface Window {
    Shopify?: LoaderShopify;
  }
}

(() => {
  const host = document.querySelector("[data-pathminty-recorder]");
  if (!(host instanceof HTMLElement)) return;

  const setStatus = (status: string) => {
    host.dataset.pathmintyRecorderStatus = status;
  };

  let runtimeRequested = false;

  const injectRuntime = () => {
    if (runtimeRequested) return;
    const src = host.dataset.runtimeSrc?.trim();
    if (!src) {
      setStatus("runtime-src-missing");
      return;
    }
    runtimeRequested = true;
    setStatus("loading-runtime");
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      setStatus("runtime-loaded");
    };
    script.onerror = () => {
      runtimeRequested = false;
      setStatus("runtime-load-error");
    };
    (document.head || document.documentElement).appendChild(script);
  };

  const syncWithPrivacy = (): boolean => {
    const shopify = window.Shopify;
    if (!privacyApiReady(shopify)) return false;
    if (shouldLoadRuntime(shopify, runtimeRequested)) {
      injectRuntime();
    } else if (!hasAnalyticsConsent(shopify)) {
      setStatus("waiting-for-consent");
    } else if (runtimeRequested) {
      // Consent still true; script already requested or finished loading.
      setStatus(host.dataset.pathmintyRecorderStatus || "runtime-loaded");
    }
    return true;
  };

  let privacyLoadRequested = false;
  const initializePrivacy = (): boolean => {
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

  setStatus("configured");

  if (!initializePrivacy()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (initializePrivacy() || attempts >= 40) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  document.addEventListener("visitorConsentCollected", () => {
    syncWithPrivacy();
  });
})();
