import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function secret() {
  const s = process.env.SESSION_SECRET || "trust-flow-dev-secret-key-min-32chars!";
  return new TextEncoder().encode(s);
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set("trust_session", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("trust_session")?.value;

  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    if (token) {
      try {
        await jwtVerify(token, secret());
        return NextResponse.redirect(new URL("/", request.url));
      } catch {
        const res = NextResponse.next();
        clearSessionCookie(res);
        return res;
      }
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    role = payload.role as string;
  } catch {
    const res = NextResponse.redirect(new URL("/login", request.url));
    clearSessionCookie(res);
    return res;
  }

  if (pathname.startsWith("/trustee") && role !== "TRUSTEE") {
    return NextResponse.redirect(new URL("/beneficiary", request.url));
  }
  if (pathname.startsWith("/beneficiary") && role !== "BENEFICIARY") {
    return NextResponse.redirect(new URL("/trustee", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
