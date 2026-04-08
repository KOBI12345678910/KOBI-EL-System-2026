import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { suppliersTable, rawMaterialsTable, documentFoldersTable, documentFilesTable } from "@workspace/db/schema";
import { ilike, or, eq, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "ai-documents");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx"];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("סוג קובץ לא נתמך. ניתן להעלות: PDF, תמונות, Word, Excel"));
    }
  },
});

const AI_DOC_HISTORY_TABLE = "ai_document_history";

const aiDocTable = sql.raw(AI_DOC_HISTORY_TABLE);

async function aiDocInsert(fileName: string, fileUrl: string, status: string, documentId?: number): Promise<number> {
  const result = documentId
    ? await db.execute(sql`INSERT INTO ${aiDocTable} (file_name, file_url, status, document_id) VALUES (${fileName}, ${fileUrl}, ${status}, ${documentId}) RETURNING id`)
    : await db.execute(sql`INSERT INTO ${aiDocTable} (file_name, file_url, status) VALUES (${fileName}, ${fileUrl}, ${status}) RETURNING id`);
  return (result.rows[0] as any)?.id;
}

async function aiDocSelect(docId: number): Promise<any | null> {
  const result = await db.execute(sql`SELECT * FROM ${aiDocTable} WHERE id = ${docId}`);
  return (result.rows?.[0] as any) || null;
}

async function aiDocUpdateExtracted(docId: number, extractedData: any, documentType: string) {
  await db.execute(sql`UPDATE ${aiDocTable} SET extracted_data = ${JSON.stringify(extractedData)}::jsonb, document_type = ${documentType}, status = 'extracted' WHERE id = ${docId}`);
}

async function aiDocUpdateCompleted(docId: number, distributionLog: any) {
  await db.execute(sql`UPDATE ${aiDocTable} SET status = 'completed', distribution_log = ${JSON.stringify(distributionLog)}::jsonb WHERE id = ${docId}`);
}

async function aiDocUpdateFailed(docId: number, errorMessage: string) {
  await db.execute(sql`UPDATE ${aiDocTable} SET status = 'failed', error_message = ${String(errorMessage).slice(0, 500)} WHERE id = ${docId}`).catch(() => {});
}

const DOC_TYPE_TO_FOLDER: Record<string, string> = {
  "חשבונית": "Purchase",
  "חשבונית_ספק": "Purchase",
  "חשבונית_מס": "Purchase",
  "קבלה": "כספים",
  "הזמנת_רכש": "Purchase",
  "חוזה": "Miscellaneous",
  "הסכם": "Miscellaneous",
  "ביטוח": "Insurances",
  "פוליסה": "Insurances",
  "הלוואה": "הלוואות",
  "בנק": "Bank",
  "דוח_בנק": "Bank",
  "משכורת": "כספים",
  "מכירה": "Sales",
  "חשבונית_לקוח": "Sales",
};

const EXPENSE_CATEGORIES: Record<string, { category: string; accountType: string }> = {
  "חשבונית": { category: "רכש חומרים", accountType: "expense" },
  "חשבונית_ספק": { category: "רכש חומרים", accountType: "expense" },
  "חשבונית_מס": { category: "הוצאות תפעול", accountType: "expense" },
  "קבלה": { category: "תשלומים", accountType: "expense" },
  "הזמנת_רכש": { category: "רכש", accountType: "expense" },
  "ביטוח": { category: "הוצאות ביטוח", accountType: "expense" },
  "פוליסה": { category: "הוצאות ביטוח", accountType: "expense" },
  "הלוואה": { category: "הלוואות", accountType: "liability" },
  "שכירות": { category: "הוצאות שכירות", accountType: "expense" },
  "חשמל": { category: "הוצאות חשמל", accountType: "expense" },
  "אחר": { category: "הוצאות כלליות", accountType: "expense" },
};

function requireAuth(req: Request, res: Response, next: () => void) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  next();
}

