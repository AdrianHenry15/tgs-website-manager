"use client"

import { useState } from "react"
import { AccountSettings } from "./account-settings"
import { RemoveWebsiteAccess } from "./remove-website-access"
import { secondaryButtonClass } from "./styles"
import { BillingPanel } from "./billing/billing-panel"

type AccountView = "account" | "billing"

const sections = [
  { id: "account", label: "Account & security" },
  { id: "billing", label: "Maintenance & billing" },
] as const

export function AccountPanel({ email }: { email: string }) {
  const [view, setView] = useState<AccountView>("account")
  const [accessOpen, setAccessOpen] = useState(false)

  return (
    <section aria-label="My account" className="mb-6 space-y-4">
      <nav aria-label="Account sections" className="flex flex-wrap gap-2">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? "page" : undefined}
            onClick={() => setView(id)}
            className={`${secondaryButtonClass} ${
              view === id ? "border-primary bg-primary/10 text-primary" : ""
            }`}>
            {label}
          </button>
        ))}
      </nav>

      {view === "account" && (
        <div className="space-y-4">
          <AccountSettings email={email} />

          <details
            className="rounded-xl border border-border p-4"
            onToggle={(event) => setAccessOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium">
              Website access
            </summary>

            {accessOpen && (
              <div className="mt-4">
                <RemoveWebsiteAccess />
              </div>
            )}
          </details>
        </div>
      )}

      {view === "billing" && <BillingPanel />}
    </section>
  )
}
