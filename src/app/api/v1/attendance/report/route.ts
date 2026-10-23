import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { optionalId } from "@/lib/validation/common";
import { monthlyReport, reportCsv } from "@/modules/companies/attendance.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  companyId: optionalId,
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-10."),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  const report = await monthlyReport(user, query.companyId, query.month);
  if (query.format === "csv") {
    return new NextResponse(reportCsv(report.month, report.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-${report.month}.csv"`,
      },
    });
  }
  return ok(report);
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN] });
