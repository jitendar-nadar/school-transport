import { distanceMeters, type LatLng } from "@/utils/geo";

export const DEFAULT_APPROACH_ETA_MINUTES = 5;
export const DEFAULT_OVERSPEED_KMH = 60;
export const DEFAULT_LONG_STOP_MINUTES = 10;
export const DEFAULT_ROUTE_DEVIATION_METERS = 400;

/** ETA in minutes from distance and speed. Falls back to walking-pace 20 km/h when speed is low/unknown. */
export function etaMinutes(distanceMetersValue: number, speedKmh: number | null | undefined) {
  if (distanceMetersValue <= 0) return 0;
  const speed = speedKmh != null && speedKmh >= 5 ? speedKmh : 20;
  return Math.max(0, Math.ceil((distanceMetersValue / 1000 / speed) * 60));
}

export function shouldSendApproachAlert(input: {
  distanceMeters: number;
  speedKmh?: number | null;
  stopRadiusMeters: number;
  proximityRadiusMeters: number;
  etaThresholdMinutes?: number;
}) {
  const eta = etaMinutes(input.distanceMeters, input.speedKmh);
  const etaLimit = input.etaThresholdMinutes ?? DEFAULT_APPROACH_ETA_MINUTES;
  const radius = Math.max(input.stopRadiusMeters, input.proximityRadiusMeters);
  if (input.distanceMeters <= radius) {
    return { alert: true as const, etaMinutes: eta, reason: "GEOFENCE" as const };
  }
  if (eta <= etaLimit) return { alert: true as const, etaMinutes: eta, reason: "ETA" as const };
  return { alert: false as const, etaMinutes: eta, reason: "NONE" as const };
}

export function isOverspeed(speedKmh: number | null | undefined, limitKmh = DEFAULT_OVERSPEED_KMH) {
  return speedKmh != null && speedKmh > limitKmh;
}

export function isLongStop(input: {
  speedKmh: number | null | undefined;
  stoppedSince: Date | null | undefined;
  now: Date;
  longStopMinutes?: number;
}) {
  const limit = (input.longStopMinutes ?? DEFAULT_LONG_STOP_MINUTES) * 60 * 1000;
  if (input.speedKmh == null || input.speedKmh >= 5) return false;
  if (!input.stoppedSince) return false;
  return input.now.getTime() - input.stoppedSince.getTime() >= limit;
}

export function distanceToRouteMeters(point: LatLng, route: LatLng[]) {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return distanceMeters(point, route[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length - 1; i += 1) {
    best = Math.min(best, distanceToSegmentMeters(point, route[i], route[i + 1]));
  }
  return best;
}

function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng) {
  const ax = a.longitude;
  const ay = a.latitude;
  const bx = b.longitude;
  const by = b.latitude;
  const px = point.longitude;
  const py = point.latitude;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return distanceMeters(point, a);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return distanceMeters(point, { latitude: ay + t * dy, longitude: ax + t * dx });
}

export function isRouteDeviation(point: LatLng, route: LatLng[], maxMeters = DEFAULT_ROUTE_DEVIATION_METERS) {
  if (route.length < 2) return false;
  return distanceToRouteMeters(point, route) > maxMeters;
}
