import { inputClass } from "./styles"

type Website = {
  id: string
  name: string
  maintenance_plan: string | null
}

type WebsiteSwitcherProps = {
  websites: Website[]
  selectedWebsiteId: string
  onSelect: (websiteId: string) => void
}

export function WebsiteSwitcher({
  websites,
  selectedWebsiteId,
  onSelect,
}: WebsiteSwitcherProps) {
  if (websites.length === 0) return null

  const selectedWebsite =
    websites.length === 1
      ? websites[0]
      : websites.find((website) => website.id === selectedWebsiteId)

  return (
    <section
      aria-label="Website workspace"
      className="flex min-w-0 flex-wrap items-center justify-between gap-5 border-b border-border pb-6">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">
          {websites.length === 1 ? "Your website" : "Website workspace"}
        </p>

        <h2 className="mt-2 wrap-break-word font-sans text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {selectedWebsite?.name ?? "All websites"}
        </h2>

        <p className="mt-2 text-sm text-muted">
          {selectedWebsite
            ? (selectedWebsite.maintenance_plan ??
              "Requests and updates for this website")
            : `Manage requests across ${websites.length} websites`}
        </p>
      </div>

      {websites.length > 1 && (
        <label className="grid w-full gap-2 text-sm font-medium text-foreground sm:w-64">
          View website
          <select
            value={selectedWebsite?.id ?? ""}
            onChange={(event) => onSelect(event.currentTarget.value)}
            className={inputClass}>
            <option value="">All websites</option>

            {websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}
