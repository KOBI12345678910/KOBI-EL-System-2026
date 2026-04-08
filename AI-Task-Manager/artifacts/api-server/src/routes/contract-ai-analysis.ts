import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import multer from "multer";
import path from "path";
import fs from "fs";
import mammoth from "mammoth";
import { createNotificationForAllUsers } from "../lib/notification-service";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "contract-ai");
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
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx"];
    cb(null, allowed.includes(ext));
  },
});

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_ai_analyses (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER,
      file_name TEXT,
      file_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      extracted_data JSONB,
      risk_score INTEGER,
      risk_level TEXT,
      risk_flags JSONB,
      missing_protections JSONB,
      key_terms JSONB,
      obligations JSONB,
      parties JSONB,
      financial_commitments JSONB,
      language TEXT DEFAULT 'auto',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_caa_contract_id ON contract_ai_analyses(contract_id);
    CREATE INDEX IF NOT EXISTS idx_caa_status ON contract_ai_analyses(status);
    CREATE INDEX IF NOT EXISTS idx_caa_risk_level ON contract_ai_analyses(risk_level);

    CREATE TABLE IF NOT EXISTS contract_ai_obligations (
      id SERIAL PRIMARY KEY,
      analysis_id INTEGER NOT NULL REFERENCES contract_ai_analyses(id) ON DELETE CASCADE,
      contract_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      obligation_type TEXT NOT NULL DEFAULT 'כללי',
      responsible_party TEXT,
      due_date DATE,
      amount NUMERIC,
      currency TEXT DEFAULT 'ILS',
      status TEXT NOT NULL DEFAULT 'ממתין',
      reminder_days_before INTEGER DEFAULT 7,
      auto_created BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cao_analysis_id ON contract_ai_obligations(analysis_id);
    CREATE INDEX IF NOT EXISTS idx_cao_contract_id ON contract_ai_obligations(contract_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cao_analysis_title ON contract_ai_obligations(analysis_id, title);
  `);
}

let tablesReady = false;
async function init() {
  if (!tablesReady) {
    await ensureTables();
    tablesReady = true;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface ExtractedParty {
  name: string;
  role: string;
  taxId?: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
}

interface ExtractedObligation {
  title: string;
  description?: string;
  type?: string;
  responsibleParty?: string;
  dueDate?: string;
  amount?: number;
  currency?: string;
  isRecurring?: boolean;
  frequency?: string;
}

interface ExtractedFinancialCommitment {
  type?: string;
  amount?: number;
  currency?: string;
  description?: string;
  dueDate?: string;
  frequency?: string;
}

interface ExtractedKeyTerms {
  liabilityCap?: string | null;
  liabilityCapAmount?: number | null;
  indemnification?: string | null;
  confidentiality?: string | null;
  intellectualProperty?: string | null;
  disputeResolution?: string | null;
  governingLaw?: string | null;
  exclusivity?: string | null;
  nonCompete?: string | null;
  forceMajeure?: string | null;
  warrantyTerms?: string | null;
  penaltyClause?: string | null;
  terminationRights?: string | null;
  changeOrderProcess?: string | null;
}

interface ExtractedContractData {
  language?: string;
  contractTitle?: string;
  contractType?: string;
  parties?: ExtractedParty[];
  dates?: {
    signDate?: string;
    startDate?: string;
    endDate?: string;
    renewalDate?: string;
    terminationNoticeDate?: string;
  };
  financialCommitments?: ExtractedFinancialCommitment[];
  totalContractValue?: number;
  currency?: string;
  paymentTerms?: string;
  autoRenewal?: boolean;
  renewalTermMonths?: number;
  terminationNoticeDays?: number;
  keyTerms?: ExtractedKeyTerms;
  obligations?: ExtractedObligation[];
  notes?: string;
}

interface RiskFlag {
  type: string;
  severity: string;
  label: string;
  description: string;
  clause?: string;
  recommendation?: string;
}

interface RiskResult {
  score: number;
  level: string;
  flags: RiskFlag[];
  missingProtections: RiskFlag[];
}

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function callClaude(prompt: string, fileData?: { base64: string; mediaType: string }): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";

  if (!apiKey) throw new Error("Anthropic API key not configured");

  const userContent: ClaudeContentBlock[] = [];

  if (fileData) {
    if (fileData.mediaType === "application/pdf") {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: fileData.base64 },
      });
    } else {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: fileData.mediaType, data: fileData.base64 },
      });
    }
  }

  userContent.push({ type: "text", text: prompt });

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: userContent }],
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

  const data = await response.json() as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text || "";
}

function extractJson(text: string): ExtractedContractData | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]) as ExtractedContractData; } catch {}
  }
  return null;
}

async function analyzeContract(filePath: string, originalName: string): Promise<ExtractedContractData> {
  const ext = path.extname(originalName).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
  const isPdf = ext === ".pdf";
  const isWord = ext === ".docx";

  let fileData: { base64: string; mediaType: string } | undefined;
  let docxText = "";

  if (isImage || isPdf) {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    const mediaTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
      ".pdf": "application/pdf",
    };
    fileData = { base64, mediaType: mediaTypeMap[ext] || "application/pdf" };
  } else if (isWord) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      docxText = result.value || "";
    } catch (e: unknown) {
      console.error("[ContractAI] DOCX extraction error:", errMsg(e));
      docxText = "";
    }
  }

  const extractionPrompt = `אתה מומחה לניתוח חוזים משפטיים עסקיים. נתח את החוזה המצורף בעיון וחלץ את כל המידע המשפטי והעסקי הרלוונטי.
תמוך בעברית ואנגלית כאחד.

החזר JSON בדיוק בפורמט הבא (ורק JSON, ללא הסבר):
{
  "language": "he|en|mixed",
  "contractTitle": "כותרת החוזה",
  "contractType": "ספק|לקוח|עובד|קבלן|שותפות|NDA|SLA|שכירות|ביטוח|הלוואה|אחר",
  "parties": [
    {
      "name": "שם הצד",
      "role": "צד א|צד ב|ספק|לקוח|מעסיק|עובד|מלווה|לווה",
      "taxId": "ח.פ. / ע.מ.",
      "address": "כתובת",
      "contactPerson": "איש קשר",
      "email": "אימייל",
      "phone": "טלפון"
    }
  ],
  "dates": {
    "signDate": "YYYY-MM-DD",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "renewalDate": "YYYY-MM-DD",
    "terminationNoticeDate": "YYYY-MM-DD"
  },
  "financialCommitments": [
    {
      "type": "תשלום חד פעמי|תשלום חודשי|ריטיינר|בונוס|קנס|ערבות",
      "amount": 0,
      "currency": "ILS",
      "description": "תיאור",
      "dueDate": "YYYY-MM-DD",
      "frequency": "חודשי|רבעוני|שנתי|חד פעמי"
    }
  ],
  "totalContractValue": 0,
  "currency": "ILS",
  "paymentTerms": "תנאי תשלום",
  "autoRenewal": true,
  "renewalTermMonths": 12,
  "terminationNoticeDays": 30,
  "keyTerms": {
    "liabilityCap": "תיאור מגבלת אחריות (null אם לא קיים)",
    "liabilityCapAmount": 0,
    "indemnification": "תיאור סעיפי שיפוי (null אם לא קיים)",
    "confidentiality": "סעיף סודיות (null אם לא קיים)",
    "intellectualProperty": "קניין רוחני (null אם לא קיים)",
    "disputeResolution": "יישוב סכסוכים",
    "governingLaw": "דין החל",
    "exclusivity": "בלעדיות (null אם לא קיים)",
    "nonCompete": "תחרות (null אם לא קיים)",
    "forceMajeure": "כוח עליון (null אם לא קיים)",
    "warrantyTerms": "אחריות/ערבות (null אם לא קיים)",
    "penaltyClause": "קנסות (null אם לא קיים)",
    "terminationRights": "זכויות סיום חוזה",
    "changeOrderProcess": "תהליך שינויים (null אם לא קיים)"
  },
  "obligations": [
    {
      "title": "כותרת ההתחייבות",
      "description": "תיאור מפורט",
      "type": "תשלום|אספקה|ביצוע|דיווח|חידוש|ביקורת|ביטוח|אחר",
      "responsibleParty": "שם הצד האחראי",
      "dueDate": "YYYY-MM-DD",
      "amount": 0,
      "currency": "ILS",
      "isRecurring": false,
      "frequency": "חודשי|רבעוני|שנתי|null"
    }
  ],
  "notes": "הערות נוספות"
}

כללים:
- null לשדות לא קיימים במסמך
- זהה את כל התאריכים בצורה מדויקת
- חלץ כל ההתחייבויות הספציפיות עם תאריכים
- הבן את שפת החוזה (עברית/אנגלית/מעורב)
- ענה ב-JSON תקני בלבד`;

  let finalPrompt = extractionPrompt;
  if (isWord && docxText) {
    finalPrompt = `${extractionPrompt}\n\n--- תוכן המסמך (Word) ---\n${docxText.slice(0, 40000)}\n--- סוף המסמך ---`;
  }

  const result = await callClaude(finalPrompt, fileData);
  const parsed = extractJson(result);
  return parsed || { contractType: "אחר", notes: "לא ניתן לחלץ נתונים" };
}

function calculateRiskScore(extracted: ExtractedContractData): RiskResult {
  const flags: RiskFlag[] = [];
  const missingProtections: RiskFlag[] = [];
  let riskPoints = 0;

  const keyTerms = extracted.keyTerms || {};

  if (!keyTerms.liabilityCap) {
    riskPoints += 20;
    missingProtections.push({
      type: "missing_liability_cap",
      severity: "high",
      label: "חסר: מגבלת אחריות",
      description: "החוזה אינו כולל מגבלת אחריות (Liability Cap) — חשיפה לתביעות ללא הגבלה",
      recommendation: "הוסף סעיף מגבלת אחריות עד לסכום מוגדר",
    });
  }

  if (!keyTerms.confidentiality) {
    riskPoints += 10;
    missingProtections.push({
      type: "missing_confidentiality",
      severity: "medium",
      label: "חסר: סעיף סודיות",
      description: "אין הוראת סודיות מפורשת — מידע עסקי עלול להיחשף",
      recommendation: "הוסף סעיף NDA / סודיות מפורש",
    });
  }

  if (!keyTerms.terminationRights || keyTerms.terminationRights === "null") {
    riskPoints += 15;
    missingProtections.push({
      type: "missing_termination",
      severity: "high",
      label: "חסר: זכויות סיום חוזה",
      description: "אין הוראות ברורות לסיום החוזה — קושי לצאת מהתקשרות",
      recommendation: "הגדר תנאי סיום, הודעה מוקדמת וסיום מיידי במקרה הפרה",
    });
  }

  if (!keyTerms.disputeResolution || keyTerms.disputeResolution === "null") {
    riskPoints += 8;
    missingProtections.push({
      type: "missing_dispute_resolution",
      severity: "medium",
      label: "חסר: יישוב סכסוכים",
      description: "לא הוגדר מנגנון יישוב סכסוכים",
      recommendation: "הוסף סעיף בוררות/גישור או הגדר סמכות שיפוט",
    });
  }

  if (!keyTerms.forceMajeure) {
    riskPoints += 7;
    missingProtections.push({
      type: "missing_force_majeure",
      severity: "low",
      label: "חסר: כוח עליון",
      description: "אין הגנה בפני נסיבות חריגות (מגיפה, מלחמה, אסון טבע)",
      recommendation: "הוסף סעיף כוח עליון (Force Majeure)",
    });
  }

  if (extracted.autoRenewal === true) {
    const noticeDays = extracted.terminationNoticeDays;
    if (!noticeDays || noticeDays < 30) {
      riskPoints += 15;
      flags.push({
        type: "auto_renewal_risk",
        severity: "high",
        label: "חידוש אוטומטי עם הודעה קצרה",
        description: `החוזה מתחדש אוטומטית עם הודעה של ${noticeDays || 0} ימים בלבד — עלול להוביל לחידוש לא מכוון`,
        clause: "סעיף חידוש אוטומטי",
      });
    }
  }

  if (keyTerms.indemnification && keyTerms.indemnification !== "null") {
    const indemnText = String(keyTerms.indemnification).toLowerCase();
    if (indemnText.includes("צד שני") || indemnText.includes("כל נזק") || indemnText.includes("unlimited") || indemnText.includes("all damages")) {
      riskPoints += 18;
      flags.push({
        type: "one_sided_indemnification",
        severity: "critical",
        label: "שיפוי חד-צדדי",
        description: "סעיף השיפוי נראה חד-צדדי לטובת הצד השני — חשיפה לאחריות בלתי מוגבלת",
        clause: "סעיף שיפוי",
      });
    }
  }

  if (keyTerms.penaltyClause && keyTerms.penaltyClause !== "null") {
    riskPoints += 10;
    flags.push({
      type: "penalty_clause",
      severity: "medium",
      label: "סעיף קנסות",
      description: "קיים סעיף קנסות בחוזה — יש לוודא שהקנסות סבירים ודו-צדדיים",
      clause: "סעיף קנסות",
    });
  }

  if (keyTerms.exclusivity && keyTerms.exclusivity !== "null") {
    riskPoints += 12;
    flags.push({
      type: "exclusivity",
      severity: "medium",
      label: "סעיף בלעדיות",
      description: "החוזה כולל סעיף בלעדיות — עלול להגביל עסקים עם גורמים אחרים",
      clause: "סעיף בלעדיות",
    });
  }

  if (keyTerms.nonCompete && keyTerms.nonCompete !== "null") {
    riskPoints += 10;
    flags.push({
      type: "non_compete",
      severity: "medium",
      label: "אי תחרות / הגבלות",
      description: "קיים סעיף אי-תחרות — יש לבדוק היקף, משך ותחום גיאוגרפי",
      clause: "סעיף אי-תחרות",
    });
  }

  const totalValue = extracted.totalContractValue || 0;
  if (totalValue > 1000000) {
    riskPoints += 10;
    flags.push({
      type: "high_value",
      severity: "medium",
      label: "חוזה בשווי גבוה",
      description: `שווי החוזה (${new Intl.NumberFormat("he-IL", { style: "currency", currency: extracted.currency || "ILS" }).format(totalValue)}) מצדיק בדיקה משפטית נוספת`,
      clause: "שווי כלכלי",
    });
  }

  const clampedScore = Math.min(100, riskPoints);
  let level = "low";
  if (clampedScore >= 60) level = "critical";
  else if (clampedScore >= 40) level = "high";
  else if (clampedScore >= 20) level = "medium";

  return { score: clampedScore, level, flags, missingProtections };
}

async function createApprovedObligations(analysisId: number, contractId: number | null, obligations: ExtractedObligation[]): Promise<number[]> {
  const ids: number[] = [];
  for (const ob of obligations) {
    if (!ob.title) continue;
    try {
      const { rows } = await pool.query(
        `INSERT INTO contract_ai_obligations (analysis_id, contract_id, title, description, obligation_type, responsible_party, due_date, amount, currency, auto_created)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
         ON CONFLICT (analysis_id, title) DO UPDATE SET
           description = EXCLUDED.description,
           due_date = EXCLUDED.due_date,
           amount = EXCLUDED.amount
         RETURNING id`,
        [
          analysisId,
          contractId || null,
          ob.title,
          ob.description || null,
          ob.type || "כללי",
          ob.responsibleParty || null,
          ob.dueDate || null,
          ob.amount || null,
          ob.currency || "ILS",
        ]
      );
      if (rows[0]?.id) ids.push(rows[0].id);

      if (contractId) {
        await pool.query(
          `INSERT INTO clm_contract_obligations (contract_id, title, description, obligation_type, responsible_party, due_date, amount, currency, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ממתין')
           ON CONFLICT DO NOTHING`,
          [contractId, ob.title, ob.description || null, ob.type || "כללי", ob.responsibleParty || null, ob.dueDate || null, ob.amount || 0, ob.currency || "ILS"]
        ).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ContractAI] Obligation creation failed:", msg);
    }
  }
  return ids;
}

router.use(async (_req, _res, next) => {
  await init();
  next();
});

router.post("/contract-ai/analyze", upload.single("file"), async (req: Request, res: Response) => {
  const file = req.file;
  const contractId = req.body?.contractId ? parseInt(req.body.contractId) : null;

  if (!file) {
    res.status(400).json({ error: "נדרש קובץ לניתוח" });
    return;
  }

  let analysisId = 0;
  try {
    const { rows: insertRows } = await pool.query(
      `INSERT INTO contract_ai_analyses (contract_id, file_name, file_path, status) VALUES ($1, $2, $3, 'processing') RETURNING id`,
      [contractId, file.originalname, file.filename]
    );
    analysisId = insertRows[0]?.id;

    const filePath = path.join(uploadsDir, file.filename);
    const extracted = await analyzeContract(filePath, file.originalname);

    const risk = calculateRiskScore(extracted);

    await pool.query(
      `UPDATE contract_ai_analyses SET
        status = 'completed',
        extracted_data = $1,
        risk_score = $2,
        risk_level = $3,
        risk_flags = $4,
        missing_protections = $5,
        key_terms = $6,
        obligations = $7,
        parties = $8,
        financial_commitments = $9,
        language = $10,
        updated_at = NOW()
       WHERE id = $11`,
      [
        JSON.stringify(extracted),
        risk.score,
        risk.level,
        JSON.stringify(risk.flags),
        JSON.stringify(risk.missingProtections),
        JSON.stringify(extracted.keyTerms || {}),
        JSON.stringify(extracted.obligations || []),
        JSON.stringify(extracted.parties || []),
        JSON.stringify(extracted.financialCommitments || []),
        extracted.language || "auto",
        analysisId,
      ]
    );

    if (contractId) {
      try {
        const dates = extracted.dates || {};
        const updateFields: string[] = [];
        const updateParams: (string | number | boolean | null)[] = [];

        const pushUpdate = (field: string, value: string | number | boolean | null) => {
          if (value !== undefined && value !== null && value !== "" && value !== "null") {
            updateParams.push(value);
            updateFields.push(`${field} = $${updateParams.length}`);
          }
        };

        if (dates.startDate) pushUpdate("start_date", dates.startDate);
        if (dates.endDate) pushUpdate("end_date", dates.endDate);
        if (dates.signDate) pushUpdate("signed_date", dates.signDate);
        if (extracted.autoRenewal !== undefined) pushUpdate("auto_renewal", extracted.autoRenewal);
        if (extracted.renewalTermMonths) pushUpdate("renewal_period_months", extracted.renewalTermMonths);
        if (extracted.terminationNoticeDays) pushUpdate("termination_notice_days", extracted.terminationNoticeDays);
        if (extracted.paymentTerms) pushUpdate("payment_terms", extracted.paymentTerms);
        if (extracted.totalContractValue && extracted.totalContractValue > 0) pushUpdate("total_value", extracted.totalContractValue);
        if (extracted.currency) pushUpdate("currency", extracted.currency);
        if (extracted.contractType) pushUpdate("contract_type", extracted.contractType);

        const aiNote = `\n\n[AI Analysis ${new Date().toLocaleDateString("he-IL")}: סיכון ${risk.level.toUpperCase()} (${risk.score}/100)]`;
        updateParams.push(aiNote);
        updateFields.push(`notes = COALESCE(notes, '') || $${updateParams.length}`);

        updateParams.push(contractId);
        if (updateFields.length > 1) {
          await pool.query(
            `UPDATE clm_contracts SET ${updateFields.join(", ")}, updated_at = NOW() WHERE id = $${updateParams.length}`,
            updateParams
          );
        }

        if ((extracted.parties ?? []).length > 0) {
          for (const party of extracted.parties ?? []) {
            if (!party.name) continue;
            await pool.query(
              `INSERT INTO clm_contract_parties (contract_id, party_type, party_name, contact_person, contact_email, contact_phone, role)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT DO NOTHING`,
              [contractId, party.role || "צד", party.name, party.contactPerson || null, party.email || null, party.phone || null, party.role || null]
            ).catch(() => {});
          }
        }
      } catch (e: unknown) {
        console.error("[ContractAI] clm_contracts update error:", errMsg(e));
      }
    }

    const obligationIds = await createApprovedObligations(analysisId, contractId, extracted.obligations ?? []);

    res.json({
      analysisId,
      contractId,
      extracted,
      risk: { score: risk.score, level: risk.level, flags: risk.flags, missingProtections: risk.missingProtections },
      obligationsCreated: obligationIds.length,
      status: "completed",
    });
  } catch (err: unknown) {
    if (analysisId) {
      await pool.query(`UPDATE contract_ai_analyses SET status = 'failed', updated_at = NOW() WHERE id = $1`, [analysisId]).catch(() => {});
    }
    console.error("[ContractAI] Analysis failed:", errMsg(err));
    res.status(500).json({ error: errMsg(err) });
  }
});

router.get("/contract-ai/analysis/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM contract_ai_analyses WHERE id = $1`, [parseInt(String(req.params.id))]);
    if (!rows.length) { res.status(404).json({ error: "ניתוח לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.get("/contract-ai/analyses", async (req: Request, res: Response) => {
  try {
    const contractId = req.query.contractId ? String(req.query.contractId) : null;
    const riskLevel = req.query.riskLevel ? String(req.query.riskLevel) : null;
    const limit = req.query.limit ? String(req.query.limit) : "50";
    const offset = req.query.offset ? String(req.query.offset) : "0";
    let query = `SELECT * FROM contract_ai_analyses WHERE 1=1`;
    const params: (string | number | null)[] = [];
    if (contractId) { params.push(contractId); query += ` AND contract_id = $${params.length}`; }
    if (riskLevel) { params.push(riskLevel); query += ` AND risk_level = $${params.length}`; }
    params.push(limit); params.push(offset);
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await pool.query(query, params);
    res.json({ analyses: rows, total: rows.length });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.get("/contract-ai/risk-dashboard", async (req: Request, res: Response) => {
  try {
    const { rows: distribution } = await pool.query(
      `SELECT risk_level, COUNT(*) as count FROM contract_ai_analyses WHERE status = 'completed' GROUP BY risk_level`
    );
    const { rows: avgScore } = await pool.query(
      `SELECT AVG(risk_score)::numeric(5,1) as avg FROM contract_ai_analyses WHERE status = 'completed'`
    );
    const { rows: topRisk } = await pool.query(
      `SELECT id, file_name, contract_id, risk_score, risk_level, created_at FROM contract_ai_analyses WHERE status = 'completed' ORDER BY risk_score DESC LIMIT 10`
    );
    const { rows: recent } = await pool.query(
      `SELECT id, file_name, contract_id, risk_score, risk_level, status, created_at FROM contract_ai_analyses ORDER BY created_at DESC LIMIT 20`
    );
    const { rows: obligationStats } = await pool.query(
      `SELECT status, COUNT(*) as count FROM contract_ai_obligations GROUP BY status`
    );

    res.json({
      distribution,
      avgRiskScore: Number(avgScore[0]?.avg || 0),
      topRiskContracts: topRisk,
      recentAnalyses: recent,
      obligationStats,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.get("/contract-ai/obligations", async (req: Request, res: Response) => {
  try {
    const analysisId = req.query.analysisId ? String(req.query.analysisId) : null;
    const contractId = req.query.contractId ? String(req.query.contractId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    let query = `SELECT * FROM contract_ai_obligations WHERE 1=1`;
    const params: (string | number | null)[] = [];
    if (analysisId) { params.push(analysisId); query += ` AND analysis_id = $${params.length}`; }
    if (contractId) { params.push(contractId); query += ` AND contract_id = $${params.length}`; }
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    query += ` ORDER BY due_date ASC NULLS LAST, created_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json({ obligations: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.patch("/contract-ai/obligations/:id", async (req: Request, res: Response) => {
  try {
    const { status, reminder_days_before } = req.body;
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (status) { params.push(status); updates.push(`status = $${params.length}`); }
    if (reminder_days_before !== undefined) { params.push(reminder_days_before); updates.push(`reminder_days_before = $${params.length}`); }

    if (!updates.length) { res.status(400).json({ error: "אין שדות לעדכון" }); return; }

    params.push(parseInt(String(req.params.id)));
    await pool.query(`UPDATE contract_ai_obligations SET ${updates.join(", ")} WHERE id = $${params.length}`, params);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/contract-ai/re-analyze/:id", async (req: Request, res: Response) => {
  try {
    const analysisId = parseInt(String(req.params.id));
    const { rows } = await pool.query(`SELECT * FROM contract_ai_analyses WHERE id = $1`, [analysisId]);
    if (!rows.length) { res.status(404).json({ error: "ניתוח לא נמצא" }); return; }

    const analysis = rows[0];
    const filePath = path.join(uploadsDir, analysis.file_path);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: "קובץ לא נמצא" }); return; }

    await pool.query(`UPDATE contract_ai_analyses SET status = 'processing', updated_at = NOW() WHERE id = $1`, [analysisId]);

    const extracted = await analyzeContract(filePath, analysis.file_name);
    const risk = calculateRiskScore(extracted);

    await pool.query(
      `UPDATE contract_ai_analyses SET status = 'completed', extracted_data = $1, risk_score = $2, risk_level = $3, risk_flags = $4, missing_protections = $5, key_terms = $6, obligations = $7, parties = $8, financial_commitments = $9, language = $10, updated_at = NOW() WHERE id = $11`,
      [JSON.stringify(extracted), risk.score, risk.level, JSON.stringify(risk.flags), JSON.stringify(risk.missingProtections), JSON.stringify(extracted.keyTerms || {}), JSON.stringify(extracted.obligations || []), JSON.stringify(extracted.parties || []), JSON.stringify(extracted.financialCommitments || []), extracted.language || "auto", analysisId]
    );

    res.json({ analysisId, extracted, risk, status: "completed" });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.delete("/contract-ai/analysis/:id", async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM contract_ai_analyses WHERE id = $1`, [parseInt(String(req.params.id))]);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

router.post("/contract-ai/obligations/:analysisId/approve", async (req: Request, res: Response) => {
  try {
    const analysisId = parseInt(String(req.params.analysisId));
    const approvedIndices: number[] = Array.isArray(req.body.approvedIndices) ? req.body.approvedIndices : [];

    const { rows } = await pool.query(`SELECT * FROM contract_ai_analyses WHERE id = $1`, [analysisId]);
    if (!rows.length) { res.status(404).json({ error: "ניתוח לא נמצא" }); return; }

    const analysis = rows[0];
    const contractId = analysis.contract_id ? parseInt(String(analysis.contract_id)) : null;
    const allObligations: ExtractedObligation[] = typeof analysis.obligations === "string"
      ? JSON.parse(analysis.obligations)
      : (analysis.obligations || []);

    const toCreate = approvedIndices.length > 0
      ? allObligations.filter((_ob, i) => approvedIndices.includes(i))
      : allObligations;

    const ids = await createApprovedObligations(analysisId, contractId, toCreate);
    res.json({ success: true, created: ids.length, ids });
  } catch (err: unknown) {
    res.status(500).json({ error: errMsg(err) });
  }
});

async function runObligationReminderScheduler() {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, a.file_name as contract_name
      FROM contract_ai_obligations o
      JOIN contract_ai_analyses a ON o.analysis_id = a.id
      WHERE o.status = 'ממתין'
        AND o.due_date IS NOT NULL
        AND o.due_date >= CURRENT_DATE
        AND o.due_date <= CURRENT_DATE + (o.reminder_days_before || ' days')::INTERVAL
    `);

    for (const ob of rows) {
      const daysLeft = Math.ceil((new Date(ob.due_date).getTime() - Date.now()) / 86400000);
      const dedupeKey = `contract-obligation-reminder-${ob.id}-${ob.due_date}`;
      await createNotificationForAllUsers({
        type: "contract_obligation_due",
        title: `התחייבות חוזית: ${ob.title}`,
        message: `"${ob.title}" מחוזה ${ob.contract_name} — ${daysLeft <= 0 ? "פג תוקף היום" : `${daysLeft} ימים נותרו`} (${ob.due_date})`,
        priority: daysLeft <= 1 ? "critical" : daysLeft <= 7 ? "high" : "normal",
        category: "task",
        actionUrl: `/contracts/ai-analysis`,
        metadata: { obligationId: ob.id, analysisId: ob.analysis_id, contractId: ob.contract_id, daysLeft },
        dedupeKey,
      });
    }

    if (rows.length > 0) {
      console.info(`[ContractAI-Reminders] Dispatched ${rows.length} obligation reminders`);
    }
  } catch (e: unknown) {
    console.error("[ContractAI-Reminders] Scheduler error:", errMsg(e));
  }
}

const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;
let reminderTimer: ReturnType<typeof setInterval> | null = null;

export function startContractAIReminderScheduler() {
  if (reminderTimer) return;
  init().then(() => {
    runObligationReminderScheduler();
    reminderTimer = setInterval(runObligationReminderScheduler, REMINDER_INTERVAL_MS);
    console.info(`[ContractAI-Reminders] Reminder scheduler started (every 6h)`);
  }).catch((e: unknown) => {
    console.error("[ContractAI-Reminders] Failed to start scheduler:", errMsg(e));
  });
}

export default router;
