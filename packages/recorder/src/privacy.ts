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
