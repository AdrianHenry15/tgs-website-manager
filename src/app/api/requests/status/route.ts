import {
  getRequestViewer,
  requestActionError,
} from "@/lib/website-manager/request-api"

const statuses = new Set([
  "received",
  "in_progress",
  "waiting_on_client",
  "ready_for_review",
  "scheduled",
  "live",
])

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const viewer = await getRequestViewer(request)
  if (viewer instanceof Response) return viewer

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
    !statuses.has(status) ||
    typeof expectedStatus !== "string" ||
    !statuses.has(expectedStatus)
  ) {
    return Response.json(
      { error: "Choose a valid request and status." },
      { status: 400 },
    )
  }

  const { data, error } = await viewer.rpc("wm_change_request_status", {
    p_request_id: requestId,
    p_expected_status: expectedStatus,
    p_status: status,
  })

  if (error) return requestActionError(error)

  return Response.json(data)
}
