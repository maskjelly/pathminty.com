import { PLAN_CATALOG, type PlanId, type ShopWorkspace } from "@pathminty/contracts";

type SettingsPageProps = {
  workspace: ShopWorkspace;
  busy: boolean;
  onSelectPlan: (planId: PlanId) => void;
  onBack: () => void;
};

export function SettingsPage({
  workspace,
  busy,
  onSelectPlan,
  onBack,
}: SettingsPageProps) {
  return (
    <section className="settings-page">
      <header className="settings-head">
        <button className="control" onClick={onBack} type="button">
          Back to canvas
        </button>
        <div>
          <p>Workspace</p>
          <h2>Plan & privacy</h2>
        </div>
      </header>

      <article className="settings-card">
        <h3>This month</h3>
        <p>
          {workspace.usage.billableSessions.toLocaleString()} /{" "}
          {workspace.usage.limit.toLocaleString()} human sessions on{" "}
          <strong>{workspace.plan.name}</strong>
        </p>
        <div className="quota-track large">
          <span
            style={{
              width: `${Math.min(100, (workspace.usage.billableSessions / Math.max(1, workspace.usage.limit)) * 100)}%`,
            }}
          />
        </div>
        <small>
          {workspace.usage.botSessions} bots filtered · {workspace.usage.rawSessions}{" "}
          raw sessions · {workspace.plan.retentionDays}-day replay retain · period{" "}
          {workspace.usage.period}
        </small>
      </article>

      <div className="pricing-grid settings-plans">
        {Object.values(PLAN_CATALOG).map((plan) => (
          <article
            key={plan.id}
            className="pricing-card"
            data-featured={plan.id === workspace.plan.id}
          >
            <p>{plan.headline}</p>
            <h3>{plan.name}</h3>
            <strong>
              {plan.priceUsd === 0 ? "Free" : `$${plan.priceUsd}`}
              <span>{plan.priceUsd === 0 ? "" : "/mo"}</span>
            </strong>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              className="marketing-cta"
              disabled={busy || plan.id === workspace.plan.id}
              onClick={() => onSelectPlan(plan.id)}
              type="button"
            >
              {plan.id === workspace.plan.id
                ? "Current plan"
                : `Switch to ${plan.name}`}
            </button>
          </article>
        ))}
      </div>
      <p className="settings-note">
        Paid plans are confirmed in Shopify Admin → PathMinty → Plan so the charge
        matches what you see here. Development stores can switch instantly.
      </p>

      <article className="settings-card">
        <h3>Privacy defaults</h3>
        <ul className="role-list">
          <li>Form values and keystrokes are never recorded.</li>
          <li>Account, checkout, and order pages skip DOM replay.</li>
          <li>Recording waits for analytics consent.</li>
          <li>Ad blockers can hide a visit — that is expected, not a bug.</li>
        </ul>
      </article>
    </section>
  );
}
