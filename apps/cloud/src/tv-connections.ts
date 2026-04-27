/** Manages WebSocket connections from TV apps and phone clients */
import type { WebSocket } from "ws";

interface TvConnection {
  ws: WebSocket;
  tvId: string;
  tvIp: string;
  pairingCode: string;
  connectedAt: number;
}

interface PhoneConnection {
  ws: WebSocket;
  sessionId: string;
  authSessionId?: string;
  userId?: string;
  tvId?: string;
  connectedAt: number;
}

const tvConnections = new Map<string, TvConnection>();
const phoneConnections = new Map<string, PhoneConnection>();

export function addTvConnection(
  tvId: string,
  tvIp: string,
  pairingCode: string,
  ws: WebSocket,
): void {
  // Close existing connection for this TV
  const existing = tvConnections.get(tvId);
  if (existing) {
    try {
      existing.ws.close();
    } catch {}
  }
  tvConnections.set(tvId, {
    ws,
    tvId,
    tvIp,
    pairingCode,
    connectedAt: Date.now(),
  });
}

export function removeTvConnection(tvId: string): void {
  tvConnections.delete(tvId);
}

export function getTvConnection(tvId: string): TvConnection | undefined {
  return tvConnections.get(tvId);
}

export function addPhoneConnection(
  sessionId: string,
  ws: WebSocket,
  authSessionId?: string,
  userId?: string,
): void {
  phoneConnections.set(sessionId, {
    ws,
    sessionId,
    authSessionId,
    userId,
    connectedAt: Date.now(),
  });
}

export function removePhoneConnection(sessionId: string): void {
  phoneConnections.delete(sessionId);
}

export function getPhoneConnection(
  sessionId: string,
): PhoneConnection | undefined {
  return phoneConnections.get(sessionId);
}

/** Send a message to a connected TV */
export function sendToTv(
  tvId: string,
  message: Record<string, unknown>,
): boolean {
  const conn = tvConnections.get(tvId);
  if (!conn || conn.ws.readyState !== 1) return false;
  conn.ws.send(JSON.stringify(message));
  return true;
}

/** Send a message to a connected phone */
export function sendToPhone(
  sessionId: string,
  message: Record<string, unknown>,
): boolean {
  const conn = phoneConnections.get(sessionId);
  if (!conn || conn.ws.readyState !== 1) return false;
  conn.ws.send(JSON.stringify(message));
  return true;
}

/** Get the TV IP for a paired TV */
export function getTvIp(tvId: string): string | undefined {
  return tvConnections.get(tvId)?.tvIp;
}
