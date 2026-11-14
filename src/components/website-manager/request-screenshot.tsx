import { useEffect, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass, inputClass, labelClass } from "./styles"

const bucket = supabase.storage.from("wm-request-screenshots")
const fileName = "screenshot"
const maxBytes = 5 * 1024 * 1024

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function RequestScreenshot({
  requestId,
  canUpload,
}: {
  requestId: string
  canUpload: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hasScreenshot, setHasScreenshot] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [busy, setBusy] = useState(false)
  const objectPath = `${requestId}/${fileName}`

  useEffect(() => {
    if (!open) return

    let active = true

    async function loadScreenshot() {
      try {
        const { data, error } = await bucket.list(requestId, {
          search: fileName,
          limit: 1,
        })

        if (!active) return

        if (error) {
          setLoadError(error.message)
          return
        }

        setHasScreenshot(data.some((object) => object.name === fileName))
      } catch {
        if (active) {
          setLoadError(
            "Could not check for a screenshot. Reopen this panel to retry.",
          )
        }
      }
    }

    void loadScreenshot()
    return () => {
      active = false
    }
  }, [open, requestId])

  async function uploadScreenshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canUpload || busy || hasScreenshot !== false) return

    const form = event.currentTarget
    const file = new FormData(form).get("screenshot")
    setActionError("")

    if (
      !(file instanceof File) ||
      !Object.hasOwn(extensions, file.type) ||
      file.size === 0 ||
      file.size > maxBytes
    ) {
      setActionError("Choose a PNG, JPEG, or WebP image up to 5 MiB.")
      return
    }

    setBusy(true)

    try {
      const { error } = await bucket.upload(objectPath, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) {
        setActionError(error.message)
        return
      }

      setHasScreenshot(true)
    } catch {
      setActionError(
        "Could not confirm the upload. Reopen this panel before retrying.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function downloadScreenshot() {
    if (busy) return

    setActionError("")
    setBusy(true)

    try {
      const { data, error } = await bucket.download(objectPath)

      if (error) {
        setActionError(error.message)
        return
      }

      const url = URL.createObjectURL(data)
      const link = document.createElement("a")
      const extension = extensions[data.type]

      link.href = url
      link.download = extension ? `screenshot.${extension}` : "screenshot"
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setActionError("Could not download the screenshot. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <details
      className="rounded-lg border border-zinc-800 p-3 text-sm"
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open

        if (nextOpen && !open) {
          setHasScreenshot(null)
          setLoadError("")
          setActionError("")
        }

        setOpen(nextOpen)
      }}>
      <summary className="cursor-pointer font-medium">Screenshot</summary>

      <div className="mt-3 grid gap-3">
        {loadError ? (
          <p role="alert" className="text-red-300">
            {loadError}
          </p>
        ) : hasScreenshot === null ? (
          <p className="text-zinc-400">Checking for a screenshot…</p>
        ) : hasScreenshot ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadScreenshot()}
            className={`${buttonClass} justify-self-start`}>
            Download screenshot
          </button>
        ) : canUpload ? (
          <form onSubmit={uploadScreenshot} className="grid gap-3">
            <label className={labelClass}>
              Screenshot (PNG, JPEG, or WebP, up to 5 MiB)
              <input
                name="screenshot"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                disabled={busy}
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className={`${buttonClass} justify-self-start`}>
              {busy ? "Uploading…" : "Attach screenshot"}
            </button>
          </form>
        ) : (
          <p className="text-zinc-400">No screenshot attached.</p>
        )}

        {actionError && (
          <p role="alert" className="text-red-300">
            {actionError}
          </p>
        )}
      </div>
    </details>
  )
}
