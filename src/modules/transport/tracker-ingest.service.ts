import { z } from "zod";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { requireFleetId } from "@/lib/auth/guard";
import { latLngSchema } from "@/lib/validation/common";
import { FleetAlert, FleetGeofence, FleetTrip, Tracker, TrackerPoint, Truck } from "@/models/carrier";
import type { AuthUser } from "@/types/domain";
import { serialize } from "@/utils/serialize";
import {
  MAX_INGEST_POINTS,
  dayBounds,
  emptyMemory,
  motionStatus,
  nextAlerts,
  offlineDue,
  retentionDays,
  summarizeTrack,
  type Fence,
  type TrackerMemory,
  type TrackSample,
} from "@/modules/transport/tracking-rules";

const pointSchema = z.object({
  ...latLngSchema,
  speedKmh: z.coerce.number().min(0).max(200),
  ignition: z.boolean().nullable().optional().default(null),
  heading: z.coerce.number().min(0).max(360).optional(),
  unplugged: z.boolean().optional().default(false),
  recordedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Each point needs a valid time."),
});

export const ingestSchema = z.object({
  imei: z.string().trim().min(8).max(32),
  points: z.array(pointSchema).min(1).max(MAX_INGEST_POINTS),
});

export function assertTrackerKey(secret: string | null) {
  const expected = process.env.TRACKER_INGEST_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Tracker key is invalid.");
  }
}

function memoryFrom(tracker: { alertState?: Partial<TrackerMemory> & { insideGeofenceIds?: string[]; stopSince?: Date | null } }): TrackerMemory {
  const state = tracker.alertState || {};
  return {
    insideIds: state.insideGeofenceIds || state.insideIds || [],
    stopSince: state.stopSince ? new Date(state.stopSince).getTime() : null,
    longStopAlerted: Boolean(state.longStopAlerted),
    overspeedAlerted: Boolean(state.overspeedAlerted),
    deviationAlerted: Boolean(state.deviationAlerted),
    unpluggedAlerted: Boolean(state.unpluggedAlerted),
    offlineAlerted: Boolean(state.offlineAlerted),
  };
}

function memoryToDoc(memory: TrackerMemory) {
  return {
    insideGeofenceIds: memory.insideIds,
    stopSince: memory.stopSince ? new Date(memory.stopSince) : null,
    longStopAlerted: memory.longStopAlerted,
    overspeedAlerted: memory.overspeedAlerted,
    deviationAlerted: memory.deviationAlerted,
    unpluggedAlerted: memory.unpluggedAlerted,
    offlineAlerted: memory.offlineAlerted,
  };
}

async function fencesFor(fleetId: unknown): Promise<Fence[]> {
  const rows = await FleetGeofence.find({ fleetId, latitude: { $ne: null }, longitude: { $ne: null } }).lean();
  return rows.flatMap((row) => {
    if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return [];
    return [{
      id: String(row._id),
      name: String(row.name),
      kind: row.kind as Fence["kind"],
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: Number(row.radiusMeters || 150),
    }];
  });
}

