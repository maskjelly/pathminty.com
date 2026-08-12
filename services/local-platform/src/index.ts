import analyticsWorker from "../../analytics-worker/src/index";
import collector from "../../collector/src/index";
import dashboardApi from "../../dashboard-api/src/index";
import {
  ShopIdSchema,
  StorefrontInstallationSchema,
  type ReplayBatch,
  type SessionCompletedJob,
} from "@pathminty/contracts";

function isDashboardRequest(request: Request) {
  const path = new URL(request.url).pathname;
  return (
    path === "/v1/meta" || path.startsWith("/v1/auth/") || path.startsWith("/v1/shops/")
  );
}

async function seedTestSessions(
  request: Request,
  environment: Cloudflare.Env,
  executionContext: ExecutionContext,
) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const authRequest = new Request("http://localhost/v1/auth/session", {
    headers: request.headers,
  });
  const authResponse = await dashboardApi.fetch(
    authRequest,
    environment,
    executionContext,
  );
  if (!authResponse.ok) return authResponse;
  const authBody: { shopId?: unknown } = await authResponse.json();
  const shop = ShopIdSchema.safeParse(authBody.shopId);
  if (!shop.success)
    return Response.json({ error: "Invalid dashboard session" }, { status: 401 });

  const stored = await environment.SHOPIFY_INSTALLATIONS.get<unknown>(
    `shop:${shop.data}`,
    "json",
  );
  const installation = StorefrontInstallationSchema.safeParse(stored);
  if (!installation.success) {
    return Response.json({ error: "Tracking is not connected" }, { status: 409 });
  }

  const now = Date.now();
  const routes = ["/", "/collections/all", "/products/pathminty-test-product"];
  for (let index = 0; index < routes.length; index += 1) {
    const sessionId = crypto.randomUUID();
    const startedAt = now - (index + 1) * 90_000;
    const route = routes[index] ?? "/";
    const batch: ReplayBatch = {
      schemaVersion: 1,
      batchId: crypto.randomUUID(),
      shopId: shop.data,
      visitorId: `test-visitor-${index + 1}`,
      sessionId,
      sequence: 0,
      capturedAt: new Date(startedAt + 14_000).toISOString(),
      route,
      viewport:
        index === 1
          ? { width: 390, height: 844, devicePixelRatio: 3 }
          : { width: 1_440, height: 900, devicePixelRatio: 2 },
      document:
        index === 1 ? { width: 390, height: 2_400 } : { width: 1_440, height: 2_800 },
      encoding: "json",
      source: "test",
      payload: [
        { type: "page_view", at: startedAt },
        {
          type: "pointer_move",
          at: startedAt + 900,
          x: 0.21,
          y: 0.18,
          pointer: index === 1 ? "touch" : "mouse",
        },
        {
          type: "pointer_move",
          at: startedAt + 2_200,
          x: 0.42,
          y: 0.36,
          pointer: index === 1 ? "touch" : "mouse",
        },
        {
          type: "pointer_down",
          at: startedAt + 3_000,
          x: 0.44,
          y: 0.38,
          pointer: index === 1 ? "touch" : "mouse",
          target: "main > button",
        },
        { type: "scroll", at: startedAt + 5_000, depth: 0.46 + index * 0.18 },
        {
          type: "pointer_move",
          at: startedAt + 7_600,
          x: 0.68,
          y: 0.63,
          pointer: index === 1 ? "touch" : "mouse",
        },
        {
          type: "pointer_down",
          at: startedAt + 9_000,
          x: 0.71,
          y: 0.66,
          pointer: index === 1 ? "touch" : "mouse",
          target: "main > article:nth-of-type(2) > a",
        },
        { type: "visibility", at: startedAt + 14_000, state: "hidden" },
      ],
      isFinal: true,
    };
    const collectorRequest = new Request("http://localhost/v1/replay-batches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pathminty-site-token": installation.data.publicToken,
      },
      body: JSON.stringify(batch),
    });
    const response = await collector.fetch(
      collectorRequest,
      environment,
      executionContext,
    );
    if (!response.ok) {
      return Response.json({ error: "Unable to seed test sessions" }, { status: 500 });
    }
  }

  return Response.json({ accepted: true, count: routes.length }, { status: 202 });
}

function withDashboardCors(
  response: Response,
  request: Request,
  environment: Cloudflare.Env,
) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  if (origin === environment.DASHBOARD_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, environment, executionContext) {
    if (new URL(request.url).pathname === "/v1/dev/seed") {
      const response = await seedTestSessions(request, environment, executionContext);
      return withDashboardCors(response, request, environment);
    }
    const application = isDashboardRequest(request) ? dashboardApi : collector;
    return application.fetch(request, environment, executionContext);
  },
  queue(batch, environment) {
    return analyticsWorker.queue(batch, environment);
  },
} satisfies ExportedHandler<Cloudflare.Env, SessionCompletedJob>;
