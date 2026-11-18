import { expect, test } from "@playwright/test"
import Stripe from "stripe"

test("the public maintenance page links back to sign-in", async ({ page }) => {
  await page.goto("/maintenance")

  await expect(
    page.getByRole("heading", { name: "Monthly website maintenance" }),
  ).toBeVisible()

  await expect(
    page.getByRole("link", { name: "Ask about maintenance" }),
  ).toHaveAttribute("href", /^mailto:/)

  await page.getByRole("link", { name: "Client sign-in" }).click()
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible()
})

test("forgot password opens and returns to sign-in", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Forgot password?" }).click()

  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Back to sign in" }).click()

  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible()
})

test("billing rejects requests without a session", async ({ request }) => {
  const status = await request.get("/api/maintenance/billing")
  expect(status.status()).toBe(401)

  const portal = await request.post("/api/maintenance/billing", {
    data: { websiteId: "00000000-0000-4000-8000-000000000001" },
  })
  expect(portal.status()).toBe(401)
})

test("the Stripe webhook accepts an intact signature and rejects a changed body", async ({
  request,
}) => {
  const stripe = new Stripe("sk_test_playwright_local_only")
  const payload = JSON.stringify({
    id: "evt_playwright_checkout",
    object: "event",
    livemode: false,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_playwright",
        mode: "subscription",
        payment_status: "paid",
        metadata: { source: "tgs_website_manager" },
      },
    },
  })

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_playwright_local_only",
  })

  const headers = {
    "Content-Type": "application/json",
    "Stripe-Signature": signature,
  }

  const valid = await request.post("/api/stripe/webhook", {
    headers,
    data: payload,
  })
  expect(valid.status()).toBe(200)
  expect(await valid.json()).toEqual({ received: true })

  const changed = await request.post("/api/stripe/webhook", {
    headers,
    data: payload.replace('"paid"', '"unpaid"'),
  })
  expect(changed.status()).toBe(400)
})
