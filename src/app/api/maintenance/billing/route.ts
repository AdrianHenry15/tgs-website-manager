import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import {
  getStripeMode,
  isStripeKeyForMode,
} from "@/lib/website-manager/stripe-mode"
import {
  canManageBillingCustomer,
  loadWebsiteBillingLinks,
  type WebsiteBillingLink,
} from "@/lib/website-manager/stripe-billing-links"

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

const noStore = { "Cache-Control": "private, no-store" }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function failure(message: string, status: number) {
  return new Response(message, {
    status,
    headers: noStore,
  })
}

async function getBillingContext(request: Request) {
  const mode = getStripeMode()

  if (!mode) {
    return new Response(null, {
      status: 404,
      headers: noStore,
    })
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return failure("Sign in again to check billing.", 401)
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
    return failure("Stripe billing is not configured.", 503)
  }

  const viewer = createClient(url, publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: authOptions,
  })

  const { data, error } = await viewer.auth.getUser(token)

  if (error || !data.user) {
    return failure("Sign in again to check billing.", 401)
  }

  return {
    mode,
    userId: data.user.id,
    viewer,
    admin: createClient(url, supabaseSecret, {
      auth: authOptions,
    }),
    stripe: new Stripe(stripeKey, {
      timeout: 5_000,
      maxNetworkRetries: 0,
    }),
  }
}

async function getWebsiteSubscription(
  stripe: Stripe,
  link: WebsiteBillingLink,
  livemode: boolean,
) {
  const subscription = await stripe.subscriptions.retrieve(link.subscriptionId)

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id

  if (
    subscription.id !== link.subscriptionId ||
    subscription.livemode !== livemode ||
    subscription.metadata.source !== "tgs_website_manager" ||
    (link.kind === "verified" && link.customerId !== customerId)
  ) {
    return null
  }

  return {
    status: subscription.status,
    customerId,
  }
}

export async function GET(request: Request) {
  const context = await getBillingContext(request)
  if (context instanceof Response) return context

  const { viewer, admin, stripe, userId, mode } = context

  // Website access is checked through the signed-in user's RLS.
  const { data: websites, error: websitesError } = await viewer
    .from("wm_websites")
    .select("id, name")
    .order("name")

  if (websitesError) {
    return failure("Could not load websites.", 500)
  }

  const accessibleWebsites = websites ?? []

  if (accessibleWebsites.length === 0) {
    return Response.json({ billing: [], mode }, { headers: noStore })
  }

  let connectionData: Awaited<ReturnType<typeof loadWebsiteBillingLinks>>

  try {
    connectionData = await loadWebsiteBillingLinks(
      admin,
      accessibleWebsites.map(({ id }) => id),
      userId,
      mode,
    )
  } catch {
    return failure("Could not load website billing.", 500)
  }

  const { links, legacyCustomers } = connectionData

  const billing = await Promise.all(
    accessibleWebsites.flatMap(({ id, name }) => {
      const link = links.get(id)
      if (!link) return []

      return [
        (async () => {
          const subscription = await getWebsiteSubscription(
            stripe,
            link,
            mode === "live",
          ).catch((error: unknown) => {
            console.error("Website subscription lookup failed", {
              websiteId: id,
              code:
                error instanceof Stripe.errors.StripeError
                  ? error.code
                  : undefined,
            })

            return null
          })

          return {
            websiteId: id,
            websiteName: name,
            status: subscription?.status ?? "unavailable",
            canUpdatePaymentMethod:
              subscription !== null &&
              canManageBillingCustomer(
                link,
                subscription.customerId,
                userId,
                legacyCustomers,
              ),
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
    return failure("Invalid website.", 400)
  }

  const portalUrl = process.env.WM_PORTAL_URL?.trim()

  let returnUrl: string

  try {
    if (!portalUrl) throw new Error("Missing return URL.")

    const parsed = new URL(portalUrl)

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (mode === "live" && parsed.protocol !== "https:")
    ) {
      throw new Error("Invalid return URL.")
    }

    returnUrl = new URL("/", parsed).href
  } catch {
    return failure("Billing return URL is not configured correctly.", 503)
  }

  const { data: website, error: websiteError } = await viewer
    .from("wm_websites")
    .select("id")
    .eq("id", websiteId)
    .maybeSingle()

  if (websiteError) {
    return failure("Could not check website access.", 500)
  }

  if (!website) {
    return failure("Billing unavailable for this website.", 404)
  }

  let connectionData: Awaited<ReturnType<typeof loadWebsiteBillingLinks>>

  try {
    connectionData = await loadWebsiteBillingLinks(
      admin,
      [website.id],
      userId,
      mode,
    )
  } catch {
    return failure("Could not load website billing.", 500)
  }

  const { links, legacyCustomers } = connectionData
  const link = links.get(website.id)

  if (!link) {
    return failure("Billing unavailable for this website.", 404)
  }

  try {
    const subscription = await getWebsiteSubscription(
      stripe,
      link,
      mode === "live",
    )

    if (!subscription) {
      return failure("Billing unavailable for this website.", 404)
    }

    if (
      !canManageBillingCustomer(
        link,
        subscription.customerId,
        userId,
        legacyCustomers,
      )
    ) {
      return failure(
        "Only the billing contact can update payment methods.",
        403,
      )
    }

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

    return failure("Could not open Stripe payment settings.", 502)
  }
}
