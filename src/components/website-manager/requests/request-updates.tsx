"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import {
  buttonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "../styles"

type RequestUpdate = {
  id: string
  body: string
  author_kind: "team" | "client"
  created_at: string
}

type PendingMessage = {
  id: string
  body: string
}

export function RequestUpdates({
  requestId,
  canPost,
  canManage = false,
}: {
  requestId: string
  canPost: boolean
  canManage?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <details
      className="rounded-lg border border-border p-3 text-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">
        Messages and updates
      </summary>

      {open && (
        <Conversation
          key={requestId}
          requestId={requestId}
          canPost={canPost}
          canManage={canManage}
        />
      )}
    </details>
  )
}

function Conversation({
  requestId,
  canPost,
  canManage,
}: {
  requestId: string
  canPost: boolean
  canManage: boolean
}) {
  const [updates, setUpdates] = useState<RequestUpdate[] | null>(null)
  const [body, setBody] = useState("")
  const [pending, setPending] = useState<PendingMessage | null>(null)
  const [loadError, setLoadError] = useState("")
  const [postError, setPostError] = useState("")
  const [notice, setNotice] = useState("")
  const [posting, setPosting] = useState(false)
  const [revision, setRevision] = useState(0)

  const submitting = useRef(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const { data, error } = await supabase
          .from("wm_request_updates")
          .select("id, body, author_kind, created_at")
          .eq("request_id", requestId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50)
          .abortSignal(controller.signal)

        if (!active) return

        if (error) {
          setLoadError("Could not load messages. Try refreshing.")
          return
        }

        setUpdates((data ?? []) as RequestUpdate[])
        setLoadError("")
      } catch {
        if (active) {
          setLoadError("Could not load messages. Try refreshing.")
        }
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [requestId, revision])

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting.current || !canPost || updates === null || loadError) {
      return
    }

    const message = pending ?? {
      id: crypto.randomUUID(),
      body: body.trim(),
    }

    if (!message.body || message.body.length > 5000) {
      setPostError("Enter a message of up to 5,000 characters.")
      return
    }

    submitting.current = true
    setPosting(true)
    setPostError("")
    setNotice("")
    setPending(message)

    try {
      const { data, error } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (error || !token) {
        setPending(null)
        setPostError("Sign in again to post a message.")
        return
      }

      const response = await fetch("/api/requests/updates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          messageId: message.id,
          body: message.body,
        }),
      })

      const result = (await response.json()) as {
        update?: RequestUpdate
        error?: string
      }

      if (!response.ok || !result.update) {
        // Validation and access failures did not save a message.
        if ([400, 401, 403].includes(response.status)) {
          setPending(null)
        }

        setPostError(
          result.error ?? "Could not confirm the save. Retry the same message.",
        )
        return
      }

      const saved = result.update

      setUpdates((current) =>
        [
          saved,
          ...(current ?? []).filter((item) => item.id !== saved.id),
        ].slice(0, 50),
      )

      setBody("")
      setPending(null)
      setNotice("Message posted.")
    } catch {
      setPostError("Could not confirm the save. Retry the same message.")
    } finally {
      submitting.current = false
      setPosting(false)
    }
  }

  return (
    <div className="mt-3 grid gap-4">
      <button
        type="button"
        disabled={posting}
        onClick={() => setRevision((current) => current + 1)}
        className={`${secondaryButtonClass} justify-self-start`}>
        Refresh messages
      </button>

      {loadError ? (
        <p role="alert" className="text-red-300">
          {loadError}
        </p>
      ) : updates === null ? (
        <p role="status" className="text-muted">
          Loading messages…
        </p>
      ) : updates.length === 0 ? (
        <p className="text-muted">No messages yet.</p>
      ) : (
        <ul className="grid gap-3">
          {updates.map((update) => (
            <li
              key={update.id}
              className={`min-w-0 rounded-lg border p-3 ${
                update.author_kind === "team"
                  ? "border-border bg-surface-secondary"
                  : "border-primary/30 bg-primary/10"
              }`}>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-xs font-medium">
                  {update.author_kind === "team"
                    ? "Third Generation Studios"
                    : "Client"}
                </span>

                <time
                  dateTime={update.created_at}
                  className="text-xs text-muted">
                  {new Date(update.created_at).toLocaleString()}
                </time>
              </div>

              <p className="mt-2 whitespace-pre-wrap wrap-break-word">
                {update.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {updates?.length === 50 && (
        <p className="text-xs text-muted">Showing the latest 50 messages.</p>
      )}

      {canPost && (
        <form onSubmit={postMessage} className="grid gap-3">
          <label className={labelClass}>
            {canManage
              ? "Message visible to the client"
              : "Reply to Third Generation Studios"}

            <textarea
              name="body"
              rows={4}
              maxLength={5000}
              required
              value={body}
              onChange={(event) => setBody(event.currentTarget.value)}
              disabled={posting || pending !== null}
              className={inputClass}
            />
          </label>

          {pending && !posting && (
            <p className="text-xs text-muted">
              Your previous attempt is awaiting confirmation. Retry it using the
              same message ID.
            </p>
          )}

          {postError && (
            <p role="alert" className="text-red-300">
              {postError}
            </p>
          )}

          {notice && (
            <p role="status" className="text-foreground">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={posting || updates === null || Boolean(loadError)}
            className={`${buttonClass} justify-self-start`}>
            {posting ? "Posting…" : pending ? "Retry message" : "Post message"}
          </button>
        </form>
      )}
    </div>
  )
}
