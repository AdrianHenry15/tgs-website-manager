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
  const [error, setError] = useState("")
  const [opening, setOpening] = useState<string | null>(null)
  const [portalError, setPortalError] = useState("")

  async function updatePaymentMethod(websiteId: string) {
    if (opening) return

    setOpening(websiteId)
    setPortalError("")

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (!token) {
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

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const { url } = (await response.json()) as { url: string }
      window.location.assign(url)
    } catch (error) {
      setPortalError(
        error instanceof Error
          ? error.message
          : "Could not open Stripe payment settings.",
      )
    } finally {
      setOpening(null)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadBilling() {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token

        if (!token || controller.signal.aborted) return

        const response = await fetch("/api/maintenance/billing", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 404) return
        if (!response.ok) throw new Error("Billing unavailable")

        const result = (await response.json()) as { billing: BillingRow[] }

        if (!controller.signal.aborted) setBilling(result.billing)
      } catch {
        if (!controller.signal.aborted) {
          setError(
            "Could not load billing status. Reopen My Account to try again.",
          )
        }
      }
    }

    void loadBilling()
    return () => controller.abort()
  }, [])

  if (!error && billing.length === 0) return null

  return (
    <section className={`${panelClass} space-y-3`}>
      <h3 className="font-semibold text-stone-100">
        Maintenance billing · Test mode
      </h3>

      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : (
        <dl className="divide-y divide-stone-800">
          {billing.map(
            ({ websiteId, websiteName, status, canUpdatePaymentMethod }) => (
              <div
                key={websiteId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <dt className="text-stone-200">{websiteName}</dt>
                <dd className="flex flex-wrap items-center gap-3 text-stone-400">
                  <span>{statusLabels[status] ?? "Status unavailable"}</span>

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
