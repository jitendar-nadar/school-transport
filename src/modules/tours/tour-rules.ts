export type TourScanDetection = {
  tagIdentifier: string;
  studentId?: string | null;
  rssi?: number | null;
  detectedAt?: string | Date | null;
};

export type TourRosterMember = {
  studentId: string;
  tourBusId: string;
  tagIdentifier?: string | null;
};

export function classifyTourScan(input: {
  roster: TourRosterMember[];
  detections: TourScanDetection[];
  busId: string;
}) {
  const busRoster = input.roster.filter((row) => row.tourBusId === input.busId);
  const rosterIds = new Set(busRoster.map((row) => row.studentId));
  const allByStudent = new Map(input.roster.map((row) => [row.studentId, row]));
  const presentIds = new Set<string>();
  const wrongBusIds = new Set<string>();
  const heardAt = new Map<string, { detectedAt: Date; rssi: number | null; tagIdentifier: string }>();

  for (const detection of input.detections) {
    const studentId = detection.studentId ? String(detection.studentId) : null;
    if (!studentId) continue;
    const when = detection.detectedAt ? new Date(detection.detectedAt) : new Date();
    const prev = heardAt.get(studentId);
    if (!prev || when.getTime() >= prev.detectedAt.getTime()) {
      heardAt.set(studentId, {
        detectedAt: when,
        rssi: detection.rssi ?? null,
        tagIdentifier: detection.tagIdentifier,
      });
    }
    if (rosterIds.has(studentId)) {
      presentIds.add(studentId);
    } else if (allByStudent.has(studentId)) {
      wrongBusIds.add(studentId);
    }
  }

  return {
    presentStudentIds: [...presentIds],
    missingStudentIds: busRoster.map((row) => row.studentId).filter((id) => !presentIds.has(id)),
    wrongBusStudentIds: [...wrongBusIds],
    heardAt,
    expectedCount: busRoster.length,
    presentCount: presentIds.size,
  };
}

export function watchTimedOut(input: {
  lastSeenAt: Date | string | null | undefined;
  now: Date;
  watchMinutes: number;
  inWatchWindow: boolean;
}) {
  if (!input.inWatchWindow || !input.lastSeenAt) return false;
  const seen = new Date(input.lastSeenAt);
  if (Number.isNaN(seen.getTime())) return false;
  return input.now.getTime() - seen.getTime() >= input.watchMinutes * 60 * 1000;
}

export const TOUR_STATUSES = ["PLANNED", "DEPARTED", "AT_DESTINATION", "RETURNING", "COMPLETED", "CANCELLED"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export function nextTourStatuses(status: TourStatus): TourStatus[] {
  switch (status) {
    case "PLANNED":
      return ["DEPARTED", "CANCELLED"];
    case "DEPARTED":
      return ["AT_DESTINATION", "CANCELLED"];
    case "AT_DESTINATION":
      return ["RETURNING", "CANCELLED"];
    case "RETURNING":
      return ["COMPLETED", "CANCELLED"];
    default:
      return [];
  }
}

export function parentUpdateType(status: TourStatus) {
  switch (status) {
    case "DEPARTED":
      return "TOUR_DEPARTED" as const;
    case "AT_DESTINATION":
      return "TOUR_REACHED_DESTINATION" as const;
    case "RETURNING":
      return "TOUR_RETURNING" as const;
    case "COMPLETED":
      return "TOUR_REACHED_SCHOOL" as const;
    default:
      return null;
  }
}

export function parentUpdateBody(status: TourStatus, tourName: string) {
  switch (status) {
    case "DEPARTED":
      return `The group has left for ${tourName}.`;
    case "AT_DESTINATION":
      return `The group has reached the destination for ${tourName}.`;
    case "RETURNING":
      return `The group is returning from ${tourName}.`;
    case "COMPLETED":
      return `The group has reached school after ${tourName}.`;
    default:
      return "";
  }
}
