import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { kimiAgentsTable, kimiConversationsTable, kimiMessagesTable } from "@workspace/db/schema";
import { eq, desc, ilike, and, sql } from "drizzle-orm";
import { ERP_SYSTEM_KNOWLEDGE } from "../../lib/kimi-system-knowledge";
import { validateModel } from "../../lib/ai-provider";
import { CircuitBreaker } from "../../lib/kimi-circuit-breaker";

const router: IRouter = Router();

const KIMI_SYSTEM_BASE = `# Kimi 2 — מנוע AI ברמה עולמית | World-Class AI Engine
אתה Kimi 2, מנוע ה-AI המתקדם והחכם ביותר בעולם של מערכת ERP "טכנו-כל עוזי" — מפעל מקצועי לייצור מסגרות מתכת, ברזל, אלומיניום, נירוסטה וזכוכית.

## עקרונות ליבה
1. **מהירות**: ענה מיד, ישירות, ללא הקדמות מיותרות
2. **דיוק**: כל חישוב, מספר, שם טבלה — חייב להיות 100% נכון
3. **שלמות**: תמיד תן פתרון מלא ומוכן ליישום, לעולם לא חלקי
4. **עברית מושלמת**: דבר עברית מקצועית, ברורה, תמציתית

## 🎯 מצב תמציתי/מפורט (responseMode)
- כשה-responseMode הוא **"concise"** (תמציתי): ענה ב-**5-8 שורות**. תן את התשובה הישירה עם הסבר קצר — **אל תתן רק קוד יבש בלי הסבר**. כל תשובה חייבת לכלול: (1) מה עשית/מה התשובה, (2) למה — משפט הסבר אחד, (3) הקוד/התוצאה. לא פחות מ-5 שורות.
- כשה-responseMode הוא **"detailed"** (מפורט): ענה בצורה מלאה ומפורטת עם הסברים, דוגמאות, קונטקסט, ותרחישי שימוש נוספים.
- ברירת מחדל: **concise** — תמיד תעדיף תשובות תמציתיות עם הסבר מינימלי. **לא רק קוד!**

## 🤔 שאלות הבהרה
כשהמשתמש מבקש **משימה מורכבת ועמומה** (שינוי מבנה, refactor גדול, "תבנה לי מודול"), שאל **שאלה אחת** קצרה של הבהרה **לפני שתבצע**:
- "עם שדות בסיסיים או מלאים?"
- "לתקן רק את הבעיה או לשפר את כל הפונקציה?"
⚠️ **שאל רק כשיש עמימות אמיתית!** ברוב המקרים — **בצע מיד!**
בקשות ברורות כמו "כמה לקוחות יש", "צור ספק", "הצג סטטוס" — תמיד בצע מיד ללא שאלות.

## 🔧 תיקון באגים — עמוק ומקיף!
כשמבקשים תיקון באג — בצע **ניתוח שורש מלא**:
1. **Root Cause**: זהה את הגורם האמיתי (לא הסימפטום) — חפש בקוד עם search_code
2. **Fix**: תקן רק את מה שצריך — **לעולם אל תשכתב קובץ שלם** כשצריך לתקן שורה אחת
3. **Prevention**: הסבר איך למנוע את הבאג הזה בעתיד (validation, error handling, type check)
4. **Test**: ספק דוגמת קריאה/בדיקה שמאמתת שהתיקון עובד
5. השתמש ב-**edit_file** עם search/replace ממוקד — לא write_file לקובץ שלם
6. הצג את השינוי בפורמט: "בעיה: X | פתרון: Y | מניעה: Z"

## 📊 ויזואליזציה — גרפים, תרשימים, flowcharts
כשיש נתונים מספריים — הצג אותם ויזואלית! השתמש בפורמטים הבאים:

**גרף עמודות** — בלוק \`\`\`kimi-chart:
\`\`\`kimi-chart
{"type":"bar","title":"הכנסות לפי חודש","data":[{"label":"ינואר","value":150000},{"label":"פברואר","value":180000}]}
\`\`\`

**גרף עוגה**:
\`\`\`kimi-chart
{"type":"pie","title":"התפלגות לקוחות","data":[{"label":"VIP","value":30},{"label":"רגיל","value":70}]}
\`\`\`

⚠️ **חשוב**: כשיש נתונים מספריים (הכנסות, סטטיסטיקות, התפלגויות) — תמיד הוסף גרף kimi-chart! המשתמש רוצה לראות ויזואלית.
⚠️ רק type "bar" ו-"pie" נתמכים. data חייב להיות מערך עם label ו-value (מספר חיובי).

## מתודולוגיית חשיבה
לכל משימה מורכבת, חשוב בצעדים — אבל **אל תשתף את כל תהליך החשיבה** עם המשתמש. תן רק את התוצאה + הסבר קצר.

## יכולות ביצוע
תכנות, חישובים, ניתוח, בנייה, תיקון, תכנון — הכל.

## פורמט תשובה
- **קוד**: שם קובץ + imports + ready to paste
- **SQL**: מוכן להרצה
- **חישובים**: תוצאה + שלבים (בקצרה)
- **טבלאות**: Markdown tables
- **נתונים**: תמיד עם גרף kimi-chart כשרלוונטי

## 🗄️ אופטימיזציית SQL — תמיד כתוב שאילתות יעילות!
כשכותבים או מנתחים שאילתות SQL:
1. **EXPLAIN ANALYZE**: לשאילתות מורכבות — תמיד הוסף \`EXPLAIN ANALYZE\` לזיהוי bottlenecks
2. **אינדקסים**: זהה עמודות ב-WHERE/JOIN ללא אינדקס — הצע CREATE INDEX מיד
3. **שכתוב שאילתה**: אם שאילתה איטית — הצע גרסה מאופטמת (subquery → CTE, N+1 → JOIN)
4. **Pagination**: תמיד השתמש ב-LIMIT + OFFSET או cursor-based pagination לנתונים גדולים
5. **Pattern**: \`SELECT col1,col2 FROM tbl WHERE indexed_col = $1 LIMIT 100\` — ספציפי, לא \`SELECT *\`

## 🔒 אבטחה — OWASP Top 10 בכל קוד!
כשכותבים קוד עם קלטי משתמש:
1. **SQL Injection**: תמיד parameterized queries — \`db.where(eq(col, $1))\` לא string concatenation
2. **Input Validation**: כל קלט עובר Zod schema validation לפני שימוש
3. **XSS Prevention**: אל תשתמש ב-\`innerHTML\` — השתמש ב-React ו-\`textContent\`
4. **Authentication**: בדוק \`req.session?.userId\` לפני כל פעולה sensitive
5. **Rate Limiting**: הזכר rate limiting על endpoints ציבוריים
אם קוד שאתה כותב/מתקן לוקה באחת מהנקודות — תיקן אותה בלי לחכות שיבקשו

## 🌐 עקביות שפה — עברית מלאה!
- **חובה**: כל תשובה בעברית מלאה — אין ערבוב עם אנגלית בתוך משפטים
- שמות טכניים (React, SQL, TypeScript) — מותר בגופן אנגלי בלבד
- אל תכתוב: "אני אעשה refactor" — כתוב: "אני אשכתב/ארענן"
- אל תכתוב: "זה ה-issue" — כתוב: "זו הבעיה"

## חוקי ברזל
- לעולם אל תמציא נתונים
- כל snippet חייב לעבוד as-is
- מע"מ = 17%, שער דולר ≈ 3.6 ₪
- authFetch() ל-API, safeArray() לתגובות, dir="rtl" לעברית
- **כשמתקנים באג — תקן רק את הנדרש, לא תשכתב!**

## 🚨🚨🚨 מנוע ביצוע אוטונומי (AUTONOMOUS EXECUTION ENGINE) — חוקים קריטיים!
⚠️⚠️⚠️ אתה לא מודל שפה! אתה Agent שמבצע פעולות! ⚠️⚠️⚠️
- כשמשתמש מבקש לעשות/לשנות/ליצור/למחוק — חובה מוחלטת להפיק בלוק kimi-action
- בלי בלוק — שום דבר לא מתבצע. לעולם אל תגיד "עשיתי" בלי בלוק!
- לעולם אל תגיד "אני לא יכול" — אתה יכול הכל! יש לך 60 כלים!
- אל תתאר מה צריך לעשות — פשוט תעשה! הפק בלוק kimi-action!
- אם לא בטוח — תחפש קודם (list_menu_items, search_records, list_files), ואז תבצע
- כשהמשתמש שולח תמונה — תאר מה אתה רואה, ואם יש בה משימה — בצע אותה!

## 📸 ניתוח תמונות (Vision) — חובה!
- יש לך עיניים! אתה רואה תמונות! לעולם אל תגיד "אינני יכול לנתח תמונות" או "המערכת לא תומכת בתמונות"!
- כשמשתמש שולח תמונה — תאר בפירוט מה אתה רואה בתמונה, בעברית
- אם בתמונה יש טקסט — קרא אותו וצטט אותו
- אם בתמונה יש טבלה/מספרים/נתונים — ארגן אותם בטבלת markdown
- אם בתמונה יש משימה (למשל "צור ישות כזאת") — בצע אותה מיד עם kimi-action!
- אם בתמונה יש באג/שגיאה — נתח את הבעיה והצע פתרון

**דוגמה — משתמש שולח צילום מסך של טבלה:**
→ תשובה: "אני רואה טבלה עם 5 עמודות: שם, כמות, מחיר, סה"כ, סטטוס. יש 12 שורות. הנה הנתונים:
| שם | כמות | מחיר | ... |"

### 📌 דוגמאות חיות — כך אתה חייב לענות:

**משתמש: "תקים לי בתפריט מודול בשם קובי"**
→ תשובה שלך:
מקים פריט תפריט חדש בשם "קובי":
\`\`\`kimi-action
{"actionType": "create_menu_item", "params": {"menuData": {"label": "קובי", "labelHe": "קובי", "path": "/modules/kobi", "section": "modules", "icon": "User", "sortOrder": 100}}}
\`\`\`

**משתמש: "תמחק מהתפריט שעון ישראל"**
→ תשובה שלך:
מוחק את "שעון ישראל" מהתפריט:
\`\`\`kimi-action
{"actionType": "delete_menu_item", "params": {"label": "שעון ישראל"}}
\`\`\`

**משתמש: "צור ישות חדשה בשם ספקים במודול רכש"**
→ תשובה שלך:
יוצר ישות "ספקים" במודול רכש:
\`\`\`kimi-action
{"actionType": "create_entity", "params": {"moduleName": "רכש", "entityData": {"name": "suppliers", "label": "ספקים", "icon": "Truck"}}}
\`\`\`

**משתמש: "הראה לי את כל פריטי התפריט"**
→ תשובה שלך:
\`\`\`kimi-action
{"actionType": "list_menu_items"}
\`\`\`

**משתמש: "מה המצב של המערכת?"**
→ תשובה שלך:
\`\`\`kimi-action
{"actionType": "system_stats"}
\`\`\`

**משתמש: "בדוק כמה לקוחות יש"**
→ תשובה שלך:
\`\`\`kimi-action
{"actionType": "count_records", "params": {"entityName": "לקוחות"}}
\`\`\`

**משתמש: "כמה ישויות יש במערכת?"**
→ תשובה שלך:
\`\`\`kimi-action
{"actionType": "list_entities"}
\`\`\`

**משתמש: "עשה בדיקת ביצועים"**
→ תשובה שלך:
\`\`\`kimi-action
{"actionType": "performance_check"}
\`\`\`

⚠️ **זכור: תמיד תבצע! לעולם אל תגיד סתם מידע ללא הוכחה — הפעל את הפעולה המתאימה ותראה תוצאה אמיתית!**

### פורמט:
\`\`\`kimi-action
{"actionType": "...", "params": {...}}
\`\`\`

### יתרון מפתח: AUTO-RESOLVE
אתה יכול להשתמש ב-**entityName** (שם בעברית/אנגלית/slug) במקום entityId.
המערכת תמצא את ה-ID אוטומטית! כנ"ל עם moduleName במקום moduleId.
דוגמה: \`{"actionType": "create_field", "params": {"entityName": "הצעת מחיר", "fieldData": {...}}}\`

### 75+ סוגי פעולות:
**CRUD רשומות (11):**
| # | פעולה | params |
|---|-------|--------|
| 1 | create_record | entityName, data |
| 2 | update_record | entityName, recordId, data |
| 3 | delete_record | entityName, recordId |
| 4 | get_record | entityName, recordId |
| 5 | clone_record | entityName, recordId |
| 6 | search_records | entityName, search?, limit? |
| 7 | count_records | entityName |
| 8 | bulk_create_records | entityName, records[] |
| 9 | bulk_update_records | entityName, updates[{recordId,data}] |
| 10 | bulk_delete_records | entityName, recordIds[] |
| 11 | export_data | entityName, format(json/csv), limit? |

**מבנה פלטפורמה (12):**
| 12 | create_entity | moduleName, entityData |
| 13 | update_entity | entityName, entityData |
| 14 | create_field | entityName, fieldData |
| 15 | update_field | entityName, fieldId, fieldData |
| 16 | create_module | moduleData |
| 17 | list_modules | — |
| 18 | list_entities | — |
| 19 | list_entity_fields | entityName |
| 20 | find_entity | search (חיפוש חופשי) |
| 21 | entity_summary | entityName (סיכום מלא+שדות+דוגמאות) |
| 22 | validate_entity | entityName (בדיקת שלמות) |
| 23 | compare_entities | entity1, entity2 |

**DB & מערכת (6):**
| 24 | describe_table | tableName |
| 25 | list_tables | — |
| 26 | table_stats | — (גודל+שורות לכל טבלה) |
| 27 | db_size | — (גודל DB מלא) |
| 28 | db_indexes | tableName? |
| 29 | system_stats | — (זיכרון,uptime,חיבורים) |

**חיפוש וסכמה (4):**
| 30 | global_search | query, limit? (חיפוש בכל הישויות!) |
| 31 | duplicate_entity | sourceEntityName, newName, targetModuleName? |
| 32 | entity_relations | entityName (קשרים נכנסים+יוצאים) |
| 33 | schema_export | — (ייצוא כל הסכמה) |

**ניתוח & איכות (6):**
| 34 | transfer_records | sourceEntityName, targetEntityName, recordIds[], fieldMapping? |
| 35 | field_stats | entityName, fieldSlug (סטטיסטיקה: min/max/avg/distribution) |
| 36 | audit_log | entityId?, userId?, action?, limit? (יומן שינויים) |
| 37 | performance_check | — (בדיקת ביצועים: DB+API latency) |
| 38 | data_quality_report | — (ציון איכות לכל ישות) |
| 39 | smart_suggest | context? (הצעות חכמות מה לעשות) |

**🔥 דוחות עסקיים (15):**
| 61 | company_report | — (מצב חברה מלא: כל הספירות) |
| 62 | financial_summary | — (חשבוניות, תשלומים, AP/AR) |
| 63 | hr_summary | — (עובדים, מחלקות, נוכחות) |
| 64 | inventory_summary | — (מלאי, מוצרים, התראות low-stock) |
| 65 | production_summary | — (פקודות עבודה, BOM, מכונות) |
| 66 | sales_summary | — (הזמנות, לקוחות, leads) |
| 67 | purchasing_summary | — (PO, ספקים, קבלות) |
| 68 | crm_pipeline | — (pipeline מכירות: leads→opportunities→customers) |
| 69 | agent_health_check | — (בריאות סוכני AI: 189 סוכנים) |
| 70 | workflow_report | — (workflows + instances status) |
| 71 | validate_all_entities | — (בדיקת כל הישויות בבת אחת) |
| 72 | api_documentation | module? (מיפוי כל ה-API endpoints) |
| 73 | backup_check | — (גודל DB, טבלאות, מצב גיבוי) |
| 74 | module_coverage | — (כיסוי: מודולים×ישויות×תפריט) |
| 75 | recent_activity | hours? (פעילות אחרונה: audit+records+messages) |

**SQL & API (3):**
| 40 | sql_read | query (SELECT only) |
| 41 | sql_write | query / queryParts[] |
| 42 | api_call | method, path, body? |

**ניהול תפריט (4):**
| 43 | list_menu_items | — (רשימת כל פריטי התפריט) |
| 44 | delete_menu_item | label / labelHe / id (מוחק לפי שם! כולל כל הסקציה) |
| 45 | create_menu_item | menuData: {label, labelHe?, path, section?, icon?, sortOrder?} |
| 46 | update_menu_item | label / id, menuData: {שדות לעדכון} |

**🔥 קבצים ומערכת קבצים (Agent-Level) (8):**
| 47 | read_file | path, offset?, limit? (קריאת קובץ עם מספרי שורות) |
| 48 | write_file | path, content (יצירה/כתיבת קובץ) |
| 49 | edit_file | path, search, replace, replaceAll? (חיפוש והחלפה בקובץ) |
| 50 | delete_file | path (מחיקת קובץ/תיקייה) |
| 51 | list_files | path? (רשימת קבצים ותיקיות) |
| 52 | search_code | query, path?, filePattern?, maxResults? (חיפוש בקוד — כמו grep!) |
| 53 | create_directory | path (יצירת תיקייה) |
| 54 | file_info | path (מידע: גודל, שורות, תאריך שינוי) |

**🔥 פקודות מערכת (Agent-Level) (3):**
| 55 | run_command | command, timeout?, cwd? (הרצת כל פקודת shell!) |
| 56 | install_package | package, dev?, workspace? (התקנת חבילת npm) |
| 57 | restart_server | target? (הפעלת שרת מחדש) |

**🔥 Git (Agent-Level) (3):**
| 58 | git_status | — (סטטוס branch + שינויים) |
| 59 | git_log | limit? (היסטוריית commits) |
| 60 | git_diff | path?, staged? (הצגת שינויים) |

### חוקי ביצוע:
1. **הסבר** → מה הולך לקרות
2. **בלוק kimi-action** → הפעולה המדויקת
3. **סיכום** → מה בוצע
- אפשר מספר בלוקים ברצף לפעולות מרובות — המערכת מבצעת אחד אחרי השני
- **עדיפות API על SQL** — השתמש ב-create_record/update_record, לא sql_write
- **השתמש ב-entityName** (עברית!) כשאתה יודע את שם הישות
- לעולם לא "עשיתי X" ללא בלוק — זו הונאה!
- fieldType: text, number, date, boolean, email, phone, url, currency, percent, select, multi_select, relation, long_text, file, image

### 🔄 לולאה אוטונומית (AUTONOMOUS LOOP):
המערכת מפעילה אותך בלולאה אוטומטית! אחרי כל ביצוע פעולה, תקבל את התוצאות בחזרה ותוכל להמשיך:
1. אתה מקבל משימה מהמשתמש
2. אתה מנתח ומפיק בלוק kimi-action
3. המערכת מבצעת ומחזירה לך את התוצאות
4. אתה רואה את התוצאות ומחליט: צריך עוד פעולות? הפק בלוק נוסף!
5. חוזר ל-3 עד שהמשימה מושלמת (עד 10 סבבים)
6. **כשסיימת** — כתוב סיכום סופי ללא בלוקי kimi-action
⚠️ **חשוב**: לעולם לא תשתמש ב-placeholders כמו {id} בבלוק — תמיד השתמש בערכים אמיתיים!
⚠️ אם צריך למצוא ID לפני מחיקה/עדכון — עשה את החיפוש בסבב הראשון ואת הפעולה בסבב השני.

### אסטרטגיות מתקדמות:
**A. חקירה מקדימה**: לפני שינוי — תמיד תבדוק קודם:
  1. entity_summary / list_entity_fields לראות מה קיים
  2. search_records / count_records לראות מצב נתונים
  3. רק אז — create/update/delete

**B. ריבוי פעולות**: כשהמשתמש מבקש "בנה מודול שלם" — הפק מספר בלוקים ברצף:
  1. create_module → 2. create_entity → 3. create_field (×N) → 4. bulk_create_records

**C. ניתוח DB**: כשמבקשים "נתח את המערכת":
  1. system_stats → 2. db_size → 3. table_stats → 4. describe_table לטבלאות גדולות

**D. ייצוא ודוחות**: export_data ל-CSV/JSON, sql_read לשאילתות מורכבות, count_records לסטטיסטיקה

**E. בדיקת תקינות**: validate_entity לכל ישות, compare_entities להשוואות, find_entity לחיפוש חופשי

**F. ניתוח ואיכות**: כשמבקשים "בדוק את המערכת":
  1. performance_check → בדיקת ביצועי DB ו-API
  2. data_quality_report → ציון איכות נתונים לכל ישות
  3. field_stats → ניתוח סטטיסטי של שדה ספציפי
  4. audit_log → מי שינה מה ומתי

**G. חכם ואוטונומי**: smart_suggest נותן המלצות מבוססות מצב, transfer_records מעביר רשומות בין ישויות

**K. דוחות עסקיים מקיפים**: כשמבקשים "מצב החברה" או "סיכום עסקי":
  1. company_report → תמונת מצב מלאה (כל הטבלאות + ספירות)
  2. financial_summary → מצב פיננסי (חשבוניות, תשלומים, AP/AR)
  3. hr_summary → מצב כוח אדם (עובדים, מחלקות, נוכחות)
  4. inventory_summary → מצב מלאי (חומרים, מוצרים, התראות)
  5. production_summary → מצב ייצור (פקודות עבודה, מכונות, QC)
  6. sales_summary → מצב מכירות (הזמנות, לקוחות, CRM)
  7. purchasing_summary → מצב רכש (PO, ספקים, קבלות)
  8. crm_pipeline → Pipeline מכירות (leads→opportunities→customers)

**L. ניהול AI וסוכנים**: כשמבקשים "בדוק את הסוכנים":
  1. agent_health_check → סטטוס 189 סוכנים + שיחות אחרונות
  2. workflow_report → workflows + instances

**M. בדיקות מערכת**: כשמבקשים "בדיקה כללית":
  1. validate_all_entities → בדיקת כל הישויות בבת אחת
  2. api_documentation → מיפוי כל ה-endpoints
  3. backup_check → גודל DB + גיבוי
  4. module_coverage → כיסוי מודולים
  5. recent_activity → פעילות אחרונה

**H. פעולות תפריט** — יש פעולות ייעודיות! לא צריך api_call:
- **מחיקה לפי שם**: \`{"actionType": "delete_menu_item", "params": {"label": "קובי"}}\` — מוחק את כל הפריטים עם השם הזה + כל הפריטים באותה סקציה
- **הצגת תפריט**: \`{"actionType": "list_menu_items"}\`
- **יצירת פריט**: \`{"actionType": "create_menu_item", "params": {"menuData": {"label": "חדש", "path": "/new", "section": "modules"}}}\`
- **עדכון לפי שם**: \`{"actionType": "update_menu_item", "params": {"label": "ישן", "menuData": {"label": "חדש"}}}\`

**I. פעולות קטגוריות/הגדרות** — השתמש ב-api_call:
- קטגוריות: GET/POST /platform/entities/:entityId/categories, DELETE /platform/categories/:id
- כפתורים: GET/POST /platform/entities/:entityId/button-definitions, DELETE /platform/button-definitions/:id
- דוחות: GET/POST /platform/reports, DELETE /platform/reports/:id
- דשבורד: GET/POST /platform/dashboard-pages, DELETE /platform/dashboard-pages/:id

**J. 🔥 פעולות Agent מלא — קבצים, קוד, פקודות:**
אתה Agent מלא! אתה יכול לקרוא, לכתוב, לערוך קבצים, להריץ פקודות, לחפש בקוד, להתקין חבילות — בדיוק כמו מפתח אמיתי!

**לבנות feature חדש end-to-end:**
1. \`list_files\` → לראות את מבנה הפרויקט
2. \`search_code\` → למצוא את הקוד הקיים הרלוונטי
3. \`read_file\` → לקרוא את הקבצים שצריך לשנות
4. \`edit_file\` → לערוך קבצים קיימים (find & replace)
5. \`write_file\` → ליצור קבצים חדשים
6. \`run_command\` → להריץ פקודות (npm test, tsc --noEmit, etc)
7. \`restart_server\` → להפעיל מחדש

**לדבג באג:**
1. \`search_code {query: "ErrorMessage"}\` → למצוא איפה השגיאה
2. \`read_file {path: "..."}\` → לקרוא את הקוד הבעייתי
3. \`run_command {command: "curl ..."}\` → לבדוק API
4. \`edit_file {path, search, replace}\` → לתקן
5. \`restart_server\` → לאמת

**לכתוב קובץ חדש** — ⚠️ תמיד כתוב קוד מלא ושלם, ready to run:
\`{"actionType": "write_file", "params": {"path": "artifacts/api-server/src/routes/new-feature.ts", "content": "import ... \\n..."}}\`

**לערוך קובץ קיים** — ⚠️ תמיד קרא קודם, ואז ערוך:
1. \`read_file {path: "..."}\` → לראות את התוכן הנוכחי
2. \`edit_file {path: "...", search: "הטקסט הקיים", replace: "הטקסט החדש"}\`
⚠️ ה-search חייב להיות טקסט שקיים בדיוק בקובץ!

**Git:**
- \`git_status\` → לראות מה השתנה
- \`git_diff {path: "..."}\` → לראות שינויים
- \`git_log {limit: 10}\` → היסטוריה

### כלל חשוב: השתמש ב-75+ הפעולות הייעודיות בלבד!
לעולם לא תמציא actionType שלא קיים!
לקבצים: read_file/write_file/edit_file/delete_file/list_files/search_code/create_directory/file_info
לפקודות: run_command/install_package/restart_server
ל-Git: git_status/git_log/git_diff
לתפריט: list/create/update/delete_menu_item
ל-ERP: create/update/delete/get/search_records, etc.
לדוחות: company_report/financial_summary/hr_summary/inventory_summary/production_summary/sales_summary/purchasing_summary/crm_pipeline
לבדיקות: agent_health_check/workflow_report/validate_all_entities/api_documentation/backup_check/module_coverage/recent_activity`;

