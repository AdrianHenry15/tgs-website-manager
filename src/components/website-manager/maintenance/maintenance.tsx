"use client"

import { useState } from "react"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"
import { useMaintenance } from "./use-maintenance"
import { StatusBadge } from "../status-ui"
import { ActivityForm } from "./activity-form"
import { TemplateManager } from "./template-manager"
import { ActivityEditor } from "./activity-editor"

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value

  return `${year}-${month}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))
}

const sourceLabels = {
  recurring: "Monthly maintenance",
  one_off: "One-off work",
  request: "Client request",
}

export function Maintenance() {
  const [month, setMonth] = useState(currentMonth)
  const [websiteId, setWebsiteId] = useState("")
  const [status, setStatus] = useState<"all" | "open" | "completed">("all")

  const {
    websites,
    activities,
    managedIds,
    loading,
    loadError,
    error,
    savingId,
    refresh,
    toggleActivity,
  } = useMaintenance(month)

  const managedWebsites = websites.filter((website) =>
    managedIds.includes(website.id),
  )

  const scoped = activities.filter(
    (activity) => !websiteId || activity.website_id === websiteId,
  )

  const visible = scoped.filter(
    (activity) => status === "all" || activity.status === status,
  )

  const completedCount = scoped.filter(
    (activity) => activity.status === "completed",
  ).length

  const websiteNames = new Map(
    websites.map((website) => [website.id, website.name]),
  )

  return (
    <section className={`${panelClass} space-y-6`}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Maintenance</h2>

        <p className="mt-2 text-sm text-muted">
          Monthly checks, improvements, and website activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Month
          <input
            type="month"
            required
            value={month}
            onChange={(event) => {
              const value = event.currentTarget.value

              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
                setMonth(value)
              }
            }}
            className={inputClass}
          />
        </label>

        {websites.length > 1 && (
          <label className={labelClass}>
            Website
            <select
              value={websiteId}
              onChange={(event) => setWebsiteId(event.currentTarget.value)}
              className={inputClass}>
              <option value="">All websites</option>

              {websites.map((website) => (
                <option key={website.id} value={website.id}>
                  {website.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={labelClass}>
          Show
          <select
            value={status}
            onChange={(event) => {
              const value = event.currentTarget.value

              if (
                value === "all" ||
                value === "open" ||
                value === "completed"
              ) {
                setStatus(value)
              }
            }}
            className={inputClass}>
            <option value="all">All activity</option>
            <option value="open">Open items</option>
            <option value="completed">Completed items</option>
          </select>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!loading && !loadError && managedWebsites.length > 0 && (
        <details
          key={`${month}:${websiteId}`}
          className="rounded-xl border border-border bg-surface-secondary/30 p-4">
          <summary className="cursor-pointer font-medium text-primary">
            Add one-off work
          </summary>

          <ActivityForm
            websites={managedWebsites}
            month={month}
            initialWebsiteId={websiteId}
            onSaved={refresh}
          />
        </details>
      )}
      {!loading && !loadError && managedWebsites.length > 0 && (
        <details className="rounded-xl border border-border bg-surface-secondary/30 p-4">
          <summary className="cursor-pointer font-medium text-primary">
            Recurring maintenance templates
          </summary>

          <TemplateManager websites={managedWebsites} onChanged={refresh} />
        </details>
      )}

      {loading ? (
        <p role="status" className="text-sm text-muted">
          Loading maintenance…
        </p>
      ) : loadError ? null : (
        <>
          <div className="flex flex-wrap gap-3">
            <StatusBadge
              status="open"
              label={`${scoped.length - completedCount} open`}
            />

            <StatusBadge
              status="completed"
              label={`${completedCount} completed`}
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
              {scoped.length > 0
                ? "No activity matches this filter."
                : "No maintenance activity recorded for this month."}
            </p>
          ) : (
            <ul className="grid gap-3">
              {visible.map((activity) => {
                const canManage = managedIds.includes(activity.website_id)
                const completed = activity.status === "completed"

                return (
                  <li
                    key={activity.id}
                    className="rounded-xl border border-border bg-surface-secondary/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted">
                          {websiteNames.get(activity.website_id)}
                          {" · "}
                          {sourceLabels[activity.source]}
                        </p>

                        <h3 className="mt-2 wrap-break-word font-sans font-semibold">
                          {activity.title}
                        </h3>
                      </div>

                      <StatusBadge
                        status={activity.status}
                        label={completed ? "Completed" : "Open"}
                      />
                    </div>

                    {activity.description && (
                      <p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm text-muted">
                        {activity.description}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-3 text-xs text-muted">
                        {activity.due_on && (
                          <span>Due {formatDate(activity.due_on)}</span>
                        )}

                        {canManage && (
                          <span>
                            {activity.client_visible
                              ? "Visible to client"
                              : "Internal only"}
                          </span>
                        )}
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => void toggleActivity(activity)}
                          aria-label={`${completed ? "Reopen" : "Complete"} ${activity.title}`}
                          className={secondaryButtonClass}>
                          {savingId === activity.id
                            ? "Saving…"
                            : completed
                              ? "Reopen"
                              : "Mark completed"}
                        </button>
                      )}
                    </div>
                    {canManage && activity.source === "one_off" && (
                      <ActivityEditor
                        activity={activity}
                        disabled={savingId !== null}
                        onSaved={refresh}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
