import { distanceMeters, type LatLng } from "@/utils/geo";

export const OFFLINE_AFTER_MS = 3 * 60 * 1000;
export const MOVING_SPEED_KMH = 5;
export const OVERSPEED_KMH = 80;
export const LONG_STOP_MS = 15 * 60 * 1000;
export const STOPPAGE_MIN_MS = 2 * 60 * 1000;
export const DEVIATION_METERS = 500;
export const DEVIATION_CLEAR_METERS = 300;
export const MAX_POINT_GAP_MS = 30 * 60 * 1000;
export const DEFAULT_RETENTION_DAYS = 90;
export const MAX_INGEST_POINTS = 2000;

export type Motion = "MOVING" | "IDLE" | "STOPPED" | "OFFLINE";

export type AlertKind =
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT"
  | "LONG_STOP"
  | "OVERSPEED"
  | "ROUTE_DEVIATION"
  | "UNPLUGGED"
  | "OFFLINE";

export type Fence = {
  id: string;
  name: string;
  kind: "DEPOT" | "CUSTOMER";
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type TrackSample = LatLng & {
  speedKmh: number;
  ignition: boolean | null;
  unplugged?: boolean;
  recordedAt: number;
};

export type TrackerMemory = {
  insideIds: string[];
  stopSince: number | null;
  longStopAlerted: boolean;
  overspeedAlerted: boolean;
  deviationAlerted: boolean;
  unpluggedAlerted: boolean;
  offlineAlerted: boolean;
};

export type RaisedAlert = {
  type: AlertKind;
  geofenceId?: string;
  message: string;
};

export function emptyMemory(): TrackerMemory {
  return {
    insideIds: [],
    stopSince: null,
    longStopAlerted: false,
    overspeedAlerted: false,
    deviationAlerted: false,
    unpluggedAlerted: false,
    offlineAlerted: false,
  };
}

export function retentionDays() {
  const parsed = Number(process.env.FLEET_POINT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.floor(parsed), 3650);
}

export function motionStatus(input: { speedKmh: number; ignition: boolean | null; ageMs?: number }): Motion {
  if ((input.ageMs ?? 0) >= OFFLINE_AFTER_MS) return "OFFLINE";
  if (input.speedKmh >= MOVING_SPEED_KMH) return "MOVING";
  if (input.ignition === true) return "IDLE";
  return "STOPPED";
}

export function offlineDue(lastReceivedAt: number | null, now: number, alreadyAlerted: boolean) {
  if (alreadyAlerted || lastReceivedAt == null) return false;
  return now - lastReceivedAt >= OFFLINE_AFTER_MS;
}

export function insideFence(point: LatLng, fence: Fence) {
  return distanceMeters(point, fence) <= fence.radiusMeters;
}

export function distanceToSegmentMeters(point: LatLng, start: LatLng, end: LatLng) {
  const meanLat = ((start.latitude + end.latitude) / 2) * (Math.PI / 180);
  const kx = 111_320 * Math.cos(meanLat);
  const ky = 110_540;
  const bx = (end.longitude - start.longitude) * kx;
  const by = (end.latitude - start.latitude) * ky;
  const px = (point.longitude - start.longitude) * kx;
  const py = (point.latitude - start.latitude) * ky;
  const length = bx * bx + by * by;
  if (length === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / length));
  return Math.hypot(px - bx * t, py - by * t);
}

