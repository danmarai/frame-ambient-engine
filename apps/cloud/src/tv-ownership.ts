import { getRawDb } from "./db.js";

export interface OwnedTv {
  id: string;
  userId: string;
  tvIp: string;
  name: string | null;
}

export interface TvLookup {
  tvId?: string;
  tvIp?: string;
}

export function getOwnedTv(
  userId: string,
  lookup: TvLookup,
): OwnedTv | null {
  const db = getRawDb();

  let row:
    | {
        id: string;
        user_id: string;
        tv_ip: string | null;
        name: string | null;
      }
    | undefined;

  if (lookup.tvId) {
    row = db
      .prepare("SELECT id, user_id, tv_ip, name FROM tv_devices WHERE id = ?")
      .get(lookup.tvId) as typeof row;
  } else if (lookup.tvIp) {
    row = db
      .prepare(
        "SELECT id, user_id, tv_ip, name FROM tv_devices WHERE tv_ip = ? AND user_id = ?",
      )
      .get(lookup.tvIp, userId) as typeof row;
  }

  if (!row || row.user_id !== userId || !row.tv_ip) return null;
  if (lookup.tvIp && row.tv_ip !== lookup.tvIp) return null;

  return {
    id: row.id,
    userId: row.user_id,
    tvIp: row.tv_ip,
    name: row.name,
  };
}

export function isTvOwnedByAnotherUser(
  tvId: string,
  userId: string,
): boolean {
  const row = getRawDb()
    .prepare("SELECT user_id FROM tv_devices WHERE id = ?")
    .get(tvId) as { user_id: string | null } | undefined;
  return !!row?.user_id && row.user_id !== userId;
}
