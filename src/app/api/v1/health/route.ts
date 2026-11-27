import { publicHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { firebaseReady } from "@/lib/firebase/admin";
import { School } from "@/models/school";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicHandler(async () => {
  await School.estimatedDocumentCount();
  // firebase: push is ready. liveDatabase: the optional Realtime Database is also set up.
  return ok({
    status: "ok",
    firebase: firebaseReady(),
    liveDatabase: firebaseReady() && Boolean(process.env.FIREBASE_DATABASE_URL),
  });
});
