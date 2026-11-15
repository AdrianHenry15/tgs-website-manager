import { useEffect, useState, type FormEvent } from "react"
import { supabase } from "@/lib/supabase"
import { buttonClass } from "../styles"

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
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

  function chooseScreenshot(file: File | null) {
    setSelectedFile(null)
    setActionError("")

    if (!file) return

    if (
      !Object.hasOwn(extensions, file.type) ||
      file.size === 0 ||
      file.size > maxBytes
    ) {
      setActionError("Choose a PNG, JPEG, or WebP image up to 5 MiB.")
      return
    }

    setSelectedFile(file)
  }

  async function uploadScreenshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canUpload || busy || hasScreenshot !== false) return

    const file = selectedFile
    if (!file) return

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

      setSelectedFile(null)
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
          <>
            {open && (
              <ScreenshotPreview key={objectPath} objectPath={objectPath} />
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadScreenshot()}
              className={`${buttonClass} justify-self-start`}>
              Download screenshot
            </button>
          </>
        ) : canUpload ? (
          <form onSubmit={uploadScreenshot} className="grid gap-3">
            <div
              className="grid justify-items-center gap-3 rounded-xl border border-dashed border-orange-400/40 bg-orange-500/5 px-4 py-6 text-center"
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = busy ? "none" : "copy"
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (busy) return

                const files = event.dataTransfer.files
                if (files.length !== 1) {
                  setSelectedFile(null)
                  setActionError("Drop one screenshot at a time.")
                  return
                }

                chooseScreenshot(files.item(0))
              }}>
              <div>
                <p className="font-medium text-stone-100">
                  Drop a screenshot here
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  PNG, JPEG, or WebP · Up to 5 MiB
                </p>
              </div>

              <label
                className={`rounded-lg border border-orange-400/40 px-3 py-2 font-medium text-orange-200 focus-within:ring-2 focus-within:ring-orange-400 ${
                  busy ? "opacity-50" : "cursor-pointer hover:bg-orange-500/10"
                }`}>
                Choose file
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  className="sr-only"
                  onChange={(event) => {
                    const input = event.currentTarget
                    const file = input.files?.item(0)
                    if (file) chooseScreenshot(file)
                    input.value = ""
                  }}
                />
              </label>

              {selectedFile && (
                <p
                  role="status"
                  className="max-w-full wrap-break-word text-sm text-stone-300">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy || !selectedFile}
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

function ScreenshotPreview({ objectPath }: { objectPath: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    async function loadPreview() {
      try {
        const { data, error } = await bucket.download(objectPath)
        if (!active) return

        if (error || !data) {
          setError("Preview unavailable. Try downloading the screenshot.")
          return
        }

        objectUrl = URL.createObjectURL(data)
        setPreviewUrl(objectUrl)
      } catch {
        if (active) {
          setError("Preview unavailable. Try downloading the screenshot.")
        }
      }
    }

    void loadPreview()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectPath])

  if (error)
    return (
      <p role="status" className="text-stone-400">
        {error}
      </p>
    )

  if (!previewUrl) {
    return (
      <p role="status" className="text-stone-400">
        Loading screenshot…
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-800 bg-stone-950 p-2">
      {/* The preview comes from a local blob URL created after an authenticated download. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt="Screenshot attached to this request"
        onError={() =>
          setError("Preview unavailable. Try downloading the screenshot.")
        }
        className="mx-auto block max-h-96 w-full rounded-lg object-contain"
      />
    </div>
  )
}
