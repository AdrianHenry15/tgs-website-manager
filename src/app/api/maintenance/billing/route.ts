import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import {
  getStripeMode,
  isStripeKeyForMode,
} from "@/lib/website-manager/stripe-mode"

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

const noStore = { "Cache-Control": "private, no-store" }
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getBillingContext(request: Request) {
  const mode = getStripeMode()

  if (!mode) {
    return new Response(null, { status: 404, headers: noStore })
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return new Response("Sign in again to check billing.", { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  const supabaseSecret =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim()

  if (
    !url ||
    !publishableKey ||
    !supabaseSecret ||
    !isStripeKeyForMode(stripeKey, mode)
  ) {
    return new Response("Stripe billing is not configured.", { status: 503 })
  }

  const viewer = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: authOptions,
  })

  const { data, error } = await viewer.auth.getUser(token)

  if (error || !data.user) {
    return new Response("Sign in again to check billing.", { status: 401 })
  }

  return {
    mode,
    userId: data.user.id,
    viewer,
    admin: createClient(url, supabaseSecret, { auth: authOptions }),
    stripe: new Stripe(stripeKey, { timeout: 5_000, maxNetworkRetries: 0 }),
  }
}

async function getWebsiteSubscription(
  stripe: Stripe,
  subscriptionId: string,
  livemode: boolean,
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  if (
    subscription.livemode !== livemode ||
    subscription.metadata.source !== "tgs_website_manager"
  ) {
    return null
  }

  return {
    status: subscription.status,
    customerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
  }
}
export async function GET(request: Request) {
  const context = await getBillingContext(request)
  if (context instanceof Response) return context

  const { viewer, admin, stripe, userId, mode } = context

  const { data: websites, error: websitesError } = await viewer
    .from("wm_websites")
    .select("id, name")
    .order("name")

  if (websitesError) {
    return new Response("Could not load websites.", { status: 500 })
  }

  if (websites.length === 0) {
    return Response.json({ billing: [], mode }, { headers: noStore })
  }

  const [linksResult, contactsResult] = await Promise.all([
    admin
      .from("wm_website_billing")
      .select("website_id, stripe_subscription_id")
      .in(
        "website_id",
        websites.map(({ id }) => id),
      ),
    admin
      .from("wm_stripe_billing_contacts")
      .select("stripe_customer_id")
      .eq("user_id", userId),
  ])

  if (linksResult.error || contactsResult.error) {
    console.error("Website billing database lookup failed:", {
      links: linksResult.error,
      contacts: contactsResult.error,
    })

    return new Response("Could not load website billing.", { status: 500 })
  }

  const subscriptionsByWebsite = new Map(
    linksResult.data.map(({ website_id, stripe_subscription_id }) => [
      website_id,
      stripe_subscription_id,
    ]),
  )

  const authorizedCustomers = new Set(
    contactsResult.data.map(({ stripe_customer_id }) => stripe_customer_id),
  )

  const billing = await Promise.all(
    websites.flatMap(({ id, name }) => {
      const subscriptionId = subscriptionsByWebsite.get(id)
      if (!subscriptionId) return []

      return [
        (async () => {
          const subscription = await getWebsiteSubscription(
            stripe,
            subscriptionId,
            mode === "live",
          ).catch(() => null)

          return {
            websiteId: id,
            websiteName: name,
            status: subscription?.status ?? "unavailable",
            canUpdatePaymentMethod:
              subscription !== null &&
              authorizedCustomers.has(subscription.customerId),
          }
        })(),
      ]
    }),
  )

  return Response.json({ billing, mode }, { headers: noStore })
}

export async function POST(request: Request) {
  const context = await getBillingContext(request)
  if (context instanceof Response) return context

  const { viewer, admin, stripe, userId, mode } = context
  const payload = (await request.json().catch(() => null)) as {
    websiteId?: unknown
  } | null
  const websiteId = payload?.websiteId

  if (typeof websiteId !== "string" || !uuidPattern.test(websiteId)) {
    return new Response("Invalid website.", { status: 400 })
  }

  const portalUrl = process.env.WM_PORTAL_URL?.trim()
  if (!portalUrl) {
    return new Response("Billing return URL is not configured.", {
      status: 503,
    })
  }

  const { data: website, error: websiteError } = await viewer
    .from("wm_websites")
    .select("id")
    .eq("id", websiteId)
    .maybeSingle()

  if (websiteError) {
    return new Response("Could not check website access.", { status: 500 })
  }

  if (!website) {
    return new Response("Billing unavailable for this website.", {
      status: 404,
    })
  }

  const { data: link, error: linkError } = await admin
    .from("wm_website_billing")
    .select("stripe_subscription_id")
    .eq("website_id", website.id)
    .maybeSingle()

  if (linkError) {
    return new Response("Could not load website billing.", { status: 500 })
  }

  if (!link) {
    return new Response("Billing unavailable for this website.", {
      status: 404,
    })
  }

  try {
    const subscription = await getWebsiteSubscription(
      stripe,
      link.stripe_subscription_id,
      mode === "live",
    )

    if (!subscription) {
      return new Response("Billing unavailable for this website.", {
        status: 404,
      })
    }

    const { data: contact, error: contactError } = await admin
      .from("wm_stripe_billing_contacts")
      .select("user_id")
      .eq("stripe_customer_id", subscription.customerId)
      .eq("user_id", userId)
      .maybeSingle()

    if (contactError) {
      return new Response("Could not check billing access.", { status: 500 })
    }

    if (!contact) {
      return new Response(
        "Only the billing contact can update payment methods.",
        {
          status: 403,
        },
      )
    }

    const returnUrl = new URL("/", portalUrl).href
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.customerId,
      return_url: returnUrl,
      flow_data: {
        type: "payment_method_update",
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    })

    return Response.json({ url: session.url }, { headers: noStore })
  } catch (error) {
    console.error(
      "Could not open Website Manager payment settings",
      error instanceof Stripe.errors.StripeError ? error.code : undefined,
    )
    return new Response("Could not open Stripe payment settings.", {
      status: 502,
    })
  }
}
