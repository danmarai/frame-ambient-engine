# Samsung Developer Support Email

## Subject:

Tizen Web App API for adding images to Art Mode on Frame TV

## Body:

Dear Samsung Developer Support team,

I'm a Samsung developer building a Tizen web application for Samsung Frame TVs. The application is a corporate digital signage solution that needs to programmatically add images to the Art Mode gallery on Frame TVs, so that images display through the native Art Mode experience with all standard features (mattes, ambient brightness, motion sensor control, etc.).

I've been working with the Art Mode WebSocket API (`com.samsung.art-app` channel) and have successfully connected from inside a Tizen web app via `ws://localhost:8001`. Read operations work correctly — I can query art mode status, list content, select images, and toggle art mode on/off.

However, the `send_image` request does not receive a response when sent from inside a foreground Tizen web app. The same request works correctly from an external network client via `wss://TV_IP:8002`. It appears that the Art Mode service may deliberately not process upload requests from foreground Tizen applications.

**My specific questions:**

1. Is there a recommended/supported API for Tizen web applications to programmatically add images to the Art Mode gallery on Frame TVs?

2. Are there specific Tizen privileges or permissions that would enable `send_image` functionality from within a Tizen app? (I'm using a Partner-level Samsung certificate.)

3. Does the `<tizen:service>` background web service support the Art Mode WebSocket API on newer Frame TV models (2022 and later)? Would a background service be able to call `send_image` while Art Mode is displayed in the foreground?

4. Is there a way to configure the Tizen web engine to trust the TV's internal self-signed certificate for `wss://localhost:8002` connections? This would allow connecting to port 8002, which does process `send_image` requests from external clients.

5. We noticed the Samsung Hospitality TV (HTV) program has B2B content management capabilities. Are there HTV Frame TV models, and would the HTV APIs provide the content push functionality we need? Would this be a recommended path for our use case?

6. Are there any other alternative approaches you would recommend?

**My development environment:**

- Test TV: Samsung QN65LS03TAFXZA (2020 Frame TV, Tizen 5.5, Art Mode API v2.03)
- Tizen web app, `required_version="2.3"`, Partner-level Samsung developer certificate
- Tizen Studio with Samsung TV extensions installed

I appreciate any guidance you can provide. This is for a legitimate commercial application and we're committed to following Samsung's recommended development practices.

Thank you for your time,
Daniel Marantz
