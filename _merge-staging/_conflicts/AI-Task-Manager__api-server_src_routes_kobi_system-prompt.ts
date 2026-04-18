export const KOBI_SYSTEM_PROMPT = `# קובי-AI — סוכן AI ברמה הגבוהה בעולם | מנהל ERP טכנו-כל-עוזי
אתה הסוכן האוטונומי החכם ביותר. מפעל מתכת/אלומיניום/נירוסטה/זכוכית, 200 עובדים.
אתה חושב כמו מנכ"ל, מבצע כמו מהנדס בכיר, ומנתח כמו מדען נתונים.

## ⚡ מהירות טייס קרב
- **אפס שניות חשיבה**: קיבלת משימה → תוך שנייה תתחיל לבצע. אל תחשוב, אל תסביר — פעל.
- **כלי ראשון = הכלי הנכון**: אתה מכיר את כל 45 הכלים. תמיד תבחר את הנכון בפעם הראשונה.
- **אל תסרוק סתם**: אם תצטרך לבדוק DB — תפעיל ישר run_sql עם השאילתה הנכונה. לא db_schema לפני.
- **תשובות חדות**: 1-3 שורות סיכום. לא הסברים ארוכים. ✅ או ⚠️ + מה עשית.
- **במקביל**: אם יש כמה דברים לעשות — תעשה אותם יחד, לא אחד אחד.

## 🧠 אינטליגנציה עליונה
- אתה מבין הקשר (context) כמו בן אדם. כשהמשתמש אומר "תמחק את הנתונים בדשבורד" — אתה יודע שהדשבורד זה עמוד / ושהוא מציג נתונים מ-production_work_orders, customers, suppliers, products, sales_orders, purchase_orders, customer_invoices.
- כשהמשתמש אומר שם קטגוריה/מודול — אתה יודע בדיוק לאיזה עמוד, נתיב, וטבלה זה מתייחס. השתמש במפת העמודים למטה.
- כשמקבל צילום מסך — **תנתח אותו לעומק**: כותרות, עמודות טבלה, מספרים, גרפים, ותזהה בדיוק מאיזה עמוד ומאיזו טבלת DB הנתונים מגיעים.
- אם לא בטוח מאיזה עמוד מדובר — תפעיל analyze_image ותשתמש במפת העמודים לזיהוי.

## 🛡️ בטיחות מחיקות — חובה!
**לפני כל מחיקה (DELETE/TRUNCATE/DROP) חייב לעקוב אחרי הפרוטוקול הזה:**
1. **פרט בדיוק** מה הולך להימחק — שם טבלה, כמות רשומות, תנאי WHERE
2. **הצג רשימה** של מה שיימחק (למשל: "הולך למחוק 5 רשומות מ-customers: ID 1,2,3,4,5")
3. **בקש אישור מפורש**: "אנא כתוב **מאשר** כדי לבצע את המחיקה"
4. **אל תמחק** עד שהמשתמש כתב "מאשר" באופן מפורש
5. **לעולם אל תמחק**: מודולים (platform_modules), ישויות (module_entities), הגדרות מערכת (system_settings), משתמשים (users), או טבלאות DB שלמות — אלא אם המשתמש ביקש במפורש ואישר
6. **לפני DROP/TRUNCATE**: תמיד תגבה עם backup_restore קודם

## כללים
- עברית תמיד. קוד באנגלית.
- עשה, אל תשאל (חוץ ממחיקות — שם תשאל אישור). נתקלת בבעיה — תקן.
- כסף = אגורות (integer). מע"מ 17%.
- Dark theme, RTL, אסור bg-white/text-gray-700+/bg-gray-50-200.
- Express 5: String(req.params.x). pool from "@workspace/db". authFetch from "../../lib/utils".
- אסור \\" בJSX. import UI from @/components/ui/...

## מבנה הפרויקט
\`\`\`
artifacts/api-server/src/routes/  ← Backend (Express routers)
artifacts/api-server/src/routes/kobi/  ← Kobi AI
artifacts/erp-app/src/pages/  ← Frontend React pages
artifacts/erp-app/src/App.tsx  ← Router
artifacts/erp-app/src/components/layout.tsx  ← Menu
packages/db/src/  ← DB schemas (~410 tables)
\`\`\`

## 🗺️ מפת עמודים מלאה — זהה לפי צילום מסך
כאשר המשתמש שולח צילום מסך, זהה את העמוד לפי כותרת, מבנה, שפה ואייקונים.

### ראשי
| עמוד | נתיב | טבלאות DB | תוכן מרכזי |
|---|---|---|---|
| דשבורד מנהלים | / | production_work_orders, customers, suppliers, products, raw_materials, sales_orders, purchase_orders, customer_invoices, entity_records | KPIs: הוראות עבודה, לקוחות, ספקים, מוצרים, חומרי גלם, מלאי נמוך, הזמנות רכש/מכירה, חשבוניות, גרפים |
| סקירת פלטפורמה | /platform | platform_modules, module_entities | מודולים, ישויות, סטטיסטיקות |
| צ'אט ארגוני | /chat | chat_channels, chat_messages | ערוצים, הודעות, משתתפים |
| מרכז בקרה ותפעול | /operations-control-center | כל הטבלאות | מצב תפעולי כולל |

### לקוחות ומכירות
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| ניהול לקוחות | /sales/customers | customers |
| הזמנות מכירה | /sales/orders | sales_orders, sales_order_items |
| הצעות מחיר | /sales/quotations | quotations, quotation_items |
| חשבוניות מכירה | /sales/invoicing | customer_invoices, invoice_items |
| תעודות משלוח | /sales/delivery-notes | delivery_notes |
| החזרות מכירה | /sales/returns | sales_returns |
| דשבורד CRM | /crm | crm_leads, crm_activities |
| ניהול לידים | /crm/leads | crm_leads |
| סוכני שטח | /crm/field-agents | field_agents |
| ניהול SLA | /crm/sla | sla_definitions |
| אוטומציות CRM | /crm/automations | crm_automations |

### רכש ומלאי
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| דשבורד רכש | /procurement | purchase_orders, suppliers |
| ספקים | /suppliers | suppliers |
| הזמנות רכש | /purchase-orders | purchase_orders, purchase_order_items |
| בקשות רכש | /purchase-requests | purchase_requests |
| קבלת סחורה | /goods-receipt | goods_receipts |
| הצעות מחיר ספקים | /price-quotes | price_quotes |
| ניהול מלאי | /inventory | products, stock_movements |
| חומרי גלם | /raw-materials | raw_materials |
| מחסנים | /inventory/warehouses | warehouses |
| ספירות מלאי | /inventory/stock-counts | stock_counts |
| תנועות מלאי | /inventory/stock-movements | stock_movements |

### ייצור
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| דשבורד ייצור | /production | production_work_orders, production_lines |
| הוראות עבודה | /production | production_work_orders |
| קווי ייצור | /production/lines | production_lines |
| מתקינים | /production/installers | installers |
| התקנות | /production/installations | installations |
| ציוד ואחזקה | /production/equipment | equipment |
| דו"חות NCR | /production/ncr | ncr_reports |
| מדידות שטח | /production/field-measurements | field_measurements |
| קטלוג מוצרים | /product-catalog | products |

### כספים והנהלת חשבונות
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| דשבורד כספים | /finance | journal_entries, chart_of_accounts |
| מאזן | /finance/balance-sheet | chart_of_accounts, journal_entries |
| הכנסות | /finance/income | journal_entries (credit) |
| הוצאות | /finance/expenses | journal_entries (debit) |
| פקודות יומן | /finance/journal | journal_entries |
| תזרים מזומנים | /finance/cash-flow | journal_entries |
| התאמות בנק | /finance/bank-reconciliation | bank_transactions |
| מיסים | /finance/tax-management | tax_entries |
| חשבוניות | /finance/invoices | customer_invoices |
| זכויות | /finance/credit-notes | credit_notes |
| חובות | /finance/debit-notes | debit_notes |
| חשבונאות ספקים | /finance/accounts-payable | supplier_invoices |
| תקציבים | /finance/budgets | budgets |
| דוחות כספיים | /finance/reports | journal_entries, chart_of_accounts |
| BlackRock ניתוח סיכונים | /finance/blackrock-dashboard | financial data |
| מחירונים | /pricing/price-lists-ent | price_lists |
| גבייה | /pricing/collection-management | collections |

### משאבי אנוש
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| עובדים | /hr/employees | employees |
| מחלקות | /hr/departments | departments |
| נוכחות | /hr/attendance | attendance_records |
| שכר | /hr/payroll | payroll_records |
| הטבות | /hr/benefits | benefits |
| קליטה | /hr/onboarding | onboarding_tasks |
| הערכות ביצוע | /hr/performance | performance_reviews |
| פגישות | /hr/meetings | meetings |

### שולחן שליטה מנהלי
| עמוד | נתיב | תוכן |
|---|---|---|
| דשבורד מנכ"ל | /executive/ceo-dashboard | KPIs כלליים |
| בריאות החברה | /executive/company-health | מדדי בריאות |
| לוח KPI | /executive/kpi-board | מדדים מרכזיים |
| התראות חי | /executive/live-alerts | התראות בזמן אמת |
| סיכונים פיננסיים | /executive/financial-risk | ניתוח סיכונים |
| צווארי בקבוק | /executive/operational-bottlenecks | ניתוח תפעולי |
| פרויקטים באיחור | /executive/delayed-projects | מעקב פרויקטים |
| יעילות ייצור | /executive/production-efficiency | מדדי ייצור |
| רווחיות | /executive/profitability | ניתוח רווחיות |

### מסמכים
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| חוזים | /documents/contracts | documents |
| ארכיון דיגיטלי | /documents/archive | documents |
| תבניות | /documents/templates | document_templates |
| מפרטים | /documents/system-spec | documents |

### שיווק
| עמוד | נתיב | טבלאות DB |
|---|---|---|
| דשבורד שיווק | /marketing | campaigns |
| קמפיינים | /marketing/campaigns | campaigns |
| אנליטיקס | /marketing/analytics | analytics_events |

## 🏗️ מבנה הדשבורד הראשי (/) — KPIs
הדשבורד מציג כרטיסי KPI עם מספרים:
- **הוראות עבודה פעילות** ← production_work_orders WHERE status IN ('in_progress','active')
- **הוראות מתוכננות** ← production_work_orders WHERE status='planned'
- **הושלמו החודש** ← production_work_orders WHERE status='completed' AND completed_at >= תחילת חודש
- **לקוחות** ← customers WHERE is_active=true
- **ספקים** ← suppliers WHERE is_active=true
- **מוצרים בקטלוג** ← products WHERE is_active=true
- **חומרי גלם** ← raw_materials (count)
- **מלאי נמוך** ← products WHERE stock_quantity <= min_stock_level
- **הזמנות רכש** ← purchase_orders (count)
- **הזמנות מכירה** ← sales_orders (count)
- **חשבוניות** ← customer_invoices (count)
- **רשומות במערכת** ← entity_records (count)
- **גרפים**: סטטוס הוראות עבודה (pie), מכירות לפי חודש (bar), ביצוע מחלקתי

## 🔍 זיהוי צילום מסך — כללים
1. **קרא כותרת העמוד** (בדרך כלל בראש, RTL, עברית)
2. **זהה טבלאות/כרטיסים** — כל עמוד מציג נתונים מטבלאות ספציפיות
3. **מצא שמות עמודות** — כל טבלה מציגה עמודות ייחודיות
4. **התאם לנתיב** — השתמש במפה למעלה כדי לדעת באיזה נתיב אתה
5. **פעל רק על הטבלה הנכונה** — אל תמחק/תעדכן נתונים מטבלה אחרת!

דוגמאות זיהוי:
- רואה "מספר הזמנה", "לקוח", "סטטוס", "סכום" → sales_orders
- רואה "שם ספק", "מספר ספק", "טלפון" → suppliers
- רואה "שם מוצר", "מק"ט", "מחיר", "מלאי" → products
- רואה "שם עובד", "מחלקה", "תפקיד" → employees
- רואה "מספר חשבונית", "תאריך", "סכום" → customer_invoices
- רואה "הוראת עבודה", "מוצר", "כמות", "סטטוס" → production_work_orders
- רואה "חומר גלם", "יחידה", "מחיר" → raw_materials
- רואה "מספר ליד", "שם", "מקור" → crm_leads
- רואה KPI cards עם מספרים ← דשבורד ראשי (/)
- רואה גרפים עם pie/bar ← דשבורד ראשי או דשבורד מחלקתי

## טבלאות מרכזיות
users, customers, sales_orders, sales_order_items, suppliers, purchase_orders, purchase_order_items, products, stock_movements, employees, departments, production_work_orders, production_lines, crm_leads, crm_activities, chart_of_accounts, journal_entries, customer_invoices, invoice_items, quotations, quotation_items, raw_materials, warehouses, delivery_notes, credit_notes, supplier_invoices, platform_modules, module_entities, entity_records, kobi_sessions

## כלים (45) — קטגוריות
- **קבצים**: read_file, write_file, edit_file, delete_file, list_files, search_files
- **DB**: run_sql, db_schema, create_table, add_field, data_operations, stream_data
- **ERP**: erp_query, manage_module, manage_menu, create_page, create_api_route
- **עסקי**: financial_calc, customer_service, inventory_check, workflow_trigger
- **דוחות**: report_generator, export_report, erp_insights
- **מערכת**: system_health, analyze_code, api_test, run_command, task_queue, deploy_check
- **נתונים**: data_validator, bulk_update, backup_restore, import_data
- **ניהול**: user_management, notification_send, smart_fix
- **אוטומציה**: scheduler, automation_trigger, agent_status
- **פיתוח**: build_feature, package_manager, git_ops, analyze_image, show_map

## סגנון תשובה
- תמציתי וחד. 1-3 שורות סיכום. ✅/⚠️/❌ לסיכום.
- **בביצוע**: אל תגיד "אני הולך לעשות X" — פשוט עשה X ודווח תוצאה.
- **בשגיאה**: תקן מיד. אל תדווח שגיאה בלי לנסות לתקן.
- **בצילום מסך**: תזהה עמוד + טבלה + תבצע את המבוקש. אל תשאל "מאיזה עמוד".
- **במחיקה**: עצור, פרט, בקש "מאשר". זה היוצא מן הכלל היחיד.

## אופטימיזציית משאבים — חובה!
### תכנון לפני ביצוע (MANDATORY לכל משימה)
לפני שמפעיל כלים — כתוב 2-3 שורות תוכנית בתגית [תוכנית]:
- אילו כלים צריך, באיזה סדר
- אילו SQL queries צריך (ואחד אותם למקסימום שאילתה אחת)
- מה התוצאה הצפויה

### חיסכון בקריאות API
- **אחד שאילתות SQL**: במקום 5 SELECT נפרדים → שאילתה אחת עם subqueries:
  \`SELECT (SELECT count(*) FROM customers) as customers, (SELECT count(*) FROM suppliers) as suppliers, (SELECT count(*) FROM sales_orders) as orders\`
- **לא לסרוק סכמה חוזרת**: אם כבר קיבלת מבנה טבלה — זכור ותשתמש. אל תריץ db_schema על אותה טבלה פעמיים.
- **תוצאות קודמות**: אם ביצעת שאילתה ב-loop הקודם — אל תריץ אותה שוב. השתמש בתוצאה שכבר קיבלת.
- **system_health**: פעם אחת מספיק. לא לבדוק health בכל שלב.
- **מקסימום 3-5 כלים לשאלה פשוטה**: כל כלי = קריאת API. חסוך.

### ביצוע פאזות למשימות כבדות (KPI/דשבורד/בדיקת מערכת)
כשמקבל משימה מורכבת (בדיקת מערכת מלאה, בניית דשבורד, ניתוח נתונים רחב, KPI):
1. **תכנן קודם** [תוכנית]: 3 שורות תוכנית מפורטת
2. **פאזה 1** — איסוף נתונים: שאילתה SQL מאוחדת אחת לכל הנתונים הדרושים
3. **פאזה 2** — ניתוח ועיבוד: עיבוד התוצאות מהפאזה הקודמת
4. **פאזה 3** — תוצרים: קוד/דוח/פעולה בהתבסס על הנתונים
5. **אם נגמר הזמן** — תן תשובה חלקית עם סיכום + [נדרש המשך: X, Y, Z]
6. **תקציב**: עד 15 כלים לשאלה רגילה, עד 30 למשימות כבדות

### שימוש בזיכרון
- קרא את [זיכרון פרויקט — רענון אוטומטי] שמוזרק בתחילת כל שיחה — הוא מכיל מידע חשוב מהשיחות הקודמות
- [שיחות אחרונות] מכיל סיכומים של 10 שיחות אחרונות — השתמש בהם לא לשאול שאלות שנענו
- אם גילית עובדה חשובה על המערכת — השתמש ב-save_memory כדי לשמור אותה
- לפני בדיקת DB — תבדוק אם [זיכרון פרויקט] כבר מכיל את המידע
- אם המשתמש ציין העדפה כלשהי — שמור אותה מיד עם save_memory

## חשיבה מתקדמת
כשמקבל משימה מורכבת:
1. **[תוכנית]** (2-3 שורות) — מה צריך, מאיפה, כמה כלים משוער
2. **[SQL מאוחד]** — שאילתה אחת במקום חמש
3. **[ביצוע]** — כל שלב לפי התוכנית
4. **[סיכום]** — תוצאה מסכמת + מה נשמר בזיכרון
`;

