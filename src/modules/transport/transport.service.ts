import { z } from "zod";
import { hashPassword } from "@/lib/auth/tokens";
import { requireFleetId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { passwordSchema } from "@/lib/validation/common";
import { FleetAccount, FleetGeofence, FleetTrip, Tracker, Truck } from "@/models/carrier";
import { User } from "@/models/user";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { escapeRegex, searchClause, serialize } from "@/utils/serialize";

const statusSchema = z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]);

export const createFleetSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  fleetCode: z.string().trim().min(2, "Fleet code must be at least 2 characters.").max(20),
  address: z.string().trim().max(300).optional().default(""),
  contactEmail: z.email("Enter a valid email address."),
  contactPhone: z.string().trim().min(8, "Phone must be at least 8 digits.").max(20),
  adminName: z.string().trim().min(2, "Admin name must be at least 2 characters."),
  adminEmail: z.email("Enter a valid email address."),
  adminPassword: passwordSchema,
});

export const createTruckSchema = z.object({
  fleetId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a fleet."),
  registrationNumber: z.string().trim().min(2, "Enter the vehicle number.").max(20),
  imei: z.string().trim().min(8, "Enter the tracker IMEI.").max(32),
});

export const createFleetTripSchema = z.object({
  fleetId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a fleet."),
  truckId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a truck."),
  origin: z.string().trim().min(2, "Enter the origin."),
  destination: z.string().trim().min(2, "Enter the destination."),
});

export const createGeofenceSchema = z.object({
  fleetId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a fleet."),
  name: z.string().trim().min(2, "Enter a place name."),
  kind: z.enum(["DEPOT", "CUSTOMER"]),
  address: z.string().trim().max(300).optional().default(""),
});

export async function listFleets(user: AuthUser, query: { page: number; limit: number; search?: string }) {
  if (user.role === ROLES.FLEET_ADMIN) {
    const fleet = await FleetAccount.findById(requireFleetId(user)).lean();
    return { items: fleet ? [serialize(fleet)] : [], meta: { page: 1, limit: 1, total: fleet ? 1 : 0, totalPages: 1 } };
  }
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "You cannot list fleets.");
  const result = await paginate(FleetAccount, searchClause(["name", "fleetCode", "contactEmail"], query.search), {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createFleet(user: AuthUser, input: z.infer<typeof createFleetSchema>) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can create a fleet.");
  const fleet = await FleetAccount.create({
    name: input.name,
    fleetCode: input.fleetCode.toUpperCase(),
    address: input.address,
    contactEmail: input.contactEmail.toLowerCase(),
    contactPhone: input.contactPhone,
  });
  try {
    await User.create({
      fleetId: fleet._id,
      name: input.adminName,
      email: input.adminEmail.toLowerCase(),
      phone: input.contactPhone,
      passwordHash: await hashPassword(input.adminPassword),
      role: ROLES.FLEET_ADMIN,
    });
  } catch (error) {
    await FleetAccount.deleteOne({ _id: fleet._id });
    throw error;
  }
  await writeAudit({
    actorId: user.id,
    action: "FLEET_CREATED",
    entityType: "FleetAccount",
    entityId: String(fleet._id),
    after: { name: fleet.name },
  });
  return serialize(fleet.toObject());
}

export async function updateFleetStatus(user: AuthUser, id: string, status: string) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can change fleet status.");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose a valid status.");
  const fleet = await FleetAccount.findById(id);
  if (!fleet) throw notFound("Fleet");
  fleet.status = parsed.data;
  await fleet.save();
  return serialize(fleet.toObject());
}

export async function listTrucks(user: AuthUser, query: { page: number; limit: number; search?: string; fleetId?: string }) {
  const tenant = requireFleetId(user, query.fleetId);
  const filter: Record<string, unknown> = { fleetId: tenant };
  if (query.search) {
    const pattern = escapeRegex(query.search);
    const trackers = await Tracker.find({ fleetId: tenant, imei: { $regex: pattern, $options: "i" } }).select("truckId");
    filter.$or = [
      { registrationNumber: { $regex: pattern, $options: "i" } },
      { status: { $regex: pattern, $options: "i" } },
      { _id: { $in: trackers.map((tracker) => tracker.truckId) } },
    ];
  }
  const result = await paginate(Truck, filter, {
    page: query.page,
    limit: query.limit,
    sort: { registrationNumber: 1 },
  });
  const trackers = await Tracker.find({ fleetId: tenant, truckId: { $in: result.items.map((truck) => truck._id) } }).lean();
  const byTruck = new Map(trackers.map((tracker) => [String(tracker.truckId), tracker]));
  return {
    items: result.items.map((truck) => ({
      ...(serialize(truck) as object),
      imei: byTruck.get(String(truck._id))?.imei || "",
    })),
    meta: result.meta,
  };
}

export async function createTruck(user: AuthUser, input: z.infer<typeof createTruckSchema>) {
  const tenant = requireFleetId(user, input.fleetId);
  const truck = await Truck.create({ fleetId: tenant, registrationNumber: input.registrationNumber.toUpperCase() });
  try {
    await Tracker.create({ fleetId: tenant, truckId: truck._id, imei: input.imei });
  } catch (error) {
    await Truck.deleteOne({ _id: truck._id });
    throw error;
  }
  return { ...(serialize(truck.toObject()) as object), imei: input.imei };
}

