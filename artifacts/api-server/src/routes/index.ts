import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import foldersRouter from "./folders.js";
import samplesRouter from "./samples.js";
import proxyRouter from "./proxy.js";
import stripeRouter from "./stripe.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(foldersRouter);
router.use(samplesRouter);
router.use(proxyRouter);
router.use(stripeRouter);

export default router;
