import { createClient } from "@supabase/supabase-js"
import { deliverReleaseNotifications } from "@/lib/website-manager/deliver-release-notifications"

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

export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json({ error: "Sign in again." }, { status: 401, headers })
  }

  const payload = (await request.json().catch(() => null)) as {
    releaseId?: unknown
  } | null

  const releaseId = payload?.releaseId

  if (typeof releaseId !== "string" || !uuidPattern.test(releaseId)) {
    return Response.json(
      { error: "Choose a valid release." },
      { status: 400, headers },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !publishableKey) {
    return Response.json(
      { error: "Notification service is unavailable." },
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

    const [releaseResult, managedResult] = await Promise.all([
      viewer
        .from("wm_releases")
        .select("id, website_id, status, client_visible")
        .eq("id", releaseId)
        .maybeSingle(),

      viewer.rpc("wm_managed_website_ids"),
    ])

    if (releaseResult.error || managedResult.error) {
      return Response.json(
        { error: "Could not check release access." },
        { status: 500, headers },
      )
    }

    const release = releaseResult.data
    const managed = (managedResult.data ?? []) as {
      website_id: string
    }[]

    if (
      !release ||
      !managed.some(({ website_id }) => website_id === release.website_id)
    ) {
      return Response.json(
        { error: "You cannot manage this release." },
        { status: 403, headers },
      )
    }

    if (release.status !== "published" || !release.client_visible) {
      return Response.json(
        { error: "Publish a client-visible release first." },
        { status: 409, headers },
      )
    }

    // Leave the database queue intact while sending is disabled.
    if (process.env.WM_NOTIFICATION_DELIVERY_ENABLED !== "true") {
      return Response.json({ notifications: { enabled: false } }, { headers })
    }

    const secretKey =
      process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!secretKey) {
      return Response.json(
        { error: "Notification service is unavailable." },
        { status: 503, headers },
      )
    }

    const admin = createClient(url, secretKey, {
      auth: authOptions,
    })

    const notifications = await deliverReleaseNotifications(admin, release.id)

    return Response.json(
      { notifications },
      {
        status: notifications.unconfirmed > 0 ? 503 : 200,
        headers,
      },
    )
  } catch {
    console.error("Could not process release notifications.")

    return Response.json(
      { error: "Could not confirm notification processing." },
      { status: 503, headers },
    )
  }
}
