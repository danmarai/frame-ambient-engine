import type {
  TvPublisher,
  TvDeviceInfo,
  TvPublishResult,
  ProviderHealth,
} from "@frame/core";
import http from "node:http";

/**
 * Publish images to Samsung Frame TV via DLNA AVTransport.
 *
 * This approach works reliably on 2020+ Frame TVs where the
 * WebSocket art-mode `send_image` command returns error -11.
 * It hosts the image on a temporary local HTTP server, then
 * tells the TV's DLNA MediaRenderer to display it.
 */
export class DlnaFramePublisher implements TvPublisher {
  name = "dlna-frame";

  /** Local IP for the image server — TV must be able to reach this. */
  private localIp: string;

  constructor(localIp?: string) {
    this.localIp = localIp || "0.0.0.0";
  }

  async testConnectivity(ip: string): Promise<TvDeviceInfo | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://${ip}:8001/api/v2/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      const device = data?.device;
      if (!device) return null;

      return {
        name: device.name || "Samsung TV",
        model: device.modelName || "Unknown",
        isFrameTV: !!(
          device.FrameTVSupport === "true" || device.FrameTVSupport === true
        ),
        isArtMode: false,
        firmwareVersion: device.firmwareVersion || device.FirmwareVersion,
      };
    } catch {
      return null;
    }
  }

  async upload(
    ip: string,
    imageData: Buffer,
    _token?: string,
  ): Promise<TvPublishResult> {
    const start = Date.now();
    let server: http.Server | null = null;

    try {
      // Detect our local IP that can reach the TV
      const localIp =
        this.localIp !== "0.0.0.0" ? this.localIp : await detectLocalIp();

      // Start temporary HTTP server to serve the image
      const port = 19876 + Math.floor(Math.random() * 100);
      server = http.createServer((_req, res) => {
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": imageData.length,
        });
        res.end(imageData);
      });

      await new Promise<void>((resolve, reject) => {
        server!.listen(port, "0.0.0.0", () => resolve());
        server!.on("error", reject);
      });

      const imageUrl = `http://${localIp}:${port}/art.jpg`;
      console.log(`[dlna] Serving image at ${imageUrl}`);

      // Send DLNA SetAVTransportURI
      await dlnaSetUri(ip, imageUrl);
      console.log(`[dlna] SetAVTransportURI OK`);

      // Send DLNA Play (non-fatal — some TVs return 500 for image Play but display anyway)
      try {
        await dlnaPlay(ip);
        console.log(`[dlna] Play OK`);
      } catch (playErr) {
        console.log(
          `[dlna] Play failed (non-fatal, image may already be displayed):`,
          playErr instanceof Error ? playErr.message : playErr,
        );
      }

      // Wait for TV to fetch the image (it requests it multiple times)
      await new Promise((r) => setTimeout(r, 5000));

      return {
        success: true,
        contentId: `dlna-${Date.now()}`,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "DLNA upload failed";
      return {
        success: false,
        error: message,
        durationMs: Date.now() - start,
      };
    } finally {
      if (server) {
        // Keep server alive briefly for any remaining TV requests, then close
        setTimeout(() => server?.close(), 10000);
      }
    }
  }

  async setActive(
    _ip: string,
    _contentId: string,
    _token?: string,
  ): Promise<boolean> {
    // DLNA images are immediately displayed — no separate setActive needed
    return true;
  }

  async getArtModeStatus(_ip: string, _token?: string): Promise<boolean> {
    // Can't determine art mode via DLNA
    return false;
  }

  async setArtMode(
    _ip: string,
    _enabled: boolean,
    _token?: string,
  ): Promise<boolean> {
    return false;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "unknown",
      lastChecked: new Date().toISOString(),
      message: "DLNA publisher — use testConnectivity() to check TV status",
    };
  }
}

/** Detect our local IP by checking which interface can reach the TV's subnet. */
async function detectLocalIp(): Promise<string> {
  const os = await import("node:os");
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "127.0.0.1";
}

/** DLNA SOAP request helper. */
function dlnaSoap(ip: string, action: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const soapEnvelope =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      "<s:Body>" +
      body +
      "</s:Body></s:Envelope>";

    const req = http.request(
      {
        hostname: ip,
        port: 9197,
        path: "/upnp/control/AVTransport1",
        method: "POST",
        headers: {
          "Content-Type": 'text/xml; charset="utf-8"',
          SOAPAction: `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
          "Content-Length": Buffer.byteLength(soapEnvelope),
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 200) resolve(data);
          else
            reject(new Error(`DLNA ${action} failed: HTTP ${res.statusCode}`));
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`DLNA ${action} timed out`));
    });
    req.write(soapEnvelope);
    req.end();
  });
}

function dlnaSetUri(ip: string, imageUrl: string): Promise<string> {
  const metadata =
    "&lt;DIDL-Lite xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot; " +
    "xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; " +
    "xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot;&gt;" +
    "&lt;item id=&quot;0&quot; parentID=&quot;-1&quot; restricted=&quot;false&quot;&gt;" +
    "&lt;dc:title&gt;Frame Art&lt;/dc:title&gt;" +
    "&lt;upnp:class&gt;object.item.imageItem.photo&lt;/upnp:class&gt;" +
    `&lt;res protocolInfo=&quot;http-get:*:image/jpeg:*&quot;&gt;${imageUrl}&lt;/res&gt;` +
    "&lt;/item&gt;&lt;/DIDL-Lite&gt;";

  return dlnaSoap(
    ip,
    "SetAVTransportURI",
    '<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' +
      "<InstanceID>0</InstanceID>" +
      `<CurrentURI>${imageUrl}</CurrentURI>` +
      `<CurrentURIMetaData>${metadata}</CurrentURIMetaData>` +
      "</u:SetAVTransportURI>",
  );
}

function dlnaPlay(ip: string): Promise<string> {
  return dlnaSoap(
    ip,
    "Play",
    '<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' +
      "<InstanceID>0</InstanceID>" +
      "<Speed>1</Speed>" +
      "</u:Play>",
  );
}
