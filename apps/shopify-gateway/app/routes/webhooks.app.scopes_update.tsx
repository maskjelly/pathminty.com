import type { ActionFunctionArgs } from "react-router";

import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const current = Array.isArray(payload.current)
    ? payload.current.filter((scope): scope is string => typeof scope === "string")
    : [];
  const sessions = await sessionStorage.findSessionsByShop(shop);

  await Promise.all(
    sessions.map((session) => {
      session.scope = current.join(",");
      return sessionStorage.storeSession(session);
    }),
  );

  return new Response(null, { status: 204 });
};
