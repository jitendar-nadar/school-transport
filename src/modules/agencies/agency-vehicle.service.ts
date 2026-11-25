import { z } from "zod";
import { requireAgencyId, requireCompanyId } from "@/lib/auth/guard";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { objectIdSchema } from "@/lib/validation/common";
import { AgencyVehicle } from "@/models/agency";
import { Route, Vehicle } from "@/models/fleet";
import { School } from "@/models/school";
import { Trip } from "@/models/trip";
import { writeAudit } from "@/modules/audit/audit.service";
import { clientKey, diffIds, splitClientKeys } from "@/modules/agencies/agency-rules";
import { loadAgency } from "@/modules/agencies/agency.service";
import { seatsBySchool, seatsUsed } from "@/modules/agencies/agency-seats";
import type { AuthUser } from "@/types/domain";
import { escapeRegex, serialize } from "@/utils/serialize";

const vehicleStatus = z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]);
const clientsSchema = z.array(z.string().max(80)).max(50);

export const agencyVehicleSchema = z.object({
  agencyId: objectIdSchema.optional(),
  vehicleNumber: z.string().trim().min(1, "Enter the vehicle number.").max(30),
  vehicleType: z.enum(["BUS", "VAN"]),
  capacity: z.coerce.number().int().min(1).max(80),
  status: vehicleStatus.optional(),
  clients: clientsSchema.optional().default([]),
});

export const updateAgencyVehicleSchema = z.object({
  agencyId: objectIdSchema.optional(),
  vehicleNumber: agencyVehicleSchema.shape.vehicleNumber.optional(),
  vehicleType: z.enum(["BUS", "VAN"]).optional(),
  capacity: z.coerce.number().int().min(1).max(80).optional(),
  status: vehicleStatus.optional(),
  clients: clientsSchema.optional(),
});

type VehicleShape = { vehicleNumber: string; vehicleType: string; capacity: number; status: string };

function ids(values: unknown[] | undefined) {
  return (values || []).map((value) => String(value));
}

function clientsError(message: string) {
  return new AppError(422, "INVALID_CLIENT", message, { fieldErrors: { clients: [message] } });
}

async function schoolName(id: string) {
  return (await School.findById(id).select("name").lean())?.name || "the school";
}

async function resolveClients(agencyId: string, keys: string[]) {
  const agency = await loadAgency(agencyId);
  const split = splitClientKeys(keys);
  if (split.invalid.length) throw clientsError("Choose clients from the list.");
  const schools = ids(agency.schoolIds);
  const companies = ids(agency.companyIds);
  if (split.schoolIds.some((id) => !schools.includes(id)) || split.companyIds.some((id) => !companies.includes(id))) {
    throw clientsError("Choose only this agency's clients. The platform admin adds new clients.");
  }
  return split;
}

async function assertNumberFree(vehicleNumber: string, schoolIds: string[], agencyVehicleId?: string) {
  if (!schoolIds.length) return;
  const clash = await Vehicle.findOne({
    schoolId: { $in: schoolIds },
    vehicleNumber: { $regex: `^${escapeRegex(vehicleNumber)}$`, $options: "i" },
    ...(agencyVehicleId ? { agencyVehicleId: { $ne: agencyVehicleId } } : {}),
  }).select("schoolId").lean();
  if (!clash) return;
  const message = `Vehicle number ${vehicleNumber} is already used by ${await schoolName(String(clash.schoolId))}'s own vehicle.`;
  throw new AppError(409, "VEHICLE_NUMBER_TAKEN", message, { fieldErrors: { vehicleNumber: [message] } });
}

async function assertNotOnTrip(agencyVehicleId: string, schoolIds: string[], vehicleNumber: string, reason: string) {
  if (!schoolIds.length) return;
  const mirrors = await Vehicle.find({ agencyVehicleId, schoolId: { $in: schoolIds } }).select("_id schoolId").lean();
  if (!mirrors.length) return;
  const trip = await Trip.findOne({ vehicleId: { $in: mirrors.map((mirror) => mirror._id) }, status: "ACTIVE" }).select("schoolId").lean();
  if (trip) throw new AppError(409, "ON_TRIP", `${vehicleNumber} is on an active trip at ${await schoolName(String(trip.schoolId))}. ${reason}`);
}

