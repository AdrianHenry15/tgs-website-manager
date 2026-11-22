import { createHash, timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const headers = {
  "Cache-Control": "private, no-store",
}

function matchesSecret(received: string, expected: string) {
  const receivedHash = createHash("sha256").update(received).digest()
  const expectedHash = createHash("sha256").update(expected).digest()

  return timingSafeEqual(receivedHash, expectedHash)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()

  if (!secret || secret.length < 32) {
    console.error("Maintenance automation: CRON_SECRET is not configured.")

    return Response.json(
      { error: "Maintenance automation is not configured." },
      { status: 503, headers },
    )
  }

  const authorization = request.headers.get("authorization") ?? ""

  if (!matchesSecret(authorization, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers })
  }

  if (process.env.WM_MAINTENANCE_AUTOMATION_ENABLED !== "true") {
    return Response.json({ enabled: false, generated: 0 }, { headers })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseKey =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !supabaseKey) {
    console.error("Maintenance automation: Supabase is not configured.")

    return Response.json(
      { error: "Maintenance automation is not configured." },
      { status: 503, headers },
    )
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    // The database determines each organization's current month.
    // No caller-supplied month or website is accepted.
    const { data, error } = await supabase.rpc("wm_generate_maintenance_month")

    if (error) {
      console.error("Maintenance generation failed:", {
        code: error.code,
        message: error.message,
      })

      return Response.json(
        { error: "Could not generate monthly maintenance." },
        { status: 500, headers },
      )
    }

    if (!Number.isInteger(data) || data < 0) {
      throw new Error("Unexpected maintenance generation result.")
    }

    console.info("Maintenance generation completed:", {
      generated: data,
    })

    return Response.json(
      {
        enabled: true,
        generated: data,
        checkedAt: new Date().toISOString(),
      },
      { headers },
    )
  } catch (error) {
    console.error(
      "Maintenance automation failed:",
      error instanceof Error ? error.message : "Unknown error",
    )

    return Response.json(
      { error: "Maintenance automation failed." },
      { status: 500, headers },
    )
  }
}
