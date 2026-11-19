export const SCHOOL_ZONE = "Asia/Kolkata";

export type GateSide = "OUTSIDE" | "INSIDE";
export type GateDirection = "ENTRY" | "EXIT";
export type CampusPresence = "NOT_ARRIVED" | "IN_CAMPUS" | "OUT";

export type GatePolicy = {
  cutOffTime: string;
  schoolEndTime: string;
  debounceMinutes: number;
  pairWindowSeconds: number;
  absenceAlertsEnabled: boolean;
};

export const defaultGatePolicy: GatePolicy = {
  cutOffTime: "08:30",
  schoolEndTime: "14:30",
  debounceMinutes: 3,
  pairWindowSeconds: 45,
  absenceAlertsEnabled: true,
};

export function schoolDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function minutesInSchoolDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHOOL_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

export function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function policyFrom(raw?: Partial<GatePolicy> | null): GatePolicy {
  return {
    cutOffTime: raw?.cutOffTime || defaultGatePolicy.cutOffTime,
    schoolEndTime: raw?.schoolEndTime || defaultGatePolicy.schoolEndTime,
    debounceMinutes: clampInt(raw?.debounceMinutes, 1, 60, defaultGatePolicy.debounceMinutes),
    pairWindowSeconds: clampInt(raw?.pairWindowSeconds, 5, 300, defaultGatePolicy.pairWindowSeconds),
    absenceAlertsEnabled: raw?.absenceAlertsEnabled !== false,
  };
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export type Sighting = {
  side: GateSide;
  heardAt: Date;
  rssi: number | null;
};

/** Outside then inside → entry. Inside then outside → exit. Equal times use stronger RSSI on the later side. */
export function directionFromPair(first: Sighting, second: Sighting): GateDirection | null {
  if (first.side === second.side) return null;
  const ordered =
    first.heardAt.getTime() < second.heardAt.getTime()
      ? [first, second]
      : first.heardAt.getTime() > second.heardAt.getTime()
        ? [second, first]
        : rssiOrder(first, second);
  const [earlier, later] = ordered;
  if (earlier.side === "OUTSIDE" && later.side === "INSIDE") return "ENTRY";
  if (earlier.side === "INSIDE" && later.side === "OUTSIDE") return "EXIT";
  return null;
}

function rssiOrder(a: Sighting, b: Sighting): [Sighting, Sighting] {
  const aRssi = a.rssi ?? -999;
  const bRssi = b.rssi ?? -999;
  if (a.side === "INSIDE" && aRssi >= bRssi) return [b, a];
  if (b.side === "INSIDE" && bRssi >= aRssi) return [a, b];
  if (a.side === "OUTSIDE") return [a, b];
  return [b, a];
}

export function withinPairWindow(a: Date, b: Date, pairWindowSeconds: number) {
  return Math.abs(a.getTime() - b.getTime()) <= pairWindowSeconds * 1000;
}

export function isDebounced(lastEventAt: Date | null | undefined, now: Date, debounceMinutes: number) {
  if (!lastEventAt) return false;
  return now.getTime() - lastEventAt.getTime() < debounceMinutes * 60 * 1000;
}

export function pastCutOff(now: Date, cutOffTime: string) {
  const cut = parseClock(cutOffTime);
  if (cut == null) return false;
  return minutesInSchoolDay(now) >= cut;
}

export function duringSchoolHours(at: Date, cutOffTime: string, schoolEndTime: string) {
  const start = parseClock(cutOffTime);
  const end = parseClock(schoolEndTime);
  if (start == null || end == null) return false;
  const minutes = minutesInSchoolDay(at);
  return minutes >= start && minutes < end;
}

export function presenceAfter(direction: GateDirection | null | undefined, hadEntry: boolean): CampusPresence {
  if (!hadEntry) return "NOT_ARRIVED";
  if (direction === "EXIT") return "OUT";
  if (direction === "ENTRY") return "IN_CAMPUS";
  return "NOT_ARRIVED";
}

export function isEarlyExit(input: {
  direction: GateDirection;
  occurredAt: Date;
  enteredAt: Date | null | undefined;
  cutOffTime: string;
  schoolEndTime: string;
}) {
  if (input.direction !== "EXIT" || !input.enteredAt) return false;
  return duringSchoolHours(input.occurredAt, input.cutOffTime, input.schoolEndTime);
}

export function instantOnSchoolDate(day: string, clock: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, date, hour, minute) - (5 * 60 + 30) * 60 * 1000);
}

/** Accepts ISO timestamps or `YYYY-MM-DDTHH:mm` as Asia/Kolkata local time. */
export function parseGateTime(value: string | Date | undefined | null, now = new Date()) {
  if (value == null || value === "") return now;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(trimmed);
  if (!match) return null;
  return instantOnSchoolDate(match[1], match[2]);
}

export function readingTime(value: Date | string | undefined, now = new Date()) {
  const date = parseGateTime(value, now);
  if (!date || Number.isNaN(date.getTime())) return null;
  if (date.getTime() - now.getTime() > 60_000) return null;
  if (now.getTime() - date.getTime() > 7 * 24 * 60 * 60 * 1000) return null;
  return date;
}
