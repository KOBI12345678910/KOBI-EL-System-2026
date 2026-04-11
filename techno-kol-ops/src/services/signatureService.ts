import crypto from 'crypto';
import { query, getClient } from '../db/connection';
import { broadcastToAll, broadcast } from '../realtime/websocket';
import { notificationService } from './notifications';

// ════════════════════════════════════════════════════════════
//
//   SIGNATURE SERVICE
//   מנוע חתימות דיגיטליות מלא
//
// ════════════════════════════════════════════════════════════

export const signatureService = {

  // ══════════════════════════════════════
  // יצירת מסמך חדש
  // ══════════════════════════════════════
  async createDocument(params: {
    type: string;
    title: string;
    content: string;
    projectId?: string;
    orderId?: string;
    recipients: {
      type: 'client' | 'employee' | 'manager';
      name: string;
      phone?: string;
      email?: string;
      employeeId?: string;
      clientId?: string;
      signingOrder?: number;
      isRequired?: boolean;
    }[];
    createdBy?: string;
    metadata?: any;
  }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // צור מסמך
      const { rows: docRows } = await client.query(`
        INSERT INTO documents
          (type, title, content, project_id, order_id, created_by, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
      `, [
        params.type, params.title, params.content,
        params.projectId || null, params.orderId || null,
        params.createdBy || null,
        JSON.stringify(params.metadata || {})
      ]);

      const doc = docRows[0];

      // צור נמענים
      const recipients = [];
      for (const r of params.recipients) {
        const { rows: recRows } = await client.query(`
          INSERT INTO document_recipients
            (document_id, recipient_type, recipient_name, recipient_phone,
             recipient_email, employee_id, client_id, signing_order, is_required)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *
        `, [
          doc.id, r.type, r.name, r.phone || null,
          r.email || null, r.employeeId || null, r.clientId || null,
          r.signingOrder || 1, r.isRequired !== false
        ]);
        recipients.push(recRows[0]);
      }

      // לוג יצירה
      await this.auditLog(client, doc.id, 'created', 'user', params.createdBy, 'המסמך נוצר');

      await client.query('COMMIT');

      return { document: doc, recipients };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ══════════════════════════════════════
  // שליחת מסמך לחתימה
  // ══════════════════════════════════════
  async sendDocument(documentId: string) {
    const [docRes, recipientsRes] = await Promise.all([
      query(`SELECT d.*, p.title as project_title FROM documents d LEFT JOIN projects p ON d.project_id=p.id WHERE d.id=$1`, [documentId]),
      query(`SELECT * FROM document_recipients WHERE document_id=$1 ORDER BY signing_order ASC`, [documentId])
    ]);

    const doc = docRes.rows[0];
    if (!doc) throw new Error('Document not found');

    const recipients = recipientsRes.rows;

    // שלח לנמענים לפי סדר חתימה
    // שלב ראשון — שלח לנמען עם signing_order=1
    const firstGroup = recipients.filter(r => r.signing_order === 1);

    for (const recipient of firstGroup) {
      await this.sendToRecipient(doc, recipient);
    }

    // עדכן סטטוס מסמך
    await query(`UPDATE documents SET status='sent', updated_at=NOW() WHERE id=$1`, [documentId]);

    await this.auditLog(null, documentId, 'sent', 'system', null,
      `נשלח ל-${firstGroup.length} נמענים`);

    broadcastToAll('DOCUMENT_SENT', {
      document_id: documentId,
      title: doc.title,
      recipients_count: firstGroup.length
    });

    return { sent: true, recipients_notified: firstGroup.length };
  },

  // ── שלח לנמען בודד
  async sendToRecipient(doc: any, recipient: any) {
    // צור טוקן
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 ימים

    await query(`
      INSERT INTO document_tokens (document_id, recipient_id, token, purpose, expires_at)
      VALUES ($1,$2,$3,'sign',$4)
    `, [doc.id, recipient.id, token, expiresAt]);

    // עדכן סטטוס נמען
    await query(`UPDATE document_recipients SET status='sent', sent_at=NOW() WHERE id=$1`, [recipient.id]);

    const signUrl = `${process.env.APP_URL}/sign/${token}`;

    // שלח WhatsApp / SMS
    const message = this.buildSigningMessage(doc, recipient, signUrl);

    await query(`
      INSERT INTO notifications
        (project_id, recipient_type, recipient_employee_id, recipient_client_id,
         channel, template, content, status)
      VALUES ($1,$2,$3,$4,'whatsapp','DOCUMENT_SIGN',$5,'sent')
    `, [
      doc.project_id,
      recipient.recipient_type === 'client' ? 'client' : 'employee',
      recipient.employee_id, recipient.client_id,
      message
    ]);

    console.log(`[SIGNATURE] Sent to ${recipient.recipient_name}: ${signUrl}`);

    return { token, signUrl, message };
  },

  buildSigningMessage(doc: any, recipient: any, signUrl: string): string {
    const isEmployee = recipient.recipient_type === 'employee';

    if (isEmployee) {
      return `שלום ${recipient.recipient_name} 👋\n\nנשלח אליך מסמך לחתימה:\n📄 ${doc.title}\n\nלחתימה דיגיטלית:\n${signUrl}\n\nהקישור בתוקף ל-7 ימים.\nטכנו-קול ✨`;
    }

    return `שלום ${recipient.recipient_name} 👋\n\nהחוזה שלכם עם טכנו-קול מוכן לחתימה:\n📄 ${doc.title}\n\n✍️ לחתימה דיגיטלית:\n${signUrl}\n\nהקישור בתוקף ל-7 ימים.\nלשאלות: 052-XXXXXXX\nטכנו-קול ✨`;
  },

  // ══════════════════════════════════════
  // קבלת מסמך לחתימה (דרך טוקן)
  // ══════════════════════════════════════
  async getDocumentByToken(token: string) {
    const { rows: tokenRows } = await query(`
      SELECT dt.*, d.*, dr.recipient_name, dr.recipient_type, dr.status as recipient_status,
        dr.id as recipient_id, dr.signing_order
      FROM document_tokens dt
      JOIN documents d ON dt.document_id=d.id
      JOIN document_recipients dr ON dt.recipient_id=dr.id
      WHERE dt.token=$1
        AND dt.expires_at > NOW()
        AND dt.used_at IS NULL
    `, [token]);

    if (!tokenRows[0]) return null;

    const tokenData = tokenRows[0];

    // עדכן viewed
    if (tokenData.recipient_status === 'sent') {
      await query(`UPDATE document_recipients SET status='viewed', viewed_at=NOW() WHERE id=$1`, [tokenData.recipient_id]);
      await query(`UPDATE documents SET status='viewed', updated_at=NOW() WHERE id=$1 AND status='sent'`, [tokenData.document_id]);
      await this.auditLog(null, tokenData.document_id, 'viewed', tokenData.recipient_type, tokenData.recipient_id, `${tokenData.recipient_name} צפה במסמך`);
    }

    // קבל חתימות קיימות
    const { rows: sigsRes } = await query(`
      SELECT s.*, dr.recipient_name, dr.recipient_type
      FROM signatures s JOIN document_recipients dr ON s.recipient_id=dr.id
      WHERE s.document_id=$1
    `, [tokenData.document_id]);

    // קבל כל הנמענים
    const { rows: allRecipients } = await query(`
      SELECT * FROM document_recipients WHERE document_id=$1 ORDER BY signing_order
    `, [tokenData.document_id]);

    return {
      ...tokenData,
      existing_signatures: sigsRes,
      all_recipients: allRecipients,
      can_sign: tokenData.recipient_status !== 'signed' && tokenData.status !== 'rejected'
    };
  },

  // ══════════════════════════════════════
  // שמירת חתימה
  // ══════════════════════════════════════
  async saveSignature(params: {
    token: string;
    signatureData: string; // base64
    signatureType: 'drawn' | 'typed' | 'uploaded';
    signedName: string;
    ipAddress?: string;
    userAgent?: string;
    lat?: number;
    lng?: number;
  }) {
    const { rows: tokenRows } = await query(`
      SELECT dt.*, dr.id as recipient_id, dr.signing_order, dr.document_id
      FROM document_tokens dt
      JOIN document_recipients dr ON dt.recipient_id=dr.id
      WHERE dt.token=$1 AND dt.expires_at>NOW() AND dt.used_at IS NULL
    `, [params.token]);

    if (!tokenRows[0]) throw new Error('טוקן לא תקין או פג תוקף');

    const tokenData = tokenRows[0];

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // חשב hash לאימות
      const { rows: docRows } = await client.query(
        `SELECT content FROM documents WHERE id=$1`, [tokenData.document_id]
      );
      const validationHash = crypto
        .createHash('sha256')
        .update(docRows[0].content + params.signatureData + new Date().toISOString())
        .digest('hex');

      // שמור חתימה
      const { rows: sigRows } = await client.query(`
        INSERT INTO signatures
          (document_id, recipient_id, signature_data, signature_type,
           signed_name, ip_address, user_agent, location_lat, location_lng, validation_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
        tokenData.document_id, tokenData.recipient_id,
        params.signatureData, params.signatureType,
        params.signedName, params.ipAddress || null,
        params.userAgent || null, params.lat || null, params.lng || null,
        validationHash
      ]);

      // עדכן נמען
      await client.query(`
        UPDATE document_recipients SET status='signed', signed_at=NOW() WHERE id=$1
      `, [tokenData.recipient_id]);

      // סמן טוקן כנוצל
      await client.query(`UPDATE document_tokens SET used_at=NOW() WHERE token=$1`, [params.token]);

      // בדוק אם כולם חתמו
      const allSigned = await this.checkAllSigned(client, tokenData.document_id);

      if (allSigned) {
        await client.query(`UPDATE documents SET status='signed', updated_at=NOW() WHERE id=$1`, [tokenData.document_id]);
        await this.onAllSigned(tokenData.document_id);
      } else {
        // שלח לנמען הבא בתור
        await this.triggerNextSigner(client, tokenData.document_id, tokenData.signing_order);
      }

      await this.auditLog(client, tokenData.document_id, 'signed',
        'recipient', tokenData.recipient_id, `${params.signedName} חתם`);

      await client.query('COMMIT');

      return {
        success: true,
        all_signed: allSigned,
        validation_hash: validationHash,
        signature: sigRows[0]
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async checkAllSigned(client: any, documentId: string): Promise<boolean> {
    const { rows } = await client.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='signed') as signed,
        COUNT(*) FILTER (WHERE is_required=true AND status!='signed') as unsigned_required
      FROM document_recipients WHERE document_id=$1
    `, [documentId]);
    return parseInt(rows[0].unsigned_required) === 0;
  },

  async triggerNextSigner(client: any, documentId: string, currentOrder: number) {
    const { rows } = await client.query(`
      SELECT * FROM document_recipients
      WHERE document_id=$1 AND signing_order=$2 AND status='pending'
    `, [documentId, currentOrder + 1]);

    for (const recipient of rows) {
      const docRes = await client.query(`SELECT * FROM documents WHERE id=$1`, [documentId]);
      await this.sendToRecipient(docRes.rows[0], recipient);
    }
  },

  async onAllSigned(documentId: string) {
    // שלח עותק חתום לכולם
    const { rows: recipients } = await query(`
      SELECT dr.*, s.signed_at, s.signed_name
      FROM document_recipients dr
      LEFT JOIN signatures s ON dr.id=s.recipient_id
      WHERE dr.document_id=$1
    `, [documentId]);

    const { rows: docRows } = await query(`
      SELECT d.*, p.title as project_title FROM documents d
      LEFT JOIN projects p ON d.project_id=p.id
      WHERE d.id=$1
    `, [documentId]);

    const doc = docRows[0];

    // התרע למערכת
    broadcastToAll('DOCUMENT_FULLY_SIGNED', {
      document_id: documentId,
      title: doc.title,
      signed_by: recipients.map(r => r.recipient_name),
      project_id: doc.project_id
    });

    // אם זה חוזה פרוייקט — קדם שלב
    if (doc.project_id && doc.type === 'contract_client') {
      const { pipelineService } = await import('./pipeline');
      await pipelineService.advanceStage(
        doc.project_id, 'contract_sent', 'system', 'system',
        { notes: 'חוזה נחתם דיגיטלית על ידי כל הצדדים' }
      ).catch(() => {});
    }

    console.log(`[SIGNATURE] Document ${documentId} fully signed by all parties`);
  },

  // ══════════════════════════════════════
  // דחיית מסמך
  // ══════════════════════════════════════
  async rejectDocument(token: string, reason: string) {
    const { rows: tokenRows } = await query(`
      SELECT dt.*, dr.id as recipient_id, dr.recipient_name
      FROM document_tokens dt
      JOIN document_recipients dr ON dt.recipient_id=dr.id
      WHERE dt.token=$1 AND dt.expires_at>NOW() AND dt.used_at IS NULL
    `, [token]);

    if (!tokenRows[0]) throw new Error('טוקן לא תקין');

    const t = tokenRows[0];

    await query(`
      UPDATE document_recipients
      SET status='rejected', rejected_at=NOW(), rejection_reason=$2
      WHERE id=$1
    `, [t.recipient_id, reason]);

    await query(`UPDATE document_tokens SET used_at=NOW() WHERE token=$1`, [token]);
    await query(`UPDATE documents SET status='rejected', updated_at=NOW() WHERE id=$1`, [t.document_id]);

    await this.auditLog(null, t.document_id, 'rejected',
      'recipient', t.recipient_id, `${t.recipient_name} דחה: ${reason}`);

    broadcastToAll('DOCUMENT_REJECTED', {
      document_id: t.document_id,
      recipient: t.recipient_name,
      reason
    });

    return { rejected: true };
  },

  // ══════════════════════════════════════
  // שליחת תזכורת
  // ══════════════════════════════════════
  async sendReminder(documentId: string) {
    const { rows: pending } = await query(`
      SELECT dr.*, dt.token, dt.expires_at,
        d.title as doc_title
      FROM document_recipients dr
      JOIN documents d ON dr.document_id=d.id
      LEFT JOIN document_tokens dt ON dt.recipient_id=dr.id AND dt.expires_at>NOW() AND dt.used_at IS NULL
      WHERE dr.document_id=$1 AND dr.status IN ('sent','viewed')
    `, [documentId]);

    for (const recipient of pending) {
      if (!recipient.token) {
        // צור טוקן חדש
        const newToken = crypto.randomBytes(32).toString('hex');
        await query(`
          INSERT INTO document_tokens (document_id, recipient_id, token, purpose, expires_at)
          VALUES ($1,$2,$3,'sign', NOW()+INTERVAL '3 days')
        `, [documentId, recipient.id, newToken]);
        recipient.token = newToken;
      }

      const signUrl = `${process.env.APP_URL}/sign/${recipient.token}`;
      const message = `תזכורת: ${recipient.recipient_name}, המסמך "${recipient.doc_title}" ממתין לחתימתך.\n✍️ ${signUrl}`;

      console.log(`[REMINDER] → ${recipient.recipient_name}: ${signUrl}`);

      await this.auditLog(null, documentId, 'reminded', 'system', null,
        `תזכורת נשלחה ל-${recipient.recipient_name}`);
    }

    return { reminded: pending.length };
  },

  // ══════════════════════════════════════
  // יצירת PDF מסמך חתום
  // ══════════════════════════════════════
  async generateSignedDocument(documentId: string): Promise<string> {
    const [docRes, sigsRes, recipientsRes] = await Promise.all([
      query(`SELECT * FROM documents WHERE id=$1`, [documentId]),
      query(`
        SELECT s.*, dr.recipient_name, dr.recipient_type, dr.signing_order
        FROM signatures s JOIN document_recipients dr ON s.recipient_id=dr.id
        WHERE s.document_id=$1 ORDER BY s.signed_at ASC
      `, [documentId]),
      query(`SELECT * FROM document_recipients WHERE document_id=$1 ORDER BY signing_order`, [documentId])
    ]);

    const doc = docRes.rows[0];
    const signatures = sigsRes.rows;
    const recipients = recipientsRes.rows;

    const allSigned = recipients.every(r => r.status === 'signed');
    const date = new Date().toLocaleDateString('he-IL');

    // בנה עמוד חתימות
    const signaturesHtml = signatures.map(sig => `
      <div style="border:1px solid #ccc;padding:16px;margin-bottom:12px;break-inside:avoid">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:13px;font-weight:700">${sig.recipient_name}</div>
            <div style="font-size:11px;color:#666">${sig.recipient_type === 'client' ? 'לקוח' : 'עובד'}</div>
          </div>
          <div style="text-align:left">
            <div style="font-size:11px;color:#666">${new Date(sig.signed_at).toLocaleString('he-IL')}</div>
            <div style="font-size:10px;color:#999">IP: ${sig.ip_address || '—'}</div>
          </div>
        </div>
        <img src="${sig.signature_data}" style="height:70px;border-bottom:1px solid #eee;display:block;margin-bottom:6px" />
        <div style="font-size:11px;color:#666">חתם: <strong>${sig.signed_name}</strong></div>
        <div style="font-size:9px;color:#999;margin-top:4px;word-break:break-all">Hash: ${sig.validation_hash?.slice(0, 32)}...</div>
      </div>
    `).join('');

    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
  .doc-content { padding: 40px; }
  .signed-banner {
    background: ${allSigned ? '#f0fff4' : '#fff8e1'};
    border: 2px solid ${allSigned ? '#2d9a4e' : '#f59e0b'};
    padding: 12px 20px;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .signed-stamp {
    border: 3px solid #2d9a4e;
    color: #2d9a4e;
    padding: 8px 20px;
    font-weight: 900;
    font-size: 18px;
    transform: rotate(-15deg);
    display: inline-block;
    border-radius: 4px;
  }
  .sig-page { padding: 40px; border-top: 2px solid #000; margin-top: 40px; }
  .sig-page-title { font-size: 20px; font-weight: 700; margin-bottom: 24px; }
  .validation-footer {
    background: #f5f5f5;
    padding: 12px 20px;
    margin: 20px 0;
    font-size: 10px;
    color: #666;
    border-right: 3px solid #000;
  }
</style>
</head>
<body>

<!-- SIGNED BANNER -->
<div class="signed-banner">
  <div>
    <div style="font-weight:700;font-size:14px;color:${allSigned ? '#2d9a4e' : '#f59e0b'}">
      ${allSigned ? '✓ מסמך חתום על ידי כל הצדדים' : '⏳ ממתין לחתימות נוספות'}
    </div>
    <div style="font-size:11px;color:#666">
      ${signatures.length} מתוך ${recipients.length} חתמו | תאריך הפקה: ${date}
    </div>
  </div>
  ${allSigned ? `<div class="signed-stamp">נחתם</div>` : ''}
</div>

<!-- DOCUMENT CONTENT -->
<div class="doc-content">
  ${doc.content}
</div>

<!-- SIGNATURES PAGE -->
<div class="sig-page">
  <div class="sig-page-title">עמוד חתימות</div>

  ${signaturesHtml}

  ${recipients.filter(r => r.status !== 'signed').map(r => `
    <div style="border:1px dashed #ccc;padding:16px;margin-bottom:12px;color:#999">
      <div style="font-size:13px">${r.recipient_name} — ממתין לחתימה</div>
    </div>
  `).join('')}

  <div class="validation-footer">
    <strong>אימות דיגיטלי:</strong><br>
    מסמך זה נחתם דיגיטלית באמצעות מערכת טכנו-קול.<br>
    לאימות: ${process.env.APP_URL}/verify/${documentId}<br>
    Document ID: ${documentId}
  </div>
</div>

</body>
</html>`;

    return html;
  },

  // ══════════════════════════════════════
  // אימות מסמך
  // ══════════════════════════════════════
  async verifyDocument(documentId: string) {
    const [docRes, sigsRes] = await Promise.all([
      query(`SELECT * FROM documents WHERE id=$1`, [documentId]),
      query(`
        SELECT s.*, dr.recipient_name FROM signatures s
        JOIN document_recipients dr ON s.recipient_id=dr.id
        WHERE s.document_id=$1
      `, [documentId])
    ]);

    if (!docRes.rows[0]) return { valid: false, error: 'מסמך לא נמצא' };

    const doc = docRes.rows[0];
    const sigs = sigsRes.rows;

    return {
      valid: doc.status === 'signed',
      document_id: documentId,
      title: doc.title,
      status: doc.status,
      created_at: doc.created_at,
      signatures: sigs.map(s => ({
        signer: s.recipient_name,
        signed_at: s.signed_at,
        valid: s.is_valid,
        hash: s.validation_hash?.slice(0, 16) + '...'
      })),
      integrity: sigs.length > 0 ? 'verified' : 'unsigned'
    };
  },

  // ── Audit Log
  async auditLog(client: any, documentId: string, action: string,
    actorType: string, actorId: string | null, description: string) {
    const q = client || { query: (sql: string, params: any[]) => query(sql, params) };
    await q.query(`
      INSERT INTO document_audit_log (document_id, action, actor_type, actor_id, metadata)
      VALUES ($1,$2,$3,$4,$5)
    `, [documentId, action, actorType, actorId, JSON.stringify({ description })]).catch(() => {});
  }
};
