"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

export type MaintenanceActivity = {
  id: string
  website_id: string
  title: string
  description: string
  source: "recurring" | "one_off" | "request"
  category: string
  status: "open" | "completed"
  client_visible: boolean
  due_on: string | null
  completed_at: string | null
  updated_at: string
}

type Website = {
  id: string
  name: string
}

const activityColumns =
  "id, website_id, title, description, source, category, status, client_visible, due_on, completed_at, updated_at" as const

export function useMaintenance(month: string) {
  const [websites, setWebsites] = useState<Website[]>([])
  const [activities, setActivities] = useState<MaintenanceActivity[]>([])
  const [managedIds, setManagedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const saving = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    const version = ++generation.current
    let active = true

    async function load() {
      setLoading(true)
      setLoadError("")
      setActionError("")

      try {
        const [sites, items, managed] = await Promise.all([
          supabase.from("wm_websites").select("id, name").order("name"),

          supabase
            .from("wm_activities")
            .select(activityColumns)
            .eq("report_month", `${month}-01`)
            .order("due_on", { ascending: true })
            .order("created_at", { ascending: false }),

          supabase.rpc("wm_managed_website_ids"),
        ])

        if (!active) return

        const failure = sites.error ?? items.error ?? managed.error
        if (failure) throw new Error(failure.message)

        setWebsites(sites.data ?? [])
        setActivities((items.data ?? []) as MaintenanceActivity[])
        setManagedIds(
          (managed.data ?? []).map(
            (row: { website_id: string }) => row.website_id,
          ),
        )
      } catch (failure) {
        if (active) {
          setActivities([])
          setWebsites([])
          setManagedIds([])
          setLoadError(
            failure instanceof Error
              ? failure.message
              : "Could not load maintenance activity.",
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false

      if (generation.current === version) {
        generation.current += 1
      }
    }
  }, [month, revision])

  function refresh() {
    setRevision((current) => current + 1)
  }

  async function toggleActivity(activity: MaintenanceActivity) {
    if (
      loading ||
      saving.current ||
      !managedIds.includes(activity.website_id)
    ) {
      return
    }

    saving.current = true
    setSavingId(activity.id)
    setActionError("")

    const version = generation.current
    const nextStatus = activity.status === "open" ? "completed" : "open"

    try {
      const { data, error } = await supabase
        .from("wm_activities")
        .update({ status: nextStatus })
        .eq("id", activity.id)
        .eq("status", activity.status)
        .eq("updated_at", activity.updated_at)
        .select(activityColumns)
        .maybeSingle()

      if (error) throw new Error(error.message)

      if (!data) {
        throw new Error(
          "This item changed or is no longer accessible. Refresh Maintenance before trying again.",
        )
      }

      if (version !== generation.current) return

      setActivities((current) =>
        current.map((item) =>
          item.id === data.id ? (data as MaintenanceActivity) : item,
        ),
      )
    } catch (failure) {
      if (version === generation.current) {
        setActionError(
          failure instanceof Error
            ? failure.message
            : "Could not save the activity.",
        )
      }
    } finally {
      saving.current = false
      setSavingId(null)
    }
  }

  return {
    websites,
    activities,
    managedIds,
    loading,
    loadError,
    error: loadError || actionError,
    savingId,
    refresh,
    toggleActivity,
  }
}
