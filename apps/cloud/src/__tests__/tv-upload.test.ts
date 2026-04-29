/**
 * Unit tests for tv-upload module.
 *
 * This is the most critical and fragile code path in the system:
 * WebSocket handshake -> d2d negotiation -> TCP binary upload -> image_added confirmation.
 *
 * Concurrent uploads to the same TV crash the art mode service, so the per-TV
 * mutex is essential. These tests verify:
 * - Upload mutex serializes per TV, allows parallel across TVs
 * - 30-second timeout resolves with error
 * - WebSocket error handling
 * - TCP socket error handling (with art mode crash warning)
 * - Full successful upload flow end-to-end
 * - selectAndActivate sends select_image + set_artmode_status
 *
 * IMPORTANT: uploadToTv chains via `previous.then(() => doUpload(...))`,
 * so the WebSocket constructor runs on the next microtask, not synchronously.
 * We must flush microtasks (via `flush()`) after calling uploadToTv before
 * accessing the mock instance array.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Types ---

type EventHandler = (...args: any[]) => void;

interface MockWsInstance {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _handlers: Map<string, EventHandler[]>;
  _emit: (event: string, ...args: any[]) => void;
}

interface MockSocketInstance {
  connect: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _handlers: Map<string, EventHandler[]>;
  _emit: (event: string, ...args: any[]) => void;
}

// vi.hoisted runs before vi.mock but within the same transformed scope,
// so the returned values are accessible inside vi.mock factories.
const { wsArr, socketArr, createWs, createSocket } = vi.hoisted(() => {
  const wsArr: any[] = [];
  const socketArr: any[] = [];

  function createWs() {
    const handlers = new Map();
    const instance = {
      on: vi.fn((event: string, handler: any) => {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(handler);
      }),
      send: vi.fn(),
      close: vi.fn(),
      _handlers: handlers,
      _emit(event: string, ...args: any[]) {
        const fns = handlers.get(event) || [];
        for (const fn of fns) fn(...args);
      },
    };
    wsArr.push(instance);
    return instance;
  }

  function createSocket() {
    const handlers = new Map();
    const instance = {
      connect: vi.fn((_port: number, _ip: string, cb?: () => void) => {
        if (cb) cb();
      }),
      write: vi.fn((_data: any, cb?: () => void) => {
        if (cb) setTimeout(cb, 0);
      }),
      end: vi.fn(() => {
        setTimeout(() => instance._emit("close"), 0);
      }),
      on: vi.fn((event: string, handler: any) => {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(handler);
      }),
      _handlers: handlers,
      _emit(event: string, ...args: any[]) {
        const fns = handlers.get(event) || [];
        for (const fn of fns) fn(...args);
      },
    };
    socketArr.push(instance);
    return instance;
  }

  return { wsArr, socketArr, createWs, createSocket };
});

vi.mock("ws", () => {
  function MockWebSocket() {
    return createWs();
  }
  return { default: MockWebSocket };
});

vi.mock("net", () => {
  function MockSocket() {
    return createSocket();
  }
  return { default: { Socket: MockSocket } };
});

// Silence logger output during tests
vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks are set up
import { uploadToTv, selectAndActivate } from "../tv-upload.js";

// --- Convenience accessors ---

function getWs(index: number): MockWsInstance {
  return wsArr[index] as MockWsInstance;
}

function getSocket(index: number): MockSocketInstance {
  return socketArr[index] as MockSocketInstance;
}

/**
 * Flush pending microtasks so that chained promises (like the upload mutex
 * `.then(() => doUpload(...))`) execute and create their WebSocket instances.
 */
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

// --- Helpers ---

/** Simulate the TV sending the ms.channel.connect message on a WS instance */
function sendConnect(ws: MockWsInstance, token?: string) {
  ws._emit(
    "message",
    JSON.stringify({
      event: "ms.channel.connect",
      data: token ? { token } : {},
    }),
  );
}

/** Simulate the TV sending a d2d ready_to_use message with connection info */
function sendReadyToUse(
  ws: MockWsInstance,
  port = 8001,
  key = "test-sec-key",
  ip = "192.168.1.100",
) {
  ws._emit(
    "message",
    JSON.stringify({
      event: "d2d_service_message",
      data: JSON.stringify({
        event: "ready_to_use",
        conn_info: JSON.stringify({ port: String(port), key, ip }),
      }),
    }),
  );
}

