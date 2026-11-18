import Stripe from "stripe"

export async function POST() {
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.WM_STRIPE_TEST_CHECKOUT_ENABLED !== "true"
  ) {
    return new Response("Checkout is currently unavailable.", { status: 404 })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const priceId = process.env.STRIPE_MAINTENANCE_PRICE_ID?.trim()
  const portalUrl = process.env.WM_PORTAL_URL?.trim()

  if (
    !secretKey ||
    !/^(sk|rk)_test_/.test(secretKey) ||
    !priceId?.startsWith("price_") ||
    !portalUrl
  ) {
    return new Response("Stripe test checkout is not configured.", {
      status: 503,
    })
  }

  try {
    const stripe = new Stripe(secretKey, {
      timeout: 10_000,
      maxNetworkRetries: 1,
    })

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: new URL("/maintenance/checkout/return", portalUrl).href,
      cancel_url: new URL("/maintenance", portalUrl).href,
      metadata: { source: "tgs_website_manager" },
      subscription_data: {
        metadata: { source: "tgs_website_manager" },
      },
    })

    if (!session.url || session.livemode) {
      throw new Error("Expected a Stripe sandbox checkout URL")
    }

    return Response.redirect(session.url, 303)
  } catch (error) {
    console.error(
      "Maintenance checkout could not start",
      error instanceof Stripe.errors.StripeError ? error.code : undefined,
    )

    return new Response(
      "Could not start checkout. Return to the maintenance page and try again.",
      { status: 502 },
    )
  }
}
