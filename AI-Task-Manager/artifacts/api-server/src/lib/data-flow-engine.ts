import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, sql, desc, gte, lte, isNull } from "drizzle-orm";

export interface FlowResult {
  flowId: string;
  flowName: string;
  source: string;
  target: string;
  success: boolean;
  recordsAffected: number;
  details?: Record<string, any>;
  error?: string;
  errors?: string[];
  timestamp: string;
  durationMs: number;
}

const flowHistory: FlowResult[] = [];
const MAX_HISTORY = 500;

async function logFlowToDB(result: FlowResult) {
  try {
    await db.execute(sql`INSERT INTO automation_log (flow_id, flow_name, affected, status, details, created_at)
      VALUES (${result.flowId}, ${result.flowName}, ${result.recordsAffected + ' records'}, ${result.success ? 'success' : 'error'}, ${JSON.stringify(result.details || {})}::jsonb, NOW())`);
  } catch (_e) {}
}

function addFlowResult(result: FlowResult) {
  flowHistory.unshift(result);
  if (flowHistory.length > MAX_HISTORY) flowHistory.length = MAX_HISTORY;
  logFlowToDB(result);
}

export function getFlowHistory(limit = 100): FlowResult[] {
  return flowHistory.slice(0, limit);
}

export function getFlowStats() {
  const last24h = flowHistory.filter(r => new Date(r.timestamp).getTime() > Date.now() - 86400000);
  const successCount = last24h.filter(r => r.success).length;
  const totalRecords = last24h.reduce((s, r) => s + r.recordsAffected, 0);
  const byFlow: Record<string, { runs: number; success: number; records: number }> = {};
  for (const r of last24h) {
    if (!byFlow[r.flowId]) byFlow[r.flowId] = { runs: 0, success: 0, records: 0 };
    byFlow[r.flowId].runs++;
    if (r.success) byFlow[r.flowId].success++;
    byFlow[r.flowId].records += r.recordsAffected;
  }
  return {
    total: flowHistory.length,
    last24h: last24h.length,
    successRate: last24h.length > 0 ? Math.round((successCount / last24h.length) * 100) : 100,
    totalRecords,
    byFlow,
  };
}

async function safeQuery(queryFn: () => Promise<any>): Promise<any[]> {
  try {
    const result = await queryFn();
    return (result as any)?.rows || [];
  } catch {
    return [];
  }
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`SELECT to_regclass(${tableName}) as cls`);
    return !!(result as any)?.rows?.[0]?.cls;
  } catch { return false; }
}

async function notify(title: string, message: string, recordId?: number) {
  try {
    await db.insert(notificationsTable).values({
      type: "automation",
      title,
      message,
      recordId: recordId || null,
    });
  } catch {}
}

const processedGRs = new Set<number>();

export async function runFlow(flowId: string): Promise<FlowResult> {
  const start = Date.now();
  const flow = FLOWS.find(f => f.id === flowId);
  if (!flow) {
    const result: FlowResult = {
      flowId, flowName: flowId, source: "", target: "", success: false,
      recordsAffected: 0, error: "Flow not found", timestamp: new Date().toISOString(), durationMs: 0,
    };
    addFlowResult(result);
    return result;
  }
  try {
    const res = await flow.execute();
    const hasErrors = res.errors && res.errors.length > 0;
    const result: FlowResult = {
      flowId: flow.id, flowName: flow.name, source: flow.source, target: flow.target,
      success: !hasErrors || res.affected > 0,
      recordsAffected: res.affected,
      details: res.details,
      errors: res.errors,
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    };
    addFlowResult(result);
    if (res.affected > 0) {
      await notify(`אוטומציה: ${flow.name}`, `${res.affected} רשומות עודכנו | ${flow.source} → ${flow.target}`);
    }
    return result;
  } catch (err: any) {
    const result: FlowResult = {
      flowId: flow.id, flowName: flow.name, source: flow.source, target: flow.target,
      success: false, recordsAffected: 0, error: err.message,
      timestamp: new Date().toISOString(), durationMs: Date.now() - start,
    };
    addFlowResult(result);
    return result;
  }
}

export async function runAllFlows(): Promise<FlowResult[]> {
  const results: FlowResult[] = [];
  for (const flow of FLOWS) {
    results.push(await runFlow(flow.id));
  }
  return results;
}

interface FlowExecResult {
  affected: number;
  details: Record<string, any>;
  errors?: string[];
}

interface FlowDef {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  source: string;
  target: string;
  category: string;
  icon: string;
  execute: () => Promise<FlowExecResult>;
}