async function assertNoActiveRoutes(agencyVehicleId: string, schoolIds: string[], vehicleNumber: string) {
  if (!schoolIds.length) return;
  const mirrors = await Vehicle.find({ agencyVehicleId, schoolId: { $in: schoolIds } }).select("_id").lean();
  if (!mirrors.length) return;
  const route = await Route.findOne({ vehicleId: { $in: mirrors.map((mirror) => mirror._id) }, status: "ACTIVE" }).select("name schoolId").lean();
  if (!route) return;
  const message = `Ask ${await schoolName(String(route.schoolId))} to move route ${route.name} to another vehicle first. It runs on ${vehicleNumber}.`;
  throw new AppError(409, "VEHICLE_ON_ROUTE", message, { fieldErrors: { clients: [message] } });
}

async function assertCapacity(agencyVehicleId: string, schoolIds: string[], capacity: number) {
  if (!schoolIds.length) return;
  const seats = await seatsBySchool([agencyVehicleId], { servedOnly: false });
  const mapped = seatsUsed(seats, agencyVehicleId, schoolIds);
  if (mapped <= capacity) return;
  const message = `The schools it serves have mapped ${mapped} students to this vehicle, more than ${capacity} seats. Ask them to remove students first.`;
  throw new AppError(422, "OVER_CAPACITY", message, { fieldErrors: { capacity: [message] } });
}

async function syncSchoolVehicles(agencyId: string, agencyVehicleId: string, vehicle: VehicleShape, serving: string[], stopped: string[]) {
  for (const schoolId of serving) {
    const fields = { vehicleNumber: vehicle.vehicleNumber, vehicleType: vehicle.vehicleType, capacity: vehicle.capacity, status: vehicle.status, agencyId };
    const updated = await Vehicle.updateOne({ agencyVehicleId, schoolId }, { $set: fields });
    if (!updated.matchedCount) {
      await Vehicle.create({ ...fields, schoolId, agencyVehicleId, driverIds: [], attendantIds: [], studentIds: [] });
    }
  }
  if (stopped.length) await Vehicle.updateMany({ agencyVehicleId, schoolId: { $in: stopped } }, { $set: { status: "INACTIVE" } });
}

function present(vehicle: unknown) {
  const data = serialize(vehicle) as Record<string, unknown> & {
    schoolIds?: Array<{ id: string; name: string } | string>;
    companyIds?: Array<{ id: string; name: string } | string>;
  };
  const named = (list: Array<{ id: string; name: string } | string> | undefined, type: "SCHOOL" | "COMPANY") =>
    (list || []).filter((item): item is { id: string; name: string } => typeof item === "object" && item !== null).map((item) => ({ key: clientKey(type, item.id), type, id: item.id, name: item.name }));
  return { ...data, clients: [...named(data.schoolIds, "SCHOOL"), ...named(data.companyIds, "COMPANY")] };
}

export async function listAgencyVehicles(user: AuthUser, query: { page: number; limit: number; search?: string; status?: string; agencyId?: string }) {
  const tenant = requireAgencyId(user, query.agencyId);
  const filter: Record<string, unknown> = { agencyId: tenant };
  if (query.status) filter.status = query.status;
  if (query.search) filter.vehicleNumber = { $regex: escapeRegex(query.search), $options: "i" };
  const result = await paginate(AgencyVehicle, filter, {
    page: query.page,
    limit: query.limit,
    sort: { vehicleNumber: 1 },
    populate: [
      { path: "schoolIds", select: "name" },
      { path: "companyIds", select: "name" },
    ],
  });
  const ids = result.items.map((item) => String((item as { _id: unknown })._id));
  const seats = await seatsBySchool(ids);
  return { items: result.items.map((item, index) => ({ ...present(item), seatsUsed: seatsUsed(seats, ids[index]) })), meta: result.meta };
}

function numberTaken() {
  const message = "This agency already has a vehicle with this number.";
  return new AppError(409, "VEHICLE_EXISTS", message, { fieldErrors: { vehicleNumber: [message] } });
}

export async function createAgencyVehicle(user: AuthUser, input: z.infer<typeof agencyVehicleSchema>) {
  const tenant = requireAgencyId(user, input.agencyId);
  const clients = await resolveClients(tenant, input.clients);
  const vehicleNumber = input.vehicleNumber.toUpperCase();
  await assertNumberFree(vehicleNumber, clients.schoolIds);
  let vehicle;
  try {
    vehicle = await AgencyVehicle.create({
      agencyId: tenant,
      vehicleNumber,
      vehicleType: input.vehicleType,
      capacity: input.capacity,
      status: input.status ?? "ACTIVE",
      schoolIds: clients.schoolIds,
      companyIds: clients.companyIds,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw numberTaken();
    throw error;
  }
  try {
    await syncSchoolVehicles(tenant, String(vehicle._id), vehicle, clients.schoolIds, []);
  } catch (error) {
    await Vehicle.deleteMany({ agencyVehicleId: vehicle._id });
    await vehicle.deleteOne();
    throw error;
  }
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_VEHICLE_CREATED",
    entityType: "AgencyVehicle",
    entityId: String(vehicle._id),
    after: { agencyId: tenant, vehicleNumber, schoolIds: clients.schoolIds, companyIds: clients.companyIds },
  });
  return present(vehicle.toObject());
}

