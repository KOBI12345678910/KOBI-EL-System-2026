import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import locationsRouter from "./locations";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(locationsRouter);
router.use(dashboardRouter);

export default router;
