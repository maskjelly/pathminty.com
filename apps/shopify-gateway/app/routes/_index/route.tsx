import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    // React Router uses thrown redirects to end loader execution.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Watch shoppers move. Fix the leak.</h1>
        <p className={styles.text}>
          PathMinty is heatmaps, journeys, and privacy-masked recordings for Shopify —
          billed on human sessions, not bots.
        </p>
        <p className={styles.notice}>
          PathMinty installs only from Shopify. We never ask you to type a store domain.
        </p>
        <p>
          <a
            className={styles.install}
            href="https://admin.shopify.com/oauth/install?client_id=62b97c0201c60add657038e08ce9ba95"
          >
            Add to Shopify — free
          </a>
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Site canvas</strong>. Every route shoppers actually visit, ranked.
          </li>
          <li>
            <strong>Recordings that respect the shopper</strong>. Inputs masked.
            Checkout DOM skipped.
          </li>
          <li>
            <strong>Honest caps</strong>. Hit the plan limit and recording pauses.
          </li>
        </ul>
      </div>
    </div>
  );
}