export function distanceToRouteMeters(point: LatLng, route: LatLng[]) {
  if (route.length === 0) return 0;
  if (route.length === 1) return distanceMeters(point, route[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    best = Math.min(best, distanceToSegmentMeters(point, route[index - 1], route[index]));
  }
  return best;
}

export function nextAlerts(input: {
  point: TrackSample;
  memory: TrackerMemory;
  fences: Fence[];
  route: LatLng[];
}): { alerts: RaisedAlert[]; memory: TrackerMemory } {
  const memory: TrackerMemory = { ...input.memory, insideIds: [...input.memory.insideIds] };
  const alerts: RaisedAlert[] = [];
  const insideNow = input.fences.filter((fence) => insideFence(input.point, fence));
  const insideIds = new Set(insideNow.map((fence) => fence.id));
  const wasInside = new Set(memory.insideIds);

  for (const fence of input.fences) {
    const nowIn = insideIds.has(fence.id);
    const wasIn = wasInside.has(fence.id);
    if (nowIn && !wasIn) {
      alerts.push({ type: "GEOFENCE_ENTER", geofenceId: fence.id, message: `Entered ${fence.name}.` });
    }
    if (!nowIn && wasIn) {
      alerts.push({ type: "GEOFENCE_EXIT", geofenceId: fence.id, message: `Left ${fence.name}.` });
    }
  }
  memory.insideIds = [...insideIds];

  const motion = motionStatus(input.point);
  const inDepot = insideNow.some((fence) => fence.kind === "DEPOT");
  if (motion === "STOPPED" && !inDepot) {
    if (memory.stopSince == null) memory.stopSince = input.point.recordedAt;
    if (!memory.longStopAlerted && input.point.recordedAt - memory.stopSince >= LONG_STOP_MS) {
      memory.longStopAlerted = true;
      alerts.push({ type: "LONG_STOP", message: "Truck has been stopped for 15 minutes outside a depot." });
    }
  } else {
    memory.stopSince = null;
    memory.longStopAlerted = false;
  }

  if (input.point.speedKmh > OVERSPEED_KMH) {
    if (!memory.overspeedAlerted) {
      memory.overspeedAlerted = true;
      alerts.push({ type: "OVERSPEED", message: `Speed is ${Math.round(input.point.speedKmh)} km/h.` });
    }
  } else {
    memory.overspeedAlerted = false;
  }

  if (input.point.unplugged) {
    if (!memory.unpluggedAlerted) {
      memory.unpluggedAlerted = true;
      alerts.push({ type: "UNPLUGGED", message: "Tracker power was disconnected." });
    }
  } else {
    memory.unpluggedAlerted = false;
  }

  if (input.route.length >= 2) {
    const offRoute = distanceToRouteMeters(input.point, input.route);
    if (offRoute > DEVIATION_METERS && !memory.deviationAlerted) {
      memory.deviationAlerted = true;
      alerts.push({ type: "ROUTE_DEVIATION", message: "Truck is off the planned route." });
    } else if (offRoute < DEVIATION_CLEAR_METERS) {
      memory.deviationAlerted = false;
    }
  }

  return { alerts, memory };
}

export function summarizeTrack(samples: TrackSample[]) {
  const ordered = [...samples].sort((left, right) => left.recordedAt - right.recordedAt);
  let distance = 0;
  let idleMs = 0;
  const stoppages: Array<{ startedAt: number; endedAt: number; latitude: number; longitude: number }> = [];
  let stopStart: TrackSample | null = null;

  function closeStop(end: TrackSample) {
    if (!stopStart) return;
    if (end.recordedAt - stopStart.recordedAt >= STOPPAGE_MIN_MS) {
      stoppages.push({
        startedAt: stopStart.recordedAt,
        endedAt: end.recordedAt,
        latitude: stopStart.latitude,
        longitude: stopStart.longitude,
      });
    }
    stopStart = null;
  }

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const gap = current.recordedAt - previous.recordedAt;
    if (gap <= 0 || gap > MAX_POINT_GAP_MS) {
      closeStop(previous);
      continue;
    }
    distance += distanceMeters(previous, current);
    const motion = motionStatus(previous);
    if (motion === "IDLE") idleMs += gap;
    if (motion === "STOPPED") {
      if (!stopStart) stopStart = previous;
    } else {
      closeStop(previous);
    }
  }
  if (stopStart && ordered.length > 0) closeStop(ordered[ordered.length - 1]);

  return {
    distanceMeters: Math.round(distance),
    idleMinutes: Math.round(idleMs / 60_000),
    stoppages,
  };
}

export function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
