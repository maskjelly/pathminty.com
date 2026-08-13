import { env } from "cloudflare:workers";
import { useLoaderData } from "react-router";

export const loader = () => ({
  privacyUrl: `${env.PATHMINTY_DASHBOARD_URL}/privacy`,
  termsUrl: `${env.PATHMINTY_DASHBOARD_URL}/terms`,
  supportUrl: `${env.PATHMINTY_DASHBOARD_URL}/support`,
});

export default function DataProtection() {
  const { privacyUrl, termsUrl, supportUrl } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Your shoppers stay private">
      <s-section heading="What PathMinty records">
        <s-paragraph>
          Clicks, scroll, page paths, and a privacy-masked recording of the storefront.
          That’s it.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Never passwords, emails, or form values.</s-list-item>
          <s-list-item>Checkout pages are not filmed.</s-list-item>
          <s-list-item>
            Recording waits for analytics cookies if you use them.
          </s-list-item>
          <s-list-item>Each store’s data stays in its own locker.</s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section heading="Need the legal pages?">
        <s-unordered-list>
          <s-list-item>
            <s-link href={privacyUrl} target="_blank">
              Privacy policy
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href={termsUrl} target="_blank">
              Terms
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href={supportUrl} target="_blank">
              Support
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section slot="aside" heading="How long we keep it">
        <s-paragraph>
          Recordings stick around 14 days on Free, 30 on Launch, 60 on Growth. Uninstall
          and we delete the shop’s recordings.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
