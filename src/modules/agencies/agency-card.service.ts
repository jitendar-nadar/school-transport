import { Types } from "mongoose";
import { z } from "zod";
import { requireAgencyId, requireCompanyId } from "@/lib/auth/guard";
import { AppError, isDuplicateKey, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { objectIdSchema } from "@/lib/validation/common";
import { BleTag } from "@/models/ble-tag";
import { Company, Employee } from "@/models/company";
import { School } from "@/models/school";
import { Student } from "@/models/student";
import { writeAudit } from "@/modules/audit/audit.service";
import { cardPlace, checkCardRows, parseCardList, parseClientKey } from "@/modules/agencies/agency-rules";
import { loadAgency } from "@/modules/agencies/agency.service";
import { MAX_IMPORT_ROWS } from "@/modules/ble/ble-import";
import type { AuthUser } from "@/types/domain";
import { escapeRegex, serialize } from "@/utils/serialize";

export const registerCardsSchema = z.object({
  agencyId: objectIdSchema.optional(),
  cards: z.string().max(100_000).optional(),
  rows: z
    .array(z.object({ row: z.number().int().min(0), tagIdentifier: z.string().trim().max(200) }))
    .min(1, "The file has no cards.")
    .max(MAX_IMPORT_ROWS, `Upload ${MAX_IMPORT_ROWS} cards or fewer at a time.`)
    .optional(),
});

export const issueCardSchema = z.object({
  agencyId: objectIdSchema.optional(),
  client: z.string().min(1, "Choose a school or company.").max(80),
  personId: z.union([z.literal(""), objectIdSchema]).optional().default(""),
});

export const agencyCardStatusSchema = z.object({
  agencyId: objectIdSchema.optional(),
  status: z.enum(["UNASSIGNED", "ACTIVE", "INACTIVE", "LOST", "RETIRED"]),
});

export const clientPeopleQuerySchema = z.object({
  agencyId: z.preprocess((value) => (value === "" ? undefined : value), objectIdSchema.optional()),
  client: z.string().max(80),
  search: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().max(100).optional()),
});

type CardDoc = InstanceType<typeof BleTag>;

function idOf(value: unknown) {
  return value ? String(value) : "";
}

async function releaseHolder(card: CardDoc) {
  if (card.studentId) await Student.updateOne({ _id: card.studentId, bleTagId: card._id }, { $set: { bleTagId: null } });
  if (card.employeeId) await Employee.updateOne({ _id: card.employeeId, tagIdentifier: card.tagIdentifier }, { $set: { tagIdentifier: "" } });
  card.studentId = null;
  card.employeeId = null;
  card.assignedAt = null;
}

async function cardForAgency(agencyId: string, id: string) {
  if (!objectIdSchema.safeParse(id).success) throw new AppError(400, "INVALID_ID", "Card id is invalid.");
  const card = await BleTag.findOne({ _id: id, agencyId });
  if (!card) throw notFound("Card");
  return card;
}

function present(card: unknown) {
  const data = serialize(card) as Record<string, unknown> & {
    schoolId?: { id: string; name: string } | string | null;
    companyId?: { id: string; name: string } | string | null;
    studentId?: { id: string; name: string; studentCode?: string } | string | null;
    employeeId?: { id: string; name: string; employeeCode?: string } | string | null;
  };
  const named = <T extends { name: string }>(value: T | string | null | undefined) => (typeof value === "object" && value ? value : null);
  const school = named(data.schoolId);
  const company = named(data.companyId);
  const student = named(data.studentId);
  const employee = named(data.employeeId);
  const place = cardPlace({ schoolName: school?.name, companyName: company?.name, studentName: student?.name, employeeName: employee?.name });
  return {
    ...data,
    clientKey: school ? `SCHOOL:${school.id}` : company ? `COMPANY:${company.id}` : "",
    clientType: school ? "SCHOOL" : company ? "COMPANY" : "",
    clientName: place.client,
    holderName: place.holder,
    holderCode: student?.studentCode || employee?.employeeCode || "",
    held: Boolean(student || employee),
  };
}

