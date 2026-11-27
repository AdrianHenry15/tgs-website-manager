"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { secondaryButtonClass } from "../styles"
import { WebsiteBilling } from "../website-billing"
import { MaintenancePlanSettings } from "./maintenance-plan-settings"
import { MaintenanceEnrollment } from "./maintenance-enrollment"
import { MaintenanceLedger } from "./maintenance-ledger"
import { StripeInvoiceHistory } from "./stripe-invoice-history"
import { StripeEnrollmentSettings } from "./stripe-enrollment-settings"

type BillingView = "overview" | "history" | "transition"

type ManagementAccess = "loading" | "allowed" | "denied" | "error"

export function BillingPanel() {
  const [view, setView] = useState<BillingView>("overview")
  const [management, setManagement] = useState<ManagementAccess>("loading")
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function checkAccess() {
      try {
        const { data, error } = await supabase
          .rpc("wm_managed_website_ids")
          .abortSignal(controller.signal)

        if (!active) return

        if (error) {
          setManagement("error")
          return
        }

        setManagement(
          Array.isArray(data) && data.length > 0 ? "allowed" : "denied",
        )
      } catch {
        if (active) setManagement("error")
      }
    }

    void checkAccess()

    return () => {
      active = false
      controller.abort()
    }
  }, [revision])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Maintenance & billing
        </h2>

        <p className="mt-2 text-sm text-muted">
          Your agreement, payment settings, and billing history.
        </p>
      </div>

      <nav aria-label="Billing sections" className="flex flex-wrap gap-2">
        <BillingNavigationButton
          active={view === "overview"}
          onClick={() => setView("overview")}>
          Agreement & autopay
        </BillingNavigationButton>

        <BillingNavigationButton
          active={view === "history"}
          onClick={() => setView("history")}>
          Payment history
        </BillingNavigationButton>

        {management === "allowed" && (
          <BillingNavigationButton
            active={view === "transition"}
            onClick={() => setView("transition")}>
            Enrollment administration
          </BillingNavigationButton>
        )}
      </nav>

      {management === "error" && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            Could not check billing administration access.
          </p>

          <button
            type="button"
            onClick={() => {
              setManagement("loading")
              setRevision((current) => current + 1)
            }}
            className={secondaryButtonClass}>
            Retry access check
          </button>
        </div>
      )}

      {view === "overview" && (
        <div className="space-y-4">
          <MaintenancePlanSettings />
          <MaintenanceEnrollment />
          <WebsiteBilling />
        </div>
      )}

      {view === "history" && (
        <div className="space-y-4">
          <StripeInvoiceHistory />
          <MaintenanceLedger />
        </div>
      )}

      {view === "transition" && management === "allowed" && (
        <StripeEnrollmentSettings />
      )}
    </div>
  )
}

function BillingNavigationButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`${secondaryButtonClass} ${
        active ? "border-primary bg-primary/10 text-primary" : ""
      }`}>
      {children}
    </button>
  )
}
