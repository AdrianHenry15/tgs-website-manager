import { supabase } from "@/lib/supabase"

type DeliverySummary = {
  enabled: boolean
  claimed?: number
  accepted?: number
  skipped?: number
  retried?: number
  failed?: number
  unconfirmed?: number
}

export async function requestReleaseDelivery(
  releaseId: string,
): Promise<string> {
  const fallback =
    "Update published. Email delivery could not be confirmed; check the notification queue before retrying."

  try {
    const { data, error } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (error || !token) return fallback

    const response = await fetch("/api/releases/notify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ releaseId }),
    })

    if (!response.ok) return fallback

    const result = (await response.json()) as {
      notifications?: DeliverySummary
    }

    const notifications = result.notifications

    if (!notifications) return fallback

    if (!notifications.enabled) {
      return "Update published. Email sending is currently disabled."
    }

    if (
      (notifications.failed ?? 0) > 0 ||
      (notifications.unconfirmed ?? 0) > 0
    ) {
      return "Update published. Some notifications need attention in the delivery queue."
    }

    if ((notifications.retried ?? 0) > 0) {
      return "Update published. Some notifications are queued for another delivery attempt."
    }

    if ((notifications.accepted ?? 0) > 0) {
      return "Update published. Client notifications were accepted by the email service."
    }

    return "Update published. No new notifications were sent in this delivery attempt."
  } catch {
    return fallback
  }
}
