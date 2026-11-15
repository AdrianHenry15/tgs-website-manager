import { requestColumns } from "@/components/website-manager/requests/request-columns"
import { sendRequestEmails } from "@/components/website-manager/requests/request-email"
import { createClient } from "@supabase/supabase-js"

type RequestBody = {
  websiteId?: unknown
  kind?: unknown
  title?: unknown
  description?: unknown
  pageUrl?: unknown
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([^\s]+)$/i)?.[1]

  if (!token) {
    return Response.json(
      { error: "Sign in again to submit a request." },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }

  const { websiteId, kind } = body
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description =
    typeof body.description === "string" ? body.description.trim() : ""
  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim() : ""

  if (
    typeof websiteId !== "string" ||
    !uuidPattern.test(websiteId) ||
    !title ||
    !description ||
    (kind !== "bug" && kind !== "change")
  ) {
    return Response.json(
      {
        error:
          "Choose a website and request type, then enter a title and description.",
      },
      { status: 400 },
    )
  }

  const supabase = createClient(
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

  const { data: auth, error: authError } = await supabase.auth.getUser(token)

  if (authError || !auth.user) {
    return Response.json(
      { error: "Sign in again to submit a request." },
      { status: 401 },
    )
  }

  const { data: website, error: websiteError } = await supabase
    .from("wm_websites")
    .select("name")
    .eq("id", websiteId)
    .maybeSingle()

  if (websiteError) {
    console.error("Could not read request website", { code: websiteError.code })
    return Response.json(
      { error: "Could not load the website. Try again." },
      { status: 500 },
    )
  }

  if (!website) {
    return Response.json(
      { error: "This website is unavailable to your account." },
      { status: 403 },
    )
  }

  const { data: savedRequest, error: saveError } = await supabase
    .from("wm_requests")
    .insert({
      website_id: websiteId,
      kind,
      title,
      description,
      page_url: pageUrl || null,
    })
    .select(requestColumns)
    .single()

  if (saveError || !savedRequest) {
    console.error("Could not save website request", { code: saveError?.code })
    return Response.json(
      { error: "Could not confirm the save. Refresh before submitting again." },
      { status: saveError?.code === "42501" ? 403 : 500 },
    )
  }

  const emailStatus = auth.user.email
    ? await sendRequestEmails({
        requestId: savedRequest.id,
        title: savedRequest.title,
        websiteName: website.name,
        clientEmail: auth.user.email,
      })
    : "disabled"

  return Response.json({ request: savedRequest, emailStatus }, { status: 201 })
}
