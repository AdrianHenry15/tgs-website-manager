import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"

type CheckoutAttempt = {
  id: string
  website_id: string
  billing_user_id: string
  stripe_livemode: boolean
  stripe_price_id: string
  stripe_session_id: string | null
}

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null)
}

export async function verifyStripeCheckout(
  admin: SupabaseClient,
  stripe: Stripe,
  sessionId: string,
  livemode: boolean,
): Promise<void> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  })

  const attemptId = session.metadata?.checkout_attempt_id

  // Older anonymous checkouts cannot be safely linked automatically.
  if (session.metadata?.source !== "tgs_website_manager" || !attemptId) {
    return
  }

  const { data, error } = await admin
    .from("wm_stripe_checkout_attempts")
    .select(
      "id, website_id, billing_user_id, stripe_livemode, stripe_price_id, stripe_session_id",
    )
    .eq("id", attemptId)
    .maybeSingle()

  if (error || !data) {
    throw new Error("Checkout attempt lookup failed.")
  }

  const attempt = data as CheckoutAttempt

  if (
    session.livemode !== livemode ||
    attempt.stripe_livemode !== livemode ||
    session.client_reference_id !== attempt.id ||
    session.metadata.website_id !== attempt.website_id ||
    session.metadata.billing_user_id !== attempt.billing_user_id ||
    (attempt.stripe_session_id !== null &&
      attempt.stripe_session_id !== session.id)
  ) {
    throw new Error("Checkout identity mismatch.")
  }

  if (session.status === "expired") {
    const { error: expirationError } = await admin
      .from("wm_stripe_checkout_attempts")
      .update({
        stripe_session_id: session.id,
        status: "expired",
      })
      .eq("id", attempt.id)
      .neq("status", "completed")

    if (expirationError) {
      throw new Error("Could not record checkout expiration.")
    }

    return
  }

  const subscriptionId = objectId(session.subscription)
  const customerId = objectId(session.customer)
  const lines = session.line_items

  if (
    session.status !== "complete" ||
    session.mode !== "subscription" ||
    !subscriptionId ||
    !customerId ||
    !lines ||
    lines.has_more ||
    lines.data.length !== 1 ||
    lines.data[0].quantity !== 1 ||
    lines.data[0].price?.id !== attempt.stripe_price_id
  ) {
    throw new Error("Checkout contents mismatch.")
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  if (
    subscription.livemode !== livemode ||
    objectId(subscription.customer) !== customerId ||
    subscription.metadata.source !== "tgs_website_manager" ||
    subscription.metadata.checkout_attempt_id !== attempt.id ||
    subscription.metadata.website_id !== attempt.website_id ||
    subscription.metadata.billing_user_id !== attempt.billing_user_id ||
    subscription.items.has_more ||
    subscription.items.data.length !== 1 ||
    subscription.items.data[0].quantity !== 1 ||
    subscription.items.data[0].price.id !== attempt.stripe_price_id
  ) {
    throw new Error("Subscription identity mismatch.")
  }

  const { data: boundAttemptId, error: bindingError } = await admin.rpc(
    "wm_bind_stripe_checkout",
    {
      p_attempt_id: attempt.id,
      p_session_id: session.id,
      p_customer_id: customerId,
      p_subscription_id: subscription.id,
      p_livemode: livemode,
    },
  )

  if (bindingError || boundAttemptId !== attempt.id) {
    throw new Error("Could not bind checkout.")
  }
}
