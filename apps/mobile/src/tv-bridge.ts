/**
 * TV Bridge — handles the d2d TCP upload from the phone to the TV.
 * This is the core reason the native app exists: browsers can't do TCP sockets.
 */
import TcpSocket from "react-native-tcp-socket";

const CLOUD_URL = "https://frameapp.dmarantz.com";

interface UploadResult {
  success: boolean;
  contentId?: string;
  error?: string;
  durationMs: number;
}

interface D2dConnInfo {
  ip: string;
  port: string;
  key: string;
  secured?: boolean;
}

/**
 * Upload an image to the TV via WebSocket + d2d TCP.
 *
 * Flow:
 * 1. Connect to TV's WebSocket (wss://TV:8002)
 * 2. Send send_image request
 * 3. Get ready_to_use with d2d port/key
 * 4. Open TCP socket to d2d port
 * 5. Send header + image data
 * 6. Wait for image_added confirmation
 */
export async function uploadToTv(
  tvIp: string,
  imageData: Buffer | Uint8Array,
): Promise<UploadResult> {
  const start = Date.now();
  const requestId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    // Step 1: Connect to TV WebSocket
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${btoa("FrameArtMobile")}`,
    );

    const timeout = setTimeout(() => {
      ws.close();
      resolve({
        success: false,
        error: "Upload timeout (30s)",
        durationMs: Date.now() - start,
      });
    }, 30000);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.event === "ms.channel.ready") {
          // Step 2: Send send_image request
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
                    .replace(/-/g, ":"),
                  matte_id: "none",
                  portrait_matte_id: "shadowbox_polar",
                  file_size: imageData.length,
                }),
              },
            }),
          );
        }

        if (msg.event === "d2d_service_message") {
          const inner =
            typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;

          if (inner.event === "ready_to_use" && inner.conn_info) {
            // Step 3: Parse d2d connection info
            const connInfo: D2dConnInfo =
              typeof inner.conn_info === "string"
                ? JSON.parse(inner.conn_info)
                : inner.conn_info;

            console.log(`[Bridge] d2d ready: ${connInfo.ip}:${connInfo.port}`);

            // Step 4: Open TCP socket and upload
            doTcpUpload(connInfo, imageData);
          }

          if (inner.event === "image_added") {
            // Step 6: Success!
            console.log(`[Bridge] Image added: ${inner.content_id}`);
            // Wait for TCP to fully flush
            setTimeout(() => {
              clearTimeout(timeout);
              ws.close();
              resolve({
                success: true,
                contentId: inner.content_id,
                durationMs: Date.now() - start,
              });
            }, 1500);
          }

          if (inner.event === "error") {
            clearTimeout(timeout);
            ws.close();
            resolve({
              success: false,
              error: `Art mode error: ${inner.error_code}`,
              durationMs: Date.now() - start,
            });
          }
        }
      } catch (e) {
        console.error("[Bridge] Parse error:", e);
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: `WebSocket error: ${error.message || "Connection failed"}`,
        durationMs: Date.now() - start,
      });
    };
  });
}

/**
 * Step 5: TCP upload via react-native-tcp-socket
 */
function doTcpUpload(
  connInfo: D2dConnInfo,
  imageData: Buffer | Uint8Array,
): void {
  const header = JSON.stringify({
    num: 0,
    total: 1,
    fileLength: imageData.length,
    fileName: "frame_art.jpg",
    fileType: "jpg",
    secKey: connInfo.key,
    version: "0.0.1",
  });

  const headerBuf = Buffer.from(header, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(headerBuf.length, 0);

  const client = TcpSocket.createConnection(
    {
      host: connInfo.ip,
      port: parseInt(connInfo.port),
    },
    () => {
      console.log(`[Bridge] TCP connected to ${connInfo.ip}:${connInfo.port}`);
      // Send header length
      client.write(lenBuf);
      // Send header
      client.write(headerBuf);
      // Send entire image and flush
      client.write(Buffer.from(imageData), () => {
        console.log(
          `[Bridge] TCP: ${imageData.length} bytes sent, flushing...`,
        );
        client.end();
      });
    },
  );

  client.on("error", (error) => {
    console.error(`[Bridge] TCP error: ${error.message}`);
  });

  client.on("close", () => {
    console.log("[Bridge] TCP closed");
  });
}

/**
 * Select an image and activate art mode on the TV.
 */
export async function selectAndActivate(
  tvIp: string,
  contentId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${btoa("FrameArtMobile")}`,
    );

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.event === "ms.channel.ready") {
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
        }, 500);
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
        }, 2500);
        setTimeout(() => {
          ws.close();
          resolve(true);
        }, 4000);
      }
    };

    ws.onerror = () => resolve(false);
    setTimeout(() => {
      ws.close();
      resolve(false);
    }, 10000);
  });
}

/**
 * Check if the TV's art mode service is responsive.
 */
export async function checkTvHealth(
  tvIp: string,
): Promise<{ alive: boolean; artMode: string | null }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(
      `wss://${tvIp}:8002/api/v2/channels/com.samsung.art-app?name=${btoa("FrameArtMobile")}`,
    );

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.event === "ms.channel.ready") {
        ws.send(
          JSON.stringify({
            method: "ms.channel.emit",
            params: {
              event: "art_app_request",
              to: "host",
              data: JSON.stringify({
                request: "get_artmode_status",
                id: "health",
              }),
            },
          }),
        );
      }
      if (msg.event === "d2d_service_message") {
        const inner = JSON.parse(msg.data);
        if (inner.event === "artmode_status") {
          ws.close();
          resolve({ alive: true, artMode: inner.value });
        }
      }
    };

    ws.onerror = () => resolve({ alive: false, artMode: null });
    setTimeout(() => {
      ws.close();
      resolve({ alive: false, artMode: null });
    }, 8000);
  });
}

/**
 * Download an image from a URL and return as Buffer.
 */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
