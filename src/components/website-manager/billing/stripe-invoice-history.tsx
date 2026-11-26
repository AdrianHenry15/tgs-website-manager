"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { panelClass, secondaryButtonClass } from "../styles"
import { StatusBadge } from "../status-ui"

type Invoice = {
  stripe_invoice_id: string
  website_id: string
  stripe_livemode: boolean
  status: "open" | "paid" | "uncollectible" | "void"
  amount_due_cents: number
  amount_paid_cents: number
  amount_remaining_cents: number
  service_period_start: string
  service_period_end: string
  last_synced_at: string
}

type Snapshot = {
  revision: number
  invoices: Invoice[]
  websites: { id: string; name: string }[]
  total: number
  error: string
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function statusLabel(invoice: Invoice) {
  if (invoice.status === "paid") {
    return invoice.amount_due_cents === 0 ? "No charge" : "Paid"
  }

  if (invoice.status === "void") return "Voided"
  if (invoice.status === "uncollectible") return "Uncollectible"

  return "Open / unpaid"
}

export function StripeInvoiceHistory() {
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const [invoices, websites] = await Promise.all([
          supabase
            .from("wm_stripe_invoices")
            .select(
              "stripe_invoice_id, website_id, stripe_livemode, status, amount_due_cents, amount_paid_cents, amount_remaining_cents, service_period_start, service_period_end, last_synced_at",
              { count: "exact" },
            )
            .order("service_period_start", { ascending: false })
            .order("stripe_invoice_id")
            .limit(25)
            .abortSignal(controller.signal),

          supabase
            .from("wm_websites")
            .select("id, name")
            .abortSignal(controller.signal),
        ])

        if (invoices.error || websites.error) {
          throw new Error("Invoice lookup failed.")
        }

        if (!active) return

        setSnapshot({
          revision,
          invoices: (invoices.data ?? []) as Invoice[],
          websites: websites.data ?? [],
          total: invoices.count ?? 0,
          error: "",
        })
      } catch {
        if (!active) return

        setSnapshot({
          revision,
          invoices: [],
          websites: [],
          total: 0,
          error: "Could not load Stripe invoice records.",
        })
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [revision])

  const loading = !snapshot || snapshot.revision !== revision

  function refresh() {
    setRevision((current) => current + 1)
  }

  const names = new Map(
    snapshot?.websites.map((website) => [website.id, website.name]) ?? [],
  )

  return (
    <section className={`${panelClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Stripe invoice history</h3>

        <button
          type="button"
          disabled={loading}
          onClick={refresh}
          className={secondaryButtonClass}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-muted">
          Loading invoices…
        </p>
      ) : snapshot.error ? (
        <p role="alert" className="text-sm text-red-400">
          {snapshot.error}
        </p>
      ) : snapshot.invoices.length === 0 ? (
        <p className="text-sm text-muted">
          No synchronized Stripe invoices are available yet.
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {snapshot.invoices.map((invoice) => (
              <li
                key={invoice.stripe_invoice_id}
                className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {names.get(invoice.website_id)}
                    </p>

                    {!invoice.stripe_livemode && (
                      <p className="mt-1 text-xs font-semibold text-amber-400">
                        SANDBOX · No real payment
                      </p>
                    )}
                  </div>

                  <StatusBadge
                    status={
                      invoice.status === "paid"
                        ? "completed"
                        : invoice.status === "void"
                          ? "all"
                          : "open"
                    }
                    label={statusLabel(invoice)}
                  />
                </div>

                <p className="mt-3 text-xs text-muted">
                  Service period:{" "}
                  {new Date(invoice.service_period_start).toLocaleDateString()}
                  {" – "}
                  {new Date(invoice.service_period_end).toLocaleDateString()}
                </p>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Amount due</dt>
                    <dd>{money(invoice.amount_due_cents)}</dd>
                  </div>

                  <div>
                    <dt className="text-muted">Amount paid</dt>
                    <dd>{money(invoice.amount_paid_cents)}</dd>
                  </div>

                  <div>
                    <dt className="text-muted">Remaining</dt>
                    <dd>{money(invoice.amount_remaining_cents)}</dd>
                  </div>
                </dl>

                <p className="mt-3 break-all text-xs text-muted">
                  {invoice.stripe_invoice_id}
                </p>

                <p className="mt-1 text-xs text-muted">
                  Last synchronized{" "}
                  {new Date(invoice.last_synced_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>

          {snapshot.total > snapshot.invoices.length && (
            <p className="text-xs text-muted">
              Showing the latest 25 invoices.
            </p>
          )}
        </>
      )}
    </section>
  )
}