export async function listAgencyCards(user: AuthUser, query: { page: number; limit: number; search?: string; status?: string; agencyId?: string }) {
  const tenant = requireAgencyId(user, query.agencyId);
  const filter: Record<string, unknown> = { agencyId: tenant };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = escapeRegex(query.search);
    const agency = await loadAgency(tenant);
    const [students, employees, schools, companies] = await Promise.all([
      Student.find({ schoolId: { $in: agency.schoolIds }, $or: [{ name: { $regex: pattern, $options: "i" } }, { studentCode: { $regex: pattern, $options: "i" } }] }).select("_id").limit(200),
      Employee.find({ companyId: { $in: agency.companyIds }, $or: [{ name: { $regex: pattern, $options: "i" } }, { employeeCode: { $regex: pattern, $options: "i" } }] }).select("_id").limit(200),
      School.find({ _id: { $in: agency.schoolIds }, name: { $regex: pattern, $options: "i" } }).select("_id"),
      Company.find({ _id: { $in: agency.companyIds }, name: { $regex: pattern, $options: "i" } }).select("_id"),
    ]);
    filter.$or = [
      { tagIdentifier: { $regex: pattern, $options: "i" } },
      { status: { $regex: pattern, $options: "i" } },
      { studentId: { $in: students.map((row) => row._id) } },
      { employeeId: { $in: employees.map((row) => row._id) } },
      { schoolId: { $in: schools.map((row) => row._id) } },
      { companyId: { $in: companies.map((row) => row._id) } },
    ];
  }
  const result = await paginate(BleTag, filter, {
    page: query.page,
    limit: query.limit,
    sort: { tagIdentifier: 1 },
    populate: [
      { path: "schoolId", select: "name" },
      { path: "companyId", select: "name" },
      { path: "studentId", select: "name studentCode" },
      { path: "employeeId", select: "name employeeCode" },
    ],
  });
  return { items: result.items.map(present), meta: result.meta };
}

export async function registerAgencyCards(user: AuthUser, input: z.infer<typeof registerCardsSchema>) {
  const tenant = requireAgencyId(user, input.agencyId);
  await loadAgency(tenant);
  const { rows, problems } = input.rows ? checkCardRows(input.rows) : parseCardList(input.cards ?? "");
  const identifiers = rows.map((row) => row.tagIdentifier);
  const [tags, employees] = await Promise.all([
    BleTag.find({ $or: [{ tagIdentifier: { $in: identifiers } }, { aliasIdentifiers: { $in: identifiers } }] }).select("tagIdentifier aliasIdentifiers").lean(),
    Employee.find({ tagIdentifier: { $in: identifiers } }).select("tagIdentifier").lean(),
  ]);
  const taken = new Set([...tags.flatMap((tag) => [tag.tagIdentifier, ...(tag.aliasIdentifiers || [])]), ...employees.map((employee) => employee.tagIdentifier)]);
  for (const row of rows) {
    if (taken.has(row.tagIdentifier)) problems.push({ row: row.row, tagIdentifier: row.tagIdentifier, message: "This card is already registered." });
  }
  if (problems.length) {
    problems.sort((a, b) => a.row - b.row);
    const first = problems[0];
    const message = problems.length === 1
      ? `${first.tagIdentifier ? `${first.tagIdentifier}: ` : ""}${first.message} No cards were added.`
      : `${problems.length} cards need fixing. No cards were added.`;
    throw new AppError(422, "IMPORT_INVALID", message, { rows: problems });
  }
  const documents = rows.map((row) => ({
    _id: new Types.ObjectId(),
    agencyId: tenant,
    schoolId: null,
    tagIdentifier: row.tagIdentifier,
    aliasIdentifiers: [],
    tagType: "CARD",
    batteryStatus: "UNKNOWN",
    status: "UNASSIGNED",
  }));
  try {
    await BleTag.insertMany(documents, { ordered: true });
  } catch (error) {
    await BleTag.deleteMany({ _id: { $in: documents.map((document) => document._id) } });
    if (isDuplicateKey(error)) throw new AppError(409, "TAG_EXISTS", "One of these cards was registered meanwhile. No cards were added. Try again.");
    throw error;
  }
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_CARDS_REGISTERED",
    entityType: "TransportAgency",
    entityId: tenant,
    after: { created: documents.length, tagIdentifiers: identifiers },
  });
  return { created: documents.length };
}

