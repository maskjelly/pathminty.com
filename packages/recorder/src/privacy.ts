/**
 * Privacy defaults for the storefront rrweb recorder.
 * Masking happens client-side before events leave the browser.
 */

export const SENSITIVE_ROUTE_PATTERN =
  /^\/(account|checkout|checkouts|orders|password|login|challenge|authentication)(\/|$)/iu;

export const PRIVATE_BLOCK_SELECTOR = [
  "[data-pathminty-private]",
  "input[type='password']",
  "input[type='email']",
  "input[type='tel']",
  "input[type='search']",
  "input[name*='password' i]",
  "input[name*='card' i]",
  "input[name*='cvv' i]",
  "input[name*='cvc' i]",
  "input[autocomplete='cc-number']",
  "input[autocomplete='cc-csc']",
  "input[autocomplete='cc-exp']",
  "input[autocomplete='cc-exp-month']",
  "input[autocomplete='cc-exp-year']",
  "textarea[name*='password' i]",
  "[data-shopify-pay]",
  "#shopify-section-main-password-header",
].join(",");

export const PRIVATE_MASK_TEXT_SELECTOR =
  "[data-pathminty-private], [contenteditable='true'], [contenteditable='']";

export const RRWEB_MASK_INPUT_OPTIONS = Object.freeze({
  password: true,
  email: true,
  tel: true,
  text: true,
  search: true,
  url: true,
  number: true,
  range: true,
  date: true,
  "datetime-local": true,
  time: true,
  month: true,
  week: true,
  color: true,
  checkbox: true,
  radio: true,
  select: true,
  textarea: true,
});

export type RrwebRecordPrivacyOptions = Readonly<{
  maskAllInputs: true;
  maskInputOptions: typeof RRWEB_MASK_INPUT_OPTIONS;
  maskTextSelector: string;
  blockSelector: string;
  recordCrossOriginIframes: false;
  inlineStylesheet: true;
  collectFonts: false;
  recordCanvas: false;
  slimDOMOptions: true;
}>;

export function createRrwebPrivacyOptions(): RrwebRecordPrivacyOptions {
  return {
    maskAllInputs: true,
    maskInputOptions: RRWEB_MASK_INPUT_OPTIONS,
    maskTextSelector: PRIVATE_MASK_TEXT_SELECTOR,
    blockSelector: PRIVATE_BLOCK_SELECTOR,
    recordCrossOriginIframes: false,
    inlineStylesheet: true,
    collectFonts: false,
    recordCanvas: false,
    slimDOMOptions: true,
  };
}

export function isSensitiveStorefrontRoute(pathname: string): boolean {
  const path = pathname.split(/[?#]/u, 1)[0] ?? "/";
  return SENSITIVE_ROUTE_PATTERN.test(path);
}

/** Strip query strings and fragments from recorded routes. */
export function sanitizeRecordedRoute(
  pathname: string,
  search = "",
  hash = "",
): string {
  void search;
  void hash;
  const path = pathname.split(/[?#]/u, 1)[0] || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export type StorefrontAcquisition = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrerHost: string | null;
};

function sanitizeUtmToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim().slice(0, 80);
  if (!token || token.includes("@") || token.includes("/") || token.includes(":")) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/u.test(token)) return null;
  return token.toLowerCase();
}

function sanitizeReferrerHost(referrer: string, pageHost: string): string | null {
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (!host || host === pageHost.toLowerCase()) return null;
    if (!/^[a-z0-9.-]+$/u.test(host) || host.length > 255) return null;
    return host;
  } catch {
    return null;
  }
}

/** Keep UTM + referrer host only. Never persist the raw query string. */
export function extractAcquisition(
  search: string,
  referrer: string,
  pageHost: string,
): StorefrontAcquisition {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const source = sanitizeUtmToken(params.get("utm_source"));
  const medium = sanitizeUtmToken(params.get("utm_medium"));
  const campaign = sanitizeUtmToken(params.get("utm_campaign"));
  const content = sanitizeUtmToken(params.get("utm_content"));
  const term = sanitizeUtmToken(params.get("utm_term"));
  const referrerHost = sanitizeReferrerHost(referrer, pageHost);
  if (source) {
    return {
      source,
      medium,
      campaign,
      content,
      term,
      referrerHost,
    };
  }
  if (referrerHost) {
    return {
      source: "referral",
      medium: "referral",
      campaign: null,
      content: null,
      term: null,
      referrerHost,
    };
  }
  return {
    source: "direct",
    medium: "none",
    campaign: null,
    content: null,
    term: null,
    referrerHost: null,
  };
}
