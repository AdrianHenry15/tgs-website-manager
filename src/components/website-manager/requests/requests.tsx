"use client"

import { useEffect, useState, useRef, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { RequestActions } from "./request-actions"
import { RequestScreenshot } from "./request-screenshot"
import { RequestUpdates } from "./request-updates"
import { requestColumns } from "./request-columns"
import { buttonClass, inputClass, labelClass, panelClass } from "../styles"
import { WebsiteSwitcher } from "../website-switcher"
import { StatusBadge, statusToneClass } from "../status-ui"

const requestStatuses = [
  { value: "received", label: "Received" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_client", label: "Waiting on client" },
  { value: "ready_for_review", label: "Ready for review" },
  { value: "scheduled", label: "Scheduled" },
  { value: "live", label: "Live" },
] as const

const requestViews = [
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting on client" },
  { value: "live", label: "Live" },
  { value: "all", label: "All" },
  { value: "trash", label: "Trash" },
] as const

const requestKinds = {
  bug: "Issue",
  change: "Change request",
} as const

const filterButtonClass =
  "wm-filter rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const errorClass =
  "rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200"

type RequestView = (typeof requestViews)[number]["value"]
type RequestKind = keyof typeof requestKinds
type RequestKindFilter = "all" | RequestKind

type Website = {
  id: string
  name: string
  maintenance_plan: string | null
}

type WebsiteRequest = {
  id: string
  website_id: string
  submitted_by: string | null
  kind: RequestKind
  title: string
  description: string
  page_url: string | null
  status: string
  deleted_at: string | null
  deleted_by: string | null
  purge_started_at: string | null
}

type WebsiteIdRow = {
  website_id: string
}

type RequestSubmission = {
  requestId: string
  websiteId: string
  kind: RequestKind
  title: string
  description: string
  pageUrl: string
}

function matchesRequestView(
  status: string,
  view: Exclude<RequestView, "trash">,
) {
  switch (view) {
    case "open":
      return status !== "live"
    case "waiting":
      return status === "waiting_on_client"
    case "live":
      return status === "live"
    case "all":
      return true
  }
}

export function Requests({ viewerId }: { viewerId: string }) {
  const [websites, setWebsites] = useState<Website[]>([])
  const [requests, setRequests] = useState<WebsiteRequest[]>([])
  const [managedWebsiteIds, setManagedWebsiteIds] = useState<string[]>([])
  const [ownedWebsiteIds, setOwnedWebsiteIds] = useState<string[]>([])
  const [view, setView] = useState<RequestView>("open")
  const [kindFilter, setKindFilter] = useState<RequestKindFilter>("all")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(
    null,
  )
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")
  const [linkedRequestId, setLinkedRequestId] = useState<string | null>(null)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("")

  const pendingSubmission = useRef<RequestSubmission | null>(null)
  const submittingRequest = useRef(false)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [sites, tickets, managedSites, ownedSites] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name, maintenance_plan")
            .order("name"),
          supabase
            .from("wm_requests")
            .select(requestColumns)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          supabase.rpc("wm_managed_website_ids"),
          supabase.rpc("wm_owned_website_ids"),
        ])

        if (!active) return

        setWebsites(sites.data ?? [])
        setRequests(tickets.data ?? [])

        const params = new URLSearchParams(window.location.search)
        const requestedId = params.get("request") ?? params.get("requestId")

        if (requestedId && !tickets.error) {
          const linkedRequest = tickets.data?.find(
            (request) => request.id === requestedId,
          )

          if (linkedRequest) {
            setSelectedWebsiteId(linkedRequest.website_id)
            setLinkedRequestId(linkedRequest.id)
            setView(linkedRequest.deleted_at === null ? "all" : "trash")
            setKindFilter("all")
          } else {
            setNotice("The linked request is unavailable to this account.")
          }
        }

        setManagedWebsiteIds(
          (managedSites.data ?? []).map(
            (site: WebsiteIdRow) => site.website_id,
          ),
        )
        setOwnedWebsiteIds(
          (ownedSites.data ?? []).map((site: WebsiteIdRow) => site.website_id),
        )
        setLoadError(
          (
            sites.error ??
            tickets.error ??
            managedSites.error ??
            ownedSites.error
          )?.message ?? "",
        )
      } catch {
        if (active)
          setLoadError("Could not load the workspace. Refresh to try again.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  async function submitRequest(event: React.ChangeEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRequest.current) return

    const form = event.currentTarget
    const fields = new FormData(form)

    const websiteId = String(fields.get("websiteId") ?? "")
    const title = String(fields.get("title") ?? "").trim()
    const description = String(fields.get("description") ?? "").trim()
    const pageUrl = String(fields.get("pageUrl") ?? "").trim()
    const kind = fields.get("kind")

    setActionError("")
    setNotice("")

    if (
      !websites.some((website) => website.id === websiteId) ||
      !title ||
      title.length > 160 ||
      !description ||
      description.length > 5000
    ) {
      setActionError(
        "Choose an available website, enter a title up to 160 characters, and a description up to 5,000.",
      )
      return
    }

    if (kind !== "bug" && kind !== "change") {
      setActionError("Choose a request type.")
      return
    }

    if (pageUrl) {
      try {
        const url = new URL(pageUrl)

        if (
          pageUrl.length > 2048 ||
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        ) {
          throw new Error("Invalid page URL.")
        }
      } catch {
        setActionError("Enter a valid HTTP or HTTPS page URL.")
        return
      }
    }

    const previous = pendingSubmission.current

    if (
      previous &&
      (previous.websiteId !== websiteId ||
        previous.kind !== kind ||
        previous.title !== title ||
        previous.description !== description ||
        previous.pageUrl !== pageUrl)
    ) {
      setActionError(
        "The previous submission has not been confirmed. Restore its original details to retry, or reload and check the request list before starting another request.",
      )
      return
    }

    submittingRequest.current = true
    setSaving(true)

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()

      const token = data.session?.access_token

      if (sessionError || !token) {
        setActionError(
          "Sign in again to submit a request. If you already attempted this submission, check the request list after signing in.",
        )
        return
      }

      const submission: RequestSubmission = pendingSubmission.current ?? {
        requestId: crypto.randomUUID(),
        websiteId,
        kind,
        title,
        description,
        pageUrl,
      }

      // Keep this exact submission until its outcome is confirmed.
      pendingSubmission.current = submission

      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission),
      })

      const result = (await response.json().catch(() => null)) as {
        request?: WebsiteRequest
        emailStatus?:
          | "accepted"
          | "disabled"
          | "unconfirmed"
          | "queued"
          | "skipped"
        error?: string
      } | null

      if (!response.ok) {
        if (response.status === 400) {
          // Validation errors do not commit the database transaction.
          pendingSubmission.current = null
          setActionError(result?.error ?? "Check the request details.")
        } else {
          setActionError(
            `${
              result?.error ?? "Could not confirm the submission."
            } Retry with the same details. The retry will reuse the same request ID.`,
          )
        }

        return
      }

      const savedRequest = result?.request

      if (
        !savedRequest ||
        savedRequest.id !== submission.requestId ||
        savedRequest.website_id !== submission.websiteId
      ) {
        setActionError(
          "Could not confirm the submission. Retry with the same details to check the same request ID.",
        )
        return
      }

      pendingSubmission.current = null

      setSelectedWebsiteId(savedRequest.website_id)

      setRequests((current) => [
        savedRequest,
        ...current.filter((item) => item.id !== savedRequest.id),
      ])

      setView(savedRequest.status === "live" ? "live" : "open")
      setKindFilter("all")
      form.reset()

      const screenshotHint = "Open Screenshot on the ticket to attach an image."

      setNotice(
        result?.emailStatus === "queued"
          ? `Request saved. Notification emails are queued. ${screenshotHint}`
          : result?.emailStatus === "unconfirmed"
            ? `Request saved. We couldn’t confirm the notification emails. ${screenshotHint}`
            : `Request saved. ${screenshotHint}`,
      )
    } catch {
      setActionError(
        "Could not confirm the submission. Retry with the same details to reuse the same request ID. If you reload first, check the request list before submitting again.",
      )
    } finally {
      submittingRequest.current = false
      setSaving(false)
    }
  }

  async function changeStatus(requestId: string, status: string) {
    if (updatingRequestId !== null) return

    const previous = requests.find((request) => request.id === requestId)
    if (!previous || previous.status === status) return

    setActionError("")
    setNotice("")
    setUpdatingRequestId(requestId)

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (sessionError || !token) {
        setActionError("Sign in again to change a request status.")
        return
      }

      const response = await fetch("/api/requests/status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          status,
          expectedStatus: previous.status,
        }),
      })

      const result = (await response.json()) as {
        request?: WebsiteRequest
        emailStatus?: "accepted" | "disabled" | "unconfirmed" | "skipped"
        error?: string
      }

      if (!response.ok || !result.request) {
        setActionError(
          result.error ??
            "Could not confirm the status change. Refresh to check it.",
        )
        return
      }

      const updated = result.request

      setRequests((current) =>
        current.map((request) =>
          request.id === updated.id ? updated : request,
        ),
      )

      const label = requestStatuses.find(
        ({ value }) => value === updated.status,
      )?.label

      const emailNotice =
        result.emailStatus === "unconfirmed"
          ? " We couldn’t confirm the client email."
          : result.emailStatus === "disabled"
            ? " Email notifications are not configured."
            : ""

      setNotice(`Status updated to ${label ?? updated.status}.${emailNotice}`)
    } catch {
      setActionError(
        "Could not confirm the status change. Refresh to check it.",
      )
    } finally {
      setUpdatingRequestId(null)
    }
  }

  function handleRequestChange(
    previous: WebsiteRequest,
    updated: WebsiteRequest | null,
  ) {
    setActionError("")
    setRequests((current) =>
      updated
        ? current.map((ticket) =>
            ticket.id === previous.id ? updated : ticket,
          )
        : current.filter((ticket) => ticket.id !== previous.id),
    )

    if (!updated) {
      setNotice("Request permanently deleted.")
    } else if (updated.purge_started_at !== null) {
      setNotice("")
    } else if (previous.deleted_at === null && updated.deleted_at !== null) {
      setNotice("Request moved to Trash.")
    } else if (previous.deleted_at !== null && updated.deleted_at === null) {
      setNotice("Request restored.")
    } else {
      setNotice("Request updated.")
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        Loading workspace…
      </p>
    )
  }

  const websiteNames = new Map(
    websites.map((website) => [website.id, website.name]),
  )

  const scopedRequests = requests.filter(
    (request) => !selectedWebsiteId || request.website_id === selectedWebsiteId,
  )

  const visibleRequests = scopedRequests.filter((request) => {
    const matchesView =
      view === "trash"
        ? request.deleted_at !== null
        : request.deleted_at === null &&
          matchesRequestView(request.status, view)

    const matchesKind = kindFilter === "all" || request.kind === kindFilter

    return matchesView && matchesKind
  })

  const hasRequestsInSection = scopedRequests.some((request) =>
    view === "trash"
      ? request.deleted_at !== null
      : request.deleted_at === null,
  )

  const emptyMessage = hasRequestsInSection
    ? "No requests match these filters."
    : view === "trash"
      ? "Trash is empty."
      : "No requests yet."

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-3 empty:hidden lg:col-span-2">
        {loadError && (
          <p role="alert" className={errorClass}>
            {loadError}
          </p>
        )}
        {actionError && (
          <p role="alert" className={errorClass}>
            {actionError}
          </p>
        )}

        <WebsiteSwitcher
          websites={websites}
          selectedWebsiteId={selectedWebsiteId}
          onSelect={setSelectedWebsiteId}
        />
      </div>

      <section
        aria-labelledby="new-request-heading"
        className={`${panelClass} min-w-0 lg:col-start-2 lg:row-start-2`}>
        <h2
          id="new-request-heading"
          className="text-lg font-semibold tracking-tight">
          New request
        </h2>

        {websites.length > 0 ? (
          <form onSubmit={submitRequest} className="mt-5">
            <fieldset disabled={saving} className="grid min-w-0 gap-4">
              <label className={labelClass}>
                Website
                <select
                  name="websiteId"
                  required
                  value={
                    websites.length === 1 ? websites[0].id : selectedWebsiteId
                  }
                  onChange={(event) =>
                    setSelectedWebsiteId(event.currentTarget.value)
                  }
                  className={inputClass}>
                  {websites.length > 1 && (
                    <option value="" disabled>
                      Choose a website
                    </option>
                  )}

                  {websites.map((website) => (
                    <option key={website.id} value={website.id}>
                      {website.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                Request type
                <select name="kind" className={inputClass}>
                  <option value="change">Request a change</option>
                  <option value="bug">Something is broken</option>
                </select>
              </label>

              <label className={labelClass}>
                Title
                <input
                  name="title"
                  required
                  maxLength={160}
                  placeholder="Update the product page"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Description
                <textarea
                  name="description"
                  required
                  rows={4}
                  maxLength={5000}
                  placeholder="What should we change or fix?"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Page URL (optional)
                <input
                  name="pageUrl"
                  type="url"
                  maxLength={2048}
                  placeholder="https://"
                  className={inputClass}
                />
              </label>

              <button type="submit" className={buttonClass}>
                {saving ? "Submitting…" : "Submit request"}
              </button>
            </fieldset>
          </form>
        ) : (
          !loadError && (
            <p className="mt-3 text-sm text-muted">
              No websites are assigned to this account.
            </p>
          )
        )}
      </section>

      <section
        aria-labelledby="request-queue-heading"
        className={`${panelClass} min-w-0 lg:col-start-1 lg:row-start-2`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2
            id="request-queue-heading"
            className="text-lg font-semibold tracking-tight">
            Requests
          </h2>

          <label className={labelClass}>
            Filter by type
            <select
              value={kindFilter}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value === "all" || value === "bug" || value === "change") {
                  setKindFilter(value)
                }
              }}
              className={inputClass}>
              <option value="all">All types</option>
              <option value="bug">Issues</option>
              <option value="change">Changes</option>
            </select>
          </label>
        </div>

        <div
          role="group"
          aria-label="Filter requests"
          className="mt-5 flex flex-wrap gap-2">
          {requestViews.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`${filterButtonClass} ${statusToneClass(value)}`}>
              {label}
            </button>
          ))}
        </div>

        <p
          role="status"
          className={notice ? "mt-4 text-sm text-primary" : "sr-only"}>
          {notice}
        </p>

        {visibleRequests.length > 0 ? (
          <ul className="mt-5 grid gap-3">
            {visibleRequests.map((request) => {
              const isActive = request.deleted_at === null
              const canManage = managedWebsiteIds.includes(request.website_id)

              return (
                <RequestCard
                  key={request.id}
                  request={request}
                  websiteName={websiteNames.get(request.website_id)}
                  canManage={isActive && canManage}
                  canUpload={
                    isActive && (canManage || request.submitted_by === viewerId)
                  }
                  linked={request.id === linkedRequestId}
                  updatingStatus={updatingRequestId !== null}
                  onStatusChange={(status) =>
                    void changeStatus(request.id, status)
                  }
                  actions={
                    <RequestActions
                      request={request}
                      viewerId={viewerId}
                      isOwner={ownedWebsiteIds.includes(request.website_id)}
                      onChanged={(updated) =>
                        handleRequestChange(request, updated)
                      }
                    />
                  }
                />
              )
            })}
          </ul>
        ) : (
          !loadError && (
            <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
              {emptyMessage}
            </p>
          )
        )}
      </section>
    </div>
  )
}