export async function issueAgencyCard(user: AuthUser, id: string, input: z.infer<typeof issueCardSchema>) {
  const tenant = requireAgencyId(user, input.agencyId);
  const agency = await loadAgency(tenant);
  const card = await cardForAgency(tenant, id);
  if (card.status === "LOST" || card.status === "RETIRED") {
    throw new AppError(422, "CARD_UNUSABLE", `This card is marked ${card.status.toLowerCase()}. Use another card.`);
  }
  const client = parseClientKey(input.client);
  const clientIds = client?.type === "SCHOOL" ? agency.schoolIds : agency.companyIds;
  if (!client || !(clientIds || []).some((value: unknown) => String(value) === client.id)) {
    const message = "Choose one of this agency's clients.";
    throw new AppError(422, "INVALID_CLIENT", message, { fieldErrors: { client: [message] } });
  }
  const personError = (message: string) => new AppError(409, "PERSON_UNAVAILABLE", message, { fieldErrors: { personId: [message] } });

  let student = null;
  let employee = null;
  if (input.personId && client.type === "SCHOOL") {
    student = await Student.findOne({ _id: input.personId, schoolId: client.id, status: "ACTIVE" });
    if (!student) throw personError("Choose an active student of this school.");
    const other = await BleTag.findOne({ _id: { $ne: card._id }, studentId: student._id, status: "ACTIVE" }).select("tagIdentifier").lean();
    if (other) throw personError(`Choose another student. ${student.name} already has card ${other.tagIdentifier}; the school must mark it inactive first.`);
  }
  if (input.personId && client.type === "COMPANY") {
    employee = await Employee.findOne({ _id: input.personId, companyId: client.id, status: "ACTIVE" });
    if (!employee) throw personError("Choose an active employee of this company.");
    if (employee.tagIdentifier && employee.tagIdentifier !== card.tagIdentifier) {
      throw personError(`Choose another employee. ${employee.name} already has card ${employee.tagIdentifier}; the company must clear it on Cards and consent first.`);
    }
  }

  const sameHolder = (student && idOf(card.studentId) === String(student._id)) || (employee && idOf(card.employeeId) === String(employee._id));
  if (!sameHolder) await releaseHolder(card);
  card.schoolId = client.type === "SCHOOL" ? new Types.ObjectId(client.id) : null;
  card.companyId = client.type === "COMPANY" ? new Types.ObjectId(client.id) : null;
  if (student) {
    card.studentId = student._id;
    student.bleTagId = card._id;
    await student.save();
  }
  if (employee) {
    card.employeeId = employee._id;
    employee.tagIdentifier = card.tagIdentifier;
    await employee.save();
  }
  card.status = student || employee ? "ACTIVE" : card.status === "INACTIVE" ? "INACTIVE" : "UNASSIGNED";
  card.assignedAt = student || employee ? new Date() : null;
  await card.save();
  await writeAudit({
    actorId: user.id,
    action: "AGENCY_CARD_ISSUED",
    entityType: "BleTag",
    entityId: String(card._id),
    after: { client: input.client, studentId: student ? String(student._id) : null, employeeId: employee ? String(employee._id) : null },
  });
  return serialize(card.toObject());
}

export async function returnAgencyCard(user: AuthUser, id: string, agencyId?: string) {
  const tenant = requireAgencyId(user, agencyId);
  const card = await cardForAgency(tenant, id);
  await releaseHolder(card);
  card.schoolId = null;
  card.companyId = null;
  if (card.status === "ACTIVE") card.status = "UNASSIGNED";
  await card.save();
  await writeAudit({ actorId: user.id, action: "AGENCY_CARD_RETURNED", entityType: "BleTag", entityId: String(card._id) });
  return serialize(card.toObject());
}

export async function setAgencyCardStatus(user: AuthUser, id: string, input: z.infer<typeof agencyCardStatusSchema>) {
  const tenant = requireAgencyId(user, input.agencyId);
  const card = await cardForAgency(tenant, id);
  const held = Boolean(card.studentId || card.employeeId);
  if (input.status === "ACTIVE" && !held) throw new AppError(422, "NOT_ISSUED", "Issue the card to a student or employee to make it active.");
  if (input.status === "UNASSIGNED" && held) throw new AppError(422, "TAG_ASSIGNED", "Take the card back before marking it unassigned.");
  if (input.status === "INACTIVE" || input.status === "LOST" || input.status === "RETIRED") await releaseHolder(card);
  card.status = input.status;
  await card.save();
  await writeAudit({ actorId: user.id, action: "AGENCY_CARD_UPDATED", entityType: "BleTag", entityId: String(card._id), after: { status: card.status } });
  return serialize(card.toObject());
}