/** Simulate the TV sending a d2d image_added confirmation */
function sendImageAdded(ws: MockWsInstance, contentId = "MY_F0001") {
  ws._emit(
    "message",
    JSON.stringify({
      event: "d2d_service_message",
      data: JSON.stringify({
        event: "image_added",
        content_id: contentId,
      }),
    }),
  );
}

/** Simulate a d2d error event */
function sendD2dError(ws: MockWsInstance, errorCode = "UNKNOWN_ERROR") {
  ws._emit(
    "message",
    JSON.stringify({
      event: "d2d_service_message",
      data: JSON.stringify({
        event: "error",
        error_code: errorCode,
      }),
    }),
  );
}

class FakeSamsungTvHarness {
  constructor(private readonly ws: MockWsInstance) {}

  connect(token?: string) {
    sendConnect(this.ws, token);
  }

  readyToUse(port = 8001, key = "test-sec-key", ip = "192.168.1.100") {
    sendReadyToUse(this.ws, port, key, ip);
    return getSocket(socketArr.length - 1);
  }

  imageAdded(contentId = "MY_F0001") {
    sendImageAdded(this.ws, contentId);
  }

  error(errorCode = "UNKNOWN_ERROR") {
    sendD2dError(this.ws, errorCode);
  }
}

describe("tv-upload", () => {
  const testImage = Buffer.from("fake-jpg-data-for-testing");
  const testIp = "192.168.1.100";

  beforeEach(() => {
    wsArr.length = 0;
    socketArr.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // 1. Upload mutex
  // ----------------------------------------------------------------
  describe("upload mutex", () => {
    it("should serialize uploads to the same TV", async () => {
      vi.useFakeTimers();

      // Start two uploads to the same TV
      const p1 = uploadToTv(testIp, testImage, "tok1");
      const p2 = uploadToTv(testIp, testImage, "tok2");

      // Flush microtasks so doUpload runs (mutex chains via .then)
      await vi.advanceTimersByTimeAsync(0);

      // Only one WS should be created initially (the first upload)
      expect(wsArr.length).toBe(1);
      const ws1 = getWs(0);

      // Complete the first upload: connect -> send_image -> ready_to_use -> TCP -> image_added
      sendConnect(ws1);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws1);
      sendImageAdded(ws1);
      await vi.advanceTimersByTimeAsync(1500);

      const result1 = await p1;
      expect(result1.success).toBe(true);

      // Flush so second upload's doUpload runs
      await vi.advanceTimersByTimeAsync(0);

      // Now the second upload should start, creating a second WS
      expect(wsArr.length).toBe(2);
      const ws2 = getWs(1);

      sendConnect(ws2);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws2);
      sendImageAdded(ws2);
      await vi.advanceTimersByTimeAsync(1500);

      const result2 = await p2;
      expect(result2.success).toBe(true);

      vi.useRealTimers();
    });

    it("should allow parallel uploads to different TVs", async () => {
      vi.useFakeTimers();

      const p1 = uploadToTv("10.0.0.1", testImage, "tok1");
      const p2 = uploadToTv("10.0.0.2", testImage, "tok2");

      // Flush microtasks
      await vi.advanceTimersByTimeAsync(0);

      // Both TVs should get their own WS immediately
      expect(wsArr.length).toBe(2);

      // Complete both in parallel
      const ws1 = getWs(0);
      const ws2 = getWs(1);

      sendConnect(ws1);
      sendConnect(ws2);
      await vi.advanceTimersByTimeAsync(2000);

      sendReadyToUse(ws1, 8001, "key1", "10.0.0.1");
      sendReadyToUse(ws2, 8001, "key2", "10.0.0.2");

      sendImageAdded(ws1, "MY_F0001");
      sendImageAdded(ws2, "MY_F0002");
      await vi.advanceTimersByTimeAsync(1500);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r1.contentId).toBe("MY_F0001");
      expect(r2.contentId).toBe("MY_F0002");

      vi.useRealTimers();
    });

    it("should continue to next upload if previous upload fails", async () => {
      vi.useFakeTimers();

      const p1 = uploadToTv(testIp, testImage);
      const p2 = uploadToTv(testIp, testImage);

      await vi.advanceTimersByTimeAsync(0);

      // First WS created
      expect(wsArr.length).toBe(1);
      const ws1 = getWs(0);

      // Fail the first upload via WS error
      ws1._emit("error", new Error("Connection refused"));

      const result1 = await p1;
      expect(result1.success).toBe(false);

      // Flush so second upload starts
      await vi.advanceTimersByTimeAsync(0);

      // Second upload should now start
      expect(wsArr.length).toBe(2);
      const ws2 = getWs(1);

      sendConnect(ws2);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws2);
      sendImageAdded(ws2);
      await vi.advanceTimersByTimeAsync(1500);

      const result2 = await p2;
      expect(result2.success).toBe(true);

      vi.useRealTimers();
    });
  });

  // ----------------------------------------------------------------
  // 2. Upload timeout
  // ----------------------------------------------------------------
  describe("upload timeout", () => {
    it("should resolve with error after 30 seconds", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage, "tok");
      await vi.advanceTimersByTimeAsync(0);
      expect(wsArr.length).toBe(1);

      // Advance past the 30-second timeout
      await vi.advanceTimersByTimeAsync(30_000);

      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toBe("Upload timeout");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify cleanup: ws.close() should have been called
      expect(getWs(0).close).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should not trigger timeout if upload completes in time", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage, "tok");
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws);
      sendImageAdded(ws, "MY_F0099");
      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);
      expect(result.contentId).toBe("MY_F0099");

      // Advancing past the original timeout should not cause problems
      await vi.advanceTimersByTimeAsync(30_000);

      vi.useRealTimers();
    });
  });

  // ----------------------------------------------------------------
  // 3. WebSocket error handling
  // ----------------------------------------------------------------
  describe("WebSocket error handling", () => {
    it("should resolve with error on ws.on('error')", async () => {
      const p = uploadToTv(testIp, testImage, "tok");
      await flush();
      const ws = getWs(0);

      ws._emit("error", new Error("ECONNREFUSED"));

      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toBe("ECONNREFUSED");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle WS error with no message gracefully", async () => {
      const p = uploadToTv(testIp, testImage);
      await flush();
      const ws = getWs(0);

      const err = new Error();
      err.message = "";
      ws._emit("error", err);

      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toBe("");
    });

    it("should not timeout after WS error already resolved", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      ws._emit("error", new Error("connection reset"));
      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toBe("connection reset");

      // Advancing timer past timeout should be safe (no double-resolve)
      await vi.advanceTimersByTimeAsync(35_000);

      vi.useRealTimers();
    });
  });

  // ----------------------------------------------------------------
  // 4. TCP error handling
  // ----------------------------------------------------------------
  describe("TCP error handling", () => {
    it("should resolve with art mode crash warning on TCP socket error", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage, "tok");
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      // Drive the upload to the TCP phase
      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws);

      // A TCP socket should now exist
      expect(socketArr.length).toBe(1);
      const socket = getSocket(0);

      // Simulate TCP error
      socket._emit("error", new Error("EPIPE"));

      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toContain("TCP upload failed");
      expect(result.error).toContain("EPIPE");
      expect(result.error).toContain("Art mode service may need TV restart");

      // Verify WS was cleaned up
      expect(ws.close).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should connect to the correct port and IP from d2d conn_info", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);

      // Send ready_to_use with specific port/IP
      sendReadyToUse(ws, 9999, "my-key", "10.0.0.55");

      expect(socketArr.length).toBe(1);
      const socket = getSocket(0);
      expect(socket.connect).toHaveBeenCalledWith(
        9999,
        "10.0.0.55",
        expect.any(Function),
      );

      // Clean up by sending image_added
      sendImageAdded(ws);
      await vi.advanceTimersByTimeAsync(1500);
      await p;

      vi.useRealTimers();
    });

    it("fake TV harness should fail crash-class incomplete TCP close", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage, "tok");
      await vi.advanceTimersByTimeAsync(0);
      const tv = new FakeSamsungTvHarness(getWs(0));

      tv.connect();
      await vi.advanceTimersByTimeAsync(2000);
      const socket = tv.readyToUse();

      socket._emit("close");

      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toContain("TCP upload incomplete");
      expect(result.error).toContain("Art mode service may need TV restart");

      vi.useRealTimers();
    });

    it("fake TV harness should not succeed until image_added and TCP close both happen", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage, "tok");
      let settled = false;
      p.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      const tv = new FakeSamsungTvHarness(getWs(0));

      tv.connect();
      await vi.advanceTimersByTimeAsync(2000);
      tv.readyToUse();
      tv.imageAdded("MY_F_FAKE");

      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const result = await p;
      expect(result.success).toBe(true);
      expect(result.contentId).toBe("MY_F_FAKE");

      vi.useRealTimers();
    });
  });

  // ----------------------------------------------------------------
  // 5. Successful upload flow
  // ----------------------------------------------------------------
  describe("successful upload flow", () => {
    it("should complete full handshake -> d2d -> TCP -> image_added flow", async () => {
      vi.useFakeTimers();

      const imageData = Buffer.alloc(1024, 0xaa); // 1KB test image
      const p = uploadToTv(testIp, imageData, "my-token");
      await vi.advanceTimersByTimeAsync(0);

      expect(wsArr.length).toBe(1);
      const ws = getWs(0);

      // Step 1: TV sends connect event (with token)
      sendConnect(ws, "renewed-token");

      // Step 2: After 2s delay, client sends send_image request
      await vi.advanceTimersByTimeAsync(2000);
      expect(ws.send).toHaveBeenCalledTimes(1);

      const sentPayload = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sentPayload.method).toBe("ms.channel.emit");
      expect(sentPayload.params.event).toBe("art_app_request");
      expect(sentPayload.params.to).toBe("host");

      const innerData = JSON.parse(sentPayload.params.data);
      expect(innerData.request).toBe("send_image");
      expect(innerData.file_type).toBe("jpg");
      expect(innerData.file_size).toBe(1024);
      expect(innerData.matte_id).toBe("none");
      expect(innerData.portrait_matte_id).toBe("shadowbox_polar");
      expect(innerData.conn_info.d2d_mode).toBe("socket");

      // Step 3: TV responds with ready_to_use (d2d negotiation complete)
      sendReadyToUse(ws, 8001, "sec-key-123", testIp);

      // Step 4: Verify TCP socket connects and writes header + image data
      expect(socketArr.length).toBe(1);
      const socket = getSocket(0);
      expect(socket.connect).toHaveBeenCalledWith(
        8001,
        testIp,
        expect.any(Function),
      );

      // The connect callback fires immediately in our mock, so writes happen
      // write(lenBuf) + write(headerBuf) + write(imageData, cb)
      expect(socket.write).toHaveBeenCalledTimes(3);

      // First write: 4-byte length prefix (big-endian)
      const lenBuf = socket.write.mock.calls[0][0] as Buffer;
      expect(lenBuf.length).toBe(4);

      // Second write: JSON header
      const headerBuf = socket.write.mock.calls[1][0] as Buffer;
      const header = JSON.parse(headerBuf.toString("ascii"));
      expect(header.num).toBe(0);
      expect(header.total).toBe(1);
      expect(header.fileLength).toBe(1024);
      expect(header.fileName).toBe("frame_art.jpg");
      expect(header.fileType).toBe("jpg");
      expect(header.secKey).toBe("sec-key-123");

      // Third write: the actual image data
      const writtenImage = socket.write.mock.calls[2][0] as Buffer;
      expect(writtenImage.length).toBe(1024);
      expect(Buffer.compare(writtenImage, imageData)).toBe(0);

      // socket.end() should be called after the write callback fires
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.end).toHaveBeenCalled();

      // Step 5: TV sends image_added confirmation
      sendImageAdded(ws, "MY_F0042");

      // Step 6: After 1.5s TCP flush delay, upload resolves
      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);
      expect(result.contentId).toBe("MY_F0042");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // WS should be cleaned up
      expect(ws.close).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should handle conn_info as an object (not stringified)", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);

      // Send ready_to_use with conn_info as a direct object (not JSON string)
      ws._emit(
        "message",
        JSON.stringify({
          event: "d2d_service_message",
          data: JSON.stringify({
            event: "ready_to_use",
            conn_info: { port: "8001", key: "obj-key", ip: testIp },
          }),
        }),
      );

      expect(socketArr.length).toBe(1);
      expect(getSocket(0).connect).toHaveBeenCalledWith(
        8001,
        testIp,
        expect.any(Function),
      );

      sendImageAdded(ws, "MY_F0050");
      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);

      vi.useRealTimers();
    });

    it("should handle d2d data as object (not stringified)", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws);

      // Send image_added with data as an object instead of a string
      ws._emit(
        "message",
        JSON.stringify({
          event: "d2d_service_message",
          data: {
            event: "image_added",
            content_id: "MY_F0060",
          },
        }),
      );

      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);
      expect(result.contentId).toBe("MY_F0060");

      vi.useRealTimers();
    });

    it("should skip non-JSON messages without crashing", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      // Send garbage data -- should not throw
      ws._emit("message", "not-json-at-all");
      ws._emit("message", Buffer.from("{broken"));

      // Continue with valid flow
      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws);
      sendImageAdded(ws, "MY_F0070");
      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);

      vi.useRealTimers();
    });

    it("should handle Buffer messages (not just strings)", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      // Send connect as a Buffer instead of string
      ws._emit(
        "message",
        Buffer.from(
          JSON.stringify({
            event: "ms.channel.connect",
            data: {},
          }),
        ),
      );

      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws);
      sendImageAdded(ws, "MY_F0080");
      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);

      vi.useRealTimers();
    });

    it("should work without a token parameter", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);
      sendReadyToUse(ws);
      sendImageAdded(ws);
      await vi.advanceTimersByTimeAsync(1500);

      const result = await p;
      expect(result.success).toBe(true);

      vi.useRealTimers();
    });
  });

  // ----------------------------------------------------------------
  // 5b. Art mode error event
  // ----------------------------------------------------------------
  describe("d2d error event", () => {
    it("should resolve with art mode error on d2d error event", async () => {
      vi.useFakeTimers();

      const p = uploadToTv(testIp, testImage);
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(2000);

      sendD2dError(ws, "STORAGE_FULL");

      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toBe("Art mode error: STORAGE_FULL");

      // WS should be cleaned up
      expect(ws.close).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // ----------------------------------------------------------------
  // 6. selectAndActivate
  // ----------------------------------------------------------------
  describe("selectAndActivate", () => {
    it("should send select_image then set_artmode_status and resolve true", async () => {
      vi.useFakeTimers();

      const p = selectAndActivate(testIp, "MY_F0099", "tok");
      // selectAndActivate creates the WS synchronously (no mutex), but flush
      // to be safe with any internal promise chains.
      await vi.advanceTimersByTimeAsync(0);

      expect(wsArr.length).toBe(1);
      const ws = getWs(0);

      // TV sends connect
      sendConnect(ws);

      // After 1.5s: select_image
      await vi.advanceTimersByTimeAsync(1500);
      expect(ws.send).toHaveBeenCalledTimes(1);
      const selectPayload = JSON.parse(ws.send.mock.calls[0][0] as string);
      const selectData = JSON.parse(selectPayload.params.data);
      expect(selectData.request).toBe("select_image");
      expect(selectData.content_id).toBe("MY_F0099");

      // After 3s total: set_artmode_status
      await vi.advanceTimersByTimeAsync(1500);
      expect(ws.send).toHaveBeenCalledTimes(2);
      const artPayload = JSON.parse(ws.send.mock.calls[1][0] as string);
      const artData = JSON.parse(artPayload.params.data);
      expect(artData.request).toBe("set_artmode_status");
      expect(artData.value).toBe("on");

      // After 5s total: close and resolve
      await vi.advanceTimersByTimeAsync(2000);
      expect(ws.close).toHaveBeenCalled();

      const result = await p;
      expect(result).toBe(true);

      vi.useRealTimers();
    });

    it("should resolve false on WS error", async () => {
      const p = selectAndActivate(testIp, "MY_F0001");
      await flush();
      const ws = getWs(0);

      ws._emit("error", new Error("ECONNREFUSED"));

      const result = await p;
      expect(result).toBe(false);
    });

    it("should resolve false on 10-second timeout (no connect)", async () => {
      vi.useFakeTimers();

      const p = selectAndActivate(testIp, "MY_F0001");
      await vi.advanceTimersByTimeAsync(0);
      expect(wsArr.length).toBe(1);

      // Advance past the 10-second outer timeout
      await vi.advanceTimersByTimeAsync(10_000);

      const result = await p;
      expect(result).toBe(false);

      vi.useRealTimers();
    });

    it("should work without a token parameter", async () => {
      vi.useFakeTimers();

      const p = selectAndActivate(testIp, "MY_F0001");
      await vi.advanceTimersByTimeAsync(0);
      const ws = getWs(0);

      sendConnect(ws);
      await vi.advanceTimersByTimeAsync(5000);

      const result = await p;
      expect(result).toBe(true);

      vi.useRealTimers();
    });
  });
});
