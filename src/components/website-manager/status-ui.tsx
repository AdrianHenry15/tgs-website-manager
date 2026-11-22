const tones: Record<string, string> = {
  received: "info",
  open: "info",
  in_progress: "progress",
  waiting_on_client: "waiting",
  waiting: "waiting",
  ready_for_review: "scheduled",
  scheduled: "scheduled",
  live: "success",
  completed: "success",
  trash: "danger",
  all: "neutral",
}

export function statusToneClass(status: string) {
  return `wm-tone-${tones[status] ?? "neutral"}`
}

export function StatusBadge({
  status,
  label,
}: {
  status: string
  label: string
}) {
  return (
    <span
      className={`wm-status ${statusToneClass(status)} inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
