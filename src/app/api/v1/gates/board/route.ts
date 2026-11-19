import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQuerySchema } from "@/lib/validation/common";
import { gateBoard } from "@/modules/gates/gate.service";
import { ROLES } from "@/types/domain";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roles = [ROLES.PLATFORM_ADMIN, ROLES.SCHOOL_ADMIN];

const querySchema = listQuerySchema.extend({
  day: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  return ok(await gateBoard(user, query));
}, { roles });
