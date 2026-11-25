import { publicHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { assertSchoolBusKey, ingestSchoolBusPoint, schoolBusIngestSchema } from "@/modules/trips/school-bus-ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  assertSchoolBusKey(req.headers.get("x-school-bus-key") || req.headers.get("x-tracker-key"));
  return ok(await ingestSchoolBusPoint(await readJson(req, schoolBusIngestSchema)));
}, { limit: 600 });
