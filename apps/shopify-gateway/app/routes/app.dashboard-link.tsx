import type { LoaderFunctionArgs } from "react-router";

import { createDashboardHandoffUrl } from "../lib/dashboard-handoff.server";
import { authenticate } from "../shopify.server";

/**
 * Authenticated resource route: returns a fresh absolute dashboard handoff URL.
 * The setup UI opens that URL in a new tab (external workers.dev origin).
 * Do not redirect from an in-app path — App Bridge treats that as app navigation
 * and merchants only see a bare "200 OK" document.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return Response.json({ url: await createDashboardHandoffUrl(session.shop) });
};
