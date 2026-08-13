import { env } from "cloudflare:workers";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { PLAN_CATALOG, type PlanId } from "@pathminty/contracts";
import {
  readSubscription,
  readUsage,
  writeSubscription,
  writeUsage,
} from "@pathminty/db/worker";

import { authenticate } from "../shopify.server";

type SubscriptionMutation = {
  data?: {
    appSubscriptionCreate?: {
      confirmationUrl?: string | null;
      userErrors: Array<{ message: string }>;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [subscription, usage] = await Promise.all([
    readSubscription(env.SHOPIFY_INSTALLATIONS, session.shop),
    readUsage(env.SHOPIFY_INSTALLATIONS, session.shop),
  ]);
  return {
    plans: Object.values(PLAN_CATALOG),
    currentPlanId: subscription.planId,
    usage,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planIdRaw = formData.get("planId");
  if (planIdRaw !== "free" && planIdRaw !== "launch" && planIdRaw !== "growth") {
    return { ok: false, message: "Choose a valid plan." };
  }
  const planId: PlanId = planIdRaw;
  const plan = PLAN_CATALOG[planId];

  const developmentStore =
    env.SHOPIFY_APP_URL.includes("localhost") ||
    env.SHOPIFY_APP_URL.includes("workers.dev");
  if (planId === "free" || developmentStore) {
    await persistPlan(session.shop, planId);
    return {
      ok: true,
      message:
        planId === "free"
          ? "You are on Free. Human sessions only count toward the monthly cap."
          : `${plan.name} is active in this development store.`,
    };
  }

  const returnUrl = `${env.SHOPIFY_APP_URL}/app/billing`;
  const response = await admin.graphql(
    `#graphql
      mutation PathMintySubscribe($name: String!, $returnUrl: URL!, $amount: Decimal!) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: false
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: $amount, currencyCode: USD }
                  interval: EVERY_30_DAYS
                }
              }
            }
          ]
        ) {
          confirmationUrl
          userErrors { message }
        }
      }
    `,
    {
      variables: {
        name: `PathMinty ${plan.name}`,
        returnUrl,
        amount: plan.priceUsd.toFixed(2),
      },
    },
  );
  const body = (await response.json()) as SubscriptionMutation;
  const errors = body.data?.appSubscriptionCreate?.userErrors ?? [];
  if (errors.length > 0) {
    return { ok: false, message: errors[0]?.message ?? "Billing could not start." };
  }
  const confirmationUrl = body.data?.appSubscriptionCreate?.confirmationUrl;
  if (!confirmationUrl) {
    return { ok: false, message: "Shopify did not return a confirmation URL." };
  }
  await persistPlan(session.shop, planId);
  return { ok: true, confirmationUrl };
};

async function persistPlan(shopId: string, planId: PlanId) {
  const now = new Date().toISOString();
  await writeSubscription(env.SHOPIFY_INSTALLATIONS, shopId, {
    planId,
    status: "active",
    updatedAt: now,
  });
  const usage = await readUsage(env.SHOPIFY_INSTALLATIONS, shopId);
  await writeUsage(env.SHOPIFY_INSTALLATIONS, shopId, {
    ...usage,
    planId,
    limit: PLAN_CATALOG[planId].monthlySessions,
    updatedAt: now,
  });
}

export default function Billing() {
  const { plans, currentPlanId, usage } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const confirmationUrl =
    fetcher.data && "confirmationUrl" in fetcher.data
      ? fetcher.data.confirmationUrl
      : undefined;

  return (
    <s-page heading="Plan & billing">
      <s-section heading="Honest usage">
        <s-paragraph>
          You are billed on <strong>human sessions</strong> after bots and 1-second
          pogo-stabs are filtered. When you hit the cap, recording pauses — we do not
          silently sample, and we do not surprise-upgrade you.
        </s-paragraph>
        <s-paragraph>
          This UTC month:{" "}
          <strong>
            {usage.billableSessions.toLocaleString()} / {usage.limit.toLocaleString()}
          </strong>{" "}
          on <strong>{PLAN_CATALOG[currentPlanId].name}</strong>.
        </s-paragraph>
      </s-section>
      <s-section heading="Plans">
        <s-stack direction="block" gap="base">
          {plans.map((plan) => (
            <s-section
              key={plan.id}
              heading={`${plan.name} · ${plan.priceUsd === 0 ? "Free" : `$${plan.priceUsd}/mo`}${plan.id === currentPlanId ? " · current" : ""}`}
            >
              <s-stack direction="block" gap="base">
                <s-paragraph>
                  {plan.monthlySessions.toLocaleString()} human sessions ·{" "}
                  {plan.retentionDays}-day replay storage
                </s-paragraph>
                <s-unordered-list>
                  {plan.features.map((feature) => (
                    <s-list-item key={feature}>{feature}</s-list-item>
                  ))}
                </s-unordered-list>
                <s-button
                  variant={plan.id === currentPlanId ? "primary" : "secondary"}
                  disabled={plan.id === currentPlanId}
                  onClick={() => {
                    void fetcher.submit({ planId: plan.id }, { method: "POST" });
                  }}
                  {...(fetcher.state !== "idle" ? { loading: true } : {})}
                >
                  {plan.id === currentPlanId
                    ? "Current plan"
                    : plan.priceUsd === 0
                      ? "Switch to Free"
                      : `Choose ${plan.name}`}
                </s-button>
              </s-stack>
            </s-section>
          ))}
        </s-stack>
      </s-section>
      {fetcher.data && "message" in fetcher.data && fetcher.data.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>
          {fetcher.data.message}
        </s-banner>
      ) : null}
      {confirmationUrl ? (
        <s-banner tone="info">
          Confirm the Shopify charge to finish.{" "}
          <s-link href={confirmationUrl} target="_blank">
            Open confirmation
          </s-link>
        </s-banner>
      ) : null}
    </s-page>
  );
}
