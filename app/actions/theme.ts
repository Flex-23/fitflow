"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

/** Persist the chosen colour scheme; read by the root layout on every request. */
export async function setTheme(theme: string) {
  if (!isTheme(theme)) return;
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
