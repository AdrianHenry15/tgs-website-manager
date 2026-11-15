"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { panelClass, secondaryButtonClass } from "./styles"

export function RemoveWebsiteAccess() {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function removeAccess() {
    if (!confirming || busy) return

    setError("")
    setBusy(true)

    try {
      const { error: removeError } = await supabase.rpc(
        "wm_remove_own_website_access",
      )

      if (removeError) {
        setError(
          removeError.code === "42501"
            ? "Use a signed-in client account, or contact TGS if you manage websites."
            : "Could not confirm removal. Refresh to check your access before trying again.",
        )
        return
      }

      window.location.reload()
    } catch {
      setError(
        "Could not confirm removal. Refresh to check your access before trying again.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${panelClass} space-y-3`}>
      <h3 className="font-semibold text-stone-100">Website Manager access</h3>

      <p className="text-sm text-stone-400">
        Client accounts can remove their access to all assigned websites. Your
        shared login and existing requests will be kept.
      </p>

      {confirming ? (
        <>
          <p className="text-sm text-stone-300">
            You’ll lose access to your websites, requests, and screenshots.
            Contact TGS if you need access restored.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeAccess()}
              className="rounded-lg border border-red-400/50 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50">
              {busy ? "Removing access…" : "Confirm removal"}
            </button>

            <button
              type="button"
              disabled={busy}
              className={secondaryButtonClass}
              onClick={() => {
                setConfirming(false)
                setError("")
              }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => setConfirming(true)}>
          Remove Website Manager access
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}
