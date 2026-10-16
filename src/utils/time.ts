export function calendarDate(timeZone: string, input?: string | Date) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatClock(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
}

export function dayAnchor(scheduledDate: string) {
  return new Date(`${scheduledDate}T12:00:00.000Z`);
}

export function isHistoricalEvent(occurredAt: Date, receivedAt = new Date(), thresholdMs = 10 * 60 * 1000) {
  return receivedAt.getTime() - occurredAt.getTime() > thresholdMs;
}
