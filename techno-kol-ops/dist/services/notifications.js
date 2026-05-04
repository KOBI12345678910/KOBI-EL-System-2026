"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
const connection_1 = require("../db/connection");
// תבניות WhatsApp / SMS
const TEMPLATES = {
    MEASUREMENT_ASSIGNED: (d) => `שלום ${d.employeeName} 👷\n\nקיבלת מדידה חדשה:\n📋 ${d.project.title}\n📍 ${d.project.address}\n📅 ${new Date(d.date).toLocaleDateString('he-IL')} 09:00\n\nאנא אשר קבלה באפליקציה:\n${process.env.APP_URL}/mobile`,
    MEASUREMENT_SCHEDULED: (d) => `שלום ${d.project.client_name} 👋\n\nקבענו מדידה לפרוייקט שלכם:\n📋 ${d.project.title}\n📅 ${new Date(d.date).toLocaleDateString('he-IL')} בין 09:00-11:00\n👷 המודד: ${d.surveyorName}\n\nנחזור אליכם עם הצעת מחיר מלאה בתוך 24 שעות.\nטכנו-קול ✨`,
    CONTRACT_SIGN: (d) => `שלום ${d.project.client_name} 👋\n\nהחוזה לפרוייקט "${d.project.title}" מוכן לחתימה.\n\n✍️ לחתימה דיגיטלית:\n${d.signUrl}\n\nהחוזה תקף ל-48 שעות.\nלשאלות: 052-XXXXXXX\nטכנו-קול ✨`,
    INSTALLATION_SCHEDULED: (d) => `שלום ${d.project.client_name} 👋\n\n✅ חומר הגלם מוכן!\n\nקבענו התקנה:\n📋 ${d.project.title}\n📅 ${new Date(d.date).toLocaleDateString('he-IL')}\n⏰ ${d.time}\n📍 ${d.project.address}\n\nהמתקין שלנו יגיע בזמן הנקוב.\nלשינוי תאריך: 052-XXXXXXX\nטכנו-קול ✨`,
    INSTALLATION_ASSIGNED: (d) => `שלום ${d.employeeName} 👷\n\nהתקנה חדשה:\n📋 ${d.project.title}\n📍 ${d.project.address}\n📅 ${new Date(d.date).toLocaleDateString('he-IL')} ${d.time}\n👤 לקוח: ${d.project.client_name}\n📞 ${d.project.client_phone}\n\nאשר קבלה באפליקציה ➡️\n${process.env.APP_URL}/mobile`,
    SURVEY_REQUEST: (d) => `שלום ${d.project.client_name} 👋\n\n✅ ההתקנה הושלמה!\n\nנשמח לשמוע את דעתכם:\n⭐ ${d.surveyUrl}\n\n(30 שניות בלבד)\nטכנו-קול ✨`,
    PAYMENT_REQUEST: (d) => `שלום ${d.project.client_name} 👋\n\n✅ הפרוייקט הושלם!\n\n💳 לתשלום יתרה (${Number(d.amount).toLocaleString('he-IL')} ₪):\n${d.paymentUrl}\n\nאו בהעברה בנקאית:\n🏦 ${d.bankDetails.bank}\n📂 סניף: ${d.bankDetails.branch}\n💳 חשבון: ${d.bankDetails.account}\n🏢 ${d.bankDetails.name}\n\nלאישור תשלום: 052-XXXXXXX\nטכנו-קול ✨`,
    PAYMENT_REQUESTED_NOTIFY: (d) => `💰 בקשת תשלום נשלחה\n\nפרוייקט: ${d.project.title}\nלקוח: ${d.client}\nסכום: ₪${Number(d.amount).toLocaleString('he-IL')}\n\nממתינים לאישור תשלום.`,
    PROJECT_ASSIGNED_TO_YOU: (d) => `שלום ${d.employeeName} 👷\n\nקיבלת פרוייקט לייצור:\n📋 ${d.project.title}\n📍 ${d.project.address}\n💰 ערך: ₪${Number(d.project.total_price).toLocaleString('he-IL')}\n\n${d.action} באפליקציה ➡️\n${process.env.APP_URL}/mobile`,
    READY_FOR_PAINT: (d) => `שלום ${d.employeeName} 🚚\n\nפרוייקט מוכן לשליחה לצבע:\n📋 ${d.project.title}\n\n${d.action} באפליקציה ➡️\n${process.env.APP_URL}/mobile`,
    MATERIALS_ORDERED: (d) => `📦 חומר גלם הוזמן\n\nפרוייקט: ${d.project.title}\nממתינים לאספקה. כשיגיע — אשר קבלה באפליקציה.`,
};
exports.notificationService = {
    async send(options) {
        const { projectId, channel, recipientType, employeeId, clientId, template, data } = options;
        // קבל שם נמען
        let recipientName = '';
        let recipientPhone = '';
        if (recipientType === 'employee' && employeeId) {
            const { rows } = await (0, connection_1.query)(`SELECT name, phone FROM employees WHERE id = $1`, [employeeId]);
            recipientName = rows[0]?.name || '';
            recipientPhone = rows[0]?.phone || '';
        }
        else if (recipientType === 'client' && clientId) {
            const { rows } = await (0, connection_1.query)(`SELECT name, phone FROM clients WHERE id = $1`, [clientId]);
            recipientName = rows[0]?.name || '';
            recipientPhone = rows[0]?.phone || '';
        }
        const content = TEMPLATES[template]?.({ ...data, employeeName: recipientName }) || '';
        // לוג ב-DB
        await (0, connection_1.query)(`
      INSERT INTO pipeline_notifications
        (project_id, recipient_type, recipient_employee_id, recipient_client_id, channel, template, content, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent')
    `, [projectId, recipientType, employeeId || null, clientId || null, channel, template, content]);
        // בפרודקשן — כאן תחבר לـ WhatsApp Business API / Twilio
        console.log(`[NOTIFICATION] ${channel} → ${recipientPhone}: ${content.slice(0, 80)}...`);
        return { sent: true, content };
    }
};
