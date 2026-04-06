/**
 * TV pairing via direct WebSocket connection.
 *
 * The samsung-frame-connect library has a hardcoded 10-second timeout
 * that can't be configured (constructor bug). For first-time pairing,
 * we need a longer timeout since the user must physically press
 * "Allow" on their TV remote.
 *
 * This module handles pairing directly via WebSocket, bypassing
 * the library's timeout limitation.
 */

export interface PairResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Initiate WebSocket pairing with a Samsung Frame TV.
 *
 * Opens a WebSocket on port 8002 and waits for the user to press
 * "Allow" on the TV popup. Returns the auth token on success.
 *
 * @param ip - TV IP address
 * @param timeoutMs - How long to wait for user to press Allow (default 60s)
 */
export async function pairWithTv(
  ip: string,
  timeoutMs = 60000,
): Promise<PairResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebSocket } = require(
    /* webpackIgnore: true */ "ws",
  ) as typeof import("ws");

  return new Promise((resolve) => {
    const name = Buffer.from("FrameEngine").toString("base64");
    const url = `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${name}&token=None`;

    let settled = false;
    const ws = new WebSocket(url, { rejectUnauthorized: false });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({
        success: false,
        error:
          "Timed out waiting for TV approval. Make sure you press Allow on the TV remote.",
      });
    }, timeoutMs);

    ws.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        error: `WebSocket error: ${err.message}`,
      });
    });

    ws.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        error: "TV closed the connection before pairing completed.",
      });
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "ms.channel.connect" && msg.data?.token) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws.close(1000);
          resolve({
            success: true,
            token: msg.data.token,
          });
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });
}

/**
 * Save the pairing token to the locations samsung-frame-connect expects.
 * This allows the library to find the token on subsequent connections.
 */
export async function saveToken(token: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = tmpdir();
  const channels = ["samsung.remote.control", "com.samsung.art-app"];

  await Promise.all(
    channels.map((ch) =>
      writeFile(join(dir, `.samsung-frame-connect-${ch}-token`), token),
    ),
  );
}
