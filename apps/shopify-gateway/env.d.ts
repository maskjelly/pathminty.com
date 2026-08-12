/// <reference types="vite/client" />

interface PathMintySecrets {
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  SHOP_CUSTOM_DOMAIN?: string;
}

interface Env extends PathMintySecrets {}

declare namespace Cloudflare {
  interface Env extends PathMintySecrets {}
}
