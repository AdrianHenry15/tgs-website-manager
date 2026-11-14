import { useEffect, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass, inputClass, labelClass } from "./styles"

const updateColumns = "id, body, created_at"

type RequestUpdate = {
  id: string
  body: string
  created_at: string
}

export function RequestUpdates({
  requestId,
  canPost,
}: {
  requestId: string
  canPost: boolean
}) {
  const [open, setOpen] = useState(false)
  const [updates, setUpdates] = useState<RequestUpdate[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [postError, setPostError] = useState("")
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (!open) return

    let active = true

    async function loadUpdates() {
      try {
        const { data, error } = await supabase
          .from("wm_request_updates")
          .select(updateColumns)
          .eq("request_id", requestId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50)

        if (!active) return

        setLoadError(error?.message ?? "")
        setUpdates(data ?? [])
      } catch {
        if (active) {
          setLoadError("Could not load updates. Close and reopen the panel.")
        }
      }
    }

    void loadUpdates()
    return () => {
      active = false
    }
  }, [open, requestId])

  async function postUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canPost || posting || updates === null || loadError) return

    const form = event.currentTarget
    const body = String(new FormData(form).get("body") ?? "").trim()

    if (!body) {
      setPostError("Enter an update before posting.")
      return
    }

    setPostError("")
    setPosting(true)

    try {
      const { data, error } = await supabase
        .from("wm_request_updates")
        .insert({ request_id: requestId, body })
        .select(updateColumns)
        .single()

      if (error) {
        setPostError(error.message)
        return
      }

      setUpdates((current) =>
        [
          data,
          ...(current ?? []).filter((update) => update.id !== data.id),
        ].slice(0, 50),
      )
      form.reset()
    } catch {
      setPostError(
        "Could not confirm the save. Reopen updates before retrying.",
      )
    } finally {
      setPosting(false)
    }
  }

  return (
    <details
      className="rounded-lg border border-zinc-800 p-3 text-sm"
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open
        if (nextOpen && !open) {
          setUpdates(null)
          setLoadError("")
        }
        setOpen(nextOpen)
      }}>
      <summary className="cursor-pointer font-medium">Updates</summary>

      <div className="mt-3 grid gap-3">
        {loadError ? (
          <p role="alert" className="text-red-300">
            {loadError}
          </p>
        ) : updates === null ? (
          <p className="text-zinc-400">Loading updates…</p>
        ) : updates.length === 0 ? (
          <p className="text-zinc-400">No updates yet.</p>
        ) : (
          <ul className="grid gap-3">
            {updates.map((update) => (
              <li
                key={update.id}
                className="min-w-0 rounded-lg bg-zinc-900 p-3">
                <time
                  dateTime={update.created_at}
                  className="text-xs text-zinc-400">
                  {new Date(update.created_at).toLocaleString()}
                </time>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word">
                  {update.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canPost && (
          <form onSubmit={postUpdate} className="grid gap-2">
            <label className={labelClass}>
              Update visible to the client
              <textarea
                name="body"
                rows={3}
                maxLength={5000}
                required
                disabled={posting}
                className={inputClass}
              />
            </label>

            {postError && (
              <p role="alert" className="text-red-300">
                {postError}
              </p>
            )}

            <button
              type="submit"
              disabled={posting || updates === null || Boolean(loadError)}
              className={`${buttonClass} justify-self-start`}>
              {posting ? "Posting…" : "Post update"}
            </button>
          </form>
        )}
      </div>
    </details>
  )
}