async function callClaude(prompt: string, imageData?: { base64: string; mediaType: string }): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";

  if (!apiKey) throw new Error("Anthropic API key not configured");

  const messages: any[] = [];
  const userContent: any[] = [];

  if (imageData) {
    const isPdf = imageData.mediaType === "application/pdf";
    if (isPdf) {
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: imageData.base64,
        },
      });
    } else {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageData.mediaType,
          data: imageData.base64,
        },
      });
    }
  }

  userContent.push({ type: "text", text: prompt });
  messages.push({ role: "user", content: userContent });

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages,
  };

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text || "";
}

function extractJson(text: string): any {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return null;
}

async function extractDocumentData(filePath: string, originalName: string): Promise<any> {
  const ext = path.extname(originalName).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
  const isPdf = ext === ".pdf";

  const extractionPrompt = `אתה מומחה לחילוץ נתונים ממסמכים עסקיים של חברת מסגרות ברזל/אלומיניום/זכוכית. נתח את המסמך הזה וחלץ את כל המידע הרלוונטי.

החזר JSON בדיוק בפורמט הבא (ואך ורק JSON, ללא הסבר נוסף):
{
  "documentType": "חשבונית|חשבונית_ספק|חשבונית_מס|חוזה|הסכם|קבלה|הזמנת_רכש|ביטוח|פוליסה|הלוואה|בנק|דוח_בנק|משכורת|מכירה|חשבונית_לקוח|אחר",
  "documentCategory": "רכש|מכירות|כספים|ביטוח|בנק|הלוואות|משכורות|כללי",
  "supplierName": "שם הספק/חברה המנפיקה",
  "supplierPhone": "טלפון",
  "supplierEmail": "אימייל",
  "supplierAddress": "כתובת מלאה",
  "taxId": "מספר ח.פ./עוסק מורשה",
  "invoiceNumber": "מספר חשבונית/מסמך",
  "invoiceDate": "תאריך ISO YYYY-MM-DD",
  "dueDate": "תאריך פירעון ISO YYYY-MM-DD",
  "paymentTerms": "תנאי תשלום (שוטף+30 וכו')",
  "netAmount": 0,
  "vatAmount": 0,
  "totalAmount": 0,
  "currency": "ILS",
  "expenseCategory": "רכש חומרים|הוצאות תפעול|הוצאות ביטוח|הוצאות שכירות|הוצאות חשמל|הלוואות|שכר עבודה|הוצאות כלליות",
  "accountingType": "expense|asset|liability",
  "items": [
    {
      "name": "שם פריט/שירות",
      "description": "תיאור",
      "quantity": 0,
      "unit": "יחידה",
      "unitPrice": 0,
      "totalPrice": 0,
      "category": "חומר גלם|שירות|ציוד|אחר"
    }
  ],
  "notes": "הערות נוספות מהמסמך"
}

כללים חשובים:
- אם שדה לא קיים במסמך — השאר כ-null
- מע"מ ישראלי הוא 17%
- זהה אם זו חשבונית רכש (מספק) או מכירה (ללקוח)
- סווג כל פריט לקטגוריה: חומר גלם (ברזל, אלומיניום, זכוכית, ברגים), שירות, ציוד
- קבע accountingType: expense=הוצאה שוטפת, asset=רכישת נכס/ציוד, liability=התחייבות/הלוואה
- ענה אך ורק ב-JSON תקני`;

  let imageData: { base64: string; mediaType: string } | undefined;

  if (isImage) {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");
    const mediaTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    imageData = { base64, mediaType: mediaTypeMap[ext] || "image/jpeg" };
  } else if (isPdf) {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");
    imageData = { base64, mediaType: "application/pdf" };
  }

  let promptText = extractionPrompt;
  if (!isImage && !isPdf) {
    promptText = `הקובץ הוא ${ext} ולא ניתן לקרוא תוכנו ישירות. נסה לחלץ מידע מהשם "${originalName}" ויצור JSON ריק עם שדות null.`;
  }

  const result = await callClaude(promptText, imageData);
  const parsed = extractJson(result);
  return parsed || { documentType: "אחר", notes: "לא ניתן לחלץ נתונים" };
}

