export type ReleaseWebsite = {
  id: string
  name: string
}

export type WebsiteRelease = {
  id: string
  website_id: string
  title: string
  summary: string
  live_url: string
  published_on: string | null
  published_at: string | null
  status: "draft" | "published"
  client_visible: boolean
  source: "manual" | "vercel"
  screenshot_path: string | null
  created_at: string
  updated_at: string
}

export const releaseColumns = [
  "id",
  "website_id",
  "title",
  "summary",
  "live_url",
  "published_on",
  "published_at",
  "status",
  "client_visible",
  "source",
  "screenshot_path",
  "created_at",
  "updated_at",
].join(",")
