import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = {
  sub: string;
  username: string;
  role: "TRUSTEE" | "BENEFICIARY";
};

function getSecretKey() {
  const s = process.env.SESSION_SECRET || "trust-flow-dev-secret-key-min-32chars!";
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const sub = payload.sub;
    const username = payload.username as string;
    const role = payload.role as SessionPayload["role"];
    if (!sub || !username || (role !== "TRUSTEE" && role !== "BENEFICIARY")) {
      return null;
    }
    return { sub, username, role };
  } catch {
    return null;
  }
}
