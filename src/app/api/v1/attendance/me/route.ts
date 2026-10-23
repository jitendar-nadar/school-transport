import { z } from "zod";
import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { myAttendance } from "@/modules/companies/attendance.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, z.object({ date: z.string().optional() }));
  return ok(await myAttendance(user, query.date));
}, { roles: [ROLES.EMPLOYEE] });
