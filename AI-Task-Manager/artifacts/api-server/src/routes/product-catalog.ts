import express, { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productCategoriesTable, productsTable, productMaterialsTable, rawMaterialsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import multer from "multer";
import path from "path";
import fs from "fs";
import { VAT_RATE } from "../constants";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "products");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});


async function recalcProductCost(productId: number) {
  const materials = await db
    .select()
    .from(productMaterialsTable)
    .where(eq(productMaterialsTable.productId, productId));

  let totalCost = 0;
  for (const pm of materials) {
    const [mat] = await db.select().from(rawMaterialsTable).where(eq(rawMaterialsTable.id, pm.materialId));
    const unitCost = parseFloat(mat?.standardPrice || "0");
    const qty = parseFloat(pm.quantityPerSqm || "1");
    const lineCost = unitCost * qty;
    totalCost += lineCost;
    await db.update(productMaterialsTable)
      .set({ unitCost: String(unitCost), totalCost: String(lineCost) })
      .where(eq(productMaterialsTable.id, pm.id));
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (product) {
    const sellPrice = parseFloat(product.pricePerSqmBeforeVat || "0");
    const afterVat = sellPrice * (1 + VAT_RATE);
    const grossProfit = sellPrice - totalCost;
    await db.update(productsTable).set({
      materialsCostPerSqm: String(totalCost),
      pricePerSqmAfterVat: String(afterVat),
      grossProfit: String(grossProfit),
      updatedAt: new Date(),
    }).where(eq(productsTable.id, productId));
  }
}

router.get("/product-categories", async (_req, res) => {
  try {
    const cats = await db.select().from(productCategoriesTable).orderBy(productCategoriesTable.sortOrder, productCategoriesTable.name);
    res.json(cats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/product-categories", async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      icon: z.string().optional(),
      color: z.string().optional(),
      description: z.string().optional(),
      sortOrder: z.coerce.number().optional(),
    }).parse(req.body);
    const [cat] = await db.insert(productCategoriesTable).values(body).returning();
    res.status(201).json(cat);
  } catch (error: any) {
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return res.status(409).json({ message: "שם הקטגוריה כבר קיים" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put("/product-categories/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      name: z.string().min(1).optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      description: z.string().optional(),
      sortOrder: z.coerce.number().optional(),
    }).parse(req.body);
    const [cat] = await db.update(productCategoriesTable).set({ ...body, updatedAt: new Date() }).where(eq(productCategoriesTable.id, id)).returning();
    if (!cat) return res.status(404).json({ message: "Category not found" });
    res.json(cat);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/product-categories/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/products", async (req, res) => {
  try {
    const { categoryId } = req.query;
    let query = db.select().from(productsTable).orderBy(desc(productsTable.createdAt)).$dynamic();
    if (categoryId && typeof categoryId === "string" && categoryId !== "all") {
      query = query.where(eq(productsTable.categoryId, parseInt(categoryId)));
    }
    const products = await query;
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/products/stats", async (_req, res) => {
  try {
    const all = await db.select().from(productsTable);
    const total = all.length;
    const active = all.filter((p: any) => p.isActive !== false).length;
    const inactive = total - active;
    const categories = [...new Set(all.map((p: any) => p.categoryId).filter(Boolean))].length;
    res.json({ total, active, inactive, categories, byStatus: { active, inactive } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    const materials = await db.select().from(productMaterialsTable).where(eq(productMaterialsTable.productId, id));
    res.json({ ...product, materials });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/products", async (req, res) => {
  try {
    const body = z.object({
      productNumber: z.string().min(1),
      productName: z.string().min(1),
      categoryId: z.coerce.number().int().positive(),
      description: z.string().optional(),
      pricePerSqmBeforeVat: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const sellPrice = parseFloat(body.pricePerSqmBeforeVat || "0");
    const afterVat = sellPrice * (1 + VAT_RATE);

    const [product] = await db.insert(productsTable).values({
      ...body,
      pricePerSqmAfterVat: String(afterVat),
    }).returning();
    res.status(201).json(product);
  } catch (error: any) {
    if (error.message?.includes("unique") || error.message?.includes("duplicate") || error.message?.includes("product_number")) {
      return res.status(409).json({ message: "מספר מוצר כבר קיים במערכת" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put("/products/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      productNumber: z.string().min(1).optional(),
      productName: z.string().min(1).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      description: z.string().optional(),
      pricePerSqmBeforeVat: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const sellPrice = parseFloat(body.pricePerSqmBeforeVat || "0");
    const afterVat = sellPrice * (1 + VAT_RATE);

    const [product] = await db.update(productsTable).set({
      ...body,
      pricePerSqmAfterVat: String(afterVat),
      updatedAt: new Date(),
    }).where(eq(productsTable.id, id)).returning();
    if (!product) return res.status(404).json({ message: "Product not found" });

    await recalcProductCost(id);
    const [updated] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(productMaterialsTable).where(eq(productMaterialsTable.productId, id));
    const [deleted] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Product not found" });
    if (deleted.imagePath) {
      const imgFile = path.join(uploadsDir, path.basename(deleted.imagePath));
      if (fs.existsSync(imgFile)) fs.unlinkSync(imgFile);
    }
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/products/:id/image", upload.single("image"), async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No image uploaded" });

    const imagePath = `/api/products/images/${file.filename}`;
    const [product] = await db.update(productsTable).set({ imagePath, updatedAt: new Date() }).where(eq(productsTable.id, id)).returning();
    if (!product) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ imagePath });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.use("/products/images", express.static(uploadsDir));

router.get("/products/:productId/materials", async (req, res) => {
  try {
    const productId = z.coerce.number().int().positive().parse(req.params.productId);
    const materials = await db.select().from(productMaterialsTable).where(eq(productMaterialsTable.productId, productId));
    res.json(materials);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/products/:productId/materials", async (req, res) => {
  try {
    const productId = z.coerce.number().int().positive().parse(req.params.productId);
    const body = z.object({
      materialId: z.coerce.number().int().positive(),
      quantityPerSqm: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [mat] = await db.select().from(rawMaterialsTable).where(eq(rawMaterialsTable.id, body.materialId));
    const unitCost = parseFloat(mat?.standardPrice || "0");
    const qty = parseFloat(body.quantityPerSqm || "1");
    const totalCost = unitCost * qty;

    const [pm] = await db.insert(productMaterialsTable).values({
      productId,
      materialId: body.materialId,
      quantityPerSqm: body.quantityPerSqm || "1",
      unitCost: String(unitCost),
      totalCost: String(totalCost),
      notes: body.notes,
    }).returning();

    await recalcProductCost(productId);
    res.status(201).json(pm);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/product-materials/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      quantityPerSqm: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [existing] = await db.select().from(productMaterialsTable).where(eq(productMaterialsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Not found" });

    const [mat] = await db.select().from(rawMaterialsTable).where(eq(rawMaterialsTable.id, existing.materialId));
    const unitCost = parseFloat(mat?.standardPrice || "0");
    const qty = parseFloat(body.quantityPerSqm || existing.quantityPerSqm || "1");
    const totalCost = unitCost * qty;

    const [pm] = await db.update(productMaterialsTable).set({
      quantityPerSqm: body.quantityPerSqm || existing.quantityPerSqm,
      unitCost: String(unitCost),
      totalCost: String(totalCost),
      notes: body.notes !== undefined ? body.notes : existing.notes,
    }).where(eq(productMaterialsTable.id, id)).returning();

    await recalcProductCost(existing.productId);
    res.json(pm);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/product-materials/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [existing] = await db.select().from(productMaterialsTable).where(eq(productMaterialsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Not found" });
    await db.delete(productMaterialsTable).where(eq(productMaterialsTable.id, id));
    await recalcProductCost(existing.productId);
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
