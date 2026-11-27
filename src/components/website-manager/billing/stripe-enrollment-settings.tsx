"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"

type Approval = {
  website_id: string
  billing_user_id: string | null
  first_charge_on: string
  billing_timezone: string
  previous_provider: "square" | "manual"
  outside_paid_through: string | null
  recurring_collection_stopped: boolean
  approved: boolean
  updated_at: string
}

type Candidate = {
  user_id: string
  email: string
  display_name: string
}

type Snapshot = {
  revision: number
  websites: { id: string; name: string }[]
  approvals: Approval[]
  error: string
}

export function StripeEnrollmentSettings() {
  const [websiteId, setWebsiteId] = useState("")
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const [websites, managed, approvals] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name")
            .order("name")
            .abortSignal(controller.signal),

          supabase
            .rpc("wm_managed_website_ids")
            .abortSignal(controller.signal),

          supabase
            .from("wm_stripe_enrollment_approvals")
            .select(
              "website_id, billing_user_id, first_charge_on, billing_timezone, previous_provider, outside_paid_through, recurring_collection_stopped, approved, updated_at",
            )
            .abortSignal(controller.signal),
        ])

        if (websites.error || managed.error || approvals.error) {
          throw new Error("Enrollment lookup failed.")
        }

        const ids = new Set(
          (
            (managed.data ?? []) as { website_id: string }[]
          ).map((item) => item.website_id),
        )

        if (!active) return

        setSnapshot({
          revision,
          websites: (websites.data ?? []).filter((website) =>
            ids.has(website.id),
          ),
          approvals: (approvals.data ?? []) as Approval[],
          error: "",
        })
      } catch {
        if (!active) return

        setSnapshot({
          revision,
          websites: [],
          approvals: [],
          error: "Could not load Stripe enrollment settings.",
        })
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [revision])

  function refresh() {
    setRevision((current) => current + 1)
  }

  if (!snapshot || snapshot.revision !== revision) {
    return (
      <section className={panelClass}>
        <p role="status" className="text-sm text-muted">
          Loading enrollment settings…
        </p>
      </section>
    )
  }

  if (snapshot.error) {
    return (
      <section className={`${panelClass} space-y-3`}>
        <p role="alert" className="text-sm text-red-400">
          {snapshot.error}
        </p>

        <button
          type="button"
          onClick={refresh}
          className={secondaryButtonClass}>
          Try again
        </button>
      </section>
    )
  }

  if (snapshot.websites.length === 0) return null

  const selectedId =
    snapshot.websites.length === 1
      ? snapshot.websites[0].id
      : websiteId

  const approval =
    snapshot.approvals.find(
      (item) => item.website_id === selectedId,
    ) ?? null

  return (
    <section className={`${panelClass} space-y-5`}>
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="font-semibold">Stripe enrollment planning</h3>

        <button
          type="button"
          onClick={refresh}
          className={secondaryButtonClass}>
          Refresh
        </button>
      </div>

      <p className="text-sm text-muted">
        Designate the billing contact and confirm the transition from
        outside payments. Saving does not start a subscription or cancel
        collection in another service.
      </p>

      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}

      {snapshot.websites.length > 1 && (
        <label className={labelClass}>
          Website
          <select
            value={websiteId}
            onChange={(event) => {
              setWebsiteId(event.currentTarget.value)
              setNotice("")
            }}
            className={inputClass}>
            <option value="">Choose a website</option>

            {snapshot.websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedId && (
        <EnrollmentForm
          key={`${selectedId}:${approval?.updated_at ?? "new"}`}
          websiteId={selectedId}
          approval={approval}
          onSaved={() => {
            setNotice("Enrollment configuration saved.")
            refresh()
          }}
        />
      )}
    </section>
  )
}

