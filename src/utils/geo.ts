export type LatLng = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_M = 6_371_000;

export function toPoint(latitude: number, longitude: number) {
  return {
    type: "Point" as const,
    coordinates: [longitude, latitude] as [number, number],
  };
}

export function fromPoint(point?: { coordinates?: number[] } | null): LatLng | null {
  if (!point?.coordinates || point.coordinates.length < 2) return null;
  const [longitude, latitude] = point.coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  return { latitude, longitude };
}

export function distanceMeters(from: LatLng, to: LatLng) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function speedKmh(distanceM: number, elapsedSeconds: number) {
  if (elapsedSeconds <= 0) return Number.POSITIVE_INFINITY;
  return (distanceM / elapsedSeconds) * 3.6;
}

export function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
