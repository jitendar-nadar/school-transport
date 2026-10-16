import type { NotificationType, RouteDirection } from "@/types/domain";

export function boardTransition(status: string) {
  if (status === "BOARDED") return "duplicate" as const;
  if (status === "NOT_BOARDED" || status === "DETECTED") return "ok" as const;
  return "invalid" as const;
}

export function dropTransition(boardingStatus: string, dropStatus: string) {
  if (dropStatus === "DROPPED") return "duplicate" as const;
  if (boardingStatus !== "BOARDED") return "not_boarded" as const;
  return "ok" as const;
}

export function boardingNotificationType(direction: RouteDirection): NotificationType {
  return direction === "PICKUP" ? "STUDENT_BOARDING_CONFIRMED" : "STUDENT_BOARDING_FOR_HOME";
}

export function dropNotificationType(direction: RouteDirection): NotificationType {
  return direction === "PICKUP" ? "STUDENT_DROPPED_AT_SCHOOL" : "STUDENT_DROPPED_AT_HOME";
}

export function approachNotificationType(direction: RouteDirection): NotificationType {
  return direction === "PICKUP" ? "BUS_APPROACHING_PICKUP" : "BUS_APPROACHING_HOME_STOP";
}

export function deduplicationKey(parts: Array<string | null | undefined>) {
  return parts.filter((part) => part != null && part !== "").join(":");
}

export function unresolvedOnboard<T extends { boardingStatus: string; dropStatus: string }>(students: T[]) {
  return students.filter((student) => student.boardingStatus === "BOARDED" && student.dropStatus !== "DROPPED");
}

export function assistedBoardingAllowed(input: {
  lastDetectedAt?: Date | string | null;
  occurredAt: Date;
  rssi?: number | null;
  distanceToStopMeters?: number | null;
  stopRadiusMeters?: number | null;
}) {
  if (!input.lastDetectedAt) return false;
  const detectedAt = new Date(input.lastDetectedAt);
  if (Number.isNaN(detectedAt.getTime())) return false;
  const age = input.occurredAt.getTime() - detectedAt.getTime();
  const recent = age >= -60_000 && age <= 3 * 60 * 1000;
  const signalOk = input.rssi == null || input.rssi >= -85;
  const nearStop =
    input.distanceToStopMeters == null ||
    input.stopRadiusMeters == null ||
    input.distanceToStopMeters <= Math.max(input.stopRadiusMeters * 3, 80);
  return recent && signalOk && nearStop;
}
