/** Pairing code management — generates, validates, and expires codes */
import { getRawDb } from "./db.js";

export interface PairingSession {
  code: string;
  tvId: string;
  tvIp: string;
  userId?: string;
  createdAt: number;
  pairedAt?: number;
  phoneSessionId?: string;
}

const EXPIRY_MS = 10 * 60 * 1000;
const CLAIMED_RETENTION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_CODES_PER_TV_WINDOW = 5;

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

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function fromIso(value: string | null | undefined): number | undefined {
  return value ? new Date(value).getTime() : undefined;
}

function normalizeCode(code: string): string {
  return code.toUpperCase();
}

type PairingRow = {
  code: string;
  tv_id: string;
  tv_ip: string;
  user_id: string | null;
  phone_session_id: string | null;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
};

function rowToSession(row: PairingRow): PairingSession {
  return {
    code: row.code,
    tvId: row.tv_id,
    tvIp: row.tv_ip,
    userId: row.user_id ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    pairedAt: fromIso(row.claimed_at),
    phoneSessionId: row.phone_session_id ?? undefined,
  };
}

function getCodeRow(code: string): PairingRow | undefined {
  return getRawDb()
    .prepare("SELECT * FROM pairing_codes WHERE code = ?")
    .get(normalizeCode(code)) as PairingRow | undefined;
}

export function createPairingCode(tvId: string, tvIp: string): string {
  const db = getRawDb();
  const now = Date.now();
  const nowIso = toIso(now);
  const rateLimitSince = toIso(now - RATE_LIMIT_WINDOW_MS);
  const recentCount = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM pairing_codes WHERE tv_id = ? AND created_at > ?",
      )
      .get(tvId, rateLimitSince) as { count: number }
  ).count;

  if (recentCount >= MAX_CODES_PER_TV_WINDOW) {
    throw new Error("Too many pairing codes requested; wait before trying again");
  }

  db.prepare(
    "UPDATE pairing_codes SET expires_at = ? WHERE tv_id = ? AND claimed_at IS NULL",
  ).run(nowIso, tvId);

  let code: string;
  do {
    code = generateCode();
  } while (getCodeRow(code));

  db.prepare(
    `INSERT INTO pairing_codes
       (code, tv_id, tv_ip, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(code, tvId, tvIp, nowIso, toIso(now + EXPIRY_MS));

  return code;
}

export function validateCode(code: string): PairingSession | null {
  const row = getCodeRow(code);
  if (!row) return null;

  if (row.expires_at <= toIso(Date.now())) {
    return null;
  }

  return rowToSession(row);
}

export function claimCode(
  code: string,
  phoneSessionId: string,
  userId?: string,
): PairingSession | null {
  const session = validateCode(code);
  if (!session) return null;
  if (session.pairedAt) return null; // already claimed

  const nowIso = toIso(Date.now());
  const result = getRawDb()
    .prepare(
      `UPDATE pairing_codes
       SET claimed_at = ?, phone_session_id = ?, user_id = COALESCE(?, user_id)
       WHERE code = ? AND claimed_at IS NULL AND expires_at > ?`,
    )
    .run(nowIso, phoneSessionId, userId ?? null, normalizeCode(code), nowIso);

  if (result.changes !== 1) return null;
  const row = getCodeRow(code);
  return row ? rowToSession(row) : null;
}

export function getSessionByTvId(tvId: string): PairingSession | undefined {
  const row = getRawDb()
    .prepare(
      `SELECT * FROM pairing_codes
       WHERE tv_id = ? AND claimed_at IS NOT NULL
       ORDER BY claimed_at DESC
       LIMIT 1`,
    )
    .get(tvId) as PairingRow | undefined;
  return row ? rowToSession(row) : undefined;
}

export function getSessionByPhone(
  phoneSessionId: string,
): PairingSession | undefined {
  const row = getRawDb()
    .prepare(
      `SELECT * FROM pairing_codes
       WHERE phone_session_id = ? AND claimed_at IS NOT NULL
       ORDER BY claimed_at DESC
       LIMIT 1`,
    )
    .get(phoneSessionId) as PairingRow | undefined;
  return row ? rowToSession(row) : undefined;
}

/** Clean up expired sessions */
export function cleanExpired(): void {
  const now = Date.now();
  getRawDb()
    .prepare(
      `DELETE FROM pairing_codes
       WHERE (claimed_at IS NULL AND expires_at <= ?)
          OR (claimed_at IS NOT NULL AND claimed_at <= ?)`,
    )
    .run(toIso(now), toIso(now - CLAIMED_RETENTION_MS));
}
