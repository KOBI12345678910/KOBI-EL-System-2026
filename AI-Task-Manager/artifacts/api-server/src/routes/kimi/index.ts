import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { validateSession } from "../../lib/auth";
import providerRouter from "./provider";
import chatRouter from "./chat";
import agentsRouter from "./agents";
import devPlatformRouter from "./dev-platform";

const router: IRouter = Router();

async function requireKimiAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/kimi")) {
    return next();
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  const result = await validateSession(token);
  if (result.error || !result.user) {
    res.status(401).json({ error: "הסשן פג תוקף" });
    return;
  }
  (req as any).user = result.user;
  req.userId = String((result.user as any).id || "");
  next();
}

router.use(requireKimiAuth as any);
router.use(providerRouter);
router.use(chatRouter);
router.use(agentsRouter);
router.use(devPlatformRouter);

export default router;
