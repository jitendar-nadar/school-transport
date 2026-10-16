import { NextResponse } from "next/server";
import type { PageMeta } from "@/types/domain";

export function ok(data: unknown, meta?: PageMeta, status = 200) {
  return NextResponse.json(
    meta ? { success: true, data, meta } : { success: true, data },
    { status },
  );
}

export function created(data: unknown) {
  return ok(data, undefined, 201);
}
