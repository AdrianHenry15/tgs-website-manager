"use client"

import type { Session } from "@supabase/supabase-js"
import { useEffect, useState } from "react"
import {
  buttonClass,
  inputClass,
  labelClass,
  panelClass,
} from "@/components/website-manager/styles"
import { supabase } from "@/lib/supabase"
import { Requests } from "@/components/website-manager/requests"

export default function WebsiteManagerPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(event: React.ChangeEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const fields = new FormData(event.currentTarget)
    setError("")
    setBusy(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(fields.get("email") ?? "").trim(),
        password: String(fields.get("password") ?? ""),
      })

      if (error) setError(error.message)
    } catch {
      setError("Could not sign in. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setError("")

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      if (error) setError(error.message)
    } catch {
      setError("Could not sign out. Try again.")
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 text-zinc-100">
      {session ? (
        <>
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">TGS Website Manager</h1>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-zinc-500 px-4 py-2 text-sm">
              Sign out
            </button>
          </header>

          {error && (
            <p role="alert" className="mb-4 text-red-300">
              {error}
            </p>
          )}

          <Requests key={session.user.id} viewerId={session.user.id} />
        </>
      ) : (
        <section className={`${panelClass} mx-auto max-w-md shadow-xl`}>
          <h1 className="text-2xl font-semibold tracking-tight">
            TGS Website Manager
          </h1>

          {session === undefined ? (
            <p className="mt-4 text-sm text-zinc-400">Checking your session…</p>
          ) : (
            <form onSubmit={signIn} className="mt-6 grid gap-4">
              <label className={labelClass}>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy} className={buttonClass}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  )
}
