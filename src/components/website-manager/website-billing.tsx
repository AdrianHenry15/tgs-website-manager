"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { panelClass, secondaryButtonClass } from "./styles"

type BillingRow = {
  websiteId: string
  websiteName: string
  status: string
  canUpdatePaymentMethod: boolean
}

type BillingResponse = {
  billing: BillingRow[]
  mode: "test" | "live"
}

const statusLabels: Partial<Record<string, string>> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment past due",
  unpaid: "Unpaid",
  paused: "Paused",
  canceled: "Canceled",
  incomplete: "Setup incomplete",
  incomplete_expired: "Setup expired",
  unavailable: "Status unavailable",
}

export function WebsiteBilling() {
  const [billing, setBilling] = useState<BillingRow[]>([])
  const [mode, setMode] = useState<"test" | "live" | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  const [opening, setOpening] = useState<string | null>(null)
  const [portalError, setPortalError] = useState("")

  useEffect(() => {
    const controller = new AbortController()

    async function loadBilling() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()

        if (controller.signal.aborted) return

        const token = data.session?.access_token

        if (sessionError || !token) {
          setError("Sign in again to check billing.")
          return
        }

        const response = await fetch("/api/maintenance/billing", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        })

        if (response.status === 404) {
          if (!controller.signal.aborted) setEnabled(false)
          return
        }

        if (response.status === 401) {
          setError("Your session has expired. Sign in again.")
          return
        }

        if (!response.ok) {
          throw new Error("Billing unavailable")
        }

        const result = (await response.json()) as BillingResponse

        if (controller.signal.aborted) return

        setBilling(result.billing)
        setMode(result.mode)
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load billing status. Try refreshing it.")
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadBilling()

    return () => controller.abort()
  }, [revision])

  function refreshBilling() {
    if (loading || opening !== null) return

    setError("")
    setPortalError("")
    setLoading(true)
    setRevision((current) => current + 1)
  }

  async function updatePaymentMethod(websiteId: string) {
    if (opening !== null || loading) return

    setOpening(websiteId)
    setPortalError("")

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (sessionError || !token) {
        setPortalError("Sign in again to update the payment method.")
        return
      }

      const response = await fetch("/api/maintenance/billing", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteId }),
      })

      if (response.status === 401) {
        setPortalError("Your session has expired. Sign in again.")
        return
      }

      if (response.status === 403) {
        setPortalError(
          "Only the designated billing contact can update payment methods.",
        )
        return
      }

      if (!response.ok) {
        throw new Error("Payment settings unavailable")
      }

      const result = (await response.json()) as { url: string }
      window.location.assign(result.url)
    } catch {
      setPortalError("Could not open Stripe payment settings. Try again.")
    } finally {
      setOpening(null)
    }
  }

  if (!enabled) return null
  if (!loading && !error && billing.length === 0) return null

  return (
    <section
      className={`${panelClass} space-y-4`}
      aria-labelledby="website-billing-heading"
      aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id="website-billing-heading"
          className="font-semibold text-foreground">
          Maintenance billing{mode === "test" ? " · Test mode" : ""}
        </h3>

        <button
          type="button"
          className={secondaryButtonClass}
          disabled={loading || opening !== null}
          onClick={refreshBilling}>
          {loading ? "Refreshing…" : "Refresh status"}
        </button>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-muted">
          Checking maintenance billing…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : (
        <dl className="divide-y divide-border">
          {billing.map(
            ({ websiteId, websiteName, status, canUpdatePaymentMethod }) => (
              <div
                key={websiteId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <dt className="text-foreground">{websiteName}</dt>

                <dd className="flex flex-wrap items-center gap-3">
                  <span
                    className={
                      status === "active" || status === "trialing"
                        ? "text-primary"
                        : "text-muted"
                    }>
                    {statusLabels[status] ?? "Status unavailable"}
                  </span>

                  {canUpdatePaymentMethod && (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={opening !== null}
                      onClick={() => void updatePaymentMethod(websiteId)}>
                      {opening === websiteId
                        ? "Opening Stripe…"
                        : "Update payment method"}
                    </button>
                  )}
                </dd>
              </div>
            ),
          )}
        </dl>
      )}

      {portalError && (
        <p role="alert" className="text-sm text-red-300">
          {portalError}
        </p>
      )}
    </section>
  )
}