function EnrollmentForm({
  websiteId,
  approval,
  onSaved,
}: {
  websiteId: string
  approval: Approval | null
  onSaved: () => void
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [error, setError] = useState("")
  const [provider, setProvider] = useState(
    approval?.previous_provider ?? "square",
  )
  const [saving, setSaving] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)

  const busy = useRef(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadCandidates() {
      try {
        const { data, error } = await supabase
          .rpc("wm_website_billing_candidates", {
            p_website_id: websiteId,
          })
          .abortSignal(controller.signal)

        if (!active) return

        if (error) {
          setLoadError("Could not load assigned billing contacts.")
          return
        }

        setCandidates((data ?? []) as Candidate[])
      } catch {
        if (active) {
          setLoadError("Could not load assigned billing contacts.")
        }
      }
    }

    void loadCandidates()

    return () => {
      active = false
      controller.abort()
    }
  }, [websiteId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || needsRefresh) return

    const form = new FormData(event.currentTarget)
    const month = String(form.get("firstMonth") ?? "")
    const billingUserId = String(form.get("billingUserId") ?? "")
    const paidThrough = String(form.get("paidThrough") ?? "")

    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !candidates?.some((item) => item.user_id === billingUserId)
    ) {
      setError("Choose an assigned billing contact and start month.")
      return
    }

    busy.current = true
    setSaving(true)
    setError("")

    try {
      const { data, error: saveError } = await supabase.rpc(
        "wm_save_stripe_enrollment_approval",
        {
          p_website_id: websiteId,
          p_billing_user_id: billingUserId,
          p_first_charge_on: `${month}-01`,
          p_previous_provider: provider,
          p_outside_paid_through: paidThrough || null,
          p_recurring_collection_stopped:
            form.get("collectionStopped") === "on",
          p_approved: form.get("approved") === "on",
          p_expected_updated_at: approval?.updated_at ?? null,
        },
      )

      if (saveError || !data) {
        if (saveError?.code === "22023") {
          setError(saveError.message)
        } else {
          setNeedsRefresh(true)
          setError(
            "Could not confirm the save. Refresh this panel before trying again.",
          )
        }

        return
      }

      onSaved()
    } catch {
      setNeedsRefresh(true)
      setError(
        "Could not confirm the save. Refresh this panel to check the result.",
      )
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-red-400">
        {loadError} Refresh this panel to retry.
      </p>
    )
  }

  if (candidates === null) {
    return (
      <p role="status" className="text-sm text-muted">
        Loading assigned contacts…
      </p>
    )
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted">
        Assign a client account to this website before configuring its
        billing contact.
      </p>
    )
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset
        disabled={saving || needsRefresh}
        className="space-y-4">
        <label className={labelClass}>
          Billing contact
          <select
            name="billingUserId"
            required
            defaultValue={
              approval?.billing_user_id ??
              (candidates.length === 1 ? candidates[0].user_id : "")
            }
            className={inputClass}>
            <option value="">Choose an assigned contact</option>

            {candidates.map((candidate) => (
              <option key={candidate.user_id} value={candidate.user_id}>
                {candidate.display_name} · {candidate.email}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            First Stripe billing month
            <input
              name="firstMonth"
              type="month"
              required
              defaultValue={approval?.first_charge_on.slice(0, 7) ?? ""}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Previous payment arrangement
            <select
              value={provider}
              onChange={(event) =>
                setProvider(
                  event.currentTarget.value === "square"
                    ? "square"
                    : "manual",
                )
              }
              className={inputClass}>
              <option value="square">Square recurring collection</option>
              <option value="manual">Manual / other outside payments</option>
            </select>
          </label>
        </div>

        <label className={labelClass}>
          Confirmed outside paid-through date
          <input
            name="paidThrough"
            type="date"
            defaultValue={approval?.outside_paid_through ?? ""}
            className={inputClass}
          />
        </label>

        {provider === "square" && (
          <label className="flex items-start gap-3 text-sm">
            <input
              name="collectionStopped"
              type="checkbox"
              defaultChecked={
                approval?.recurring_collection_stopped ?? false
              }
              className="mt-1"
            />

            <span>
              I confirmed Square recurring collection has been stopped
              for the transition.
            </span>
          </label>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input
            name="approved"
            type="checkbox"
            defaultChecked={approval?.approved ?? false}
            className="mt-1"
          />

          <span>Approve this configuration for client enrollment.</span>
        </label>

        <p className="text-xs text-muted">
          You can save an unapproved configuration while confirming the
          details. An outside paid-through date cannot overlap the first
          Stripe billing month.
        </p>

        {approval && (
          <p className="text-xs text-muted">
            Billing timezone: {approval.billing_timezone}
          </p>
        )}

        <button type="submit" className={secondaryButtonClass}>
          {saving ? "Saving…" : "Save enrollment configuration"}
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  )
}