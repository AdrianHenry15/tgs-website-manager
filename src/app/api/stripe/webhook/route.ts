import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

export const runtime = "nodejs"

const source = "tgs_website_manager"

export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.WM_STRIPE_TEST_CHECKOUT_ENABLED !== "true"
  ) {
    return new Response("Test webhook unavailable.", { status: 404 })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()

  if (!secretKey || !/^(sk|rk)_test_/.test(secretKey) || !signingSecret) {
    return new Response("Stripe test webhook is not configured.", {
      status: 503,
    })
  }

  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return new Response("Missing Stripe signature.", { status: 400 })
  }

  const stripe = new Stripe(secretKey)
  let event: Stripe.Event

  try {
    const body = await request.text()
    event = stripe.webhooks.constructEvent(body, signature, signingSecret)
  } catch {
    return new Response("Invalid Stripe webhook signature.", { status: 400 })
  }

  if (event.livemode) {
    return Response.json({ received: true })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object

      if (
        session.mode === "subscription" &&
        session.metadata?.source === source
      ) {
        console.info("Verified Website Manager test checkout", {
          eventId: event.id,
          sessionId: session.id,
          paymentStatus: session.payment_status,
        })
      }

      return Response.json({ received: true })
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const subscription = event.data.object

      if (subscription.metadata?.source !== source) {
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

      const supabase = createClient(supabaseUrl, supabaseSecret, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })

      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id

      const { error } = await supabase
        .from("wm_stripe_subscription_events")
        .upsert(
          {
            stripe_event_id: event.id,
            stripe_event_type: event.type,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            subscription_status: subscription.status,
            stripe_created_at: new Date(event.created * 1000).toISOString(),
          },
          { onConflict: "stripe_event_id", ignoreDuplicates: true },
        )

      if (error) {
        console.error("Could not save Website Manager subscription event", {
          eventId: event.id,
          code: error.code,
        })
        return new Response("Could not save billing event.", { status: 500 })
      }

      return Response.json({ received: true })
    }

    default:
      return Response.json({ received: true })
  }
}
