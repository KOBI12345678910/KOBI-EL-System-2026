import { Router, Request, Response } from 'express';
import { pool } from "@workspace/db";
import multer from "multer";
import { fireCrmFollowupEvent } from "../lib/crm-followup-engine";

type MulterRequest = Request & { file?: Express.Multer.File };

const router = Router();

const expenseUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function normalizeExpenseUploadFields(raw: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    fileName: "file_name",
    uploadDate: "upload_date",
    vendorName: "vendor_name",
    receiptNumber: "receipt_number",
  };
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const col = map[k] || k;
    result[col] = v;
  }
  return result;
}

const EXPENSE_UPLOAD_COLS = new Set([
  "file_name", "upload_date", "source", "amount", "vendor_name",
  "category", "status", "description", "receipt_number", "notes"
]);

router.post("/expense-upload", expenseUploadMulter.single("file"), async (req: MulterRequest, res: Response) => {
  try {
    const raw: Record<string, unknown> = { ...req.body };
    if (req.file) {
      raw.file_name = (raw.file_name as string) || (raw.fileName as string) || req.file.originalname;
    }
    const data = normalizeExpenseUploadFields(raw);
    data.upload_date = data.upload_date || new Date().toISOString().slice(0, 10);

    const keys = Object.keys(data).filter(k => EXPENSE_UPLOAD_COLS.has(k) && data[k] !== undefined && data[k] !== "");
    if (keys.length === 0) {
      res.status(400).json({ error: "אין נתונים תקינים" });
      return;
    }
    const vals = keys.map(k => data[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const colStr = keys.map(k => `"${k}"`).join(", ");
    const { rows } = await pool.query(
      `INSERT INTO expense_upload (${colStr}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    res.status(201).json(rows[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[expense-upload] POST:", msg);
    res.status(500).json({ error: msg });
  }
});

router.put("/expense-upload/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const data = normalizeExpenseUploadFields(req.body || {});
    const keys = Object.keys(data).filter(k => EXPENSE_UPLOAD_COLS.has(k) && data[k] !== undefined);
    if (keys.length === 0) { res.status(400).json({ error: "אין נתונים לעדכון" }); return; }
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
    const vals = [...keys.map(k => data[k]), id];
    const { rows } = await pool.query(
      `UPDATE expense_upload SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows[0]) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[expense-upload] PUT:", msg);
    res.status(500).json({ error: msg });
  }
});

function safeCol(col: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(col) ? col : '';
}

async function auditLog(action: string, entityType: string, entityId: string, oldValues?: any, newValues?: any) {
  try {
    await pool.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, old_values, new_values, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [action, entityType, entityId, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null]
    );
  } catch (_) {}
}

async function getNextNumber(prefix: string, tableName: string, columnName: string, client?: any): Promise<string> {
  try {
    const q = client || pool;
    const r = await q.query(
      `SELECT MAX(CAST(NULLIF(regexp_replace(${columnName}, '^[^0-9]*', ''), '') AS INTEGER)) AS max_num FROM ${tableName} WHERE ${columnName} LIKE $1`,
      [`${prefix}%`]
    );
    const nextNum = (r.rows[0]?.max_num || 0) + 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  } catch {
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }
}

interface EntityConfig {
  table: string;
  entityName: string;
  hebrewName: string;
  searchFields: string[];
  filterFields: string[];
  sortFields: string[];
  numberField?: string;
  numberPrefix?: string;
  extraNumberFields?: { field: string; prefix: string }[];
  fieldMap?: Record<string, string>;
  statsQuery?: string;
  hasIsActive?: boolean;
}

function createEntityRouter(config: EntityConfig): Router {
  const r = Router();
  const { table, entityName, hebrewName, searchFields, filterFields, sortFields, numberField, numberPrefix, extraNumberFields, fieldMap, statsQuery, hasIsActive = true } = config;

  r.get('/stats', async (_req: Request, res: Response) => {
    try {
      if (statsQuery) {
        const result = await pool.query(statsQuery);
        res.json({ success: true, data: result.rows[0] });
      } else {
        const baseWhere = hasIsActive ? 'WHERE is_active = true' : '';
        const result = await pool.query(`
          SELECT 
            COUNT(*) as total
            ${hasIsActive ? ", COUNT(*) FILTER (WHERE is_active = true) as active, COUNT(*) FILTER (WHERE is_active = false) as inactive" : ''}
            , COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
          FROM ${table}
        `);
        res.json({ success: true, data: result.rows[0] });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: `שגיאה בטעינת סטטיסטיקות ${hebrewName}`, details: error.message });
    }
  });

  r.get('/export', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`SELECT * FROM ${table} ${hasIsActive ? 'WHERE is_active = true' : ''} ORDER BY created_at DESC`);
      if (result.rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send('\uFEFF');
        return;
      }
      const headers = Object.keys(result.rows[0]);
      const csv = '\uFEFF' + headers.join(',') + '\n' + result.rows.map(row =>
        headers.map(h => {
          const v = row[h];
          if (v === null || v === undefined) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${table}_export.csv"`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ success: false, error: `שגיאה בייצוא ${hebrewName}`, details: error.message });
    }
  });

  r.get('/', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        limit = '20',
        search = '',
        sort = 'created_at',
        order = 'desc',
        updated_after,
        since,
        ...filters
      } = req.query;

      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
      const offset = (pageNum - 1) * limitNum;
      const deltaTimestamp = (updated_after || since) as string | undefined;

      let query = `SELECT * FROM ${table}`;
      let countQuery = `SELECT COUNT(*) FROM ${table}`;
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (hasIsActive) {
        conditions.push('is_active = true');
      }

      if (search) {
        const searchConds = searchFields
          .filter(f => safeCol(f))
          .map(f => `${f} ILIKE $${paramIndex}`)
          .join(' OR ');
        if (searchConds) {
          conditions.push(`(${searchConds})`);
          params.push(`%${search}%`);
          paramIndex++;
        }
      }

      if (deltaTimestamp) {
        conditions.push(`updated_at >= $${paramIndex}`);
        params.push(deltaTimestamp);
        paramIndex++;
      }

      for (const ff of filterFields) {
        if (filters[ff] && safeCol(ff)) {
          conditions.push(`${ff} = $${paramIndex}`);
          params.push(filters[ff]);
          paramIndex++;
        }
      }

      const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
      query += where;
      countQuery += where;

      const sortField = sortFields.includes(sort as string) ? sort as string : 'created_at';
      const sortOrder = (order as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      query += ` ORDER BY ${sortField} ${sortOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limitNum, offset);

      const [results, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, params.slice(0, paramIndex - 1))
      ]);

      const total = parseInt(countResult.rows[0].count);
      res.json({
        success: true,
        data: results.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error: any) {
      console.error(`Error fetching ${table}:`, error);
      res.status(500).json({ success: false, error: `שגיאה בטעינת ${hebrewName}`, details: error.message });
    }
  });

  r.get('/:id', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT * FROM ${table} WHERE id = $1${hasIsActive ? ' AND is_active = true' : ''}`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: `${hebrewName} לא נמצא` });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'שגיאה', details: error.message });
    }
  });

  r.post('/', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rawFields = { ...req.body };

      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawFields)) {
        const mappedKey = fieldMap?.[k] ?? k;
        fields[mappedKey] = v;
      }

      if (numberField && numberPrefix && !fields[numberField]) {
        fields[numberField] = await getNextNumber(numberPrefix, table, numberField, client);
      }

      if (extraNumberFields) {
        for (const extra of extraNumberFields) {
          if (!fields[extra.field]) {
            if (numberField && fields[numberField]) {
              fields[extra.field] = fields[numberField];
            } else {
              fields[extra.field] = await getNextNumber(extra.prefix, table, extra.field, client);
            }
          }
        }
      }

      const colsResult = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name != 'id' AND is_generated = 'NEVER' AND generation_expression IS NULL`,
        [table]
      );
      const validCols = new Set(colsResult.rows.map((r: any) => r.column_name));

      const keys = Object.keys(fields).filter(k => validCols.has(k) && fields[k] !== undefined);
      if (keys.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'לא סופקו שדות' });
      }

      const values = keys.map(k => fields[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);

      const result = await client.query(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
        values
      );

      await client.query('COMMIT');
      await auditLog('create', entityName, result.rows[0].id, null, result.rows[0]);
      res.status(201).json({ success: true, data: result.rows[0] });
      // Fire CRM follow-up engine — async, non-blocking
      if (entityName === 'lead') {
        fireCrmFollowupEvent('lead_created', 'lead', { ...result.rows[0], entity_type: 'lead' }).catch(() => {});
      } else if (entityName === 'sales_order') {
        fireCrmFollowupEvent('order_placed', 'customer', { ...result.rows[0], entity_type: 'customer', id: result.rows[0].customer_id }).catch(() => {});
      }
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ success: false, error: `שגיאה ביצירת ${hebrewName}`, details: error.message });
    } finally {
      client.release();
    }
  });

  r.put('/:id', async (req: Request, res: Response) => {
    try {
      const old = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (old.rows.length === 0) {
        return res.status(404).json({ success: false, error: `${hebrewName} לא נמצא` });
      }

      const rawFields = { ...req.body, updated_at: new Date() };
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawFields)) {
        const mappedKey = fieldMap?.[k] ?? k;
        fields[mappedKey] = v;
      }

      const colsResult = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name != 'id' AND is_generated = 'NEVER' AND generation_expression IS NULL`,
        [table]
      );
      const validCols = new Set(colsResult.rows.map((r: any) => r.column_name));

      const keys = Object.keys(fields).filter(k => validCols.has(k) && fields[k] !== undefined);
      const values = keys.map(k => fields[k]);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

      const result = await pool.query(
        `UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, req.params.id]
      );

      await auditLog('update', entityName, req.params.id, old.rows[0], result.rows[0]);
      res.json({ success: true, data: result.rows[0] });
      // Fire CRM follow-up engine on status changes — async, non-blocking
      const oldStatus = old.rows[0]?.status;
      const newStatus = result.rows[0]?.status;
      if (newStatus && newStatus !== oldStatus) {
        if (entityName === 'lead') {
          const triggerMap: Record<string, string> = {
            converted: 'lead_converted',
            lost: 'lead_lost',
            contacted: 'lead_created',
          };
          const trigger = triggerMap[newStatus];
          if (trigger) fireCrmFollowupEvent(trigger, 'lead', { ...result.rows[0], entity_type: 'lead' }).catch(() => {});
        } else if (entityName === 'sales_order') {
          const triggerMap: Record<string, string> = {
            confirmed: 'order_placed', approved: 'order_placed',
            shipped: 'delivery_shipped', delivered: 'delivery_shipped',
          };
          const trigger = triggerMap[newStatus];
          if (trigger) fireCrmFollowupEvent(trigger, 'customer', { ...result.rows[0], entity_type: 'customer', id: result.rows[0].customer_id }).catch(() => {});
        }
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: `שגיאה בעדכון ${hebrewName}`, details: error.message });
    }
  });

  r.delete('/:id', async (req: Request, res: Response) => {
    try {
      let result;
      if (hasIsActive) {
        result = await pool.query(
          `UPDATE ${table} SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [req.params.id]
        );
      } else {
        result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [req.params.id]);
      }

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: `${hebrewName} לא נמצא` });
      }

      await auditLog('delete', entityName, req.params.id, result.rows[0]);
      res.json({ success: true, message: `${hebrewName} נמחק בהצלחה` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: `שגיאה במחיקה`, details: error.message });
    }
  });

  return r;
}

