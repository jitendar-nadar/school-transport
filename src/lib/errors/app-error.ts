import { NextResponse } from "next/server";

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(entity: string) {
  return new AppError(404, "NOT_FOUND", `${entity} was not found.`);
}

export function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status },
    );
  }

  if (isDuplicateKey(error)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CONFLICT",
          message: "This record conflicts with an existing unique value.",
        },
      },
      { status: 409 },
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "CastError"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_ID", message: "One of the ids is invalid." },
      },
      { status: 400 },
    );
  }

  console.error(error);
  const hint = error instanceof Error ? `${error.name}: ${error.message}` : "";
  const safeHint = hint.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "mongodb://redacted").slice(0, 240);
  const network = /timed out|Server selection|whitelist|ReplicaSetNoPrimary|MongoServerSelection|MongoNetwork|ECONNREFUSED|ETIMEDOUT|not connected/i.test(safeHint);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: network ? "DATABASE_NETWORK" : "INTERNAL_ERROR",
        message: network
          ? "Could not reach MongoDB Atlas. In Atlas, open Network Access and allow 0.0.0.0/0 so this deployment can connect."
          : safeHint
            ? `Something went wrong. ${safeHint}`
            : "Something went wrong. Please try again.",
      },
    },
    { status: 500 },
  );
}