export async function ingestTrackerPoints(input: z.infer<typeof ingestSchema>) {
  const tracker = await Tracker.findOne({ imei: input.imei, status: { $ne: "RETIRED" } });
  if (!tracker) throw notFound("Tracker");
  const now = Date.now();
  const cutoff = now - retentionDays() * 24 * 60 * 60 * 1000;
  const ordered = [...input.points].sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  const knownUntil = tracker.lastRecordedAt ? new Date(tracker.lastRecordedAt).getTime() : 0;
  let memory = memoryFrom(tracker);
  let accepted = 0;
  let skipped = 0;
  const fences = await fencesFor(tracker.fleetId);
  const activeTrip = await FleetTrip.findOne({ fleetId: tracker.fleetId, truckId: tracker.truckId, status: "ACTIVE" }).lean();
  const route = (activeTrip?.route || []).flatMap((point: { latitude?: number; longitude?: number }) => (
    typeof point.latitude === "number" && typeof point.longitude === "number" ? [{ latitude: point.latitude, longitude: point.longitude }] : []
  ));

  for (const point of ordered) {
    const recordedAt = Date.parse(point.recordedAt);
    if (recordedAt > now + 2 * 60 * 1000 || recordedAt < cutoff) {
      skipped += 1;
      continue;
    }
    try {
      await TrackerPoint.create({
        fleetId: tracker.fleetId,
        truckId: tracker.truckId,
        trackerId: tracker._id,
        latitude: point.latitude,
        longitude: point.longitude,
        speedKmh: point.speedKmh,
        ignition: point.ignition,
        heading: point.heading ?? null,
        unplugged: point.unplugged,
        recordedAt: new Date(recordedAt),
        receivedAt: new Date(now),
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        skipped += 1;
        continue;
      }
      throw error;
    }
    accepted += 1;
    if (recordedAt < knownUntil) continue;
    const sample: TrackSample = {
      latitude: point.latitude,
      longitude: point.longitude,
      speedKmh: point.speedKmh,
      ignition: point.ignition,
      unplugged: point.unplugged,
      recordedAt,
    };
    const evaluated = nextAlerts({ point: sample, memory, fences, route });
    memory = evaluated.memory;
    if (evaluated.alerts.length) {
      await FleetAlert.insertMany(evaluated.alerts.map((alert) => ({
        fleetId: tracker.fleetId,
        truckId: tracker.truckId,
        tripId: activeTrip?._id || null,
        geofenceId: alert.geofenceId || null,
        type: alert.type,
        message: alert.message,
        recordedAt: new Date(recordedAt),
      })));
    }
    tracker.lastLatitude = point.latitude;
    tracker.lastLongitude = point.longitude;
    tracker.lastSpeedKmh = point.speedKmh;
    tracker.lastIgnition = point.ignition;
    tracker.lastUnplugged = point.unplugged;
    tracker.lastHeading = point.heading ?? null;
    tracker.lastRecordedAt = new Date(recordedAt);
    tracker.lastReceivedAt = new Date(now);
    tracker.status = "ACTIVE";
  }

  if (accepted > 0) {
    tracker.lastReceivedAt = new Date(now);
    tracker.status = "ACTIVE";
    memory = { ...memory, offlineAlerted: false };
  }
  tracker.alertState = memoryToDoc(memory);
  await tracker.save();
  await TrackerPoint.deleteMany({ trackerId: tracker._id, recordedAt: { $lt: new Date(cutoff) } });
  return { accepted, skipped, truckId: String(tracker.truckId) };
}

export async function noteOfflineTrackers(fleetId?: string) {
  const now = Date.now();
  const filter: Record<string, unknown> = { status: { $ne: "RETIRED" }, lastReceivedAt: { $ne: null } };
  if (fleetId) filter.fleetId = fleetId;
  const trackers = await Tracker.find(filter);
  let raised = 0;
  for (const tracker of trackers) {
    const received = tracker.lastReceivedAt ? new Date(tracker.lastReceivedAt).getTime() : null;
    const memory = memoryFrom(tracker);
    if (!offlineDue(received, now, memory.offlineAlerted)) continue;
    await FleetAlert.create({
      fleetId: tracker.fleetId,
      truckId: tracker.truckId,
      type: "OFFLINE",
      message: "Tracker has not reported for 3 minutes.",
      recordedAt: new Date(now),
    });
    tracker.status = "OFFLINE";
    tracker.alertState = memoryToDoc({ ...memory, offlineAlerted: true });
    await tracker.save();
    raised += 1;
  }
  return raised;
}

export async function purgeExpiredPoints() {
  const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1000);
  const result = await TrackerPoint.deleteMany({ recordedAt: { $lt: cutoff } });
  return result.deletedCount || 0;
}

export async function scanFleetDevices() {
  const offline = await noteOfflineTrackers();
  const purged = await purgeExpiredPoints();
  return { offline, purged };
}

function liveRow(truck: { _id: unknown; registrationNumber: string }, tracker?: {
  imei?: string;
  certification?: string;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastSpeedKmh?: number | null;
  lastIgnition?: boolean | null;
  lastRecordedAt?: Date | null;
  lastReceivedAt?: Date | null;
}) {
  const received = tracker?.lastReceivedAt ? new Date(tracker.lastReceivedAt).getTime() : null;
  const hasFix = typeof tracker?.lastLatitude === "number" && typeof tracker?.lastLongitude === "number";
  const status = hasFix
    ? motionStatus({
      speedKmh: Number(tracker?.lastSpeedKmh || 0),
      ignition: tracker?.lastIgnition ?? null,
      ageMs: received == null ? Number.POSITIVE_INFINITY : Date.now() - received,
    })
    : "OFFLINE";
  return {
    id: String(truck._id),
    registrationNumber: truck.registrationNumber,
    imei: tracker?.imei || "",
    certification: tracker?.certification || "STANDARD",
    status,
    latitude: hasFix ? tracker?.lastLatitude : null,
    longitude: hasFix ? tracker?.lastLongitude : null,
    speedKmh: tracker?.lastSpeedKmh ?? null,
    ignition: tracker?.lastIgnition ?? null,
    recordedAt: tracker?.lastRecordedAt ? new Date(tracker.lastRecordedAt).toISOString() : null,
    receivedAt: tracker?.lastReceivedAt ? new Date(tracker.lastReceivedAt).toISOString() : null,
  };
}

