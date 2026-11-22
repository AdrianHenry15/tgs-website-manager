"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import {
  releaseColumns,
  type ReleaseWebsite,
  type WebsiteRelease,
} from "./types"

export function useReleases() {
  const [websites, setWebsites] = useState<ReleaseWebsite[]>([])
  const [releases, setReleases] = useState<WebsiteRelease[]>([])
  const [managedIds, setManagedIds] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError("")

      try {
        const [websiteResult, releaseResult, managerResult] = await Promise.all(
          [
            supabase
              .from("wm_websites")
              .select("id, name")
              .order("name")
              .abortSignal(controller.signal),

            supabase
              .from("wm_releases")
              .select(releaseColumns, { count: "exact" })
              .order("published_on", {
                ascending: false,
                nullsFirst: false,
              })
              .order("created_at", { ascending: false })
              .limit(100)
              .abortSignal(controller.signal),

            supabase
              .rpc("wm_managed_website_ids")
              .abortSignal(controller.signal),
          ],
        )

        if (websiteResult.error || releaseResult.error || managerResult.error) {
          throw new Error("Could not load release history.")
        }

        if (!active) return

        const assignments = (managerResult.data ?? []) as {
          website_id: string
        }[]

        setWebsites(websiteResult.data ?? [])
        setReleases((releaseResult.data ?? []) as unknown as WebsiteRelease[])
        setManagedIds(assignments.map(({ website_id }) => website_id))
        setTotal(releaseResult.count ?? 0)
      } catch {
        if (!active) return

        setError("Could not load release history. Try again.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [revision])

  function refresh() {
    setRevision((current) => current + 1)
  }

  return {
    websites,
    releases,
    managedIds,
    total,
    loading,
    error,
    refresh,
  }
}
