const clientActionStatuses = new Set([
  "Waiting on client",
  "Waiting on you",
  "Ready for review",
])

export function shouldEmailRequestStatus(statusLabel: string) {
  return clientActionStatuses.has(statusLabel)
}

export function normalizeNotificationEmail(email: string) {
  return email.trim().toLowerCase()
}
