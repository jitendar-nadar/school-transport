import { z } from "zod";
import { apiHandler, readQuery } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { objectIdSchema, optionalId } from "@/lib/validation/common";
import { playback, tripReport } from "@/modules/transport/tracker-ingest.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const blankToUndefined = (value: unknown) => (value === "" || value == null ? undefined : value);

const querySchema = z
  .object({
    fleetId: optionalId,
    tripId: z.preprocess(blankToUndefined, objectIdSchema.optional()),
    truckId: z.preprocess(blankToUndefined, objectIdSchema.optional()),
    date: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").optional()),
  })
  .superRefine((value, ctx) => {
    if (value.tripId) return;
    if (!value.truckId || !value.date) {
      ctx.addIssue({ code: "custom", message: "Choose a trip, or a truck and a date.", path: ["truckId"] });
    }
  });

export const GET = apiHandler(async ({ req, user }) => {
  const query = readQuery(req, querySchema);
  if (query.tripId) {
    const report = await tripReport(user, query.tripId, query.fleetId);
    return ok({
      tripId: report.trip.id,
      truckId: report.truckId,
      registrationNumber: report.registrationNumber,
      distanceKm: report.distanceKm,
      idleMinutes: report.idleMinutes,
      stoppages: report.stoppageCount,
      points: report.points,
    });
  }
  return ok(await playback(user, query.fleetId, query.truckId as string, query.date as string));
}, { roles: [ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN] });
