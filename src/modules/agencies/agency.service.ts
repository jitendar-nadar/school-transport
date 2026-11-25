import { z } from "zod";
import { hashPassword } from "@/lib/auth/tokens";
import { requireAgencyId } from "@/lib/auth/guard";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { objectIdSchema, passwordSchema } from "@/lib/validation/common";
import { AgencyVehicle, TransportAgency } from "@/models/agency";
import { BleTag } from "@/models/ble-tag";
import { Company } from "@/models/company";
import { School } from "@/models/school";
import { User } from "@/models/user";
import { writeAudit } from "@/modules/audit/audit.service";
import { clientKey, diffIds, splitClientKeys } from "@/modules/agencies/agency-rules";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { searchClause, serialize } from "@/utils/serialize";

const statusSchema = z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]);

export const createAgencySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  agencyCode: z.string().trim().min(2, "Agency code must be at least 2 characters.").max(20),
  address: z.string().trim().max(300).optional().default(""),
  contactEmail: z.email("Enter a valid email address."),
  contactPhone: z.string().trim().min(8, "Phone must be at least 8 digits.").max(20),
  adminName: z.string().trim().min(2, "Admin name must be at least 2 characters."),
  adminEmail: z.email("Enter a valid email address."),
  adminPassword: passwordSchema,
});

export const updateAgencySchema = z.object({
  name: createAgencySchema.shape.name.optional(),
  agencyCode: createAgencySchema.shape.agencyCode.optional(),
  address: z.string().trim().max(300).optional(),
  contactEmail: createAgencySchema.shape.contactEmail.optional(),
  contactPhone: createAgencySchema.shape.contactPhone.optional(),
  status: statusSchema.optional(),
});

export const setClientsSchema = z.object({
  agencyId: objectIdSchema.optional(),
  clients: z.array(z.string().max(80)).max(200),
});

function codeTaken() {
  const message = "Another transport agency already uses this code.";
  return new AppError(409, "CODE_EXISTS", message, { fieldErrors: { agencyCode: [message] } });
}

function ids(values: unknown[] | undefined) {
  return (values || []).map((value) => String(value));
}

export async function listAgencies(user: AuthUser, query: { page: number; limit: number; search?: string }) {
  if (user.role === ROLES.AGENCY_ADMIN) {
    const agency = await TransportAgency.findById(requireAgencyId(user)).lean();
    return { items: agency ? [serialize(agency)] : [], meta: { page: 1, limit: 1, total: agency ? 1 : 0, totalPages: 1 } };
  }
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "You cannot list transport agencies.");
  const result = await paginate(TransportAgency, searchClause(["name", "agencyCode", "contactEmail"], query.search), {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createAgency(user: AuthUser, input: z.infer<typeof createAgencySchema>) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can create a transport agency.");
  const email = input.adminEmail.toLowerCase();
  if (await User.exists({ email })) {
    const message = "Another account already uses this email.";
    throw new AppError(409, "EMAIL_EXISTS", message, { fieldErrors: { adminEmail: [message] } });
  }
  let agency;
  try {
    agency = await TransportAgency.create({
      name: input.name,
      agencyCode: input.agencyCode.toUpperCase(),
      address: input.address,
      contactEmail: input.contactEmail.toLowerCase(),
      contactPhone: input.contactPhone,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw codeTaken();
    throw error;
  }
  try {
    await User.create({
      agencyId: agency._id,
      name: input.adminName,
      email,
      phone: input.contactPhone,
      passwordHash: await hashPassword(input.adminPassword),
      role: ROLES.AGENCY_ADMIN,
    });
  } catch (error) {
    await TransportAgency.deleteOne({ _id: agency._id });
    throw error;
  }
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_CREATED",
    entityType: "TransportAgency",
    entityId: String(agency._id),
    after: { name: agency.name },
  });
  return serialize(agency.toObject());
}

async function agencyForPlatform(user: AuthUser, id: string) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can manage transport agencies.");
  if (!objectIdSchema.safeParse(id).success) throw new AppError(400, "INVALID_ID", "Agency id is invalid.");
  const agency = await TransportAgency.findById(id);
  if (!agency) throw notFound("Transport agency");
  return agency;
}

