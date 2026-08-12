export default function DataProtection() {
  return (
    <s-page heading="Data protection">
      <s-section heading="Safe recording defaults">
        <s-unordered-list>
          <s-list-item>
            PathMinty never captures passwords or form-field values.
          </s-list-item>
          <s-list-item>
            DOM targets use structural paths, not customer-visible text.
          </s-list-item>
          <s-list-item>Replay data is isolated by Shopify store.</s-list-item>
          <s-list-item>
            Customer deletion requests are handled through Shopify compliance webhooks.
          </s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section slot="aside" heading="Retention">
        <s-paragraph>
          Replay retention follows your plan: 14 days on Free, 30 on Launch, 60 on
          Growth. Human-session counts reset each UTC month. Aggregated route stats can
          remain after raw replay chunks expire.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