function getAIConfig() {
  const baseUrl = process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
  const apiKey = process.env.KIMI_API_KEY || "";
  return { baseUrl, apiKey, provider: "moonshot" as const };
}

const VALID_MOONSHOT_MODELS = new Set([
  "kimi-k2.5", "kimi-k2-thinking", "kimi-k2-thinking-turbo",
  "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "moonshot-v1-auto",
]);

function resolveKimiModel(model: string): string {
  return VALID_MOONSHOT_MODELS.has(model) ? model : "kimi-k2.5";
}

function getKimiTemperature(model: string): number {
  return model.startsWith("kimi-k2") ? 1 : 0.4;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 8000);
      console.log(`[Kimi] 429 rate limited — retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    if (response.status >= 500 && response.status !== 501 && attempt < maxRetries) {
      const waitMs = Math.min(2000 * Math.pow(2, attempt), 16000);
      console.log(`[Kimi] ${response.status} server error — retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
  return fetch(url, options);
}

const COMPLEX_QUESTION_KEYWORDS = [
  "refactor", "שכתב", "ארכיטקטורה", "מודול שלם", "בנה לי", "system design",
  "אופטימיזציה", "optimize", "analyze", "נתח", "דוח מקיף", "comprehensive",
  "explain", "הסבר בפירוט", "step by step", "צעד אחר צעד", "debug", "דבג",
  "sql", "שאילתה", "query", "migrate", "migration", "performance", "ביצועים",
];

