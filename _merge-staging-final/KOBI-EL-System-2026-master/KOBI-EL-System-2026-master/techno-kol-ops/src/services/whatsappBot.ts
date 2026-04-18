import { query } from '../db/connection';
import { pipelineService } from './pipeline';

// ════════════════════════════════════
// WHATSAPP BOT ENGINE
// Twilio / WhatsApp Business API
// ════════════════════════════════════

export const whatsappBot = {

  async handleIncoming(from: string, body: string): Promise<string> {
    const phone = from.replace('whatsapp:', '').replace('+', '');
    const msg = body.trim().toLowerCase();

    // זהה מי שולח
    const { rows: empRows } = await query(
      `SELECT id, name, role FROM employees WHERE REPLACE(phone, '-', '') = $1 AND is_active = true`,
      [phone.replace(/[-+]/g, '')]
    );

    const { rows: clientRows } = await query(
      `SELECT id, name FROM clients WHERE REPLACE(phone, '-', '') = $1 AND is_active = true`,
      [phone.replace(/[-+]/g, '')]
    );

    // ── עובד שולח
    if (empRows.length > 0) {
      const emp = empRows[0];

      if (msg.includes('סיימתי') || msg.includes('הסתיים') || msg.includes('done')) {
        // מצא משימה פעילה
        const { rows: tasks } = await query(`
          SELECT * FROM tasks
          WHERE employee_id = $1 AND status = 'in_progress'
          ORDER BY scheduled_date DESC LIMIT 1
        `, [emp.id]);

        if (tasks.length > 0) {
          await query(`UPDATE tasks SET status = 'done', completed_at = NOW() WHERE id = $1`, [tasks[0].id]);
          return `✅ ${emp.name}, המשימה "${tasks[0].title}" סומנה כהושלמה!\n\nכל הכבוד 💪`;
        }
        return `לא נמצאה משימה פעילה. בדוק באפליקציה.`;
      }

      if (msg.includes('אישור') || msg.includes('אשרתי') || msg.includes('אשר')) {
        const { rows: approvals } = await query(`
          SELECT a.*, p.title as project_title, p.id as project_id
          FROM approvals a JOIN projects p ON a.project_id = p.id
          WHERE a.required_from_employee = $1 AND a.status = 'pending'
          LIMIT 1
        `, [emp.id]);

        if (approvals.length > 0) {
          const appr = approvals[0];
          await pipelineService.advanceStage(appr.project_id, appr.stage, emp.id, emp.role, {
            notes: `אושר via WhatsApp`
          });
          return `✅ ${emp.name}, אישרת: "${appr.project_title}"\nהמערכת עדכנה את שרשרת האספקה 🔗`;
        }
        return `אין אישורים פנדינג עבורך כרגע.`;
      }

      if (msg.includes('משימות') || msg.includes('היום') || msg === 'מה יש לי') {
        const { rows: todayTasks } = await query(`
          SELECT title, address, status, scheduled_time
          FROM tasks WHERE employee_id = $1 AND scheduled_date = CURRENT_DATE
          ORDER BY scheduled_time
        `, [emp.id]);

        if (todayTasks.length === 0) return `${emp.name}, אין משימות מתוכננות להיום 👍`;

        const list = todayTasks.map((t: any, i: number) =>
          `${i + 1}. ${t.title}\n   📍 ${t.address}\n   ⏰ ${t.scheduled_time || 'ללא שעה'} | ${
            ({ pending: '⏳ ממתין', on_way: '🚗 בדרך', in_progress: '🔧 בביצוע', done: '✅ הסתיים' } as any)[t.status] || t.status
          }`
        ).join('\n\n');

        return `שלום ${emp.name}! משימות היום:\n\n${list}`;
      }

      if (msg.includes('עזרה') || msg === 'help') {
        return `שלום ${emp.name}! 👋\n\nפקודות זמינות:\n• *היום* — משימות היום\n• *סיימתי* — סיום משימה פעילה\n• *אישור* — אישור שלב בפרוייקט\n• *עזרה* — תפריט זה`;
      }

      return `שלום ${emp.name}! 👋\nשלח *עזרה* לרשימת פקודות.`;
    }

    // ── לקוח שולח
    if (clientRows.length > 0) {
      const client = clientRows[0];

      if (msg.includes('סטטוס') || msg.includes('הפרוייקט') || msg.includes('איפה')) {
        const { rows: projects } = await query(`
          SELECT p.title, p.current_stage, p.progress,
            p.installation_date
          FROM projects p
          WHERE p.client_id = $1 AND p.current_stage != 'project_closed'
          ORDER BY p.created_at DESC LIMIT 1
        `, [client.id]);

        if (projects.length === 0) return `שלום ${client.name}! אין פרוייקטים פעילים כרגע.`;

        const p = projects[0];
        const STAGE_HE: Record<string, string> = {
          measurement_scheduled: 'מדידה תואמה 📐',
          production_started: 'בייצור ⚙️',
          sent_to_paint: 'בצביעה 🎨',
          installation_scheduled: `התקנה ${p.installation_date ? 'ב-' + new Date(p.installation_date).toLocaleDateString('he-IL') : 'מתואמת'} 📅`,
          installation_done: 'הסתיים ✅'
        };

        return `שלום ${client.name}! 👋\n\nפרוייקט: ${p.title}\nסטטוס: ${STAGE_HE[p.current_stage] || p.current_stage}\nהתקדמות: ${p.progress}%\n\nלשאלות: 052-XXXXXXX`;
      }

      return `שלום ${client.name}! 👋\n\nכתוב *סטטוס* לבדיקת מצב הפרוייקט שלך.\n\nלדברים דחופים: 052-XXXXXXX`;
    }

    // לא מזוהה
    return `שלום! 👋\nזהו מספר Techno-Kol.\nלפניות: 052-XXXXXXX`;
  }
};
