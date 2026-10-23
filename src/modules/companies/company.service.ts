import { z } from "zod";
import { hashPassword } from "@/lib/auth/tokens";
import { requireCompanyId } from "@/lib/auth/guard";
import { AppError, notFound } from "@/lib/errors/app-error";
import { paginate } from "@/lib/mongodb/paginate";
import { passwordSchema } from "@/lib/validation/common";
import { AttendanceGap, Company, Department, Employee } from "@/models/company";
import { User } from "@/models/user";
import { writeAudit } from "@/modules/audit/audit.service";
import type { AuthUser } from "@/types/domain";
import { ROLES } from "@/types/domain";
import { describeGap, parseOfficeTime, policyFrom } from "@/modules/companies/attendance-rules";
import { escapeRegex, searchClause, serialize } from "@/utils/serialize";

const statusSchema = z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]);

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  companyCode: z.string().trim().min(2, "Company code must be at least 2 characters.").max(20),
  address: z.string().trim().max(300).optional().default(""),
  contactEmail: z.email("Enter a valid email address."),
  contactPhone: z.string().trim().min(8, "Phone must be at least 8 digits.").max(20),
  adminName: z.string().trim().min(2, "Admin name must be at least 2 characters."),
  adminEmail: z.email("Enter a valid email address."),
  adminPassword: passwordSchema,
});

export const createDepartmentSchema = z.object({
  companyId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a company."),
  name: z.string().trim().min(2, "Department name must be at least 2 characters."),
});

export const createEmployeeSchema = z.object({
  companyId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a company."),
  departmentId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a department."),
  employeeCode: z.string().trim().min(2, "Employee code must be at least 2 characters.").max(40),
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.union([z.literal(""), z.email("Enter a valid email address.")]).optional().default(""),
  phone: z.string().trim().max(20).optional().default(""),
});

export const createGapSchema = z.object({
  companyId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a company."),
  employeeId: z.string().regex(/^[a-f\d]{24}$/i, "Choose an employee."),
  startedAt: z.string().min(1, "Enter when the gap started."),
  endedAt: z.string().min(1, "Enter when the gap ended."),
  reason: z.string().trim().max(300).optional().default(""),
});

export async function listCompanies(user: AuthUser, query: { page: number; limit: number; search?: string }) {
  if (user.role === ROLES.COMPANY_ADMIN) {
    const company = await Company.findById(requireCompanyId(user)).lean();
    return { items: company ? [serialize(company)] : [], meta: { page: 1, limit: 1, total: company ? 1 : 0, totalPages: 1 } };
  }
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "You cannot list companies.");
  const result = await paginate(Company, searchClause(["name", "companyCode", "contactEmail"], query.search), {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
  });
  return { items: result.items.map((item) => serialize(item)), meta: result.meta };
}

export async function createCompany(user: AuthUser, input: z.infer<typeof createCompanySchema>) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can create a company.");
  const company = await Company.create({
    name: input.name,
    companyCode: input.companyCode.toUpperCase(),
    address: input.address,
    contactEmail: input.contactEmail.toLowerCase(),
    contactPhone: input.contactPhone,
  });
  try {
    await User.create({
      companyId: company._id,
      name: input.adminName,
      email: input.adminEmail.toLowerCase(),
      phone: input.contactPhone,
      passwordHash: await hashPassword(input.adminPassword),
      role: ROLES.COMPANY_ADMIN,
    });
  } catch (error) {
    await Company.deleteOne({ _id: company._id });
    throw error;
  }
  await writeAudit({
    actorId: user.id,
    action: "COMPANY_CREATED",
    entityType: "Company",
    entityId: String(company._id),
    after: { name: company.name },
  });
  return serialize(company.toObject());
}

export async function updateCompanyStatus(user: AuthUser, id: string, status: string) {
  if (user.role !== ROLES.PLATFORM_ADMIN) throw new AppError(403, "FORBIDDEN", "Only a platform admin can change company status.");
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose a valid status.");
  const company = await Company.findById(id);
  if (!company) throw notFound("Company");
  company.status = parsed.data;
  await company.save();
  return serialize(company.toObject());
}

