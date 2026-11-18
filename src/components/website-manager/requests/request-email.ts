import { createClient } from "@supabase/supabase-js"

type RequestEmailInput = {
  requestId: string
  title: string
  websiteName: string
  clientEmail: string
}

type EmailMessage = {
  to: string
  subject: string
  text: string
}

export type RequestEmailStatus = "accepted" | "disabled" | "unconfirmed"

export async function sendRequestEmails({
  requestId,
  title,
  websiteName,
  clientEmail,
}: RequestEmailInput): Promise<RequestEmailStatus> {
  const adminEmail =
    process.env.WM_REQUEST_EMAIL_TEST_TO?.trim() ||
    process.env.WM_REQUEST_EMAIL_ADMIN?.trim()

  if (!adminEmail) return "disabled"

  const details = [
    `Website: ${websiteName}`,
    `Request: ${title}`,
    `Reference: ${requestId}`,
  ].join("\n")

  return sendEmailBatch(
    `wm-request-created/${requestId}`,
    [
      {
        to: clientEmail,
        subject: "TGS Website Manager — request received",
        text: `We received your website request.\n\n${details}`,
      },
      {
        to: adminEmail,
        subject: "TGS Website Manager — new request",
        text: `A new website request is ready to review.\n\n${details}`,
      },
    ],
    requestId,
  )
}

export async function sendRequestUpdateEmail({
  requestId,
  updateId,
  clientEmail,
}: {
  requestId: string
  updateId: string
  clientEmail: string
}): Promise<RequestEmailStatus> {
  return sendEmailBatch(
    `wm-request-updated/${updateId}`,
    [
      {
        to: clientEmail,
        subject: "TGS Website Manager — update on your request",
        text: "Third Generation Studios posted an update on your website request. Sign in to Website Manager to read it.",
      },
    ],
    requestId,
  )
}

async function sendEmailBatch(
  idempotencyKey: string,
  messages: EmailMessage[],
  requestId?: string,
): Promise<RequestEmailStatus> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.WM_REQUEST_EMAIL_FROM
  const portalUrl = process.env.WM_PORTAL_URL
  const testTo = process.env.WM_REQUEST_EMAIL_TEST_TO?.trim()

  if (!apiKey || !from || !portalUrl) return "disabled"

  try {
    const destination = new URL("/", portalUrl)

    if (requestId) {
      destination.searchParams.set("requestId", requestId)
    }

    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(
        messages.map(({ to, subject, text }) => ({
          from,
          to: [testTo || to],
          subject,
          text: `${text}\n\nOpen request: ${destination.href}`,
        })),
      ),
      signal: AbortSignal.timeout(7000),
    })

    if (!response.ok) {
      console.error("Website Manager email rejected", {
        idempotencyKey,
        status: response.status,
      })
      return "unconfirmed"
    }

    const result = (await response.json()) as {
      data?: Array<{ id?: string }>
    }

    if (
      !Array.isArray(result.data) ||
      result.data.length !== messages.length ||
      result.data.some((message) => !message.id)
    ) {
      console.error("Website Manager email response incomplete", {
        idempotencyKey,
      })
      return "unconfirmed"
    }

    return "accepted"
  } catch (error) {
    const cause =
      error instanceof Error && "cause" in error
        ? (error.cause as
            | {
                code?: string
                hostname?: string
              }
            | undefined)
        : undefined

    console.error("Could not confirm Website Manager email", {
      idempotencyKey,
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: cause?.code,
      hostname: cause?.hostname,
    })

    return "unconfirmed"
  }
}

export async function sendRequestStatusEmail({
  requestId,
  changeId,
  clientEmail,
  statusLabel,
}: {
  requestId: string
  changeId: string
  clientEmail: string
  statusLabel: string
}): Promise<RequestEmailStatus> {
  return sendEmailBatch(
    `wm-request-status/${changeId}`,
    [
      {
        to: clientEmail,
        subject: "TGS Website Manager — request status changed",
        text: `Your website request is now marked "${statusLabel}". Sign in to Website Manager to review it.`,
      },
    ],
    requestId,
  )
}

export async function notifyRequestClient({
  requesterId,
  websiteId,
  actorId,
  send,
}: {
  requesterId: string | null
  websiteId: string
  actorId: string
  send: (email: string) => Promise<RequestEmailStatus>
}): Promise<RequestEmailStatus | "skipped"> {
  if (!requesterId || requesterId === actorId) return "skipped"

  const secretKey =
    process.env.WM_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  if (!secretKey || !url) return "unconfirmed"

  try {
    const admin = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data: membership, error: membershipError } = await admin
      .from("wm_website_members")
      .select("user_id")
      .eq("website_id", websiteId)
      .eq("user_id", requesterId)
      .maybeSingle()

    if (membershipError) {
      console.error("Could not check notification recipient access", {
        websiteId,
        code: membershipError.code,
      })
      return "unconfirmed"
    }

    if (!membership) return "skipped"

    const { data, error } = await admin.auth.admin.getUserById(requesterId)

    if (error) {
      console.error("Could not resolve notification recipient", {
        status: error.status,
      })
      return "unconfirmed"
    }

    if (!data.user?.email) return "skipped"

    return await send(data.user.email)
  } catch {
    console.error("Could not confirm request notification", { websiteId })
    return "unconfirmed"
  }
}
