import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { asyncHandler, successResponse, paginatedResponse } from "./production-middleware";
import { VAT_RATE } from "../constants";

// === Standard CRUD Factory ===
// יוצר CRUD routes עם validation, error handling, audit, pagination
export function createStandardCRUD(options: {
  tableName: string;
  entityName: string;
  entityNameHe: string;
  searchFields?: string[];
  defaultSort?: string;
  defaultLimit?: number;
}) {
  const router = Router();
  const { tableName, entityName, entityNameHe, searchFields, defaultSort, defaultLimit } = options;
  const sort = defaultSort || 'created_at DESC';
  const limit = defaultLimit || 50;

  // GET / - רשימה עם פגינציה, חיפוש וסינון
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.limit)) || limit));
    const offset = (page - 1) * pageSize;
    const search = req.query.search ? String(req.query.search) : null;
    const status = req.query.status ? String(req.query.status) : null;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      whereClause += ` AND status = $${paramIdx++}`;
      params.push(status);
    }

    if (search && searchFields && searchFields.length > 0) {
      const searchConditions = searchFields.map(f => `CAST(${f} AS TEXT) ILIKE $${paramIdx}`).join(' OR ');
      whereClause += ` AND (${searchConditions})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName} ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(
      `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${sort} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
    );

    return paginatedResponse(res, dataResult.rows, total, page, pageSize);
  }));

  // GET /:id - פריט בודד
  router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `${entityName} not found`,
        error_he: `${entityNameHe} לא נמצא`,
        code: 'NOT_FOUND'
      });
    }

    return successResponse(res, result.rows[0]);
  }));

  // POST / - יצירת פריט חדש
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data provided',
        error_he: 'לא סופקו נתונים',
        code: 'EMPTY_BODY'
      });
    }

    const values = fields.map(f => {
      const val = req.body[f];
      return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
    });
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query(
      `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return res.status(201).json({
      success: true,
      message: `${entityName} created successfully`,
      message_he: `${entityNameHe} נוצר בהצלחה`,
      data: result.rows[0]
    });
  }));

  // PUT /:id - עדכון פריט
  router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data to update',
        error_he: 'אין נתונים לעדכון',
        code: 'EMPTY_BODY'
      });
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map(f => {
      const val = req.body[f];
      return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
    });

    const result = await pool.query(
      `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `${entityName} not found`,
        error_he: `${entityNameHe} לא נמצא`,
        code: 'NOT_FOUND'
      });
    }

    return successResponse(res, result.rows[0], `${entityName} updated`, `${entityNameHe} עודכן בהצלחה`);
  }));

  // DELETE /:id - מחיקה (רק מנהלים)
  router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const userRole = req.headers['x-user-role'] as string;
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can delete records',
        error_he: 'רק מנהלים יכולים למחוק רשומות',
        code: 'DELETE_FORBIDDEN'
      });
    }

    const { id } = req.params;
    const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `${entityName} not found`,
        error_he: `${entityNameHe} לא נמצא`,
        code: 'NOT_FOUND'
      });
    }

    return successResponse(res, { deleted: true, id }, `${entityName} deleted`, `${entityNameHe} נמחק`);
  }));

  return router;
}

// === Common Israeli Business Validations ===
export function validateIsraeliId(id: string): boolean {
  if (!id || id.length !== 9 || !/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(id[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

export function validateIsraeliPhone(phone: string): boolean {
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  return /^(0[2-9]\d{7,8}|972[2-9]\d{7,8}|\+972[2-9]\d{7,8})$/.test(clean);
}

export function validateIsraeliCompanyId(id: string): boolean {
  return /^\d{8,9}$/.test(id.replace(/[\s\-]/g, ''));
}

// === VAT calculation helper (17% Israel) ===
export function calculateVAT(amount: number, includesVAT: boolean = false): { beforeVAT: number; vat: number; afterVAT: number } {
  if (includesVAT) {
    const beforeVAT = Math.round((amount / (1 + VAT_RATE)) * 100) / 100;
    return {
      beforeVAT,
      vat: Math.round((amount - beforeVAT) * 100) / 100,
      afterVAT: amount
    };
  } else {
    const vat = Math.round(amount * VAT_RATE * 100) / 100;
    return {
      beforeVAT: amount,
      vat,
      afterVAT: Math.round((amount + vat) * 100) / 100
    };
  }
}

export default {
  createStandardCRUD,
  validateIsraeliId,
  validateIsraeliPhone,
  validateIsraeliCompanyId,
  calculateVAT
};
