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
        <h1 className={styles.heading}>See the paths that create revenue.</h1>
        <p className={styles.text}>
          Connect your Shopify store to PathMinty for consent-aware heatmaps, customer
          journeys, and revenue attribution.
        </p>
        <p className={styles.notice}>
          PathMinty installs only from Shopify. Store domains are never entered here.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Visual behaviour</strong>. See clicks, scroll depth, and attention.
          </li>
          <li>
            <strong>Revenue paths</strong>. Learn which journeys produce net revenue.
          </li>
          <li>
            <strong>Privacy by default</strong>. Inputs and keystrokes stay private.
          </li>
        </ul>
      </div>
    </div>
  );
}
