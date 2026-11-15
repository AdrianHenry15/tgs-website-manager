import {
  RequestEmailStatus,
  sendRequestUpdateEmail,
} from "@/components/website-manager/requests/request-email"
import { createClient } from "@supabase/supabase-js"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json(
      { error: "Sign in again to post an update." },
      { status: 401 },
    )
  }

  const payload = (await request.json().catch(() => null)) as {
    requestId?: unknown
    body?: unknown
  } | null

  const requestId = payload?.requestId
  const body = typeof payload?.body === "string" ? payload.body.trim() : ""

  if (
    typeof requestId !== "string" ||
    !uuidPattern.test(requestId) ||
    !body ||
    body.length > 5000
  ) {
    return Response.json(
      {
        error:
          "Choose a request and enter an update of up to 5,000 characters.",
      },
      { status: 400 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: serverAuthOptions,
    },
  )

  const { data: auth, error: authError } = await supabase.auth.getUser(token)

  if (authError || !auth.user) {
    return Response.json(
      { error: "Sign in again to post an update." },
      { status: 401 },
    )
  }

  const [ticketResult, managedResult] = await Promise.all([
    supabase
      .from("wm_requests")
      .select("website_id, submitted_by")
      .eq("id", requestId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.rpc("wm_managed_website_ids"),
  ])

  if (ticketResult.error || managedResult.error) {
    console.error("Could not check request update permissions", {
      requestId,
      ticketCode: ticketResult.error?.code,
      managedCode: managedResult.error?.code,
    })
    return Response.json(
      { error: "Could not check access to this request. Try again." },
      { status: 500 },
    )
  }

  const ticket = ticketResult.data
  const managedWebsites = (managedResult.data ?? []) as { website_id: string }[]

  if (
    !ticket ||
    !managedWebsites.some(({ website_id }) => website_id === ticket.website_id)
  ) {
    return Response.json(
      { error: "You don’t have access to post updates on this request." },
      { status: 403 },
    )
  }

  const { data: update, error: saveError } = await supabase
    .from("wm_request_updates")
    .insert({ request_id: requestId, body })
    .select("id, body, created_at")
    .single()

  if (saveError || !update) {
    console.error("Could not save request update", {
      requestId,
      code: saveError?.code,
    })
    return Response.json(
      { error: "Could not confirm the save. Reopen updates before retrying." },
      { status: saveError?.code === "42501" ? 403 : 500 },
    )
  }

  const emailStatus =
    ticket.submitted_by && ticket.submitted_by !== auth.user.id
      ? await notifyRequester(ticket.submitted_by, ticket.website_id, update.id)
      : "skipped"

  return Response.json({ update, emailStatus }, { status: 201 })
}

async function notifyRequester(
  requesterId: string,
  websiteId: string,
  updateId: string,
): Promise<RequestEmailStatus | "skipped"> {
  const secretKey = process.env.WM_SUPABASE_SECRET_KEY

  if (!secretKey) {
    console.error("Request update email requires WM_SUPABASE_SECRET_KEY", {
      updateId,
    })
    return "unconfirmed"
  }

  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey,
      { auth: serverAuthOptions },
    )

    const { data: membership, error: membershipError } = await admin
      .from("wm_website_members")
      .select("user_id")
      .eq("website_id", websiteId)
      .eq("user_id", requesterId)
      .maybeSingle()

    if (membershipError) {
      console.error("Could not verify requester’s website assignment", {
        updateId,
        code: membershipError.code,
      })
      return "unconfirmed"
    }

    if (!membership) return "skipped"

    const { data, error } = await admin.auth.admin.getUserById(requesterId)

    if (error) {
      console.error("Could not look up request update recipient", {
        updateId,
        status: error.status,
      })
      return "unconfirmed"
    }

    if (!data.user?.email) return "skipped"

    return await sendRequestUpdateEmail({
      updateId,
      clientEmail: data.user.email,
    })
  } catch {
    console.error("Could not confirm request update notification", { updateId })
    return "unconfirmed"
  }
}
