import type { SupabaseClient } from "@supabase/supabase-js"

export type NotificationTargetInput = {
  event_type:
    | "release_live"
    | "monthly_recap"
    | "request_update"
    | "request_reply"
    | "request_received"
    | "request_created_admin"
    | "request_input_needed"
  website_id: string
  recipient_id: string
  release_id: string | null
  recap_id: string | null
  update_id: string | null
  request_id: string | null
  request_status: string | null
}

type NotificationContent = {
  subject: string
  text: string
  destination: URL
}

async function isManager(
  admin: SupabaseClient,
  notification: NotificationTargetInput,
) {
  const website = await admin
    .from("wm_websites")
    .select("organization_id")
    .eq("id", notification.website_id)
    .maybeSingle()

  if (website.error) throw new Error("Website lookup failed.")
  if (!website.data) return false

  const manager = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", website.data.organization_id)
    .eq("user_id", notification.recipient_id)
    .eq("status", "active")
    .in("role", ["owner", "admin"])
    .maybeSingle()

  if (manager.error) throw new Error("Manager lookup failed.")

  return Boolean(manager.data)
}

async function canReceive(
  admin: SupabaseClient,
  notification: NotificationTargetInput,
) {
  if (
    notification.event_type === "request_reply" ||
    notification.event_type === "request_created_admin"
  ) {
    return isManager(admin, notification)
  }

  const membership = await admin
    .from("wm_website_members")
    .select("user_id")
    .eq("website_id", notification.website_id)
    .eq("user_id", notification.recipient_id)
    .maybeSingle()

  if (membership.error) {
    throw new Error("Membership lookup failed.")
  }

  if (membership.data) return true

  // Managers can receive confirmation for their own submitted requests.
  if (notification.event_type === "request_received") {
    return isManager(admin, notification)
  }

  return false
}

export async function getNotificationTarget(
  admin: SupabaseClient,
  notification: NotificationTargetInput,
  portal: URL,
): Promise<NotificationContent | null> {
  if (!(await canReceive(admin, notification))) return null

  const destination = new URL("/", portal)

  if (notification.event_type === "release_live") {
    if (!notification.release_id) return null

    const { data: release, error } = await admin
      .from("wm_releases")
      .select("id, title, status, client_visible, published_at")
      .eq("id", notification.release_id)
      .eq("website_id", notification.website_id)
      .maybeSingle()

    if (error) throw new Error("Release lookup failed.")

    if (
      !release ||
      release.status !== "published" ||
      !release.client_visible ||
      !release.published_at ||
      Date.parse(release.published_at) > Date.now()
    ) {
      return null
    }

    destination.searchParams.set("releaseId", release.id)
    destination.hash = `release-${release.id}`

    return {
      subject: "TGS Website Manager — a website update is live",
      text: [
        "A new update has been published to your website.",
        "",
        release.title,
        "",
        "Sign in to read the completion summary and view any screenshot.",
      ].join("\n"),
      destination,
    }
  }

  if (notification.event_type === "monthly_recap") {
    if (!notification.recap_id) return null

    const { data: recap, error } = await admin
      .from("wm_monthly_recaps")
      .select("id, report_month, status, published_at")
      .eq("id", notification.recap_id)
      .eq("website_id", notification.website_id)
      .maybeSingle()

    if (error) throw new Error("Recap lookup failed.")

    if (
      !recap ||
      recap.status !== "published" ||
      !recap.published_at ||
      Date.parse(recap.published_at) > Date.now()
    ) {
      return null
    }

    const month = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${recap.report_month}T12:00:00Z`))

    destination.searchParams.set("recapId", recap.id)
    destination.hash = `recap-${recap.id}`

    return {
      subject: `TGS Website Manager — your ${month} recap`,
      text: `Your website maintenance recap for ${month} is ready. Sign in to see completed work, outstanding items, and website updates.`,
      destination,
    }
  }

  if (
    notification.event_type === "request_received" ||
    notification.event_type === "request_created_admin" ||
    notification.event_type === "request_input_needed"
  ) {
    if (!notification.request_id) return null

    const { data: ticket, error } = await admin
      .from("wm_requests")
      .select("id, title, submitted_by, status")
      .eq("id", notification.request_id)
      .eq("website_id", notification.website_id)
      .is("deleted_at", null)
      .is("purge_started_at", null)
      .maybeSingle()

    if (error) throw new Error("Request lookup failed.")
    if (!ticket) return null

    destination.searchParams.set("requestId", ticket.id)

    if (notification.event_type === "request_created_admin") {
      return {
        subject: "TGS Website Manager — new request",
        text: `A new website request is ready to review.\n\n${ticket.title}\n\nSign in to review the details.`,
        destination,
      }
    }

    if (ticket.submitted_by !== notification.recipient_id) {
      return null
    }

    if (notification.event_type === "request_received") {
      return {
        subject: "TGS Website Manager — request received",
        text: `We received your website request.\n\n${ticket.title}\n\nSign in to follow its progress or add a message.`,
        destination,
      }
    }

    // Do not send an outdated request for input.
    if (
      ticket.status !== notification.request_status ||
      !["waiting_on_client", "ready_for_review"].includes(ticket.status)
    ) {
      return null
    }

    return {
      subject: "TGS Website Manager — your input is needed",
      text:
        ticket.status === "ready_for_review"
          ? "Your website request is ready for review. Sign in to review the details and respond."
          : "We need your input on a website request. Sign in to read the latest details and respond.",
      destination,
    }
  }

  if (!notification.update_id) return null

  const message = await admin
    .from("wm_request_updates")
    .select("request_id")
    .eq("id", notification.update_id)
    .maybeSingle()

  if (message.error) throw new Error("Message lookup failed.")
  if (!message.data) return null

  const ticket = await admin
    .from("wm_requests")
    .select("id, submitted_by")
    .eq("id", message.data.request_id)
    .eq("website_id", notification.website_id)
    .is("deleted_at", null)
    .is("purge_started_at", null)
    .maybeSingle()

  if (ticket.error) throw new Error("Request lookup failed.")
  if (!ticket.data) return null

  if (
    notification.event_type === "request_update" &&
    ticket.data.submitted_by !== notification.recipient_id
  ) {
    return null
  }

  destination.searchParams.set("requestId", ticket.data.id)

  const reply = notification.event_type === "request_reply"

  return {
    subject: reply
      ? "TGS Website Manager — a client replied"
      : "TGS Website Manager — new message on your request",
    text: reply
      ? "A client posted a message on a website request. Sign in to read and respond."
      : "Third Generation Studios posted a message on your website request. Sign in to read it.",
    destination,
  }
}
