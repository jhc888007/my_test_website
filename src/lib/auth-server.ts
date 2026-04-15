import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { signSession, verifySessionToken, type SessionPayload } from "./session";

const COOKIE = "trust_session";

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE)?.value;
  if (!raw) return null;
  return verifySessionToken(raw);
});

export async function loginWithPassword(
  username: string,
  password: string
): Promise<{ ok: false; error: string } | { ok: true }> {
  const db = getDb();
  const row = db
    .prepare("SELECT id, username, password, role FROM users WHERE username = ?")
    .get(username.trim()) as
    | {
        id: number;
        username: string;
        password: string;
        role: SessionPayload["role"];
      }
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password)) {
    return { ok: false, error: "用户名或密码错误" };
  }
  const token = await signSession({
    sub: String(row.id),
    username: row.username,
    role: row.role,
  });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true };
}

export async function logoutSession() {
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  cookieStore.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 0,
  });
}