export async function getAgency(user: AuthUser, id: string) {
  const agency = await agencyForPlatform(user, id);
  return serialize(agency.toObject());
}

export async function updateAgency(user: AuthUser, id: string, input: z.infer<typeof updateAgencySchema>) {
  const agency = await agencyForPlatform(user, id);
  if (input.name) agency.name = input.name;
  if (input.agencyCode) agency.agencyCode = input.agencyCode.toUpperCase();
  if (input.address != null) agency.address = input.address;
  if (input.contactEmail) agency.contactEmail = input.contactEmail.toLowerCase();
  if (input.contactPhone) agency.contactPhone = input.contactPhone;
  if (input.status) agency.status = input.status;
  try {
    await agency.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw codeTaken();
    throw error;
  }
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_UPDATED",
    entityType: "TransportAgency",
    entityId: String(agency._id),
    after: { name: agency.name, agencyCode: agency.agencyCode, status: agency.status },
  });
  return serialize(agency.toObject());
}

export async function loadAgency(agencyId: string) {
  const agency = await TransportAgency.findById(agencyId);
  if (!agency) throw notFound("Transport agency");
  return agency;
}

export async function agencySummary(user: AuthUser, agencyId?: string) {
  const tenant = requireAgencyId(user, agencyId);
  const agency = await loadAgency(tenant);
  const [vehicles, inStock, waiting, issued] = await Promise.all([
    AgencyVehicle.countDocuments({ agencyId: tenant, status: { $ne: "INACTIVE" } }),
    BleTag.countDocuments({ agencyId: tenant, schoolId: null, companyId: null, status: { $nin: ["LOST", "RETIRED"] } }),
    BleTag.countDocuments({ agencyId: tenant, $or: [{ schoolId: { $ne: null } }, { companyId: { $ne: null } }], studentId: null, employeeId: null, status: "UNASSIGNED" }),
    BleTag.countDocuments({ agencyId: tenant, status: "ACTIVE", $or: [{ studentId: { $ne: null } }, { employeeId: { $ne: null } }] }),
  ]);
  return {
    schools: agency.schoolIds?.length || 0,
    companies: agency.companyIds?.length || 0,
    vehicles,
    cardsInStock: inStock,
    cardsWaiting: waiting,
    cardsIssued: issued,
  };
}

