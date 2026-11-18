import { defineConfig } from "@playwright/test"

const baseURL = "http://127.0.0.1:3100"

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VERCEL_ENV: "development",
      WM_STRIPE_TEST_CHECKOUT_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_test_playwright_local_only",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_local_only",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    },
  },
})