export async function listLiveTrucks(user: AuthUser, fleetId?: string) {
  const tenant = requireFleetId(user, fleetId);
  await noteOfflineTrackers(tenant);
  const trucks = await Truck.find({ fleetId: tenant }).sort({ registrationNumber: 1 }).lean();
  const trackers = await Tracker.find({ fleetId: tenant, truckId: { $in: trucks.map((truck) => truck._id) } }).lean();
  const byTruck = new Map(trackers.map((tracker) => [String(tracker.truckId), tracker]));
  return trucks.map((truck) => liveRow(truck, byTruck.get(String(truck._id))));
}

export async function listFleetAlerts(user: AuthUser, query: { page: number; limit: number; fleetId?: string }) {
  const tenant = requireFleetId(user, query.fleetId);
  const filter = { fleetId: tenant };
  const total = await FleetAlert.countDocuments(filter);
  const rows = await FleetAlert.find(filter)
    .sort({ recordedAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .populate({ path: "truckId", select: "registrationNumber" })
    .lean();
  return {
    items: rows.map((row) => serialize(row)),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

function samplesFrom(rows: Array<{ latitude: number; longitude: number; speedKmh?: number; ignition?: boolean | null; recordedAt: Date }>): TrackSample[] {
  return rows.map((row) => ({
    latitude: row.latitude,
    longitude: row.longitude,
    speedKmh: Number(row.speedKmh || 0),
    ignition: row.ignition ?? null,
    recordedAt: new Date(row.recordedAt).getTime(),
  }));
}

export async function dailyFleetReport(user: AuthUser, fleetId: string | undefined, date: string) {
  const tenant = requireFleetId(user, fleetId);
  const bounds = dayBounds(date);
  if (!bounds) throw new AppError(400, "VALIDATION_ERROR", "Choose a valid date.");
  const trucks = await Truck.find({ fleetId: tenant }).sort({ registrationNumber: 1 }).lean();
  const points = await TrackerPoint.find({
    fleetId: tenant,
    recordedAt: { $gte: bounds.start, $lt: bounds.end },
  }).sort({ recordedAt: 1 }).lean();
  const byTruck = new Map<string, TrackSample[]>();
  for (const point of points) {
    const key = String(point.truckId);
    const list = byTruck.get(key) || [];
    list.push(...samplesFrom([point]));
    byTruck.set(key, list);
  }
  return trucks.map((truck) => {
    const summary = summarizeTrack(byTruck.get(String(truck._id)) || []);
    return {
      truckId: String(truck._id),
      registrationNumber: truck.registrationNumber,
      distanceKm: Math.round((summary.distanceMeters / 1000) * 10) / 10,
      idleMinutes: summary.idleMinutes,
      stoppages: summary.stoppages.map((stop) => ({
        startedAt: new Date(stop.startedAt).toISOString(),
        endedAt: new Date(stop.endedAt).toISOString(),
        latitude: stop.latitude,
        longitude: stop.longitude,
      })),
    };
  });
}

export async function playback(user: AuthUser, fleetId: string | undefined, truckId: string, date: string) {
  const tenant = requireFleetId(user, fleetId);
  const truck = await Truck.findOne({ _id: truckId, fleetId: tenant }).lean();
  if (!truck) throw notFound("Truck");
  const bounds = dayBounds(date);
  if (!bounds) throw new AppError(400, "VALIDATION_ERROR", "Choose a valid date.");
  const points = await TrackerPoint.find({
    fleetId: tenant,
    truckId: truck._id,
    recordedAt: { $gte: bounds.start, $lt: bounds.end },
  }).sort({ recordedAt: 1 }).lean();
  const samples = samplesFrom(points);
  const summary = summarizeTrack(samples);
  return {
    truckId: String(truck._id),
    registrationNumber: truck.registrationNumber,
    distanceKm: Math.round((summary.distanceMeters / 1000) * 10) / 10,
    idleMinutes: summary.idleMinutes,
    stoppages: summary.stoppages.length,
    points: points.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speedKmh: point.speedKmh,
      ignition: point.ignition,
      recordedAt: new Date(point.recordedAt).toISOString(),
    })),
  };
}
