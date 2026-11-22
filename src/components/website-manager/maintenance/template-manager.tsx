"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import {
  buttonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "../styles"

type Website = {
  id: string
  name: string
}

type MaintenanceTemplate = {
  id: string
  website_id: string
  title: string
  description: string
  category: string
  client_visible: boolean
  paused: boolean
  starts_month: string
  updated_at: string
}

type TemplateManagerProps = {
  websites: Website[]
  onChanged: () => void
}

const categories = [
  ["general", "General maintenance"],
  ["content", "Content and design"],
  ["email_forms", "Email and forms"],
  ["database", "Database"],
  ["ai_agents", "AI agents"],
  ["dependencies", "Dependencies"],
  ["security", "Security"],
] as const

export function TemplateManager({ websites, onChanged }: TemplateManagerProps) {
  const [websiteId, setWebsiteId] = useState(websites[0]?.id ?? "")
  const [templates, setTemplates] = useState<MaintenanceTemplate[]>([])
  const [editing, setEditing] = useState<MaintenanceTemplate | "new" | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError("")

      try {
        const { data, error: loadError } = await supabase
          .from("wm_maintenance_templates")
          .select(
            "id, website_id, title, description, category, client_visible, paused, starts_month, updated_at",
          )
          .eq("website_id", websiteId)
          .order("title")

        if (loadError) throw new Error(loadError.message)

        if (active) {
          setTemplates((data ?? []) as MaintenanceTemplate[])
        }
      } catch (failure) {
        if (active) {
          setTemplates([])
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load templates.",
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    if (websiteId) {
      void load()
    }

    return () => {
      active = false
    }
  }, [websiteId, revision])

  function saved() {
    setEditing(null)
    setRevision((current) => current + 1)
    onChanged()
  }

  return (
    <div className="mt-5 space-y-5">
      <p className="text-sm text-muted">
        Templates create monthly tasks. Pausing a template keeps its existing
        activity history.
      </p>

      <label className={labelClass}>
        Website
        <select
          value={websiteId}
          disabled={editing !== null}
          onChange={(event) => setWebsiteId(event.currentTarget.value)}
          className={inputClass}>
          {websites.map((website) => (
            <option key={website.id} value={website.id}>
              {website.name}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      )}

      {editing !== null ? (
        <TemplateForm
          key={editing === "new" ? `new:${websiteId}` : editing.id}
          websiteId={websiteId}
          template={editing === "new" ? null : editing}
          onSaved={saved}
          onCancel={() => setEditing(null)}
          onReload={() => {
            setEditing(null)
            setRevision((current) => current + 1)
          }}
        />
      ) : (
        <>
          <button
            type="button"
            disabled={loading || !websiteId || !!error}
            onClick={() => setEditing("new")}
            className={buttonClass}>
            Add monthly template
          </button>

          {loading ? (
            <p role="status" className="text-sm text-muted">
              Loading templates…
            </p>
          ) : !error && templates.length === 0 ? (
            <p className="text-sm text-muted">
              No recurring templates for this website yet.
            </p>
          ) : (
            <ul className="grid gap-3">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="wrap-break-word font-sans font-semibold">
                      {template.title}
                    </h3>

                    <p className="mt-2 text-xs text-muted">
                      {template.paused ? "Paused" : "Active"}
                      {" · "}
                      {template.client_visible
                        ? "Client-facing tasks"
                        : "Internal tasks"}
                      {" · Starts "}
                      {template.starts_month.slice(0, 7)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditing(template)}
                    className={secondaryButtonClass}
                    aria-label={`Edit ${template.title}`}>
                    Edit template
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function TemplateForm({
  websiteId,
  template,
  onSaved,
  onCancel,
  onReload,
}: {
  websiteId: string
  template: MaintenanceTemplate | null
  onSaved: () => void
  onCancel: () => void
  onReload: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [conflict, setConflict] = useState(false)

  const savingRef = useRef(false)
  const newId = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return

    const fields = new FormData(event.currentTarget)
    const title = String(fields.get("title") ?? "").trim()
    const description = String(fields.get("description") ?? "").trim()
    const category = String(fields.get("category") ?? "")

    if (
      !title ||
      title.length > 160 ||
      description.length > 5000 ||
      !categories.some(([value]) => value === category)
    ) {
      setError("Check the title, description, and category.")
      return
    }

    savingRef.current = true
    setSaving(true)
    setError("")
    setConflict(false)

    try {
      newId.current ??= crypto.randomUUID()

      const { error: saveError } = await supabase.rpc(
        "wm_save_maintenance_template",
        {
          p_id: template?.id ?? newId.current,
          p_website_id: websiteId,
          p_title: title,
          p_description: description,
          p_category: category,
          p_client_visible: fields.get("clientVisible") === "on",
          p_paused: fields.get("paused") === "on",
          p_include_current_month: template
            ? fields.get("includeCurrent") === "on"
            : fields.get("start") === "current",
          p_expected_updated_at: template?.updated_at ?? null,
        },
      )

      if (saveError) {
        setConflict(saveError.code === "40001")
        throw new Error(saveError.message)
      }

      onSaved()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not confirm the save. Reload templates to check.",
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="grid gap-4">
        <h3 className="font-sans font-semibold">
          {template ? "Edit monthly template" : "New monthly template"}
        </h3>

        <label className={labelClass}>
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={template?.title ?? ""}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={template?.description ?? ""}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Category
          <select
            name="category"
            defaultValue={template?.category ?? "general"}
            className={inputClass}>
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {!template && (
          <label className={labelClass}>
            First activity
            <select name="start" defaultValue="current" className={inputClass}>
              <option value="current">Add to this month</option>
              <option value="next">Start next month</option>
            </select>
          </label>
        )}

        <label className="flex items-center gap-3 text-sm">
          <input
            name="clientVisible"
            type="checkbox"
            defaultChecked={template?.client_visible ?? false}
            className="size-4 accent-primary"
          />
          Generated tasks are visible to the client
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            name="paused"
            type="checkbox"
            defaultChecked={template?.paused ?? false}
            className="size-4 accent-primary"
          />
          Pause monthly generation
        </label>

        {template && (
          <label className="flex items-start gap-3 text-sm">
            <input
              name="includeCurrent"
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
            />
            Add this month’s task if missing and the template is eligible
          </label>
        )}

        <p className="text-xs text-muted">
          Tasks are due at month-end. Changes affect future generated tasks.
          Existing tasks keep their saved content. Paused templates do not
          generate tasks.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass}>
            {saving ? "Saving…" : "Save template"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className={secondaryButtonClass}>
            Cancel
          </button>

          {conflict && (
            <button
              type="button"
              onClick={onReload}
              className={secondaryButtonClass}>
              Reload templates
            </button>
          )}
        </div>
      </fieldset>
    </form>
  )
}