async function findOrCreateSupplier(extractedData: any): Promise<{ id: number; name: string; isNew: boolean }> {
  const supplierName = extractedData.supplierName;
  if (!supplierName) return { id: 0, name: "", isNew: false };

  const existing = await db.select({ id: suppliersTable.id, supplierName: suppliersTable.supplierName })
    .from(suppliersTable)
    .where(or(
      ilike(suppliersTable.supplierName, `%${supplierName}%`),
      extractedData.taxId ? eq(suppliersTable.vatNumber, extractedData.taxId) : ilike(suppliersTable.supplierName, `%${supplierName}%`),
    ))
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, name: existing[0].supplierName, isNew: false };
  }

  const countResult = await db.execute(sql.raw("SELECT COUNT(*) as c FROM suppliers"));
  const count = Number((countResult.rows[0] as any)?.c || 0) + 1;
  const supplierNumber = `SUP-${String(count).padStart(4, "0")}`;

  const [newSupplier] = await db.insert(suppliersTable).values({
    supplierNumber,
    supplierName,
    phone: extractedData.supplierPhone || null,
    email: extractedData.supplierEmail || null,
    address: extractedData.supplierAddress || null,
    vatNumber: extractedData.taxId || null,
    paymentTerms: extractedData.paymentTerms || null,
    status: "פעיל",
    category: "כללי",
  }).returning({ id: suppliersTable.id, supplierName: suppliersTable.supplierName });

  return { id: newSupplier.id, name: newSupplier.supplierName, isNew: true };
}

const VALID_PAYMENT_METHODS = ["cash", "bank_transfer", "credit_card", "check", "other"];

function normalizePaymentMethod(raw: string | null | undefined): string {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();
  if (VALID_PAYMENT_METHODS.includes(lower)) return lower;
  if (lower.includes("מזומן") || lower.includes("cash")) return "cash";
  if (lower.includes("העברה") || lower.includes("בנק") || lower.includes("bank") || lower.includes("transfer")) return "bank_transfer";
  if (lower.includes("אשראי") || lower.includes("credit") || lower.includes("כרטיס")) return "credit_card";
  if (lower.includes("צ'ק") || lower.includes("שיק") || lower.includes("check") || lower.includes("cheque")) return "check";
  return "other";
}

async function createExpenseRecord(extractedData: any, supplierId: number): Promise<number> {
  const amount = extractedData.netAmount || extractedData.totalAmount || 0;
  const vatAmount = extractedData.vatAmount || 0;
  const catInfo = EXPENSE_CATEGORIES[extractedData.documentType] || EXPENSE_CATEGORIES["אחר"];

  const countResult = await db.execute(sql.raw("SELECT COUNT(*) as c FROM expenses"));
  const count = Number((countResult.rows[0] as any)?.c || 0) + 1;
  const expenseNumber = `EXP-${new Date().getFullYear()}-${String(count).padStart(4, "0")}`;

  const invoiceDate = extractedData.invoiceDate || new Date().toISOString().split("T")[0];

  const result = await db.execute(sql`
    INSERT INTO expenses (expense_number, description, amount, vat_amount, currency, category, expense_date, vendor_name, receipt_number, payment_method, status, supplier_id, supplier_name, invoice_number, invoice_date, vendor_tax_id, net_amount)
    VALUES (
      ${expenseNumber},
      ${"חשבונית " + (extractedData.invoiceNumber || "") + " מ" + (extractedData.supplierName || "ספק")},
      ${String(amount)},
      ${String(vatAmount)},
      ${extractedData.currency || "ILS"},
      ${extractedData.expenseCategory || catInfo.category},
      ${invoiceDate},
      ${extractedData.supplierName || null},
      ${extractedData.invoiceNumber || null},
      ${normalizePaymentMethod(extractedData.paymentTerms)},
      ${"pending"},
      ${supplierId || null},
      ${extractedData.supplierName || null},
      ${extractedData.invoiceNumber || null},
      ${invoiceDate},
      ${extractedData.taxId || null},
      ${extractedData.netAmount ? String(extractedData.netAmount) : null}
    )
    RETURNING id
  `);

  return (result.rows[0] as any)?.id;
}

