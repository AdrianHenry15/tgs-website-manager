import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import {
  getStripeMode,
  isStripeKeyForMode,
} from "@/lib/website-manager/stripe-mode"
import { verifyStripeCheckout } from "@/lib/website-manager/verify-stripe-checkout"

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

function reply(error: string, status: number) {
  return Response.json({ error }, { status, headers })
}

async function getContext(request: Request) {
  const mode = getStripeMode()

  if (!mode || process.env.WM_STRIPE_CLIENT_ENROLLMENT_ENABLED !== "true") {
    return reply("Client enrollment is unavailable.", 404)
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) return reply("Sign in to manage enrollment.", 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  const serviceKey =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()
  const priceId = process.env.STRIPE_MAINTENANCE_PRICE_ID?.trim()
  const portalUrl = process.env.WM_PORTAL_URL?.trim()

  if (
    !url ||
    !publishableKey ||
    !serviceKey ||
    !isStripeKeyForMode(stripeKey, mode) ||
    !priceId?.startsWith("price_") ||
    !portalUrl
  ) {
    return reply("Enrollment is not configured.", 503)
  }

  const viewer = createClient(url, publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await viewer.auth.getUser(token)

  if (error || !data.user) {
    return reply("Sign in again.", 401)
  }

  if (!data.user.email || !data.user.email_confirmed_at) {
    return reply("Confirm your account email before enrolling.", 403)
  }

  return {
    mode,
    user: data.user,
    viewer,
    admin: createClient(url, serviceKey, { auth: authOptions }),
    stripe: new Stripe(stripeKey, {
      timeout: 10_000,
      maxNetworkRetries: 1,
    }),
    priceId,
    portalUrl,
  }
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request)

    if (context instanceof Response) {
      if (context.status === 404) {
        return Response.json({ enabled: false, websites: [] }, { headers })
      }

      return context
    }

    const { viewer, admin, user, mode } = context

    const [websites, approvals, accounts] = await Promise.all([
      viewer.from("wm_websites").select("id, name"),

      admin
        .from("wm_stripe_enrollment_approvals")
        .select("website_id, first_charge_on, billing_timezone")
        .eq("billing_user_id", user.id)
        .eq("approved", true),

      admin
        .from("wm_stripe_website_accounts")
        .select("website_id")
        .eq("stripe_livemode", mode === "live"),
    ])

    if (websites.error || approvals.error || accounts.error) {
      throw new Error("Enrollment lookup failed.")
    }

    const names = new Map(
      (websites.data ?? []).map((website) => [website.id, website.name]),
    )

    const enrolled = new Set(
      (accounts.data ?? []).map((account) => account.website_id),
    )

    return Response.json(
      {
        enabled: true,
        mode,
        websites: (approvals.data ?? [])
          .filter(
            (approval) =>
              names.has(approval.website_id) &&
              !enrolled.has(approval.website_id),
          )
          .map((approval) => ({
            websiteId: approval.website_id,
            websiteName: names.get(approval.website_id),
            firstChargeOn: approval.first_charge_on,
            billingTimezone: approval.billing_timezone,
          })),
      },
      { headers },
    )
  } catch {
    return reply("Could not load enrollment options.", 503)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext(request)
    if (context instanceof Response) return context

    const { admin, viewer, stripe, user, mode, priceId, portalUrl } = context

    const payload = (await request.json().catch(() => null)) as {
      websiteId?: unknown
    } | null

    const websiteId = payload?.websiteId

    if (typeof websiteId !== "string" || !uuidPattern.test(websiteId)) {
      return reply("Choose a valid website.", 400)
    }

    const [website, approval, plan, existing, legacy] = await Promise.all([
      viewer.from("wm_websites").select("id").eq("id", websiteId).maybeSingle(),

      admin
        .from("wm_stripe_enrollment_approvals")
        .select("first_charge_at, first_charge_on, updated_at")
        .eq("website_id", websiteId)
        .eq("billing_user_id", user.id)
        .eq("approved", true)
        .maybeSingle(),

      admin
        .from("wm_maintenance_plans")
        .select("monthly_amount_cents, currency, status")
        .eq("website_id", websiteId)
        .maybeSingle(),

      admin
        .from("wm_stripe_website_accounts")
        .select("website_id")
        .eq("website_id", websiteId)
        .eq("stripe_livemode", mode === "live")
        .maybeSingle(),

      admin
        .from("wm_website_billing")
        .select("stripe_subscription_id")
        .eq("website_id", websiteId)
        .maybeSingle(),
    ])

    if (
      website.error ||
      approval.error ||
      plan.error ||
      existing.error ||
      legacy.error
    ) {
      throw new Error("Checkout access lookup failed.")
    }

    if (!website.data || !approval.data) {
      return reply(
        "Only the approved billing contact can enroll this website.",
        403,
      )
    }

    if (!plan.data || plan.data.status !== "active") {
      return reply("An active maintenance agreement is required.", 409)
    }

    if (existing.data) {
      return reply("This website already has Stripe enrollment.", 409)
    }

    if (legacy.data) {
      const subscription = await stripe.subscriptions.retrieve(
        legacy.data.stripe_subscription_id,
      )

      if (
        subscription.status !== "canceled" &&
        subscription.status !== "incomplete_expired"
      ) {
        return reply(
          "Resolve the existing subscription before enrolling again.",
          409,
        )
      }
    }

    const firstCharge = Math.floor(
      Date.parse(approval.data.first_charge_at) / 1000,
    )

    if (
      !Number.isFinite(firstCharge) ||
      firstCharge <= Math.floor(Date.now() / 1000) + 172800
    ) {
      return reply(
        "Enrollment must be completed at least two days before the approved billing start. Contact TGS to revise the date.",
        409,
      )
    }

    const price = await stripe.prices.retrieve(priceId)

    if (
      price.livemode !== (mode === "live") ||
      !price.active ||
      price.billing_scheme !== "per_unit" ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed" ||
      price.currency !== plan.data.currency ||
      price.unit_amount !== plan.data.monthly_amount_cents
    ) {
      return reply(
        "The configured Stripe price does not match the agreement.",
        409,
      )
    }

    const attemptId = randomUUID()

    const metadata = {
      source: "tgs_website_manager",
      website_id: websiteId,
      billing_user_id: user.id,
      checkout_attempt_id: attemptId,
    }

    const parameters: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: attemptId,
      customer_email: user.email,
      allowed_payment_method_types: ["card"],
      payment_method_collection: "always",
      success_url: new URL("/maintenance/checkout/return", portalUrl).href,
      cancel_url: new URL("/", portalUrl).href,
      metadata,
      subscription_data: {
        metadata,
        trial_end: firstCharge,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
      },
    }

    const reservation = await admin.rpc("wm_reserve_approved_checkout", {
      p_id: attemptId,
      p_website_id: websiteId,
      p_user_id: user.id,
      p_livemode: mode === "live",
      p_price_id: priceId,
      p_amount_cents: plan.data.monthly_amount_cents,
      p_currency: plan.data.currency,
      p_approval_version: approval.data.updated_at,
      p_request_body: JSON.stringify(parameters),
    })

    if (reservation.error || !reservation.data) {
      return reply(
        "Enrollment changed or an earlier checkout needs review. Refresh before continuing.",
        409,
      )
    }

    const attempt = reservation.data as {
      id: string
      status: string
      stripe_session_id: string | null
      request_body: string
      created_at: string
    }

    if (attempt.status === "completed") {
      return reply("Enrollment already completed. Refresh billing.", 409)
    }

    if (
      !attempt.stripe_session_id &&
      Date.now() - Date.parse(attempt.created_at) >= 23 * 3600000
    ) {
      return reply(
        "The previous attempt needs reconciliation before retrying.",
        409,
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

    if (session.livemode !== (mode === "live")) {
      throw new Error("Checkout mode mismatch.")
    }

    if (session.status === "complete") {
      await verifyStripeCheckout(admin, stripe, session.id, mode === "live")

      return reply("Enrollment completed. Refresh billing status.", 409)
    }

    if (session.status === "expired") {
      const expiration = await admin
        .from("wm_stripe_checkout_attempts")
        .update({
          stripe_session_id: session.id,
          status: "expired",
        })
        .eq("id", attempt.id)
        .neq("status", "completed")

      if (expiration.error) throw new Error("Expiration save failed.")

      return reply("The previous checkout expired. Start again.", 409)
    }

    if (session.status !== "open" || !session.url) {
      throw new Error("Checkout URL unavailable.")
    }

    const saved = await admin
      .from("wm_stripe_checkout_attempts")
      .update({
        stripe_session_id: session.id,
        status: "open",
      })
      .eq("id", attempt.id)
      .in("status", ["creating", "open"])
      .select("id")
      .maybeSingle()

    if (saved.error) throw new Error("Checkout storage failed.")

    if (!saved.data) {
      return reply(
        "Checkout status changed. Refresh billing before continuing.",
        409,
      )
    }

    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error("Approved maintenance checkout failed", {
      code: error instanceof Stripe.errors.StripeError ? error.code : undefined,
    })

    return reply(
      "Could not confirm checkout. Retry to check the saved attempt.",
      502,
    )
  }
}
