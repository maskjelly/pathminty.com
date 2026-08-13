import { LiveDashboard } from "./LiveDashboard";
import { PrivacyPage, SupportPage, TermsPage } from "./marketing/LegalPages";
import { OpsApp } from "./ops/OpsApp";

/**
 * Merchant dashboard, public landing, and staff ops share one origin.
 * Production merchant surfaces only real storefront data.
 */
export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/ops")) return <OpsApp />;
  if (path.startsWith("/privacy")) return <PrivacyPage />;
  if (path.startsWith("/terms")) return <TermsPage />;
  if (path.startsWith("/support")) return <SupportPage />;
  return <LiveDashboard />;
}
