import "server-only"

import { createClient } from "@supabase/supabase-js"

export async function getRequestViewer(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json(
      { error: "Sign in again to manage requests." },
      { status: 401 },
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !key) {
    return Response.json(
      { error: "Request management is not configured." },
      { status: 503 },
    )
  }

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

  const { data, error } = await viewer.auth.getUser(token)

  if (error || !data.user) {
    return Response.json(
      { error: "Sign in again to manage requests." },
      { status: 401 },
    )
  }

  return viewer
}

export function requestActionError(error: { code?: string; message: string }) {
  const status =
    error.code === "42501"
      ? 403
      : error.code === "22023"
        ? 400
        : error.code === "40001" || error.code === "23505"
          ? 409
          : 500

  console.error("Request action failed", { code: error.code })

  return Response.json(
    {
      error:
        status === 500
          ? "Could not confirm the save. Refresh before trying again."
          : error.code === "23505"
            ? "This request ID was already used. Refresh before trying again."
            : error.message,
    },
    { status },
  )
}
