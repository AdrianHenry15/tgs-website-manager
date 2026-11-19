"use client"

import { useState } from "react"
import { inputClass, labelClass } from "./styles"

export function Brand() {
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="relative grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-sidebar">
        <span className="size-4 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.65),0_0_22px_4px_rgba(255,255,255,0.2)]" />
      </span>

      <div>
        <p className="text-xs font-medium text-muted">
          Third Generation Studios
        </p>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Website Manager
        </h1>
      </div>
    </div>
  )
}

type PasswordFieldProps = {
  label: string
  name: string
  autoComplete: "new-password" | "current-password"
}

export function PasswordField({
  label,
  name,
  autoComplete,
}: PasswordFieldProps) {
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
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-medium text-primary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-primary">
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  )
}
