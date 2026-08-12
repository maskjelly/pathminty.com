import { AppProvider } from "@shopify/shopify-app-react-router/react";

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page heading="Install PathMinty through Shopify">
        <s-section heading="Secure installation">
          <s-paragraph>
            PathMinty starts installation only from a Shopify-owned surface. Open the
            PathMinty listing or your Shopify developer dashboard to continue.
          </s-paragraph>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
