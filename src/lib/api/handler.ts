import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { requireRoles, requireUser } from "@/lib/auth/guard";
import { clientKey, rateLimit } from "@/lib/api/rate-limit";
import { AppError, toErrorResponse } from "@/lib/errors/app-error";
import { formatValidationMessage } from "@/lib/validation/messages";
import { connectDb } from "@/lib/mongodb/connection";
import type { AuthUser, Role } from "@/types/domain";

type RouteContext = { params?: Promise<Record<string, string>> };

type HandlerContext = {
  req: NextRequest;
  user: AuthUser;
  params: Record<string, string>;
};

export function apiHandler(
  handler: (ctx: HandlerContext) => Promise<NextResponse>,
  options?: { roles?: Role[]; limit?: number },
) {
  return async function handle(req: NextRequest, routeContext?: RouteContext) {
    try {
      rateLimit(`${clientKey(req)}:${req.nextUrl.pathname}`, options?.limit ?? 120);
      await connectDb();
      const user = await requireUser(req);
      if (options?.roles) requireRoles(user, options.roles);
      const params = routeContext?.params ? await routeContext.params : {};
      return await handler({ req, user, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export function publicHandler(
  handler: (ctx: { req: NextRequest; params: Record<string, string> }) => Promise<NextResponse>,
  options?: { limit?: number },
) {
  return async function handle(req: NextRequest, routeContext?: RouteContext) {
    try {
      rateLimit(`${clientKey(req)}:${req.nextUrl.pathname}`, options?.limit ?? 60);
      await connectDb();
      const params = routeContext?.params ? await routeContext.params : {};
      return await handler({ req, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T>) {
  const text = await req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    throw new AppError(400, "VALIDATION_ERROR", formatValidationMessage(details) || "Please check the form and try again.", details);
  }
  return parsed.data;
}

export function readQuery<T>(req: NextRequest, schema: ZodType<T>) {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    throw new AppError(400, "VALIDATION_ERROR", formatValidationMessage(details) || "Please check the filters and try again.", details);
  }
  return parsed.data;
}
