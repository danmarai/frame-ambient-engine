/**
 * Cloud Sync — communicates with the EC2 cloud server.
 * Handles auth, scene fetching, and pending upload coordination.
 */

const CLOUD_URL = "https://frameapp.dmarantz.com";

interface Scene {
  sceneId: string;
  prompt: string;
  imageUrl: string;
  durationMs: number;
  provider: string;
  createdAt: string;
}

interface PendingUpload {
  sceneId: string;
  imageUrl: string;
  tvIp: string;
  tvId: string;
}

let cloudWs: WebSocket | null = null;
let onPendingUpload: ((upload: PendingUpload) => void) | null = null;

/** Set callback for when cloud requests an upload */
export function setUploadHandler(handler: (upload: PendingUpload) => void) {
  onPendingUpload = handler;
}

/** Connect to cloud WebSocket for real-time updates */
export function connectToCloud(sessionId: string) {
  if (cloudWs) {
    try {
      cloudWs.close();
    } catch {}
  }

  cloudWs = new WebSocket(`${CLOUD_URL.replace("https", "wss")}/ws/phone`);

  cloudWs.onopen = () => {
    console.log("[Cloud] Connected");
    cloudWs?.send(JSON.stringify({ type: "auth", sessionId }));
  };

  cloudWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "upload_request" && onPendingUpload) {
        onPendingUpload(msg);
      }
    } catch {}
  };

  cloudWs.onclose = () => {
    console.log("[Cloud] Disconnected, reconnecting in 5s...");
    setTimeout(() => connectToCloud(sessionId), 5000);
  };

  cloudWs.onerror = () => {
    console.log("[Cloud] Error");
  };
}

/** Sign in with Google ID token */
export async function signIn(
  idToken: string,
): Promise<{ sessionId: string; user: any } | null> {
  try {
    const res = await fetch(`${CLOUD_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Get all generated scenes */
export async function getScenes(): Promise<Scene[]> {
  try {
    const res = await fetch(`${CLOUD_URL}/api/scenes`);
    return await res.json();
  } catch {
    return [];
  }
}

/** Get registered devices */
export async function getDevices(): Promise<any[]> {
  try {
    const res = await fetch(`${CLOUD_URL}/api/devices`);
    return await res.json();
  } catch {
    return [];
  }
}

/** Report upload result to cloud */
export async function reportUploadResult(
  sceneId: string,
  tvId: string,
  contentId: string,
  success: boolean,
) {
  try {
    await fetch(`${CLOUD_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tvId,
        contentId: sceneId,
        rating: success ? "uploaded" : "failed",
      }),
    });
  } catch {}
}

/** Scan a TV by IP */
export async function scanTv(tvIp: string) {
  try {
    const res = await fetch(`${CLOUD_URL}/api/pair-by-ip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tvIp }),
    });
    return await res.json();
  } catch {
    return null;
  }
}
