import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { requestColumns } from "@/components/website-manager/requests/request-columns"
import {
  notifyRequestClient,
  sendRequestStatusEmail,
} from "@/components/website-manager/requests/request-email"

const statusLabels = {
  received: "Received",
  in_progress: "In progress",
  waiting_on_client: "Waiting on client",
  ready_for_review: "Ready for review",
  scheduled: "Scheduled",
  live: "Live",
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json(
      { error: "Sign in again to change a request status." },
      { status: 401 },
    )
  }

  const payload = (await request.json().catch(() => null)) as {
    requestId?: unknown
    status?: unknown
    expectedStatus?: unknown
  } | null

  const requestId = payload?.requestId
  const status = payload?.status
  const expectedStatus = payload?.expectedStatus

  if (
    typeof requestId !== "string" ||
    !uuidPattern.test(requestId) ||
    typeof status !== "string" ||
    !Object.hasOwn(statusLabels, status) ||
    typeof expectedStatus !== "string" ||
    !Object.hasOwn(statusLabels, expectedStatus)
  ) {
    return Response.json(
      { error: "Choose a valid request and status." },
      { status: 400 },
    )
  }

  const viewer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )

  const { data: auth, error: authError } = await viewer.auth.getUser(token)

  if (authError || !auth.user) {
    return Response.json(
      { error: "Sign in again to change a request status." },
      { status: 401 },
    )
  }

  const [ticketResult, managedResult] = await Promise.all([
    viewer
      .from("wm_requests")
      .select(requestColumns)
      .eq("id", requestId)
      .is("deleted_at", null)
      .maybeSingle(),
    viewer.rpc("wm_managed_website_ids"),
  ])

  if (ticketResult.error || managedResult.error) {
    return Response.json(
      { error: "Could not check request access. Try again." },
      { status: 500 },
    )
  }

  const ticket = ticketResult.data
  const managedWebsites = (managedResult.data ?? []) as {
    website_id: string
  }[]

  if (
    !ticket ||
    !managedWebsites.some(({ website_id }) => website_id === ticket.website_id)
  ) {
    return Response.json(
      { error: "You don’t have access to change this request’s status." },
      { status: 403 },
    )
  }

  if (ticket.status !== expectedStatus) {
    return Response.json(
      { error: "This request changed. Refresh before updating its status." },
      { status: 409 },
    )
  }

  if (ticket.status === status) {
    return Response.json({ request: ticket, emailStatus: "skipped" })
  }

  const { data: updated, error: updateError } = await viewer
    .from("wm_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("status", expectedStatus)
    .is("deleted_at", null)
    .select(requestColumns)
    .maybeSingle()

  if (updateError) {
    console.error("Could not update request status", {
      requestId,
      code: updateError.code,
    })

    return Response.json(
      { error: "Could not confirm the status change. Refresh to check it." },
      { status: 500 },
    )
  }

  if (!updated) {
    return Response.json(
      { error: "This request changed. Refresh before updating its status." },
      { status: 409 },
    )
  }

  const statusLabel = statusLabels[status as keyof typeof statusLabels]

  const emailStatus = await notifyRequestClient({
    requesterId: updated.submitted_by,
    websiteId: updated.website_id,
    actorId: auth.user.id,
    send: (clientEmail) =>
      sendRequestStatusEmail({
        requestId,
        changeId: randomUUID(),
        clientEmail,
        statusLabel,
      }),
  })

  return Response.json({ request: updated, emailStatus })
}
