import { createClient } from "@supabase/supabase-js"
import {
  normalizeNotificationEmail,
  shouldEmailRequestStatus,
} from "@/lib/website-manager/notification-policy"

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

export type RequestEmailStatus =
  | "accepted"
  | "disabled"
  | "unconfirmed"
  | "skipped"

export async function sendRequestEmails({
  requestId,
  title,
  websiteName,
  clientEmail,
}: RequestEmailInput): Promise<RequestEmailStatus> {
  const adminEmail = process.env.WM_REQUEST_EMAIL_ADMIN?.trim()

  const details = [
    `Website: ${websiteName}`,
    `Request: ${title}`,
    `Reference: ${requestId}`,
  ].join("\n")

  const messages: EmailMessage[] = []

  if (clientEmail.trim()) {
    messages.push({
      to: clientEmail,
      subject: "TGS Website Manager — request received",
      text: `We received your website request.\n\n${details}`,
    })
  }

  // The requester already receives a confirmation.
  // Avoid another email when that same person is the admin.
  if (
    adminEmail &&
    normalizeNotificationEmail(adminEmail) !==
      normalizeNotificationEmail(clientEmail)
  ) {
    messages.push({
      to: adminEmail,
      subject: "TGS Website Manager — new request",
      text: `A new website request is ready to review.\n\n${details}`,
    })
  }

  return sendEmailBatch(`wm-request-created/${requestId}`, messages, requestId)
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
  // Posting a message is an intentional communication.
  // Editing request fields does not call this function.
  return sendEmailBatch(
    `wm-request-updated/${updateId}`,
    [
      {
        to: clientEmail,
        subject: "TGS Website Manager — new message on your request",
        text:
          "Third Generation Studios posted a message on your website request. " +
          "Sign in to Website Manager to read it.",
      },
    ],
    requestId,
  )
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
  if (!shouldEmailRequestStatus(statusLabel)) {
    return "skipped"
  }

  const isLive = statusLabel === "Live"

  return sendEmailBatch(
    `wm-request-status/${changeId}`,
    [
      {
        to: clientEmail,
        subject: isLive
          ? "TGS Website Manager — your request is live"
          : "TGS Website Manager — your input is needed",
        text: isLive
          ? "Your website request has been marked Live. Sign in to review the details."
          : `Your website request is marked "${statusLabel}". Sign in to review it and respond.`,
      },
    ],
    requestId,
  )
}

async function sendEmailBatch(
  idempotencyKey: string,
  messages: EmailMessage[],
  requestId: string,
): Promise<RequestEmailStatus> {
  // Deduplicate actual recipients before applying the test override.
  const recipients = new Set<string>()

  const uniqueMessages = messages.filter(({ to }) => {
    const normalized = normalizeNotificationEmail(to)

    if (!normalized || recipients.has(normalized)) return false

    recipients.add(normalized)
    return true
  })

  if (uniqueMessages.length === 0) return "skipped"

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.WM_REQUEST_EMAIL_FROM?.trim()
  const portalUrl = process.env.WM_PORTAL_URL?.trim()
  const testTo = process.env.WM_REQUEST_EMAIL_TEST_TO?.trim()

  if (!apiKey || !from || !portalUrl) return "disabled"

  try {
    const destination = new URL("/", portalUrl)

    if (destination.protocol !== "http:" && destination.protocol !== "https:") {
      return "disabled"
    }

    destination.searchParams.set("requestId", requestId)

    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(
        uniqueMessages.map(({ to, subject, text }) => ({
          from,
          to: [testTo || to.trim()],
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
      result.data.length !== uniqueMessages.length ||
      result.data.some(
        (message) => typeof message.id !== "string" || !message.id,
      )
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
        ? (error.cause as { code?: string; hostname?: string } | undefined)
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
}): Promise<RequestEmailStatus> {
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
    console.error("Could not confirm request notification", {
      websiteId,
    })

    return "unconfirmed"
  }
}
