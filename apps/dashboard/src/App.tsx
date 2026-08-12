import { LiveDashboard } from "./LiveDashboard";

/**
 * Merchant dashboard entry. Production surfaces only real storefront data via
 * LiveDashboard — no demo/sample/fallback analytics.
 */
export function App() {
  return <LiveDashboard />;
}
