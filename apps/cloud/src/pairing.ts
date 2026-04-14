/** Pairing code management — generates, validates, and expires codes */

interface PairingSession {
  code: string;
  tvId: string;
  tvIp: string;
  createdAt: number;
  pairedAt?: number;
  phoneSessionId?: string;
}

const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const sessions = new Map<string, PairingSession>();

/** Generate a 6-character code: 3 uppercase letters + 3 digits */
function generateCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O (ambiguous)
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < 3; i++)
    code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 3; i++)
    code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

export function createPairingCode(tvId: string, tvIp: string): string {
  // Remove any existing code for this TV
  for (const [code, session] of sessions) {
    if (session.tvId === tvId) sessions.delete(code);
  }

  let code: string;
  do {
    code = generateCode();
  } while (sessions.has(code));

  sessions.set(code, { code, tvId, tvIp, createdAt: Date.now() });
  return code;
}

export function validateCode(code: string): PairingSession | null {
  const session = sessions.get(code.toUpperCase());
  if (!session) return null;
  if (Date.now() - session.createdAt > EXPIRY_MS) {
    sessions.delete(code);
    return null;
  }
  return session;
}

export function claimCode(
  code: string,
  phoneSessionId: string,
): PairingSession | null {
  const session = validateCode(code);
  if (!session) return null;
  if (session.pairedAt) return null; // already claimed
  session.pairedAt = Date.now();
  session.phoneSessionId = phoneSessionId;
  return session;
}

export function getSessionByTvId(tvId: string): PairingSession | undefined {
  for (const session of sessions.values()) {
    if (session.tvId === tvId && session.pairedAt) return session;
  }
  return undefined;
}

export function getSessionByPhone(
  phoneSessionId: string,
): PairingSession | undefined {
  for (const session of sessions.values()) {
    if (session.phoneSessionId === phoneSessionId) return session;
  }
  return undefined;
}

/** Clean up expired sessions */
export function cleanExpired(): void {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.createdAt > EXPIRY_MS * 24) {
      // keep paired sessions 24h
      sessions.delete(code);
    }
  }
}
