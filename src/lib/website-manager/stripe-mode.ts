export type StripeMode = "test" | "live"

export function getStripeMode(): StripeMode | null {
  if (process.env.VERCEL_ENV === "production") {
    return process.env.WM_STRIPE_LIVE_BILLING_ENABLED === "true" ? "live" : null
  }

  return process.env.WM_STRIPE_TEST_CHECKOUT_ENABLED === "true" ? "test" : null
}

export function isStripeKeyForMode(
  key: string | undefined,
  mode: StripeMode,
): key is string {
  return (
    key?.startsWith(`sk_${mode}_`) === true ||
    key?.startsWith(`rk_${mode}_`) === true
  )
}
