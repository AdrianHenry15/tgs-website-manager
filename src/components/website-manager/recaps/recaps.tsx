"use client"

import { useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"
import { StatusBadge } from "../status-ui"
import { useRecaps, type MonthlyRecap } from "./use-recaps"

function previousMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date())

  const year = Number(parts.find((part) => part.type === "year")?.value)
  const month = Number(parts.find((part) => part.type === "month")?.value)

  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7)
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []

  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  )
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function WorkItems({
  title,
  value,
  completed,
}: {
  title: string
  value: unknown
  completed: boolean
}) {
  const items = records(value)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{title}</h4>

        <StatusBadge
          status={completed ? "completed" : "open"}
          label={String(items.length)}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">No items recorded in this section.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const requestId = text(item.requestId)

            return (
              <li
                key={`${text(item.id)}:${index}`}
                className="rounded-xl border border-border p-4">
                <p className="break-words text-sm font-medium">
                  {text(item.title)}
                </p>

                {text(item.description) && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
                    {text(item.description)}
                  </p>
                )}

                {requestId && (
                  <a
                    href={`/?requestId=${encodeURIComponent(requestId)}`}
                    className="mt-3 inline-block text-sm text-primary underline underline-offset-4">
                    Open request
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RecapContents({ recap }: { recap: MonthlyRecap }) {
  const releases = records(recap.release_items)

  return (
    <div className="mt-5 space-y-6">
      <WorkItems
        title="Completed work"
        value={recap.completed_items}
        completed
      />

      <WorkItems
        title="Open items"
        value={recap.open_items}
        completed={false}
      />

      <section className="space-y-3">
        <h4 className="font-semibold">Published website updates</h4>

        {releases.length === 0 ? (
          <p className="text-sm text-muted">
            No published updates recorded for this month.
          </p>
        ) : (
          <ul className="space-y-3">
            {releases.map((release, index) => (
              <li
                key={`${text(release.id)}:${index}`}
                className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium">{text(release.title)}</p>

                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
                  {text(release.summary)}
                </p>

                <a
                  href={`/?releaseId=${encodeURIComponent(text(release.id))}#release-${encodeURIComponent(text(release.id))}`}
                  className="mt-3 inline-block text-sm text-primary underline underline-offset-4">
                  View update
                  {release.hasScreenshot === true ? " and screenshot" : ""}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">
        Saved snapshot generated {new Date(recap.generated_at).toLocaleString()}
        . Linked requests and website updates show their current details.
      </p>
    </div>
  )
}

export function Recaps() {
  const { websites, recaps, managedIds, total, loading, error, refresh } =
    useRecaps()

  const [websiteId, setWebsiteId] = useState("")
  const [month, setMonth] = useState(previousMonth)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")

  const busy = useRef(false)

  const selectedWebsiteId = websites.length === 1 ? websites[0].id : websiteId

  const canPrepare = managedIds.includes(selectedWebsiteId)

  const names = new Map(websites.map((website) => [website.id, website.name]))

  const visible = recaps.filter(
    (recap) => !selectedWebsiteId || recap.website_id === selectedWebsiteId,
  )

  async function prepare() {
    if (busy.current || !canPrepare) return

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setActionError("Choose a valid month.")
      return
    }

    busy.current = true
    setSaving(true)
    setActionError("")
    setNotice("")

    try {
      const { data, error: prepareError } = await supabase.rpc(
        "wm_prepare_monthly_recap",
        {
          p_website_id: selectedWebsiteId,
          p_month: `${month}-01`,
        },
      )

      if (prepareError || !data) {
        setActionError(
          prepareError?.code === "22023"
            ? "Choose a completed calendar month."
            : "Could not confirm generation. Refresh before trying again.",
        )
        return
      }

      setNotice(
        "Recap ready. If it already existed, its saved snapshot was preserved.",
      )
      refresh()
    } catch {
      setActionError(
        "Could not confirm generation. Refresh before trying again.",
      )
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  async function publish(recap: MonthlyRecap) {
    if (busy.current) return

    busy.current = true
    setSaving(true)
    setActionError("")
    setNotice("")

    try {
      const { data, error: publishError } = await supabase.rpc(
        "wm_publish_monthly_recap",
        { p_recap_id: recap.id },
      )

      if (publishError || data !== recap.id) {
        setActionError(
          "Could not confirm publication. Refresh to check the result.",
        )
        return
      }

      setNotice(
        "Recap published. Eligible client emails will be processed by the notification worker.",
      )
      refresh()
    } catch {
      setActionError(
        "Could not confirm publication. Refresh to check the result.",
      )
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <section className={`${panelClass} space-y-6`}>
      <div>
        <h2 className="text-xl font-semibold">Monthly recaps</h2>

        <p className="mt-2 text-sm text-muted">
          Completed work, outstanding items, and website updates.
        </p>
      </div>

      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-sm text-muted">
          Loading monthly recaps…
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
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            {websites.length > 1 && (
              <label className={`${labelClass} min-w-52`}>
                Website
                <select
                  value={websiteId}
                  disabled={saving}
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

            <button
              type="button"
              disabled={saving}
              onClick={refresh}
              className={secondaryButtonClass}>
              Refresh
            </button>
          </div>

          {canPrepare && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-sm font-medium">
                Prepare a recap for {names.get(selectedWebsiteId)}
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <label className={labelClass}>
                  Completed month
                  <input
                    type="month"
                    value={month}
                    disabled={saving}
                    onChange={(event) => setMonth(event.currentTarget.value)}
                    className={inputClass}
                  />
                </label>

                <button
                  type="button"
                  disabled={saving || !month}
                  onClick={() => void prepare()}
                  className={secondaryButtonClass}>
                  {saving ? "Saving…" : "Prepare recap"}
                </button>
              </div>
            </div>
          )}

          {total > recaps.length && (
            <p className="text-sm text-muted">
              Showing the latest {recaps.length} recaps. Website filtering
              applies to these loaded records.
            </p>
          )}

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
              No monthly recaps available.
            </p>
          ) : (
            <ul className="space-y-4">
              {visible.map((recap) => (
                <li
                  id={`recap-${recap.id}`}
                  key={recap.id}
                  className="scroll-mt-6 rounded-xl border border-border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">
                        {names.get(recap.website_id)}
                      </p>

                      <h3 className="mt-2 font-sans text-lg font-semibold">
                        {monthLabel(recap.report_month)}
                      </h3>
                    </div>

                    <StatusBadge
                      status={
                        recap.status === "published" ? "completed" : "all"
                      }
                      label={
                        recap.status === "published"
                          ? "Published"
                          : "Private draft"
                      }
                    />
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Read monthly recap
                    </summary>

                    <RecapContents recap={recap} />
                  </details>

                  {recap.status === "draft" &&
                    managedIds.includes(recap.website_id) && (
                      <div className="mt-5 space-y-2">
                        <p className="text-xs text-muted">
                          Publishing makes this saved snapshot visible to
                          assigned clients.
                        </p>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void publish(recap)}
                          className={secondaryButtonClass}>
                          {saving ? "Saving…" : "Publish recap"}
                        </button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