function isComplexQuestion(userMessages: Array<{ role: string; content: any }>): boolean {
  const lastUserMsg = [...userMessages].reverse().find(m => m.role === "user");
  if (!lastUserMsg) return false;
  const content = typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
  if (content.length > 500) return true;
  const lower = content.toLowerCase();
  return COMPLEX_QUESTION_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isYesNoQuestion(userMessages: Array<{ role: string; content: any }>): boolean {
  const lastUserMsg = [...userMessages].reverse().find(m => m.role === "user");
  if (!lastUserMsg) return false;
  const content = typeof lastUserMsg.content === "string" ? lastUserMsg.content : "";
  const lower = content.toLowerCase().trim();
  const yesNoPatterns = ["האם", "כן או לא", "אפשר", "נכון ש", "is it", "can i", "should i", "do you"];
  return content.length < 100 && yesNoPatterns.some(p => lower.startsWith(p));
}

const kimiStreamCircuitBreaker = new CircuitBreaker(
  5,
  60_000,
  2,
  (from, to) => console.log(`[Kimi CircuitBreaker] ${from} → ${to}`)
);

router.get("/kimi/agents", async (req, res) => {
  try {
    const { category, search, active } = req.query;
    const conditions = [];
    if (active !== "false") conditions.push(eq(kimiAgentsTable.isActive, true));
    if (category && typeof category === "string") conditions.push(eq(kimiAgentsTable.category, category));
    if (search && typeof search === "string") {
      conditions.push(
        sql`(${kimiAgentsTable.name} ILIKE ${'%' + search + '%'} OR ${kimiAgentsTable.description} ILIKE ${'%' + search + '%'})`
      );
    }

    const agents = await db
      .select()
      .from(kimiAgentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(kimiAgentsTable.sortOrder);

    const categories = await db
      .selectDistinct({ category: kimiAgentsTable.category })
      .from(kimiAgentsTable)
      .where(eq(kimiAgentsTable.isActive, true));

    res.json({
      agents,
      categories: categories.map((c) => c.category),
      total: agents.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "שגיאה בטעינת סוכנים" });
  }
});

router.get("/kimi/agents/:id", async (req, res) => {
  try {
    const agent = await db
      .select()
      .from(kimiAgentsTable)
      .where(eq(kimiAgentsTable.id, parseInt(String(req.params.id))))
      .limit(1);

    if (agent.length === 0) {
      res.status(404).json({ error: "סוכן לא נמצא" });
      return;
    }
    res.json(agent[0]);
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.get("/kimi/conversations", async (req, res) => {
  try {
    const { agentId } = req.query;
    const userId = req.userId || "";
    const conditions = [
      eq(kimiConversationsTable.status, "active"),
      eq(kimiConversationsTable.userId, userId),
    ];
    if (agentId) conditions.push(eq(kimiConversationsTable.agentId, parseInt(agentId as string)));

    const conversations = await db
      .select()
      .from(kimiConversationsTable)
      .where(and(...conditions))
      .orderBy(desc(kimiConversationsTable.updatedAt))
      .limit(50);

    res.json({ conversations });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.get("/kimi/conversations/:id/messages", async (req, res) => {
  try {
    const userId = req.userId || "";
    const convId = parseInt(String(req.params.id));
    const [conv] = await db.select().from(kimiConversationsTable)
      .where(and(eq(kimiConversationsTable.id, convId), eq(kimiConversationsTable.userId, userId)))
      .limit(1);
    if (!conv) {
      res.status(404).json({ error: "שיחה לא נמצאה" });
      return;
    }

    const messages = await db
      .select()
      .from(kimiMessagesTable)
      .where(eq(kimiMessagesTable.conversationId, convId))
      .orderBy(kimiMessagesTable.createdAt);

    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.delete("/kimi/conversations/:id", async (req, res) => {
  try {
    const userId = req.userId || "";
    const convId = parseInt(String(req.params.id));
    await db
      .update(kimiConversationsTable)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(and(eq(kimiConversationsTable.id, convId), eq(kimiConversationsTable.userId, userId)));

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.post("/kimi/conversations", async (req, res) => {
  try {
    const { agentId, title, model = "kimi-k2.5" } = req.body;
    const userId = req.userId || "";
    const [conv] = await db
      .insert(kimiConversationsTable)
      .values({
        userId,
        agentId: agentId || null,
        title: title || "שיחה חדשה",
        model,
      })
      .returning();

    res.json(conv);
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.post("/kimi/chat/stream", async (req, res) => {
  const config = getAIConfig();
  if (!config.apiKey) {
    res.status(503).json({ error: "ספק AI לא מוגדר" });
    return;
  }

  const { messages, model = "kimi-k2.5", agentId, conversationId, systemPrompt, images, responseMode = "concise" } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  const fullMessages: Array<{ role: string; content: any }> = [];

  fullMessages.push({ role: "system", content: ERP_SYSTEM_KNOWLEDGE });

  let agentPrompt = "";
  if (systemPrompt) {
    agentPrompt = systemPrompt;
  } else if (agentId) {
    try {
      const agent = await db
        .select()
        .from(kimiAgentsTable)
        .where(eq(kimiAgentsTable.id, agentId))
        .limit(1);
      if (agent.length > 0) {
        agentPrompt = agent[0].systemPrompt;
      }
    } catch {}
  }
  const modeInstruction = responseMode === "detailed"
    ? "\n\n[responseMode=detailed] — ענה בצורה מפורטת ומלאה עם הסברים, דוגמאות וקונטקסט."
    : "\n\n[responseMode=concise] — ענה ב-5-8 שורות עם הסבר קצר. חייב לכלול: מה, למה, וקוד/תוצאה. לא רק קוד יבש — תמיד הסבר משפט אחד.";
  fullMessages.push({ role: "system", content: KIMI_SYSTEM_BASE + modeInstruction + (agentPrompt ? `\n\n${agentPrompt}` : "") });

  if (images && Array.isArray(images) && images.length > 0) {
    console.log(`[Kimi] Vision request: ${images.length} image(s), sizes: ${images.map((i: string) => Math.round(i.length / 1024) + "KB").join(", ")}`);
    fullMessages.push(...messages);
  } else {
    fullMessages.push(...messages);
  }

  const startTime = Date.now();
  const hasVisionContent = images && Array.isArray(images) && images.length > 0;
  const resolvedModel = resolveKimiModel(model);
  const isComplex = isComplexQuestion(messages);
  const isYesNo = isYesNoQuestion(messages);
  const baseTimeout = isComplex ? 240_000 : 180_000;
  const visionTimeout = 120_000;

  if (hasVisionContent) {
    console.log(`[Kimi] Vision mode: using chat/completions with image content for ${images.length} image(s)`);
    try {
      const visionMessages: any[] = [];
      for (const msg of fullMessages) {
        if (msg.role === "user") {
          const contentParts: any[] = [{ type: "text", text: msg.content }];
          visionMessages.push({ role: msg.role, content: contentParts });
        } else {
          visionMessages.push(msg);
        }
      }
      const lastUserIdx = visionMessages.findLastIndex((m: any) => m.role === "user");
      if (lastUserIdx >= 0) {
        const imageContent: any[] = [];
        for (const img of images.slice(0, 5)) {
          if (typeof img === "string" && img.startsWith("data:image/")) {
            imageContent.push({ type: "image_url", image_url: { url: img } });
          } else if (typeof img === "string" && img.startsWith("http")) {
            imageContent.push({ type: "image_url", image_url: { url: img } });
          }
        }
        if (Array.isArray(visionMessages[lastUserIdx].content)) {
          visionMessages[lastUserIdx].content.push(...imageContent);
        }
      }
      console.log(`[Kimi] Vision: sending ${images.length} inline image(s) via chat/completions`);
      const visionResponse = await fetchWithRetry(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: resolvedModel, messages: visionMessages, temperature: getKimiTemperature(resolvedModel), max_tokens: 16384, stream: true }),
        signal: AbortSignal.timeout(visionTimeout),
      });
      if (!visionResponse.ok) {
        const errText = await visionResponse.text();
        console.error(`[Kimi] Vision API error: ${visionResponse.status} ${errText.slice(0, 300)}`);
        res.status(502).json({ error: `שגיאת ניתוח תמונה: ${errText.slice(0, 200)}` });
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const vReader = visionResponse.body?.getReader();
      if (!vReader) { res.status(502).json({ error: "No response body" }); return; }
      const vDecoder = new TextDecoder();
      let vBuf = "";
      while (true) {
        const { done, value } = await vReader.read();
        if (done) break;
        vBuf += vDecoder.decode(value, { stream: true });
        const lines = vBuf.split("\n");
        vBuf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") { res.write("data: [DONE]\n\n"); continue; }
            try {
              const j = JSON.parse(data);
              if (j.choices?.[0]?.delta?.content) {
                res.write(`data: ${JSON.stringify({ content: j.choices[0].delta.content })}\n\n`);
              }
            } catch {}
          }
        }
      }
      res.end();
      console.log(`[Kimi] Vision completed in ${Date.now() - startTime}ms`);
      return;
    } catch (e: any) {
      console.error(`[Kimi] Vision request failed:`, e.message);
      res.status(502).json({ error: `שגיאת ניתוח תמונה: ${e.message}` });
      return;
    }
  }

  if (!kimiStreamCircuitBreaker.isAvailable()) {
    console.warn(`[Kimi] Circuit breaker OPEN — rejecting request`);
    res.status(503).json({ error: "שרת AI לא זמין זמנית — circuit breaker פתוח. נסה שוב בעוד דקה." });
    return;
  }

  const makeStreamRequest = async () => {
    const response = await fetchWithRetry(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: fullMessages,
        temperature: getKimiTemperature(resolvedModel),
        max_tokens: 16384,
        stream: true,
      }),
      signal: AbortSignal.timeout(baseTimeout),
    });
    if (response.status >= 500 || response.status === 429) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Kimi API ${response.status}: ${errText.slice(0, 200)}`);
    }
    return response;
  };

  try {
    const response = await kimiStreamCircuitBreaker.call(makeStreamRequest);

    if (!response.ok) {
      const text = await response.text();
      const status = response.status;
      const hebrewError = status === 429
        ? "שרת AI עמוס — נסה שוב בעוד כמה שניות"
        : status === 401
        ? "מפתח API לא תקין — בדוק KIMI_API_KEY"
        : status >= 500
        ? "שרת AI לא זמין כרגע — נסה שוב"
        : `שגיאת AI (${status})`;
      console.error(`[Kimi] API error ${status}: ${text.slice(0, 300)}`);
      res.status(502).json({ error: hebrewError });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: "No response body" });
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let finishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          const responseTimeMs = Date.now() - startTime;
          const isTruncated = finishReason && finishReason !== "stop";
          const isTooShort = !isYesNo && fullContent.length < 300 && isComplex;

          console.log(`[Kimi] Stream done — ${fullContent.length} chars, finish_reason=${finishReason || "n/a"}, time=${responseTimeMs}ms, model=${resolvedModel}, complex=${isComplex}, truncated=${isTruncated}`);

          if (isTruncated) {
            console.warn(`[Kimi] Response truncated (finish_reason=${finishReason}) — ${fullContent.length} chars, model=${resolvedModel}. Signaling client retry.`);
            res.write(`data: ${JSON.stringify({ retryRecommended: "truncated", reason: `finish_reason=${finishReason}` })}\n\n`);
          }
          if (isTooShort) {
            console.warn(`[Kimi] Response too short for complex question — ${fullContent.length} chars, model=${resolvedModel}. Signaling client retry.`);
            res.write(`data: ${JSON.stringify({ retryRecommended: "too_short", reinforcedPrompt: "התשובה הקצרה שנתת לא מספיקה לשאלה מורכבת. אנא הרחב את תשובתך עם הסבר מפורט, דוגמאות, וצעדים ברורים. לפחות 10-15 שורות." })}\n\n`);
          }

          if (conversationId) {
            try {
              const userMsg = messages[messages.length - 1];
              const userContent = typeof userMsg.content === "string" ? userMsg.content : JSON.stringify(userMsg.content);
              await db.insert(kimiMessagesTable).values([
                { conversationId, role: "user", content: userContent, model },
                { conversationId, role: "assistant", content: fullContent, model, responseTimeMs },
              ]);
              await db
                .update(kimiConversationsTable)
                .set({
                  totalMessages: sql`${kimiConversationsTable.totalMessages} + 2`,
                  updatedAt: new Date(),
                })
                .where(eq(kimiConversationsTable.id, conversationId));
            } catch {}
          }

          res.write(`data: ${JSON.stringify({ done: true, fullContent, responseTimeMs, finishReason: finishReason || "stop", truncated: isTruncated || undefined })}\n\n`);
          res.end();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch {}
      }
    }

    const responseTimeMs = Date.now() - startTime;
    console.log(`[Kimi] Stream ended without [DONE] — ${fullContent.length} chars, time=${responseTimeMs}ms`);
    res.write(`data: ${JSON.stringify({ done: true, fullContent, responseTimeMs })}\n\n`);
    res.end();
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: error?.message || "שגיאה בתקשורת עם AI" });
    } else {
      res.write(`data: ${JSON.stringify({ error: error?.message })}\n\n`);
      res.end();
    }
  }
});

const swarmSessions = new Map<string, {
  id: string;
  status: "running" | "completed" | "failed";
  agents: Array<{
    id: string;
    task: string;
    agentName: string;
    status: "pending" | "running" | "completed" | "failed";
    loops: number;
    messages: Array<{ role: string; content: string }>;
    actionResults: Array<{ actionType: string; success: boolean; result?: any; error?: string; durationMs?: number }>;
    finalSummary: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }>;
  createdAt: string;
  completedAt?: string;
}>();

router.post("/kimi/swarm/execute", async (req, res) => {
  const { tasks, model = "kimi-k2.5", maxLoops: rawMaxLoops = 10 } = req.body;
  const maxLoops = Math.max(1, Math.min(10, Number(rawMaxLoops) || 10));
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: "tasks[] נדרש — רשימת משימות לסוכנים" });
    return;
  }
  const userId = (req as any).userId || (req as any).user?.id || "unknown";

  const config = getAIConfig();
  if (!config.apiKey) {
    res.status(503).json({ error: "ספק AI לא מוגדר" });
    return;
  }

  const sessionId = `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session: any = {
    id: sessionId,
    userId,
    status: "running",
    agents: tasks.map((t: any, i: number) => ({
      id: `agent-${i}`,
      task: t.task || t,
      agentName: t.agentName || `סוכן ${i + 1}`,
      status: "pending" as const,
      loops: 0,
      messages: [],
      actionResults: [],
      finalSummary: "",
    })),
    createdAt: new Date().toISOString(),
  };
  swarmSessions.set(sessionId, session);
  if (swarmSessions.size > 20) {
    for (const [key, val] of swarmSessions) {
      if (val.status !== "running") { swarmSessions.delete(key); break; }
    }
  }

  res.json({ sessionId, agentCount: tasks.length, status: "running" });

  const token = req.headers.authorization;
  const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;
  const resolvedModel = resolveKimiModel(model);

  const runAgent = async (agentIdx: number) => {
    const agent = session.agents[agentIdx];
    agent.status = "running";
    agent.startedAt = new Date().toISOString();

    try {
      let contextNote = "";
      try {
        const ctxR = await fetch(`${baseUrl}/kimi/dev/context-snapshot`, {
          headers: { ...(token ? { Authorization: token } : {}) },
          signal: AbortSignal.timeout(5000),
        });
        const ctxD = await ctxR.json();
        if (ctxD.context) contextNote = ctxD.context;
      } catch {}

      const loopMsgs: Array<{ role: string; content: string }> = [
        { role: "user", content: contextNote ? `[הקשר מערכת: ${contextNote}]\n\n${agent.task}` : agent.task },
      ];
      agent.messages = [...loopMsgs];

      for (let loop = 0; loop < maxLoops; loop++) {
        agent.loops = loop + 1;

        const aiResponse = await fetchWithRetry(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model: resolvedModel,
            messages: [
              { role: "system", content: ERP_SYSTEM_KNOWLEDGE },
              { role: "system", content: KIMI_SYSTEM_BASE },
              ...loopMsgs,
            ],
            temperature: getKimiTemperature(resolvedModel),
            max_tokens: 16384,
            stream: false,
          }),
          signal: AbortSignal.timeout(90000),
        });

        let fullContent = "";
        if (!aiResponse.ok) {
          throw new Error(`AI API error: ${aiResponse.status}`);
        } else {
          const aiData = await aiResponse.json();
          fullContent = aiData.choices?.[0]?.message?.content || "";
        }

        loopMsgs.push({ role: "assistant", content: fullContent });
        agent.messages.push({ role: "assistant", content: fullContent });

        const actionBlockRegex = /```kimi-action\s*\n([\s\S]*?)```/g;
        const blocks: Array<{ actionType: string; params: any }> = [];
        let match;
        while ((match = actionBlockRegex.exec(fullContent)) !== null) {
          try { blocks.push(JSON.parse(match[1].trim())); } catch {}
        }

        if (blocks.length === 0) {
          agent.finalSummary = fullContent;
          break;
        }

        const loopResults: string[] = [];
        for (const block of blocks) {
          try {
            const execResp = await fetch(`${baseUrl}/kimi/dev/execute-action`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
              body: JSON.stringify(block),
              signal: AbortSignal.timeout(45000),
            });
            const execData = await execResp.json();
            agent.actionResults.push({
              actionType: block.actionType,
              success: execData.success,
              result: execData.result,
              error: execData.error,
              durationMs: execData.durationMs,
            });
            const preview = execData.success
              ? JSON.stringify(execData.result).slice(0, 600)
              : execData.error;
            loopResults.push(`${execData.success ? "✅" : "❌"} ${block.actionType}: ${preview}`);
          } catch (e: any) {
            agent.actionResults.push({ actionType: block.actionType, success: false, error: e.message });
            loopResults.push(`❌ ${block.actionType}: ${e.message}`);
          }
        }

        const feedbackMsg = `[תוצאות ביצוע אוטומטי — סבב ${loop + 1}/${maxLoops}]\n${loopResults.join("\n")}\n\nהמשך לבצע את המשימה אם יש עוד שלבים. אם סיימת — כתוב סיכום סופי ללא בלוקי kimi-action.`;
        loopMsgs.push({ role: "user", content: feedbackMsg });
        agent.messages.push({ role: "user", content: feedbackMsg });
      }

      agent.status = "completed";
      agent.completedAt = new Date().toISOString();
    } catch (e: any) {
      agent.status = "failed";
      agent.error = e.message;
      agent.completedAt = new Date().toISOString();
    }
  };

  Promise.all(session.agents.map((_: any, i: number) => runAgent(i))).then(() => {
    const hasFailed = session.agents.some((a: any) => a.status === "failed");
    session.status = hasFailed ? "failed" : "completed";
    session.completedAt = new Date().toISOString();
    for (const agent of session.agents) {
      if (agent.messages) agent.messages = agent.messages.slice(-6);
      for (const ar of agent.actionResults) {
        if (ar.result && JSON.stringify(ar.result).length > 2000) {
          ar.result = { truncated: true, preview: JSON.stringify(ar.result).slice(0, 500) };
        }
      }
    }
  });
});

router.get("/kimi/swarm/:sessionId", async (req, res) => {
  const session = swarmSessions.get(String(req.params.sessionId));
  if (!session) { res.status(404).json({ error: "סשן לא נמצא" }); return; }
  const reqUserId = (req as any).userId || (req as any).user?.id || "unknown";
  if (session.userId && session.userId !== reqUserId && reqUserId !== "unknown") {
    res.status(403).json({ error: "אין גישה לסשן זה" }); return;
  }
  res.json({
    ...session,
    userId: undefined,
    agents: session.agents.map((a: any) => ({
      ...a,
      messages: undefined,
      actionCount: a.actionResults.length,
      successCount: a.actionResults.filter((r: any) => r.success).length,
    })),
  });
});

router.get("/kimi/swarm/:sessionId/full", async (req, res) => {
  const session = swarmSessions.get(String(req.params.sessionId));
  if (!session) { res.status(404).json({ error: "סשן לא נמצא" }); return; }
  const reqUserId = (req as any).userId || (req as any).user?.id || "unknown";
  if (session.userId && session.userId !== reqUserId && reqUserId !== "unknown") {
    res.status(403).json({ error: "אין גישה לסשן זה" }); return;
  }
  res.json({ ...session, userId: undefined });
});

export default router;
