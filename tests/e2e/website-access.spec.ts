import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { expect, test } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

if (existsSync(".env.local")) loadEnvFile(".env.local")

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

const screenshotBucket = "wm-request-screenshots"
const screenshot = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XJ3sAAAAASUVORK5CYII=",
  "base64",
)

function requireValue(value: string | undefined, name: string) {
  if (!value) throw new Error(`Set ${name} before running authenticated QA.`)
  return value
}

async function createTestUser(
  admin: SupabaseClient,
  url: string,
  publishableKey: string,
  cleanupIds: string[],
) {
  const email = `wm-qa-${randomUUID()}@example.com`
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })

  if (createError || !created.user) {
    throw new Error(
      `Could not create QA user: ${createError?.message ?? "missing user"}`,
    )
  }

  const userId = created.user.id
  cleanupIds.push(userId)

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  if (linkError || !link.properties?.hashed_token) {
    throw new Error(
      `Could not generate QA sign-in token: ${linkError?.message ?? "missing token"}`,
    )
  }

  const client = createClient(url, publishableKey, { auth: authOptions })
  const { data, error } = await client.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  })

  if (error || !data.session || data.user?.id !== userId) {
    throw new Error(
      `Could not sign in QA user: ${error?.message ?? "missing session"}`,
    )
  }

  return { userId, client }
}

test("website assignment controls request and screenshot access", async () => {
  const websiteId = requireValue(
    process.env.WM_QA_WEBSITE_ID?.trim(),
    "WM_QA_WEBSITE_ID",
  )
  const url = requireValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    "NEXT_PUBLIC_SUPABASE_URL",
  )

  const endpoint = new URL(url)
  expect(
    ["localhost", "127.0.0.1", "[::1]"],
    "Authenticated QA creates users and requests. Point it at local Supabase.",
  ).toContain(endpoint.hostname)

  const publishableKey = requireValue(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  )

  const secretKey = requireValue(
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    "WM_SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  )

  const admin = createClient(url, secretKey, { auth: authOptions })

  const website = await admin
    .from("wm_websites")
    .select("id")
    .eq("id", websiteId!)
    .single()

  expect(
    website.error,
    "The test website must exist in local Supabase",
  ).toBeNull()

  const cleanupIds: string[] = []
  let requestId: string | undefined
  let screenshotPath: string | undefined

  try {
    const assigned = await createTestUser(
      admin,
      url,
      publishableKey,
      cleanupIds,
    )
    const unassigned = await createTestUser(
      admin,
      url,
      publishableKey,
      cleanupIds,
    )

    const assignment = await admin.from("wm_website_members").insert({
      website_id: websiteId,
      user_id: assigned.userId,
    })

    expect(assignment.error).toBeNull()

    const created = await assigned.client
      .from("wm_requests")
      .insert({
        website_id: websiteId,
        kind: "bug",
        title: `Playwright QA ${randomUUID()}`,
        description: "Disposable request for access isolation.",
      })
      .select("id, submitted_by")
      .single()

    expect(created.error).toBeNull()
    requestId = created.data!.id
    expect(created.data!.submitted_by).toBe(assigned.userId)

    screenshotPath = `${requestId}/screenshot`
    const upload = await assigned.client.storage
      .from(screenshotBucket)
      .upload(screenshotPath, screenshot, { contentType: "image/png" })
    expect(upload.error).toBeNull()

    const allowed = await assigned.client.storage
      .from(screenshotBucket)
      .download(screenshotPath)
    expect(allowed.error).toBeNull()

    const hiddenRequest = await unassigned.client
      .from("wm_requests")
      .select("id")
      .eq("id", requestId)

    expect(hiddenRequest.error).toBeNull()
    expect(hiddenRequest.data).toEqual([])

    const hiddenScreenshot = await unassigned.client.storage
      .from(screenshotBucket)
      .download(screenshotPath)
    expect(hiddenScreenshot.error).toBeTruthy()

    const removed = await assigned.client.rpc("wm_remove_own_website_access")
    expect(removed.error).toBeNull()
    expect(removed.data).toBe(1)

    const revokedRequest = await assigned.client
      .from("wm_requests")
      .select("id")
      .eq("id", requestId)

    expect(revokedRequest.error).toBeNull()
    expect(revokedRequest.data).toEqual([])

    const revokedScreenshot = await assigned.client.storage
      .from(screenshotBucket)
      .download(screenshotPath)
    expect(revokedScreenshot.error).toBeTruthy()

    const account = await assigned.client.auth.getUser()
    expect(account.error).toBeNull()
    expect(account.data.user?.id).toBe(assigned.userId)

    const retainedRequest = await admin
      .from("wm_requests")
      .select("id")
      .eq("id", requestId)
      .single()
    expect(retainedRequest.error).toBeNull()

    const retainedScreenshot = await admin.storage
      .from(screenshotBucket)
      .download(screenshotPath)
    expect(retainedScreenshot.error).toBeNull()
  } finally {
    if (screenshotPath) {
      const { error } = await admin.storage
        .from(screenshotBucket)
        .remove([screenshotPath])
      expect.soft(error, "Clean up the QA screenshot").toBeNull()
    }

    if (requestId) {
      const { error } = await admin
        .from("wm_requests")
        .delete()
        .eq("id", requestId)
      expect.soft(error, "Clean up the QA request").toBeNull()
    }

    for (const userId of cleanupIds) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      expect.soft(error, "Clean up the QA user").toBeNull()
    }
  }
})
