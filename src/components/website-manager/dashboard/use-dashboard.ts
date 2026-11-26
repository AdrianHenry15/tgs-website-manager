"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { releaseColumns, type WebsiteRelease } from "../releases/types"

type Website = {
  id: string
  name: string
  maintenance_plan: string | null
}

type WaitingRequest = {
  id: string
  website_id: string
  title: string
}

type LatestRecap = {
  id: string
  website_id: string
  report_month: string
}

type Snapshot = {
  key: string
  websites: Website[]
  openCount: number
  waitingCount: number
  waiting: WaitingRequest[]
  release: WebsiteRelease | null
  recap: LatestRecap | null
  error: string
}

export function useDashboard(websiteId: string) {
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  const key = `${websiteId}:${revision}`

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        let openQuery = supabase
          .from("wm_requests")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .neq("status", "live")

        let waitingCountQuery = supabase
          .from("wm_requests")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "waiting_on_client")

        let waitingQuery = supabase
          .from("wm_requests")
          .select("id, website_id, title")
          .is("deleted_at", null)
          .eq("status", "waiting_on_client")
          .order("created_at")
          .limit(5)

        let releaseQuery = supabase
          .from("wm_releases")
          .select(releaseColumns)
          .eq("status", "published")
          .eq("client_visible", true)
          .order("published_on", { ascending: false })
          .order("published_at", { ascending: false })
          .limit(1)

        let recapQuery = supabase
          .from("wm_monthly_recaps")
          .select("id, website_id, report_month")
          .eq("status", "published")
          .order("report_month", { ascending: false })
          .order("published_at", { ascending: false })
          .limit(1)

        if (websiteId) {
          openQuery = openQuery.eq("website_id", websiteId)
          waitingCountQuery = waitingCountQuery.eq("website_id", websiteId)
          waitingQuery = waitingQuery.eq("website_id", websiteId)
          releaseQuery = releaseQuery.eq("website_id", websiteId)
          recapQuery = recapQuery.eq("website_id", websiteId)
        }

        const [
          websiteResult,
          openResult,
          waitingCountResult,
          waitingResult,
          releaseResult,
          recapResult,
        ] = await Promise.all([
          supabase
            .from("wm_websites")
            .select("id, name, maintenance_plan")
            .order("name")
            .abortSignal(controller.signal),

          openQuery.abortSignal(controller.signal),

          waitingCountQuery.abortSignal(controller.signal),

          waitingQuery.abortSignal(controller.signal),

          releaseQuery.abortSignal(controller.signal).maybeSingle(),

          recapQuery.abortSignal(controller.signal).maybeSingle(),
        ])

        if (
          websiteResult.error ||
          openResult.error ||
          waitingCountResult.error ||
          waitingResult.error ||
          releaseResult.error ||
          recapResult.error
        ) {
          throw new Error("Could not load the dashboard.")
        }

        if (!active) return

        setSnapshot({
          key,
          websites: websiteResult.data ?? [],
          openCount: openResult.count ?? 0,
          waitingCount: waitingCountResult.count ?? 0,
          waiting: waitingResult.data ?? [],
          release: releaseResult.data as unknown as WebsiteRelease | null,
          recap: recapResult.data,
          error: "",
        })
      } catch {
        if (!active) return

        setSnapshot({
          key,
          websites: [],
          openCount: 0,
          waitingCount: 0,
          waiting: [],
          release: null,
          recap: null,
          error: "Could not load the dashboard. Try again.",
        })
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [websiteId, key])

  return {
    data: snapshot?.key === key ? snapshot : null,
    loading: snapshot?.key !== key,
    refresh: () => setRevision((current) => current + 1),
  }
}
