import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { Vehicle } from "@/models/fleet";
import { Trip } from "@/models/trip";
import { User } from "@/models/user";
import { applyLocation } from "@/modules/tracking/location.service";
import { ROLES } from "@/types/domain";

export const schoolBusIngestSchema = z.object({
  imei: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .transform((value) => value.replace(/\s+/g, "").toUpperCase()),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
  accuracyMeters: z.coerce.number().min(0).max(500).optional().default(25),
  heading: z.coerce.number().min(0).max(360).optional(),
  speedKmh: z.coerce.number().min(0).max(180).optional(),
  recordedAt: z.string().optional(),
  ignition: z.boolean().optional(),
});

export function assertSchoolBusKey(secret: string | null) {
  const expected = process.env.SCHOOL_BUS_INGEST_SECRET || process.env.TRACKER_INGEST_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "School bus tracker key is invalid.");
  }
}

export async function ingestSchoolBusPoint(input: z.infer<typeof schoolBusIngestSchema>) {
  const vehicle = await Vehicle.findOne({ imei: input.imei, status: "ACTIVE" });
  if (!vehicle) throw new AppError(404, "VEHICLE_UNKNOWN", "No active school vehicle uses that IMEI.");

  const trip = await Trip.findOne({ vehicleId: vehicle._id, status: "ACTIVE" });
  if (!trip) {
    return { received: true, applied: false, reason: "NO_ACTIVE_TRIP", vehicleId: String(vehicle._id) };
  }

  const actor =
    (trip.driverId && (await User.findById(trip.driverId))) ||
    (trip.attendantId && (await User.findById(trip.attendantId))) ||
    (await User.findOne({ schoolId: trip.schoolId, role: ROLES.SCHOOL_ADMIN, status: "ACTIVE" }));
  if (!actor) throw new AppError(409, "NO_CREW", "This trip has no driver, attendant, or school admin to attribute GPS to.");

  const user = {
    id: String(actor._id),
    schoolId: String(trip.schoolId),
    companyId: null,
    fleetId: null,
    agencyId: null,
    employeeId: null,
    name: actor.name || "Bus tracker",
    email: actor.email || "",
    phone: actor.phone || "",
    role: (actor.role as typeof ROLES.DRIVER) || ROLES.DRIVER,
    status: "ACTIVE" as const,
  };

  const result = await applyLocation(user, trip, {
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    heading: input.heading,
    speedKmh: input.speedKmh,
    recordedAt: input.recordedAt || new Date().toISOString(),
    allowHistorical: true,
  });
  if (result.followUp) await result.followUp();
  return {
    received: true,
    applied: !result.throttled,
    throttled: result.throttled,
    tripId: String(trip._id),
    vehicleId: String(vehicle._id),
  };
}
