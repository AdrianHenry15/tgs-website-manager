import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass, inputClass, labelClass } from "../styles"

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
  const [postNotice, setPostNotice] = useState("")
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

  async function postUpdate(event: React.ChangeEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canPost || posting || updates === null || loadError) return

    const form = event.currentTarget
    const body = String(new FormData(form).get("body") ?? "").trim()

    setPostError("")
    setPostNotice("")

    if (!body) {
      setPostError("Enter an update before posting.")
      return
    }

    setPosting(true)

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (sessionError || !token) {
        setPostError("Sign in again to post an update.")
        return
      }

      const response = await fetch("/api/requests/updates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, body }),
      })

      const result = (await response.json()) as {
        update?: RequestUpdate
        emailStatus?: "accepted" | "disabled" | "unconfirmed" | "skipped"
        error?: string
      }

      if (!response.ok || !result.update) {
        setPostError(
          result.error ??
            "Could not confirm the save. Reopen updates before retrying.",
        )
        return
      }

      const update = result.update

      setUpdates((current) =>
        [
          update,
          ...(current ?? []).filter((item) => item.id !== update.id),
        ].slice(0, 50),
      )

      form.reset()
      setPostNotice(
        result.emailStatus === "unconfirmed"
          ? "Update posted. We couldn’t confirm the client email."
          : "Update posted.",
      )
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

            {postNotice && (
              <p role="status" className="text-sm text-stone-300">
                {postNotice}
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
