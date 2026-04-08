import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiPermissionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { CreateAiPermissionBody, UpdateAiPermissionBody, UpdateAiPermissionParams, DeleteAiPermissionParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-permissions", async (_req, res) => {
  const permissions = await db.select().from(aiPermissionsTable);
  res.json(permissions);
});

router.post("/ai-permissions", async (req, res) => {
  const body = CreateAiPermissionBody.parse(req.body);
  const [permission] = await db.insert(aiPermissionsTable).values(body).returning();
  res.status(201).json(permission);
});

router.put("/ai-permissions/:id", async (req, res) => {
  const { id } = UpdateAiPermissionParams.parse(req.params);
  const body = UpdateAiPermissionBody.parse(req.body);
  const [permission] = await db.update(aiPermissionsTable).set({ ...body, updatedAt: new Date() }).where(eq(aiPermissionsTable.id, id)).returning();
  if (!permission) return res.status(404).json({ message: "Not found" });
  res.json(permission);
});

router.delete("/ai-permissions/:id", async (req, res) => {
  const { id } = DeleteAiPermissionParams.parse(req.params);
  await db.delete(aiPermissionsTable).where(eq(aiPermissionsTable.id, id));
  res.status(204).send();
});

export default router;
