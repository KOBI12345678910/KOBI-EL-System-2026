import { Router, Response, Request } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { signatureService } from '../services/signatureService';
import { documentTemplates } from '../services/documentTemplates';
import { query } from '../db/connection';

const router = Router();

// ── יצירת מסמך חדש
router.post('/documents', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await signatureService.createDocument({
      ...req.body,
      createdBy: req.user?.id
    });
    res.status(201).json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── יצירת חוזה לקוח + שליחה
router.post('/documents/client-contract', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      projectId, clientId, clientName, clientPhone, clientAddress,
      projectTitle, projectAddress, totalPrice, advancePct, deliveryDate,
      description, warrantyMonths, sendImmediately
    } = req.body;

    // בנה HTML
    const content = await documentTemplates.buildClientContract({
      clientName, clientPhone, clientAddress, projectTitle,
      projectAddress, totalPrice, advancePct: advancePct || 50,
      deliveryDate, description, warrantyMonths
    });

    // צור מסמך
    const { document, recipients } = await signatureService.createDocument({
      type: 'contract_client',
      title: `חוזה — ${projectTitle}`,
      content,
      projectId,
      recipients: [
        {
          type: 'client',
          name: clientName,
          phone: clientPhone,
          clientId,
          signingOrder: 1
        },
        // חתימת הנהלה (signing_order=2, לאחר הלקוח)
        {
          type: 'manager',
          name: 'קובי אלקיים',
          phone: '0527957599',
          signingOrder: 2
        }
      ],
      createdBy: req.user?.id,
      metadata: { projectId, totalPrice, deliveryDate }
    });

    // שלח מיד אם נדרש
    if (sendImmediately) {
      await signatureService.sendDocument(document.id);
    }

    res.status(201).json({ document, recipients, sent: sendImmediately });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── יצירת חוזה עובד + שליחה
router.post('/documents/employee-contract', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      employeeId, employeeName, employeePhone, role, department,
      salary, startDate, employmentType, workHours, benefits, sendImmediately
    } = req.body;

    const content = await documentTemplates.buildEmployeeContract({
      employeeName, role, department, salary,
      startDate, employmentType: employmentType || 'full',
      workHours, benefits
    });

    const { document, recipients } = await signatureService.createDocument({
      type: 'contract_employee',
      title: `חוזה עבודה — ${employeeName}`,
      content,
      employeeId: employeeId || null,
      recipients: [
        {
          type: 'employee',
          name: employeeName,
          phone: employeePhone,
          employeeId,
          signingOrder: 1
        },
        {
          type: 'manager',
          name: 'קובי אלקיים',
          phone: '0527957599',
          signingOrder: 2
        }
      ],
      createdBy: req.user?.id
    });

    if (sendImmediately) {
      await signatureService.sendDocument(document.id);
    }

    res.status(201).json({ document, recipients, sent: sendImmediately });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── שליחת מסמך
router.post('/documents/:id/send', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await signatureService.sendDocument(req.params.id);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── תזכורת
router.post('/documents/:id/remind', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await signatureService.sendReminder(req.params.id);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── קבל כל המסמכים
router.get('/documents', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { type, status, project_id } = req.query;
    let sql = `
      SELECT d.*, COUNT(dr.id) as recipients_count,
        COUNT(s.id) as signatures_count
      FROM documents d
      LEFT JOIN document_recipients dr ON d.id=dr.document_id
      LEFT JOIN signatures s ON d.id=s.document_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let i = 1;
    if (type) { sql += ` AND d.type=$${i++}`; params.push(type); }
    if (status) { sql += ` AND d.status=$${i++}`; params.push(status); }
    if (project_id) { sql += ` AND d.project_id=$${i++}`; params.push(project_id); }
    sql += ` GROUP BY d.id ORDER BY d.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── מסמך מלא
router.get('/documents/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [docRes, recipientsRes, sigsRes, auditRes] = await Promise.all([
      query(`SELECT * FROM documents WHERE id=$1`, [req.params.id]),
      query(`SELECT * FROM document_recipients WHERE document_id=$1 ORDER BY signing_order`, [req.params.id]),
      query(`SELECT s.*, dr.recipient_name FROM signatures s JOIN document_recipients dr ON s.recipient_id=dr.id WHERE s.document_id=$1`, [req.params.id]),
      query(`SELECT * FROM document_audit_log WHERE document_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.params.id])
    ]);

    res.json({
      document: docRes.rows[0],
      recipients: recipientsRes.rows,
      signatures: sigsRes.rows,
      audit_log: auditRes.rows
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── מסמך חתום
router.get('/documents/:id/signed', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const html = await signatureService.generateSignedDocument(req.params.id);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════
// PUBLIC ROUTES — ללא auth, עם טוקן
// ══════════════════════════════════════════

// ── קבל מסמך לחתימה
router.get('/sign/:token', async (req: Request, res: Response) => {
  try {
    const doc = await signatureService.getDocumentByToken(req.params.token);
    if (!doc) return res.status(404).json({ error: 'קישור לא תקין או פג תוקף' });
    res.json(doc);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── חתום
router.post('/sign/:token', async (req: Request, res: Response) => {
  try {
    const result = await signatureService.saveSignature({
      token: req.params.token,
      signatureData: req.body.signature_data,
      signatureType: req.body.signature_type || 'drawn',
      signedName: req.body.signed_name,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      lat: req.body.lat,
      lng: req.body.lng
    });
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── דחה
router.post('/sign/:token/reject', async (req: Request, res: Response) => {
  try {
    const result = await signatureService.rejectDocument(req.params.token, req.body.reason);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── אימות מסמך
router.get('/verify/:documentId', async (req: Request, res: Response) => {
  try {
    const result = await signatureService.verifyDocument(req.params.documentId);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
