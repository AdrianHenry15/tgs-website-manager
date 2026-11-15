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

  return sendEmailBatch(`wm-request-created/${requestId}`, [
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
  ])
}

export async function sendRequestUpdateEmail({
  updateId,
  clientEmail,
}: {
  updateId: string
  clientEmail: string
}): Promise<RequestEmailStatus> {
  return sendEmailBatch(`wm-request-updated/${updateId}`, [
    {
      to: clientEmail,
      subject: "TGS Website Manager — update on your request",
      text: "Third Generation Studios posted an update on your website request. Sign in to Website Manager to read it.",
    },
  ])
}

async function sendEmailBatch(
  idempotencyKey: string,
  messages: EmailMessage[],
): Promise<RequestEmailStatus> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.WM_REQUEST_EMAIL_FROM
  const portalUrl = process.env.WM_PORTAL_URL
  const testTo = process.env.WM_REQUEST_EMAIL_TEST_TO?.trim()

  if (!apiKey || !from || !portalUrl) return "disabled"

  try {
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
          text: `${text}\n\nOpen Website Manager: ${portalUrl}`,
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
  } catch {
    console.error("Could not confirm Website Manager email", { idempotencyKey })
    return "unconfirmed"
  }
}
