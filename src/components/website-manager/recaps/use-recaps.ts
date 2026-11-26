"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export type MonthlyRecap = {
  id: string
  website_id: string
  report_month: string
  status: "draft" | "published"
  completed_items: unknown
  open_items: unknown
  release_items: unknown
  generated_at: string
  published_at: string | null
}

type Website = {
  id: string
  name: string
}

export function useRecaps() {
  const [websites, setWebsites] = useState<Website[]>([])
  const [recaps, setRecaps] = useState<MonthlyRecap[]>([])
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
        const [websiteResult, recapResult, managedResult] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name")
            .order("name")
            .abortSignal(controller.signal),

          supabase
            .from("wm_monthly_recaps")
            .select(
              "id, website_id, report_month, status, completed_items, open_items, release_items, generated_at, published_at",
              { count: "exact" },
            )
            .order("report_month", { ascending: false })
            .order("id")
            .limit(100)
            .abortSignal(controller.signal),

          supabase.rpc("wm_managed_website_ids").abortSignal(controller.signal),
        ])

        if (websiteResult.error || recapResult.error || managedResult.error) {
          throw new Error("Could not load monthly recaps.")
        }

        if (!active) return

        const assignments = (managedResult.data ?? []) as {
          website_id: string
        }[]

        setWebsites(websiteResult.data ?? [])
        setRecaps((recapResult.data ?? []) as MonthlyRecap[])
        setManagedIds(assignments.map(({ website_id }) => website_id))
        setTotal(recapResult.count ?? 0)
      } catch {
        if (active) {
          setError("Could not load monthly recaps. Try again.")
        }
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

  return {
    websites,
    recaps,
    managedIds,
    total,
    loading,
    error,
    refresh: () => setRevision((current) => current + 1),
  }
}
