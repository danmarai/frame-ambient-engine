/**
 * Curateur Background Service (Tizen 6.0+)
 *
 * This service runs in the background on newer Samsung TVs and handles:
 * 1. Maintaining persistent WebSocket connection to cloud
 * 2. Receiving art push notifications
 * 3. Selecting images via localhost art mode API
 *
 * NOTE: This does NOT work on Tizen 5.5 (2020 Frame TVs).
 * On those models, the foreground app + phone companion handles uploads.
 *
 * Requirements:
 * - Tizen 6.0+ (2021 Frame TV or newer)
 * - config.xml must include <tizen:service> element
 * - Service privileges: internet, alarm (for wake scheduling)
 */

/* global tizen */

var CLOUD_URL = "https://frameapp.dmarantz.com";
var CLOUD_WS = CLOUD_URL.replace(/^http/, "ws") + "/ws/tv";
var RECONNECT_DELAY = 10000;

var cloudWs = null;
var tvId = null;
var artWs = null;

// Generate persistent TV ID (stored in app data)
function getTvId() {
  try {
    var stored = tizen.preference.getValue("frameart_tv_id");
    if (stored) return stored;
  } catch (e) {}
  var id = "frame-tv-" + Math.random().toString(36).substring(2, 8);
  try {
    tizen.preference.setValue("frameart_tv_id", id);
  } catch (e) {}
  return id;
}

// Connect to local art mode API (ws://localhost:8001)
function connectArtMode() {
  try {
    artWs = new WebSocket(
      "ws://localhost:8001/api/v2/channels/com.samsung.art-app?name=" +
        btoa("FrameArtService"),
    );
    artWs.onopen = function () {
      console.log("[service] Art mode connected");
    };
    artWs.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.event === "d2d_service_message") {
          var inner = JSON.parse(msg.data);
          if (inner.event === "artmode_status") {
            // Report art mode status to cloud
            if (cloudWs && cloudWs.readyState === 1) {
              cloudWs.send(
                JSON.stringify({
                  type: "art_status",
                  artMode: inner.value,
                  tvId: tvId,
                }),
              );
            }
          }
        }
      } catch (ex) {}
    };
    artWs.onerror = function () {
      console.log("[service] Art mode connection failed, retry in 30s");
      setTimeout(connectArtMode, 30000);
    };
    artWs.onclose = function () {
      setTimeout(connectArtMode, 30000);
    };
  } catch (ex) {
    setTimeout(connectArtMode, 30000);
  }
}

// Select an image on the TV via art mode API
function selectImage(contentId) {
  if (!artWs || artWs.readyState !== 1) return;
  artWs.send(
    JSON.stringify({
      method: "ms.channel.emit",
      params: {
        event: "art_app_request",
        to: "host",
        data: JSON.stringify({
          request: "select_image",
          content_id: contentId,
          id: "service_select",
        }),
      },
    }),
  );
}

// Connect to cloud WebSocket
function connectCloud() {
  if (cloudWs) {
    try {
      cloudWs.onclose = null;
      cloudWs.close();
    } catch (e) {}
  }

  try {
    cloudWs = new WebSocket(CLOUD_WS);

    cloudWs.onopen = function () {
      console.log("[service] Cloud connected, registering TV");
      cloudWs.send(
        JSON.stringify({
          type: "register",
          tvId: tvId,
          tvIp: "localhost",
        }),
      );
    };

    cloudWs.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);

        if (msg.type === "new_art") {
          // Cloud pushed new art — select it
          console.log("[service] New art received: " + msg.contentId);
          selectImage(msg.contentId);
        }

        if (msg.type === "paired") {
          console.log("[service] TV paired with phone: " + msg.phoneSessionId);
          // Store pairing state
          try {
            tizen.preference.setValue("frameart_paired", "true");
            tizen.preference.setValue(
              "frameart_paired_at",
              new Date().toISOString(),
            );
          } catch (e) {}
        }
      } catch (ex) {}
    };

    cloudWs.onerror = function () {
      console.log(
        "[service] Cloud error, reconnecting in " + RECONNECT_DELAY + "ms",
      );
      setTimeout(connectCloud, RECONNECT_DELAY);
    };

    cloudWs.onclose = function () {
      console.log(
        "[service] Cloud disconnected, reconnecting in " +
          RECONNECT_DELAY +
          "ms",
      );
      setTimeout(connectCloud, RECONNECT_DELAY);
    };
  } catch (ex) {
    setTimeout(connectCloud, RECONNECT_DELAY);
  }
}

// Service lifecycle
function onStart() {
  console.log("[service] Curateur background service starting");
  tvId = getTvId();
  connectArtMode();
  connectCloud();
}

function onRequest(request) {
  // Handle app-to-service communication
  var appControl = request.appControl;
  if (appControl) {
    var op = appControl.operation;
    console.log("[service] App request: " + op);
  }
}

// Tizen service entry point
try {
  var service = tizen.application.getCurrentApplication();
  service.addEventListener("appcontrol", onRequest);
} catch (e) {}

onStart();
