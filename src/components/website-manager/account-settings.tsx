"use client"

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { createClient } from "@supabase/supabase-js"
import { useRef, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { PasswordField } from "./auth-ui"
import {
  buttonClass,
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
} from "./styles"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type AccountMode = "email" | "password"

export function AccountSettings({ email }: { email: string }) {
  const [mode, setMode] = useState<AccountMode>("email")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const turnstile = useRef<TurnstileInstance | null>(null)

  const changingEmail = mode === "email"

  function selectMode(nextMode: AccountMode) {
    if (nextMode === mode) return

    setMode(nextMode)
    setCaptchaToken(null)
    setError("")
    setNotice("")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const currentPassword = String(fields.get("account-current-password") ?? "")
    const newEmail = String(fields.get("account-new-email") ?? "").trim()
    const confirmEmail = String(
      fields.get("account-confirm-email") ?? "",
    ).trim()
    const newPassword = String(fields.get("account-new-password") ?? "")
    const confirmPassword = String(fields.get("account-confirm-password") ?? "")

    setError("")
    setNotice("")

    if (!currentPassword || currentPassword.length > 128) {
      setError("Enter your current password.")
      return
    }

    if (changingEmail) {
      if (
        newEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
      ) {
        setError("Enter a valid email address.")
        return
      }

      if (newEmail.toLowerCase() !== confirmEmail.toLowerCase()) {
        setError("The email addresses don’t match.")
        return
      }
    } else {
      if (newPassword.length < 8 || newPassword.length > 128) {
        setError("Use a password containing 8–128 characters.")
        return
      }

      if (newPassword !== confirmPassword) {
        setError("The passwords don’t match.")
        return
      }

      if (newPassword === currentPassword) {
        setError("Choose a password different from your current one.")
        return
      }
    }

    if (turnstileSiteKey && !captchaToken) {
      setError("Complete the verification check and try again.")
      return
    }

    setBusy(true)

    let verificationClient: ReturnType<typeof createClient> | undefined
    let hasVerificationSession = false

    try {
      const { data, error: userError } = await supabase.auth.getUser()
      const user = data.user

      if (userError || !user?.email) {
        setError("Your session has expired. Sign in again.")
        return
      }

      if (
        changingEmail &&
        newEmail.toLowerCase() === user.email.toLowerCase()
      ) {
        setError("Enter an email address different from your current one.")
        return
      }

      verificationClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            storageKey: "tgs-website-manager-account-verification",
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      )

      const { data: verified, error: verificationError } =
        await verificationClient.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
          options: captchaToken ? { captchaToken } : undefined,
        })

      hasVerificationSession = Boolean(verified.session)

      if (verificationError) {
        if (verificationError.code === "captcha_failed") {
          setError(
            "Verification failed or expired. Complete a fresh check and try again.",
          )
        } else if (verificationError.status === 429) {
          setError("Too many attempts. Wait a moment and try again.")
        } else {
          setError("Could not verify your current password.")
        }
        return
      }

      if (!verified.session || verified.user?.id !== user.id) {
        setError("Could not verify your account. Sign in again.")
        return
      }

      const passwordUpdate = {
        password: newPassword,
        current_password: currentPassword,
      }

      const { error: updateError } = changingEmail
        ? await verificationClient.auth.updateUser(
            { email: newEmail },
            { emailRedirectTo: new URL("/", window.location.origin).href },
          )
        : await verificationClient.auth.updateUser(passwordUpdate)

      if (updateError) {
        if (updateError.status === 429) {
          setError("Too many requests. Wait a moment and try again.")
        } else if (updateError.code === "weak_password") {
          setError("Choose a stronger password and try again.")
        } else if (updateError.code === "same_password") {
          setError("Choose a password different from your current one.")
        } else {
          setError(
            changingEmail
              ? "Could not request the email change. Check the address and try again."
              : "Could not update your password. Try again or use Forgot password.",
          )
        }
        return
      }

      form.reset()
      setNotice(
        changingEmail
          ? "Check your current and new inboxes for confirmation instructions."
          : "Password updated. Use your new password the next time you sign in.",
      )
    } catch {
      setError(
        changingEmail
          ? "Could not confirm the email change request. Check your inboxes before retrying."
          : "Could not confirm the password change. Try signing in with your new password.",
      )
    } finally {
      if (verificationClient && hasVerificationSession) {
        await verificationClient.auth
          .signOut({ scope: "local" })
          .catch(() => undefined)
      }

      setCaptchaToken(null)
      turnstile.current?.reset()
      setBusy(false)
    }
  }

  return (
    <section className={`${panelClass} space-y-5`}>
      <div>
        <h2 className="text-lg font-semibold text-stone-100">My Account</h2>
        <p className="mt-1 break-all text-sm text-stone-400">{email}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={changingEmail ? buttonClass : secondaryButtonClass}
          aria-pressed={changingEmail}
          disabled={busy}
          onClick={() => selectMode("email")}>
          Change email
        </button>

        <button
          type="button"
          className={changingEmail ? secondaryButtonClass : buttonClass}
          aria-pressed={!changingEmail}
          disabled={busy}
          onClick={() => selectMode("password")}>
          Change password
        </button>
      </div>

      <form key={mode} onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <PasswordField
            label="Current password"
            name="account-current-password"
            autoComplete="current-password"
          />

          {changingEmail ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`grid gap-2 ${labelClass}`}>
                New email
                <input
                  className={inputClass}
                  name="account-new-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>

              <label className={`grid gap-2 ${labelClass}`}>
                Confirm new email
                <input
                  className={inputClass}
                  name="account-confirm-email"
                  type="email"
                  autoComplete="off"
                  maxLength={254}
                  required
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordField
                label="New password"
                name="account-new-password"
                autoComplete="new-password"
              />

              <PasswordField
                label="Confirm new password"
                name="account-confirm-password"
                autoComplete="new-password"
              />
            </div>
          )}
        </fieldset>

        {turnstileSiteKey && (
          <Turnstile
            ref={turnstile}
            siteKey={turnstileSiteKey}
            onSuccess={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
            onError={() => {
              setCaptchaToken(null)
              setError("Verification could not load. Refresh and try again.")
            }}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="text-sm text-green-300">
            {notice}
          </p>
        )}

        <button
          type="submit"
          className={buttonClass}
          disabled={busy || Boolean(turnstileSiteKey && !captchaToken)}>
          {busy
            ? "Saving…"
            : changingEmail
              ? "Send confirmation email"
              : "Save new password"}
        </button>
      </form>
    </section>
  )
}
