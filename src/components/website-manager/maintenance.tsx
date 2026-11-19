import { useEffect, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass, inputClass, labelClass, panelClass } from "./styles"

type MonthlyUsageRow = {
  website_id: string
  website_name: string
  allowance_minutes: number
  used_minutes: number
}

export function MonthlyUsage() {
  const [rows, setRows] = useState<MonthlyUsageRow[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function loadUsage() {
      try {
        const { data, error } = await supabase.rpc("wm_monthly_usage")
        if (!active) return

        if (error) {
          setError(error.message)
          return
        }

        setRows(data ?? [])
      } catch {
        if (active)
          setError("Could not load monthly usage. Refresh to try again.")
      }
    }

    void loadUsage()
    return () => {
      active = false
    }
  }, [])

  if (rows?.length === 0) return null

  return (
    <section className={panelClass} aria-busy={rows === null && !error}>
      <h2 className="text-lg font-semibold">Maintenance this month</h2>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      ) : rows === null ? (
        <p className="mt-3 text-sm text-muted">Loading usage…</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((site) => {
            const balance = site.allowance_minutes - site.used_minutes

            return (
              <li key={site.website_id} className="py-2">
                <p className="font-medium">{site.website_name}</p>
                <p className="text-sm text-foreground">
                  {site.used_minutes} of {site.allowance_minutes} minutes used
                  {" · "}
                  {balance < 0
                    ? `${Math.abs(balance)} minutes over allowance`
                    : `${balance} minutes remaining`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function LogTime({
  requestId,
  onSaved,
}: {
  requestId: string
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmation, setConfirmation] = useState("")

  async function logTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const workedOn = String(fields.get("workedOn") ?? "")
    const minutes = Number(fields.get("minutes"))

    setError("")
    setConfirmation("")

    if (
      !workedOn ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440
    ) {
      setError("Enter a work date and a whole number from 1 to 1,440 minutes.")
      return
    }

    setSaving(true)

    try {
      const { error } = await supabase.from("wm_time_entries").insert({
        request_id: requestId,
        worked_on: workedOn,
        minutes,
      })

      if (error) {
        setError(error.message)
        return
      }

      form.reset()
      setConfirmation(
        `Logged ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      )
      onSaved()
    } catch {
      setError(
        "Could not confirm the save. Refresh and check usage before retrying.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Log time</summary>

      <form onSubmit={logTime} className="mt-3">
        <fieldset disabled={saving} className="grid min-w-0 gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Work date
              <input
                name="workedOn"
                type="date"
                required
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Minutes worked
              <input
                name="minutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                required
                className={inputClass}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`${buttonClass} justify-self-start`}>
            {saving ? "Saving…" : "Save time"}
          </button>
        </fieldset>

        {error && (
          <p role="alert" className="mt-2 text-red-300">
            {error}
          </p>
        )}
        {confirmation && (
          <p role="status" className="mt-2 text-foreground">
            {confirmation}
          </p>
        )}
      </form>
    </details>
  )
}
