// ============================================================
// Comms domain aggregator router — mounted at /api/comms
// Canonical data-layer routes; existing legacy routers
// (notifications.ts, whatsapp-hub.ts, ...) are left untouched.
// ============================================================
import { Router } from "express";

import threadsRouter from "./threads";
import emailMessagesRouter from "./email-messages";
import smsMessagesRouter from "./sms-messages";
import whatsappMessagesRouter from "./whatsapp-messages";
import notificationsRouter from "./notifications";
import supportTicketsRouter from "./support-tickets";
import portalUsersRouter from "./portal-users";
import chatbotSessionsRouter from "./chatbot-sessions";
import helpArticlesRouter from "./help-articles";
import messageTemplatesRouter from "./message-templates";
import broadcastCampaignsRouter from "./broadcast-campaigns";

const commsRouter = Router();

commsRouter.use("/threads", threadsRouter);
commsRouter.use("/email-messages", emailMessagesRouter);
commsRouter.use("/sms-messages", smsMessagesRouter);
commsRouter.use("/whatsapp-messages", whatsappMessagesRouter);
commsRouter.use("/notifications", notificationsRouter);
commsRouter.use("/support-tickets", supportTicketsRouter);
commsRouter.use("/portal-users", portalUsersRouter);
commsRouter.use("/chatbot-sessions", chatbotSessionsRouter);
commsRouter.use("/help-articles", helpArticlesRouter);
commsRouter.use("/message-templates", messageTemplatesRouter);
commsRouter.use("/broadcast-campaigns", broadcastCampaignsRouter);

export default commsRouter;
