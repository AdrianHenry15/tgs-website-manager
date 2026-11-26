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

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()

  if (!secret || secret.length < 32) {
    return Response.json(
      { error: "Notification automation is not configured." },
      { status: 503, headers },
    )
  }

  const authorization = request.headers.get("authorization") ?? ""

  if (!matchesSecret(authorization, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers })
  }

  if (process.env.WM_NOTIFICATION_DELIVERY_ENABLED !== "true") {
    return Response.json({ notifications: { enabled: false } }, { headers })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !key) {
    return Response.json(
      { error: "Notification database is not configured." },
      { status: 503, headers },
    )
  }

  try {
    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const notifications = await deliverReleaseNotifications(admin)

    console.info("Release notification worker completed", notifications)

    return Response.json(
      { notifications },
      {
        status: notifications.unconfirmed > 0 ? 503 : 200,
        headers,
      },
    )
  } catch {
    console.error("Release notification worker failed.")

    return Response.json(
      { error: "Could not process release notifications." },
      { status: 503, headers },
    )
  }
}
