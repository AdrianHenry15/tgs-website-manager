"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import {
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "../styles"
import type { WebsiteRelease } from "./types"

type Props = {
  release: WebsiteRelease
  canManage: boolean
}

type RequestOption = {
  id: string
  title: string
  status: string
}

export function ReleaseRequestLink({ release, canManage }: Props) {
  const [open, setOpen] = useState(false)

  if (release.status !== "published" || !release.client_visible) {
    return null
  }

  return (
    <details
      className="mt-4 rounded-xl border border-border p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">
        {canManage ? "Related request / complete a request" : "Related request"}
      </summary>

      {open && (
        <RequestLinkEditor
          key={release.id}
          release={release}
          canManage={canManage}
        />
      )}
    </details>
  )
}

function RequestLinkEditor({ release, canManage }: Props) {
  const [requests, setRequests] = useState<RequestOption[]>([])
  const [linked, setLinked] = useState<RequestOption | null>(null)
  const [requestId, setRequestId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [revision, setRevision] = useState(0)
  const [mustRefresh, setMustRefresh] = useState(false)

  const submitting = useRef(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError("")
      setMessage("")

      try {
        const { data: link, error: linkError } = await supabase
          .from("wm_release_requests")
          .select("request_id")
          .eq("release_id", release.id)
          .abortSignal(controller.signal)
          .maybeSingle()

        if (linkError) throw new Error("Could not load the related request.")

        if (link) {
          const { data: ticket, error: ticketError } = await supabase
            .from("wm_requests")
            .select("id, title, status")
            .eq("id", link.request_id)
            .eq("website_id", release.website_id)
            .abortSignal(controller.signal)
            .maybeSingle()

          if (ticketError) {
            throw new Error("Could not load the related request.")
          }

          if (!active) return

          setLinked(ticket as RequestOption | null)
          setRequests([])
          setRequestId("")
          setMustRefresh(false)
          return
        }

        if (!canManage) {
          if (!active) return

          setLinked(null)
          setRequests([])
          setRequestId("")
          setMustRefresh(false)
          return
        }

        const [ticketResult, linkResult] = await Promise.all([
          supabase
            .from("wm_requests")
            .select("id, title, status")
            .eq("website_id", release.website_id)
            .is("deleted_at", null)
            .is("purge_started_at", null)
            .neq("status", "live")
            .order("created_at", { ascending: false })
            .limit(100)
            .abortSignal(controller.signal),

          supabase
            .from("wm_release_requests")
            .select("request_id")
            .eq("website_id", release.website_id)
            .abortSignal(controller.signal),
        ])

        if (ticketResult.error || linkResult.error) {
          throw new Error("Could not load available requests.")
        }

        const linkedIds = new Set(
          (linkResult.data ?? []).map(({ request_id }) => request_id),
        )

        const available = (
          (ticketResult.data ?? []) as RequestOption[]
        ).filter((ticket) => !linkedIds.has(ticket.id))

        if (!active) return

        setLinked(null)
        setRequests(available)
        setRequestId(available.length === 1 ? available[0].id : "")
        setMustRefresh(false)
      } catch (caught) {
        if (!active) return

        setLinked(null)
        setRequests([])
        setRequestId("")
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load request information.",
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [release.id, release.website_id, canManage, revision])

  async function completeRequest() {
    if (submitting.current || mustRefresh) return

    const selected = requests.find((ticket) => ticket.id === requestId)

    if (!selected) {
      setError("Choose a request to complete.")
      return
    }

    submitting.current = true
    setSaving(true)
    setError("")
    setMessage("")

    try {
      const { data, error: completionError } = await supabase.rpc(
        "wm_complete_request_with_release",
        {
          p_release_id: release.id,
          p_request_id: selected.id,
          p_expected_status: selected.status,
        },
      )

      if (completionError) {
        setMustRefresh(true)

        setError(
          completionError.code === "40001"
            ? "This request changed. Refresh before completing it."
            : completionError.code === "23505"
              ? "This release or request is already linked. Refresh to check."
              : "Could not confirm completion. Refresh to check the saved result.",
        )
        return
      }

      if (
        !data ||
        typeof data !== "object" ||
        data.releaseId !== release.id ||
        data.requestId !== selected.id ||
        data.status !== "live"
      ) {
        setMustRefresh(true)
        setError(
          "Could not confirm completion. Refresh to check the saved result.",
        )
        return
      }

      setLinked({ ...selected, status: "live" })
      setRequests([])
      setRequestId("")
      setMessage("Request completed and linked to this website update.")
    } catch {
      setMustRefresh(true)
      setError(
        "Could not confirm completion. Refresh to check the saved result.",
      )
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {loading ? (
        <p role="status" className="text-sm text-muted">
          Loading request information…
        </p>
      ) : linked ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{linked.title}</p>

          <a
            href={`/?requestId=${encodeURIComponent(linked.id)}`}
            className={secondaryButtonClass}>
            Open request
          </a>
        </div>
      ) : !error && canManage ? (
        requests.length > 0 ? (
          <>
            <label className={labelClass}>
              Request completed by this update

              <select
                value={requestId}
                disabled={saving || mustRefresh}
                onChange={(event) =>
                  setRequestId(event.currentTarget.value)
                }
                className={inputClass}>
                <option value="">Choose a request</option>

                {requests.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.title}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-sm text-muted">
              Links this published update and marks the selected request
              Live. Only complete work already verified on the website.
            </p>

            <button
              type="button"
              disabled={saving || mustRefresh || !requestId}
              onClick={() => void completeRequest()}
              className={secondaryButtonClass}>
              {saving ? "Completing…" : "Link and mark Live"}
            </button>

            <p className="text-xs text-muted">
              Lists eligible requests from the latest 100 active,
              non-Live requests for this website.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            No eligible requests found. Website updates can also be
            recorded without a client request.
          </p>
        )
      ) : !error ? (
        <p className="text-sm text-muted">
          No related request is available.
        </p>
      ) : null}

      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {!loading && (
        <button
          type="button"
          disabled={saving}
          onClick={() => setRevision((current) => current + 1)}
          className={secondaryButtonClass}>
          Refresh request information
        </button>
      )}
    </div>
  )
}