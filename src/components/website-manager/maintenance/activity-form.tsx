"use client"

import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass, inputClass, labelClass } from "../styles"

type Website = {
  id: string
  name: string
}

type ActivityFormProps = {
  websites: Website[]
  month: string
  initialWebsiteId: string
  onSaved: () => void
}

const categories = [
  { value: "general", label: "General maintenance" },
  { value: "content", label: "Content and design" },
  { value: "email_forms", label: "Email and forms" },
  { value: "database", label: "Database" },
  { value: "ai_agents", label: "AI agents" },
  { value: "dependencies", label: "Dependencies" },
  { value: "security", label: "Security" },
]

export function ActivityForm({
  websites,
  month,
  initialWebsiteId,
  onSaved,
}: ActivityFormProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const pendingId = useRef<string | null>(null)
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return

    const fields = new FormData(event.currentTarget)
    const websiteId = String(fields.get("websiteId") ?? "")
    const title = String(fields.get("title") ?? "").trim()
    const description = String(fields.get("description") ?? "").trim()
    const category = String(fields.get("category") ?? "general")
    const dueOn = String(fields.get("dueOn") ?? "")
    const completed = fields.get("completed") === "on"
    const clientVisible = fields.get("clientVisible") === "on"

    setError("")

    if (!websites.some((website) => website.id === websiteId)) {
      setError("Choose a website you manage.")
      return
    }

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

    submitting.current = true
    setSaving(true)

    try {
      pendingId.current ??= crypto.randomUUID()

      const id = pendingId.current

      const { error: saveError } = await supabase.from("wm_activities").upsert(
        {
          id,
          website_id: websiteId,
          source: "one_off",
          report_month: `${month}-01`,
          title,
          description,
          category,
          status: completed ? "completed" : "open",
          client_visible: clientVisible,
          due_on: dueOn || null,
        },
        {
          onConflict: "id",
          ignoreDuplicates: true,
        },
      )

      if (saveError) throw new Error(saveError.message)

      // Confirm the row exists before reporting success.
      const { data, error: confirmationError } = await supabase
        .from("wm_activities")
        .select("id")
        .eq("id", id)
        .maybeSingle()

      if (confirmationError) throw new Error(confirmationError.message)

      if (!data) {
        throw new Error("Could not confirm the saved activity.")
      }

      pendingId.current = null
      onSaved()
    } catch (failure) {
      setError(
        `${
          failure instanceof Error
            ? failure.message
            : "Could not confirm the save."
        } Refresh Maintenance to check before adding another item.`,
      )
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <fieldset disabled={saving} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Website
            <select
              name="websiteId"
              required
              defaultValue={
                websites.some((website) => website.id === initialWebsiteId)
                  ? initialWebsiteId
                  : websites.length === 1
                    ? websites[0].id
                    : ""
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

          <label className={labelClass}>
            Category
            <select
              name="category"
              defaultValue="general"
              className={inputClass}>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          Title
          <input
            name="title"
            required
            maxLength={160}
            placeholder="Refresh the homepage services section"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            placeholder="Describe the work completed or still needed."
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Due date (optional)
          <input name="dueOn" type="date" className={inputClass} />
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            name="completed"
            type="checkbox"
            className="size-4 accent-primary"
          />
          This work is already completed
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            name="clientVisible"
            type="checkbox"
            className="size-4 accent-primary"
          />
          Visible to the client
        </label>

        <p className="text-xs text-muted">
          Saved to {month}. Items remain internal unless you enable client
          visibility.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        )}

        <button type="submit" className={`${buttonClass} justify-self-start`}>
          {saving ? "Saving…" : "Save activity"}
        </button>
      </fieldset>
    </form>
  )
}
