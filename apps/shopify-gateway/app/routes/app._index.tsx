import { env } from "cloudflare:workers";
import { useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { STOREFRONT_CAPTURE_PATH } from "@pathminty/cloudflare";
import {
  PLAN_CATALOG,
  StorefrontInstallationSchema,
  type StorefrontInstallation,
} from "@pathminty/contracts";
import {
  readShopHealth,
  readSubscription,
  readUsage,
  resolveCaptureHealth,
  writeSubscription,
} from "@pathminty/db/worker";

import { authenticate } from "../shopify.server";

const CAPTURE_OPTOUT_KEY = (shop: string) => `capture-optout:${shop}`;

function healthCopy(hint: string) {
  switch (hint) {
    case "awaiting_traffic":
      return "Connected. Browse the storefront with analytics consent to see the first session.";
    case "quota_paused":
      return "Recording is paused — this month’s human-session cap is used. Upgrade on Plan.";
    case "embed_silent":
      return "Pixel events are arriving but no recordings. Enable PathMinty Recorder in the theme editor and save.";
    case "recent_errors":
      return "Capture hit errors in the last hour. Check the recorder embed and ad blockers.";
    case "disconnected":
      return "Tracking is disconnected. Connect to start capturing.";
    default:
      return "Capture is healthy.";
  }
}

type BootstrapQuery = {
  data?: {
    currentAppInstallation?: { id: string };
  };
};

type PixelQuery = {
  data?: {
    webPixel?: { id: string } | null;
  };
};

type PixelDeleteMutation = {
  data?: {
    webPixelDelete?: {
      deletedWebPixelId?: string | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
};

type PixelMutation = {
  data?: {
    webPixelCreate?: {
      webPixel?: { id: string } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
    webPixelUpdate?: {
      webPixel?: { id: string } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
};

type MetafieldMutation = {
  data?: {
    metafieldsSet?: {
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
};

type MetafieldDeleteMutation = {
  data?: {
    metafieldsDelete?: {
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
};

const installationKey = (shop: string) => `shop:${shop}`;

function themeEditorUrl(shop: string) {
  const extensionHandle = "pathminty-recorder";
  const activateAppId = encodeURIComponent(`${env.SHOPIFY_API_KEY}/${extensionHandle}`);

  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${activateAppId}`;
}

function createPublicToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readInstallation(shop: string) {
  const value = await env.SHOPIFY_INSTALLATIONS.get<unknown>(
    installationKey(shop),
    "json",
  );
  const parsed = StorefrontInstallationSchema.safeParse(value);

  return parsed.success && parsed.data.shopId === shop ? parsed.data : null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = env.SHOPIFY_INSTALLATIONS;
  const [installation, subscription, usage, healthRecord, optout] = await Promise.all([
    readInstallation(session.shop),
    readSubscription(store, session.shop),
    readUsage(store, session.shop),
    readShopHealth(store, session.shop),
    store.get(CAPTURE_OPTOUT_KEY(session.shop)),
  ]);
  const connected = Boolean(installation?.pixelId);
  const health = resolveCaptureHealth({
    connected,
    lastReplayAt: healthRecord.lastReplayAt,
    lastPixelAt: healthRecord.lastPixelAt,
    lastErrorCode: healthRecord.lastErrorCode,
    lastErrorAt: healthRecord.lastErrorAt,
    usage,
  });

  return {
    connected,
    optedOut: Boolean(optout),
    shop: session.shop,
    themeEditorUrl: themeEditorUrl(session.shop),
    planName: PLAN_CATALOG[subscription.planId].name,
    planId: subscription.planId,
    usage,
    health,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent !== "connect" && intent !== "disconnect") {
    return {
      ok: false,
      connected: Boolean(await readInstallation(session.shop)),
      message: "Unknown setup action.",
    };
  }

  const bootstrapResponse = await admin.graphql(`#graphql
    query PathMintyInstallation {
      currentAppInstallation { id }
    }
  `);
  const bootstrap = (await bootstrapResponse.json()) as BootstrapQuery;
  const ownerId = bootstrap.data?.currentAppInstallation?.id;

  if (!ownerId) {
    return {
      ok: false,
      connected: Boolean(await readInstallation(session.shop)),
      message: "Shopify did not return the app installation.",
    };
  }

  let shopifyPixelId: string | undefined;
  try {
    const pixelResponse = await admin.graphql(`#graphql
      query PathMintyPixel {
        webPixel { id }
      }
    `);
    const pixel = (await pixelResponse.json()) as PixelQuery;
    shopifyPixelId = pixel.data?.webPixel?.id ?? undefined;
  } catch (error) {
    const isMissingPixel =
      error instanceof Error && error.message.includes("No web pixel was found");
    if (!isMissingPixel) {
      throw error;
    }
  }

  if (intent === "disconnect") {
    const pixelId = shopifyPixelId;
    if (pixelId) {
      const pixelDeleteResponse = await admin.graphql(
        `#graphql
          mutation DeletePathMintyPixel($id: ID!) {
            webPixelDelete(id: $id) {
              deletedWebPixelId
              userErrors { field message }
            }
          }
        `,
        { variables: { id: pixelId } },
      );
      const pixelDelete = (await pixelDeleteResponse.json()) as PixelDeleteMutation;
      const pixelDeleteErrors = pixelDelete.data?.webPixelDelete?.userErrors ?? [];
      if (pixelDeleteErrors.length > 0) {
        return {
          ok: false,
          connected: true,
          message: pixelDeleteErrors[0]?.message ?? "Pixel removal failed.",
        };
      }
    }

    const metafieldDeleteResponse = await admin.graphql(
      `#graphql
        mutation DeletePathMintyRecorderConfig(
          $metafields: [MetafieldIdentifierInput!]!
        ) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields { ownerId namespace key }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              ownerId,
              namespace: "pathminty",
              key: "recorder_config",
            },
          ],
        },
      },
    );
    const metafieldDelete =
      (await metafieldDeleteResponse.json()) as MetafieldDeleteMutation;
    const metafieldDeleteErrors =
      metafieldDelete.data?.metafieldsDelete?.userErrors ?? [];
    if (metafieldDeleteErrors.length > 0) {
      return {
        ok: false,
        connected: true,
        message:
          metafieldDeleteErrors[0]?.message ?? "Recorder configuration removal failed.",
      };
    }

    await env.SHOPIFY_INSTALLATIONS.delete(installationKey(session.shop));
    await env.SHOPIFY_INSTALLATIONS.put(CAPTURE_OPTOUT_KEY(session.shop), "1");
    return {
      ok: true,
      connected: false,
      message: "PathMinty tracking is disconnected.",
    };
  }

  const existing = await readInstallation(session.shop);
  const publicToken = existing?.publicToken ?? createPublicToken();
  const pixelSettings = JSON.stringify({
    collectorUrl: `${env.PATHMINTY_COLLECTOR_URL}/v1/shopify-events`,
    shopId: session.shop,
    publicToken,
  });

  let pixelId = shopifyPixelId;
  if (pixelId) {
    const pixelResponse = await admin.graphql(
      `#graphql
        mutation UpdatePathMintyPixel($id: ID!, $webPixel: WebPixelInput!) {
          webPixelUpdate(id: $id, webPixel: $webPixel) {
            webPixel { id }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          id: pixelId,
          webPixel: { settings: pixelSettings },
        },
      },
    );
    const pixel = (await pixelResponse.json()) as PixelMutation;
    const pixelErrors = pixel.data?.webPixelUpdate?.userErrors ?? [];
    if (pixelErrors.length > 0) {
      return {
        ok: false,
        connected: true,
        message: pixelErrors[0]?.message ?? "Pixel update failed.",
      };
    }
    pixelId = pixel.data?.webPixelUpdate?.webPixel?.id ?? pixelId;
  } else {
    const pixelResponse = await admin.graphql(
      `#graphql
        mutation CreatePathMintyPixel($webPixel: WebPixelInput!) {
          webPixelCreate(webPixel: $webPixel) {
            webPixel { id }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          webPixel: { settings: pixelSettings },
        },
      },
    );
    const pixel = (await pixelResponse.json()) as PixelMutation;
    const pixelErrors = pixel.data?.webPixelCreate?.userErrors ?? [];
    if (pixelErrors.length > 0) {
      return {
        ok: false,
        connected: false,
        message: pixelErrors[0]?.message ?? "Pixel setup failed.",
      };
    }
    pixelId = pixel.data?.webPixelCreate?.webPixel?.id;
  }

  if (!pixelId) {
    return {
      ok: false,
      connected: false,
      message: "Shopify did not create the customer-events pixel.",
    };
  }

  // Same-origin Shopify app proxy — browser never sees the site token.
  // Storefront POSTs to STOREFRONT_CAPTURE_PATH; gateway adds x-pathminty-site-token.
  const recorderConfig = JSON.stringify({
    collectorUrl: STOREFRONT_CAPTURE_PATH,
    shopId: session.shop,
  });
  const metafieldResponse = await admin.graphql(
    `#graphql
      mutation ConfigurePathMintyRecorder($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: "pathminty",
            key: "recorder_config",
            type: "json",
            value: recorderConfig,
          },
        ],
      },
    },
  );
  const metafield = (await metafieldResponse.json()) as MetafieldMutation;
  const metafieldErrors = metafield.data?.metafieldsSet?.userErrors ?? [];
  if (metafieldErrors.length > 0) {
    return {
      ok: false,
      connected: false,
      message: metafieldErrors[0]?.message ?? "Recorder setup failed.",
    };
  }

  const installation: StorefrontInstallation = {
    shopId: session.shop,
    publicToken,
    pixelId,
    connectedAt: new Date().toISOString(),
  };
  await env.SHOPIFY_INSTALLATIONS.put(
    installationKey(session.shop),
    JSON.stringify(installation),
  );
  await env.SHOPIFY_INSTALLATIONS.delete(CAPTURE_OPTOUT_KEY(session.shop));
  const existingPlan = await readSubscription(env.SHOPIFY_INSTALLATIONS, session.shop);
  await writeSubscription(env.SHOPIFY_INSTALLATIONS, session.shop, {
    planId: existingPlan.planId,
    status: existingPlan.status,
    updatedAt: new Date().toISOString(),
    ...(existingPlan.shopifySubscriptionId
      ? { shopifySubscriptionId: existingPlan.shopifySubscriptionId }
      : {}),
  });

  return {
    ok: true,
    connected: true,
    message: "PathMinty tracking is connected.",
  };
};

export default function Setup() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const dashboardLink = useFetcher<{ url: string }>();
  const shopify = useAppBridge();
  const pendingPopup = useRef<Window | null>(null);
  const openRequested = useRef(false);
  const autoConnectStarted = useRef(false);
  const connected = fetcher.data?.connected ?? loaderData.connected;
  const isBusy = fetcher.state !== "idle";
  const isOpeningDashboard = dashboardLink.state !== "idle";
  const usage = loaderData.usage;
  const health = loaderData.health;

  useEffect(() => {
    if (!fetcher.data?.message) return;
    if (autoConnectStarted.current && fetcher.data.ok !== false) return;
    shopify.toast.show(fetcher.data.message, {
      isError: fetcher.data.ok === false,
    });
  }, [fetcher.data, shopify]);

  useEffect(() => {
    if (
      loaderData.connected ||
      loaderData.optedOut ||
      autoConnectStarted.current ||
      fetcher.state !== "idle"
    ) {
      return;
    }
    autoConnectStarted.current = true;
    void fetcher.submit({ intent: "connect" }, { method: "POST" });
  }, [fetcher, loaderData.connected, loaderData.optedOut]);

  // After a click, navigate the pre-opened tab to the absolute dashboard URL.
  // Opening about:blank synchronously avoids popup blockers; an in-app redirect
  // path is intercepted by App Bridge and only shows "200 OK".
  useEffect(() => {
    if (!openRequested.current || dashboardLink.state !== "idle") return;
    openRequested.current = false;
    const popup = pendingPopup.current;
    pendingPopup.current = null;
    const url = dashboardLink.data?.url;
    if (!url) {
      popup?.close();
      shopify.toast.show("Unable to open PathMinty. Try again.", { isError: true });
      return;
    }
    if (popup && !popup.closed) {
      popup.location.href = url;
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [dashboardLink.state, dashboardLink.data, shopify]);

  const connect = () => {
    void fetcher.submit({ intent: "connect" }, { method: "POST" });
  };

  const disconnect = () => {
    void fetcher.submit({ intent: "disconnect" }, { method: "POST" });
  };

  const openDashboard = () => {
    if (isOpeningDashboard || openRequested.current) return;
    // Must open during the user gesture or the browser blocks the tab.
    pendingPopup.current = window.open("about:blank", "_blank");
    openRequested.current = true;
    void dashboardLink.load("/app/dashboard-link");
  };

  const live = connected && Boolean(health.lastReplayAt);
  const storefrontUrl = `https://${loaderData.shop}`;
  const primary = !connected ? (
    <s-button
      slot="primary-action"
      onClick={connect}
      {...(isBusy ? { loading: true } : {})}
      variant="primary"
    >
      {isBusy ? "Connecting…" : "Connect store"}
    </s-button>
  ) : live ? (
    <s-button
      slot="primary-action"
      onClick={openDashboard}
      {...(isOpeningDashboard ? { loading: true } : {})}
      variant="primary"
    >
      Open dashboard
    </s-button>
  ) : (
    <s-button
      slot="primary-action"
      href={loaderData.themeEditorUrl}
      target="_blank"
      variant="primary"
    >
      Turn on the recorder
    </s-button>
  );

  return (
    <s-page heading={live ? "You’re live" : "Welcome to PathMinty"}>
      {primary}

      <s-section
        heading={live ? "Nice — data is flowing" : "Two minutes to first session"}
      >
        <s-stack direction="block" gap="base">
          <s-paragraph>
            {live
              ? "Heatmaps, journeys, and recordings are ready. Open the dashboard anytime."
              : "We’ll connect the store for you. You just flip one switch in the theme, click around the storefront, and you’re in."}
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-badge tone={connected ? "success" : "info"}>
              {connected ? "Store connected" : isBusy ? "Connecting…" : "Not connected"}
            </s-badge>
            <s-badge tone={live ? "success" : "caution"}>
              {live ? "Sessions arriving" : "Waiting for first session"}
            </s-badge>
            <s-text tone="neutral">{loaderData.shop}</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Do this once">
        <s-unordered-list>
          <s-list-item>
            {connected
              ? "1. Store connected. You can skip this."
              : "1. Wait a moment — PathMinty is connecting your store."}
          </s-list-item>
          <s-list-item>
            2. Theme editor → App embeds → turn on <strong>PathMinty Recorder</strong> →
            Save.
          </s-list-item>
          <s-list-item>
            3. Visit your store. Accept analytics cookies if asked. Click a couple of
            pages.
          </s-list-item>
          <s-list-item>
            4. Come back here and open the dashboard. About 15 seconds.
          </s-list-item>
        </s-unordered-list>
        <s-stack direction="inline" gap="base">
          <s-button
            href={loaderData.themeEditorUrl}
            target="_blank"
            disabled={!connected}
            variant={live ? "secondary" : "primary"}
          >
            Open theme editor
          </s-button>
          <s-button href={storefrontUrl} target="_blank" disabled={!connected}>
            Open store
          </s-button>
          <s-button
            onClick={openDashboard}
            disabled={!connected || isOpeningDashboard}
            {...(isOpeningDashboard ? { loading: true } : {})}
          >
            Open dashboard
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="This month">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <strong>
              {usage.billableSessions.toLocaleString()} / {usage.limit.toLocaleString()}
            </strong>{" "}
            human sessions on <strong>{loaderData.planName}</strong>. Bots don’t count.
          </s-paragraph>
          <s-banner
            tone={
              health.hint === "ok"
                ? "success"
                : health.hint === "quota_paused" || health.hint === "recent_errors"
                  ? "warning"
                  : "info"
            }
          >
            {healthCopy(health.hint)}
          </s-banner>
          <s-link href="/app/billing">Change plan</s-link>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="You’re safe">
        <s-unordered-list>
          <s-list-item>Passwords and form values are never recorded.</s-list-item>
          <s-list-item>Checkout pages skip the recording camera.</s-list-item>
          <s-list-item>We wait for analytics consent.</s-list-item>
          <s-list-item>Ad blockers can hide a visit. That’s normal.</s-list-item>
        </s-unordered-list>
      </s-section>

      {connected && (
        <s-section slot="aside" heading="Need to pause?">
          <s-paragraph>
            This stops new capture. Old sessions follow your plan.
          </s-paragraph>
          <s-button
            tone="critical"
            commandFor="disconnect-tracking-modal"
            command="--show"
          >
            Disconnect
          </s-button>
          <s-modal id="disconnect-tracking-modal" heading="Disconnect PathMinty?">
            <s-stack direction="block" gap="base">
              <s-text>New visits will stop appearing in the dashboard.</s-text>
            </s-stack>
            <s-button
              slot="primary-action"
              variant="primary"
              tone="critical"
              onClick={disconnect}
              commandFor="disconnect-tracking-modal"
              command="--hide"
              {...(isBusy ? { loading: true } : {})}
            >
              Disconnect
            </s-button>
            <s-button
              slot="secondary-actions"
              commandFor="disconnect-tracking-modal"
              command="--hide"
            >
              Keep capturing
            </s-button>
          </s-modal>
        </s-section>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