const customersRouter = createEntityRouter({
  table: 'customers',
  entityName: 'customer',
  hebrewName: 'לקוח',
  searchFields: ['company_name', 'name', 'email', 'phone', 'customer_number', 'contact_person', 'city'],
  filterFields: ['status', 'customer_group', 'customer_type', 'city', 'region', 'industry', 'loyalty_tier'],
  sortFields: ['created_at', 'company_name', 'customer_number', 'total_revenue', 'outstanding_balance', 'name'],
  numberField: 'customer_number',
  numberPrefix: 'C-',
  fieldMap: { customer_name: 'name', company: 'company_name' },
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COUNT(*) FILTER (WHERE is_active = false) as inactive,
      COUNT(*) FILTER (WHERE customer_group = 'vip') as vip,
      COUNT(*) FILTER (WHERE status = 'lead' OR status = 'prospect') as leads,
      COALESCE(SUM(outstanding_balance) FILTER (WHERE is_active = true), 0) as total_outstanding,
      COALESCE(SUM(total_revenue) FILTER (WHERE is_active = true), 0) as total_revenue,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM customers
  `
});

const contactsRouter = createEntityRouter({
  table: 'contacts',
  entityName: 'contact',
  hebrewName: 'איש קשר',
  searchFields: ['first_name', 'last_name', 'email', 'phone', 'mobile', 'department'],
  filterFields: ['is_primary', 'is_billing_contact', 'is_shipping_contact', 'department'],
  sortFields: ['created_at', 'first_name', 'last_name', 'department'],
});

const suppliersRouter = createEntityRouter({
  table: 'suppliers',
  entityName: 'supplier',
  hebrewName: 'ספק',
  searchFields: ['supplier_name', 'contact_person', 'email', 'phone', 'supplier_number', 'city', 'category'],
  filterFields: ['status', 'category', 'supplier_type', 'supplier_tier', 'country', 'preferred', 'blacklisted'],
  sortFields: ['created_at', 'supplier_name', 'supplier_number', 'rating', 'total_orders', 'total_spent'],
  numberField: 'supplier_number',
  numberPrefix: 'S-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'inactive' OR status = 'blocked') as inactive,
      COUNT(*) FILTER (WHERE blacklisted = true) as blacklisted,
      COUNT(*) FILTER (WHERE preferred = true) as preferred,
      COALESCE(ROUND(AVG(rating)::numeric, 1), 0) as avg_rating,
      COALESCE(SUM(total_spent), 0) as total_spent,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM suppliers
  `
});

