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
        if (params.get("reset") === "1") setResetLink(true)
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
  const [activeView, setActiveView] = useState<"requests" | "maintenance">(
    "requests",
  )
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState("")

  async function signOut() {
    setSignOutError("")
    setSigningOut(true)

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      if (error) setSignOutError(error.message)
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
        <div className="mb-6 space-y-4">
          <AccountSettings email={user.email ?? ""} />
          <WebsiteBilling />
          <RemoveWebsiteAccess />
        </div>
      )}

      <nav
        aria-label="Workspace sections"
        className="mb-6 flex flex-wrap gap-2">
        {(["requests", "maintenance"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-current={activeView === view ? "page" : undefined}
            onClick={() => setActiveView(view)}
            className={`${secondaryButtonClass} ${
              activeView === view
                ? "border-primary bg-primary/10 text-primary"
                : ""
            }`}>
            {view === "requests" ? "Requests" : "Maintenance"}
          </button>
        ))}
      </nav>

      {activeView === "requests" ? (
        <Requests viewerId={user.id} />
      ) : (
        <Maintenance />
      )}
    </div>
  )
}