async function createAPRecord(extractedData: any, supplierId: number, supplierName: string): Promise<number> {
  const amount = extractedData.totalAmount || extractedData.netAmount || 0;
  const netAmount = extractedData.netAmount || null;
  const vatAmount = extractedData.vatAmount || 0;

  const countResult = await db.execute(sql.raw("SELECT COUNT(*) as c FROM accounts_payable"));
  const count = Number((countResult.rows[0] as any)?.c || 0) + 1;
  const apNumber = `AP-${new Date().getFullYear()}-${String(count).padStart(4, "0")}`;

  const safeName = supplierName || extractedData.supplierName || "לא ידוע";
  const invoiceDate = extractedData.invoiceDate || new Date().toISOString().split("T")[0];
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 30);
  const dueDate = extractedData.dueDate || defaultDue.toISOString().split("T")[0];
  const description = `חשבונית ${extractedData.invoiceNumber || ""} מ${safeName}`;

  const result = await db.execute(sql`
    INSERT INTO accounts_payable (ap_number, invoice_number, supplier_id, supplier_name, invoice_date, due_date, amount, net_amount, vat_amount, currency, paid_amount, status, payment_terms, description, category)
    VALUES (
      ${apNumber},
      ${extractedData.invoiceNumber || null},
      ${supplierId || null},
      ${safeName},
      ${invoiceDate},
      ${dueDate},
      ${String(amount)},
      ${netAmount ? String(netAmount) : null},
      ${String(vatAmount)},
      ${extractedData.currency || "ILS"},
      ${"0"},
      ${"open"},
      ${extractedData.paymentTerms || null},
      ${description},
      ${extractedData.expenseCategory || "רכש"}
    )
    RETURNING id
  `);

  return (result.rows[0] as any)?.id;
}

async function createJournalEntry(extractedData: any, supplierId: number, supplierName: string): Promise<number | null> {
  try {
    const amount = extractedData.totalAmount || extractedData.netAmount || 0;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return null;
    const safeAmount = String(numAmount);

    const countResult = await db.execute(sql`SELECT COUNT(*) as c FROM journal_entries`);
    const count = Number((countResult.rows[0] as any)?.c || 0) + 1;
    const entryNumber = `JE-${new Date().getFullYear()}-${String(count).padStart(4, "0")}`;

    const accountingType = String(extractedData.accountingType || "expense");
    let debitAccount = "הוצאות כלליות";
    let creditAccount = "ספקים / חשבונות לתשלום";

    if (accountingType === "asset") {
      debitAccount = "רכוש קבוע";
      creditAccount = "ספקים / חשבונות לתשלום";
    } else if (accountingType === "liability") {
      debitAccount = "בנק / מזומנים";
      creditAccount = "הלוואות לזמן ארוך";
    }

    const invoiceDate = extractedData.invoiceDate || new Date().toISOString().split("T")[0];
    const safeInvoiceNumber = String(extractedData.invoiceNumber || "");
    const safeSupplierName = String(supplierName || "");
    const safeCategory = String(extractedData.expenseCategory || debitAccount);
    const description = `חשבונית ${safeInvoiceNumber} מ${safeSupplierName} — ${safeCategory}`;

    const insertResult = await db.execute(sql`
      INSERT INTO journal_entries (entry_number, entry_date, description, status, amount, total_debit, total_credit)
      VALUES (${entryNumber}, ${invoiceDate}, ${description}, 'posted', ${safeAmount}, ${safeAmount}, ${safeAmount})
      RETURNING id
    `);
    const jeId = (insertResult.rows[0] as any)?.id;
    if (!jeId) return null;

    const debitDesc = `חיוב — ${safeCategory}`;
    const creditDesc = `זיכוי — ${safeSupplierName || "ספק"}`;

    await db.execute(sql`
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_name, description, debit, credit)
      VALUES
        (${jeId}, 1, ${debitAccount}, ${debitDesc}, ${safeAmount}, '0'),
        (${jeId}, 2, ${creditAccount}, ${creditDesc}, '0', ${safeAmount})
    `);

    return jeId;
  } catch (err: any) {
    console.error("[AI-Doc] Journal entry creation failed:", err.message);
    return null;
  }
}

