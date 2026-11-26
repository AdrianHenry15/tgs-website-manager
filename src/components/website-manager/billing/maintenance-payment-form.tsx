"use client"

import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { inputClass, labelClass, secondaryButtonClass } from "../styles"
import { readAmountCents } from "./maintenance-plan-form"

type Entry = {
  id: string
  kind: "payment" | "credit"
  amount: number
  source: string
  paidOn: string
  reference: string
}

function today() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""

  return `${part("year")}-${part("month")}-${part("day")}`
}

export function MaintenancePaymentForm({
  periodId,
  balanceCents,
  onSaved,
}: {
  periodId: string
  balanceCents: number
  onSaved: () => void
}) {
  const [kind, setKind] = useState<"payment" | "credit">("payment")
  const [pending, setPending] = useState<Entry | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const busy = useRef(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return

    const form = new FormData(event.currentTarget)

    const amount =
      pending?.amount ?? readAmountCents(String(form.get("amount") ?? ""))

    if (amount === null || amount > balanceCents) {
      setError("Enter an amount within the remaining balance.")
      return
    }

    const entry: Entry = pending ?? {
      id: crypto.randomUUID(),
      kind,
      amount,
      source: kind === "credit" ? "credit" : String(form.get("source") ?? ""),
      paidOn: String(form.get("paidOn") ?? ""),
      reference: String(form.get("reference") ?? "").trim(),
    }

    busy.current = true
    setSaving(true)
    setPending(entry)
    setError("")

    try {
      const { data, error: saveError } = await supabase.rpc(
        "wm_record_maintenance_payment",
        {
          p_payment_id: entry.id,
          p_billing_period_id: periodId,
          p_kind: entry.kind,
          p_amount_cents: entry.amount,
          p_source: entry.source,
          p_paid_on: entry.paidOn,
          p_reference: entry.reference,
        },
      )

      if (saveError || data !== entry.id) {
        if (saveError?.code === "22023" || saveError?.code === "42501") {
          setPending(null)
        }

        setError(
          saveError?.code === "22023"
            ? "Check the date, amount, and remaining balance. Refresh if another entry was recorded."
            : "Could not confirm the entry. Retry the same entry or refresh to check its status.",
        )
        return
      }

      onSaved()
    } catch {
      setError("Could not confirm the entry. Retry using the same entry ID.")
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <fieldset disabled={saving || pending !== null} className="space-y-4">
        <label className={labelClass}>
          Entry type
          <select
            value={kind}
            onChange={(event) =>
              setKind(
                event.currentTarget.value === "credit" ? "credit" : "payment",
              )
            }
            className={inputClass}>
            <option value="payment">Payment received</option>
            <option value="credit">Credit / complimentary adjustment</option>
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Amount · USD
            <input
              name="amount"
              type="text"
              inputMode="decimal"
              required
              defaultValue={(balanceCents / 100).toFixed(2)}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            {kind === "credit" ? "Credit date" : "Payment received on"}
            <input
              name="paidOn"
              type="date"
              required
              defaultValue={today()}
              max={today()}
              className={inputClass}
            />
          </label>
        </div>

        {kind === "payment" && (
          <label className={labelClass}>
            Payment source
            <select name="source" className={inputClass}>
              <option value="square">Square</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </label>
        )}

        <label className={labelClass}>
          Client-visible reference or credit explanation
          <input
            name="reference"
            maxLength={160}
            required={kind === "credit"}
            placeholder={
              kind === "credit"
                ? "Courtesy credit for the transition month"
                : "Receipt or transaction reference"
            }
            className={inputClass}
          />
        </label>
      </fieldset>

      <p className="text-xs text-muted">
        Records an outside payment or credit. This does not charge, refund, or
        change an invoice in Square or Stripe.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button type="submit" disabled={saving} className={secondaryButtonClass}>
        {saving
          ? "Saving…"
          : pending
            ? "Retry same entry"
            : kind === "credit"
              ? "Apply credit"
              : "Record payment"}
      </button>
    </form>
  )
}
