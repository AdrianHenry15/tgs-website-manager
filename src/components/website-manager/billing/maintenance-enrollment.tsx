"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { panelClass, secondaryButtonClass } from "../styles"

type EnrollmentOption = {
  websiteId: string
  websiteName: string
  firstChargeOn: string
  billingTimezone: string
}

export function MaintenanceEnrollment() {
  const [options, setOptions] = useState<EnrollmentOption[]>([])
  const [mode, setMode] = useState<"test" | "live">("test")
  const [error, setError] = useState("")
  const [opening, setOpening] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token

        if (!token || controller.signal.aborted) return

        const response = await fetch("/api/maintenance/checkout", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error("Enrollment unavailable.")
        }

        const result = (await response.json()) as {
          enabled: boolean
          mode?: "test" | "live"
          websites: EnrollmentOption[]
        }

        if (controller.signal.aborted) return

        setOptions(result.enabled ? result.websites : [])
        setMode(result.mode ?? "test")
      } catch {
        if (!controller.signal.aborted) {
          setError(
            "Could not load enrollment options. Reopen My Account to retry.",
          )
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  async function enroll(websiteId: string) {
    if (busy.current) return

    busy.current = true
    setOpening(websiteId)
    setError("")

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (!token) {
        setError("Sign in again.")
        return
      }

      const response = await fetch("/api/maintenance/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteId }),
      })

      const result = (await response.json()) as {
        url?: string
        error?: string
      }

      if (!response.ok || !result.url) {
        setError(result.error ?? "Could not open enrollment.")
        return
      }

      window.location.assign(result.url)
    } catch {
      setError("Could not confirm checkout. Retry the saved attempt.")
    } finally {
      busy.current = false
      setOpening(null)
    }
  }

  if (options.length === 0 && !error) return null

  return (
    <section className={`${panelClass} space-y-4`}>
      <h3 className="font-semibold">
        Monthly autopay enrollment
        {mode === "test" ? " · Sandbox" : ""}
      </h3>

      {mode === "test" && options.length > 0 && (
        <p className="text-sm text-muted">
          Test enrollment only. No real payments are collected.
        </p>
      )}

      {options.map((option) => (
        <div
          key={option.websiteId}
          className="space-y-3 rounded-xl border border-border p-4">
          <p className="font-medium">{option.websiteName}</p>

          <p className="text-sm text-muted">
            Set up your payment method now. The first scheduled charge is{" "}
            {new Date(`${option.firstChargeOn}T12:00:00`).toLocaleDateString()}{" "}
            in {option.billingTimezone}. Review the recurring price in Stripe
            before confirming.
          </p>

          <button
            type="button"
            disabled={opening !== null}
            onClick={() => void enroll(option.websiteId)}
            className={secondaryButtonClass}>
            {opening === option.websiteId
              ? "Opening Stripe…"
              : "Set up monthly autopay"}
          </button>
        </div>
      ))}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