async function upsertRawMaterials(items: any[], supplierId: number): Promise<number[]> {
  const created: number[] = [];
  for (const item of items) {
    if (!item.name) continue;
    if (item.category === "שירות") continue;

    const existing = await db.select({ id: rawMaterialsTable.id })
      .from(rawMaterialsTable)
      .where(ilike(rawMaterialsTable.materialName, `%${item.name}%`))
      .limit(1);

    if (existing.length > 0) {
      await db.update(rawMaterialsTable)
        .set({
          standardPrice: item.unitPrice ? String(item.unitPrice) : undefined,
          supplierId: supplierId || undefined,
          updatedAt: new Date(),
        })
        .where(eq(rawMaterialsTable.id, existing[0].id));
      created.push(existing[0].id);
    } else {
      const countResult = await db.execute(sql.raw("SELECT COUNT(*) as c FROM raw_materials"));
      const count = Number((countResult.rows[0] as any)?.c || 0) + 1;
      const materialNumber = `MAT-${String(count).padStart(4, "0")}`;

      const [mat] = await db.insert(rawMaterialsTable).values({
        materialNumber,
        materialName: item.name,
        category: item.category === "ציוד" ? "ציוד" : "כללי",
        unit: item.unit || "יחידה",
        standardPrice: item.unitPrice ? String(item.unitPrice) : null,
        currentStock: item.quantity ? String(item.quantity) : "0",
        supplierId: supplierId || null,
        status: "פעיל",
      }).returning({ id: rawMaterialsTable.id });

      created.push(mat.id);
    }
  }
  return created;
}

async function autoAssignFolder(documentType: string): Promise<{ folderId: number | null; folderName: string }> {
  const targetFolderName = DOC_TYPE_TO_FOLDER[documentType] || DOC_TYPE_TO_FOLDER["אחר"] || "Miscellaneous";

  const folders = await db.select({ id: documentFoldersTable.id, name: documentFoldersTable.name })
    .from(documentFoldersTable)
    .where(eq(documentFoldersTable.name, targetFolderName))
    .limit(1);

  if (folders.length > 0) {
    return { folderId: folders[0].id, folderName: folders[0].name };
  }

  const [newFolder] = await db.insert(documentFoldersTable).values({
    name: targetFolderName,
    color: "#6b7280",
    icon: "folder",
    isSystem: true,
    createdBy: "system",
  }).returning({ id: documentFoldersTable.id, name: documentFoldersTable.name });

  return { folderId: newFolder.id, folderName: newFolder.name };
}

