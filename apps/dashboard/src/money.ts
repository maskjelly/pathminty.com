/** Format integer minor units with ISO currency for dashboard surfaces. */
export function formatMoneyMinor(
  amountMinor: number,
  currency: string | null | undefined,
): string {
  const code =
    currency && /^[A-Z]{3}$/u.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}
