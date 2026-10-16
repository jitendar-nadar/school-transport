import { requireSchoolId } from "@/lib/auth/guard";
import { Vehicle } from "@/models/fleet";
import { Trip, TripEvent, TripStudent } from "@/models/trip";
import type { AuthUser } from "@/types/domain";
import { notFound } from "@/lib/errors/app-error";
import { serialize } from "@/utils/serialize";

async function scopedSchool(user: AuthUser, schoolId?: string) {
  return requireSchoolId(user, schoolId);
}

async function liveLocationFor(tripId: string) {
  try {
    const { readActiveTrip } = await import("@/lib/firebase/admin");
    return await readActiveTrip(tripId);
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function activeTrips(user: AuthUser, schoolId?: string) {
  const tenant = await scopedSchool(user, schoolId);
  const trips = await Trip.find({ schoolId: tenant, status: "ACTIVE" })
    .populate("vehicleId", "vehicleNumber vehicleType")
    .populate("routeId", "name routeCode direction")
    .populate("driverId", "name phone")
    .lean();
  return Promise.all(
    trips.map(async (trip) => ({
      ...(serialize(trip) as object),
      liveLocation: await liveLocationFor(String(trip._id)),
    })),
  );
}

export async function dashboardTrip(user: AuthUser, tripId: string, schoolId?: string) {
  const tenant = await scopedSchool(user, schoolId);
  const trip = await Trip.findOne({ _id: tripId, schoolId: tenant })
    .populate("vehicleId", "vehicleNumber vehicleType capacity")
    .populate("routeId", "name routeCode direction stops")
    .populate("driverId", "name phone")
    .populate("attendantId", "name phone")
    .lean();
  if (!trip) throw notFound("Trip");
  return {
    ...(serialize(trip) as object),
    liveLocation: trip.status === "ACTIVE" ? await liveLocationFor(String(trip._id)) : null,
  };
}

export async function dashboardStudents(user: AuthUser, tripId: string, schoolId?: string) {
  const tenant = await scopedSchool(user, schoolId);
  const trip = await Trip.findOne({ _id: tripId, schoolId: tenant }).select("_id").lean();
  if (!trip) throw notFound("Trip");
  const rows = await TripStudent.find({ tripId })
    .populate("studentId", "name studentCode className division photoUrl")
    .populate("assignedStopId", "name")
    .lean();
  return rows.map((row) => serialize(row));
}

export async function dashboardEvents(user: AuthUser, tripId: string, schoolId?: string) {
  const tenant = await scopedSchool(user, schoolId);
  const trip = await Trip.findOne({ _id: tripId, schoolId: tenant }).select("_id").lean();
  if (!trip) throw notFound("Trip");
  const events = await TripEvent.find({ tripId }).sort({ occurredAt: 1 }).lean();
  return events.map((event) => serialize(event));
}

export async function dashboardVehicles(user: AuthUser, schoolId?: string) {
  const tenant = await scopedSchool(user, schoolId);
  const vehicles = await Vehicle.find({ schoolId: tenant })
    .populate("driverIds", "name")
    .populate("attendantIds", "name")
    .lean();
  const active = await Trip.find({ schoolId: tenant, status: "ACTIVE" }).select("vehicleId totalBoarded totalAssignedStudents").lean();
  const byVehicle = new Map(active.map((trip: { vehicleId: unknown }) => [String(trip.vehicleId), trip]));
  return vehicles.map((vehicle) => ({
    ...(serialize(vehicle) as object),
    activeTrip: byVehicle.get(String(vehicle._id)) ? serialize(byVehicle.get(String(vehicle._id))) : null,
  }));
}
