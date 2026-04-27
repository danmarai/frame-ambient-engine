import type { IncomingMessage } from "http";
import type { UserSession } from "./auth.js";
import { getSession } from "./auth.js";

export interface PhoneWsAuth {
  sessionId: string;
  user: UserSession;
}

export function getWsBearerToken(request: IncomingMessage): string | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.substring(7);

  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  return url.searchParams.get("token");
}

export function authenticatePhoneWs(
  request: IncomingMessage,
): PhoneWsAuth | null {
  const token = getWsBearerToken(request);
  if (!token) return null;

  const session = getSession(token);
  if (!session) return null;

  return { sessionId: token, user: session };
}

export function shouldRequirePhoneWsAuth(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.REQUIRE_PHONE_WS_AUTH === "true"
  );
}
