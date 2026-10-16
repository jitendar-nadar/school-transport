import { after } from "next/server";
import { apiHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { locationSchema, submitLocation } from "@/modules/trips/trip.service";
import { ROLES } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler(async ({ req, user, params }) => {
  const result = await submitLocation(user, params.id, await readJson(req, locationSchema));
  if (result.followUp) after(() => result.followUp?.());
  return ok({ throttled: result.throttled, firebaseSynced: result.firebaseSynced });
}, { roles: [ROLES.DRIVER, ROLES.ATTENDANT], limit: 240 });
