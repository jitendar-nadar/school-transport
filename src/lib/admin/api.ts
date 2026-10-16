import { formatValidationMessage } from "@/lib/validation/messages";

type Scope = { role: string; schoolId: string | null };

let scope: Scope = { role: "", schoolId: null };

export function setApiScope(next: Scope) {
  scope = next;
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiResult<T> = { data: T; meta?: { page: number; limit: number; total: number; totalPages: number } };

async function refreshSession() {
  const response = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
  return response.ok;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; school?: boolean }): Promise<ApiResult<T>> {
  const url = new URL(path, window.location.origin);
  const includeSchool = init?.school !== false && scope.role === "PLATFORM_ADMIN" && scope.schoolId;
  if (includeSchool && !url.searchParams.has("schoolId")) {
    url.searchParams.set("schoolId", scope.schoolId as string);
  }

  let body = init?.body;
  if (includeSchool && body && typeof body === "object" && !Array.isArray(body)) {
    body = { schoolId: scope.schoolId, ...(body as Record<string, unknown>) };
  }

  const send = () =>
    fetch(url.pathname + url.search, {
      method: init?.method || "GET",
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

  let response = await send();
  if (response.status === 401 && !path.includes("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) response = await send();
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const loginUrl = new URL("/login", window.location.origin);
    window.location.assign(loginUrl.toString());
    throw new ApiError("Sign in to continue.");
  }
  if (!response.ok || payload.success === false) {
    const friendly = formatValidationMessage(payload.error?.details);
    throw new ApiError(friendly || payload.error?.message || "Something went wrong. Please try again.");
  }
  return payload as ApiResult<T>;
}
