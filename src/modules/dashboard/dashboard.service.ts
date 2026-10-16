import { requireSchoolId } from "@/lib/auth/guard";
import { readActiveTrip } from "@/lib/firebase/admin";
import { Vehicle } from "@/models/fleet";
import { Student } from "@/models/student";
import { Trip, TripEvent, TripStudent } from "@/models/trip";
import { Notification } from "@/models/ops";
import type { AuthUser } from "@/types/domain";
import { notFound } from "@/lib/errors/app-error";
import { serialize } from "@/utils/serialize";

async function scopedSchool(user: AuthUser, schoolId?: string) {
  return requireSchoolId(user, schoolId);
}

export async function overview(user: AuthUser, schoolId?: string) {
  const tenant = await scopedSchool(user, schoolId);
  const [students, vehicles, activeTrips, boarded, safetyAlerts] = await Promise.all([
    Student.countDocuments({ schoolId: tenant, status: "ACTIVE" }),
    Vehicle.countDocuments({ schoolId: tenant, status: "ACTIVE" }),
    Trip.countDocuments({ schoolId: tenant, status: "ACTIVE" }),
    TripStudent.countDocuments({ schoolId: tenant, boardingStatus: "BOARDED", dropStatus: "NOT_DROPPED" }),
    Notification.countDocuments({
      schoolId: tenant,
      type: { $in: ["CHILD_STILL_ON_BUS", "STUDENT_WRONG_BUS", "BUS_TRACKING_OFFLINE"] },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);
  return { students, vehicles, activeTrips, onboardNow: boarded, safetyAlerts };
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
      liveLocation: await readActiveTrip(String(trip._id)),
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
    liveLocation: trip.status === "ACTIVE" ? await readActiveTrip(String(trip._id)) : null,
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
