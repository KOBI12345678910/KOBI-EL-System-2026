import { Router, type IRouter } from "express";
import healthRouter from "./health";
import locationsRouter from "./locations";
import shareRouter from "./share";
import savedPlacesRouter from "./saved-places";

const router: IRouter = Router();

router.use(healthRouter);
router.use(locationsRouter);
router.use(shareRouter);
router.use(savedPlacesRouter);

export default router;
