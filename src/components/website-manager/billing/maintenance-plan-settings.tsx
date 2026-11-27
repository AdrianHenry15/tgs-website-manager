"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import {
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "../styles"
import {
  MaintenancePlanForm,
  readAmountCents,
  type MaintenancePlan,
} from "./maintenance-plan-form"

type Website = {
  id: string
  name: string
}

type Snapshot = {
  revision: number
  websites: Website[]
  plans: MaintenancePlan[]
  managedIds: string[]
  error: string
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

export function MaintenancePlanSettings() {
  const [websiteId, setWebsiteId] = useState("")
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const [websites, plans, managed] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name")
            .order("name")
            .abortSignal(controller.signal),

          supabase
            .from("wm_maintenance_plans")
            .select(
              "website_id, name, monthly_amount_cents, currency, starts_on, status, collection_method, agreement_terms, updated_at",
            )
            .abortSignal(controller.signal),

          supabase.rpc("wm_managed_website_ids").abortSignal(controller.signal),
        ])

        if (websites.error || plans.error || managed.error) {
          throw new Error("Plan lookup failed.")
        }

        if (!active) return

        const assignments = (managed.data ?? []) as {
          website_id: string
        }[]

        setSnapshot({
          revision,
          websites: websites.data ?? [],
          plans: (plans.data ?? []) as MaintenancePlan[],
          managedIds: assignments.map(({ website_id }) => website_id),
          error: "",
        })
      } catch {
        if (!active) return

        setSnapshot({
          revision,
          websites: [],
          plans: [],
          managedIds: [],
          error: "Could not load maintenance plans.",
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

  function saved(message: string) {
    setNotice(message)
    refresh()
  }

  const loading = !snapshot || snapshot.revision !== revision

  if (loading) {
    return (
      <section className={panelClass}>
        <p role="status" className="text-sm text-muted">
          Loading maintenance plans…
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
    snapshot.websites.length === 1 ? snapshot.websites[0].id : websiteId

  const plan =
    snapshot.plans.find((item) => item.website_id === selectedId) ?? null

  const canManage = snapshot.managedIds.includes(selectedId)

  return (
    <section className={`${panelClass} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Maintenance agreement</h3>

        <button
          type="button"
          onClick={refresh}
          className={secondaryButtonClass}>
          Refresh
        </button>
      </div>

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

      {!selectedId ? (
        <p className="text-sm text-muted">
          Choose a website to view its maintenance agreement.
        </p>
      ) : (
        <>
          {plan ? (
            <div className="space-y-3">
              <p className="font-medium">{plan.name}</p>

              <p className="font-sans text-2xl font-semibold">
                {formatMoney(plan.monthly_amount_cents)}
                <span className="ml-1 text-sm font-normal text-muted">
                  / month
                </span>
              </p>

              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Agreement status</dt>
                  <dd className="capitalize">{plan.status}</dd>
                </div>

                <div>
                  <dt className="text-muted">First billing date</dt>
                  <dd>
                    {new Date(
                      `${plan.starts_on}T12:00:00`,
                    ).toLocaleDateString()}
                  </dd>
                </div>
              </dl>

              {plan.agreement_terms && (
                <p className="whitespace-pre-wrap wrap-break-word text-sm text-muted">
                  {plan.agreement_terms}
                </p>
              )}

              <p className="text-xs text-muted">
                Agreement status does not indicate whether a payment has been
                received.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No maintenance agreement has been configured.
            </p>
          )}

          {canManage && (
            <details
              key={`editor:${selectedId}:${plan?.updated_at ?? "new"}`}
              className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {plan ? "Edit agreement" : "Configure agreement"}
              </summary>

              <div className="mt-4">
                <MaintenancePlanForm
                  websiteId={selectedId}
                  plan={plan}
                  onSaved={saved}
                />
              </div>
            </details>
          )}

          {canManage && plan && (
            <BillingPeriodForm
              key={`period:${selectedId}:${plan.updated_at}`}
              plan={plan}
              onSaved={saved}
            />
          )}
        </>
      )}
    </section>
  )
}

function BillingPeriodForm({
  plan,
  onSaved,
}: {
  plan: MaintenancePlan
  onSaved: (message: string) => void
}) {
  const [month, setMonth] = useState("")
  const [amount, setAmount] = useState(
    (plan.monthly_amount_cents / 100).toFixed(2),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const busy = useRef(false)

  async function prepare() {
    if (busy.current) return

    const cents = readAmountCents(amount)

    if (cents === null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError("Choose a valid month and billing amount.")
      return
    }

    busy.current = true
    setSaving(true)
    setError("")

    try {
      const { data, error: prepareError } = await supabase.rpc(
        "wm_prepare_maintenance_billing_period",
        {
          p_website_id: plan.website_id,
          p_month: `${month}-01`,
          p_amount_due_cents: cents,
        },
      )

      if (prepareError || !data) {
        setError(
          prepareError?.code === "22023"
            ? "Check the month, amount, and agreement status. Future billing periods cannot be created."
            : "Could not confirm the billing record. Refresh before trying again.",
        )
        return
      }

      onSaved(
        "Billing record ready. An existing record keeps its original amount. No payment was charged.",
      )
    } catch {
      setError(
        "Could not confirm the billing record. Refresh before trying again.",
      )
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Prepare a monthly billing record
      </summary>

      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Service month
            <input
              type="month"
              value={month}
              min={plan.starts_on.slice(0, 7)}
              disabled={saving}
              onChange={(event) => setMonth(event.currentTarget.value)}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Amount due · USD
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={saving}
              onChange={(event) => setAmount(event.currentTarget.value)}
              className={inputClass}
            />
          </label>
        </div>

        <p className="text-xs text-muted">
          Creates a local billing record only. Verify the agreed amount when
          entering historical months. This does not create a Stripe invoice or
          collect payment.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() => void prepare()}
          className={secondaryButtonClass}>
          {saving ? "Saving…" : "Prepare billing record"}
        </button>
      </div>
    </details>
  )
}