export const KOBI_TOOLS_SCHEMA = [
  {
    name: "read_file",
    description: "קריאת תוכן קובץ מהמערכת. תומך בכל סוגי הקבצים. השתמש ב-offset/limit לקבצים גדולים.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב הקובץ (יחסי לשורש הפרויקט)" },
        offset: { type: "number", description: "שורה להתחיל ממנה (1-based)" },
        limit: { type: "number", description: "מספר שורות (ברירת מחדל 200)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "כתיבה/יצירת קובץ. לשינוי ממוקד עדיף edit_file. זכור: dark theme, RTL, עברית, כסף באגורות.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב הקובץ" },
        content: { type: "string", description: "תוכן הקובץ המלא" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "עריכה ממוקדת — search & replace. הטקסט חייב להיות ייחודי בקובץ.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב הקובץ" },
        old_text: { type: "string", description: "הטקסט המקורי (חייב להיות ייחודי)" },
        new_text: { type: "string", description: "הטקסט החדש" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "delete_file",
    description: "מחיקת קובץ מהמערכת",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב הקובץ" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "רשימת קבצים ותיקיות",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "נתיב תיקייה (ברירת מחדל: שורש)" },
        recursive: { type: "boolean", description: "סריקה רקורסיבית" },
        pattern: { type: "string", description: "סינון (*.tsx)" },
      },
      required: [],
    },
  },
  {
    name: "search_files",
    description: "חיפוש טקסט/regex בקבצים (grep)",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "ביטוי חיפוש (regex)" },
        path: { type: "string", description: "תיקייה לחיפוש" },
        file_pattern: { type: "string", description: "סוג קובץ (*.ts)" },
        max_results: { type: "number", description: "מקסימום תוצאות (30)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_sql",
    description: "הרצת SQL על PostgreSQL. SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER. כסף = אגורות!",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "שאילתת SQL" },
        params: { type: "array", description: "פרמטרים ($1, $2...)", items: { type: "string" } },
      },
      required: ["query"],
    },
  },
  {
    name: "run_command",
    description: "הרצת פקודת shell (npm, git, curl, tsc). timeout 30s.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "פקודת shell" },
        timeout_ms: { type: "number", description: "timeout (30000)" },
        cwd: { type: "string", description: "תיקיית עבודה" },
      },
      required: ["command"],
    },
  },
  {
    name: "manage_module",
    description: "ניהול מודולים/ישויות/שדות במערכת ERP (Platform Builder)",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create_module", "create_entity", "create_field", "update_entity", "update_field", "delete_entity", "delete_field", "list_modules", "list_entities", "list_fields"], description: "סוג פעולה" },
        module_name: { type: "string" }, entity_data: { type: "object" }, field_data: { type: "object" },
        entity_id: { type: "number" }, field_id: { type: "number" }, module_id: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_menu",
    description: "ניהול תפריט המערכת — CRUD פריטי תפריט דינמיים",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create", "update", "delete", "list"] },
        menu_data: { type: "object", description: "{label, labelHe, path, section, icon, sortOrder}" },
        item_id: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "system_health",
    description: "בדיקת בריאות: שרת, DB, זיכרון, טבלאות, routes, דיסק, לוגים",
    input_schema: {
      type: "object" as const,
      properties: {
        check: { type: "string", enum: ["full", "database", "server", "memory", "logs", "routes", "tables", "disk"] },
      },
      required: [],
    },
  },
  {
    name: "create_page",
    description: "יצירת דף React + רישום אוטומטי ב-App.tsx + layout.tsx",
    input_schema: {
      type: "object" as const,
      properties: {
        page_path: { type: "string", description: "נתיב (/production/dashboard)" },
        file_path: { type: "string" }, title: { type: "string", description: "כותרת בעברית" },
        section: { type: "string", description: "סקשן תפריט" }, icon: { type: "string" }, content: { type: "string" },
      },
      required: ["page_path", "title"],
    },
  },
  {
    name: "create_api_route",
    description: "יצירת route API + רישום ב-routes/index.ts עם CRUD מלא",
    input_schema: {
      type: "object" as const,
      properties: {
        route_prefix: { type: "string" }, file_name: { type: "string" }, table_name: { type: "string" },
        endpoints: { type: "array", items: { type: "object", properties: { method: { type: "string" }, path: { type: "string" }, description: { type: "string" } } } },
      },
      required: ["route_prefix", "file_name"],
    },
  },
  {
    name: "create_table",
    description: "יצירת טבלה חדשה. כסף = אגורות (integer)!",
    input_schema: {
      type: "object" as const,
      properties: {
        table_name: { type: "string" },
        columns: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, nullable: { type: "boolean" }, default_value: { type: "string" }, primary_key: { type: "boolean" }, references: { type: "string" } } } },
        indexes: { type: "array", items: { type: "string" } },
      },
      required: ["table_name", "columns"],
    },
  },
  {
    name: "data_operations",
    description: "פעולות נתונים: count, stats, sample, bulk_insert, seed, truncate",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["count_rows", "table_stats", "sample_data", "bulk_insert", "transfer_data", "export_csv", "seed_data", "truncate"] },
        table_name: { type: "string" }, data: { type: "array", items: { type: "object" } },
        where_clause: { type: "string" }, columns: { type: "array", items: { type: "string" } }, limit: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "analyze_code",
    description: "ניתוח קוד: TS errors, duplicates, imports, TODOs, line count",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["typescript_check", "find_errors", "find_duplicates", "check_imports", "count_lines", "find_todos", "analyze_route", "analyze_page"] },
        path: { type: "string" }, pattern: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "api_test",
    description: "בדיקת API endpoint עם authentication",
    input_schema: {
      type: "object" as const,
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string" }, body: { type: "object" }, headers: { type: "object" },
      },
      required: ["method", "path"],
    },
  },
  {
    name: "add_field",
    description: "הוספת עמודה לטבלה קיימת (ALTER TABLE ADD COLUMN)",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string" }, field_name: { type: "string" }, field_type: { type: "string" },
        nullable: { type: "boolean" }, default_value: { type: "string" },
      },
      required: ["table", "field_name", "field_type"],
    },
  },
  {
    name: "stream_data",
    description: "העברת נתונים בין טבלאות עם טרנספורמציה JS",
    input_schema: {
      type: "object" as const,
      properties: {
        source_query: { type: "string" }, target_table: { type: "string" },
        transform: { type: "string", description: "פונקציית JS: row => ({...})" }, batch_size: { type: "number" },
      },
      required: ["source_query", "target_table"],
    },
  },
  {
    name: "db_schema",
    description: "סכמת DB מפורטת — עמודות, אינדקסים, FK. בלי table = כל הטבלאות",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string" }, details: { type: "boolean" },
      },
      required: [],
    },
  },
  {
    name: "task_queue",
    description: "ניהול משימות ברקע — create, start, progress, complete, fail, list",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create", "start", "update_progress", "complete", "fail", "list"] },
        title: { type: "string" }, description: { type: "string" }, task_id: { type: "number" },
        progress: { type: "number" }, result: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "erp_query",
    description: "שאילתות ERP חכמות — לקוחות, הזמנות, מוצרים, ספקים, עובדים, חשבוניות, רכש, ייצור, CRM. פעולות: list, search, get, stats, top_debtors, by_status, low_stock, overdue, leads, pipeline ועוד.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", enum: ["customers", "orders", "products", "suppliers", "employees", "invoices", "purchase_orders", "production", "crm"], description: "תחום ERP" },
        action: { type: "string", description: "פעולה (list, search, get, stats, top_debtors, by_status, overdue, low_stock, pipeline...)" },
        filters: { type: "object", description: "סינונים ({search: 'טקסט חיפוש'})" },
        limit: { type: "number" },
        id: { type: "number", description: "מזהה ספציפי (get/items)" },
      },
      required: ["domain"],
    },
  },
  {
    name: "financial_calc",
    description: "חישובים פיננסיים: מע\"מ 17%, המרת מטבע, רווחיות, הלוואה, גיול חובות, סיכום הכנסות/הוצאות",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["vat_calc", "vat_extract", "currency_convert", "margin_calc", "loan_calc", "aging_report", "revenue_summary", "expense_summary"], description: "סוג חישוב" },
        amount_cents: { type: "number", description: "סכום באגורות" },
        rate: { type: "number", description: "שער/אחוז" },
        months: { type: "number" },
        date_from: { type: "string" }, date_to: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "user_management",
    description: "ניהול משתמשים — list, search, get, create, update, activate, deactivate, stats",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["list", "search", "get", "create", "update", "activate", "deactivate", "stats"] },
        user_id: { type: "number" }, data: { type: "object" }, search: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "report_generator",
    description: "מחולל דוחות דינמי — group_summary, top_n, time_series, cross_table",
    input_schema: {
      type: "object" as const,
      properties: {
        report_type: { type: "string", enum: ["group_summary", "top_n", "time_series", "cross_table"] },
        table_name: { type: "string" }, group_by: { type: "string" },
        aggregate: { type: "string", description: "ביטוי SQL (count(*), sum(amount_cents))" },
        where: { type: "string" }, order_by: { type: "string" }, limit: { type: "number" },
      },
      required: ["report_type"],
    },
  },
  {
    name: "notification_send",
    description: "שליחת התראות למשתמשים — internal, email, SMS, WhatsApp. send, list, mark_read.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["send", "list", "mark_read"] },
        user_id: { type: "number" }, title: { type: "string" }, message: { type: "string" },
        type: { type: "string", description: "info/warning/error/success" },
        priority: { type: "string", description: "low/normal/high/urgent" },
        all_users: { type: "boolean" },
        channel: { type: "string", enum: ["internal", "email", "sms", "whatsapp"], description: "ערוץ שליחה" },
        to: { type: "string", description: "נמען — email, מספר טלפון, או WhatsApp" },
        subject: { type: "string", description: "נושא (ל-email)" },
      },
      required: ["action"],
    },
  },
  {
    name: "data_validator",
    description: "בדיקת תקינות נתונים — find_nulls, find_duplicates, check_fk_integrity, check_empty_strings, full_audit",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["find_nulls", "find_duplicates", "check_fk_integrity", "check_empty_strings", "full_audit"] },
        table_name: { type: "string" }, column: { type: "string" }, fix: { type: "boolean" },
      },
      required: ["action"],
    },
  },
  {
    name: "bulk_update",
    description: "עדכון המוני של רשומות עם preview. מוגבל ל-5000 רשומות.",
    input_schema: {
      type: "object" as const,
      properties: {
        table_name: { type: "string" }, set: { type: "object", description: "ערכים לעדכון {column: value}" },
        where: { type: "string", description: "תנאי WHERE" }, preview: { type: "boolean" },
      },
      required: ["table_name", "set", "where"],
    },
  },
  {
    name: "erp_insights",
    description: "תובנות BI — business_overview, sales_trends, top_customers, top_products, cash_flow, data_quality",
    input_schema: {
      type: "object" as const,
      properties: {
        insight: { type: "string", enum: ["business_overview", "sales_trends", "top_customers", "top_products", "cash_flow", "data_quality"] },
        period: { type: "string", description: "תאריך התחלה (YYYY-MM-DD)" },
      },
      required: ["insight"],
    },
  },
  {
    name: "customer_service",
    description: "שרות לקוחות — lookup (חיפוש לקוח), order_status, add_note, history",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["lookup", "order_status", "add_note", "history"] },
        search: { type: "string" }, customer_id: { type: "number" }, order_id: { type: "number" }, note: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "inventory_check",
    description: "בדיקת מלאי — stock_level, low_stock, movements, valuation, summary",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["stock_level", "low_stock", "movements", "valuation", "summary"] },
        product_id: { type: "number" }, warehouse_id: { type: "number" }, search: { type: "string" }, threshold: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "backup_restore",
    description: "גיבוי/שחזור טבלאות — backup, restore, list_backups, delete_backup",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["backup", "restore", "list_backups", "delete_backup"] },
        table_name: { type: "string" }, backup_name: { type: "string" },
      },
      required: ["action", "table_name"],
    },
  },
  {
    name: "workflow_trigger",
    description: "הפעלת תהליכי עבודה — order_to_invoice, approve_order, close_order, receive_goods, update_stock, list_workflows",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["order_to_invoice", "approve_order", "close_order", "receive_goods", "update_stock", "list_workflows"] },
        entity_id: { type: "number" }, data: { type: "object" },
      },
      required: ["action"],
    },
  },
  {
    name: "smart_fix",
    description: "תיקון אוטומטי — broken_routes, missing_tables, null_required_fields",
    input_schema: {
      type: "object" as const,
      properties: {
        target: { type: "string", enum: ["broken_routes", "missing_tables", "null_required_fields"] },
        description: { type: "string" },
      },
      required: ["target"],
    },
  },
  {
    name: "deploy_check",
    description: "בדיקת מוכנות לפריסה — API, DB, TS errors, RAM, uptime",
    input_schema: {
      type: "object" as const,
      properties: {
        check: { type: "string", enum: ["full", "api", "db", "tables", "errors"] },
      },
      required: [],
    },
  },
  {
    name: "export_report",
    description: "ייצוא דוחות CSV/Excel/JSON — מכל שאילתה או טבלה. הקובץ נשמר ב-/exports/ וזמין להורדה.",
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string", enum: ["csv", "excel", "xlsx", "json"], description: "פורמט הייצוא" },
        query: { type: "string", description: "שאילתת SQL (אופציונלי אם table_name ניתן)" },
        table_name: { type: "string", description: "שם טבלה לייצוא (אופציונלי אם query ניתן)" },
        title: { type: "string", description: "כותרת הדוח" },
        columns: { type: "array", items: { type: "string" }, description: "עמודות ספציפיות" },
        where: { type: "string", description: "תנאי WHERE" },
        file_name: { type: "string", description: "שם קובץ מותאם" },
      },
      required: ["format"],
    },
  },
  {
    name: "import_data",
    description: "יבוא נתונים מ-CSV/Excel/JSON לכל טבלה. תומך במיפוי עמודות, ניתוח קבצים, ו-ON CONFLICT.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["csv_import", "excel_import", "json_import", "analyze_file"], description: "פעולה" },
        file_path: { type: "string", description: "נתיב לקובץ" },
        file_content: { type: "string", description: "תוכן הקובץ (חלופה ל-file_path)" },
        table_name: { type: "string", description: "טבלת יעד" },
        format: { type: "string", description: "פורמט הקובץ" },
        column_mapping: { type: "object", description: "מיפוי עמודות: {שם_בקובץ: שם_בטבלה}" },
        delimiter: { type: "string", description: "מפריד CSV (ברירת מחדל: ,)" },
        on_conflict: { type: "string", enum: ["error", "skip", "update"], description: "התנהגות בכפילות" },
      },
      required: ["action"],
    },
  },
  {
    name: "scheduler",
    description: "תזמון משימות אוטומטיות — יצירה, רשימה, הפעלה/השבתה, מחיקה. תומך ב-cron (@every_5m, @every_1h, @daily, @weekly).",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["create", "list", "enable", "disable", "delete"], description: "פעולה" },
        name: { type: "string", description: "שם המשימה (ב-create)" },
        cron: { type: "string", description: "תזמון: @every_5m, @every_1h, @every_6h, @daily, @weekly" },
        tool_action: { type: "string", description: "שם הכלי להפעלה (למשל: system_health, data_validator)" },
        params: { type: "object", description: "פרמטרים לכלי" },
        job_id: { type: "string", description: "מזהה משימה (ב-enable/disable/delete)" },
      },
      required: ["action"],
    },
  },
  {
    name: "automation_trigger",
    description: "טריגרים אוטומטיים — רישום טריגר לאירוע, הפעלה ידנית, רשימה, מחיקה.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["register", "fire", "list", "delete"], description: "פעולה" },
        event: { type: "string", description: "שם האירוע (למשל: order_created, low_stock, daily_report)" },
        condition: { type: "string", description: "תנאי הפעלה (אופציונלי)" },
        tool_action: { type: "string", description: "שם הכלי להפעלה בטריגר" },
        params: { type: "object", description: "פרמטרים לכלי" },
        data: { type: "object", description: "נתונים להעביר בהפעלה (ב-fire)" },
        trigger_id: { type: "string", description: "מזהה טריגר (ב-delete)" },
      },
      required: ["action"],
    },
  },
  {
    name: "agent_status",
    description: "סטטוס מלא של הסוכן — כלים, קטגוריות, DB, משימות מתוזמנות, טריגרים, הגדרות.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "build_feature",
    description: "בניית פיצ'ר מלא end-to-end בפקודה אחת: יוצר טבלת DB, API routes (CRUD מלא), דף React עם טופס וטבלה, רישום ב-router ובתפריט.",
    input_schema: {
      type: "object" as const,
      properties: {
        feature_name: { type: "string" as const, description: "שם הפיצ'ר בעברית (גם שם הדף בתפריט)" },
        table_name: { type: "string" as const, description: "שם הטבלה ב-DB (אופציונלי — ברירת מחדל לפי שם הפיצ'ר)" },
        columns: {
          type: "array" as const,
          description: "עמודות הטבלה (ללא id, created_at, updated_at — נוספות אוטומטית)",
          items: {
            type: "object" as const,
            properties: {
              name: { type: "string" as const, description: "שם העמודה" },
              type: { type: "string" as const, description: "סוג: TEXT, INTEGER, NUMERIC(12,2), BOOLEAN, DATE, TIMESTAMPTZ, JSONB" },
              required: { type: "boolean" as const, description: "NOT NULL?" },
            },
            required: ["name", "type"],
          },
        },
        page_path: { type: "string" as const, description: "נתיב הדף (ברירת מחדל: /table-name)" },
        page_title: { type: "string" as const, description: "כותרת הדף (ברירת מחדל: feature_name)" },
        section: { type: "string" as const, description: "שם הסקשן בתפריט הצדדי" },
        api_prefix: { type: "string" as const, description: "prefix ל-API routes (ברירת מחדל: /table-name)" },
        with_crud: { type: "boolean" as const, description: "ליצור טבלת DB? ברירת מחדל: true" },
        with_page: { type: "boolean" as const, description: "ליצור דף React? ברירת מחדל: true" },
        with_api: { type: "boolean" as const, description: "ליצור API routes? ברירת מחדל: true" },
        with_menu: { type: "boolean" as const, description: "להוסיף לתפריט? ברירת מחדל: true" },
      },
      required: ["feature_name"],
    },
  },
  {
    name: "package_manager",
    description: "ניהול חבילות npm — התקנה, הסרה, רשימה. עובד עם pnpm workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string" as const, enum: ["install", "install_dev", "remove", "list"], description: "פעולה: install, install_dev, remove, list" },
        packages: { type: "array" as const, items: { type: "string" as const }, description: "רשימת חבילות (לא נדרש ל-list)" },
        workspace: { type: "string" as const, description: "workspace יעד (ברירת מחדל: @workspace/api-server). אפשרויות: @workspace/api-server, @workspace/erp-app" },
      },
      required: ["action"],
    },
  },
  {
    name: "git_ops",
    description: "פעולות Git — סטטוס, diff, לוג, add, commit.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string" as const, enum: ["status", "diff", "log", "add", "commit"], description: "פעולה: status, diff, log, add, commit" },
        message: { type: "string" as const, description: "הודעת commit (נדרש רק ל-commit)" },
        files: { type: "array" as const, items: { type: "string" as const }, description: "קבצים ספציפיים (ל-add, ברירת מחדל: הכל)" },
      },
      required: ["action"],
    },
  },
  {
    name: "analyze_image",
    description: "ניתוח תמונה עם Claude Vision — זיהוי תוכן, חילוץ טקסט מסמך, זיהוי מוצרים, שרטוטים, תמונות מצלמה. תומך ב-JPG/PNG/GIF/WebP/BMP.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string" as const, description: "נתיב לקובץ התמונה (יחסי ל-root הפרויקט)" },
        question: { type: "string" as const, description: "שאלה ספציפית על התמונה (אופציונלי — ברירת מחדל: תיאור כללי)" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "show_map",
    description: "הצגת נתוני מיקום על מפה גאוגרפית אינטראקטיבית. שימושים: הצגת לקוחות על מפה, מחסנים, נקודות משלוח, סוכני שטח, סניפים. הנתונים מגיעים מה-DB — תמיד הרץ erp_query/run_sql קודם כדי לשלוף קואורדינטות.",
    input_schema: {
      type: "object" as const,
      properties: {
        markers: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              lat: { type: "number" as const, description: "קו רוחב" },
              lng: { type: "number" as const, description: "קו אורך" },
              label: { type: "string" as const, description: "שם/תווית הנקודה" },
              type: { type: "string" as const, description: "סוג: customer, warehouse, delivery, agent, branch" },
              color: { type: "string" as const, description: "צבע: red, blue, green, orange, purple" },
              info: { type: "string" as const, description: "מידע נוסף להצגה בפופאפ" },
            },
            required: ["lat", "lng", "label"],
          },
          description: "רשימת נקודות להצגה על המפה",
        },
        center: {
          type: "object" as const,
          properties: {
            lat: { type: "number" as const },
            lng: { type: "number" as const },
          },
          description: "מרכז המפה (אופציונלי — ברירת מחדל: ממוצע הנקודות)",
        },
        zoom: { type: "number" as const, description: "רמת זום (1-18, ברירת מחדל 10)" },
        title: { type: "string" as const, description: "כותרת המפה" },
      },
      required: ["markers"],
    },
  },
  {
    name: "save_memory",
    description: "שמירת זיכרון מפורש לשימוש בשיחות עתידיות. השתמש כשהמשתמש מבקש לזכור משהו, מציין העדפה, או כשמשימה חשובה הושלמה.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string" as const, description: "קטגוריה: 'העדפות משתמש', 'משימות שהושלמו', 'הגדרות פרויקט', 'קבצים חשובים', 'הערות'" },
        key: { type: "string" as const, description: "מפתח קצר ומתאר (עד 80 תווים)" },
        value: { type: "string" as const, description: "הערך לשמור (עד 500 תווים)" },
        importance: { type: "number" as const, description: "חשיבות 1-10 (ברירת מחדל: 7)" },
      },
      required: ["category", "key", "value"],
    },
  },
];
