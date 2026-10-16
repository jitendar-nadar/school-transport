import { setDefaultResultOrder } from "node:dns";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors/app-error";
import "@/models/register";

setDefaultResultOrder("ipv4first");

const globalCache = globalThis as unknown as {
  mongooseConn?: Promise<typeof mongoose>;
};

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new AppError(500, "CONFIG_ERROR", "MONGODB_URI is not configured.");
  }
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!globalCache.mongooseConn) {
    mongoose.set("strictQuery", true);
    globalCache.mongooseConn = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || "school-transport",
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
      retryWrites: true,
      family: 4,
    });
  }
  try {
    await globalCache.mongooseConn;
  } catch (error) {
    globalCache.mongooseConn = undefined;
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("bad auth") || message.includes("Authentication failed")) {
      throw new AppError(500, "DATABASE_AUTH", "MongoDB Atlas rejected the database username or password.");
    }
    if (message.includes("ENOTFOUND") || message.includes("querySrv")) {
      throw new AppError(500, "DATABASE_HOST", "The Atlas cluster host could not be found. Check MONGODB_URI.");
    }
    if (/timed out|Server selection|whitelist/i.test(message)) {
      throw new AppError(
        500,
        "DATABASE_NETWORK",
        "Could not reach MongoDB Atlas. In Atlas, open Network Access and allow 0.0.0.0/0 so this deployment can connect.",
      );
    }
    throw new AppError(500, "DATABASE_ERROR", "Could not connect to MongoDB Atlas.");
  }
  return mongoose;
}