const rawMaterialsRouter = createEntityRouter({
  table: 'raw_materials',
  entityName: 'raw_material',
  hebrewName: 'חומר גלם',
  searchFields: ['material_name', 'material_number', 'category', 'sub_category', 'description'],
  filterFields: ['status', 'category', 'sub_category', 'abc_classification', 'unit'],
  sortFields: ['created_at', 'material_name', 'material_number', 'current_stock', 'standard_price', 'category'],
  numberField: 'material_number',
  numberPrefix: 'RM-',
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE current_stock <= reorder_point AND reorder_point > 0) as below_reorder,
      COUNT(*) FILTER (WHERE current_stock = 0) as out_of_stock,
      COALESCE(SUM(current_stock * standard_price), 0) as total_value,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM raw_materials
  `
});

const productsRouter = createEntityRouter({
  table: 'products',
  entityName: 'product',
  hebrewName: 'מוצר',
  searchFields: ['product_name', 'product_number', 'sku', 'barcode', 'description', 'brand', 'model'],
  filterFields: ['status', 'material_type', 'finish_type', 'brand', 'unit'],
  sortFields: ['created_at', 'product_name', 'product_number', 'current_stock', 'price_per_sqm_before_vat'],
  numberField: 'product_number',
  numberPrefix: 'P-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'discontinued') as discontinued,
      COUNT(*) FILTER (WHERE current_stock <= min_stock AND min_stock > 0) as low_stock,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM products
  `
});

