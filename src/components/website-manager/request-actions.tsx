"use client"

import { useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass, inputClass, labelClass } from "./styles"

type RequestActionRecord = {
  id: string
  status: string
  title: string
  description: string
  kind: "bug" | "change"
  page_url: string | null
  submitted_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  purge_started_at: string | null
}

type RequestAction =
  | "edit"
  | "trash"
  | "restore"
  | "begin_purge"
  | "finish_purge"

const actionClass =
  "rounded-lg border border-stone-700 px-3 py-2 text-sm font-medium text-stone-200 hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50"

export function RequestActions<T extends RequestActionRecord>({
  request,
  viewerId,
  isOwner,
  onChanged,
}: {
  request: T
  viewerId: string
  isOwner: boolean
  onChanged: (request: T | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const isTrashed = request.deleted_at !== null
  const isPurging = request.purge_started_at !== null
  const isSubmitter = request.submitted_by === viewerId
  const isReceived = request.status === "received"
  const canEdit = !isTrashed && isReceived && (isOwner || isSubmitter)
  const canTrash = !isTrashed && (isOwner || (isSubmitter && isReceived))
  const canRestore =
    isTrashed &&
    !isPurging &&
    (isOwner || (isSubmitter && request.deleted_by === viewerId))
  const canPurge = isOwner && isTrashed

  async function runAction(action: RequestAction, fields?: FormData) {
    const { data, error } = await supabase.rpc("wm_request_action", {
      p_request_id: request.id,
      p_action: action,
      ...(fields && {
        p_title: String(fields.get("title") ?? ""),
        p_description: String(fields.get("description") ?? ""),
        p_kind: String(fields.get("kind") ?? ""),
        p_page_url: String(fields.get("pageUrl") ?? ""),
      }),
    })

    if (error) throw new Error(error.message)

    return data as T | null
  }

  async function saveAction(
    action: "edit" | "trash" | "restore",
    fields?: FormData,
  ) {
    if (busy) return

    setError("")
    setBusy(true)

    try {
      const updated = await runAction(action, fields)
      if (!updated) throw new Error("The request could not be updated.")

      onChanged(updated)
      setEditing(false)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update the request.",
      )
    } finally {
      setBusy(false)
    }
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveAction("edit", new FormData(event.currentTarget))
  }

  async function permanentlyDelete() {
    if (busy || !canPurge) return

    if (
      !isPurging &&
      !window.confirm(
        "Permanently delete this request, its screenshot, updates, and logged time? This cannot be undone.",
      )
    ) {
      return
    }

    setError("")
    setBusy(true)

    try {
      const started = await runAction("begin_purge")
      if (!started) throw new Error("Could not start permanent deletion.")
      onChanged(started)

      const { error } = await supabase.storage
        .from("wm-request-screenshots")
        .remove([`${request.id}/screenshot`])

      if (error) throw new Error(error.message)

      await runAction("finish_purge")
      onChanged(null)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not finish deletion. Refresh Trash and retry.",
      )
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit && !canTrash && !canRestore && !canPurge) return null

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            aria-expanded={editing}
            onClick={() => setEditing((current) => !current)}
            className={actionClass}>
            {editing ? "Close editor" : "Edit request"}
          </button>
        )}
        {canTrash && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAction("trash")}
            className={actionClass}>
            Move to Trash
          </button>
        )}
        {canRestore && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAction("restore")}
            className={actionClass}>
            Restore
          </button>
        )}
        {canPurge && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void permanentlyDelete()}
            className={`${actionClass} text-red-300 hover:border-red-400`}>
            {busy
              ? "Working…"
              : isPurging
                ? "Retry permanent deletion"
                : "Delete permanently"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      {editing && canEdit && (
        <form onSubmit={submitEdit}>
          <fieldset disabled={busy} className="grid gap-3">
            <label className={labelClass}>
              Title
              <input
                name="title"
                defaultValue={request.title}
                required
                maxLength={160}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Description
              <textarea
                name="description"
                defaultValue={request.description}
                required
                maxLength={5000}
                rows={4}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Request type
              <select
                name="kind"
                defaultValue={request.kind}
                className={inputClass}>
                <option value="bug">Something is broken</option>
                <option value="change">Request a change</option>
              </select>
            </label>
            <label className={labelClass}>
              Page URL (optional)
              <input
                name="pageUrl"
                type="url"
                defaultValue={request.page_url ?? ""}
                maxLength={2048}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              className={`${buttonClass} justify-self-start`}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </fieldset>
        </form>
      )}
    </div>
  )
}
