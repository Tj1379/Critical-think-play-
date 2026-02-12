"use server";

import { cookies } from "next/headers";

export async function setSessionCookies(accessToken: string, refreshToken: string) {
  const store = cookies();
  store.set("sb-access-token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  store.set("sb-refresh-token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearSessionCookies() {
  const store = cookies();
  store.delete("sb-access-token");
  store.delete("sb-refresh-token");
}
