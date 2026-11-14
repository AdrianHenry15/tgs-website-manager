"use client"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { RequestActions } from "./request-actions"
import { RequestScreenshot } from "./request-screenshot"
import { RequestUpdates } from "./request-updates"
import { buttonClass, inputClass, labelClass, panelClass } from "./styles"

const requestColumns =
  "id, website_id, submitted_by, kind, title, description, page_url, status, deleted_at, deleted_by, purge_started_at"

const requestStatuses = [
  { value: "received", label: "Received" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_client", label: "Waiting on client" },
  { value: "ready_for_review", label: "Ready for review" },
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
  "rounded-full border border-stone-700 px-3 py-2 text-sm font-medium text-stone-300 transition-colors hover:border-orange-400/60 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 aria-pressed:border-orange-400/60 aria-pressed:bg-orange-500/15 aria-pressed:text-orange-200"

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

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const title = String(fields.get("title") ?? "").trim()
    const description = String(fields.get("description") ?? "").trim()
    const websiteId = String(fields.get("websiteId") ?? "")
    const kind = fields.get("kind")

    setActionError("")
    setNotice("")

    if (!websiteId || !title || !description) {
      setActionError("Choose a website and enter a title and description.")
      return
    }

    if (kind !== "bug" && kind !== "change") {
      setActionError("Choose a request type.")
      return
    }

    setSaving(true)

    try {
      const { data, error } = await supabase
        .from("wm_requests")
        .insert({
          website_id: websiteId,
          kind,
          title,
          description,
          page_url: String(fields.get("pageUrl") ?? "").trim() || null,
        })
        .select(requestColumns)
        .single()

      if (error) {
        setActionError(error.message)
        return
      }

      setRequests((current) => [data, ...current])
      setView("open")
      setKindFilter("all")
      form.reset()
      setNotice(
        "Request submitted. Open Screenshot on the ticket to attach an image.",
      )
    } catch {
      setActionError(
        "Could not confirm the save. Refresh before submitting again.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(requestId: string, status: string) {
    if (updatingRequestId !== null) return

    setActionError("")
    setNotice("")
    setUpdatingRequestId(requestId)

    try {
      const { data, error } = await supabase
        .from("wm_requests")
        .update({ status })
        .eq("id", requestId)
        .is("deleted_at", null)
        .select(requestColumns)
        .maybeSingle()

      if (error) {
        setActionError(error.message)
        return
      }

      if (!data) {
        setActionError("No request was updated. Refresh and check your access.")
        return
      }

      setRequests((current) =>
        current.map((request) => (request.id === data.id ? data : request)),
      )

      const label = requestStatuses.find(
        ({ value }) => value === data.status,
      )?.label
      setNotice(`Status updated to ${label ?? data.status}.`)
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
      <p role="status" className="text-sm text-stone-400">
        Loading workspace…
      </p>
    )
  }

  const websiteNames = new Map(
    websites.map((website) => [website.id, website.name]),
  )
  const websitesWithPlans = websites.filter(
    (website) => website.maintenance_plan,
  )

  const visibleRequests = requests.filter((request) => {
    const matchesView =
      view === "trash"
        ? request.deleted_at !== null
        : request.deleted_at === null &&
          matchesRequestView(request.status, view)

    return matchesView && (kindFilter === "all" || request.kind === kindFilter)
  })

  const hasRequestsInSection = requests.some((request) =>
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

        {websitesWithPlans.map((website) => (
          <section
            key={website.id}
            className={`${panelClass} flex flex-wrap items-center justify-between gap-3`}>
            <h2 className="font-semibold text-stone-100">{website.name}</h2>
            <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-200">
              {website.maintenance_plan}
            </span>
          </section>
        ))}
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
                <select name="websiteId" required className={inputClass}>
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
            <p className="mt-3 text-sm text-stone-400">
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
              className={filterButtonClass}>
              {label}
            </button>
          ))}
        </div>

        <p
          role="status"
          className={notice ? "mt-4 text-sm text-orange-200" : "sr-only"}>
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
            <p className="mt-5 rounded-xl border border-dashed border-stone-700 px-4 py-6 text-sm text-stone-400">
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
}: {
  request: WebsiteRequest
  websiteName?: string
  canManage: boolean
  canUpload: boolean
  updatingStatus: boolean
  onStatusChange: (status: string) => void
  actions: ReactNode
}) {
  const statusLabel =
    requestStatuses.find(({ value }) => value === request.status)?.label ??
    request.status

  return (
    <li className="grid min-w-0 gap-3 rounded-xl border border-stone-800 bg-stone-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="wrap-break-word font-semibold text-stone-100">
            {request.title}
          </h3>
          <p className="mt-1 text-xs text-stone-400">
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
            className={`${inputClass} max-w-full sm:w-auto`}>
            {requestStatuses.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
            {statusLabel}
          </span>
        )}
      </div>

      <details className="min-w-0 rounded-lg border border-stone-800 p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Request details
        </summary>

        <dl className="mt-3 grid gap-3">
          <div>
            <dt className="text-xs text-stone-400">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap wrap-break-word">
              {request.description}
            </dd>
          </div>

          {request.page_url && (
            <div>
              <dt className="text-xs text-stone-400">Page URL</dt>
              <dd className="mt-1 wrap-break-word">{request.page_url}</dd>
            </div>
          )}
        </dl>
      </details>

      {request.purge_started_at === null && (
        <>
          <RequestScreenshot requestId={request.id} canUpload={canUpload} />
          <RequestUpdates requestId={request.id} canPost={canManage} />
        </>
      )}

      {actions}
    </li>
  )
}
