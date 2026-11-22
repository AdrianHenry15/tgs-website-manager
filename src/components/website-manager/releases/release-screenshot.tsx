"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { secondaryButtonClass } from "../styles"
import type { WebsiteRelease } from "./types"

type Props = {
  release: WebsiteRelease
  canManage: boolean
  onChanged: () => void
}

const bucket = "wm-release-screenshots"
const maximumSize = 10 * 1024 * 1024

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function ReleaseScreenshot({ release, canManage, onChanged }: Props) {
  const [preview, setPreview] = useState("")
  const [previewError, setPreviewError] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)

  const busy = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!release.screenshot_path) return

    let active = true
    const path = release.screenshot_path

    async function loadPreview() {
      const { data, error: signingError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 300)

      if (!active) return

      if (signingError || !data?.signedUrl) {
        setPreview("")
        setPreviewError("Could not load the screenshot.")
        return
      }

      setPreview(data.signedUrl)
      setPreviewError("")
    }

    void loadPreview()

    // Refresh the private URL before its five-minute expiry.
    const timer = window.setInterval(() => {
      void loadPreview()
    }, 240_000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [release.screenshot_path, revision])

  async function removeStoredFile(path: string) {
    try {
      const { error: cleanupError } = await supabase.storage
        .from(bucket)
        .remove([path])

      if (cleanupError) {
        console.error("Could not clean up release screenshot", {
          releaseId: release.id,
        })
      }
    } catch {
      console.error("Could not clean up release screenshot", {
        releaseId: release.id,
      })
    }
  }

  async function upload(file: File) {
    if (busy.current || !canManage) return

    setError("")

    const extension = extensions[file.type]

    if (!extension) {
      setError("Choose a PNG, JPEG, or WebP image.")
      return
    }

    if (file.size === 0 || file.size > maximumSize) {
      setError("Choose an image smaller than 10 MB.")
      return
    }

    busy.current = true
    setSaving(true)

    const path = `${release.id}/${crypto.randomUUID()}.${extension}`
    let uploaded = false
    let linkingStarted = false

    try {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "300",
          upsert: false,
        })

      if (uploadError) {
        throw new Error("Could not upload the screenshot. Try again.")
      }

      uploaded = true
      linkingStarted = true

      const { data, error: updateError } = await supabase
        .from("wm_releases")
        .update({ screenshot_path: path })
        .eq("id", release.id)
        .eq("source", "manual")
        .eq("updated_at", release.updated_at)
        .select("id")
        .maybeSingle()

      if (updateError) {
        // The write may have committed despite a transport error.
        // Keep the uploaded file until history confirms the result.
        setError(
          "Could not confirm the screenshot attachment. Refresh history before trying again.",
        )
        return
      }

      if (!data) {
        await removeStoredFile(path)
        setError(
          "This release changed. Refresh history before attaching a screenshot.",
        )
        return
      }

      if (release.screenshot_path) {
        await removeStoredFile(release.screenshot_path)
      }

      onChanged()
    } catch (caught) {
      if (uploaded && !linkingStarted) {
        await removeStoredFile(path)
      }

      setError(
        linkingStarted
          ? "Could not confirm the attachment. Refresh history before trying again."
          : caught instanceof Error
            ? caught.message
            : "Could not upload the screenshot.",
      )
    } finally {
      busy.current = false
      setSaving(false)

      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  async function remove() {
    if (busy.current || !canManage || !release.screenshot_path) return

    busy.current = true
    setSaving(true)
    setError("")

    try {
      // Unlink first so clients cannot obtain new signed URLs.
      const { data, error: updateError } = await supabase
        .from("wm_releases")
        .update({ screenshot_path: null })
        .eq("id", release.id)
        .eq("source", "manual")
        .eq("updated_at", release.updated_at)
        .select("id")
        .maybeSingle()

      if (updateError || !data) {
        setError(
          "Could not confirm removal. Refresh history before trying again.",
        )
        return
      }

      await removeStoredFile(release.screenshot_path)
      onChanged()
    } catch {
      setError(
        "Could not confirm removal. Refresh history before trying again.",
      )
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (!release.screenshot_path && !canManage) return null

  return (
    <div className="mt-4 space-y-3">
      {release.screenshot_path && (
        <>
          {preview ? (
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open screenshot of ${release.title}`}
              className="block overflow-hidden rounded-xl border border-border">
              <Image
                src={preview}
                alt={`Updated website: ${release.title}`}
                width={1200}
                height={800}
                unoptimized
                className="h-auto max-h-96 w-full object-contain"
                onError={() => {
                  setPreview("")
                  setPreviewError("Could not display the screenshot.")
                }}
              />
            </a>
          ) : (
            <p role="status" className="text-sm text-muted">
              {previewError || "Loading screenshot…"}
            </p>
          )}

          {previewError && (
            <button
              type="button"
              onClick={() => setRevision((current) => current + 1)}
              className={secondaryButtonClass}>
              Reload screenshot
            </button>
          )}
        </>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={`Choose screenshot for ${release.title}`}
            disabled={saving}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void upload(file)
            }}
          />

          <button
            type="button"
            disabled={saving}
            onClick={() => inputRef.current?.click()}
            className={secondaryButtonClass}>
            {saving
              ? "Saving…"
              : release.screenshot_path
                ? "Replace screenshot"
                : "Add screenshot"}
          </button>

          {release.screenshot_path && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              className={secondaryButtonClass}>
              Remove screenshot
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
