import { AppProvider } from "@shopify/shopify-app-react-router/react";

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page heading="Install PathMinty from Shopify">
        <s-section heading="One click">
          <s-paragraph>
            Open PathMinty from Shopify Admin, or start a new install below. We never
            ask you to type a store domain.
          </s-paragraph>
          <s-link href="https://admin.shopify.com/oauth/install?client_id=62b97c0201c60add657038e08ce9ba95">
            Add to Shopify — free
          </s-link>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
