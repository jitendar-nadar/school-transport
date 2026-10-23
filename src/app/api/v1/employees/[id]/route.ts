import { apiHandler, readJson, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { employeeAccessSchema, updateEmployeeAccess } from "@/modules/companies/attendance.service";
import { createEmployeeSchema, deleteEmployee, updateEmployee } from "@/modules/companies/company.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN];

export const PATCH = apiHandler(async ({ req, user, params }) => {
  if (req.nextUrl.searchParams.get("section") === "profile") {
    return ok(await updateEmployee(user, params.id, await readJson(req, createEmployeeSchema)));
  }
  const input = await readJson(req, employeeAccessSchema);
  return ok(await updateEmployeeAccess(user, params.id, input));
}, { roles });

export const DELETE = apiHandler(async ({ req, user, params }) => {
  const query = readQuery(req, listQuerySchema);
  return ok(await deleteEmployee(user, params.id, query.companyId));
}, { roles });
