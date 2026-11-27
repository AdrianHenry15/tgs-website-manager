import { createHash, timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { deliverReleaseNotifications } from "@/lib/website-manager/deliver-release-notifications"

const headers = {
  "Cache-Control": "private, no-store",
}

function matchesSecret(received: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(received).digest(),
    createHash("sha256").update(expected).digest(),
  )
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()

  if (!secret || secret.length < 32) {
    return Response.json(
      { error: "Automation is not configured." },
      { status: 503, headers },
    )
  }

  const authorization = request.headers.get("authorization") ?? ""

  if (!matchesSecret(authorization, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers })
  }

  const maintenanceEnabled =
    process.env.WM_MAINTENANCE_AUTOMATION_ENABLED === "true"

  const recapAutoPublishEnabled =
    process.env.WM_RECAP_AUTO_PUBLISH_ENABLED === "true"

  const deliveryEnabled =
    process.env.WM_NOTIFICATION_DELIVERY_ENABLED === "true"

  if (!maintenanceEnabled && !recapAutoPublishEnabled && !deliveryEnabled) {
    return Response.json(
      {
        enabled: false,
        generated: 0,
        recapsGenerated: 0,
        recapsPublished: 0,
        notifications: { enabled: false },
      },
      { headers },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    return Response.json(
      { error: "Automation database is not configured." },
      { status: 503, headers },
    )
  }

  const admin = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  let generated = 0
  let recapsGenerated = 0
  let recapsPublished = 0

  let maintenanceFailed = false
  let recapsFailed = false

  if (maintenanceEnabled) {
    try {
      const { data, error } = await admin.rpc("wm_generate_maintenance_month")

      if (error || !validCount(data)) {
        throw new Error("Invalid generation result.")
      }

      generated = data
    } catch {
      maintenanceFailed = true
      console.error("Monthly maintenance generation failed.")
    }
  }

  if (maintenanceEnabled || recapAutoPublishEnabled) {
    try {
      const generation = await admin.rpc("wm_generate_monthly_recaps")

      if (generation.error || !validCount(generation.data)) {
        throw new Error("Invalid recap generation result.")
      }

      recapsGenerated = generation.data

      if (recapAutoPublishEnabled) {
        const publication = await admin.rpc("wm_auto_publish_monthly_recaps")

        if (publication.error || !validCount(publication.data)) {
          throw new Error("Invalid recap publication result.")
        }

        recapsPublished = publication.data
      }
    } catch {
      recapsFailed = true
      console.error("Monthly recap processing failed.")
    }
  }

  try {
    const notifications = await deliverReleaseNotifications(admin)

    const result = {
      enabled: true,
      generated,
      recapsGenerated,
      recapsPublished,
      maintenanceFailed,
      recapsFailed,

      notifications,
      checkedAt: new Date().toISOString(),
    }

    console.info("Website Manager automation completed", result)

    return Response.json(result, {
      status:
        maintenanceFailed || recapsFailed || notifications.unconfirmed > 0
          ? 500
          : 200,
      headers,
    })
  } catch {
    console.error("Notification processing failed.")

    return Response.json(
      {
        error: "Notification processing failed.",
        generated,
        recapsGenerated,
        recapsPublished,
        maintenanceFailed,
        recapsFailed,
      },
      { status: 500, headers },
    )
  }
}
