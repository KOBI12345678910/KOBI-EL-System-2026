import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, shareSessionsTable } from "@workspace/db";
import {
  CreateShareSessionBody,
  createShareSessionBodyDurationMinutesDefault,
  GetSharedLocationParams,
  GetSharedLocationResponse,
  UpdateSharedLocationParams,
  UpdateSharedLocationBody,
  UpdateSharedLocationResponse,
} from "@workspace/api-zod";
import crypto from "crypto";

const router: IRouter = Router();

function generateShareCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

router.post("/locations/share", async (req, res): Promise<void> => {
  const parsed = CreateShareSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const durationMinutes = parsed.data.durationMinutes ?? createShareSessionBodyDurationMinutesDefault;
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const shareCode = generateShareCode();

  const [session] = await db
    .insert(shareSessionsTable)
    .values({
      shareCode,
      name: parsed.data.name,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      expiresAt,
      active: true,
    })
    .returning();

  res.status(201).json(session);
});

router.get("/locations/share/:shareCode", async (req, res): Promise<void> => {
  const params = GetSharedLocationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.shareCode) ? req.params.shareCode[0] : req.params.shareCode;

  const [session] = await db
    .select()
    .from(shareSessionsTable)
    .where(eq(shareSessionsTable.shareCode, raw));

  if (!session) {
    res.status(404).json({ error: "Share session not found" });
    return;
  }

  if (new Date() > session.expiresAt) {
    await db
      .update(shareSessionsTable)
      .set({ active: false })
      .where(eq(shareSessionsTable.id, session.id));
    session.active = false;
  }

  res.json(
    GetSharedLocationResponse.parse({
      shareCode: session.shareCode,
      name: session.name,
      latitude: session.latitude,
      longitude: session.longitude,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      active: session.active,
    }),
  );
});

router.post("/locations/share/:shareCode/update", async (req, res): Promise<void> => {
  const paramsResult = UpdateSharedLocationParams.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: paramsResult.error.message });
    return;
  }

  const bodyResult = UpdateSharedLocationBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.message });
    return;
  }

  const raw = Array.isArray(req.params.shareCode) ? req.params.shareCode[0] : req.params.shareCode;

  const [session] = await db
    .update(shareSessionsTable)
    .set({
      latitude: bodyResult.data.latitude,
      longitude: bodyResult.data.longitude,
      updatedAt: new Date(),
    })
    .where(and(eq(shareSessionsTable.shareCode, raw), eq(shareSessionsTable.active, true)))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Active share session not found" });
    return;
  }

  res.json(
    UpdateSharedLocationResponse.parse({
      shareCode: session.shareCode,
      name: session.name,
      latitude: session.latitude,
      longitude: session.longitude,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      active: session.active,
    }),
  );
});

export default router;
