import { z } from "zod";
import { requireSchoolId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { Gate, SchoolClass, Tour, TourHeadcount } from "@/models/school-records";
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

export const createTourSchema = z.object({
  name: z.string().trim().min(2, "Tour name must be at least 2 characters."),
  tripDate: z.string().trim().min(8, "Enter the tour date."),
});

export const createHeadcountSchema = z.object({
  tourId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a tour."),
  presentCount: z.coerce.number().int().min(0, "Present count cannot be negative."),
  note: z.string().trim().max(300).optional().default(""),
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

export async function listTours(user: AuthUser, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tours = await Tour.find({ schoolId: tenant }).sort({ tripDate: -1 }).lean();
  const counts = await TourHeadcount.find({ schoolId: tenant }).sort({ takenAt: -1 }).lean();
  return {
    tours: tours.map((tour) => serialize(tour)),
    headcounts: counts.map((count) => serialize(count)),
  };
}

export async function createTour(user: AuthUser, input: z.infer<typeof createTourSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tour = await Tour.create({ schoolId: tenant, name: input.name, tripDate: input.tripDate });
  return serialize(tour.toObject());
}

export async function updateTour(user: AuthUser, id: string, input: z.infer<typeof createTourSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tour = await Tour.findOne({ _id: id, schoolId: tenant });
  if (!tour) throw notFound("Tour");
  tour.name = input.name;
  tour.tripDate = input.tripDate;
  await tour.save();
  return serialize(tour.toObject());
}

export async function deleteTour(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tour = await Tour.findOne({ _id: id, schoolId: tenant });
  if (!tour) throw notFound("Tour");
  await TourHeadcount.deleteMany({ schoolId: tenant, tourId: tour._id });
  await tour.deleteOne();
  return { deleted: true };
}

export async function updateHeadcount(user: AuthUser, id: string, input: z.infer<typeof createHeadcountSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const headcount = await TourHeadcount.findOne({ _id: id, schoolId: tenant });
  if (!headcount) throw notFound("Headcount");
  const tour = await Tour.findOne({ _id: input.tourId, schoolId: tenant }).lean();
  if (!tour) throw notFound("Tour");
  headcount.tourId = tour._id;
  headcount.presentCount = input.presentCount;
  headcount.note = input.note || "";
  await headcount.save();
  return serialize(headcount.toObject());
}

export async function deleteHeadcount(user: AuthUser, id: string, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const headcount = await TourHeadcount.findOne({ _id: id, schoolId: tenant });
  if (!headcount) throw notFound("Headcount");
  await headcount.deleteOne();
  return { deleted: true };
}

export async function createHeadcount(user: AuthUser, input: z.infer<typeof createHeadcountSchema>, schoolId?: string) {
  const tenant = requireSchoolId(user, schoolId);
  const tour = await Tour.findOne({ _id: input.tourId, schoolId: tenant }).lean();
  if (!tour) throw notFound("Tour");
  if (!tour._id) throw new AppError(400, "TOUR_REQUIRED", "Choose a tour.");
  const headcount = await TourHeadcount.create({
    schoolId: tenant,
    tourId: tour._id,
    presentCount: input.presentCount,
    note: input.note,
  });
  return serialize(headcount.toObject());
}