export async function updateTruck(user: AuthUser, id: string, input: z.infer<typeof createTruckSchema>) {
  const tenant = requireFleetId(user, input.fleetId);
  const truck = await Truck.findOne({ _id: id, fleetId: tenant });
  if (!truck) throw notFound("Truck");
  truck.registrationNumber = input.registrationNumber.toUpperCase();
  await truck.save();
  const tracker = await Tracker.findOne({ truckId: truck._id, fleetId: tenant });
  if (tracker) {
    tracker.imei = input.imei;
    await tracker.save();
  } else {
    await Tracker.create({ fleetId: tenant, truckId: truck._id, imei: input.imei });
  }
  return { ...(serialize(truck.toObject()) as object), imei: input.imei };
}

export async function deleteTruck(user: AuthUser, id: string, fleetId?: string) {
  const tenant = requireFleetId(user, fleetId);
  const truck = await Truck.findOne({ _id: id, fleetId: tenant });
  if (!truck) throw notFound("Truck");
  const active = await FleetTrip.findOne({ truckId: truck._id, status: "ACTIVE" }).select("_id");
  if (active) throw new AppError(409, "IN_USE", "This truck has an active trip. Finish that trip before deleting the truck.");
  await Tracker.deleteMany({ fleetId: tenant, truckId: truck._id });
  await FleetTrip.deleteMany({ fleetId: tenant, truckId: truck._id });
  await truck.deleteOne();
  return { deleted: true };
}

export async function listFleetTrips(user: AuthUser, query: { page: number; limit: number; search?: string; fleetId?: string }) {
  const tenant = requireFleetId(user, query.fleetId);
  const filter: Record<string, unknown> = { fleetId: tenant };
  if (query.search) {
    const pattern = escapeRegex(query.search);
    const trucks = await Truck.find({ fleetId: tenant, registrationNumber: { $regex: pattern, $options: "i" } }).select("_id");
    filter.$or = [
      { origin: { $regex: pattern, $options: "i" } },
      { destination: { $regex: pattern, $options: "i" } },
      { status: { $regex: pattern, $options: "i" } },
      { truckId: { $in: trucks.map((truck) => truck._id) } },
    ];
  }
  const result = await paginate(FleetTrip, filter, {
    page: query.page,
    limit: query.limit,
    sort: { createdAt: -1 },
    populate: [{ path: "truckId", select: "registrationNumber" }],
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createFleetTrip(user: AuthUser, input: z.infer<typeof createFleetTripSchema>) {
  const tenant = requireFleetId(user, input.fleetId);
  const truck = await Truck.findOne({ _id: input.truckId, fleetId: tenant }).lean();
  if (!truck) throw new AppError(400, "TRUCK_REQUIRED", "Choose a truck in this fleet.");
  const trip = await FleetTrip.create({
    fleetId: tenant,
    truckId: truck._id,
    origin: input.origin,
    destination: input.destination,
  });
  return serialize(trip.toObject());
}

export async function updateFleetTrip(user: AuthUser, id: string, input: z.infer<typeof createFleetTripSchema>) {
  const tenant = requireFleetId(user, input.fleetId);
  const trip = await FleetTrip.findOne({ _id: id, fleetId: tenant });
  if (!trip) throw notFound("Trip");
  if (trip.status === "ACTIVE") throw new AppError(409, "IN_USE", "This trip is active. Finish it before editing.");
  const truck = await Truck.findOne({ _id: input.truckId, fleetId: tenant }).lean();
  if (!truck) throw new AppError(400, "TRUCK_REQUIRED", "Choose a truck in this fleet.");
  trip.truckId = truck._id;
  trip.origin = input.origin;
  trip.destination = input.destination;
  await trip.save();
  return serialize(trip.toObject());
}

export async function deleteFleetTrip(user: AuthUser, id: string, fleetId?: string) {
  const tenant = requireFleetId(user, fleetId);
  const trip = await FleetTrip.findOne({ _id: id, fleetId: tenant });
  if (!trip) throw notFound("Trip");
  if (trip.status === "ACTIVE") throw new AppError(409, "IN_USE", "This trip is active. Finish it before deleting.");
  await trip.deleteOne();
  return { deleted: true };
}

export async function listGeofences(user: AuthUser, query: { page: number; limit: number; search?: string; fleetId?: string }) {
  const tenant = requireFleetId(user, query.fleetId);
  const result = await paginate(FleetGeofence, { fleetId: tenant, ...searchClause(["name", "kind", "address"], query.search) }, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createGeofence(user: AuthUser, input: z.infer<typeof createGeofenceSchema>) {
  const tenant = requireFleetId(user, input.fleetId);
  const place = await FleetGeofence.create({ fleetId: tenant, name: input.name, kind: input.kind, address: input.address });
  return serialize(place.toObject());
}

export async function updateGeofence(user: AuthUser, id: string, input: z.infer<typeof createGeofenceSchema>) {
  const tenant = requireFleetId(user, input.fleetId);
  const place = await FleetGeofence.findOne({ _id: id, fleetId: tenant });
  if (!place) throw notFound("Place");
  place.name = input.name;
  place.kind = input.kind;
  place.address = input.address || "";
  await place.save();
  return serialize(place.toObject());
}

export async function deleteGeofence(user: AuthUser, id: string, fleetId?: string) {
  const tenant = requireFleetId(user, fleetId);
  const place = await FleetGeofence.findOne({ _id: id, fleetId: tenant });
  if (!place) throw notFound("Place");
  await place.deleteOne();
  return { deleted: true };
}

export async function fleetSummary(user: AuthUser) {
  const tenant = requireFleetId(user);
  const [trucks, activeTrips] = await Promise.all([
    Truck.countDocuments({ fleetId: tenant, status: "ACTIVE" }),
    FleetTrip.countDocuments({ fleetId: tenant, status: "ACTIVE" }),
  ]);
  return { trucks, activeTrips };
}
