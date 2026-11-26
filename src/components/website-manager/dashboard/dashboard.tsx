"use client"

import { useState } from "react"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"
import { StatusBadge } from "../status-ui"
import { ReleaseScreenshot } from "../releases/release-screenshot"
import { useDashboard } from "./use-dashboard"

type Props = {
  onNewRequest: () => void
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))
}

export function Dashboard({ onNewRequest }: Props) {
  const [websiteId, setWebsiteId] = useState("")
  const { data, loading, refresh } = useDashboard(websiteId)

  if (loading || !data) {
    return (
      <p role="status" className="text-sm text-muted">
        Loading your overview…
      </p>
    )
  }

  if (data.error) {
    return (
      <section className={`${panelClass} space-y-4`}>
        <p role="alert" className="text-sm text-red-400">
          {data.error}
        </p>

        <button
          type="button"
          onClick={refresh}
          className={secondaryButtonClass}>
          Try again
        </button>
      </section>
    )
  }

  const names = new Map(
    data.websites.map((website) => [website.id, website.name]),
  )

  const selectedWebsite =
    data.websites.length === 1
      ? data.websites[0]
      : data.websites.find((website) => website.id === websiteId)

  if (data.websites.length === 0) {
    return (
      <section className={`${panelClass} space-y-2`}>
        <h2 className="text-xl font-semibold">Your workspace</h2>

        <p className="text-sm text-muted">
          No websites are assigned to this account yet.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className={`${panelClass} space-y-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted">
              Website overview
            </p>

            <h2 className="mt-2 font-sans text-2xl font-semibold tracking-tight">
              {selectedWebsite?.name ?? "All websites"}
            </h2>

            {selectedWebsite?.maintenance_plan && (
              <p className="mt-2 text-sm text-muted">
                {selectedWebsite.maintenance_plan}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onNewRequest}
              className={secondaryButtonClass}>
              New request
            </button>

            <button
              type="button"
              onClick={refresh}
              className={secondaryButtonClass}>
              Refresh
            </button>
          </div>
        </div>

        {data.websites.length > 1 && (
          <label className={`${labelClass} block max-w-sm`}>
            Website
            <select
              value={websiteId}
              onChange={(event) => setWebsiteId(event.currentTarget.value)}
              className={inputClass}>
              <option value="">All websites</option>

              {data.websites.map((website) => (
                <option key={website.id} value={website.id}>
                  {website.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap gap-3">
          <StatusBadge
            status="open"
            label={`${data.openCount} open requests`}
          />

          <StatusBadge
            status="waiting_on_client"
            label={`${data.waitingCount} need client input`}
          />
        </div>

        <p className="text-xs text-muted">
          The maintenance plan describes your agreement. Payment status is
          available separately in My Account.
        </p>
      </section>

      <section className={`${panelClass} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Needs client input</h3>

          <StatusBadge
            status="waiting_on_client"
            label={String(data.waitingCount)}
          />
        </div>

        {data.waiting.length === 0 ? (
          <p className="text-sm text-muted">
            No requests are currently waiting for client input.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.waiting.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {names.get(request.website_id)}
                  </p>

                  <p className="mt-1 break-words text-sm font-medium">
                    {request.title}
                  </p>
                </div>

                <a
                  href={`/?requestId=${encodeURIComponent(request.id)}`}
                  className={secondaryButtonClass}>
                  Open request
                </a>
              </li>
            ))}
          </ul>
        )}

        {data.waitingCount > data.waiting.length && (
          <p className="text-xs text-muted">
            Showing the five oldest requests needing input. See Requests for the
            complete list.
          </p>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className={`${panelClass} space-y-4`}>
          <h3 className="font-semibold">Latest live update</h3>

          {data.release ? (
            <>
              <div>
                <p className="text-xs text-muted">
                  {names.get(data.release.website_id)}
                </p>

                <h4 className="mt-2 font-sans text-lg font-semibold">
                  {data.release.title}
                </h4>

                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted">
                  {data.release.summary}
                </p>
              </div>

              <ReleaseScreenshot
                key={`${data.release.id}:${data.release.updated_at}`}
                release={data.release}
                canManage={false}
                onChanged={refresh}
              />

              <a
                href={`/?releaseId=${encodeURIComponent(data.release.id)}#release-${data.release.id}`}
                className={secondaryButtonClass}>
                View update and live link
              </a>
            </>
          ) : (
            <p className="text-sm text-muted">
              Published website updates will appear here.
            </p>
          )}
        </section>

        <section className={`${panelClass} space-y-4`}>
          <h3 className="font-semibold">Latest monthly recap</h3>

          {data.recap ? (
            <>
              <div>
                <p className="text-xs text-muted">
                  {names.get(data.recap.website_id)}
                </p>

                <h4 className="mt-2 font-sans text-lg font-semibold">
                  {monthLabel(data.recap.report_month)}
                </h4>

                <p className="mt-3 text-sm text-muted">
                  Completed work, outstanding items, and published website
                  updates in one place.
                </p>
              </div>

              <a
                href={`/?recapId=${encodeURIComponent(data.recap.id)}#recap-${data.recap.id}`}
                className={secondaryButtonClass}>
                Read recap
              </a>
            </>
          ) : (
            <p className="text-sm text-muted">
              Your published monthly recap will appear here.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
