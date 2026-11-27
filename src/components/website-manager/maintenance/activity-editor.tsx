"use client"

import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import {
  buttonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "../styles"
import type { MaintenanceActivity } from "./use-maintenance"

const categories = [
  { value: "general", label: "General maintenance" },
  { value: "content", label: "Content and design" },
  { value: "email_forms", label: "Email and forms" },
  { value: "database", label: "Database" },
  { value: "ai_agents", label: "AI agents" },
  { value: "dependencies", label: "Dependencies" },
  { value: "security", label: "Security" },
]

type ActivityEditorProps = {
  activity: MaintenanceActivity
  disabled: boolean
  onSaved: () => void
}

export function ActivityEditor({
  activity,
  disabled,
  onSaved,
}: ActivityEditorProps) {
  const [open, setOpen] = useState(false)

  if (activity.source !== "one_off") return null

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={secondaryButtonClass}>
        {open ? "Hide editor" : "Edit activity"}
      </button>

      {open && (
        <ActivityEditForm
          key={`${activity.id}:${activity.updated_at}`}
          activity={activity}
          disabled={disabled}
          onSaved={() => {
            setOpen(false)
            onSaved()
          }}
          onClose={() => {
            setOpen(false)
            onSaved()
          }}
        />
      )}
    </div>
  )
}

function ActivityEditForm({
  activity,
  disabled,
  onSaved,
  onClose,
}: {
  activity: MaintenanceActivity
  disabled: boolean
  onSaved: () => void
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (
      disabled ||
      submitting.current ||
      needsRefresh ||
      activity.source !== "one_off"
    ) {
      return
    }

    const fields = new FormData(event.currentTarget)

    const title = String(fields.get("title") ?? "").trim()
    const description = String(fields.get("description") ?? "").trim()
    const category = String(fields.get("category") ?? "")
    const dueOn = String(fields.get("dueOn") ?? "")
    const clientVisible = fields.get("clientVisible") === "on"

    setError("")

    if (!title || title.length > 160 || description.length > 5000) {
      setError(
        "Enter a title up to 160 characters and a description up to 5,000.",
      )
      return
    }

    if (!categories.some((item) => item.value === category)) {
      setError("Choose a valid category.")
      return
    }

    if (dueOn) {
      const parsed = new Date(`${dueOn}T12:00:00Z`)

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== dueOn
      ) {
        setError("Enter a valid due date.")
        return
      }
    }

    submitting.current = true
    setSaving(true)

    try {
      const { data, error: saveError } = await supabase
        .from("wm_activities")
        .update({
          title,
          description,
          category,
          due_on: dueOn || null,
          client_visible: clientVisible,
        })
        .eq("id", activity.id)
        .eq("website_id", activity.website_id)
        .eq("source", "one_off")
        .eq("updated_at", activity.updated_at)
        .select("id")
        .maybeSingle()

      if (saveError) {
        throw new Error(
          "Could not confirm the save. Close and refresh before editing again.",
        )
      }

      if (!data) {
        throw new Error(
          "This item changed or is no longer accessible. Close and refresh to load the latest version.",
        )
      }

      onSaved()
    } catch (failure) {
      setNeedsRefresh(true)
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not confirm the save. Close and refresh before editing again.",
      )
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <fieldset
        disabled={disabled || saving || needsRefresh}
        className="grid gap-4">
        <label className={labelClass}>
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={activity.title}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Description
          <textarea
            name="description"
            rows={4}
            maxLength={5000}
            defaultValue={activity.description}
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Category
            <select
              name="category"
              defaultValue={activity.category}
              className={inputClass}>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Due date (optional)
            <input
              name="dueOn"
              type="date"
              defaultValue={activity.due_on ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            name="clientVisible"
            type="checkbox"
            defaultChecked={activity.client_visible}
            className="size-4 accent-primary"
          />
          Visible to the client
        </label>

        <p className="text-xs text-muted">
          Changes apply to this activity. Previously published monthly
          recaps keep their saved history.
        </p>

        <button
          type="submit"
          className={`${buttonClass} justify-self-start`}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={onClose}
        className={secondaryButtonClass}>
        {needsRefresh ? "Close and refresh" : "Cancel"}
      </button>
    </form>
  )
}