export async function listClients(user: AuthUser, agencyId?: string) {
  const tenant = requireAgencyId(user, agencyId);
  const agency = await loadAgency(tenant);
  const schoolIds = ids(agency.schoolIds);
  const companyIds = ids(agency.companyIds);
  const [schools, companies, vehicles, cards] = await Promise.all([
    School.find({ _id: { $in: schoolIds } }).select("name schoolCode status").lean(),
    Company.find({ _id: { $in: companyIds } }).select("name companyCode status").lean(),
    AgencyVehicle.find({ agencyId: tenant, status: { $ne: "INACTIVE" } }).select("schoolIds companyIds").lean(),
    BleTag.find({ agencyId: tenant, $or: [{ schoolId: { $in: schoolIds } }, { companyId: { $in: companyIds } }] })
      .select("schoolId companyId studentId employeeId status")
      .lean(),
  ]);
  const vehiclesFor = (field: "schoolIds" | "companyIds", id: string) => vehicles.filter((vehicle) => ids(vehicle[field]).includes(id)).length;
  const cardsFor = (field: "schoolId" | "companyId", id: string) => {
    const mine = cards.filter((card) => String(card[field] || "") === id);
    const issued = mine.filter((card) => card.status === "ACTIVE" && (card.studentId || card.employeeId)).length;
    return { cardsIssued: issued, cardsWaiting: mine.filter((card) => card.status === "UNASSIGNED" && !card.studentId && !card.employeeId).length };
  };
  return [
    ...schools.map((school) => ({
      key: clientKey("SCHOOL", String(school._id)),
      type: "SCHOOL" as const,
      id: String(school._id),
      name: school.name,
      code: school.schoolCode,
      status: school.status,
      vehicles: vehiclesFor("schoolIds", String(school._id)),
      ...cardsFor("schoolId", String(school._id)),
    })),
    ...companies.map((company) => ({
      key: clientKey("COMPANY", String(company._id)),
      type: "COMPANY" as const,
      id: String(company._id),
      name: company.name,
      code: company.companyCode,
      status: company.status,
      vehicles: vehiclesFor("companyIds", String(company._id)),
      ...cardsFor("companyId", String(company._id)),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export async function setClients(user: AuthUser, input: z.infer<typeof setClientsSchema>) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can change an agency's clients.");
  const tenant = requireAgencyId(user, input.agencyId);
  const agency = await loadAgency(tenant);
  const next = splitClientKeys(input.clients);
  if (next.invalid.length) throw new AppError(422, "INVALID_CLIENT", "Choose clients from the list.", { fieldErrors: { clients: ["Choose clients from the list."] } });
  const [schoolCount, companyCount] = await Promise.all([
    School.countDocuments({ _id: { $in: next.schoolIds } }),
    Company.countDocuments({ _id: { $in: next.companyIds } }),
  ]);
  if (schoolCount !== next.schoolIds.length || companyCount !== next.companyIds.length) {
    throw new AppError(422, "INVALID_CLIENT", "Choose again. One of the chosen clients no longer exists.", { fieldErrors: { clients: ["Choose again. One of the chosen clients no longer exists."] } });
  }
  const removedSchools = diffIds(ids(agency.schoolIds), next.schoolIds).removed;
  const removedCompanies = diffIds(ids(agency.companyIds), next.companyIds).removed;
  if (removedSchools.length || removedCompanies.length) {
    const busy = { agencyId: tenant, $or: [{ schoolIds: { $in: removedSchools } }, { companyIds: { $in: removedCompanies } }] };
    const [vehicle, card] = await Promise.all([
      AgencyVehicle.findOne(busy).select("vehicleNumber schoolIds companyIds").lean(),
      BleTag.findOne({ agencyId: tenant, $or: [{ schoolId: { $in: removedSchools } }, { companyId: { $in: removedCompanies } }] }).select("tagIdentifier schoolId companyId").lean(),
    ]);
    if (vehicle || card) {
      const clientId = vehicle
        ? [...ids(vehicle.schoolIds), ...ids(vehicle.companyIds)].find((id) => removedSchools.includes(id) || removedCompanies.includes(id))
        : String(card?.schoolId || card?.companyId || "");
      const name = (await School.findById(clientId).select("name").lean())?.name || (await Company.findById(clientId).select("name").lean())?.name || "That client";
      const message = vehicle
        ? `Keep ${name}: ${vehicle.vehicleNumber} still serves it. Stop serving it on Agency vehicles first.`
        : `Keep ${name}: it still has card ${card?.tagIdentifier}. Take the agency's cards back on Agency cards first.`;
      throw new AppError(409, "CLIENT_IN_USE", message, { fieldErrors: { clients: [message] } });
    }
  }
  agency.set("schoolIds", next.schoolIds);
  agency.set("companyIds", next.companyIds);
  await agency.save();
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_CLIENTS_UPDATED",
    entityType: "TransportAgency",
    entityId: tenant,
    after: { schoolIds: next.schoolIds, companyIds: next.companyIds },
  });
  return listClients(user, tenant);
}

export async function clientOptions(user: AuthUser) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can change an agency's clients.");
  const [schools, companies] = await Promise.all([
    School.find({}).select("name schoolCode").sort({ name: 1 }).limit(500).lean(),
    Company.find({}).select("name companyCode").sort({ name: 1 }).limit(500).lean(),
  ]);
  return [
    ...schools.map((school) => ({ id: clientKey("SCHOOL", String(school._id)), name: school.name, detail: `School · ${school.schoolCode}` })),
    ...companies.map((company) => ({ id: clientKey("COMPANY", String(company._id)), name: company.name, detail: `Company · ${company.companyCode}` })),
  ];
}

export async function agenciesServing(filter: { schoolId?: string; companyId?: string }) {
  const query = filter.schoolId ? { schoolIds: filter.schoolId } : { companyIds: filter.companyId };
  return TransportAgency.find(query).select("name agencyCode contactPhone contactEmail").lean();
}
