"use client"

import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { inputClass, labelClass, secondaryButtonClass } from "../styles"
import type { ReleaseWebsite, WebsiteRelease } from "./types"

type Props = {
  websites: ReleaseWebsite[]
  release: WebsiteRelease | null
  onSaved: () => void
  onCancel: () => void
}

function today() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  function part(type: Intl.DateTimeFormatPartTypes) {
    return parts.find((item) => item.type === type)?.value ?? ""
  }

  return `${part("year")}-${part("month")}-${part("day")}`
}

function readText(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === "string" ? value.trim() : ""
}

export function ReleaseForm({ websites, release, onSaved, onCancel }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [uncertain, setUncertain] = useState(false)

  const submitting = useRef(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting.current || uncertain) return

    const form = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent).submitter

    const publish =
      submitter instanceof HTMLButtonElement && submitter.value === "publish"

    const websiteId = readText(form, "websiteId")
    const title = readText(form, "title")
    const summary = readText(form, "summary")
    const liveUrl = readText(form, "liveUrl")
    const publishedOn = readText(form, "publishedOn")

    setError("")

    if (!websites.some((website) => website.id === websiteId)) {
      setError("Choose a website you manage.")
      return
    }

    if (!title || title.length > 160 || !summary || summary.length > 5000) {
      setError("Enter a title and summary within the displayed limits.")
      return
    }

    try {
      const url = new URL(liveUrl)

      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error("Invalid URL")
      }
    } catch {
      setError("Enter a complete HTTP or HTTPS link to the updated page.")
      return
    }

    const parsedDate = new Date(`${publishedOn}T12:00:00Z`)

    if (
      publishedOn &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn) ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== publishedOn)
    ) {
      setError("Enter a valid publication date.")
      return
    }

    if (publish && (!publishedOn || publishedOn > today())) {
      setError("Choose today or an earlier date for a published release.")
      return
    }

    submitting.current = true
    setSaving(true)

    const values = {
      website_id: websiteId,
      title,
      summary,
      live_url: liveUrl,
      published_on: publishedOn || null,
      status: publish ? "published" : "draft",
      client_visible: form.get("clientVisible") === "on",
    }

    try {
      // Existing records use optimistic concurrency to avoid overwriting
      // changes made in another tab.
      const result = release
        ? await supabase
            .from("wm_releases")
            .update(values)
            .eq("id", release.id)
            .eq("website_id", release.website_id)
            .eq("source", "manual")
            .eq("updated_at", release.updated_at)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("wm_releases")
            .insert({
              id: crypto.randomUUID(),
              ...values,
              source: "manual",
            })
            .select("id")
            .single()

      if (result.error) {
        // A network failure can occur after the database committed.
        // Require checking history before submitting another write.
        setUncertain(true)
        setError(
          "Could not confirm the save. Return to history and refresh before trying again.",
        )
        return
      }

      if (!result.data) {
        setUncertain(true)
        setError(
          "This release changed or is no longer editable. Return to history and refresh.",
        )
        return
      }

      onSaved()
    } catch {
      setUncertain(true)
      setError(
        "Could not confirm the save. Return to history and refresh before trying again.",
      )
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-4">
      <h3 className="font-semibold">
        {release ? "Edit release" : "Record a website update"}
      </h3>

      <fieldset disabled={saving || uncertain} className="space-y-4">
        <label className={labelClass}>
          Website
          <select
            name="websiteId"
            required
            disabled={Boolean(release)}
            defaultValue={
              release?.website_id ??
              (websites.length === 1 ? websites[0].id : "")
            }
            className={inputClass}>
            <option value="" disabled>
              Choose a website
            </option>

            {websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </select>
        </label>

        {release && (
          <input type="hidden" name="websiteId" value={release.website_id} />
        )}

        <label className={labelClass}>
          Update title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={release?.title ?? ""}
            placeholder="Updated the equipment product pages"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Completion summary
          <textarea
            name="summary"
            required
            maxLength={5000}
            rows={5}
            defaultValue={release?.summary ?? ""}
            placeholder="Explain what changed and what the client can now see or do."
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Publication date
            <input
              type="date"
              name="publishedOn"
              max={today()}
              defaultValue={release?.published_on ?? today()}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Live page link
            <input
              type="url"
              name="liveUrl"
              required
              maxLength={2048}
              defaultValue={release?.live_url ?? ""}
              placeholder="https://"
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="clientVisible"
            defaultChecked={release?.client_visible ?? true}
            className="mt-1"
          />

          <span>Show this update to the client when published</span>
        </label>

        <p className="text-sm text-muted">
          Drafts remain private. Publish only after confirming the update is
          live on the production website.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="submit" value="draft" className={secondaryButtonClass}>
            {saving ? "Saving…" : "Save as draft"}
          </button>

          <button
            type="submit"
            value="publish"
            className={secondaryButtonClass}>
            {saving
              ? "Saving…"
              : release?.status === "published"
                ? "Save published update"
                : "Publish update"}
          </button>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
        className={secondaryButtonClass}>
        {uncertain ? "Return to history" : "Cancel"}
      </button>
    </form>
  )
}
