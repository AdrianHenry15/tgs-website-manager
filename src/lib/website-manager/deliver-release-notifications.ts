import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getNotificationTarget,
  type NotificationTargetInput,
} from "./notification-target"

type Notification = NotificationTargetInput & {
  id: string
  recipient_id: string
  actor_id: string | null
  attempts: number
  claim_token: string
  request_body: string | null
  recipient_email: string | null
  first_attempt_at: string | null
}

type Outcome = "accepted" | "skipped" | "retried" | "failed"

class DeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code)
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export async function deliverReleaseNotifications(
  admin: SupabaseClient,
  releaseId: string | null = null,
) {
  const enabled = process.env.WM_NOTIFICATION_DELIVERY_ENABLED === "true"

  const summary = {
    enabled,
    claimed: 0,
    accepted: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    unconfirmed: 0,
  }

  if (!enabled) return summary

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.WM_REQUEST_EMAIL_FROM?.trim()
  const portalUrl = process.env.WM_PORTAL_URL?.trim()
  const testTo = process.env.WM_REQUEST_EMAIL_TEST_TO?.trim()

  if (!apiKey || !from || !portalUrl) {
    throw new Error("Notification email configuration is incomplete.")
  }

  const portal = new URL(portalUrl)

  if (!["http:", "https:"].includes(portal.protocol)) {
    throw new Error("Notification portal URL is invalid.")
  }

  const { data, error } = await admin.rpc(
    "wm_claim_release_notifications_scoped",
    {
      p_limit: 5,
      p_release_id: releaseId,
    },
  )

  if (error) {
    throw new Error("Could not claim notifications.")
  }

  const notifications = (data ?? []) as Notification[]
  summary.claimed = notifications.length

  async function finish(
    notification: Notification,
    status: "pending" | "accepted" | "skipped" | "failed",
    code: string | null = null,
    providerId: string | null = null,
  ) {
    const now = new Date()

    const delaySeconds = Math.min(
      3600,
      60 * 2 ** Math.max(0, notification.attempts - 1),
    )

    const { data: saved, error: saveError } = await admin
      .from("wm_notification_outbox")
      .update({
        status,
        claim_token: null,
        locked_until: null,
        last_error_code: code,
        provider_message_id: providerId,
        accepted_at: status === "accepted" ? now.toISOString() : null,
        available_at:
          status === "pending"
            ? new Date(now.getTime() + delaySeconds * 1000).toISOString()
            : now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", notification.id)
      .eq("status", "processing")
      .eq("claim_token", notification.claim_token)
      .select("id")
      .maybeSingle()

    if (saveError || !saved) {
      throw new Error("Could not confirm notification state.")
    }
  }

  async function deliver(notification: Notification): Promise<Outcome> {
    if (notification.actor_id === notification.recipient_id) {
      await finish(notification, "skipped", "self_notification")
      return "skipped"
    }

    const [content, userResult] = await Promise.all([
      getNotificationTarget(admin, notification, portal),
      admin.auth.admin.getUserById(notification.recipient_id),
    ])

    if (userResult.error) {
      throw new DeliveryError("recipient_lookup_failed", true)
    }

    const recipient = userResult.data.user

    if (!content || !recipient?.email) {
      await finish(notification, "skipped", "recipient_or_target_unavailable")
      return "skipped"
    }

    const recipientEmail = normalizeEmail(recipient.email)

    if (
      notification.recipient_email &&
      notification.recipient_email !== recipientEmail
    ) {
      await finish(notification, "skipped", "recipient_email_changed")
      return "skipped"
    }

    let requestBody = notification.request_body
    let firstAttemptAt = notification.first_attempt_at

    if (!requestBody) {
      requestBody = JSON.stringify({
        from,
        to: [testTo || recipient.email],
        subject: content.subject,
        text: `${content.text}\n\nView details: ${content.destination.href}`,
      })

      firstAttemptAt = new Date().toISOString()

      const { data: snapshot, error: snapshotError } = await admin
        .from("wm_notification_outbox")
        .update({
          request_body: requestBody,
          recipient_email: recipientEmail,
          first_attempt_at: firstAttemptAt,
          updated_at: firstAttemptAt,
        })
        .eq("id", notification.id)
        .eq("status", "processing")
        .eq("claim_token", notification.claim_token)
        .select("id")
        .maybeSingle()

      if (snapshotError || !snapshot) {
        throw new DeliveryError("payload_snapshot_failed", true)
      }
    }

    const frozen = JSON.parse(requestBody) as { to?: unknown }
    const expectedDestination = normalizeEmail(testTo || recipient.email)

    if (
      !Array.isArray(frozen.to) ||
      frozen.to.length !== 1 ||
      typeof frozen.to[0] !== "string" ||
      normalizeEmail(frozen.to[0]) !== expectedDestination
    ) {
      await finish(notification, "skipped", "delivery_destination_changed")
      return "skipped"
    }

    const firstAttemptTime = Date.parse(firstAttemptAt ?? "")

    if (
      !Number.isFinite(firstAttemptTime) ||
      Date.now() - firstAttemptTime >= 23 * 60 * 60 * 1000
    ) {
      await finish(notification, "failed", "retry_window_expired")
      return "failed"
    }

    let response: Response

    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `wm-notification/${notification.id}`,
        },
        body: requestBody,
        signal: AbortSignal.timeout(7000),
      })
    } catch {
      throw new DeliveryError("resend_network_error", true)
    }

    const result = (await response.json().catch(() => null)) as {
      id?: string
      name?: string
    } | null

    if (!response.ok) {
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 &&
          result?.name === "concurrent_idempotent_requests")

      throw new DeliveryError(`resend_http_${response.status}`, retryable)
    }

    if (!result?.id || typeof result.id !== "string") {
      throw new DeliveryError("resend_response_unconfirmed", true)
    }

    await finish(notification, "accepted", null, result.id)
    return "accepted"
  }

  for (const notification of notifications) {
    try {
      const outcome = await deliver(notification)
      summary[outcome] += 1
    } catch (caught) {
      const retryable = !(caught instanceof DeliveryError) || caught.retryable

      const status =
        retryable && notification.attempts < 5 ? "pending" : "failed"

      try {
        await finish(
          notification,
          status,
          caught instanceof DeliveryError
            ? caught.code
            : "delivery_state_unconfirmed",
        )

        if (status === "pending") summary.retried += 1
        else summary.failed += 1
      } catch {
        summary.unconfirmed += 1
      }
    }
  }

  return summary
}
