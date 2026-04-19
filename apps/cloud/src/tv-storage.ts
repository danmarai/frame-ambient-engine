/** TV art storage management — tracks uploads, handles cleanup, manages capacity */
import WebSocket from "ws";
import { logger } from "./logger.js";

// Configurable cache size per TV (adjust based on TV flash size)
const DEFAULT_CACHE_SIZE = 20;
const CACHE_SIZES: Record<string, number> = {
  "8": 20, // 8GB flash TVs (2020 models)
  "16": 40, // 16GB flash (newer models, if they exist)
};

interface TvArtState {
  tvIp: string;
  flashSizeGB: number;
  maxImages: number;
  ourImages: string[]; // content_ids we uploaded, oldest first
  lastSyncAt: string;
}

const tvStates = new Map<string, TvArtState>();

function getCacheSize(flashGB: number): number {
  return CACHE_SIZES[String(flashGB)] || DEFAULT_CACHE_SIZE;
}

/** Connect to art-app channel and run a callback */
function withArtConnection(
  tvIp: string,
  fn: (ws: WebSocket) => void,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${Buffer.from("FrameCloud").toString("base64")}`,
      { rejectUnauthorized: false },
    );

    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve();
    }, timeoutMs);

    ws.on("message", (d: Buffer | string) => {
      const msg = JSON.parse(Buffer.isBuffer(d) ? d.toString() : d);
      if (msg.event === "ms.channel.connect") {
        fn(ws);
      }
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/** Get device info and initialize state for a TV */
export async function initTvState(tvIp: string): Promise<TvArtState> {
  const state: TvArtState = {
    tvIp,
    flashSizeGB: 8,
    maxImages: DEFAULT_CACHE_SIZE,
    ourImages: [],
    lastSyncAt: new Date().toISOString(),
  };

  await withArtConnection(tvIp, (ws) => {
    // Get device info for flash size
    ws.send(
      JSON.stringify({
        method: "ms.channel.emit",
        params: {
          event: "art_app_request",
          to: "host",
          data: JSON.stringify({ request: "get_device_info", id: "init" }),
        },
      }),
    );

    // Get content list to know what's already there
    setTimeout(() => {
      ws.send(
        JSON.stringify({
          method: "ms.channel.emit",
          params: {
            event: "art_app_request",
            to: "host",
            data: JSON.stringify({
              request: "get_content_list",
              id: "cl",
              category: "MY-C0004",
            }),
          },
        }),
      );
    }, 1500);

    ws.on("message", (d: Buffer | string) => {
      const msg = JSON.parse(Buffer.isBuffer(d) ? d.toString() : d);
      if (msg.event === "d2d_service_message") {
        const inner =
          typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;

        if (inner.event === "get_device_info") {
          state.flashSizeGB = parseInt(inner.tv_flash_size) || 8;
          state.maxImages = getCacheSize(state.flashSizeGB);
          logger.info(
            {
              tvIp,
              flashSizeGB: state.flashSizeGB,
              maxImages: state.maxImages,
            },
            "TV storage info",
          );
        }

        if (inner.event === "content_list") {
          try {
            const list = JSON.parse(inner.content_list);
            // Track our uploads (MY_F* prefix, mobile type)
            state.ourImages = list
              .filter(
                (item: any) =>
                  item.content_id.startsWith("MY_F") &&
                  item.content_type === "mobile",
              )
              .map((item: any) => item.content_id);
            logger.info(
              { tvIp, count: state.ourImages.length },
              "Custom images on TV",
            );
          } catch {}
          ws.close();
        }
      }
    });
  });

  tvStates.set(tvIp, state);
  return state;
}

/** Make room for N new images by deleting oldest */
export async function makeRoom(tvIp: string, count: number): Promise<number> {
  let state = tvStates.get(tvIp);
  if (!state) state = await initTvState(tvIp);

  const spaceNeeded = state.ourImages.length + count - state.maxImages;
  if (spaceNeeded <= 0) {
    logger.info(
      { tvIp, count, current: state.ourImages.length, max: state.maxImages },
      "Room available on TV",
    );
    return 0;
  }

  const toDelete = state.ourImages.slice(0, spaceNeeded);
  logger.info(
    { tvIp, deleteCount: toDelete.length },
    "Deleting oldest images to make room",
  );

  let deleted = 0;
  await withArtConnection(
    tvIp,
    (ws) => {
      let idx = 0;

      function deleteNext() {
        if (idx >= toDelete.length) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            method: "ms.channel.emit",
            params: {
              event: "art_app_request",
              to: "host",
              data: JSON.stringify({
                request: "delete_image",
                id: "del" + idx,
                content_id: toDelete[idx],
              }),
            },
          }),
        );
        idx++;
      }

      ws.on("message", (d: Buffer | string) => {
        const msg = JSON.parse(Buffer.isBuffer(d) ? d.toString() : d);
        if (msg.event === "d2d_service_message") {
          const inner =
            typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
          if (inner.event === "image_deleted") {
            deleted++;
            // Remove from state
            const cidx = state!.ourImages.indexOf(inner.content_id);
            if (cidx >= 0) state!.ourImages.splice(cidx, 1);
            deleteNext();
          } else if (inner.event === "error") {
            logger.error(
              { idx: idx - 1, error: inner.error_code },
              "Delete failed for image",
            );
            deleteNext();
          }
        }
      });

      deleteNext();
    },
    30000,
  );

  logger.info(
    { tvIp, deleted, current: state.ourImages.length, max: state.maxImages },
    "Images deleted from TV",
  );
  return deleted;
}

/** Record that we uploaded an image */
export function recordUpload(tvIp: string, contentId: string): void {
  const state = tvStates.get(tvIp);
  if (state) {
    state.ourImages.push(contentId);
    state.lastSyncAt = new Date().toISOString();
  }
}

/** Handle error -11 (storage full) — delete half our images and retry */
export async function handleStorageFull(tvIp: string): Promise<void> {
  let state = tvStates.get(tvIp);
  if (!state) state = await initTvState(tvIp);

  // Reduce max images for this TV since we hit the limit
  state.maxImages = Math.max(5, Math.floor(state.maxImages * 0.7));
  logger.info(
    { tvIp, maxImages: state.maxImages },
    "TV storage full, reducing max",
  );

  // Delete oldest half by making room for enough new images that half get removed.
  // makeRoom calculates: spaceNeeded = ourImages.length + count - maxImages
  // We want spaceNeeded = ceil(ourImages.length / 2)
  // So: count = ceil(ourImages.length / 2) + maxImages - ourImages.length
  const targetDeletions = Math.ceil(state.ourImages.length / 2);
  const roomCount = Math.max(
    1,
    targetDeletions + state.maxImages - state.ourImages.length,
  );
  await makeRoom(tvIp, roomCount);
}

/** Get current state for a TV */
export function getTvState(tvIp: string): TvArtState | undefined {
  return tvStates.get(tvIp);
}
