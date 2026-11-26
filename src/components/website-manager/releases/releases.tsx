"use client"

import { useState } from "react"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"
import { StatusBadge } from "../status-ui"
import { ReleaseForm } from "./release-form"
import { useReleases } from "./use-releases"
import type { WebsiteRelease } from "./types"
import { ReleaseScreenshot } from "./release-screenshot"
import { ReleaseRequestLink } from "./release-request-link"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))
}

function safeLiveUrl(value: string) {
  try {
    const url = new URL(value)

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null
    }

    return url.href
  } catch {
    return null
  }
}

export function Releases() {
  const { websites, releases, managedIds, total, loading, error, refresh } =
    useReleases()

  const [websiteId, setWebsiteId] = useState("")
  const [view, setView] = useState<"published" | "draft">("published")
  const [editing, setEditing] = useState<WebsiteRelease | "new" | null>(null)
  const [notice, setNotice] = useState("")

  const managedWebsites = websites.filter((website) =>
    managedIds.includes(website.id),
  )

  const websiteNames = new Map(
    websites.map((website) => [website.id, website.name]),
  )

  const visible = releases.filter(
    (release) =>
      (!websiteId || release.website_id === websiteId) &&
      release.status === view,
  )

  function returnToHistory() {
    setEditing(null)
    refresh()
  }

  function saved(message = "") {
    setNotice(message)
    setEditing(null)
    refresh()
  }

  return (
    <section className={`${panelClass} space-y-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Website updates
          </h2>

          <p className="mt-2 text-sm text-muted">
            A history of improvements published to your website.
          </p>
        </div>

        {!loading &&
          !error &&
          managedWebsites.length > 0 &&
          editing === null && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className={secondaryButtonClass}>
              Record an update
            </button>
          )}
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-border bg-primary/10 px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted">
          Loading website updates…
        </p>
      ) : error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>

          <button
            type="button"
            onClick={refresh}
            className={secondaryButtonClass}>
            Try again
          </button>
        </div>
      ) : editing !== null ? (
        <ReleaseForm
          key={editing === "new" ? "new" : editing.id}
          websites={managedWebsites}
          release={editing === "new" ? null : editing}
          onSaved={saved}
          onCancel={returnToHistory}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            {websites.length > 1 && (
              <label className={`${labelClass} min-w-52`}>
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

            {managedWebsites.length > 0 && (
              <label className={`${labelClass} min-w-40`}>
                Show
                <select
                  value={view}
                  onChange={(event) => {
                    const value = event.currentTarget.value

                    if (value === "published" || value === "draft") {
                      setView(value)
                    }
                  }}
                  className={inputClass}>
                  <option value="published">Published updates</option>
                  <option value="draft">Drafts</option>
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={refresh}
              className={secondaryButtonClass}>
              Refresh
            </button>
          </div>

          {total > releases.length && (
            <p className="text-sm text-muted">
              Showing the latest {releases.length} records. Filters apply to
              these loaded records.
            </p>
          )}

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
              {view === "draft"
                ? "No drafts match this website."
                : "No published updates yet."}
            </p>
          ) : (
            <ul className="space-y-4">
              {visible.map((release) => {
                const published = release.status === "published"
                const liveUrl = safeLiveUrl(release.live_url)

                const canEdit =
                  release.source === "manual" &&
                  managedIds.includes(release.website_id)

                return (
                  <li
                    id={`release-${release.id}`}
                    key={release.id}
                    className="rounded-xl border border-border bg-surface-secondary/40 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">
                          {websiteNames.get(release.website_id)}
                        </p>

                        <h3 className="mt-2 wrap-break-word font-sans text-lg font-semibold">
                          {release.title}
                        </h3>
                      </div>

                      <StatusBadge
                        status={published ? "live" : "all"}
                        label={published ? "Live" : "Draft"}
                      />
                    </div>

                    <p className="mt-4 whitespace-pre-wrap wrap-break-word text-sm">
                      {release.summary}
                    </p>

                    <ReleaseScreenshot
                      key={`${release.id}:${release.updated_at}`}
                      release={release}
                      canManage={canEdit}
                      onChanged={refresh}
                    />

                    <ReleaseRequestLink
                      release={release}
                      canManage={managedIds.includes(release.website_id)}
                    />

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 text-xs text-muted">
                        {release.published_on && (
                          <p>
                            {published ? "Published" : "Publication date"}{" "}
                            {formatDate(release.published_on)}
                          </p>
                        )}

                        {managedIds.includes(release.website_id) && (
                          <p>
                            {published && release.client_visible
                              ? "Visible to client"
                              : "Private"}
                            {" · "}
                            {release.source === "manual"
                              ? "Manual update"
                              : "Vercel deployment"}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {liveUrl && (
                          <a
                            href={liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={secondaryButtonClass}>
                            View live page
                          </a>
                        )}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditing(release)}
                            className={secondaryButtonClass}>
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
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
