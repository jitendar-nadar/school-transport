import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieMaxAge,
  refreshCookieMaxAge,
} from "@/lib/auth/tokens";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function attachAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  response.cookies.set(ACCESS_COOKIE, accessToken, cookieOptions(accessCookieMaxAge()));
  response.cookies.set(REFRESH_COOKIE, refreshToken, cookieOptions(refreshCookieMaxAge()));
  return response;
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
  return response;
}