const FLOWS: FlowDef[] = [
  {
    id: "po-to-ap",
    name: "הזמנת רכש → חשבונות זכאים",
    nameEn: "Purchase Order → Accounts Payable",
    description: "הזמנות רכש מאושרות/שהתקבלו נכנסות אוטומטית לחשבונות זכאים",
    source: "purchase_orders", target: "accounts_payable", category: "procurement", icon: "ShoppingCart",
    execute: async () => {
      if (!(await tableExists("purchase_orders")) || !(await tableExists("accounts_payable"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT po.id, po.supplier_id, po.total_amount, po.order_number, po.status, po.created_at,
               s.name as supplier_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.status IN ('approved','received','completed','delivered')
        AND po.id NOT IN (SELECT COALESCE((metadata->>'source_po_id')::int, 0) FROM accounts_payable WHERE metadata->>'source_po_id' IS NOT NULL)
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const po of rows) {
        const amount = Number(po.total_amount || 0);
        if (amount <= 0) continue;
        try {
          await db.execute(sql`
            INSERT INTO accounts_payable (supplier_id, amount, balance_due, status, due_date, description, metadata, created_at)
            VALUES (
              ${po.supplier_id},
              ${amount},
              ${amount},
              'pending',
              ${sql`CURRENT_DATE + INTERVAL '30 days'`},
              ${`הזמנת רכש ${po.order_number || po.id}`},
              ${JSON.stringify({ source_po_id: po.id, source: "automation", supplier_name: po.supplier_name || "" })},
              NOW()
            )
          `);
          affected++;
        } catch (err: any) {
          errors.push(`PO#${po.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "gr-to-inventory",
    name: "קבלת טובין → עדכון מלאי חומרי גלם",
    nameEn: "Goods Receipt → Raw Materials Inventory",
    description: "קבלת טובין מעדכנת כמויות בחומרי גלם",
    source: "goods_receipts", target: "raw_materials", category: "procurement", icon: "Package",
    execute: async () => {
      if (!(await tableExists("goods_receipts")) || !(await tableExists("raw_materials"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT gr.id, gr.items, gr.status, gr.metadata
        FROM goods_receipts gr
        WHERE gr.status IN ('received','approved','completed')
        AND (gr.metadata IS NULL OR gr.metadata->>'inventory_synced' IS NULL)
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const gr of rows) {
        if (processedGRs.has(gr.id)) continue;
        const items = typeof gr.items === "string" ? JSON.parse(gr.items) : (gr.items || []);
        if (!Array.isArray(items)) continue;
        let grUpdated = false;
        for (const item of items) {
          const materialId = item.material_id || item.raw_material_id;
          const qty = Number(item.quantity || item.received_quantity || 0);
          if (!materialId || qty <= 0) continue;
          try {
            await db.execute(sql`
              UPDATE raw_materials
              SET current_stock = COALESCE(current_stock, 0) + ${qty},
                  updated_at = NOW()
              WHERE id = ${Number(materialId)}
            `);
            grUpdated = true;
            affected++;
          } catch (err: any) {
            errors.push(`GR#${gr.id} material#${materialId}: ${err.message}`);
          }
        }
        if (grUpdated) {
          try {
            await db.execute(sql`
              UPDATE goods_receipts
              SET metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'), '{inventory_synced}', ${`"${new Date().toISOString()}"`}::jsonb)
              WHERE id = ${gr.id}
            `);
            processedGRs.add(gr.id);
          } catch (err: any) {
            errors.push(`GR#${gr.id} sync mark: ${err.message}`);
          }
        }
      }
      return { affected, details: { receipts: rows.length }, errors };
    }
  },
  {
    id: "invoice-to-gl",
    name: "חשבוניות → ספר ראשי (GL)",
    nameEn: "Invoices → General Ledger",
    description: "חשבוניות מאושרות יוצרות פקודות יומן אוטומטית",
    source: "accounts_payable", target: "journal_entries", category: "finance", icon: "BookOpen",
    execute: async () => {
      if (!(await tableExists("accounts_payable")) || !(await tableExists("journal_entries"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT ap.id, ap.supplier_id, ap.amount, ap.description, ap.created_at
        FROM accounts_payable ap
        WHERE ap.status = 'pending'
        AND ap.id NOT IN (
          SELECT COALESCE((metadata->>'source_ap_id')::int, 0) FROM journal_entries WHERE metadata->>'source_ap_id' IS NOT NULL
        )
        LIMIT 100
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const inv of rows) {
        const amount = Number(inv.amount || 0);
        if (amount <= 0) continue;
        try {
          await db.execute(sql`
            INSERT INTO journal_entries (entry_date, description, debit_amount, credit_amount, account_type, status, metadata, created_at)
            VALUES (
              CURRENT_DATE,
              ${`חשבונית ספק #${inv.id} — ${inv.description || ""}`},
              ${amount},
              ${amount},
              'expense',
              'posted',
              ${JSON.stringify({ source_ap_id: inv.id, source: "automation" })},
              NOW()
            )
          `);
          affected++;
        } catch (err: any) {
          errors.push(`AP#${inv.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "pr-to-po",
    name: "בקשת רכש מאושרת → הזמנת רכש",
    nameEn: "Purchase Request → Purchase Order",
    description: "בקשות רכש מאושרות הופכות אוטומטית להזמנות רכש",
    source: "purchase_requests", target: "purchase_orders", category: "procurement", icon: "FileCheck",
    execute: async () => {
      if (!(await tableExists("purchase_requests")) || !(await tableExists("purchase_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT pr.id, pr.supplier_id, pr.items, pr.total_amount, pr.notes, pr.priority, pr.request_number
        FROM purchase_requests pr
        WHERE pr.status = 'approved'
        AND pr.id NOT IN (
          SELECT COALESCE((metadata->>'source_pr_id')::int, 0) FROM purchase_orders WHERE metadata->>'source_pr_id' IS NOT NULL
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const pr of rows) {
        try {
          await db.execute(sql`
            INSERT INTO purchase_orders (supplier_id, items, total_amount, status, notes, metadata, created_at)
            VALUES (
              ${pr.supplier_id},
              ${typeof pr.items === "string" ? pr.items : JSON.stringify(pr.items || [])},
              ${Number(pr.total_amount || 0)},
              'draft',
              ${`מבקשת רכש ${pr.request_number || pr.id}`},
              ${JSON.stringify({ source_pr_id: pr.id, source: "automation", priority: pr.priority })},
              NOW()
            )
          `);
          affected++;
        } catch (err: any) {
          errors.push(`PR#${pr.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "supplier-eval-score",
    name: "הערכות ספקים → ציון ספק",
    nameEn: "Supplier Evaluations → Supplier Score",
    description: "הערכות ספקים מחשבות ציון ממוצע ומעדכנות את כרטיס הספק",
    source: "supplier_evaluations", target: "suppliers", category: "procurement", icon: "Star",
    execute: async () => {
      if (!(await tableExists("supplier_evaluations")) || !(await tableExists("suppliers"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT supplier_id, 
               ROUND(AVG(COALESCE(quality_score,0) + COALESCE(delivery_score,0) + COALESCE(price_score,0) + COALESCE(service_score,0)) / 4.0, 1) as avg_score,
               COUNT(*) as eval_count
        FROM supplier_evaluations
        WHERE supplier_id IS NOT NULL
        GROUP BY supplier_id
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const ev of rows) {
        try {
          const result = await db.execute(sql`
            UPDATE suppliers
            SET rating = ${Number(ev.avg_score)},
                notes = COALESCE(notes, '') || ${` | ציון אוטומטי: ${ev.avg_score} (${ev.eval_count} הערכות)`},
                updated_at = NOW()
            WHERE id = ${Number(ev.supplier_id)}
            AND (rating IS NULL OR rating != ${Number(ev.avg_score)})
          `);
          if ((result as any)?.rowCount > 0) affected++;
        } catch (err: any) {
          errors.push(`Supplier#${ev.supplier_id}: ${err.message}`);
        }
      }
      return { affected, details: { suppliers: rows.length }, errors };
    }
  },
  {
    id: "price-quote-to-history",
    name: "הצעות מחיר → היסטוריית מחירים",
    nameEn: "Price Quotes → Price History",
    description: "הצעות מחיר מאושרות מתעדות מחיר חדש בהיסטוריה",
    source: "price_quotes", target: "price_history", category: "procurement", icon: "TrendingUp",
    execute: async () => {
      if (!(await tableExists("price_quotes")) || !(await tableExists("price_history"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT pq.id, pq.supplier_id, pq.material_id, pq.price, pq.currency, pq.valid_until, pq.status
        FROM price_quotes pq
        WHERE pq.status IN ('approved','accepted','selected')
        AND pq.id NOT IN (
          SELECT COALESCE((notes)::int, 0) FROM price_history WHERE source = 'quote_sync'
        )
        LIMIT 100
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const q of rows) {
        try {
          await db.execute(sql`
            INSERT INTO price_history (supplier_id, material_id, price, currency, source, effective_date, notes, created_at)
            VALUES (
              ${q.supplier_id},
              ${q.material_id},
              ${Number(q.price || 0)},
              ${q.currency || 'ILS'},
              'quote_sync',
              CURRENT_DATE,
              ${String(q.id)},
              NOW()
            )
          `);
          affected++;
        } catch (err: any) {
          errors.push(`Quote#${q.id}: ${err.message}`);
        }
      }
      return { affected, details: { quotes: rows.length }, errors };
    }
  },
  {
    id: "ar-aging",
    name: "חייבים → חישוב גיול אוטומטי",
    nameEn: "AR → Aging Calculation",
    description: "חישוב ועדכון ימי פיגור וסטטוס גיול בחשבונות חייבים",
    source: "accounts_receivable", target: "accounts_receivable", category: "finance", icon: "Clock",
    execute: async () => {
      if (!(await tableExists("accounts_receivable"))) return { affected: 0, details: { reason: "table_missing" } };
      try {
        const result = await db.execute(sql`
          UPDATE accounts_receivable
          SET metadata = jsonb_set(
            COALESCE(metadata::jsonb, '{}'),
            '{aging_days}',
            to_jsonb(EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(due_date, created_at::date)))::int)
          ),
          status = CASE
            WHEN EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(due_date, created_at::date))) > 90 THEN 'overdue_90'
            WHEN EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(due_date, created_at::date))) > 60 THEN 'overdue_60'
            WHEN EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(due_date, created_at::date))) > 30 THEN 'overdue_30'
            ELSE status
          END,
          updated_at = NOW()
          WHERE status NOT IN ('paid','closed','cancelled')
          AND balance_due > 0
          AND due_date < CURRENT_DATE
        `);
        const affected = (result as any)?.rowCount || 0;
        return { affected, details: { updated: affected } };
      } catch {
        return { affected: 0, details: { reason: "query_failed_schema_mismatch" } };
      }
    }
  },
  {
    id: "ap-aging",
    name: "זכאים → חישוב גיול אוטומטי",
    nameEn: "AP → Aging Calculation",
    description: "חישוב ועדכון ימי פיגור בחשבונות זכאים",
    source: "accounts_payable", target: "accounts_payable", category: "finance", icon: "Clock",
    execute: async () => {
      if (!(await tableExists("accounts_payable"))) return { affected: 0, details: { reason: "table_missing" } };
      try {
        const result = await db.execute(sql`
          UPDATE accounts_payable
          SET metadata = jsonb_set(
            COALESCE(metadata::jsonb, '{}'),
            '{aging_days}',
            to_jsonb(EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(due_date, created_at::date)))::int)
          ),
          updated_at = NOW()
          WHERE status NOT IN ('paid','closed','cancelled')
          AND balance_due > 0
          AND due_date < CURRENT_DATE
        `);
        const affected = (result as any)?.rowCount || 0;
        return { affected, details: { updated: affected } };
      } catch {
        return { affected: 0, details: { reason: "query_failed_schema_mismatch" } };
      }
    }
  },
  {
    id: "raw-material-low-stock",
    name: "חומרי גלם → התראת מלאי נמוך",
    nameEn: "Raw Materials → Low Stock Alert",
    description: "בדיקת רמות מלאי מינימליות ויצירת התראות + בקשות רכש",
    source: "raw_materials", target: "notifications", category: "inventory", icon: "AlertTriangle",
    execute: async () => {
      if (!(await tableExists("raw_materials"))) return { affected: 0, details: { reason: "table_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT id, name, quantity, minimum_quantity, unit, supplier_id
        FROM raw_materials
        WHERE quantity IS NOT NULL
        AND minimum_quantity IS NOT NULL
        AND quantity <= minimum_quantity
        AND quantity > 0
      `));
      let affected = 0;
      for (const m of rows) {
        await notify(
          "התראת מלאי נמוך",
          `${m.name}: כמות ${m.quantity} ${m.unit || "יח'"} — מתחת למינימום ${m.minimum_quantity}`,
          m.id
        );
        affected++;
      }
      return { affected, details: { lowStockItems: affected } };
    }
  },
  {
    id: "exchange-rate-update",
    name: "שערי חליפין → עדכון הזמנות מט\"ח",
    nameEn: "Exchange Rates → FX Order Update",
    description: "עדכון שווי הזמנות ייבוא לפי שער חליפין אחרון",
    source: "exchange_rates", target: "import_orders", category: "import", icon: "Globe",
    execute: async () => {
      if (!(await tableExists("exchange_rates")) || !(await tableExists("import_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT DISTINCT ON (from_currency, to_currency) from_currency, to_currency, rate
        FROM exchange_rates
        ORDER BY from_currency, to_currency, effective_date DESC
      `));
      if (rows.length === 0) return { affected: 0, details: { reason: "no_rates" } };
      let affected = 0;
      const errors: string[] = [];
      for (const rate of rows) {
        try {
          const result = await db.execute(sql`
            UPDATE import_orders
            SET metadata = jsonb_set(
              COALESCE(metadata::jsonb, '{}'),
              '{latest_fx_rate}',
              ${String(rate.rate)}::jsonb
            ),
            updated_at = NOW()
            WHERE currency = ${rate.from_currency}
            AND status NOT IN ('completed','cancelled','closed')
          `);
          affected += (result as any)?.rowCount || 0;
        } catch (err: any) {
          errors.push(`Rate ${rate.from_currency}: ${err.message}`);
        }
      }
      return { affected, details: { ratesChecked: rows.length }, errors };
    }
  },
  {
    id: "contract-expiry-alert",
    name: "חוזי ספקים → התראות פקיעה",
    nameEn: "Supplier Contracts → Expiry Alerts",
    description: "התראות על חוזים שפוקעים ב-30/60/90 יום הקרובים",
    source: "supplier_contracts", target: "notifications", category: "procurement", icon: "FileWarning",
    execute: async () => {
      if (!(await tableExists("supplier_contracts"))) return { affected: 0, details: { reason: "table_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT sc.id, sc.contract_number, sc.end_date, sc.supplier_id,
               s.name as supplier_name,
               EXTRACT(DAY FROM (sc.end_date - CURRENT_DATE))::int as days_left
        FROM supplier_contracts sc
        LEFT JOIN suppliers s ON s.id = sc.supplier_id
        WHERE sc.end_date IS NOT NULL
        AND sc.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        AND sc.status NOT IN ('cancelled','expired','renewed')
      `));
      let affected = 0;
      for (const c of rows) {
        const days = c.days_left || 0;
        const urgency = days <= 30 ? "דחוף" : days <= 60 ? "חשוב" : "לתשומת לב";
        await notify(
          `חוזה ספק פוקע בעוד ${days} ימים — ${urgency}`,
          `חוזה ${c.contract_number || c.id} עם ${c.supplier_name || "ספק"} פוקע ב-${c.end_date}`,
          c.id
        );
        affected++;
      }
      return { affected, details: { expiringContracts: affected } };
    }
  },
  {
    id: "po-budget-check",
    name: "הזמנות רכש → בדיקת תקציב",
    nameEn: "Purchase Orders → Budget Check",
    description: "בדיקה שהזמנות רכש חדשות לא חורגות מתקציב",
    source: "purchase_orders", target: "budgets", category: "finance", icon: "Wallet",
    execute: async () => {
      if (!(await tableExists("purchase_orders")) || !(await tableExists("budgets"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT id, name, total_budget, spent_amount, category
        FROM budgets
        WHERE status = 'active'
        AND spent_amount >= total_budget * 0.85
      `));
      let affected = 0;
      for (const b of rows) {
        const pct = Math.round((Number(b.spent_amount) / Number(b.total_budget)) * 100);
        const status = pct >= 100 ? "חריגה" : pct >= 95 ? "קריטי" : "אזהרה";
        await notify(
          `תקציב ${status}: ${b.name}`,
          `${pct}% מנוצל (₪${Number(b.spent_amount).toLocaleString("he-IL")} מתוך ₪${Number(b.total_budget).toLocaleString("he-IL")})`,
          b.id
        );
        affected++;
      }
      return { affected, details: { budgetsChecked: rows.length } };
    }
  },
  {
    id: "shipment-to-customs",
    name: "משלוחים → עדכון שחרור מכס",
    nameEn: "Shipments → Customs Clearance",
    description: "סטטוס משלוח 'arrived' מעדכן אוטומטית רשומת מכס",
    source: "shipment_tracking", target: "customs_clearances", category: "import", icon: "Ship",
    execute: async () => {
      if (!(await tableExists("shipment_tracking")) || !(await tableExists("customs_clearances"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT st.id, st.import_order_id, st.status, st.actual_arrival_date
        FROM shipment_tracking st
        WHERE st.status IN ('arrived','delivered','at_port')
        AND st.import_order_id IS NOT NULL
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const s of rows) {
        try {
          const result = await db.execute(sql`
            UPDATE customs_clearances
            SET status = CASE WHEN status = 'pending' THEN 'ready_for_clearance' ELSE status END,
                metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'), '{shipment_arrived}', 'true'::jsonb),
                updated_at = NOW()
            WHERE import_order_id = ${s.import_order_id}
            AND status = 'pending'
          `);
          affected += (result as any)?.rowCount || 0;
        } catch (err: any) {
          errors.push(`Shipment#${s.id}: ${err.message}`);
        }
      }
      return { affected, details: { shipments: rows.length }, errors };
    }
  },
  {
    id: "production-material-check",
    name: "ייצור → בדיקת זמינות חומרים",
    nameEn: "Production → Material Availability",
    description: "הזמנות ייצור חדשות נבדקות אוטומטית מול מלאי חומרי גלם",
    source: "production_work_orders", target: "raw_materials", category: "production", icon: "Factory",
    execute: async () => {
      if (!(await tableExists("production_work_orders")) || !(await tableExists("raw_materials"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT id, product_name, quantity, bom_items, status
        FROM production_work_orders
        WHERE status IN ('planned','pending','new')
        LIMIT 50
      `));
      let affected = 0;
      for (const wo of rows) {
        const items = typeof wo.bom_items === "string" ? JSON.parse(wo.bom_items || "[]") : (wo.bom_items || []);
        if (!Array.isArray(items)) continue;
        const shortages: string[] = [];
        for (const item of items) {
          const materialId = item.material_id || item.raw_material_id;
          if (!materialId) continue;
          const mats = await safeQuery(() => db.execute(sql`
            SELECT id, name, quantity FROM raw_materials WHERE id = ${Number(materialId)}
          `));
          const mat = mats[0];
          if (mat && Number(mat.quantity || 0) < Number(item.quantity || 0)) {
            shortages.push(`${mat.name}: חסר ${Number(item.quantity) - Number(mat.quantity)}`);
          }
        }
        if (shortages.length > 0) {
          await notify(
            `חוסרי חומרים — הזמנת ייצור #${wo.id}`,
            `${wo.product_name || "מוצר"}: ${shortages.join(", ")}`,
            wo.id
          );
          affected++;
        }
      }
      return { affected, details: { ordersChecked: rows.length } };
    }
  },
  {
    id: "return-to-supplier-credit",
    name: "החזרות → זיכוי ספק",
    nameEn: "Purchase Returns → Supplier Credit",
    description: "החזרות טובין מאושרות מייצרות זיכוי אוטומטי בחשבונות זכאים",
    source: "purchase_returns", target: "accounts_payable", category: "procurement", icon: "RotateCcw",
    execute: async () => {
      if (!(await tableExists("purchase_returns")) || !(await tableExists("accounts_payable"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT pr.id, pr.supplier_id, pr.total_amount, pr.return_number, pr.reason
        FROM purchase_returns pr
        WHERE pr.status IN ('approved','completed','credited')
        AND pr.id NOT IN (
          SELECT COALESCE((metadata->>'source_return_id')::int, 0) FROM accounts_payable WHERE metadata->>'source_return_id' IS NOT NULL
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const ret of rows) {
        const amount = Number(ret.total_amount || 0);
        if (amount <= 0) continue;
        try {
          await db.execute(sql`
            INSERT INTO accounts_payable (supplier_id, amount, balance_due, status, description, metadata, created_at)
            VALUES (
              ${ret.supplier_id},
              ${-amount},
              ${-amount},
              'credit',
              ${`זיכוי מהחזרה ${ret.return_number || ret.id} — ${ret.reason || ""}`},
              ${JSON.stringify({ source_return_id: ret.id, source: "automation", type: "credit_note" })},
              NOW()
            )
          `);
          affected++;
        } catch (err: any) {
          errors.push(`Return#${ret.id}: ${err.message}`);
        }
      }
      return { affected, details: { returns: rows.length }, errors };
    }
  },
  {
    id: "lc-to-import-cost",
    name: "מכתבי אשראי → עלויות ייבוא",
    nameEn: "Letters of Credit → Import Costs",
    description: "מכתבי אשראי מאושרים מעדכנים עלויות ייבוא",
    source: "letters_of_credit", target: "import_cost_calculations", category: "import", icon: "CreditCard",
    execute: async () => {
      if (!(await tableExists("letters_of_credit")) || !(await tableExists("import_cost_calculations"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT lc.id, lc.import_order_id, lc.amount, lc.currency, lc.bank_charges, lc.status
        FROM letters_of_credit lc
        WHERE lc.status IN ('issued','confirmed','active')
        AND lc.import_order_id IS NOT NULL
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const lc of rows) {
        try {
          const result = await db.execute(sql`
            UPDATE import_cost_calculations
            SET lc_charges = COALESCE(${Number(lc.bank_charges || 0)}, 0),
                metadata = jsonb_set(COALESCE(metadata::jsonb, '{}'), '{lc_id}', ${String(lc.id)}::jsonb),
                updated_at = NOW()
            WHERE import_order_id = ${lc.import_order_id}
          `);
          affected += (result as any)?.rowCount || 0;
        } catch (err: any) {
          errors.push(`LC#${lc.id}: ${err.message}`);
        }
      }
      return { affected, details: { lcs: rows.length }, errors };
    }
  },
  {
    id: "so-to-production",
    name: "הזמנת מכירה → פקודת ייצור",
    nameEn: "Sales Order → Production Work Order",
    description: "הזמנות מכירה מאושרות יוצרות פקודות ייצור אוטומטית",
    source: "sales_orders", target: "production_work_orders", category: "production", icon: "Factory",
    execute: async () => {
      if (!(await tableExists("sales_orders")) || !(await tableExists("production_work_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT so.id, so.order_number, so.customer_name, so.total, so.delivery_date, so.notes
        FROM sales_orders so
        WHERE so.status IN ('confirmed','approved','in_production')
        AND so.id NOT IN (
          SELECT COALESCE(sales_order_id, 0) FROM production_work_orders WHERE sales_order_id IS NOT NULL
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const so of rows) {
        try {
          const woNum = `WO-${so.order_number || so.id}`;
          await db.execute(sql`
            INSERT INTO production_work_orders (order_number, product_name, sales_order_id, customer_name, quantity_planned, status, priority, planned_start, planned_end, notes, created_at, updated_at)
            VALUES (
              ${woNum},
              ${`הזמנה ${so.order_number || so.id}`},
              ${so.id},
              ${so.customer_name || ''},
              1,
              'planned',
              'medium',
              CURRENT_DATE,
              ${so.delivery_date || sql`CURRENT_DATE + INTERVAL '14 days'`},
              ${`נוצר אוטומטית מהזמנת מכירה ${so.order_number || so.id}`},
              NOW(), NOW()
            )
            ON CONFLICT (order_number) DO NOTHING
          `);
          affected++;
        } catch (err: any) {
          errors.push(`SO#${so.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "so-to-invoice",
    name: "הזמנת מכירה → חשבונית לקוח",
    nameEn: "Sales Order → Customer Invoice",
    description: "הזמנות מכירה שסופקו/הושלמו מייצרות חשבוניות אוטומטית",
    source: "sales_orders", target: "customer_invoices", category: "sales", icon: "Receipt",
    execute: async () => {
      if (!(await tableExists("sales_orders")) || !(await tableExists("customer_invoices"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT so.id, so.order_number, so.customer_id, so.customer_name, so.subtotal, so.discount_amount, so.tax_amount, so.total, so.payment_terms, so.delivery_date
        FROM sales_orders so
        WHERE so.status IN ('delivered','completed','shipped')
        AND so.id NOT IN (
          SELECT COALESCE(invoice_id, 0) FROM sales_orders WHERE invoice_id IS NOT NULL
        )
        AND so.id NOT IN (
          SELECT COALESCE((reference_number)::int, 0) FROM customer_invoices WHERE reference_number IS NOT NULL AND reference_number ~ '^[0-9]+$'
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const so of rows) {
        const amount = Number(so.total || 0);
        if (amount <= 0) continue;
        try {
          const invNum = `INV-${so.order_number || so.id}`;
          await db.execute(sql`
            INSERT INTO customer_invoices (invoice_number, invoice_type, invoice_date, due_date, customer_name, customer_id_ref, subtotal, discount_amount, vat_amount, total_amount, status, payment_terms, reference_number, notes, created_at, updated_at)
            VALUES (
              ${invNum},
              'tax',
              CURRENT_DATE,
              ${sql`CURRENT_DATE + INTERVAL '30 days'`},
              ${so.customer_name || ''},
              ${so.customer_id ? String(so.customer_id) : null},
              ${Number(so.subtotal || 0)},
              ${Number(so.discount_amount || 0)},
              ${Number(so.tax_amount || 0)},
              ${amount},
              'draft',
              ${so.payment_terms || 'שוטף 30'},
              ${String(so.id)},
              ${`נוצר אוטומטית מהזמנה ${so.order_number || so.id}`},
              NOW(), NOW()
            )
            ON CONFLICT (invoice_number) DO NOTHING
          `);
          affected++;
        } catch (err: any) {
          errors.push(`SO#${so.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "so-to-ar",
    name: "הזמנת מכירה → חשבונות חייבים",
    nameEn: "Sales Order → Accounts Receivable",
    description: "הזמנות מכירה שחויבו נכנסות אוטומטית לחשבונות חייבים",
    source: "sales_orders", target: "accounts_receivable", category: "finance", icon: "DollarSign",
    execute: async () => {
      if (!(await tableExists("sales_orders")) || !(await tableExists("accounts_receivable"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT so.id, so.order_number, so.customer_id, so.customer_name, so.total, so.tax_amount, so.payment_status
        FROM sales_orders so
        WHERE so.status IN ('delivered','completed','shipped','invoiced')
        AND so.payment_status IN ('unpaid','partial')
        AND so.total > 0
        AND NOT EXISTS (
          SELECT 1 FROM accounts_receivable ar WHERE ar.sales_order_id = so.id
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const so of rows) {
        const amount = Number(so.total || 0);
        if (amount <= 0) continue;
        try {
          await db.execute(sql`
            INSERT INTO accounts_receivable (invoice_number, customer_id, customer_name, invoice_date, due_date, amount, net_amount, vat_amount, status, sales_order_id, description, created_at, updated_at)
            VALUES (
              ${`AR-${so.order_number || so.id}`},
              ${so.customer_id},
              ${so.customer_name || ''},
              CURRENT_DATE,
              ${sql`CURRENT_DATE + INTERVAL '30 days'`},
              ${amount},
              ${amount - Number(so.tax_amount || 0)},
              ${Number(so.tax_amount || 0)},
              'open',
              ${so.id},
              ${`מהזמנת מכירה ${so.order_number || so.id}`},
              NOW(), NOW()
            )
          `);
          affected++;
        } catch (err: any) {
          errors.push(`SO#${so.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "quote-to-so",
    name: "הצעת מחיר → הזמנת מכירה",
    nameEn: "Price Quote → Sales Order",
    description: "הצעות מחיר מאושרות הופכות אוטומטית להזמנות מכירה",
    source: "price_quotes", target: "sales_orders", category: "sales", icon: "FileCheck",
    execute: async () => {
      if (!(await tableExists("price_quotes")) || !(await tableExists("sales_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT pq.id, pq.quote_number, pq.customer_name, pq.customer_id, pq.total_amount, pq.valid_until, pq.notes, pq.tax_amount, pq.subtotal
        FROM price_quotes pq
        WHERE pq.status IN ('התקבל','התקבלה','אושרה','approved','accepted')
        AND pq.id NOT IN (
          SELECT COALESCE(quote_id, 0) FROM sales_orders WHERE quote_id IS NOT NULL
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const q of rows) {
        try {
          const soNum = `SO-Q${q.quote_number || q.id}`;
          await db.execute(sql`
            INSERT INTO sales_orders (order_number, customer_id, customer_name, order_date, subtotal, tax_amount, total, status, payment_status, quote_id, notes, created_at, updated_at)
            VALUES (
              ${soNum},
              ${q.customer_id},
              ${q.customer_name || ''},
              CURRENT_DATE,
              ${Number(q.subtotal || 0)},
              ${Number(q.tax_amount || 0)},
              ${Number(q.total_amount || 0)},
              'draft',
              'unpaid',
              ${q.id},
              ${`נוצר אוטומטית מהצעת מחיר ${q.quote_number || q.id}`},
              NOW(), NOW()
            )
            ON CONFLICT (order_number) DO NOTHING
          `);
          affected++;
        } catch (err: any) {
          errors.push(`Quote#${q.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "wo-completion-update",
    name: "ייצור הושלם → עדכון הזמנת מכירה",
    nameEn: "Work Order Complete → Update Sales Order",
    description: "פקודת ייצור שהושלמה מעדכנת סטטוס הזמנת המכירה המקושרת",
    source: "production_work_orders", target: "sales_orders", category: "production", icon: "CheckCircle",
    execute: async () => {
      if (!(await tableExists("production_work_orders")) || !(await tableExists("sales_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      try {
        const result = await db.execute(sql`
          UPDATE sales_orders so
          SET status = 'ready_to_ship',
              updated_at = NOW()
          FROM production_work_orders pwo
          WHERE pwo.sales_order_id = so.id
          AND pwo.status = 'completed'
          AND so.status IN ('in_production','confirmed','approved')
        `);
        const affected = (result as any)?.rowCount || 0;
        return { affected, details: { updated: affected } };
      } catch (err: any) {
        return { affected: 0, details: { reason: "query_failed" }, errors: [err.message] };
      }
    }
  },
  {
    id: "employee-leave-balance",
    name: "חופשות → עדכון יתרת ימי חופש",
    nameEn: "Leave Requests → Employee Balance Update",
    description: "חופשות מאושרות מקטינות אוטומטית את יתרת ימי החופש של העובד",
    source: "leave_requests", target: "employees", category: "hr", icon: "Calendar",
    execute: async () => {
      if (!(await tableExists("leave_requests")) || !(await tableExists("employees"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT lr.id, lr.employee_id, lr.leave_type, lr.days_count,
               lr.start_date, lr.end_date
        FROM leave_requests lr
        WHERE lr.status = 'approved'
        AND lr.id NOT IN (
          SELECT COALESCE((notes)::int, 0) FROM attendance_records WHERE notes ~ '^leave_sync_[0-9]+$'
        )
        LIMIT 100
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const lr of rows) {
        const days = Number(lr.days_count || 1);
        const field = lr.leave_type === 'sick' ? 'sick_days_balance' : lr.leave_type === 'personal' ? 'personal_days_balance' : 'vacation_days_balance';
        try {
          const result = await db.execute(sql`
            UPDATE employees
            SET ${sql.raw(field)} = GREATEST(COALESCE(${sql.raw(field)}, 0) - ${days}, 0),
                updated_at = NOW()
            WHERE id = ${lr.employee_id}
          `);
          if ((result as any)?.rowCount > 0) affected++;
        } catch (err: any) {
          errors.push(`Leave#${lr.id}: ${err.message}`);
        }
      }
      return { affected, details: { leaves: rows.length }, errors };
    }
  },
  {
    id: "maintenance-asset-update",
    name: "תחזוקה → עדכון רכוש קבוע",
    nameEn: "Maintenance → Fixed Asset Update",
    description: "הזמנות תחזוקה שהושלמו מעדכנות תאריכי תחזוקה ברכוש קבוע",
    source: "maintenance_orders", target: "fixed_assets", category: "maintenance", icon: "Wrench",
    execute: async () => {
      if (!(await tableExists("maintenance_orders")) || !(await tableExists("fixed_assets"))) return { affected: 0, details: { reason: "tables_missing" } };
      try {
        const result = await db.execute(sql`
          UPDATE fixed_assets fa
          SET last_maintenance_date = mo.completed_date,
              next_maintenance_date = CASE
                WHEN fa.maintenance_frequency_days IS NOT NULL THEN mo.completed_date + (fa.maintenance_frequency_days || ' days')::interval
                ELSE fa.next_maintenance_date
              END,
              updated_at = NOW()
          FROM maintenance_orders mo
          WHERE mo.asset_id = fa.id
          AND mo.status = 'completed'
          AND mo.completed_date IS NOT NULL
          AND (fa.last_maintenance_date IS NULL OR mo.completed_date > fa.last_maintenance_date)
        `);
        const affected = (result as any)?.rowCount || 0;
        return { affected, details: { updated: affected } };
      } catch (err: any) {
        return { affected: 0, details: { reason: "query_failed" }, errors: [err.message] };
      }
    }
  },
  {
    id: "crm-lead-to-customer",
    name: "ליד CRM → לקוח חדש",
    nameEn: "CRM Lead → New Customer",
    description: "לידים שהומרו יוצרים כרטיס לקוח חדש אוטומטית",
    source: "crm_leads", target: "sales_customers", category: "crm", icon: "UserPlus",
    execute: async () => {
      if (!(await tableExists("crm_leads")) || !(await tableExists("sales_customers"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT cl.id, cl.company_name, cl.contact_name, cl.email, cl.phone, cl.industry, cl.source, cl.notes
        FROM crm_leads cl
        WHERE cl.status IN ('converted','won','customer')
        AND NOT EXISTS (
          SELECT 1 FROM sales_customers sc WHERE sc.name = cl.company_name AND cl.company_name IS NOT NULL
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const lead of rows) {
        if (!lead.company_name) continue;
        try {
          const custNum = `C-L${lead.id}`;
          await db.execute(sql`
            INSERT INTO sales_customers (customer_number, name, contact_person, email, phone, industry, source, notes, status, created_at, updated_at)
            VALUES (
              ${custNum},
              ${lead.company_name},
              ${lead.contact_name || ''},
              ${lead.email || ''},
              ${lead.phone || ''},
              ${lead.industry || ''},
              ${lead.source || 'CRM'},
              ${`נוצר אוטומטית מליד #${lead.id}`},
              'active',
              NOW(), NOW()
            )
            ON CONFLICT (customer_number) DO NOTHING
          `);
          affected++;
        } catch (err: any) {
          errors.push(`Lead#${lead.id}: ${err.message}`);
        }
      }
      return { affected, details: { checked: rows.length }, errors };
    }
  },
  {
    id: "customer-to-crm-ledger",
    name: "לקוח חדש → רשומת CRM + פקודת יומן",
    nameEn: "New Customer → CRM Record + GL Entry",
    description: "לקוחות חדשים מקבלים רשומת CRM אוטומטית + פקודת יומן פתיחת כרטיס",
    source: "sales_customers", target: "crm_leads", category: "crm", icon: "UserCheck",
    execute: async () => {
      if (!(await tableExists("sales_customers"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasCrm = await tableExists("crm_leads");
      const hasGL = await tableExists("journal_entries");
      const rows = await safeQuery(() => db.execute(sql`
        SELECT sc.id, sc.customer_number, sc.name, sc.contact_person, sc.email, sc.phone, sc.industry, sc.category, sc.credit_limit, sc.created_at
        FROM sales_customers sc
        WHERE sc.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND sc.status = 'active'
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const cust of rows) {
        if (hasCrm) {
          try {
            const exists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM crm_leads WHERE company_name = ${cust.name} LIMIT 1
            `));
            if (exists.length === 0) {
              await db.execute(sql`
                INSERT INTO crm_leads (company_name, contact_name, email, phone, industry, status, source, notes, created_at, updated_at)
                VALUES (
                  ${cust.name},
                  ${cust.contact_person || ''},
                  ${cust.email || ''},
                  ${cust.phone || ''},
                  ${cust.industry || ''},
                  'customer',
                  'auto_from_customer',
                  ${`נוצר אוטומטית מלקוח ${cust.customer_number || cust.id}`},
                  NOW(), NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`CRM for ${cust.name}: ${err.message}`);
          }
        }
        if (hasGL) {
          try {
            const glExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM journal_entries WHERE description LIKE ${`%פתיחת כרטיס לקוח%${cust.customer_number || cust.id}%`} LIMIT 1
            `));
            if (glExists.length === 0 && Number(cust.credit_limit || 0) > 0) {
              await db.execute(sql`
                INSERT INTO journal_entries (entry_date, description, debit_amount, credit_amount, account_type, status, created_at)
                VALUES (
                  CURRENT_DATE,
                  ${`פתיחת כרטיס לקוח ${cust.name} (${cust.customer_number || cust.id}) — מסגרת אשראי ₪${Number(cust.credit_limit || 0).toLocaleString()}`},
                  0, 0,
                  'customer_opening',
                  'posted',
                  NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`GL for ${cust.name}: ${err.message}`);
          }
        }
      }
      return { affected, details: { newCustomers: rows.length }, errors };
    }
  },
  {
    id: "so-confirmed-inventory-invoice",
    name: "הזמנת מכירה מאושרת → הפחתת מלאי + טיוטת חשבונית",
    nameEn: "Sales Order Confirmed → Reduce Inventory + Draft Invoice",
    description: "הזמנת מכירה מאושרת מפחיתה כמויות מלאי לפי שורות ההזמנה ויוצרת טיוטת חשבונית",
    source: "sales_orders", target: "raw_materials", category: "sales", icon: "PackageMinus",
    execute: async () => {
      if (!(await tableExists("sales_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasLines = await tableExists("sales_order_lines");
      const hasInvoices = await tableExists("customer_invoices");
      const hasRM = await tableExists("raw_materials");
      const rows = await safeQuery(() => db.execute(sql`
        SELECT so.id, so.order_number, so.customer_id, so.customer_name,
               so.subtotal, so.discount_amount, so.tax_amount, so.total, so.payment_terms
        FROM sales_orders so
        WHERE so.status IN ('confirmed','approved')
        AND NOT EXISTS (
          SELECT 1 FROM inventory_transactions it WHERE it.sales_order_id = so.id AND it.transaction_type = 'so_reserve'
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const so of rows) {
        if (hasLines && hasRM) {
          try {
            const lines = await safeQuery(() => db.execute(sql`
              SELECT sol.material_id, sol.item_code, sol.item_description, sol.quantity, sol.unit_price, sol.total_price
              FROM sales_order_lines sol
              WHERE sol.order_id = ${so.id}
            `));
            for (const line of lines) {
              const materialId = line.material_id;
              const qty = Number(line.quantity || 0);
              if (materialId && qty > 0) {
                try {
                  await db.execute(sql`
                    UPDATE raw_materials
                    SET current_stock = GREATEST(COALESCE(current_stock, 0) - ${qty}, 0),
                        last_issue_date = CURRENT_DATE,
                        updated_at = NOW()
                    WHERE id = ${Number(materialId)}
                  `);
                  const hasIT = await tableExists("inventory_transactions");
                  if (hasIT) {
                    await db.execute(sql`
                      INSERT INTO inventory_transactions (material_id, transaction_type, quantity, reference_number, sales_order_id, notes, created_at)
                      VALUES (
                        ${Number(materialId)},
                        'so_reserve',
                        ${-qty},
                        ${so.order_number || String(so.id)},
                        ${so.id},
                        ${`הפחתה אוטומטית מהזמנה ${so.order_number || so.id}`},
                        NOW()
                      )
                    `);
                  }
                  affected++;
                } catch (err: any) {
                  errors.push(`Inventory SO#${so.id} mat#${materialId}: ${err.message}`);
                }
              }
            }
          } catch (err: any) {
            errors.push(`Lines SO#${so.id}: ${err.message}`);
          }
        }
        if (hasInvoices) {
          try {
            const invExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM customer_invoices WHERE reference_number = ${String(so.id)} LIMIT 1
            `));
            if (invExists.length === 0) {
              const invNum = `INV-${so.order_number || so.id}`;
              await db.execute(sql`
                INSERT INTO customer_invoices (invoice_number, invoice_type, invoice_date, due_date, customer_name, customer_id_ref, subtotal, discount_amount, vat_amount, total_amount, status, payment_terms, reference_number, notes, created_at, updated_at)
                VALUES (
                  ${invNum}, 'tax', CURRENT_DATE,
                  ${sql`CURRENT_DATE + INTERVAL '30 days'`},
                  ${so.customer_name || ''},
                  ${so.customer_id ? String(so.customer_id) : null},
                  ${Number(so.subtotal || 0)},
                  ${Number(so.discount_amount || 0)},
                  ${Number(so.tax_amount || 0)},
                  ${Number(so.total || 0)},
                  'draft',
                  ${so.payment_terms || 'שוטף 30'},
                  ${String(so.id)},
                  ${`טיוטת חשבונית אוטומטית מהזמנה ${so.order_number || so.id}`},
                  NOW(), NOW()
                )
                ON CONFLICT (invoice_number) DO NOTHING
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`Invoice SO#${so.id}: ${err.message}`);
          }
        }
      }
      return { affected, details: { ordersProcessed: rows.length }, errors };
    }
  },
  {
    id: "invoice-paid-receipt-cashflow",
    name: "חשבונית שולמה → יתרת לקוח + קבלה + תזרים",
    nameEn: "Invoice Paid → Customer Balance + Receipt + Cash Flow",
    description: "חשבוניות שסומנו כשולמו מעדכנות יתרת לקוח, יוצרות קבלה ורושמות תזרים מזומנים",
    source: "customer_invoices", target: "sales_customers", category: "finance", icon: "CircleDollarSign",
    execute: async () => {
      if (!(await tableExists("customer_invoices"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasCustomers = await tableExists("sales_customers");
      const hasReceipts = await tableExists("ar_receipts");
      const hasCashFlow = await tableExists("cash_flow_records");
      const hasAR = await tableExists("accounts_receivable");
      const rows = await safeQuery(() => db.execute(sql`
        SELECT ci.id, ci.invoice_number, ci.customer_name, ci.customer_id_ref, ci.total_amount, ci.amount_paid,
               ci.payment_method, ci.paid_at, ci.status
        FROM customer_invoices ci
        WHERE ci.status = 'paid'
        AND ci.total_amount > 0
        AND ci.paid_at >= CURRENT_DATE - INTERVAL '7 days'
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const inv of rows) {
        const amount = Number(inv.total_amount || 0);
        const custId = inv.customer_id_ref ? Number(inv.customer_id_ref) : null;
        if (hasCustomers && custId) {
          try {
            await db.execute(sql`
              UPDATE sales_customers
              SET outstanding_balance = GREATEST(COALESCE(outstanding_balance, 0) - ${amount}, 0),
                  total_revenue = COALESCE(total_revenue, 0) + ${amount},
                  last_payment_date = CURRENT_DATE,
                  total_orders = COALESCE(total_orders, 0) + 1,
                  updated_at = NOW()
              WHERE id = ${custId}
              AND NOT EXISTS (
                SELECT 1 FROM ar_receipts WHERE receipt_number = ${`RCP-${inv.invoice_number}`}
              )
            `);
            affected++;
          } catch (err: any) {
            errors.push(`Customer balance INV#${inv.id}: ${err.message}`);
          }
        }
        if (hasReceipts) {
          try {
            const rcpExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM ar_receipts WHERE receipt_number = ${`RCP-${inv.invoice_number}`} LIMIT 1
            `));
            if (rcpExists.length === 0) {
              const arRows = await safeQuery(() => db.execute(sql`
                SELECT id FROM accounts_receivable WHERE invoice_number = ${inv.invoice_number} LIMIT 1
              `));
              const arId = arRows[0]?.id;
              if (arId) {
                await db.execute(sql`
                  INSERT INTO ar_receipts (receipt_number, ar_id, amount, receipt_date, payment_method, reference, notes, created_at)
                  VALUES (
                    ${`RCP-${inv.invoice_number}`},
                    ${arId},
                    ${amount},
                    ${inv.paid_at || sql`CURRENT_DATE`},
                    ${inv.payment_method || 'bank_transfer'},
                    ${inv.invoice_number},
                    ${`קבלה אוטומטית — חשבונית ${inv.invoice_number} שולמה`},
                    NOW()
                  )
                `);
                await db.execute(sql`
                  UPDATE accounts_receivable
                  SET paid_amount = COALESCE(paid_amount, 0) + ${amount},
                      status = 'paid',
                      updated_at = NOW()
                  WHERE id = ${arId}
                `);
                affected++;
              }
            }
          } catch (err: any) {
            errors.push(`Receipt INV#${inv.id}: ${err.message}`);
          }
        }
        if (hasCashFlow) {
          try {
            const cfExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM cash_flow_records WHERE reference_number = ${`CF-${inv.invoice_number}`} LIMIT 1
            `));
            if (cfExists.length === 0) {
              await db.execute(sql`
                INSERT INTO cash_flow_records (record_date, category, type, amount, currency, description, reference_number, source, status, created_at)
                VALUES (
                  ${inv.paid_at || sql`CURRENT_DATE`},
                  'הכנסות',
                  'inflow',
                  ${amount},
                  'ILS',
                  ${`תקבול חשבונית ${inv.invoice_number} — ${inv.customer_name || ''}`},
                  ${`CF-${inv.invoice_number}`},
                  'auto_invoice_payment',
                  'confirmed',
                  NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`CashFlow INV#${inv.id}: ${err.message}`);
          }
        }
      }
      return { affected, details: { paidInvoices: rows.length }, errors };
    }
  },
  {
    id: "reorder-point-purchase-request",
    name: "מלאי מתחת לנקודת הזמנה → בקשת רכש אוטומטית",
    nameEn: "Inventory Below Reorder Point → Auto Purchase Request",
    description: "חומרי גלם שירדו מתחת לנקודת ההזמנה מחדש מייצרים בקשת רכש אוטומטית לספק המועדף",
    source: "raw_materials", target: "purchase_requests", category: "inventory", icon: "ShoppingBag",
    execute: async () => {
      if (!(await tableExists("raw_materials"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasPR = await tableExists("purchase_requests");
      const rows = await safeQuery(() => db.execute(sql`
        SELECT rm.id, rm.material_number, rm.material_name, rm.current_stock, rm.reorder_point,
               rm.economic_order_qty, rm.reorder_qty, rm.maximum_stock, rm.minimum_stock,
               rm.standard_price, rm.last_purchase_price, rm.unit,
               rm.supplier_id, rm.preferred_supplier_id,
               COALESCE(s.supplier_name, s2.supplier_name, '') as supplier_name
        FROM raw_materials rm
        LEFT JOIN suppliers s ON s.id = rm.preferred_supplier_id
        LEFT JOIN suppliers s2 ON s2.id = rm.supplier_id
        WHERE rm.status IN ('פעיל', 'active')
        AND rm.current_stock IS NOT NULL
        AND rm.reorder_point IS NOT NULL
        AND rm.current_stock <= rm.reorder_point
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const mat of rows) {
        const supplierId = mat.preferred_supplier_id || mat.supplier_id;
        const orderQty = Number(mat.economic_order_qty || mat.reorder_qty || mat.maximum_stock || mat.minimum_stock || 100);
        const unitPrice = Number(mat.last_purchase_price || mat.standard_price || 0);
        await notify(
          "התראת מלאי — נקודת הזמנה מחדש",
          `${mat.material_name} (${mat.material_number}): מלאי ${mat.current_stock} ${mat.unit || 'יח'} — מתחת לנקודת הזמנה ${mat.reorder_point}`,
          mat.id
        );
        if (hasPR && supplierId) {
          try {
            const prExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM purchase_requests
              WHERE notes LIKE ${`%auto_reorder_mat_${mat.id}%`}
              AND status NOT IN ('cancelled','rejected','completed')
              AND created_at >= CURRENT_DATE - INTERVAL '7 days'
              LIMIT 1
            `));
            if (prExists.length === 0) {
              const prNum = `PR-AUTO-${mat.material_number}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
              await db.execute(sql`
                INSERT INTO purchase_requests (request_number, supplier_id, status, priority, total_amount, notes, items, created_at, updated_at)
                VALUES (
                  ${prNum},
                  ${Number(supplierId)},
                  'pending',
                  ${Number(mat.current_stock) <= 0 ? 'urgent' : 'normal'},
                  ${orderQty * unitPrice},
                  ${`auto_reorder_mat_${mat.id} | בקשת רכש אוטומטית — ${mat.material_name} (${mat.material_number}) מלאי ${mat.current_stock} מתוך מינימום ${mat.reorder_point}. ספק: ${mat.supplier_name}`},
                  ${JSON.stringify([{
                    material_id: mat.id,
                    material_number: mat.material_number,
                    material_name: mat.material_name,
                    quantity: orderQty,
                    unit: mat.unit || 'יחידה',
                    unit_price: unitPrice,
                    total_price: orderQty * unitPrice,
                  }])},
                  NOW(), NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`PR for ${mat.material_number}: ${err.message}`);
          }
        }
        affected++;
      }
      return { affected, details: { lowStockItems: rows.length }, errors };
    }
  },
  {
    id: "po-received-inventory-payable",
    name: "הזמנת רכש התקבלה → מלאי + חשבונית ספק + סטטוס",
    nameEn: "PO Received → Increase Inventory + Supplier Invoice + Update Status",
    description: "הזמנת רכש שהתקבלה מגדילה מלאי, יוצרת חשבונית ספק, מעדכנת חשבון ספקים ותזרים",
    source: "purchase_orders", target: "raw_materials", category: "procurement", icon: "PackageCheck",
    execute: async () => {
      if (!(await tableExists("purchase_orders"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasRM = await tableExists("raw_materials");
      const hasSI = await tableExists("supplier_invoices");
      const hasAP = await tableExists("accounts_payable");
      const hasCF = await tableExists("cash_flow_records");
      const hasIT = await tableExists("inventory_transactions");
      const rows = await safeQuery(() => db.execute(sql`
        SELECT po.id, po.order_number, po.supplier_id, po.total_amount, po.total_before_tax,
               po.tax_amount, po.discount_amount, po.currency, po.payment_terms, po.received_date,
               po.reference_number, po.status,
               COALESCE(s.supplier_name, '') as supplier_name,
               COALESCE(s.tax_id, '') as supplier_tax_id
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.status = 'received'
        AND po.received_date IS NOT NULL
        AND po.received_date >= CURRENT_DATE - INTERVAL '14 days'
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const po of rows) {
        const totalAmt = Number(po.total_amount || 0);
        if (hasRM && po.supplier_id) {
          try {
            const mats = await safeQuery(() => db.execute(sql`
              SELECT id, material_number, material_name, current_stock, unit
              FROM raw_materials
              WHERE (supplier_id = ${po.supplier_id} OR preferred_supplier_id = ${po.supplier_id})
              AND status IN ('פעיל', 'active')
            `));
            for (const mat of mats) {
              const alreadyDone = hasIT ? await safeQuery(() => db.execute(sql`
                SELECT 1 FROM inventory_transactions
                WHERE reference_number = ${`PO-${po.order_number || po.id}`}
                AND material_id = ${mat.id}
                LIMIT 1
              `)) : [];
              if (alreadyDone.length === 0) {
                const qtyToAdd = mats.length === 1 ? Math.ceil(totalAmt / Math.max(Number(mat.current_stock) || 1, 1)) : 1;
                await db.execute(sql`
                  UPDATE raw_materials
                  SET current_stock = COALESCE(current_stock, 0) + ${qtyToAdd},
                      last_receipt_date = ${po.received_date || sql`CURRENT_DATE`},
                      updated_at = NOW()
                  WHERE id = ${mat.id}
                `);
                if (hasIT) {
                  await db.execute(sql`
                    INSERT INTO inventory_transactions (material_id, transaction_type, quantity, reference_number, notes, created_at)
                    VALUES (
                      ${mat.id}, 'po_receipt', ${qtyToAdd},
                      ${`PO-${po.order_number || po.id}`},
                      ${`קבלה מהזמנת רכש ${po.order_number || po.id} — ${mat.material_name}`},
                      NOW()
                    )
                  `);
                }
                affected++;
              }
            }
          } catch (err: any) {
            errors.push(`Inventory PO#${po.id}: ${err.message}`);
          }
        }
        if (hasSI) {
          try {
            const invNum = `SINV-${po.order_number || po.id}`;
            const siExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM supplier_invoices WHERE invoice_number = ${invNum} LIMIT 1
            `));
            if (siExists.length === 0) {
              await db.execute(sql`
                INSERT INTO supplier_invoices (invoice_number, invoice_type, invoice_date, due_date, supplier_name, supplier_tax_id,
                  status, currency, subtotal, discount_amount, vat_amount, total_amount, payment_terms, po_number, notes, created_at, updated_at)
                VALUES (
                  ${invNum}, 'tax',
                  ${po.received_date || sql`CURRENT_DATE`},
                  ${sql`COALESCE(${po.received_date}::date, CURRENT_DATE) + INTERVAL '30 days'`},
                  ${po.supplier_name}, ${po.supplier_tax_id},
                  'draft', ${po.currency || 'ILS'},
                  ${Number(po.total_before_tax || totalAmt)},
                  ${Number(po.discount_amount || 0)},
                  ${Number(po.tax_amount || 0)},
                  ${totalAmt},
                  ${po.payment_terms || 'שוטף 30'},
                  ${po.order_number || String(po.id)},
                  ${`חשבונית ספק אוטומטית מהזמנת רכש ${po.order_number || po.id}`},
                  NOW(), NOW()
                )
                ON CONFLICT (invoice_number) DO NOTHING
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`Supplier Invoice PO#${po.id}: ${err.message}`);
          }
        }
        if (hasAP) {
          try {
            const apRef = `AP-PO-${po.order_number || po.id}`;
            const apExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM accounts_payable WHERE invoice_number = ${apRef} LIMIT 1
            `));
            if (apExists.length === 0) {
              await db.execute(sql`
                INSERT INTO accounts_payable (invoice_number, supplier_name, invoice_date, due_date, total_amount, paid_amount, status, payment_terms, notes, created_at, updated_at)
                VALUES (
                  ${apRef}, ${po.supplier_name},
                  ${po.received_date || sql`CURRENT_DATE`},
                  ${sql`COALESCE(${po.received_date}::date, CURRENT_DATE) + INTERVAL '30 days'`},
                  ${totalAmt}, 0, 'open',
                  ${po.payment_terms || 'שוטף 30'},
                  ${`חשבון ספקים מהזמנת רכש ${po.order_number || po.id}`},
                  NOW(), NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`AP PO#${po.id}: ${err.message}`);
          }
        }
        if (hasCF) {
          try {
            const cfRef = `CF-PO-${po.order_number || po.id}`;
            const cfExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM cash_flow_records WHERE reference_number = ${cfRef} LIMIT 1
            `));
            if (cfExists.length === 0) {
              await db.execute(sql`
                INSERT INTO cash_flow_records (record_date, category, type, amount, currency, description, reference_number, source, status, created_at)
                VALUES (
                  ${sql`COALESCE(${po.received_date}::date, CURRENT_DATE) + INTERVAL '30 days'`},
                  'הוצאות רכש',
                  'outflow',
                  ${totalAmt},
                  ${po.currency || 'ILS'},
                  ${`תשלום צפוי לספק ${po.supplier_name} — הזמנה ${po.order_number || po.id}`},
                  ${cfRef},
                  'auto_po_received',
                  'forecast',
                  NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`CashFlow PO#${po.id}: ${err.message}`);
          }
        }
      }
      return { affected, details: { receivedPOs: rows.length }, errors };
    }
  },
  {
    id: "employee-hired-payroll-onboarding",
    name: "עובד חדש → רשומת שכר + משימות קליטה",
    nameEn: "Employee Hired → Payroll Record + Onboarding Tasks",
    description: "עובד חדש שנוסף ל-30 ימים האחרונים מקבל רשומת שכר ראשונית ורשימת משימות קליטה מלאה",
    source: "employees", target: "payroll_records", category: "hr", icon: "UserPlus",
    execute: async () => {
      if (!(await tableExists("employees"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasPayroll = await tableExists("payroll_records");
      const hasOnboarding = await tableExists("onboarding_tasks");
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const rows = await safeQuery(() => db.execute(sql`
        SELECT e.id, e.employee_number, e.first_name, e.last_name, e.department, e.job_title,
               e.base_salary, e.bank_name, e.bank_branch, e.bank_account, e.email, e.phone, e.start_date
        FROM employees e
        WHERE e.status = 'active'
        AND e.start_date >= CURRENT_DATE - INTERVAL '30 days'
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const emp of rows) {
        const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        if (hasPayroll) {
          try {
            const prExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM payroll_records
              WHERE employee_id_ref = ${String(emp.id)}
              AND period_month = ${currentMonth}
              AND period_year = ${currentYear}
              LIMIT 1
            `));
            if (prExists.length === 0) {
              const recNum = `PAY-${emp.employee_number || emp.id}-${currentYear}${String(currentMonth).padStart(2,'0')}`;
              await db.execute(sql`
                INSERT INTO payroll_records (record_number, employee_name, employee_id_ref, period_month, period_year,
                  base_salary, overtime_hours, overtime_pay, bonus, commission, allowances, travel_allowance,
                  gross_salary, income_tax, national_insurance, health_insurance, pension_employee, pension_employer,
                  severance_fund, education_fund, other_deductions,
                  bank_name, bank_branch, bank_account, status, notes, created_at, updated_at)
                VALUES (
                  ${recNum}, ${empName}, ${String(emp.id)}, ${currentMonth}, ${currentYear},
                  ${Number(emp.base_salary || 0)}, 0, 0, 0, 0, 0, 0,
                  ${Number(emp.base_salary || 0)}, 0, 0, 0, 0, 0, 0, 0, 0,
                  ${emp.bank_name || ''}, ${emp.bank_branch || ''}, ${emp.bank_account || ''},
                  'draft',
                  ${`רשומת שכר ראשונית — עובד חדש ${empName}`},
                  NOW(), NOW()
                )
              `);
              affected++;
            }
          } catch (err: any) {
            errors.push(`Payroll ${empName}: ${err.message}`);
          }
        }
        if (hasOnboarding) {
          try {
            const obExists = await safeQuery(() => db.execute(sql`
              SELECT 1 FROM onboarding_tasks WHERE employee_id = ${emp.id} LIMIT 1
            `));
            if (obExists.length === 0) {
              const onboardingList = [
                { title: "חתימה על חוזה העסקה", category: "מסמכים", assigned: "משאבי אנוש", days: 0 },
                { title: "העתק תעודת זהות + ספח", category: "מסמכים", assigned: "משאבי אנוש", days: 0 },
                { title: "טופס 101 — הצהרת עובד", category: "מסמכים", assigned: "משאבי אנוש", days: 0 },
                { title: "אישור ניהול חשבון בנק", category: "מסמכים", assigned: "משאבי אנוש", days: 1 },
                { title: "טופס בחירת קופת גמל/פנסיה", category: "מסמכים", assigned: "משאבי אנוש", days: 7 },
                { title: "טופס קרן השתלמות", category: "מסמכים", assigned: "משאבי אנוש", days: 7 },
                { title: "הנפקת כרטיס עובד / תג כניסה", category: "ציוד", assigned: "אדמיניסטרציה", days: 0 },
                { title: "הקצאת עמדת עבודה + כלי עבודה", category: "ציוד", assigned: "מנהל מחלקה", days: 1 },
                { title: "הגדרת חשבון מחשב + אימייל", category: "IT", assigned: "מערכות מידע", days: 1 },
                { title: "הרשאות גישה למערכת ERP", category: "IT", assigned: "מערכות מידע", days: 1 },
                { title: "הדרכת בטיחות ראשונית", category: "הדרכה", assigned: "ממונה בטיחות", days: 1 },
                { title: "סיור במפעל — היכרות עם מחלקות", category: "הדרכה", assigned: "מנהל מחלקה", days: 1 },
                { title: "הדרכה מקצועית — תפקיד", category: "הדרכה", assigned: "מנהל מחלקה", days: 7 },
                { title: "הדרכה על ציוד מגן אישי (PPE)", category: "בטיחות", assigned: "ממונה בטיחות", days: 1 },
                { title: "רישום לביטוח לאומי / פנסיה", category: "פיננסי", assigned: "הנהלת חשבונות", days: 14 },
                { title: "שיחת משוב קליטה — שבוע ראשון", category: "מעקב", assigned: "מנהל ישיר", days: 7 },
                { title: "שיחת משוב קליטה — חודש ראשון", category: "מעקב", assigned: "מנהל ישיר", days: 30 },
              ];
              const startDate = emp.start_date ? new Date(emp.start_date) : new Date();
              for (const task of onboardingList) {
                const dueDate = new Date(startDate);
                dueDate.setDate(dueDate.getDate() + task.days);
                await db.execute(sql`
                  INSERT INTO onboarding_tasks (employee_id, employee_name, task_title, task_category, assigned_to, due_date, status, description, created_at, updated_at)
                  VALUES (
                    ${emp.id}, ${empName}, ${task.title}, ${task.category}, ${task.assigned},
                    ${dueDate.toISOString().slice(0,10)}, 'pending',
                    ${`${task.title} — ${empName} (${emp.employee_number || ''}) מחלקת ${emp.department || ''}`},
                    NOW(), NOW()
                  )
                `);
              }
              affected += onboardingList.length;
              await notify(
                "עובד חדש — משימות קליטה נוצרו",
                `${empName} (${emp.employee_number || ''}) — ${onboardingList.length} משימות קליטה נוצרו אוטומטית`,
                emp.id
              );
            }
          } catch (err: any) {
            errors.push(`Onboarding ${empName}: ${err.message}`);
          }
        }
      }
      return { affected, details: { newEmployees: rows.length }, errors };
    }
  },
  {
    id: "milestone-done-notify-completion",
    name: "אבן דרך הושלמה → התראה + חישוב % השלמה",
    nameEn: "Milestone Done → Notification + Recalculate Completion %",
    description: "אבן דרך בפרויקט שסומנה כהושלמה שולחת התראה ומחשבת מחדש את אחוז ההשלמה של הפרויקט",
    source: "project_milestones", target: "projects", category: "projects", icon: "FlagTriangleRight",
    execute: async () => {
      if (!(await tableExists("project_milestones"))) return { affected: 0, details: { reason: "tables_missing" } };
      if (!(await tableExists("projects"))) return { affected: 0, details: { reason: "tables_missing" } };
      const completedMilestones = await safeQuery(() => db.execute(sql`
        SELECT pm.id, pm.project_id, pm.title, pm.weight_pct, pm.completed_at,
               p.project_name, p.project_number, p.completion_pct AS old_completion
        FROM project_milestones pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.status = 'completed'
        AND pm.completed_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      `));
      const projectIds = [...new Set(completedMilestones.map((m: any) => m.project_id).filter(Boolean))];
      let affected = 0;
      const errors: string[] = [];
      for (const projectId of projectIds) {
        try {
          const allMilestones = await safeQuery(() => db.execute(sql`
            SELECT id, title, status, weight_pct FROM project_milestones WHERE project_id = ${projectId}
          `));
          const total = allMilestones.length;
          if (total === 0) continue;
          const hasWeights = allMilestones.some((m: any) => Number(m.weight_pct || 0) > 0);
          let newPct: number;
          if (hasWeights) {
            const totalWeight = allMilestones.reduce((s: number, m: any) => s + Number(m.weight_pct || 0), 0);
            const completedWeight = allMilestones
              .filter((m: any) => m.status === 'completed')
              .reduce((s: number, m: any) => s + Number(m.weight_pct || 0), 0);
            newPct = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
          } else {
            const completedCount = allMilestones.filter((m: any) => m.status === 'completed').length;
            newPct = Math.round((completedCount / total) * 100);
          }
          const projectInfo = completedMilestones.find((m: any) => m.project_id === projectId);
          const oldPct = Number(projectInfo?.old_completion || 0);
          await db.execute(sql`
            UPDATE projects
            SET completion_pct = ${newPct},
                status = ${newPct >= 100 ? 'completed' : 'active'},
                updated_at = NOW()
            WHERE id = ${projectId}
          `);
          affected++;
          const recentlyCompleted = completedMilestones
            .filter((m: any) => m.project_id === projectId)
            .map((m: any) => m.title);
          await notify(
            "אבן דרך הושלמה בפרויקט",
            `${projectInfo?.project_name || ''} (${projectInfo?.project_number || ''}): ${recentlyCompleted.join(', ')} — התקדמות ${oldPct}% → ${newPct}%`,
            projectId
          );
          if (newPct >= 100) {
            await notify(
              "פרויקט הושלם! 🏁",
              `${projectInfo?.project_name || ''} (${projectInfo?.project_number || ''}) — כל אבני הדרך הושלמו. הפרויקט סומן כהושלם.`,
              projectId
            );
          }
        } catch (err: any) {
          errors.push(`Project#${projectId}: ${err.message}`);
        }
      }
      return { affected, details: { projectsUpdated: projectIds.length, milestonesProcessed: completedMilestones.length }, errors };
    }
  },
  {
    id: "wo-material-consumption",
    name: "הזמנת עבודה → צריכת חומרי גלם",
    nameEn: "Work Order → Raw Material Consumption",
    description: "הזמנות עבודה בייצור מורידות כמויות מחומרי גלם לפי BOM",
    source: "work_orders", target: "raw_materials", category: "production", icon: "ArrowDownCircle",
    execute: async () => {
      if (!(await tableExists("work_orders")) || !(await tableExists("raw_materials")) || !(await tableExists("bom_lines"))) return { affected: 0, details: { reason: "tables_missing" } };
      const hasTxnTable = await tableExists("inventory_transactions");
      const rows = await safeQuery(() => db.execute(sql`
        SELECT wo.id, wo.bom_id, wo.quantity_ordered, wo.status, wo.material_consumption
        FROM work_orders wo
        WHERE wo.status = 'in_progress'
        AND wo.bom_id IS NOT NULL
        AND (wo.material_consumption IS NULL OR wo.material_consumption = '')
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const wo of rows) {
        const bomLines = await safeQuery(() => db.execute(sql`
          SELECT bl.material_id, bl.quantity as qty_per_unit, bl.component_name
          FROM bom_lines bl
          WHERE bl.bom_header_id = ${wo.bom_id}
          AND bl.material_id IS NOT NULL
        `));
        if (bomLines.length === 0) continue;
        const woQty = Number(wo.quantity_ordered || 1);
        try {
          await db.transaction(async (tx) => {
            for (const line of bomLines) {
              const consumeQty = Number(line.qty_per_unit || 0) * woQty;
              if (consumeQty <= 0) continue;
              await tx.execute(sql`
                UPDATE raw_materials
                SET current_stock = GREATEST(COALESCE(current_stock, 0) - ${consumeQty}, 0),
                    updated_at = NOW()
                WHERE id = ${line.material_id}
              `);
              if (hasTxnTable) {
                await tx.execute(sql`
                  INSERT INTO inventory_transactions (material_id, transaction_type, quantity, work_order_id, notes, created_at)
                  VALUES (${line.material_id}, 'consumption', ${consumeQty}, ${wo.id}, ${'צריכת חומר להזמנת עבודה ' + wo.id}, NOW())
                `);
              }
            }
            await tx.execute(sql`
              UPDATE work_orders
              SET material_consumption = ${'consumed_' + new Date().toISOString()},
                  updated_at = NOW()
              WHERE id = ${wo.id}
            `);
          });
          affected += bomLines.length;
        } catch (err: any) {
          errors.push(`WO#${wo.id}: ${err.message}`);
        }
      }
      return { affected, details: { workOrders: rows.length }, errors };
    }
  },
  {
    id: "wo-completion-to-finished-goods",
    name: "ייצור הושלם → מלאי מוצרים מוגמרים",
    nameEn: "Work Order Complete → Finished Goods Stock",
    description: "הזמנות עבודה שהושלמו מעדכנות מלאי מוצרים מוגמרים",
    source: "work_orders", target: "finished_goods_stock", category: "production", icon: "PackageCheck",
    execute: async () => {
      if (!(await tableExists("work_orders")) || !(await tableExists("finished_goods_stock"))) return { affected: 0, details: { reason: "tables_missing" } };
      const rows = await safeQuery(() => db.execute(sql`
        SELECT wo.id, wo.product_id, wo.quantity_ordered, wo.status, wo.tags
        FROM work_orders wo
        WHERE wo.status = 'completed'
        AND (wo.tags IS NULL OR wo.tags NOT LIKE '%fg_posted%')
        AND NOT EXISTS (
          SELECT 1 FROM finished_goods_stock fg WHERE fg.work_order_id = wo.id
        )
        LIMIT 50
      `));
      let affected = 0;
      const errors: string[] = [];
      for (const wo of rows) {
        const qty = Number(wo.quantity_ordered || 0);
        if (qty <= 0 || !wo.product_id) continue;
        try {
          await db.transaction(async (tx) => {
            await tx.execute(sql`
              INSERT INTO finished_goods_stock (product_id, work_order_id, quantity, quality_status, created_at)
              VALUES (${wo.product_id}, ${wo.id}, ${qty}, 'approved', NOW())
            `);
            await tx.execute(sql`
              UPDATE work_orders
              SET tags = COALESCE(tags, '') || ',fg_posted',
                  updated_at = NOW()
              WHERE id = ${wo.id}
            `);
          });
          affected++;
        } catch (err: any) {
          errors.push(`WO#${wo.id}: ${err.message}`);
        }
      }
      return { affected, details: { completedOrders: rows.length }, errors };
    }
  },
];

export function getFlowDefinitions() {
  return FLOWS.map(f => ({
    id: f.id, name: f.name, nameEn: f.nameEn, description: f.description,
    source: f.source, target: f.target, category: f.category, icon: f.icon,
  }));
}
