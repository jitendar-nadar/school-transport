import { readFileSync } from "fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

let ready = false;
let initError = "";

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline) as Record<string, string>;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return null;
}

export function firebaseReady() {
  if (ready) return true;
  if (initError) return false;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const serviceAccount = (() => {
    try {
      return loadServiceAccount();
    } catch (error) {
      initError = error instanceof Error ? error.message : "Invalid Firebase credentials.";
      console.error(initError);
      return null;
    }
  })();
  if (!databaseURL || !serviceAccount) {
    initError = "Firebase Admin is not configured.";
    return false;
  }
  const existing = getApps()[0];
  const app: App =
    existing ||
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL,
    });
  void app;
  ready = true;
  return true;
}

export function realtimeDb() {
  if (!firebaseReady()) return null;
  return getDatabase();
}

export function messaging() {
  if (!firebaseReady()) return null;
  return getMessaging();
}

export function firebaseAuth() {
  if (!firebaseReady()) return null;
  return getAuth();
}

export type LiveTripLocation = {
  schoolId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speedKmh: number | null;
  accuracyMeters: number;
  updatedAt: number;
  status: "ACTIVE";
};

export async function writeActiveTrip(tripId: string, location: LiveTripLocation) {
  const db = realtimeDb();
  if (!db) return false;
  await db.ref(`activeTrips/${tripId}`).set(location);
  return true;
}

export async function readActiveTrip(tripId: string): Promise<LiveTripLocation | null> {
  const db = realtimeDb();
  if (!db) return null;
  const snapshot = await db.ref(`activeTrips/${tripId}`).get();
  return (snapshot.val() as LiveTripLocation | null) ?? null;
}

export async function grantTripAccess(tripId: string, uid: string) {
  const db = realtimeDb();
  if (!db) return false;
  await db.ref(`tripAccess/${tripId}/${uid}`).set(true);
  return true;
}

export async function revokeTrip(tripId: string) {
  const db = realtimeDb();
  if (!db) return false;
  await Promise.all([
    db.ref(`activeTrips/${tripId}`).remove(),
    db.ref(`tripAccess/${tripId}`).remove(),
  ]);
  return true;
}

export async function createParentCustomToken(userId: string, claims: Record<string, string>) {
  const auth = firebaseAuth();
  if (!auth) return null;
  return auth.createCustomToken(`parent_${userId}`, claims);
}
