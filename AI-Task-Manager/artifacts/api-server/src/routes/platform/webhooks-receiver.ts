import { Router, type IRouter } from "express";
import { processInboundWebhook } from "../../lib/integration-runtime";

const router: IRouter = Router();

router.post("/platform/webhooks/receive/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    const secret = (req.headers["x-webhook-secret"] as string) || undefined;

    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ success: false, message: "Request body must be a JSON object" });
    }

    const result = await processInboundWebhook(slug, payload, secret);

    if (!result.success) {
      const statusCode = result.message === "Webhook not found" ? 404 :
                         result.message === "Invalid webhook secret" ? 401 :
                         result.message === "Webhook is disabled" ? 403 : 400;
      return res.status(statusCode).json(result);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
