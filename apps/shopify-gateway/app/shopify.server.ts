import { env } from "cloudflare:workers";
import { KVSessionStorage } from "@shopify/shopify-app-session-storage-kv";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

function requiredRuntimeVariable(name: keyof PathMintySecrets): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required runtime variable: ${name}`);
  return value;
}

const customShopDomain = env.SHOP_CUSTOM_DOMAIN;

const shopify = shopifyApp({
  apiKey: requiredRuntimeVariable("SHOPIFY_API_KEY"),
  apiSecretKey: requiredRuntimeVariable("SHOPIFY_API_SECRET"),
  apiVersion: ApiVersion.July26,
  scopes: requiredRuntimeVariable("SCOPES").split(","),
  appUrl: requiredRuntimeVariable("SHOPIFY_APP_URL"),
  authPathPrefix: "/auth",
  sessionStorage: new KVSessionStorage(env.SHOPIFY_SESSIONS),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(customShopDomain ? { customShopDomains: [customShopDomain] } : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
