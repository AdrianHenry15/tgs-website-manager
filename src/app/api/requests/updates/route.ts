import { createClient } from "@supabase/supabase-js"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const headers = {
  "Cache-Control": "private, no-store",
}

export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json(
      { error: "Sign in again to post a message." },
      { status: 401, headers },
    )
  }

  const payload = (await request.json().catch(() => null)) as {
    requestId?: unknown
    messageId?: unknown
    body?: unknown
  } | null

  const requestId = payload?.requestId
  const messageId = payload?.messageId
  const body = typeof payload?.body === "string" ? payload.body.trim() : ""

  if (
    typeof requestId !== "string" ||
    !uuidPattern.test(requestId) ||
    typeof messageId !== "string" ||
    !uuidPattern.test(messageId) ||
    !body ||
    body.length > 5000
  ) {
    return Response.json(
      { error: "Choose a request and enter up to 5,000 characters." },
      { status: 400, headers },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !key) {
    return Response.json(
      { error: "Messaging is unavailable." },
      { status: 503, headers },
    )
  }

  try {
    const viewer = createClient(url, key, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data: auth, error: authError } = await viewer.auth.getUser(token)

    if (authError || !auth.user) {
      return Response.json(
        { error: "Sign in again to post a message." },
        { status: 401, headers },
      )
    }

    const { data, error } = await viewer.rpc("wm_post_request_message", {
      p_request_id: requestId,
      p_message_id: messageId,
      p_body: body,
    })

    if (error) {
      const status =
        error.code === "42501"
          ? 403
          : error.code === "22023"
            ? 400
            : error.code === "40001"
              ? 409
              : 500

      return Response.json(
        {
          error:
            status === 403
              ? "This request is unavailable to your account."
              : status === 409
                ? "This message conflicts with an existing message. Refresh the conversation."
                : "Could not confirm the save. Retry the same message.",
        },
        { status, headers },
      )
    }

    if (!data?.update) {
      return Response.json(
        { error: "Could not confirm the save. Retry the same message." },
        { status: 500, headers },
      )
    }

    return Response.json(
      {
        update: data.update,
        emailStatus: "queued",
      },
      {
        status: data.created ? 201 : 200,
        headers,
      },
    )
  } catch {
    return Response.json(
      { error: "Could not confirm the save. Retry the same message." },
      { status: 500, headers },
    )
  }
}