export async function updateAgencyVehicle(user: AuthUser, id: string, input: z.infer<typeof updateAgencyVehicleSchema>) {
  const tenant = requireAgencyId(user, input.agencyId);
  const vehicle = await AgencyVehicle.findOne({ _id: id, agencyId: tenant });
  if (!vehicle) throw notFound("Vehicle");
  const currentSchools = ids(vehicle.schoolIds);
  const clients = input.clients ? await resolveClients(tenant, input.clients) : { schoolIds: currentSchools, companyIds: ids(vehicle.companyIds) };
  const next: VehicleShape = {
    vehicleNumber: input.vehicleNumber ? input.vehicleNumber.toUpperCase() : vehicle.vehicleNumber,
    vehicleType: input.vehicleType ?? vehicle.vehicleType,
    capacity: input.capacity ?? vehicle.capacity,
    status: input.status ?? vehicle.status,
  };
  const { removed } = diffIds(currentSchools, clients.schoolIds);
  const reason = "Try again after the trip ends.";
  await assertNotOnTrip(id, removed, next.vehicleNumber, reason);
  if (next.status !== "ACTIVE" && vehicle.status === "ACTIVE") await assertNotOnTrip(id, clients.schoolIds, next.vehicleNumber, reason);
  await assertNoActiveRoutes(id, removed, next.vehicleNumber);
  await assertCapacity(id, clients.schoolIds, next.capacity);
  await assertNumberFree(next.vehicleNumber, clients.schoolIds, id);
  const before = { vehicleNumber: vehicle.vehicleNumber, status: vehicle.status, schoolIds: currentSchools, companyIds: ids(vehicle.companyIds) };
  Object.assign(vehicle, next);
  vehicle.set("schoolIds", clients.schoolIds);
  vehicle.set("companyIds", clients.companyIds);
  try {
    await vehicle.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw numberTaken();
    throw error;
  }
  await syncSchoolVehicles(tenant, id, next, clients.schoolIds, removed);
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_VEHICLE_UPDATED",
    entityType: "AgencyVehicle",
    entityId: id,
    before,
    after: { vehicleNumber: next.vehicleNumber, status: next.status, schoolIds: clients.schoolIds, companyIds: clients.companyIds },
  });
  return present(vehicle.toObject());
}

export async function deleteAgencyVehicle(user: AuthUser, id: string, agencyId?: string) {
  const tenant = requireAgencyId(user, agencyId);
  const vehicle = await AgencyVehicle.findOne({ _id: id, agencyId: tenant });
  if (!vehicle) throw notFound("Vehicle");
  if (vehicle.schoolIds?.length || vehicle.companyIds?.length) {
    throw new AppError(409, "IN_USE", `${vehicle.vehicleNumber} still serves clients. Remove them from the vehicle before deleting it.`);
  }
  await vehicle.deleteOne();
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_VEHICLE_DELETED",
    entityType: "AgencyVehicle",
    entityId: id,
    after: { vehicleNumber: vehicle.vehicleNumber },
  });
  return { deleted: true };
}

export async function suppliedToCompany(user: AuthUser, companyId?: string) {
  const tenant = requireCompanyId(user, companyId);
  const vehicles = await AgencyVehicle.find({ companyIds: tenant, status: { $ne: "INACTIVE" } })
    .populate("agencyId", "name contactPhone")
    .sort({ vehicleNumber: 1 })
    .lean();
  return vehicles.map((vehicle) => {
    const agency = vehicle.agencyId as unknown as { name?: string; contactPhone?: string } | null;
    return {
      id: String(vehicle._id),
      vehicleNumber: vehicle.vehicleNumber,
      vehicleType: vehicle.vehicleType,
      capacity: vehicle.capacity,
      status: vehicle.status,
      agencyName: agency?.name || "",
      agencyPhone: agency?.contactPhone || "",
    };
  });
}
