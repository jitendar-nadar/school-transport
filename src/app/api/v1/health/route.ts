import { publicHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { firebaseReady } from "@/lib/firebase/admin";
import { School } from "@/models/school";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicHandler(async () => {
  await School.estimatedDocumentCount();
  return ok({ status: "ok", firebase: firebaseReady() && !process.env.FIREBASE_DATABASE_URL ? false : firebaseReady() });
});
