import { query, getClient } from '../db/connection';
import { broadcastToAll, broadcast } from '../realtime/websocket';
import { notificationService } from './notifications';
import { aiCoordinator } from './aiCoordinator';
import crypto from 'crypto';

// ════════════════════════════════════════
// PIPELINE STATE MACHINE
// כל שלב יודע מה קורה אחריו
// ════════════════════════════════════════

const STAGE_CONFIG: Record<string, {
  next: string;
  label: string;
  labelHe: string;
  auto?: boolean;
  requiresApproval?: string;
  notifyClient?: boolean;
  notifyEmployee?: string;
}> = {
  deal_closed: {
    next: 'measurement_scheduled',
    label: 'Deal Closed',
    labelHe: 'עסקה נסגרה',
    auto: true // AI מתאם מיד
  },
  measurement_scheduled: {
    next: 'measurement_done',
    label: 'Measurement Scheduled',
    labelHe: 'מדידה תואמה',
    requiresApproval: 'surveyor',
    notifyClient: true,
    notifyEmployee: 'surveyor'
  },
  measurement_done: {
    next: 'contract_sent',
    label: 'Measurement Done',
    labelHe: 'מדידה בוצעה',
    auto: true
  },
  contract_sent: {
    next: 'contract_signed',
    label: 'Contract Sent',
    labelHe: 'חוזה נשלח',
    notifyClient: true
  },
  contract_signed: {
    next: 'materials_ordered',
    label: 'Contract Signed',
    labelHe: 'חוזה נחתם',
    requiresApproval: 'client',
    auto: true // מיד מזמין חומר
  },
  materials_ordered: {
    next: 'materials_arrived',
    label: 'Materials Ordered',
    labelHe: 'חומר הוזמן',
    notifyEmployee: 'production_manager'
  },
  materials_arrived: {
    next: 'production_assigned',
    label: 'Materials Arrived',
    labelHe: 'חומר הגיע',
    requiresApproval: 'production_manager'
  },
  production_assigned: {
    next: 'production_started',
    label: 'Production Assigned',
    labelHe: 'הוקצה לקבלן',
    requiresApproval: 'contractor',
    notifyEmployee: 'contractor'
  },
  production_started: {
    next: 'production_done',
    label: 'Production Started',
    labelHe: 'ייצור התחיל',
    requiresApproval: 'contractor'
  },
  production_done: {
    next: 'sent_to_paint',
    label: 'Production Done',
    labelHe: 'ייצור הסתיים',
    requiresApproval: 'contractor',
    notifyEmployee: 'driver'
  },
  sent_to_paint: {
    next: 'returned_from_paint',
    label: 'Sent to Paint',
    labelHe: 'נשלח לצביעה',
    requiresApproval: 'driver'
  },
  returned_from_paint: {
    next: 'installation_scheduled',
    label: 'Returned from Paint',
    labelHe: 'חזר מצביעה',
    requiresApproval: 'driver',
    auto: true // AI מתאם התקנה
  },
  installation_scheduled: {
    next: 'installation_started',
    label: 'Installation Scheduled',
    labelHe: 'התקנה תואמה',
    notifyClient: true,
    notifyEmployee: 'installer'
  },
  installation_started: {
    next: 'installation_done',
    label: 'Installation Started',
    labelHe: 'יצאה להתקנה',
    requiresApproval: 'installer'
  },
  installation_done: {
    next: 'survey_sent',
    label: 'Installation Done',
    labelHe: 'התקנה הסתיימה',
    requiresApproval: 'installer',
    notifyClient: true,
    auto: true
  },
  survey_sent: {
    next: 'payment_requested',
    label: 'Survey Sent',
    labelHe: 'סקר נשלח',
    notifyClient: true,
    auto: true
  },
  payment_requested: {
    next: 'payment_received',
    label: 'Payment Requested',
    labelHe: 'בקשת תשלום',
    notifyClient: true,
    notifyEmployee: 'project_manager'
  },
  payment_received: {
    next: 'project_closed',
    label: 'Payment Received',
    labelHe: 'תשלום התקבל',
    auto: true
  },
  project_closed: {
    next: '',
    label: 'Project Closed',
    labelHe: 'פרוייקט נסגר'
  }
};

