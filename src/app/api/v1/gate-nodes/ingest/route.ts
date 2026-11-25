import { publicHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { assertSchoolGateKey, gateIngestSchema, ingestGateNodeReading } from "@/modules/gates/gate.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  assertSchoolGateKey(req.headers.get("x-gate-node-key") || req.headers.get("x-gateway-key"));
  const input = await readJson(req, gateIngestSchema);
  return ok(await ingestGateNodeReading(input));
}, { limit: 600 });
