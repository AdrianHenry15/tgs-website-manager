import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import {
  getStripeMode,
  isStripeKeyForMode,
} from "@/lib/website-manager/stripe-mode"

const headers = {
  "Cache-Control": "private, no-store",
}

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CheckoutAttempt = {
  id: string
  website_id: string
  billing_user_id: string
  stripe_price_id: string
  request_body: string
  stripe_session_id: string | null
  status: "creating" | "open" | "completed" | "expired"
  created_at: string
}

function testCheckoutEnabled() {
  return process.env.VERCEL_ENV !== "production" && getStripeMode() === "test"
}

export async function GET() {
  return Response.json({ enabled: testCheckoutEnabled() }, { headers })
}

export async function POST(request: Request) {
  if (!testCheckoutEnabled()) {
    return Response.json(
      { error: "Test checkout is unavailable." },
      { status: 404, headers },
    )
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json(
      { error: "Sign in to start checkout." },
      { status: 401, headers },
    )
  }

  const payload = (await request.json().catch(() => null)) as {
    websiteId?: unknown
  } | null

  const websiteId = payload?.websiteId

  if (typeof websiteId !== "string" || !uuidPattern.test(websiteId)) {
    return Response.json(
      { error: "Choose a valid website." },
      { status: 400, headers },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  const serviceKey =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const priceId = process.env.STRIPE_MAINTENANCE_PRICE_ID?.trim()
  const portalUrl = process.env.WM_PORTAL_URL?.trim()

  if (
    !url ||
    !publishableKey ||
    !serviceKey ||
    !isStripeKeyForMode(secretKey, "test") ||
    !priceId?.startsWith("price_") ||
    !portalUrl
  ) {
    return Response.json(
      { error: "Test checkout is not configured." },
      { status: 503, headers },
    )
  }

  try {
    const viewer = createClient(url, publishableKey, {
      auth: authOptions,
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    })

    const { data: auth, error: authError } = await viewer.auth.getUser(token)

    if (authError || !auth.user) {
      return Response.json(
        { error: "Sign in again." },
        { status: 401, headers },
      )
    }

    const [managedResult, planResult] = await Promise.all([
      viewer.rpc("wm_managed_website_ids"),

      viewer
        .from("wm_maintenance_plans")
        .select("monthly_amount_cents, currency, status")
        .eq("website_id", websiteId)
        .maybeSingle(),
    ])

    if (managedResult.error || planResult.error) {
      return Response.json(
        { error: "Could not check checkout access." },
        { status: 500, headers },
      )
    }

    const managed = (managedResult.data ?? []) as {
      website_id: string
    }[]

    if (!managed.some((item) => item.website_id === websiteId)) {
      return Response.json(
        { error: "Only website managers can start sandbox checkout." },
        { status: 403, headers },
      )
    }

    const plan = planResult.data

    if (!plan || plan.status !== "active") {
      return Response.json(
        { error: "Configure an active maintenance agreement first." },
        { status: 409, headers },
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: authOptions,
    })

    const stripe = new Stripe(secretKey, {
      timeout: 10_000,
      maxNetworkRetries: 1,
    })

    const price = await stripe.prices.retrieve(priceId)

    if (
      price.livemode ||
      !price.active ||
      price.billing_scheme !== "per_unit" ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed" ||
      price.currency !== plan.currency ||
      price.unit_amount !== plan.monthly_amount_cents
    ) {
      return Response.json(
        {
          error:
            "The configured Stripe test price must match this agreement's currency and monthly amount.",
        },
        { status: 409, headers },
      )
    }

    // Preserve the existing subscription guard while the webhook
    // linking implementation is upgraded.
    const link = await admin
      .from("wm_website_billing")
      .select("stripe_subscription_id")
      .eq("website_id", websiteId)
      .maybeSingle()

    if (link.error) {
      throw new Error("Could not check existing billing.")
    }

    if (link.data) {
      const subscription = await stripe.subscriptions.retrieve(
        link.data.stripe_subscription_id,
      )

      if (
        subscription.status !== "canceled" &&
        subscription.status !== "incomplete_expired"
      ) {
        return Response.json(
          {
            error: "Resolve the existing subscription before enrolling again.",
          },
          { status: 409, headers },
        )
      }
    }

    const attemptId = randomUUID()

    const metadata = {
      source: "tgs_website_manager",
      website_id: websiteId,
      billing_user_id: auth.user.id,
      checkout_attempt_id: attemptId,
    }

    const parameters: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: attemptId,
      success_url: new URL("/maintenance/checkout/return", portalUrl).href,
      cancel_url: new URL("/", portalUrl).href,
      metadata,
      subscription_data: { metadata },
    }

    const reservation = await admin.rpc("wm_reserve_test_checkout", {
      p_id: attemptId,
      p_website_id: websiteId,
      p_user_id: auth.user.id,
      p_price_id: priceId,
      p_request_body: JSON.stringify(parameters),
    })

    if (reservation.error || !reservation.data) {
      return Response.json(
        {
          error:
            "Could not reserve checkout. Another attempt may already exist.",
        },
        { status: 409, headers },
      )
    }

    const attempt = reservation.data as CheckoutAttempt

    if (attempt.status === "completed") {
      return Response.json(
        { error: "Checkout already completed. Refresh billing status." },
        { status: 409, headers },
      )
    }

    if (attempt.stripe_price_id !== priceId) {
      return Response.json(
        {
          error:
            "An existing checkout uses a previous price. Review it before continuing.",
        },
        { status: 409, headers },
      )
    }

    if (
      !attempt.stripe_session_id &&
      Date.now() - Date.parse(attempt.created_at) >= 23 * 60 * 60 * 1000
    ) {
      return Response.json(
        {
          error:
            "This checkout needs reconciliation before another session can be created.",
        },
        { status: 409, headers },
      )
    }

    const session = attempt.stripe_session_id
      ? await stripe.checkout.sessions.retrieve(attempt.stripe_session_id)
      : await stripe.checkout.sessions.create(
          JSON.parse(
            attempt.request_body,
          ) as Stripe.Checkout.SessionCreateParams,
          { idempotencyKey: `wm-checkout/${attempt.id}` },
        )

    if (session.livemode) {
      throw new Error("Expected a sandbox checkout.")
    }

    const status =
      session.status === "complete"
        ? "completed"
        : session.status === "expired"
          ? "expired"
          : "open"

    const saved = await admin
      .from("wm_stripe_checkout_attempts")
      .update({
        stripe_session_id: session.id,
        status,
      })
      .eq("id", attempt.id)
      .select("id")
      .single()

    if (saved.error) {
      throw new Error("Could not confirm checkout storage.")
    }

    if (status !== "open" || !session.url) {
      return Response.json(
        {
          error:
            status === "expired"
              ? "The previous checkout expired. You can start again."
              : "Checkout already completed. Refresh billing status.",
        },
        { status: 409, headers },
      )
    }

    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error("Maintenance test checkout failed", {
      code: error instanceof Stripe.errors.StripeError ? error.code : undefined,
    })

    return Response.json(
      { error: "Could not start checkout. Retry to check the saved attempt." },
      { status: 502, headers },
    )
  }
}
