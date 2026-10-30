import { publicHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { assertTrackerKey, ingestSchema, ingestTrackerPoints } from "@/modules/transport/tracker-ingest.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  assertTrackerKey(req.headers.get("x-tracker-key"));
  const input = await readJson(req, ingestSchema);
  return ok(await ingestTrackerPoints(input));
}, { limit: 600 });
