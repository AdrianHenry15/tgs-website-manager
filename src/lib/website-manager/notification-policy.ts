/**
 * Compatibility with the labels currently supplied by the status route.
 * When release summaries are implemented, move Live notifications there.
 */
const clientActionStatuses = new Set([
  "Waiting on client",
  "Waiting on you",
  "Ready for review",
  "Live",
])

export function shouldEmailRequestStatus(statusLabel: string) {
  return clientActionStatuses.has(statusLabel)
}

export function normalizeNotificationEmail(email: string) {
  return email.trim().toLowerCase()
}
