"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { secondaryButtonClass } from "../styles"

export function TestMaintenanceCheckout({ websiteId }: { websiteId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState("")
  const busy = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    async function checkAvailability() {
      try {
        const response = await fetch("/api/maintenance/checkout", {
          signal: controller.signal,
          cache: "no-store",
        })

        if (!response.ok) return

        const result = (await response.json()) as {
          enabled?: boolean
        }

        if (!controller.signal.aborted) {
          setEnabled(result.enabled === true)
        }
      } catch {
        // Sandbox controls remain hidden when unavailable.
      }
    }

    void checkAvailability()
    return () => controller.abort()
  }, [])

  async function start() {
    if (busy.current) return

    busy.current = true
    setOpening(true)
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
        setError(result.error ?? "Could not open test checkout.")
        return
      }

      window.location.assign(result.url)
    } catch {
      setError("Could not confirm checkout. Retry the saved attempt.")
    } finally {
      busy.current = false
      setOpening(false)
    }
  }

  if (!enabled) return null

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Stripe sandbox</p>

      <p className="text-xs text-muted">
        Test enrollment only. This does not enable production billing or
        implement the January billing start date.
      </p>

      <button
        type="button"
        disabled={opening}
        onClick={() => void start()}
        className={secondaryButtonClass}>
        {opening ? "Opening Stripe…" : "Open test checkout"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
