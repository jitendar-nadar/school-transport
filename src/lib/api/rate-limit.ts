import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors/app-error";

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();

export function clientKey(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}

export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [entry, bucket] of buckets) {
      if (bucket.reset < now) buckets.delete(entry);
    }
  }

  const current = buckets.get(key);
  if (!current || current.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }

  current.count += 1;
  if (current.count > limit) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.");
  }
}
