import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { StripeMode } from "./stripe-mode"

export type WebsiteBillingLink =
  | {
      kind: "verified"
      subscriptionId: string
      customerId: string
      billingUserId: string | null
    }
  | {
      kind: "legacy"
      subscriptionId: string
    }

export async function loadWebsiteBillingLinks(
  admin: SupabaseClient,
  websiteIds: string[],
  userId: string,
  mode: StripeMode,
) {
  const links = new Map<string, WebsiteBillingLink>()
  const legacyCustomers = new Set<string>()

  if (websiteIds.length === 0) {
    return { links, legacyCustomers }
  }

  const [accounts, legacyLinks, contacts] = await Promise.all([
    admin
      .from("wm_stripe_website_accounts")
      .select(
        "website_id, stripe_subscription_id, stripe_customer_id, billing_user_id",
      )
      .in("website_id", websiteIds)
      .eq("stripe_livemode", mode === "live"),

    admin
      .from("wm_website_billing")
      .select("website_id, stripe_subscription_id")
      .in("website_id", websiteIds),

    admin
      .from("wm_stripe_billing_contacts")
      .select("stripe_customer_id")
      .eq("user_id", userId),
  ])

  if (accounts.error || legacyLinks.error || contacts.error) {
    console.error("Website billing link lookup failed", {
      accounts: accounts.error?.code,
      legacyLinks: legacyLinks.error?.code,
      contacts: contacts.error?.code,
    })

    throw new Error("Could not load website billing.")
  }

  for (const row of legacyLinks.data ?? []) {
    links.set(row.website_id, {
      kind: "legacy",
      subscriptionId: row.stripe_subscription_id,
    })
  }

  // Verified connections take precedence over legacy records.
  for (const row of accounts.data ?? []) {
    links.set(row.website_id, {
      kind: "verified",
      subscriptionId: row.stripe_subscription_id,
      customerId: row.stripe_customer_id,
      billingUserId: row.billing_user_id,
    })
  }

  for (const row of contacts.data ?? []) {
    legacyCustomers.add(row.stripe_customer_id)
  }

  return { links, legacyCustomers }
}

export function canManageBillingCustomer(
  link: WebsiteBillingLink,
  customerId: string,
  userId: string,
  legacyCustomers: Set<string>,
) {
  if (link.kind === "verified") {
    return link.customerId === customerId && link.billingUserId === userId
  }

  return legacyCustomers.has(customerId)
}
