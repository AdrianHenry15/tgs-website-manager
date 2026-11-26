"use client"

import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"
import { StatusBadge } from "../status-ui"
import { MaintenancePaymentForm } from "./maintenance-payment-form"
import {
  useMaintenanceLedger,
  type MaintenancePayment,
} from "./use-maintenance-ledger"

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function date(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString()
}

function month(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`))
}

const sourceLabels: Record<string, string> = {
  square: "Square",
  stripe: "Stripe",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  check: "Check",
  other: "Other",
  credit: "Credit",
}

export function MaintenanceLedger() {
  const [websiteId, setWebsiteId] = useState("")
  const { data, loading, refresh } = useMaintenanceLedger(websiteId)

  if (loading || !data) {
    return (
      <section className={panelClass}>
        <p role="status" className="text-sm text-muted">
          Loading maintenance payments…
        </p>
      </section>
    )
  }

  if (data.error) {
    return (
      <section className={`${panelClass} space-y-3`}>
        <p role="alert" className="text-sm text-red-400">
          {data.error}
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

  if (data.websites.length === 0) return null

  const selectedId =
    data.websites.length === 1 ? data.websites[0].id : websiteId

  const names = new Map(
    data.websites.map((website) => [website.id, website.name]),
  )

  const nextBilling = data.calendar.find(
    (item) => item.website_id === selectedId,
  )

  const periods = data.periods.filter(
    (period) => !selectedId || period.website_id === selectedId,
  )

  return (
    <section className={`${panelClass} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Outside payments and credits</h3>
        <button
          type="button"
          onClick={refresh}
          className={secondaryButtonClass}>
          Refresh
        </button>
      </div>

      {data.websites.length > 1 && (
        <label className={labelClass}>
          Website
          <select
            value={websiteId}
            onChange={(event) => setWebsiteId(event.currentTarget.value)}
            className={inputClass}>
            <option value="">All websites</option>

            {data.websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {nextBilling && (
        <p className="text-sm text-muted">
          {nextBilling.next_billing_on
            ? `Next plan billing date: ${date(nextBilling.next_billing_on)}`
            : "The maintenance agreement is paused or canceled."}
        </p>
      )}

      {data.total > data.periods.length && (
        <p className="text-xs text-muted">
          Showing the latest {data.periods.length} billing periods. Select a
          website to narrow the results.
        </p>
      )}

      {periods.length === 0 ? (
        <p className="text-sm text-muted">
          No monthly billing records have been prepared yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {periods.map((period) => {
            const entries = data.payments.filter(
              (payment) => payment.billing_period_id === period.id,
            )

            const active = entries.filter((payment) => !payment.voided_at)

            const paid = active
              .filter((payment) => payment.kind === "payment")
              .reduce((sum, payment) => sum + payment.amount_cents, 0)

            const credits = active
              .filter((payment) => payment.kind === "credit")
              .reduce((sum, payment) => sum + payment.amount_cents, 0)

            const balance = Math.max(
              0,
              period.amount_due_cents - paid - credits,
            )

            const label =
              balance === 0
                ? credits === 0
                  ? "Paid"
                  : paid === 0
                    ? "Credited"
                    : "Settled with credit"
                : paid + credits > 0
                  ? "Partially covered"
                  : "Unpaid"

            const canManage = data.managedIds.includes(period.website_id)

            return (
              <li
                key={period.id}
                className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted">
                      {names.get(period.website_id)}
                    </p>

                    <h4 className="mt-1 font-semibold">
                      {month(period.report_month)}
                    </h4>
                  </div>

                  <StatusBadge
                    status={balance === 0 ? "completed" : "open"}
                    label={label}
                  />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted">Charge</dt>
                    <dd>{money(period.amount_due_cents)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Payments</dt>
                    <dd>{money(paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Credits</dt>
                    <dd>{money(credits)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Balance</dt>
                    <dd className="font-semibold">{money(balance)}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-muted">
                  Due {date(period.due_on)}
                </p>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Payment history · {entries.length}
                  </summary>

                  {entries.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">
                      No payments or credits recorded.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {entries.map((payment) => (
                        <li
                          key={payment.id}
                          className="rounded-lg border border-border p-3 text-sm">
                          <p className="font-medium">
                            {money(payment.amount_cents)}
                            {" · "}
                            {sourceLabels[payment.source] ?? payment.source}
                            {payment.voided_at ? " · Voided" : ""}
                          </p>

                          <p className="mt-1 text-xs text-muted">
                            {date(payment.paid_on)}
                          </p>

                          {payment.reference && (
                            <p className="mt-2 wrap-break-word">
                              {payment.reference}
                            </p>
                          )}

                          {payment.voided_at && (
                            <p className="mt-2 text-muted">
                              Correction: {payment.void_reason}
                            </p>
                          )}

                          {canManage &&
                            !payment.voided_at &&
                            payment.source !== "stripe" && (
                              <VoidPayment
                                payment={payment}
                                onSaved={refresh}
                              />
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>

                {canManage && balance > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Record payment or apply credit
                    </summary>

                    <MaintenancePaymentForm
                      key={`${period.id}:${balance}`}
                      periodId={period.id}
                      balanceCents={balance}
                      onSaved={refresh}
                    />
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function VoidPayment({
  payment,
  onSaved,
}: {
  payment: MaintenancePayment
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const busy = useRef(false)

  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return

    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim()

    if (!reason || reason.length > 500) {
      setError("Enter a correction reason.")
      return
    }

    busy.current = true
    setSaving(true)
    setError("")

    try {
      const { data, error: correctionError } = await supabase.rpc(
        "wm_void_maintenance_payment",
        {
          p_payment_id: payment.id,
          p_reason: reason,
        },
      )

      if (correctionError || data !== payment.id) {
        setError("Could not confirm the correction. Refresh before retrying.")
        return
      }

      onSaved()
    } catch {
      setError("Could not confirm the correction. Refresh before retrying.")
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-muted">
        Correct this entry
      </summary>

      <form onSubmit={correct} className="mt-3 space-y-3">
        <label className={labelClass}>
          Reason for voiding
          <input
            name="reason"
            required
            maxLength={500}
            disabled={saving}
            className={inputClass}
          />
        </label>

        <p className="text-xs text-muted">
          Removes this entry from the balance calculation and keeps its history.
          It does not refund a payment.
        </p>

        {error && (
          <p role="alert" className="text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={secondaryButtonClass}>
          {saving ? "Saving…" : "Void entry"}
        </button>
      </form>
    </details>
  )
}
