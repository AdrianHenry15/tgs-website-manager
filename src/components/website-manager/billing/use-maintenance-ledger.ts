"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type BillingPeriod = {
  id: string
  website_id: string
  report_month: string
  due_on: string
  amount_due_cents: number
  currency: string
}

export type MaintenancePayment = {
  id: string
  billing_period_id: string
  kind: "payment" | "credit"
  amount_cents: number
  source: string
  paid_on: string
  reference: string
  created_at: string
  voided_at: string | null
  void_reason: string | null
}

type Snapshot = {
  key: string
  websites: { id: string; name: string }[]
  periods: BillingPeriod[]
  payments: MaintenancePayment[]
  calendar: {
    website_id: string
    next_billing_on: string | null
  }[]
  managedIds: string[]
  total: number
  error: string
}

export function useMaintenanceLedger(websiteId: string) {
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  const key = `${websiteId}:${revision}`

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        let periodQuery = supabase
          .from("wm_maintenance_billing_periods")
          .select(
            "id, website_id, report_month, due_on, amount_due_cents, currency",
            { count: "exact" },
          )
          .order("report_month", { ascending: false })
          .order("id")
          .limit(100)

        if (websiteId) {
          periodQuery = periodQuery.eq("website_id", websiteId)
        }

        const [websites, periods, managed, calendar] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name")
            .order("name")
            .abortSignal(controller.signal),

          periodQuery.abortSignal(controller.signal),

          supabase.rpc("wm_managed_website_ids").abortSignal(controller.signal),

          supabase
            .rpc("wm_maintenance_billing_calendar")
            .abortSignal(controller.signal),
        ])

        if (
          websites.error ||
          periods.error ||
          managed.error ||
          calendar.error
        ) {
          throw new Error("Billing lookup failed.")
        }

        const periodIds = (periods.data ?? []).map(({ id }) => id)

        const payments =
          periodIds.length === 0
            ? { data: [], error: null }
            : await supabase
                .from("wm_maintenance_payments")
                .select(
                  "id, billing_period_id, kind, amount_cents, source, paid_on, reference, created_at, voided_at, void_reason",
                )
                .in("billing_period_id", periodIds)
                .order("created_at", { ascending: false })
                .abortSignal(controller.signal)

        if (payments.error) {
          throw new Error("Payment lookup failed.")
        }

        if (!active) return

        const assignments = (managed.data ?? []) as {
          website_id: string
        }[]

        setSnapshot({
          key,
          websites: websites.data ?? [],
          periods: (periods.data ?? []) as BillingPeriod[],
          payments: (payments.data ?? []) as MaintenancePayment[],
          calendar: calendar.data ?? [],
          managedIds: assignments.map(({ website_id }) => website_id),
          total: periods.count ?? 0,
          error: "",
        })
      } catch {
        if (!active) return

        setSnapshot({
          key,
          websites: [],
          periods: [],
          payments: [],
          calendar: [],
          managedIds: [],
          total: 0,
          error: "Could not load maintenance payment records.",
        })
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [websiteId, key])

  return {
    data: snapshot?.key === key ? snapshot : null,
    loading: snapshot?.key !== key,
    refresh: () => setRevision((current) => current + 1),
  }
}
