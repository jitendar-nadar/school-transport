import { publicHandler, readJson } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { assertGatewayKey, gatewayIngestSchema, ingestGatewayDetection } from "@/modules/companies/attendance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  assertGatewayKey(req.headers.get("x-gateway-key"));
  const input = await readJson(req, gatewayIngestSchema);
  return ok(await ingestGatewayDetection(input));
}, { limit: 600 });
