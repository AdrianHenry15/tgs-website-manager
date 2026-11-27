import { randomUUID } from "node:crypto"
import {
  getRequestViewer,
  requestActionError,
} from "@/lib/website-manager/request-api"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const viewer = await getRequestViewer(request)
  if (viewer instanceof Response) return viewer

  const body = (await request.json().catch(() => null)) as {
    requestId?: unknown
    websiteId?: unknown
    kind?: unknown
    title?: unknown
    description?: unknown
    pageUrl?: unknown
  } | null

  const requestId =
    body?.requestId === undefined ? randomUUID() : body.requestId

  const websiteId = body?.websiteId
  const kind = body?.kind
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const description =
    typeof body?.description === "string" ? body.description.trim() : ""
  const pageUrl = typeof body?.pageUrl === "string" ? body.pageUrl.trim() : ""

  if (
    typeof requestId !== "string" ||
    !uuidPattern.test(requestId) ||
    typeof websiteId !== "string" ||
    !uuidPattern.test(websiteId) ||
    (kind !== "bug" && kind !== "change") ||
    !title ||
    title.length > 160 ||
    !description ||
    description.length > 5000 ||
    pageUrl.length > 2048
  ) {
    return Response.json(
      { error: "Enter valid website request details." },
      { status: 400 },
    )
  }

  if (pageUrl) {
    try {
      const url = new URL(pageUrl)

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error("Invalid page URL.")
      }
    } catch {
      return Response.json(
        { error: "Enter a valid HTTP or HTTPS page URL." },
        { status: 400 },
      )
    }
  }

  const { data, error } = await viewer.rpc("wm_submit_request", {
    p_request_id: requestId,
    p_website_id: websiteId,
    p_kind: kind,
    p_title: title,
    p_description: description,
    p_page_url: pageUrl || null,
  })

  if (error) return requestActionError(error)

  return Response.json(data, { status: 201 })
}
