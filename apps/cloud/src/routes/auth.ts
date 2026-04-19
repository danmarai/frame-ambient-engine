/** Auth routes — Google OAuth login and session management */
import { Router } from "express";
import { verifyGoogleToken, createSession, getSession } from "../auth.js";
import { asyncHandler, authLimiter } from "../middleware.js";

const router = Router();

router.post(
  "/api/auth/google",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(400).json({ error: "Missing idToken" });
      return;
    }

    const user = await verifyGoogleToken(idToken);
    if (!user) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    const sessionId = createSession(user);
    console.log(`User signed in: ${user.name} (${user.email})`);

    res.json({
      sessionId,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    });
  }),
);

router.get("/api/auth/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = getSession(auth.substring(7));
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  res.json({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
});

export default router;
