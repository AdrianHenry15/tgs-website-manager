"use client"

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import type { Session } from "@supabase/supabase-js"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Requests } from "@/components/website-manager/requests"
import {
  buttonClass,
  inputClass,
  labelClass,
  linkButtonClass,
  panelClass,
  secondaryButtonClass,
} from "@/components/website-manager/styles"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type AuthMode = "sign-in" | "forgot"

export default function WebsiteManagerPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [mode, setMode] = useState<AuthMode>("sign-in")
  const [resetLink, setResetLink] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const turnstile = useRef<TurnstileInstance | null>(null)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") {
        const params = new URLSearchParams(window.location.search)
        setResetLink((current) => current || params.get("reset") === "1")
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

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setCaptchaToken(null)
    setError("")
    setNotice("")
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (turnstileSiteKey && !captchaToken)) return

    const fields = new FormData(event.currentTarget)
    const email = String(fields.get("email") ?? "").trim()
    const captchaOptions = captchaToken ? { captchaToken } : {}

    setBusy(true)
    setError("")
    setNotice("")

    try {
      if (mode === "forgot") {
        const redirectTo = new URL("/?reset=1", window.location.origin).href
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          ...captchaOptions,
          redirectTo,
        })

        if (error) {
          setError("Could not request a reset link. Try again in a moment.")
          return
        }

        setNotice(
          "If an account exists for that email, a reset link will arrive shortly.",
        )
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: String(fields.get("password") ?? ""),
        options: captchaOptions,
      })

      if (error) setError(error.message)
    } catch {
      setError("Could not reach the sign-in service. Try again.")
    } finally {
      setCaptchaToken(null)
      turnstile.current?.reset()
      setBusy(false)
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!recoveryReady || !session || busy || passwordSaved) return

    const fields = new FormData(event.currentTarget)
    const password = String(fields.get("password") ?? "")
    const confirmation = String(fields.get("confirmation") ?? "")

    setError("")
    if (password !== confirmation) {
      setError("The passwords don’t match.")
      return
    }

    setBusy(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.message)
        return
      }

      setPasswordSaved(true)
    } catch {
      setError("Could not confirm the password change. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function signOut(afterReset = false) {
    setError("")
    setBusy(true)

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      if (error) {
        setError(error.message)
        return
      }

      if (afterReset) {
        window.location.replace("/")
        return
      }

      switchMode("sign-in")
    } catch {
      setError("Could not sign out. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const heading = resetLink
    ? "Set a new password"
    : mode === "forgot"
      ? "Reset your password"
      : "Sign in"

  return (
    <main className="min-h-dvh bg-[#10100f] bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.11),transparent_44%)] text-stone-100">
      {" "}
      {session && !resetLink ? (
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:py-12">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-5">
            <Brand />

            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
              className={secondaryButtonClass}>
              Sign out
            </button>
          </header>

          {error && (
            <p role="alert" className="mb-4 text-red-300">
              {error}
            </p>
          )}
          <Requests key={session.user.id} viewerId={session.user.id} />
        </div>
      ) : (
        <div className="mx-auto grid min-h-dvh max-w-lg content-center px-5 py-10">
          <section
            className={`${panelClass} border-t-2 border-t-orange-500 sm:p-8`}>
            <Brand />
            <h2 className="mt-6 text-lg font-semibold">{heading}</h2>

            {session === undefined ? (
              <p className="mt-3 text-sm text-stone-400">
                Checking your session…
              </p>
            ) : resetLink ? (
              passwordSaved ? (
                <div className="mt-4 grid gap-4">
                  <p role="status" className="text-sm text-orange-200">
                    Password updated. Use your new password to sign in.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signOut(true)}
                    className={buttonClass}>
                    Back to sign in
                  </button>
                </div>
              ) : recoveryReady && session ? (
                <form onSubmit={savePassword} className="mt-4 grid gap-4">
                  <PasswordField
                    label="New password"
                    name="password"
                    autoComplete="new-password"
                  />
                  <PasswordField
                    label="Confirm password"
                    name="confirmation"
                    autoComplete="new-password"
                  />
                  <button type="submit" disabled={busy} className={buttonClass}>
                    {busy ? "Saving…" : "Save password"}
                  </button>
                </form>
              ) : (
                <div className="mt-4 grid gap-3">
                  <p className="text-sm text-stone-300">
                    This reset link is unavailable. Return to sign in to request
                    a new one.
                  </p>
                  <Link href="/" className={linkButtonClass}>
                    Back to sign in
                  </Link>
                </div>
              )
            ) : (
              <form
                key={mode}
                onSubmit={submitAuth}
                className="mt-4 grid gap-4">
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

                {mode === "sign-in" && (
                  <PasswordField
                    label="Password"
                    name="password"
                    autoComplete="current-password"
                  />
                )}

                {turnstileSiteKey && (
                  <Turnstile
                    ref={turnstile}
                    siteKey={turnstileSiteKey}
                    onSuccess={setCaptchaToken}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => {
                      setCaptchaToken(null)
                      setError("CAPTCHA could not load. Refresh and try again.")
                    }}
                  />
                )}

                {notice && (
                  <p role="status" className="text-sm text-orange-200">
                    {notice}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || Boolean(turnstileSiteKey && !captchaToken)}
                  className={buttonClass}>
                  {mode === "forgot"
                    ? busy
                      ? "Sending…"
                      : "Send reset link"
                    : busy
                      ? "Signing in…"
                      : "Sign in"}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    switchMode(mode === "sign-in" ? "forgot" : "sign-in")
                  }
                  className={linkButtonClass}>
                  {mode === "sign-in" ? "Forgot password?" : "Back to sign in"}
                </button>
              </form>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="relative grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.035]">
        <span className="size-4 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.65),0_0_22px_4px_rgba(255,255,255,0.2)]" />
      </span>

      <div>
        <p className="text-xs font-medium text-stone-400">
          Third Generation Studios
        </p>
        <h1 className="text-lg font-semibold tracking-tight text-stone-100">
          Website Manager
        </h1>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string
  name: string
  autoComplete: "new-password" | "current-password"
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="grid gap-2">
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className={`${inputClass} pr-20`}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-controls={name}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-medium text-orange-300 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-orange-400">
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  )
}
