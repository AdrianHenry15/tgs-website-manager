"use client"

import type { Session } from "@supabase/supabase-js"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { AuthScreen } from "./auth-screen"
import { secondaryButtonClass } from "./styles"
import { Requests } from "./requests/requests"
import { AccountSettings } from "./account-settings"
import { Brand } from "./auth-ui"
import { RemoveWebsiteAccess } from "./remove-website-access"
import { WebsiteBilling } from "./website-billing"
import { Maintenance } from "./maintenance/maintenance"
import { Releases } from "./releases/releases"
import { Recaps } from "./recaps/recaps"
import { Dashboard } from "./dashboard/dashboard"
import { MaintenancePlanSettings } from "./billing/maintenance-plan-settings"
import { MaintenanceLedger } from "./billing/maintenance-ledger"
import { StripeInvoiceHistory } from "./billing/stripe-invoice-history"

const workspaceSections = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Requests" },
  { id: "maintenance", label: "Maintenance" },
  { id: "releases", label: "Website updates" },
  { id: "recaps", label: "Monthly recaps" },
] as const

type WorkspaceView = (typeof workspaceSections)[number]["id"]

export function Portal() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [resetLink, setResetLink] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") {
        const params = new URLSearchParams(window.location.search)

        if (params.get("reset") === "1") {
          setResetLink(true)
        }
      }

      if (event === "PASSWORD_RECOVERY") {
        setResetLink(true)
        setRecoveryReady(true)
      }

      if (event === "SIGNED_OUT") {
        setRecoveryReady(false)
      }

      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <AuthScreen screen="loading" recoveryReady={false} />
  }

  if (resetLink) {
    return (
      <AuthScreen
        screen="recovery"
        recoveryReady={recoveryReady && !!session}
      />
    )
  }

  if (!session) {
    return <AuthScreen screen="sign-in" recoveryReady={false} />
  }

  return <Workspace key={session.user.id} user={session.user} />
}

function Workspace({ user }: { user: Session["user"] }) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [activeView, setActiveView] = useState<WorkspaceView>(() => {
    if (typeof window === "undefined") return "overview"

    const params = new URLSearchParams(window.location.search)

    if (params.has("recapId")) return "recaps"
    if (params.has("releaseId")) return "releases"

    if (params.has("requestId") || params.has("request")) {
      return "requests"
    }

    return "overview"
  })
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState("")

  async function signOut() {
    setSignOutError("")
    setSigningOut(true)

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })

      if (error) {
        setSignOutError(error.message)
      }
    } catch {
      setSignOutError("Could not sign out. Try again.")
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Brand />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={accountOpen}
            aria-controls="workspace-account"
            onClick={() => setAccountOpen((open) => !open)}
            className={secondaryButtonClass}>
            My Account
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className={secondaryButtonClass}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {signOutError && (
        <p role="alert" className="mb-4 text-red-300">
          {signOutError}
        </p>
      )}

      {accountOpen && (
        <div id="workspace-account" className="mb-6 space-y-4">
          <AccountSettings email={user.email ?? ""} />
          <MaintenancePlanSettings />
          <MaintenanceLedger />
          <StripeInvoiceHistory />
          <WebsiteBilling />
          <RemoveWebsiteAccess />
        </div>
      )}

      <nav
        aria-label="Workspace sections"
        className="mb-6 flex flex-wrap gap-2">
        {workspaceSections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={activeView === id ? "page" : undefined}
            onClick={() => setActiveView(id)}
            className={`${secondaryButtonClass} ${
              activeView === id
                ? "border-primary bg-primary/10 text-primary"
                : ""
            }`}>
            {label}
          </button>
        ))}
      </nav>

      {activeView === "requests" && <Requests viewerId={user.id} />}

      {activeView === "maintenance" && <Maintenance />}

      {activeView === "releases" && <Releases />}

      {activeView === "recaps" && <Recaps />}

      {activeView === "overview" && (
        <Dashboard onNewRequest={() => setActiveView("requests")} />
      )}
    </div>
  )
}