export async function listDepartments(user: AuthUser, query: { page: number; limit: number; search?: string; companyId?: string }) {
  const tenant = requireCompanyId(user, query.companyId);
  const result = await paginate(Department, { companyId: tenant, ...searchClause(["name"], query.search) }, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createDepartment(user: AuthUser, input: z.infer<typeof createDepartmentSchema>) {
  const tenant = requireCompanyId(user, input.companyId);
  const department = await Department.create({ companyId: tenant, name: input.name });
  return serialize(department.toObject());
}

export async function listEmployees(user: AuthUser, query: { page: number; limit: number; search?: string; companyId?: string }) {
  const tenant = requireCompanyId(user, query.companyId);
  const result = await paginate(Employee, { companyId: tenant, ...searchClause(["name", "employeeCode", "email", "phone", "tagIdentifier"], query.search) }, {
    page: query.page,
    limit: query.limit,
    sort: { name: 1 },
    populate: [{ path: "departmentId", select: "name" }],
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createEmployee(user: AuthUser, input: z.infer<typeof createEmployeeSchema>) {
  const tenant = requireCompanyId(user, input.companyId);
  const department = await Department.findOne({ _id: input.departmentId, companyId: tenant }).lean();
  if (!department) throw new AppError(400, "DEPARTMENT_REQUIRED", "Choose a department in this company.");
  const employee = await Employee.create({
    companyId: tenant,
    departmentId: department._id,
    employeeCode: input.employeeCode,
    name: input.name,
    email: input.email?.toLowerCase() || "",
    phone: input.phone,
  });
  return serialize(employee.toObject());
}

export async function updateEmployee(user: AuthUser, id: string, input: z.infer<typeof createEmployeeSchema>) {
  const tenant = requireCompanyId(user, input.companyId);
  const employee = await Employee.findOne({ _id: id, companyId: tenant });
  if (!employee) throw notFound("Employee");
  const department = await Department.findOne({ _id: input.departmentId, companyId: tenant }).lean();
  if (!department) throw new AppError(400, "DEPARTMENT_REQUIRED", "Choose a department in this company.");
  employee.departmentId = department._id;
  employee.employeeCode = input.employeeCode;
  employee.name = input.name;
  employee.email = input.email?.toLowerCase() || "";
  employee.phone = input.phone || "";
  await employee.save();
  return serialize(employee.toObject());
}

export async function deleteEmployee(user: AuthUser, id: string, companyId?: string) {
  const tenant = requireCompanyId(user, companyId);
  const employee = await Employee.findOne({ _id: id, companyId: tenant });
  if (!employee) throw notFound("Employee");
  if (employee.userId) await User.deleteOne({ _id: employee.userId });
  await AttendanceGap.deleteMany({ companyId: tenant, employeeId: employee._id });
  await employee.deleteOne();
  return { deleted: true };
}

export async function listGaps(user: AuthUser, query: { page: number; limit: number; search?: string; companyId?: string }) {
  const tenant = requireCompanyId(user, query.companyId);
  const filter: Record<string, unknown> = { companyId: tenant };
  if (query.search) {
    const pattern = escapeRegex(query.search);
    const people = await Employee.find({ companyId: tenant, name: { $regex: pattern, $options: "i" } }).select("_id");
    filter.$or = [
      { status: { $regex: pattern, $options: "i" } },
      { reason: { $regex: pattern, $options: "i" } },
      { employeeId: { $in: people.map((person) => person._id) } },
    ];
  }
  const result = await paginate(AttendanceGap, filter, {
    page: query.page,
    limit: query.limit,
    sort: { startedAt: -1 },
    populate: [{ path: "employeeId", select: "name employeeCode" }],
  });
  return { items: result.items.map((row) => serialize(row)), meta: result.meta };
}

export async function createGap(user: AuthUser, input: z.infer<typeof createGapSchema>) {
  const tenant = requireCompanyId(user, input.companyId);
  const employee = await Employee.findOne({ _id: input.employeeId, companyId: tenant }).lean();
  if (!employee) throw new AppError(400, "EMPLOYEE_REQUIRED", "Choose an employee in this company.");
  const startedAt = parseOfficeTime(input.startedAt);
  const endedAt = parseOfficeTime(input.endedAt);
  if (!startedAt || !endedAt || endedAt <= startedAt) {
    throw new AppError(400, "VALIDATION_ERROR", "The gap must end after it starts.");
  }
  const company = await Company.findById(tenant).lean();
  if (!company) throw notFound("Company");
  const gap = await AttendanceGap.create({
    companyId: tenant,
    employeeId: employee._id,
    startedAt,
    endedAt,
    reason: input.reason,
    source: "MANUAL",
    ...describeGap(policyFrom(company), startedAt, endedAt),
  });
  return serialize(gap.toObject());
}

export async function deleteGap(user: AuthUser, id: string, companyId?: string) {
  const tenant = requireCompanyId(user, companyId);
  const gap = await AttendanceGap.findOne({ _id: id, companyId: tenant });
  if (!gap) throw notFound("Gap");
  await gap.deleteOne();
  return { deleted: true };
}

export async function companySummary(user: AuthUser) {
  const tenant = requireCompanyId(user);
  const [departments, employees, openGaps] = await Promise.all([
    Department.countDocuments({ companyId: tenant }),
    Employee.countDocuments({ companyId: tenant, status: "ACTIVE" }),
    AttendanceGap.countDocuments({ companyId: tenant, status: "OPEN" }),
  ]);
  return { departments, employees, openGaps };
}
