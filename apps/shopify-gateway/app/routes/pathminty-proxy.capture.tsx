/**
 * Shopify app proxy: storefront POST /apps/pathminty/capture
 * → gateway /pathminty-proxy/capture → COLLECTOR service binding.
 *
 * Signed shop from authenticate.public.appProxy + installation publicToken
 * enforce tenant isolation. The browser never holds the site token.
 */
import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";

import {
  forwardReplayBatchToCollector,
  loadStorefrontInstallation,
  rejectUnlessPost,
} from "../lib/capture-proxy.server";
import { authenticate } from "../shopify.server";

export function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  const methodReject = rejectUnlessPost(request.method);
  if (methodReject) return methodReject;

  const proxy = await authenticate.public.appProxy(request);
  if (!proxy.session) {
    return new Response("App not installed", { status: 401 });
  }

  const shop = proxy.session.shop;
  const installation = await loadStorefrontInstallation(
    env.SHOPIFY_INSTALLATIONS,
    shop,
  );
  if (!installation) {
    return new Response("Tracking is not connected", { status: 409 });
  }

  return forwardReplayBatchToCollector(
    env.COLLECTOR,
    request,
    installation.publicToken,
  );
}