const salesOrdersRouter = createEntityRouter({
  table: 'sales_orders',
  entityName: 'sales_order',
  hebrewName: 'הזמנת מכירה',
  searchFields: ['order_number', 'customer_name', 'notes', 'shipping_address'],
  filterFields: ['status', 'payment_status', 'priority', 'approval_status', 'shipping_method', 'salesperson'],
  sortFields: ['created_at', 'order_number', 'order_date', 'delivery_date', 'total', 'customer_name', 'status'],
  numberField: 'order_number',
  numberPrefix: 'SO-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'draft') as draft,
      COUNT(*) FILTER (WHERE status = 'confirmed' OR status = 'approved') as confirmed,
      COUNT(*) FILTER (WHERE status = 'in_production' OR status = 'in_progress') as in_production,
      COUNT(*) FILTER (WHERE status = 'shipped' OR status = 'delivered') as shipped,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COALESCE(SUM(total), 0) as total_value,
      COALESCE(SUM(paid_amount), 0) as total_paid,
      COALESCE(SUM(total) - SUM(COALESCE(paid_amount, 0)), 0) as total_unpaid,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM sales_orders
  `
});

const salesOrderItemsRouter = createEntityRouter({
  table: 'sales_order_items',
  entityName: 'sales_order_item',
  hebrewName: 'פריט הזמנה',
  searchFields: ['product_name', 'product_code', 'notes'],
  filterFields: ['order_id'],
  sortFields: ['created_at', 'product_name', 'quantity', 'total_price', 'unit_price'],
  hasIsActive: false,
});

const quotesRouter = createEntityRouter({
  table: 'quotes',
  entityName: 'quote',
  hebrewName: 'הצעת מחיר',
  searchFields: ['quote_number', 'customer_name', 'notes', 'project_name', 'sales_rep'],
  filterFields: ['status', 'quote_type', 'priority', 'sales_rep', 'installation_required'],
  sortFields: ['created_at', 'quote_number', 'quote_date', 'valid_until', 'total_amount', 'customer_name', 'status'],
  numberField: 'quote_number',
  numberPrefix: 'Q-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'draft') as draft,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'approved' OR status = 'accepted') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected' OR status = 'declined') as rejected,
      COUNT(*) FILTER (WHERE status = 'expired') as expired,
      COALESCE(SUM(total_amount), 0) as total_value,
      COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved' OR status = 'accepted'), 0) as approved_value,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM quotes
  `
});

