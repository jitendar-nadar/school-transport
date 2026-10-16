import { setDefaultResultOrder } from "node:dns";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors/app-error";
import "@/models/register";

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Some serverless runtimes do not allow changing the DNS order.
}

const globalCache = globalThis as unknown as {
  mongooseConn?: Promise<typeof mongoose>;
  mongooseSettled?: boolean;
};

function mongoUri() {
  let uri = process.env.MONGODB_URI?.trim() ?? "";
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
}

export async function connectDb() {
  const uri = mongoUri();
  if (!uri) {
    throw new AppError(500, "CONFIG_ERROR", "MONGODB_URI is not configured.");
  }
  if (mongoose.connection.readyState === 1) return mongoose;
  if (globalCache.mongooseSettled && mongoose.connection.readyState !== 2) {
    globalCache.mongooseConn = undefined;
    globalCache.mongooseSettled = false;
  }
  if (!globalCache.mongooseConn) {
    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", false);
    if (process.env.VERCEL) mongoose.set("autoIndex", false);
    globalCache.mongooseSettled = false;
    globalCache.mongooseConn = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB?.trim() || "school-transport",
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      retryWrites: true,
      family: 4,
    }).finally(() => {
      globalCache.mongooseSettled = true;
    });
  }
  try {
    await globalCache.mongooseConn;
  } catch (error) {
    globalCache.mongooseConn = undefined;
    globalCache.mongooseSettled = false;
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("bad auth") || message.includes("Authentication failed")) {
      throw new AppError(500, "DATABASE_AUTH", "MongoDB Atlas rejected the database username or password.");
    }
    if (message.includes("ENOTFOUND") || message.includes("querySrv")) {
      throw new AppError(500, "DATABASE_HOST", "The Atlas cluster host could not be found. Check MONGODB_URI.");
    }
    if (/timed out|Server selection|whitelist|ReplicaSetNoPrimary|MongoServerSelection|MongoNetwork|ECONNREFUSED|ETIMEDOUT|alert number 80/i.test(message)) {
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