async function distributeDocumentData(extractedData: any): Promise<Record<string, any>> {
  const distributionLog: Record<string, any> = {};
  const errors: string[] = [];

  let supplierId = 0;
  let supplierName = extractedData.supplierName || "";

  if (extractedData.supplierName) {
    try {
      const supplier = await findOrCreateSupplier(extractedData);
      supplierId = supplier.id;
      supplierName = supplier.name;
      distributionLog.supplier = { id: supplierId, name: supplierName, isNew: supplier.isNew };
    } catch (err: any) {
      console.error("[AI-Doc] Supplier creation failed:", err.message);
      errors.push(`ספק: ${err.message}`);
    }
  }

  if (extractedData.totalAmount || extractedData.netAmount) {
    try {
      const expenseId = await createExpenseRecord(extractedData, supplierId);
      distributionLog.expense = { id: expenseId, category: extractedData.expenseCategory || "הוצאות כלליות" };
    } catch (err: any) {
      console.error("[AI-Doc] Expense creation failed:", err.message);
      errors.push(`הוצאה: ${err.message}`);
    }
  }

  if (extractedData.invoiceNumber || extractedData.totalAmount) {
    try {
      const apId = await createAPRecord(extractedData, supplierId, supplierName);
      distributionLog.accountsPayable = { id: apId };
    } catch (err: any) {
      console.error("[AI-Doc] AP creation failed:", err.message);
      errors.push(`חשבון לתשלום: ${err.message}`);
    }
  }

  try {
    const jeId = await createJournalEntry(extractedData, supplierId, supplierName);
    if (jeId) {
      distributionLog.journalEntry = { id: jeId, type: extractedData.accountingType || "expense" };
    }
  } catch (err: any) {
    console.error("[AI-Doc] Journal entry failed:", err.message);
    errors.push(`פקודת יומן: ${err.message}`);
  }

  const items = extractedData.items || [];
  if (items.length > 0) {
    try {
      const materialIds = await upsertRawMaterials(items, supplierId);
      if (materialIds.length > 0) {
        distributionLog.rawMaterials = { ids: materialIds, count: materialIds.length };
      }
    } catch (err: any) {
      console.error("[AI-Doc] Raw materials failed:", err.message);
      errors.push(`חומרי גלם: ${err.message}`);
    }
  }

  try {
    const { folderId, folderName } = await autoAssignFolder(extractedData.documentType || "אחר");
    distributionLog.folder = { id: folderId, name: folderName };
  } catch (err: any) {
    console.error("[AI-Doc] Folder assignment failed:", err.message);
    errors.push(`תיקייה: ${err.message}`);
  }

  if (errors.length > 0) {
    distributionLog.warnings = errors;
  }

  return distributionLog;
}

router.use("/ai-documents" as any, requireAuth as any);