function RequestCard({
  request,
  websiteName,
  canManage,
  canUpload,
  updatingStatus,
  onStatusChange,
  actions,
  linked,
}: {
  request: WebsiteRequest
  websiteName?: string
  canManage: boolean
  canUpload: boolean
  updatingStatus: boolean
  onStatusChange: (status: string) => void
  actions: ReactNode
  linked: boolean
}) {
  const statusLabel =
    requestStatuses.find(({ value }) => value === request.status)?.label ??
    request.status

  const cardRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!linked) return

    const card = cardRef.current
    if (!card) return

    const details = card.querySelector("details")
    if (details) details.open = true

    card.focus({ preventScroll: true })
    card.scrollIntoView({ block: "center" })
  }, [linked])

  return (
    <li
      ref={cardRef}
      id={`request-${request.id}`}
      tabIndex={-1}
      className={`wm-request-card ${statusToneClass(
        request.deleted_at ? "trash" : request.status,
      )} grid min-w-0 gap-3 rounded-xl border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-primary ${
        linked ? "ring-2 ring-primary/60" : ""
      }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="wrap-break-word font-semibold text-foreground">
            {request.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {websiteName && <>{websiteName} · </>}
            {requestKinds[request.kind]}
          </p>
        </div>

        {canManage ? (
          <select
            aria-label={`Status for ${request.title}`}
            value={request.status}
            disabled={updatingStatus}
            onChange={(event) => onStatusChange(event.currentTarget.value)}
            className={`${inputClass} wm-status ${statusToneClass(
              request.status,
            )} w-full shrink-0 sm:w-48`}>
            {requestStatuses.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <StatusBadge status={request.status} label={statusLabel} />
        )}
      </div>

      <details className="min-w-0 rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Request details
        </summary>

        <dl className="mt-3 grid gap-3">
          <div>
            <dt className="text-xs text-muted">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap wrap-break-word">
              {request.description}
            </dd>
          </div>

          {request.page_url && (
            <div>
              <dt className="text-xs text-muted">Page URL</dt>
              <dd className="mt-1 wrap-break-word">{request.page_url}</dd>
            </div>
          )}
        </dl>
      </details>

      {request.purge_started_at === null && (
        <>
          <RequestScreenshot requestId={request.id} canUpload={canUpload} />
          <RequestUpdates
            requestId={request.id}
            canPost={request.deleted_at === null}
            canManage={canManage}
          />
        </>
      )}

      {actions}
    </li>
  )
}
