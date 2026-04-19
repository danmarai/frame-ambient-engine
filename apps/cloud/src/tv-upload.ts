/**
 * Direct TV upload using WebSocket + d2d TCP protocol.
 *
 * CRITICAL: Concurrent uploads to the same TV will crash the art mode service,
 * requiring a TV restart. The upload mutex ensures only one upload runs per TV
 * at a time — additional requests queue behind the active one.
 */
import WebSocket from "ws";
import net from "net";
import crypto from "crypto";

interface UploadResult {
  success: boolean;
  contentId?: string;
  error?: string;
  durationMs: number;
}

/**
 * Per-TV upload mutex. Maps tvIp -> the promise chain for that TV.
 * Each new upload is chained after the previous one completes,
 * ensuring serial execution per TV while allowing parallel uploads
 * to different TVs.
 */
const uploadMutex = new Map<string, Promise<UploadResult>>();

/**
 * Upload an image to a TV, serialized per tvIp to prevent concurrent uploads.
 * If another upload is in progress to the same TV, this call waits for it to finish.
 */
export function uploadToTv(
  tvIp: string,
  imageData: Buffer,
  token?: string,
): Promise<UploadResult> {
  // Chain this upload after any in-progress upload to the same TV
  const previous = uploadMutex.get(tvIp) || Promise.resolve({} as UploadResult);
  const current = previous.then(() => doUpload(tvIp, imageData, token));
  uploadMutex.set(tvIp, current);

  // Clean up the mutex entry when done (only if we're still the latest)
  current.finally(() => {
    if (uploadMutex.get(tvIp) === current) {
      uploadMutex.delete(tvIp);
    }
  });

  return current;
}

/** Internal: perform the actual WebSocket + TCP upload. Do not call directly. */
function doUpload(
  tvIp: string,
  imageData: Buffer,
  token?: string,
): Promise<UploadResult> {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${Buffer.from("FrameCloud").toString("base64")}&token=${token || ""}`,
      { rejectUnauthorized: false },
    );

    const cleanup = () => {
      try {
        ws.close();
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        success: false,
        error: "Upload timeout",
        durationMs: Date.now() - start,
      });
    }, 30000);

    ws.on("message", (rawData: Buffer | string) => {
      const str = Buffer.isBuffer(rawData) ? rawData.toString("utf8") : rawData;
      let msg: any;
      try {
        msg = JSON.parse(str);
      } catch {
        return;
      }

      if (msg.event === "ms.channel.connect") {
        // Save token for future use
        if (msg.data?.token) {
          console.log(`TV token: ${msg.data.token}`);
        }

        setTimeout(() => {
          ws.send(
            JSON.stringify({
              method: "ms.channel.emit",
              params: {
                event: "art_app_request",
                to: "host",
                data: JSON.stringify({
                  request: "send_image",
                  file_type: "jpg",
                  request_id: requestId,
                  id: requestId,
                  conn_info: {
                    d2d_mode: "socket",
                    connection_id: Math.floor(Math.random() * 4294967296),
                    id: requestId,
                  },
                  image_date: new Date()
                    .toISOString()
                    .replace("T", " ")
                    .split(".")[0]
                    .replaceAll("-", ":"),
                  matte_id: "none",
                  portrait_matte_id: "shadowbox_polar",
                  file_size: imageData.length,
                }),
              },
            }),
          );
        }, 2000);
      }

      if (msg.event === "d2d_service_message") {
        const inner =
          typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;

        if (inner.event === "ready_to_use" && inner.conn_info) {
          const connInfo =
            typeof inner.conn_info === "string"
              ? JSON.parse(inner.conn_info)
              : inner.conn_info;
          const port = parseInt(connInfo.port);
          const key = connInfo.key;
          const ip = connInfo.ip;

          const header = JSON.stringify({
            num: 0,
            total: 1,
            fileLength: imageData.length,
            fileName: "frame_art.jpg",
            fileType: "jpg",
            secKey: key,
            version: "0.0.1",
          });

          const socket = new net.Socket();
          socket.connect(port, ip, () => {
            const headerBuf = Buffer.from(header, "ascii");
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32BE(headerBuf.length, 0);
            socket.write(lenBuf);
            socket.write(headerBuf);

            // Write entire image buffer at once and flush
            socket.write(imageData, () => {
              console.log(
                `TCP: all ${imageData.length} bytes written, flushing...`,
              );
              // End the socket to ensure all data is flushed to the TV
              socket.end();
            });
          });
          socket.on("close", () => {
            console.log("TCP: socket closed (data flushed)");
          });
          socket.on("error", (e) => {
            console.error("TCP error:", e.message);
            // CRITICAL: if TCP fails, the art mode service will crash
            // We can't prevent this, but we should log it prominently
            console.error(
              "WARNING: Incomplete upload may have crashed the art mode service. TV restart may be needed.",
            );
            clearTimeout(timeout);
            cleanup();
            resolve({
              success: false,
              error: `TCP upload failed: ${e.message}. Art mode service may need TV restart.`,
              durationMs: Date.now() - start,
            });
          });
        }

        if (inner.event === "image_added") {
          // Wait a moment for TCP to fully flush before declaring success
          console.log(
            `image_added: ${inner.content_id}, waiting for TCP flush...`,
          );
          setTimeout(() => {
            clearTimeout(timeout);
            cleanup();
            resolve({
              success: true,
              contentId: inner.content_id,
              durationMs: Date.now() - start,
            });
          }, 1500);
        }

        if (inner.event === "error") {
          clearTimeout(timeout);
          cleanup();
          resolve({
            success: false,
            error: `Art mode error: ${inner.error_code}`,
            durationMs: Date.now() - start,
          });
        }
      }
    });

    ws.on("error", (e) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: e.message,
        durationMs: Date.now() - start,
      });
    });
  });
}

export async function selectAndActivate(
  tvIp: string,
  contentId: string,
  token?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${Buffer.from("FrameCloud").toString("base64")}&token=${token || ""}`,
      { rejectUnauthorized: false },
    );

    ws.on("message", (rawData: Buffer | string) => {
      const str = Buffer.isBuffer(rawData) ? rawData.toString("utf8") : rawData;
      let msg: any;
      try {
        msg = JSON.parse(str);
      } catch {
        return;
      }

      if (msg.event === "ms.channel.connect") {
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              method: "ms.channel.emit",
              params: {
                event: "art_app_request",
                to: "host",
                data: JSON.stringify({
                  request: "select_image",
                  content_id: contentId,
                  id: "sel",
                }),
              },
            }),
          );
        }, 1500);

        setTimeout(() => {
          ws.send(
            JSON.stringify({
              method: "ms.channel.emit",
              params: {
                event: "art_app_request",
                to: "host",
                data: JSON.stringify({
                  request: "set_artmode_status",
                  value: "on",
                  id: "art",
                }),
              },
            }),
          );
        }, 3000);

        setTimeout(() => {
          ws.close();
          resolve(true);
        }, 5000);
      }
    });

    ws.on("error", () => resolve(false));
    setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve(false);
    }, 10000);
  });
}