const quoteItemsRouter = createEntityRouter({
  table: 'quote_items',
  entityName: 'quote_item',
  hebrewName: 'פריט הצעת מחיר',
  searchFields: ['description', 'notes'],
  filterFields: ['quote_id'],
  sortFields: ['created_at', 'line_number', 'quantity', 'unit_price'],
  hasIsActive: false,
});

const workOrdersRouter = createEntityRouter({
  table: 'work_orders',
  entityName: 'work_order',
  hebrewName: 'הוראת עבודה',
  searchFields: ['work_order_number', 'product_name', 'notes', 'description'],
  filterFields: ['status', 'priority', 'production_line', 'assigned_to'],
  sortFields: ['created_at', 'work_order_number', 'start_date', 'end_date', 'quantity', 'status', 'priority'],
  numberField: 'work_order_number',
  numberPrefix: 'WO-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'draft' OR status = 'planned') as planned,
      COUNT(*) FILTER (WHERE status = 'in_progress' OR status = 'active') as in_progress,
      COUNT(*) FILTER (WHERE status = 'completed' OR status = 'done') as completed,
      COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) FILTER (WHERE priority = 'urgent' OR priority = 'critical') as urgent,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM work_orders
  `
});

const purchaseOrdersRouter = createEntityRouter({
  table: 'purchase_orders',
  entityName: 'purchase_order',
  hebrewName: 'הזמנת רכש',
  searchFields: ['po_number', 'supplier_name', 'notes', 'description'],
  filterFields: ['status', 'priority', 'approval_status', 'payment_status', 'department'],
  sortFields: ['created_at', 'po_number', 'order_date', 'delivery_date', 'total_amount', 'supplier_name', 'status'],
  numberField: 'po_number',
  numberPrefix: 'PO-',
  extraNumberFields: [{ field: 'order_number', prefix: 'PO-' }],
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'draft') as draft,
      COUNT(*) FILTER (WHERE status = 'approved' OR status = 'confirmed') as approved,
      COUNT(*) FILTER (WHERE status = 'ordered' OR status = 'sent') as ordered,
      COUNT(*) FILTER (WHERE status = 'received' OR status = 'partially_received') as received,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COALESCE(SUM(total_amount), 0) as total_value,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM purchase_orders
  `
});

