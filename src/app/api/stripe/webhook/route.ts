import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import {
  getStripeMode,
  isStripeKeyForMode,
} from "@/lib/website-manager/stripe-mode"
import { syncStripeInvoice } from "@/lib/website-manager/sync-stripe-invoice"
import { verifyStripeCheckout } from "@/lib/website-manager/verify-stripe-checkout"

const source = "tgs_website_manager"

const supportedEvents = new Set<string>([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
  "invoice.updated",
])

export async function POST(request: Request) {
  const mode = getStripeMode()

  if (!mode) {
    return new Response("Stripe webhook unavailable.", {
      status: 404,
    })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()

  if (!isStripeKeyForMode(secretKey, mode) || !signingSecret) {
    return new Response("Stripe webhook is not configured.", {
      status: 503,
    })
  }

  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return new Response("Missing Stripe signature.", {
      status: 400,
    })
  }

  const stripe = new Stripe(secretKey, {
    timeout: 7000,
    maxNetworkRetries: 0,
  })

  let event: Stripe.Event

  try {
    const body = await request.text()

    event = stripe.webhooks.constructEvent(body, signature, signingSecret)
  } catch {
    return new Response("Invalid Stripe webhook signature.", {
      status: 400,
    })
  }

  if (
    event.livemode !== (mode === "live") ||
    !supportedEvents.has(event.type)
  ) {
    return Response.json({ received: true })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseSecret =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !supabaseSecret) {
    return new Response("Billing storage is not configured.", {
      status: 503,
    })
  }

  try {
    const admin = createClient(supabaseUrl, supabaseSecret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.expired": {
        const session = event.data.object

        if (session.metadata?.source !== source) break

        await verifyStripeCheckout(admin, stripe, session.id, event.livemode)

        break
      }

      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.voided":
      case "invoice.marked_uncollectible":
      case "invoice.updated": {
        await syncStripeInvoice(admin, stripe, event)
        break
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object

        if (subscription.metadata?.source !== source) break

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id

        const { error } = await admin
          .from("wm_stripe_subscription_events")
          .upsert(
            {
              stripe_event_id: event.id,
              stripe_event_type: event.type,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: customerId,
              subscription_status: subscription.status,
              stripe_livemode: event.livemode,
              stripe_created_at: new Date(event.created * 1000).toISOString(),
            },
            {
              onConflict: "stripe_event_id",
              ignoreDuplicates: true,
            },
          )

        if (error) {
          console.error("Could not save subscription event", {
            eventId: event.id,
            code: error.code,
          })

          throw new Error("Subscription event storage failed.")
        }

        break
      }
    }

    return Response.json({ received: true })
  } catch (error) {
    console.error("Website Manager Stripe event failed", {
      eventId: event.id,
      eventType: event.type,
      mode,
      reason: error instanceof Error ? error.message : "Unknown error",
    })

    return new Response("Could not process billing event.", {
      status: 500,
    })
  }
}