export const pipelineService = {

  // ── קבל פרוייקט מלא
  async getProject(projectId: string) {
    const [projectRes, eventsRes, approvalsRes, notifRes] = await Promise.all([
      query(`
        SELECT p.*,
          c.name as client_name, c.phone as client_phone, c.email as client_email,
          surveyor.name as surveyor_name,
          pm.name as production_manager_name,
          contractor.name as contractor_name,
          installer.name as installer_name,
          driver.name as driver_name,
          proj_mgr.name as project_manager_name
        FROM projects p
        JOIN clients c ON p.client_id = c.id
        LEFT JOIN employees surveyor ON p.surveyor_id = surveyor.id
        LEFT JOIN employees pm ON p.production_manager_id = pm.id
        LEFT JOIN employees contractor ON p.contractor_id = contractor.id
        LEFT JOIN employees installer ON p.installer_id = installer.id
        LEFT JOIN employees driver ON p.driver_id = driver.id
        LEFT JOIN employees proj_mgr ON p.project_manager_id = proj_mgr.id
        WHERE p.id = $1
      `, [projectId]),
      query(`SELECT pe.*, e.name as employee_name FROM pipeline_events pe LEFT JOIN employees e ON pe.performed_by = e.id WHERE pe.project_id = $1 ORDER BY pe.created_at ASC`, [projectId]),
      query(`SELECT * FROM approvals WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]),
      query(`SELECT * FROM pipeline_notifications WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20`, [projectId])
    ]);

    if (!projectRes.rows[0]) throw new Error('Project not found');

    const project = projectRes.rows[0];
    const stageConfig = STAGE_CONFIG[project.current_stage];
    const completedStages = eventsRes.rows.map((e: any) => e.stage);
    const pendingApproval = approvalsRes.rows.find((a: any) => a.status === 'pending');

    return {
      ...project,
      events: eventsRes.rows,
      approvals: approvalsRes.rows,
      notifications: notifRes.rows,
      stageConfig,
      pendingApproval,
      progress: this.calculateProgress(project.current_stage),
      timeline: this.buildTimeline(project, eventsRes.rows)
    };
  },

  // ── חישוב אחוז התקדמות
  calculateProgress(stage: string): number {
    const stages = Object.keys(STAGE_CONFIG);
    const idx = stages.indexOf(stage);
    return Math.round((idx / (stages.length - 1)) * 100);
  },

  // ── בנה ציר זמן
  buildTimeline(project: any, events: any[]) {
    const stages = Object.keys(STAGE_CONFIG);
    return stages.map(stage => {
      const event = events.find((e: any) => e.stage === stage);
      const isCurrent = project.current_stage === stage;
      const isPast = stages.indexOf(stage) < stages.indexOf(project.current_stage);
      return {
        stage,
        label: STAGE_CONFIG[stage]?.labelHe,
        status: event ? 'done' : isCurrent ? 'current' : 'pending',
        completedAt: event?.created_at,
        performedBy: event?.employee_name,
        notes: event?.notes
      };
    });
  },

  // ═══════════════════════════════════════
  // ADVANCE STAGE — לב המנוע
  // ═══════════════════════════════════════
  async advanceStage(
    projectId: string,
    stage: string,
    performedBy: string,
    performedByRole: string,
    data: {
      notes?: string;
      photos?: any[];
      signature?: string;
      lat?: number;
      lng?: number;
      metadata?: any;
    } = {}
  ) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. לוג האירוע
      await client.query(`
        INSERT INTO pipeline_events
          (project_id, stage, action, performed_by, performed_by_role, notes, photos, signature, location_lat, location_lng, metadata)
        VALUES ($1,$2,'approved',$3,$4,$5,$6,$7,$8,$9,$10)
      `, [projectId, stage, performedBy, performedByRole,
          data.notes, JSON.stringify(data.photos || []),
          data.signature, data.lat, data.lng,
          JSON.stringify(data.metadata || {})]);

      // 2. אשר approval פנדינג
      await client.query(`
        UPDATE approvals
        SET status = 'approved', approved_at = NOW()
        WHERE project_id = $1 AND stage = $2 AND status = 'pending'
      `, [projectId, stage]);

      // 3. קדם שלב
      const nextStage = STAGE_CONFIG[stage]?.next;
      if (nextStage) {
        await client.query(`
          UPDATE projects
          SET current_stage = $2, stage_updated_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [projectId, nextStage]);
      }

      await client.query('COMMIT');

      // 4. טריגרים אוטומטיים לשלב הבא
      const project = (await query(`SELECT p.*, c.name as client_name, c.phone as client_phone FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = $1`, [projectId])).rows[0];
      await this.triggerNextStage(project, nextStage);

      // 5. broadcast
      broadcastToAll('PROJECT_STAGE_ADVANCED', {
        projectId, previousStage: stage, newStage: nextStage,
        progress: this.calculateProgress(nextStage || stage)
      });

      return { success: true, newStage: nextStage };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ═══════════════════════════════════════
  // TRIGGER NEXT STAGE AUTOMATION
  // ═══════════════════════════════════════
  async triggerNextStage(project: any, stage: string) {
    switch (stage) {

      case 'measurement_scheduled': {
        // AI מתאם מדידה — שולח לסוקר ולקוח
        const measureDate = await aiCoordinator.scheduleMeasurement(project);
        await query(`UPDATE projects SET measurement_date = $2, surveyor_id = $3 WHERE id = $1`,
          [project.id, measureDate.datetime, measureDate.surveyorId]);

        await this.createApproval(project.id, 'measurement_scheduled', 'surveyor', measureDate.surveyorId);

        await notificationService.send({
          projectId: project.id, channel: 'whatsapp',
          recipientType: 'employee', employeeId: measureDate.surveyorId,
          template: 'MEASUREMENT_ASSIGNED',
          data: { project, date: measureDate.datetime, address: project.address }
        });

        await notificationService.send({
          projectId: project.id, channel: 'whatsapp',
          recipientType: 'client', clientId: project.client_id,
          template: 'MEASUREMENT_SCHEDULED',
          data: { project, date: measureDate.datetime, surveyorName: measureDate.surveyorName }
        });
        break;
      }

      case 'contract_sent': {
        // יצור טוקן ללקוח לחתימה
        const contractToken = await this.createClientToken(project.id, project.client_id, 'sign_contract', 7);
        await query(`UPDATE projects SET contract_sent_at = NOW() WHERE id = $1`, [project.id]);

        await notificationService.send({
          projectId: project.id, channel: 'whatsapp',
          recipientType: 'client', clientId: project.client_id,
          template: 'CONTRACT_SIGN',
          data: {
            project,
            signUrl: `${process.env.APP_URL}/client/${contractToken}/sign`
          }
        });
        break;
      }

      case 'materials_ordered': {
        await query(`UPDATE projects SET materials_ordered_at = NOW() WHERE id = $1`, [project.id]);

        await notificationService.send({
          projectId: project.id, channel: 'push',
          recipientType: 'employee', employeeId: project.production_manager_id,
          template: 'MATERIALS_ORDERED',
          data: { project }
        });
        break;
      }

      case 'production_assigned': {
        // שלח לקבלן
        await this.createApproval(project.id, 'production_assigned', 'contractor', project.contractor_id);

        await notificationService.send({
          projectId: project.id, channel: 'push',
          recipientType: 'employee', employeeId: project.contractor_id,
          template: 'PROJECT_ASSIGNED_TO_YOU',
          data: { project, action: 'אשר קבלת פרוייקט' }
        });
        break;
      }

      case 'production_done': {
        await query(`UPDATE projects SET production_end_at = NOW() WHERE id = $1`, [project.id]);

        await notificationService.send({
          projectId: project.id, channel: 'push',
          recipientType: 'employee', employeeId: project.driver_id,
          template: 'READY_FOR_PAINT',
          data: { project, action: 'אשר שליחה לצביעה' }
        });
        break;
      }

      case 'returned_from_paint': {
        await query(`UPDATE projects SET paint_returned_at = NOW() WHERE id = $1`, [project.id]);
        // AI מתאם התקנה
        const installDate = await aiCoordinator.scheduleInstallation(project);
        await query(`
          UPDATE projects SET installation_date = $2, installation_time = $3, installer_id = $4 WHERE id = $1
        `, [project.id, installDate.date, installDate.time, installDate.installerId]);

        // שלח לשניהם
        await notificationService.send({
          projectId: project.id, channel: 'whatsapp',
          recipientType: 'client', clientId: project.client_id,
          template: 'INSTALLATION_SCHEDULED',
          data: { project, date: installDate.date, time: installDate.time }
        });

        await notificationService.send({
          projectId: project.id, channel: 'push',
          recipientType: 'employee', employeeId: installDate.installerId,
          template: 'INSTALLATION_ASSIGNED',
          data: { project, date: installDate.date, time: installDate.time, action: 'אשר קבלת פרוייקט' }
        });
        break;
      }

      case 'installation_done': {
        await query(`UPDATE projects SET installation_done_at = NOW() WHERE id = $1`, [project.id]);
        // שלח סקר ללקוח
        const surveyToken = await this.createClientToken(project.id, project.client_id, 'survey', 14);
        await notificationService.send({
          projectId: project.id, channel: 'whatsapp',
          recipientType: 'client', clientId: project.client_id,
          template: 'SURVEY_REQUEST',
          data: {
            project,
            surveyUrl: `${process.env.APP_URL}/client/${surveyToken}/survey`
          }
        });

        // שלח גם בקשת תשלום
        await this.triggerNextStage(project, 'payment_requested');
        break;
      }

      case 'payment_requested': {
        const paymentToken = await this.createClientToken(project.id, project.client_id, 'payment', 30);
        await this.createPaymentLink(project, paymentToken);

        // ללקוח
        await notificationService.send({
          projectId: project.id, channel: 'whatsapp',
          recipientType: 'client', clientId: project.client_id,
          template: 'PAYMENT_REQUEST',
          data: {
            project,
            amount: project.balance_due,
            paymentUrl: `${process.env.APP_URL}/client/${paymentToken}/pay`,
            bankDetails: {
              bank: 'בנק לאומי',
              branch: '800',
              account: '12345678',
              name: 'טכנו-קול עוזי בע"מ'
            }
          }
        });

        // במקביל — למנהלת פרויקטים
        await notificationService.send({
          projectId: project.id, channel: 'push',
          recipientType: 'employee', employeeId: project.project_manager_id,
          template: 'PAYMENT_REQUESTED_NOTIFY',
          data: { project, amount: project.balance_due, client: project.client_name }
        });
        break;
      }

      case 'project_closed': {
        await query(`UPDATE projects SET closed_at = NOW() WHERE id = $1`, [project.id]);
        broadcastToAll('PROJECT_CLOSED', { projectId: project.id, title: project.title });
        break;
      }
    }
  },

  // ── יצור approval
  async createApproval(projectId: string, stage: string, fromRole: string, employeeId?: string) {
    const config = STAGE_CONFIG[stage];
    await query(`
      INSERT INTO approvals (project_id, stage, required_from, required_from_employee, title, description, deadline)
      VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '48 hours')
    `, [projectId, stage, fromRole, employeeId,
        `אישור: ${config.labelHe}`,
        `נדרש אישור לשלב: ${config.labelHe}`]);
  },

  // ── יצור טוקן ללקוח
  async createClientToken(projectId: string, clientId: string, purpose: string, expiryDays: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await query(`
      INSERT INTO client_tokens (project_id, client_id, token, purpose, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::INTERVAL)
    `, [projectId, clientId, token, purpose, expiryDays]);
    return token;
  },

  // ── יצור לינק תשלום
  async createPaymentLink(project: any, token: string) {
    const { rows } = await query(`
      INSERT INTO payment_links (project_id, amount, description, link_token, bank_details)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [project.id, project.balance_due,
        `יתרת תשלום — ${project.title}`, token,
        JSON.stringify({ bank: 'בנק לאומי', branch: '800', account: '12345678' })]);
    return rows[0];
  },

  // ── כל הפרוייקטים
  async getAllProjects(filters: any = {}) {
    let sql = `
      SELECT p.*,
        c.name as client_name, c.phone as client_phone,
        contractor.name as contractor_name,
        installer.name as installer_name,
        pm.name as project_manager_name
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN employees contractor ON p.contractor_id = contractor.id
      LEFT JOIN employees installer ON p.installer_id = installer.id
      LEFT JOIN employees pm ON p.project_manager_id = pm.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let i = 1;
    if (filters.stage) { sql += ` AND p.current_stage = $${i++}`; params.push(filters.stage); }
    if (filters.contractor_id) { sql += ` AND p.contractor_id = $${i++}`; params.push(filters.contractor_id); }
    if (filters.installer_id) { sql += ` AND p.installer_id = $${i++}`; params.push(filters.installer_id); }
    sql += ` ORDER BY p.created_at DESC`;

    const { rows } = await query(sql, params);
    return rows.map(p => ({
      ...p,
      progress: this.calculateProgress(p.current_stage),
      stageLabel: STAGE_CONFIG[p.current_stage]?.labelHe
    }));
  }
};
