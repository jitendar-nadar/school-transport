import { publicHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { assertCron } from "@/modules/devices/device.service";
import { processDueJobs, scanStaleTrips } from "@/modules/notifications/notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicHandler(async ({ req }) => {
  assertCron(req.headers.get("x-cron-secret"));
  const jobs = await processDueJobs(50);
  const stale = await scanStaleTrips();
  return ok({ jobs, stale });
}, { limit: 30 });
