import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { notFound } from "@/lib/errors/app-error";
import { Gate, SchoolClass } from "@/models/school-records";
import { removeGateCascade } from "@/modules/gates/gate.service";
import type { AuthUser } from "@/types/domain";
import { paginate } from "@/lib/mongodb/paginate";
import { searchClause, serialize } from "@/utils/serialize";

export const createGateSchema = z.object({
  name: z.string().trim().min(2, "Gate name must be at least 2 characters."),
});

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "Enter the class name."),
  division: z.string().trim().max(20).optional().default(""),
});

export async function listGates(user: AuthUser, query: { page: number; limit: number; search?: string; schoolId?: string }) {
  const tenant = requireSchoolId(user, query.schoolId);
  const result = await paginate(Gate, { schoolId: tenant, ...searchClause(["name"], query.search) }, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createGate(user: AuthUser, input: z.infer<typeof createGateSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const gate = await Gate.create({ schoolId: tenant, name: input.name });
  return serialize(gate.toObject());
}

export async function updateGate(user: AuthUser, id: string, input: z.infer<typeof createGateSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const gate = await Gate.findOne({ _id: id, schoolId: tenant });
  if (!gate) throw notFound("Gate");
  gate.name = input.name;
  await gate.save();
  return serialize(gate.toObject());
}

export async function deleteGate(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const gate = await Gate.findOne({ _id: id, schoolId: tenant });
  if (!gate) throw notFound("Gate");
  await removeGateCascade(tenant, String(gate._id));
  await gate.deleteOne();
  return { deleted: true };
}

export async function listClasses(user: AuthUser, query: { page: number; limit: number; search?: string; schoolId?: string }) {
  const tenant = requireSchoolId(user, query.schoolId);
  const result = await paginate(SchoolClass, { schoolId: tenant, ...searchClause(["name", "division"], query.search) }, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1, division: 1 },
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createClass(user: AuthUser, input: z.infer<typeof createClassSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const schoolClass = await SchoolClass.create({ schoolId: tenant, name: input.name, division: input.division });
  return serialize(schoolClass.toObject());
}

export async function updateClass(user: AuthUser, id: string, input: z.infer<typeof createClassSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const schoolClass = await SchoolClass.findOne({ _id: id, schoolId: tenant });
  if (!schoolClass) throw notFound("Class");
  schoolClass.name = input.name;
  schoolClass.division = input.division || "";
  await schoolClass.save();
  return serialize(schoolClass.toObject());
}

export async function deleteClass(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const schoolClass = await SchoolClass.findOne({ _id: id, schoolId: tenant });
  if (!schoolClass) throw notFound("Class");
  await schoolClass.deleteOne();
  return { deleted: true };
}

export {
  createTourSchema,
  createHeadcountSchema,
  listTours,
  createTour,
  updateTour,
  deleteTour,
  createHeadcount,
  updateHeadcount,
  deleteHeadcount,
} from "@/modules/tours/tour.service";
