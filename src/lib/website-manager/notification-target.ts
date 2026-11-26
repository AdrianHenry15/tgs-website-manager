import type { SupabaseClient } from "@supabase/supabase-js"

export type NotificationTargetInput = {
  event_type:
    | "release_live"
    | "monthly_recap"
    | "request_update"
    | "request_reply"
  website_id: string
  recipient_id: string
  release_id: string | null
  recap_id: string | null
  update_id: string | null
}

type NotificationContent = {
  subject: string
  text: string
  destination: URL
}

async function canReceive(
  admin: SupabaseClient,
  notification: NotificationTargetInput,
) {
  if (notification.event_type === "request_reply") {
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

  const membership = await admin
    .from("wm_website_members")
    .select("user_id")
    .eq("website_id", notification.website_id)
    .eq("user_id", notification.recipient_id)
    .maybeSingle()

  if (membership.error) throw new Error("Membership lookup failed.")

  return Boolean(membership.data)
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