router.get("/ai-documents/history", async (req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM ${aiDocTable} ORDER BY created_at DESC LIMIT 100`);
    res.json(rows.rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-documents/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "לא נמצא קובץ בבקשה" });
      return;
    }

    const fileUrl = `/uploads/ai-documents/${req.file.filename}`;
    const docId = await aiDocInsert(req.file.originalname, fileUrl, "processing");

    res.json({ docId, fileName: req.file.originalname, fileUrl, status: "processing" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-documents/upload-batch", upload.array("files", 200), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "לא נמצאו קבצים בבקשה" });
      return;
    }

    const results: Array<{ docId: number; fileName: string; fileUrl: string }> = [];
    for (const file of files) {
      const fileUrl = `/uploads/ai-documents/${file.filename}`;
      const docId = await aiDocInsert(file.originalname, fileUrl, "pending");
      results.push({ docId, fileName: file.originalname, fileUrl });
    }

    res.json({ docs: results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-documents/smart-upload", upload.array("files", 50), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "לא נמצאו קבצים" });
      return;
    }

    const results: Array<{
      fileName: string;
      docId: number;
      status: string;
      documentType?: string;
      extractedData?: any;
      distributionLog?: any;
      folderId?: number;
      folderName?: string;
      error?: string;
    }> = [];

    for (const file of files) {
      const fileUrl = `/uploads/ai-documents/${file.filename}`;
      let docId = 0;

      try {
        docId = await aiDocInsert(file.originalname, fileUrl, "processing");

        const filePath = path.join(uploadsDir, file.filename);
        const extractedData = await extractDocumentData(filePath, file.originalname);

        await aiDocUpdateExtracted(docId, extractedData, extractedData.documentType || "אחר");

        const distributionLog = await distributeDocumentData(extractedData);

        const folderId = distributionLog.folder?.id;
        const folderName = distributionLog.folder?.name;

        const userId = req.userId || "1";
        await db.insert(documentFilesTable).values({
          name: file.originalname,
          originalName: file.originalname,
          folderId: folderId || null,
          mimeType: file.mimetype,
          size: file.size,
          filePath: file.filename,
          thumbnailPath: file.mimetype.startsWith("image/") ? file.filename : null,
          description: `${extractedData.documentType || "מסמך"} — ${extractedData.supplierName || ""} ${extractedData.invoiceNumber || ""}`.trim(),
          tags: [extractedData.documentType, extractedData.documentCategory, extractedData.supplierName].filter(Boolean),
          uploadedBy: String(userId),
        });

        await aiDocUpdateCompleted(docId, distributionLog);

        results.push({
          fileName: file.originalname,
          docId,
          status: "completed",
          documentType: extractedData.documentType,
          extractedData,
          distributionLog,
          folderId,
          folderName,
        });
      } catch (err: any) {
        if (docId) {
          await aiDocUpdateFailed(docId, err.message);
        }
        results.push({ fileName: file.originalname, docId, status: "failed", error: err.message });
      }
    }

    const succeeded = results.filter(r => r.status === "completed");
    const failed = results.filter(r => r.status === "failed");

    res.json({
      results,
      summary: {
        total: results.length,
        succeeded: succeeded.length,
        failed: failed.length,
        suppliersCreated: succeeded.filter(r => r.distributionLog?.supplier?.isNew).length,
        expensesCreated: succeeded.filter(r => r.distributionLog?.expense).length,
        apCreated: succeeded.filter(r => r.distributionLog?.accountsPayable).length,
        journalEntries: succeeded.filter(r => r.distributionLog?.journalEntry).length,
        materialsUpdated: succeeded.reduce((sum, r) => sum + (r.distributionLog?.rawMaterials?.count || 0), 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-documents/process-batch", async (req: Request, res: Response) => {
  const rawIds = req.body?.docIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    res.status(400).json({ error: "נדרש מערך של docIds" });
    return;
  }
  const docIds = rawIds.map((id: any) => parseInt(String(id), 10)).filter((id) => !isNaN(id) && id > 0);
  if (docIds.length === 0) {
    res.status(400).json({ error: "לא נמצאו מזהי מסמכים תקינים" });
    return;
  }

  const results: Array<{ docId: number; status: string; extractedData?: any; error?: string }> = [];

  for (const docId of docIds) {
    try {
      const doc = await aiDocSelect(docId);
      if (!doc) { results.push({ docId, status: "failed", error: "מסמך לא נמצא" }); continue; }

      const filePath = path.join(process.cwd(), doc.file_url.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) {
        await aiDocUpdateFailed(docId, "קובץ לא נמצא");
        results.push({ docId, status: "failed", error: "קובץ לא נמצא בשרת" });
        continue;
      }

      const extractedData = await extractDocumentData(filePath, doc.file_name);
      await aiDocUpdateExtracted(docId, extractedData, extractedData.documentType || "אחר");
      results.push({ docId, status: "extracted", extractedData });
    } catch (err: any) {
      await aiDocUpdateFailed(docId, err.message);
      results.push({ docId, status: "failed", error: err.message });
    }
  }

  res.json({ results, total: results.length, succeeded: results.filter(r => r.status === "extracted").length, failed: results.filter(r => r.status === "failed").length });
});

router.post("/ai-documents/distribute-batch", async (req: Request, res: Response) => {
  const rawIds = req.body?.docIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    res.status(400).json({ error: "נדרש מערך של docIds" });
    return;
  }
  const docIds = rawIds.map((id: any) => parseInt(String(id), 10)).filter((id) => !isNaN(id) && id > 0);
  if (docIds.length === 0) {
    res.status(400).json({ error: "לא נמצאו מזהי מסמכים תקינים" });
    return;
  }

  const results: Array<{ docId: number; status: string; distributionLog?: any; error?: string }> = [];

  for (const docId of docIds) {
    try {
      const doc = await aiDocSelect(docId);
      if (!doc) { results.push({ docId, status: "failed", error: "מסמך לא נמצא" }); continue; }

      const extractedData = doc.extracted_data
        ? (typeof doc.extracted_data === "string" ? JSON.parse(doc.extracted_data) : doc.extracted_data)
        : {};

      const distributionLog = await distributeDocumentData(extractedData);
      await aiDocUpdateCompleted(docId, distributionLog);

      results.push({ docId, status: "completed", distributionLog });
    } catch (err: any) {
      await aiDocUpdateFailed(docId, err.message);
      results.push({ docId, status: "failed", error: err.message });
    }
  }

  res.json({ results, total: results.length, succeeded: results.filter(r => r.status === "completed").length, failed: results.filter(r => r.status === "failed").length });
});

router.post("/ai-documents/process/:id", async (req: Request, res: Response) => {
  const docId = parseInt(String(req.params.id));
  try {
    const doc = await aiDocSelect(docId);
    if (!doc) {
      res.status(404).json({ error: "מסמך לא נמצא" });
      return;
    }

    const filePath = path.join(process.cwd(), doc.file_url.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      await aiDocUpdateFailed(docId, "קובץ לא נמצא");
      res.status(404).json({ error: "קובץ לא נמצא בשרת" });
      return;
    }

    const extractedData = await extractDocumentData(filePath, doc.file_name);
    await aiDocUpdateExtracted(docId, extractedData, extractedData.documentType || "אחר");

    res.json({ docId, extractedData, status: "extracted" });
  } catch (err: any) {
    await aiDocUpdateFailed(docId, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-documents/distribute/:id", async (req: Request, res: Response) => {
  const docId = parseInt(String(req.params.id));
  const { extractedData: clientData } = req.body;

  try {
    const doc = await aiDocSelect(docId);
    if (!doc) {
      res.status(404).json({ error: "מסמך לא נמצא" });
      return;
    }

    const extractedData = clientData || (doc.extracted_data ? (typeof doc.extracted_data === "string" ? JSON.parse(doc.extracted_data) : doc.extracted_data) : {});
    const distributionLog = await distributeDocumentData(extractedData);
    await aiDocUpdateCompleted(docId, distributionLog);

    res.json({ docId, distributionLog, status: "completed" });
  } catch (err: any) {
    await aiDocUpdateFailed(docId, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-documents/process-existing-file", async (req: Request, res: Response) => {
  try {
    const { fileId } = req.body;
    if (!fileId) {
      res.status(400).json({ error: "נדרש fileId" });
      return;
    }

    const [file] = await db.select().from(documentFilesTable).where(eq(documentFilesTable.id, parseInt(fileId)));
    if (!file) {
      res.status(404).json({ error: "קובץ לא נמצא" });
      return;
    }

    const docsUploadsDir = path.join(process.cwd(), "uploads", "documents");
    const filePath = path.join(docsUploadsDir, file.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "קובץ פיזי לא נמצא בשרת" });
      return;
    }

    const docId = await aiDocInsert(file.originalName, `/uploads/documents/${file.filePath}`, "processing", file.id);

    const extractedData = await extractDocumentData(filePath, file.originalName);
    await aiDocUpdateExtracted(docId, extractedData, extractedData.documentType || "אחר");

    const distributionLog = await distributeDocumentData(extractedData);

    const { folderId, folderName } = distributionLog.folder || {};
    if (folderId && folderId !== file.folderId) {
      await db.update(documentFilesTable)
        .set({
          folderId,
          description: `${extractedData.documentType || "מסמך"} — ${extractedData.supplierName || ""} ${extractedData.invoiceNumber || ""}`.trim(),
          tags: [extractedData.documentType, extractedData.documentCategory, extractedData.supplierName].filter(Boolean),
          updatedAt: new Date(),
        })
        .where(eq(documentFilesTable.id, file.id));
    }

    await aiDocUpdateCompleted(docId, distributionLog);

    res.json({
      success: true,
      docId,
      fileId: file.id,
      documentType: extractedData.documentType,
      extractedData,
      distributionLog,
      assignedFolder: folderName,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
