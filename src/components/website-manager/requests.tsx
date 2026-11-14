import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

import { buttonClass, inputClass, labelClass, panelClass } from "./styles"
import { LogTime, MonthlyUsage } from "./maintenance"
import { RequestUpdates } from "./request-updates"
import { RequestScreenshot } from "./request-screenshot"

const requestColumns =
  "id, website_id, submitted_by, kind, title, description, page_url, status"
const requestStatuses = [
  { value: "received", label: "Received" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_client", label: "Waiting on client" },
  { value: "ready_for_review", label: "Ready for review" },
  { value: "live", label: "Live" },
] as const

type Website = {
  id: string
  name: string
  monthly_allowance_minutes: number
}

type WebsiteRequest = {
  id: string
  website_id: string
  submitted_by: string | null
  kind: "bug" | "change"
  title: string
  description: string
  page_url: string | null
  status: string
}

export function Requests({ viewerId }: { viewerId: string }) {
  const [websites, setWebsites] = useState<Website[]>([])
  const [requests, setRequests] = useState<WebsiteRequest[]>([])
  const [managedWebsiteIds, setManagedWebsiteIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(
    null,
  )
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [usageRevision, setUsageRevision] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [sites, tickets, managedSites] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name, monthly_allowance_minutes")
            .order("name"),
          supabase
            .from("wm_requests")
            .select(requestColumns)
            .order("created_at", { ascending: false }),
          supabase.rpc("wm_managed_website_ids"),
        ])

        if (!active) return

        setWebsites(sites.data ?? [])
        setRequests(tickets.data ?? [])
        setManagedWebsiteIds(
          (managedSites.data ?? []).map(
            (site: { website_id: string }) => site.website_id,
          ),
        )
        setLoadError(
          (sites.error ?? tickets.error ?? managedSites.error)?.message ?? "",
        )
      } catch {
        if (active)
          setLoadError("Could not load requests. Refresh to try again.")
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
    if (saving) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const title = String(fields.get("title") ?? "").trim()
    const description = String(fields.get("description") ?? "").trim()

    if (!title || !description) {
      setActionError("Enter a title and description before submitting.")
      return
    }

    setActionError("")
    setSaving(true)

    try {
      const { data, error } = await supabase
        .from("wm_requests")
        .insert({
          website_id: String(fields.get("websiteId") ?? ""),
          kind: String(fields.get("kind") ?? ""),
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
      form.reset()
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
    setUpdatingRequestId(requestId)

    try {
      const { data, error } = await supabase
        .from("wm_requests")
        .update({ status })
        .eq("id", requestId)
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
    } catch {
      setActionError(
        "Could not confirm the status change. Refresh to check it.",
      )
    } finally {
      setUpdatingRequestId(null)
    }
  }

  if (loading) return <p>Loading websites and requests…</p>

  return (
    <div className="grid gap-6">
      {loadError && (
        <p role="alert" className="text-red-300">
          {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-red-300">
          {actionError}
        </p>
      )}

      <MonthlyUsage key={usageRevision} />

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">New request</h2>

        {websites.length > 0 ? (
          <form onSubmit={submitRequest} className="mt-5">
            <fieldset disabled={saving} className="grid min-w-0 gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Website
                  <select name="websiteId" required className={inputClass}>
                    {websites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name} · {site.monthly_allowance_minutes} min/month
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
              </div>

              <label className={labelClass}>
                Title
                <input
                  name="title"
                  required
                  maxLength={160}
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Description
                <textarea
                  name="description"
                  required
                  maxLength={5000}
                  rows={4}
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Page URL (optional)
                <input
                  name="pageUrl"
                  type="url"
                  maxLength={2048}
                  className={inputClass}
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className={`${buttonClass} sm:justify-self-start`}>
                {saving ? "Submitting…" : "Submit request"}
              </button>
            </fieldset>
          </form>
        ) : (
          !loadError && (
            <p className="mt-3 text-sm text-zinc-400">
              No websites are assigned to this account.
            </p>
          )
        )}
      </section>

      <section className={panelClass}>
        <h2 className="text-lg font-semibold">Requests</h2>

        {requests.length > 0 ? (
          <ul className="mt-3 divide-y divide-zinc-800">
            {requests.map((request) => {
              const canManage = managedWebsiteIds.includes(request.website_id)
              const websiteName = websites.find(
                (site) => site.id === request.website_id,
              )?.name
              const statusLabel =
                requestStatuses.find(({ value }) => value === request.status)
                  ?.label ?? request.status

              return (
                <li key={request.id} className="grid gap-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 wrap-break-word font-medium">
                      {request.title}
                    </span>

                    {canManage ? (
                      <select
                        aria-label={`Status for ${request.title}`}
                        value={request.status}
                        disabled={updatingRequestId !== null}
                        onChange={(event) =>
                          void changeStatus(request.id, event.target.value)
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-60">
                        {requestStatuses.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium">
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <details className="min-w-0 rounded-lg border border-zinc-800 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Request details
                    </summary>

                    <dl className="mt-3 grid gap-3">
                      {websiteName && (
                        <div>
                          <dt className="text-xs text-zinc-400">Website</dt>
                          <dd className="mt-1">{websiteName}</dd>
                        </div>
                      )}

                      <div>
                        <dt className="text-xs text-zinc-400">Request type</dt>
                        <dd className="mt-1">
                          {request.kind === "bug"
                            ? "Something is broken"
                            : "Request a change"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs text-zinc-400">Description</dt>
                        <dd className="mt-1 whitespace-pre-wrap wrap-break-word">
                          {request.description}
                        </dd>
                      </div>

                      {request.page_url && (
                        <div>
                          <dt className="text-xs text-zinc-400">Page URL</dt>
                          <dd className="mt-1 wrap-break-word">
                            {request.page_url}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </details>
                  <RequestScreenshot
                    requestId={request.id}
                    canUpload={canManage || request.submitted_by === viewerId}
                  />

                  <RequestUpdates requestId={request.id} canPost={canManage} />

                  {canManage && (
                    <LogTime
                      requestId={request.id}
                      onSaved={() => setUsageRevision((current) => current + 1)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          !loadError && (
            <p className="mt-3 text-sm text-zinc-400">No requests yet.</p>
          )
        )}
      </section>
    </div>
  )
}