const employeesRouter = createEntityRouter({
  table: 'employees',
  entityName: 'employee',
  hebrewName: 'עובד',
  searchFields: ['first_name', 'last_name', 'full_name', 'employee_number', 'email', 'phone', 'department', 'job_title', 'id_number'],
  filterFields: ['status', 'department', 'employment_type', 'gender', 'city'],
  sortFields: ['created_at', 'first_name', 'last_name', 'employee_number', 'department', 'start_date', 'base_salary'],
  numberField: 'employee_number',
  numberPrefix: 'E-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'inactive' OR status = 'terminated') as inactive,
      COUNT(*) FILTER (WHERE status = 'on_leave') as on_leave,
      COUNT(DISTINCT department) as departments,
      COALESCE(ROUND(AVG(base_salary)::numeric, 0), 0) as avg_salary,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM employees
  `
});

const expensesRouter = createEntityRouter({
  table: 'expenses',
  entityName: 'expense',
  hebrewName: 'הוצאה',
  searchFields: ['expense_number', 'description', 'vendor_name', 'category', 'employee_name', 'supplier_name', 'invoice_number'],
  filterFields: ['status', 'category', 'department', 'payment_method', 'expense_type', 'cost_center'],
  sortFields: ['created_at', 'expense_date', 'amount', 'expense_number', 'category', 'vendor_name', 'status'],
  numberField: 'expense_number',
  numberPrefix: 'EXP-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'draft') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE status = 'paid') as paid,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) as approved_amount,
      COALESCE(SUM(amount) FILTER (WHERE expense_date >= NOW() - INTERVAL '30 days'), 0) as last_30_days_amount,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM expenses
  `
});

const leadsRouter = createEntityRouter({
  table: 'leads',
  entityName: 'lead',
  hebrewName: 'ליד',
  searchFields: ['first_name', 'last_name', 'company_name', 'email', 'phone', 'lead_number', 'notes'],
  filterFields: ['status', 'source', 'assigned_to', 'address_city'],
  sortFields: ['created_at', 'first_name', 'last_name', 'company_name', 'lead_score', 'estimated_value', 'status'],
  numberField: 'lead_number',
  numberPrefix: 'L-',
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COUNT(*) FILTER (WHERE status = 'new') as new_leads,
      COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
      COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
      COUNT(*) FILTER (WHERE status = 'converted') as converted,
      COUNT(*) FILTER (WHERE status = 'lost') as lost,
      COALESCE(SUM(estimated_value), 0) as total_estimated_value,
      COALESCE(ROUND(AVG(lead_score)::numeric, 0), 0) as avg_score,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM leads
  `
});

const alertsRouter = createEntityRouter({
  table: 'alerts',
  entityName: 'alert',
  hebrewName: 'התראה',
  searchFields: ['title', 'message', 'category', 'alert_type'],
  filterFields: ['alert_type', 'category', 'priority'],
  sortFields: ['created_at', 'priority', 'alert_type', 'category', 'title'],
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_read = false) as unread,
      COUNT(*) FILTER (WHERE is_dismissed = false) as active,
      COUNT(*) FILTER (WHERE priority >= 3) as high_priority,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24_hours,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM alerts
  `
});

