import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value

  const id = record(value).id
  return typeof id === "string" ? id : null
}

function timestamp(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid Stripe service-period timestamp.")
  }

  return new Date(value * 1000).toISOString()
}

function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid Stripe invoice amount.")
  }

  return value
}

export async function syncStripeInvoice(
  admin: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  const invoiceId = objectId(event.data.object)

  if (!invoiceId) {
    throw new Error("Missing Stripe invoice ID.")
  }

  // Fetch current Stripe state instead of relying on an old event body.
  const invoice = await stripe.invoices.retrieve(invoiceId)
  const raw = record(invoice)

  const parent = record(raw.parent)
  const subscriptionDetails = record(parent.subscription_details)

  const subscriptionId =
    objectId(subscriptionDetails.subscription) ?? objectId(raw.subscription)

  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  if (subscription.metadata.source !== "tgs_website_manager") {
    return
  }

  // Legacy anonymous test subscriptions need manual reconciliation.
  const attemptId = subscription.metadata.checkout_attempt_id
  if (!attemptId) return

  if (
    invoice.livemode !== event.livemode ||
    subscription.livemode !== event.livemode
  ) {
    throw new Error("Stripe invoice mode mismatch.")
  }

  if (!invoice.status || invoice.status === "draft") return

  if (
    ![
      "subscription_create",
      "subscription_cycle",
      "subscription_update",
    ].includes(invoice.billing_reason ?? "")
  ) {
    throw new Error("Invoice requires review: unsupported billing reason.")
  }

  const accountResult = await admin
    .from("wm_stripe_website_accounts")
    .select("website_id, stripe_customer_id, checkout_attempt_id")
    .eq("stripe_subscription_id", subscription.id)
    .eq("stripe_livemode", event.livemode)
    .maybeSingle()

  if (accountResult.error || !accountResult.data) {
    // Invoice events can arrive before checkout completion.
    // Returning an error lets Stripe retry after binding succeeds.
    throw new Error("Verified Stripe account is not available yet.")
  }

  const account = accountResult.data
  const customerId = objectId(invoice.customer)

  if (
    !customerId ||
    customerId !== account.stripe_customer_id ||
    objectId(subscription.customer) !== customerId ||
    account.checkout_attempt_id !== attemptId ||
    subscription.metadata.website_id !== account.website_id
  ) {
    throw new Error("Stripe invoice ownership mismatch.")
  }

  const attemptResult = await admin
    .from("wm_stripe_checkout_attempts")
    .select("stripe_price_id")
    .eq("id", attemptId)
    .eq("website_id", account.website_id)
    .eq("stripe_livemode", event.livemode)
    .maybeSingle()

  if (attemptResult.error || !attemptResult.data) {
    throw new Error("Stripe checkout reference is unavailable.")
  }

  const lines = await stripe.invoices.listLineItems(invoice.id, {
    limit: 100,
  })

  if (lines.has_more || lines.data.length !== 1) {
    throw new Error("Invoice requires review: expected one plan line.")
  }

  const line = record(lines.data[0])
  const lineParent = record(line.parent)
  const details = record(lineParent.subscription_item_details)
  const pricing = record(line.pricing)
  const priceDetails = record(pricing.price_details)
  const period = record(line.period)

  const lineSubscriptionId =
    objectId(details.subscription) ?? objectId(line.subscription)

  const priceId = objectId(priceDetails.price) ?? objectId(line.price)

  const proration = details.proration ?? line.proration

  if (
    lineSubscriptionId !== subscription.id ||
    priceId !== attemptResult.data.stripe_price_id ||
    proration === true ||
    line.quantity !== 1 ||
    invoice.currency !== "usd"
  ) {
    throw new Error("Invoice requires review: plan line mismatch.")
  }

  const transitions = record(raw.status_transitions)

  const result = await admin.rpc("wm_sync_stripe_invoice", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_invoice: {
      stripe_invoice_id: invoice.id,
      website_id: account.website_id,
      stripe_livemode: event.livemode,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      currency: invoice.currency,
      status: invoice.status,
      amount_due_cents: amount(invoice.amount_due),
      amount_paid_cents: amount(invoice.amount_paid),
      amount_remaining_cents: amount(invoice.amount_remaining),
      service_period_start: timestamp(period.start),
      service_period_end: timestamp(period.end),
      paid_at:
        transitions.paid_at == null ? null : timestamp(transitions.paid_at),
    },
  })

  if (result.error) {
    console.error("Stripe invoice storage failed", {
      invoiceId: invoice.id,
      code: result.error.code,
      message: result.error.message,
    })

    throw new Error("Could not store Stripe invoice.")
  }
}
