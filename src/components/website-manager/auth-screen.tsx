"use client"

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import {
  buttonClass,
  inputClass,
  labelClass,
  linkButtonClass,
  panelClass,
} from "./styles"
import { Brand, PasswordField } from "./auth-ui"
import Link from "next/link"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type AuthScreenProps = {
  screen: "loading" | "sign-in" | "recovery"
  recoveryReady: boolean
}

export function AuthScreen({ screen, recoveryReady }: AuthScreenProps) {
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const turnstile = useRef<TurnstileInstance | null>(null)

  const recovery = screen === "recovery"
  const forgot = mode === "forgot"

  function switchMode() {
    setMode(forgot ? "sign-in" : "forgot")
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
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: new URL("/?reset=1", window.location.origin).href,
          ...captchaOptions,
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
    if (!recoveryReady || busy || passwordSaved) return

    const fields = new FormData(event.currentTarget)
    const password = String(fields.get("password") ?? "")
    const confirmation = String(fields.get("confirmation") ?? "")

    setError("")

    if (password.length < 8 || password.length > 128) {
      setError("Use a password containing 8–128 characters.")
      return
    }

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

  async function finishRecovery() {
    setError("")
    setBusy(true)

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })

      if (error) {
        setError(error.message)
        return
      }

      window.location.replace("/")
    } catch {
      setError("Could not sign out. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-lg content-center px-5 py-10">
      <section
        className={`${panelClass} border-t-2 border-t-orange-500 sm:p-8`}>
        <Brand />

        <h2 className="mt-6 text-lg font-semibold">
          {recovery
            ? "Set a new password"
            : forgot
              ? "Reset your password"
              : "Sign in"}
        </h2>

        {screen === "loading" ? (
          <p className="mt-3 text-sm text-stone-400">Checking your session…</p>
        ) : recovery ? (
          passwordSaved ? (
            <div className="mt-4 grid gap-4">
              <p role="status" className="text-sm text-orange-200">
                Password updated. Use your new password to sign in.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void finishRecovery()}
                className={buttonClass}>
                Back to sign in
              </button>
            </div>
          ) : recoveryReady ? (
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
                This reset link is unavailable. Return to sign in to request a
                new one.
              </p>
              <button
                type="button"
                className={linkButtonClass}
                onClick={() => window.location.replace("/")}>
                Back to sign in
              </button>
            </div>
          )
        ) : (
          <form key={mode} onSubmit={submitAuth} className="mt-4 grid gap-4">
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

            {!forgot && (
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
              {forgot
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
              onClick={switchMode}
              className={linkButtonClass}>
              {forgot ? "Back to sign in" : "Forgot password?"}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}
        {screen === "sign-in" && !forgot && (
          <div className="mt-6 border-t border-stone-800 pt-4">
            <Link href="/maintenance" className={linkButtonClass}>
              Explore website maintenance
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
