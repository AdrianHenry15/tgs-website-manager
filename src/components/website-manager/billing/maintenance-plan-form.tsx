"use client"

import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { inputClass, labelClass, secondaryButtonClass } from "../styles"

export type MaintenancePlan = {
  website_id: string
  name: string
  monthly_amount_cents: number
  currency: string
  starts_on: string
  status: "active" | "paused" | "canceled"
  collection_method: "external" | "stripe"
  agreement_terms: string
  updated_at: string
}

export function readAmountCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null

  const [whole, fraction = ""] = value.trim().split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))

  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2147483647
    ? cents
    : null
}

export function MaintenancePlanForm({
  websiteId,
  plan,
  onSaved,
}: {
  websiteId: string
  plan: MaintenancePlan | null
  onSaved: (message: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const busy = useRef(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || needsRefresh) return

    const form = new FormData(event.currentTarget)
    const amount = readAmountCents(String(form.get("amount") ?? ""))
    const month = String(form.get("startsMonth") ?? "")
    const name = String(form.get("name") ?? "").trim()
    const status = String(form.get("status") ?? "")
    const terms = String(form.get("terms") ?? "").trim()

    setError("")

    if (
      amount === null ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !name ||
      name.length > 160 ||
      terms.length > 5000 ||
      !["active", "paused", "canceled"].includes(status)
    ) {
      setError("Enter valid plan details and a monthly price.")
      return
    }

    busy.current = true
    setSaving(true)

    try {
      const { data, error: saveError } = await supabase.rpc(
        "wm_save_maintenance_plan",
        {
          p_website_id: websiteId,
          p_name: name,
          p_monthly_amount_cents: amount,
          p_starts_on: `${month}-01`,
          p_status: status,
          p_agreement_terms: terms,
          p_expected_updated_at: plan?.updated_at ?? null,
        },
      )

      if (saveError || !data) {
        setNeedsRefresh(true)
        setError(
          saveError?.code === "40001"
            ? "This plan changed. Refresh the panel before saving."
            : "Could not confirm the save. Refresh the panel to check the result.",
        )
        return
      }

      onSaved("Maintenance plan saved.")
    } catch {
      setNeedsRefresh(true)
      setError(
        "Could not confirm the save. Refresh the panel to check the result.",
      )
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={saving || needsRefresh} className="space-y-4">
        <label className={labelClass}>
          Plan name
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={plan?.name ?? "Monthly website maintenance"}
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Monthly price · USD
            <input
              name="amount"
              type="text"
              inputMode="decimal"
              required
              defaultValue={
                plan ? (plan.monthly_amount_cents / 100).toFixed(2) : ""
              }
              placeholder="100.00"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            First billing month
            <input
              name="startsMonth"
              type="month"
              required
              defaultValue={plan?.starts_on.slice(0, 7) ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        <label className={labelClass}>
          Maintenance agreement status
          <select
            name="status"
            defaultValue={plan?.status ?? "active"}
            className={inputClass}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="canceled">Canceled</option>
          </select>
        </label>

        <label className={labelClass}>
          Client-visible agreement terms
          <textarea
            name="terms"
            rows={4}
            maxLength={5000}
            defaultValue={plan?.agreement_terms ?? ""}
            placeholder="Describe the included maintenance and any limits."
            className={inputClass}
          />
        </label>

        <p className="text-xs text-muted">
          Saving changes the maintenance agreement. Existing monthly charges
          retain their recorded amounts. Stripe subscriptions are managed
          separately.
        </p>

        <button type="submit" className={secondaryButtonClass}>
          {saving ? "Saving…" : "Save maintenance plan"}
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
