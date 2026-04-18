# 🤖 AI Bots System - HiTech Company 24/7

מערכת בוטים אוטומטיים לחברת הייטק, עם 26 בוטים ב-4 רמות היררכיה.

## 🏗️ ארכיטקטורה

### BaseBot - מחלקת הבסיס
כל בוט יורש מ-`BaseBot` וכולל:

- **Logger**: מערכת לוגים מתקדמת (INFO, OK, WARN, ERROR, STEP, TEST, FIX, SEC, DATA)
- **Base44Adapter**: מתאם לתקשורת עם Base44
- **Security Policy**: מדיניות אבטחה והרשאות
- **Run Lifecycle**: מחזור חיים (health → plan → execute → verify → report)
- **Statistics**: סטטיסטיקות מפורטות על כל ריצה
- **Reports**: שמירת דוחות אוטומטית ב-JSON

### Bot Blueprint
```javascript
{
  identity: ['name', 'role', 'authority_level'],
  inputs: ['Base44 Tables', 'Events', 'Logs'],
  rules: ['What I can do', 'What I must not do', 'Approval required?'],
  actions: ['Create/Update/Delete', 'Notify other bots', 'Trigger workflows'],
  validation: ['Pre-action checks', 'Post-action checks'],
  selfTest: ['A/B test', 'Rollback', 'Report']
}
```

## 📊 היררכיה

### Level 1 - CEO (1 Bot)
- **CEO_AI_BOT**: החלטות אסטרטגיות, תקציבים, יוזמות

### Level 2 - C-Level (6 Bots)
- **CTO_AI_BOT**: טכנולוגיה וארכיטקטורה
- **COO_AI_BOT**: תפעול ותהליכים
- **CPO_AI_BOT**: מוצרים ווויזיה
- **CFO_AI_BOT**: כספים ותקציבים
- **CMO_AI_BOT**: שיווק וצמיחה
- **CISO_AI_BOT**: אבטחת מידע

### Level 3 - Delivery & Tech (8 Bots)
- **ARCHITECT_AI_BOT**: ארכיטקטורת מערכת
- **BACKEND_AI_BOT**: פיתוח צד שרת
- **FRONTEND_AI_BOT**: פיתוח ממשק משתמש
- **FULLSTACK_AI_BOT**: פיתוח קצה לקצה
- **QA_AI_BOT**: בדיקות איכות
- **AUTOMATION_AI_BOT**: בדיקות אוטומטיות
- **DEVOPS_AI_BOT**: CI/CD ותשתיות
- **CLOUD_AI_BOT**: מומחה ענן

### Level 4 - Ops / Support / Data (11 Bots)
- **PM_AI_BOT**: ניהול מוצר
- **DESIGN_AI_BOT**: עיצוב UX/UI
- **DATA_AI_BOT**: הנדסת נתונים
- **ANALYTICS_AI_BOT**: ניתוח נתונים
- **ML_AI_BOT**: למידת מכונה
- **SUPPORT_L1_AI_BOT**: תמיכה ראשונית
- **SUPPORT_L2_AI_BOT**: תמיכה מתקדמת
- **CS_AI_BOT**: הצלחת לקוחות
- **SALES_AI_BOT**: מכירות
- **MARKETING_AI_BOT**: שיווק
- **HR_AI_BOT**: משאבי אנוש

## 🚀 שימוש

### הרצת בוט בודד
```bash
# CEO Bot
npm run ceo

# CTO Bot
npm run cto

# כל בוט אחר
npm run bot <BOT_NAME>
npm run bot ARCHITECT
npm run bot QA
npm run bot SALES
```

### סביבות
```bash
# Development (default)
npm run bot CEO

# Staging
ENV=staging npm run bot CEO

# Production (requires approvals)
ENV=prod npm run bot CEO
```

## 📁 מבנה הפרויקט

```
components/bots/
├── core/
│   ├── BaseBot.js       # מחלקת הבסיס
│   └── index.js         # Entry point
├── roles/
│   ├── CEO.bot.js       # ✅ CEO Bot
│   ├── CTO.bot.js       # ✅ CTO Bot
│   ├── ARCHITECT.bot.js # ✅ Architect Bot
│   ├── ... (23 more)
├── bot-reports/         # דוחות אוטומטיים
├── run-one.js           # Runner script
├── package.json
└── README.md
```

## 🔐 Security Policy

כל בוט כולל מדיניות אבטחה:

```javascript
{
  allowDelete: false,              // מניעת מחיקות
  requireApprovalForProd: true,   // דרישת אישור בפרודקשן
  environment: "dev"               // dev|staging|prod
}
```

## 📊 Base44 Integration

כל בוט מתחבר ל-Base44 דרך:

- **Tables**: CRM, Tasks, Users, Logs (180 טבלאות)
- **Automations**: 47 אוטומציות פעילות
- **Triggers**: 89 טריגרים
- **Permissions**: 156 הרשאות מוגדרות
- **Dashboards**: 23 דשבורדים

## 🧪 דוגמה - יצירת בוט חדש

```javascript
// roles/NEWBOT.bot.js
const { BaseBot } = require("../core");

class NewBot extends BaseBot {
  constructor(config = {}) {
    super({
      ...config,
      name: "NEWBOT_AI_BOT",
      role: "New Bot Role",
      authority: "L3",
    });
  }

  async plan() {
    this.logger.info("Planning...");
    return { ok: true, notes: "Plan ready" };
  }

  async execute() {
    this.logger.info("Executing...");
    await this.base44.createRecord({
      table: "Task",
      data: { title: "New task" }
    });
    this.actionOk();
    return { ok: true };
  }

  async verify() {
    this.logger.info("Verifying...");
    return { ok: true };
  }
}

module.exports = NewBot;
```

## 📈 Statistics & Reports

כל ריצה יוצרת דוח JSON עם:

```json
{
  "bot": { "name": "CEO_AI_BOT", "role": "...", "authority": "L5" },
  "env": "dev",
  "stats": {
    "startedAt": "2026-02-10T14:23:45Z",
    "finishedAt": "2026-02-10T14:23:58Z",
    "actions": 12,
    "successes": 11,
    "failures": 1,
    "steps": ["health", "plan", "execute", "verify", "report"]
  },
  "log": [...],
  "extra": {...}
}
```

## 🎯 הבא בתור

1. ✅ Base class + 3 דוגמאות (CEO, CTO, ARCHITECT)
2. ⏳ 23 בוטים נוספים
3. ⏳ Real Base44 API integration
4. ⏳ Bot-to-Bot communication
5. ⏳ Approval workflows
6. ⏳ A/B testing & rollbacks
7. ⏳ Dashboard integration

---

**Built with ❤️ for HiTech Company 24/7**