const stockMovementsRouter = createEntityRouter({
  table: 'stock_movements',
  entityName: 'stock-movement',
  hebrewName: 'תנועת מלאי',
  searchFields: ['batch_number', 'lot_number', 'reason', 'notes'],
  filterFields: ['movement_type', 'material_type', 'from_warehouse_id', 'to_warehouse_id'],
  sortFields: ['created_at', 'movement_type', 'quantity'],
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE movement_type = 'in') as incoming,
      COUNT(*) FILTER (WHERE movement_type = 'out') as outgoing,
      COUNT(*) FILTER (WHERE movement_type = 'transfer') as transfers,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM stock_movements
  `
});

const bomHeadersRouter = createEntityRouter({
  table: 'bom_headers',
  entityName: 'bom-header',
  hebrewName: 'עץ מוצר',
  searchFields: ['bom_number', 'name', 'description'],
  filterFields: ['status', 'product_id'],
  sortFields: ['created_at', 'name', 'bom_number', 'status', 'version'],
  numberField: 'bom_number',
  numberPrefix: 'BOM-',
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'draft') as draft,
      COUNT(*) FILTER (WHERE status = 'archived') as archived,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM bom_headers
  `
});

const bomLinesRouter = createEntityRouter({
  table: 'bom_lines',
  entityName: 'bom-line',
  hebrewName: 'שורת עץ מוצר',
  searchFields: ['notes'],
  filterFields: ['bom_id', 'raw_material_id'],
  sortFields: ['created_at', 'sort_order', 'quantity'],
  hasIsActive: false
});

const productionLinesRouter = createEntityRouter({
  table: 'production_lines',
  entityName: 'production-line',
  hebrewName: 'קו ייצור',
  searchFields: ['name', 'code', 'notes'],
  filterFields: ['status', 'line_type'],
  sortFields: ['created_at', 'name', 'code', 'status', 'capacity_per_hour'],
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COUNT(*) FILTER (WHERE status = 'running') as running,
      COUNT(*) FILTER (WHERE status = 'idle') as idle,
      COUNT(*) FILTER (WHERE status = 'maintenance') as in_maintenance,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM production_lines
  `
});

const leaveRequestsRouter = createEntityRouter({
  table: 'leave_requests',
  entityName: 'leave-request',
  hebrewName: 'בקשת חופשה',
  searchFields: ['reason', 'notes', 'employee_name', 'request_number'],
  filterFields: ['employee_id', 'leave_type', 'status', 'department'],
  sortFields: ['created_at', 'start_date', 'end_date', 'leave_type', 'status', 'total_days'],
  hasIsActive: false,
  statsQuery: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COALESCE(SUM(total_days), 0) as total_days,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
    FROM leave_requests
  `
});

router.use('/customers', customersRouter);
router.use('/contacts', contactsRouter);
router.use('/suppliers', suppliersRouter);
router.use('/raw-materials', rawMaterialsRouter);
router.use('/products', productsRouter);
router.use('/sales-orders', salesOrdersRouter);
router.use('/sales-order-items', salesOrderItemsRouter);
router.use('/quotes', quotesRouter);
router.use('/quote-items', quoteItemsRouter);
router.use('/work-orders', workOrdersRouter);
router.use('/purchase-orders', purchaseOrdersRouter);
router.use('/employees', employeesRouter);
router.use('/expenses', expensesRouter);
router.use('/leads', leadsRouter);
router.use('/alerts', alertsRouter);
router.use('/stock-movements', stockMovementsRouter);
router.use('/bom-headers', bomHeadersRouter);
router.use('/bom-lines', bomLinesRouter);
router.use('/production-lines', productionLinesRouter);
router.use('/leave-requests', leaveRequestsRouter);

export default router;
