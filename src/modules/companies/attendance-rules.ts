export const OFFICE_ZONE = "Asia/Kolkata";

export type AttendancePolicy = {
  gracePeriodMinutes: number;
  shiftStart: string;
  shiftEnd: string;
  lunchStart: string;
  lunchEnd: string;
  silenceCountsAsPersonal: boolean;
  lunchCountsAsPersonal: boolean;
  manualCountsAsPersonal: boolean;
  pilotOneFloor: boolean;
  reviewWindowHours: number;
  fieldCheckInAllowed: boolean;
  monitoringPolicy: string;
};

export type GapStatus = "OPEN" | "DISPUTED" | "APPROVED" | "REJECTED";

const clock = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseClock(value: string) {
  const match = clock.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function workDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function minutesInDay(date: Date) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const [hour, minute] = formatted.split(":").map(Number);
  return hour * 60 + minute;
}

export function instantOnDate(day: string, time: string) {
  const parsed = parseClock(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || parsed == null) return null;
  const [year, month, date] = day.split("-").map(Number);
  const hour = Math.floor(parsed / 60);
  const minute = parsed % 60;
  return new Date(Date.UTC(year, month - 1, date, hour, minute) - (5 * 60 + 30) * 60 * 1000);
}

export function parseOfficeTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return new Date();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(trimmed);
  if (!match) return null;
  return instantOnDate(match[1], match[2]);
}

export function exceedsGrace(lastSeen: Date, nextSeen: Date, graceMinutes: number) {
  return nextSeen.getTime() - lastSeen.getTime() > graceMinutes * 60 * 1000;
}

function lunchOverlapMinutes(startedAt: Date, endedAt: Date, lunchStart: string, lunchEnd: string) {
  const lunchFrom = parseClock(lunchStart);
  const lunchTo = parseClock(lunchEnd);
  if (lunchFrom == null || lunchTo == null || lunchTo <= lunchFrom) return 0;
  let minutes = 0;
  const cursor = new Date(startedAt);
  for (let step = 0; step < 3; step += 1) {
    const day = workDate(cursor);
    const from = day === workDate(startedAt) ? minutesInDay(startedAt) : 0;
    const to = day === workDate(endedAt) ? minutesInDay(endedAt) : 24 * 60;
    const left = Math.max(from, lunchFrom);
    const right = Math.min(to, lunchTo);
    if (right > left) minutes += right - left;
    if (day === workDate(endedAt)) break;
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return minutes;
}

export function personalMinutes(startedAt: Date, endedAt: Date, policy: Pick<AttendancePolicy, "lunchStart" | "lunchEnd" | "lunchCountsAsPersonal" | "silenceCountsAsPersonal">) {
  const total = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
  const lunch = lunchOverlapMinutes(startedAt, endedAt, policy.lunchStart, policy.lunchEnd);
  const silence = Math.max(0, total - lunch);
  const silenceMinutes = policy.silenceCountsAsPersonal === false ? 0 : silence;
  const lunchMinutes = policy.lunchCountsAsPersonal ? lunch : 0;
  return silenceMinutes + lunchMinutes;
}

export function describeGap(policy: AttendancePolicy, startedAt: Date, endedAt: Date) {
  const total = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
  const lunch = lunchOverlapMinutes(startedAt, endedAt, policy.lunchStart, policy.lunchEnd);
  const minutes = personalMinutes(startedAt, endedAt, policy);
  return {
    kind: lunch > 0 && lunch === total ? "LUNCH" as const : "SILENCE" as const,
    countsAsPersonal: minutes > 0,
    personalMinutes: minutes,
    reviewDeadline: new Date(endedAt.getTime() + policy.reviewWindowHours * 60 * 60 * 1000),
  };
}

export function isDeducted(gap: { status: string; countsAsPersonal?: boolean; reviewDeadline?: Date | string | null }, now: Date) {
  if (gap.countsAsPersonal === false) return false;
  if (gap.status === "APPROVED" || gap.status === "DISPUTED") return false;
  if (gap.status === "REJECTED") return true;
  if (gap.status !== "OPEN" || !gap.reviewDeadline) return false;
  return now.getTime() > new Date(gap.reviewDeadline).getTime();
}

export function gapOutcome(gap: { status: string; countsAsPersonal?: boolean; reviewDeadline?: Date | string | null }, now: Date) {
  if (gap.status === "APPROVED") return "On duty";
  if (gap.status === "DISPUTED") return "Disputed";
  if (gap.countsAsPersonal === false) return "Not personal";
  if (gap.status === "REJECTED" || isDeducted(gap, now)) return "Personal time";
  return "In review";
}

export function isLate(checkedInAt: Date, shiftStart: string) {
  const shift = parseClock(shiftStart);
  if (shift == null) return false;
  return minutesInDay(checkedInAt) > shift;
}

export function isEarlyExit(checkedOutAt: Date, shiftEnd: string) {
  const shift = parseClock(shiftEnd);
  if (shift == null) return false;
  return minutesInDay(checkedOutAt) < shift;
}

export function shouldCloseDay(day: string, now: Date, shiftEnd: string, graceMinutes: number) {
  const today = workDate(now);
  if (day < today) return true;
  if (day > today) return false;
  const shift = parseClock(shiftEnd);
  if (shift == null) return false;
  return minutesInDay(now) >= shift + graceMinutes;
}

export function workingMinutes(checkedInAt: Date, checkedOutAt: Date, deductedMinutes: number) {
  const span = Math.max(0, Math.round((checkedOutAt.getTime() - checkedInAt.getTime()) / 60000));
  return Math.max(0, span - deductedMinutes);
}

export function livePresence(input: {
  checkedInAt: Date | null;
  lastSeenAt: Date | null;
  checkedOutAt: Date | null;
  now: Date;
  graceMinutes: number;
}) {
  if (!input.checkedInAt) return "NOT_ARRIVED";
  if (input.checkedOutAt) return "CHECKED_OUT";
  if (!input.lastSeenAt) return "NOT_ARRIVED";
  if (input.now.getTime() - input.lastSeenAt.getTime() <= input.graceMinutes * 60 * 1000) return "IN_OFFICE";
  return "AWAY";
}

export function policyFrom(company: Partial<AttendancePolicy> | null | undefined): AttendancePolicy {
  return {
    gracePeriodMinutes: company?.gracePeriodMinutes || 15,
    shiftStart: company?.shiftStart || "09:30",
    shiftEnd: company?.shiftEnd || "18:30",
    lunchStart: company?.lunchStart || "13:00",
    lunchEnd: company?.lunchEnd || "14:00",
    silenceCountsAsPersonal: company?.silenceCountsAsPersonal !== false,
    lunchCountsAsPersonal: Boolean(company?.lunchCountsAsPersonal),
    manualCountsAsPersonal: company?.manualCountsAsPersonal !== false,
    pilotOneFloor: Boolean(company?.pilotOneFloor),
    reviewWindowHours: company?.reviewWindowHours || 48,
    fieldCheckInAllowed: Boolean(company?.fieldCheckInAllowed),
    monitoringPolicy: company?.monitoringPolicy || "",
  };
}
