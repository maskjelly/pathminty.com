import { LiveDashboard } from "./LiveDashboard";
import { OpsApp } from "./ops/OpsApp";

/**
 * Merchant dashboard, public landing, and staff ops share one origin.
 * Production merchant surfaces only real storefront data.
 */
export function App() {
  if (window.location.pathname.startsWith("/ops")) {
    return <OpsApp />;
  }
  return <LiveDashboard />;
}
