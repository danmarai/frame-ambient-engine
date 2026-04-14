# Samsung Developer Forum Post

## Title:

Tizen Web App on Frame TV — Programmatically adding images to Art Mode gallery?

## Body:

Hi everyone,

I'm developing a Tizen web application for Samsung Frame TVs as part of a corporate digital signage project. The app needs to programmatically add images to the Art Mode gallery so they display through the native Art Mode experience (with mattes, brightness adaptation, motion sensor, etc.).

**What I've tried:**

I'm connecting to the Art Mode WebSocket API at `ws://localhost:8001/api/v2/channels/com.samsung.art-app` from inside the Tizen web app. Read operations work perfectly — I can successfully call:

- `get_artmode_status` ✓
- `get_current_artwork` ✓
- `get_content_list` ✓
- `get_device_info` ✓
- `select_image` ✓
- `set_artmode_status` ✓

However, **`send_image` never receives a response** when called from inside the Tizen app. The same `send_image` request works perfectly when sent from an external client on the network via `wss://TV_IP:8002`. The Art Mode host appears to deliberately ignore upload requests from foreground Tizen applications.

**My test environment:**

- Samsung QN65LS03T (2020 Frame TV, Tizen 5.5)
- Tizen web app with `required_version="2.3"`, Partner-level Samsung certificate
- Connected via `ws://localhost:8001` (port 8002 WSS is rejected due to self-signed certificate in the Tizen web engine)

**What I've also tried:**

- `<tizen:service>` background service — does not appear to execute on Tizen 5.5
- Direct binary upload over WebSocket (API 0.97 format) — rejected with "invalid method field"
- Alternative request names (`upload_image`, `change_image`, etc.) — all return error -9
- `tizen.content` and `tizen.filesystem` APIs — Art Mode has its own internal content store and doesn't scan the shared media directories

**My questions:**

1. Is there a supported API for Tizen web apps to add images to the Art Mode gallery? Is there a privilege or permission I'm missing?

2. Does the `<tizen:service>` background service work on newer Frame TV models (2022+)? Could a background service successfully call `send_image` while Art Mode is in the foreground?

3. Is there a way to configure the Tizen web engine to accept the TV's self-signed certificate for `wss://localhost:8002` connections?

4. Are there any alternative approaches for getting images into Art Mode programmatically from a Tizen app running on the TV itself?

Any guidance would be greatly appreciated. Thank you!

---

**Tags:** Frame TV, Art Mode, Tizen Web App, send_image, WebSocket API