export async function deleteAgencyCard(user: AuthUser, id: string, agencyId?: string) {
  const tenant = requireAgencyId(user, agencyId);
  const card = await cardForAgency(tenant, id);
  if (card.schoolId || card.companyId || card.studentId || card.employeeId) {
    throw new AppError(409, "IN_USE", "Take the card back before deleting it.");
  }
  await card.deleteOne();
  await writeAudit({ actorId: user.id, action: "AGENCY_CARD_DELETED", entityType: "BleTag", entityId: id, after: { tagIdentifier: card.tagIdentifier } });
  return { deleted: true };
}

export async function clientPeople(user: AuthUser, query: z.infer<typeof clientPeopleQuerySchema>) {
  const tenant = requireAgencyId(user, query.agencyId);
  const agency = await loadAgency(tenant);
  const client = parseClientKey(query.client);
  const clientIds = client?.type === "SCHOOL" ? agency.schoolIds : agency.companyIds;
  if (!client || !(clientIds || []).some((value: unknown) => String(value) === client.id)) {
    throw new AppError(422, "INVALID_CLIENT", "Choose one of this agency's clients.");
  }
  const pattern = query.search ? escapeRegex(query.search) : "";
  if (client.type === "SCHOOL") {
    const students = await Student.find({
      schoolId: client.id,
      status: "ACTIVE",
      ...(pattern ? { $or: [{ name: { $regex: pattern, $options: "i" } }, { studentCode: { $regex: pattern, $options: "i" } }] } : {}),
    }).select("name studentCode className division bleTagId").sort({ name: 1 }).limit(100).lean();
    return students.map((student) => ({
      id: String(student._id),
      name: student.name,
      detail: [[student.className, student.division].filter(Boolean).join("-"), student.studentCode, student.bleTagId ? "has a card" : ""].filter(Boolean).join(" · "),
    }));
  }
  const employees = await Employee.find({
    companyId: client.id,
    status: "ACTIVE",
    ...(pattern ? { $or: [{ name: { $regex: pattern, $options: "i" } }, { employeeCode: { $regex: pattern, $options: "i" } }] } : {}),
  }).select("name employeeCode tagIdentifier").sort({ name: 1 }).limit(100).lean();
  return employees.map((employee) => ({
    id: String(employee._id),
    name: employee.name,
    detail: [employee.employeeCode, employee.tagIdentifier ? `card ${employee.tagIdentifier}` : ""].filter(Boolean).join(" · "),
  }));
}

export async function agencyCardsForCompany(user: AuthUser, companyId?: string) {
  const tenant = requireCompanyId(user, companyId);
  const cards = await BleTag.find({ companyId: tenant, agencyId: { $ne: null }, employeeId: null, status: { $in: ["UNASSIGNED", "ACTIVE"] } })
    .populate("agencyId", "name")
    .sort({ tagIdentifier: 1 })
    .limit(500)
    .lean();
  return cards.map((card) => ({
    id: String(card._id),
    tagIdentifier: card.tagIdentifier,
    agencyName: (card.agencyId as unknown as { name?: string } | null)?.name || "",
  }));
}

export async function linkEmployeeCard(companyId: string, employeeId: unknown, previous: string, next: string) {
  if (previous && previous !== next) {
    await BleTag.updateOne({ tagIdentifier: previous, employeeId }, { $set: { employeeId: null, status: "UNASSIGNED", assignedAt: null } });
  }
  if (next && next !== previous) {
    await BleTag.updateOne({ tagIdentifier: next, agencyId: { $ne: null }, companyId }, { $set: { employeeId, status: "ACTIVE", assignedAt: new Date() } });
  }
}

export async function assertEmployeeCardUsable(companyId: string, employeeId: unknown, tag: string) {
  if (!tag) return;
  const card = await BleTag.findOne({ $or: [{ tagIdentifier: tag }, { aliasIdentifiers: tag }] }).select("agencyId companyId employeeId status").lean();
  if (!card) return;
  const message = (text: string) => new AppError(409, "CONFLICT", text, { fieldErrors: { tagIdentifier: [text] } });
  if (!card.agencyId || String(card.companyId || "") !== companyId) throw message("Card belongs to another organisation.");
  if (card.employeeId && String(card.employeeId) !== String(employeeId)) throw message("Card is already given to someone else.");
  if (card.status !== "UNASSIGNED" && card.status !== "ACTIVE") throw message(`Card is marked ${card.status.toLowerCase()}. Ask the agency for another card.`);
}
