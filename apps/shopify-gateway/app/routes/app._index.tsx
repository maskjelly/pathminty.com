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
  StorefrontInstallationSchema,
  type StorefrontInstallation,
} from "@pathminty/contracts";

import { authenticate } from "../shopify.server";

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
  const installation = await readInstallation(session.shop);

  return {
    connected: Boolean(installation?.pixelId),
    shop: session.shop,
    themeEditorUrl: themeEditorUrl(session.shop),
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
  const connected = fetcher.data?.connected ?? loaderData.connected;
  const isBusy = fetcher.state !== "idle";
  const isOpeningDashboard = dashboardLink.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message, {
        isError: fetcher.data.ok === false,
      });
    }
  }, [fetcher.data, shopify]);

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

  return (
    <s-page heading="Connect PathMinty">
      {connected ? (
        <s-button
          slot="primary-action"
          onClick={openDashboard}
          {...(isOpeningDashboard ? { loading: true } : {})}
          variant="primary"
        >
          Open analytics dashboard
        </s-button>
      ) : (
        <s-button
          slot="primary-action"
          onClick={connect}
          {...(isBusy ? { loading: true } : {})}
          variant="primary"
        >
          Install tracking
        </s-button>
      )}

      <s-section heading="Your storefront connection">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            PathMinty collects consent-aware storefront behaviour. Revenue paths appear
            only after verified Shopify order and refund events are processed.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-badge tone={connected ? "success" : "caution"}>
              {connected ? "Customer events connected" : "Setup required"}
            </s-badge>
            <s-text tone="neutral">{loaderData.shop}</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="1. Connect Shopify customer events">
        <s-paragraph>
          Installs PathMinty's privacy-aware Web Pixel for page, product, cart,
          checkout, and purchase events. No theme code is edited.
        </s-paragraph>
        <s-button onClick={connect} {...(isBusy ? { loading: true } : {})}>
          {connected ? "Reconnect customer events" : "Connect customer events"}
        </s-button>
      </s-section>

      <s-section heading="2. Turn on session recording">
        <s-paragraph>
          Shopify requires the merchant to enable app embeds. The theme editor opens
          with PathMinty ready to activate; save once and recording begins.
        </s-paragraph>
        <s-button
          href={loaderData.themeEditorUrl}
          target="_blank"
          disabled={!connected}
        >
          Open theme editor
        </s-button>
      </s-section>

      <s-section heading="3. See your first journey">
        <s-paragraph>
          New clicks and sessions appear quickly. Revenue paths appear after Shopify
          sends the matching order event.
        </s-paragraph>
        <s-button
          onClick={openDashboard}
          disabled={!connected || isOpeningDashboard}
          {...(isOpeningDashboard ? { loading: true } : {})}
        >
          Open PathMinty
        </s-button>
      </s-section>

      <s-section slot="aside" heading="Protected by default">
        <s-unordered-list>
          <s-list-item>
            Form-field values and keystrokes are never recorded by session capture.
          </s-list-item>
          <s-list-item>
            Search terms come from Shopify customer events and obvious contact details
            are masked.
          </s-list-item>
          <s-list-item>URLs are stored without query strings.</s-list-item>
          <s-list-item>Recording waits for analytics consent.</s-list-item>
          <s-list-item>Shopify remains the source of revenue truth.</s-list-item>
        </s-unordered-list>
      </s-section>

      {connected && (
        <s-section slot="aside" heading="Tracking control">
          <s-paragraph>
            Disconnecting removes the Web Pixel and recorder configuration. Turn off the
            app embed in your theme as well if it is still enabled.
          </s-paragraph>
          <s-button
            tone="critical"
            commandFor="disconnect-tracking-modal"
            command="--show"
          >
            Disconnect tracking
          </s-button>
          <s-modal id="disconnect-tracking-modal" heading="Disconnect tracking?">
            <s-stack direction="block" gap="base">
              <s-text>
                New customer-event and interaction data will stop flowing to PathMinty.
              </s-text>
              <s-banner tone="warning">
                Previously collected data follows your retention settings and Shopify
                privacy requests.
              </s-banner>
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
              Disconnect tracking
            </s-button>
            <s-button
              slot="secondary-actions"
              commandFor="disconnect-tracking-modal"
              command="--hide"
            >
              Cancel
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
