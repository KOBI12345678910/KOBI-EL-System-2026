# ספציפיקציה מלאה — מערכת ERP "טכנו-כל עוזי"
# Full System Specification — Techno-Kol Uzi ERP

---

## סקירה כללית | System Overview

| מדד | ערך |
|---|---|
| שם המערכת | טכנו-כל עוזי — Techno-Kol Uzi ERP 2026 |
| תיאור | מערכת ERP מלאה למפעל מתכת/אלומיניום/נירוסטה/זכוכית — 200 עובדים |
| טכנולוגיה — Frontend | React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| טכנולוגיה — Backend | Express 5 + TypeScript |
| בסיס נתונים | PostgreSQL + Drizzle ORM |
| AI Agent | קובי-AI (Claude claude-sonnet-4-20250514) |
| ממשק משתמש | עברית RTL, ערכת נושא כהה (Dark Theme) |
| מודולים | 33 קטגוריות |
| טבלאות בסיס נתונים | 425 |
| שדות (עמודות) | 13423 |
| נתיבי ממשק (Routes) | 576 |
| קישורים (Constraints) | 664 |
| נקודות API | 2,421+ |
| פריטי תפריט | 624 |
| מטבע | שקלים (אגורות — Agorot) |
| מע״מ | 18% |

---

## ארכיטקטורת המערכת | System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React/Vite)                  │
│  Port 23023 │ RTL │ Dark Theme │ Hebrew UI │ Tailwind CSS  │
├─────────────────────────────────────────────────────────────┤
│                     API Server (Express 5)                 │
│  Port 8080 │ REST API │ JWT Auth │ 2,421+ Endpoints        │
├─────────────────────────────────────────────────────────────┤
│                     PostgreSQL Database                    │
│  425 Tables │ 13,423 Columns │ Auto-backup every hour      │
├─────────────────────────────────────────────────────────────┤
│                     קובי-AI (Claude Agent)                 │
│  Autonomous ERP agent │ 50+ tools │ claude-sonnet-4-20250514       │
└─────────────────────────────────────────────────────────────┘
```

## חלוקת מודולים | Module Sections (29 Sections)

| # | מודול | תיאור |
|---|---|---|
| 1 | ראשי | דשבורד ראשי, KPI, התראות |
| 2 | שולחן שליטה מנהלי | בריאות חברה, סיכונים, צווארי בקבוק, יעילות |
| 3 | לקוחות ומכירות | CRM, הצעות מחיר, הזמנות, חשבוניות, תעודות משלוח |
| 4 | רכש ושרשרת אספקה | הזמנות רכש, קבלות, ספקים, יבוא |
| 5 | מלאי ולוגיסטיקה | מחסנים, מלאי חומרי גלם, מוצרים מוגמרים, ספירות |
| 6 | ייצור | הזמנות עבודה, קנבאן, גאנט, בקרת איכות, תחזוקה |
| 7 | כספים | חשבונות, יומנים, מאזן, רווח/הפסד, תזרים, תקציבים |
| 8 | משאבי אנוש | עובדים, שכר, נוכחות, חופשות, הכשרות, גיוס |
| 9 | ניהול פרויקטים | פרויקטים, אבני דרך, סיכונים, משאבים, ניתוחי רווחיות |
| 10 | מסמכים וחוזים | ארכיון דיגיטלי, תבניות, חתימות דיגיטליות |
| 11 | שיווק | קמפיינים, דיוור, ניתוח מתחרים, לוח תוכן |
| 12 | תקשורת ושיתוף | צאט פנימי, יומן, פגישות, משימות |
| 13 | מנוע AI | זיהוי אנומליות, ניתוח ייצור, עוזר מכירות, קובי-AI |
| 14 | ניהול איכות | בדיקות, NCR, פעולות מתקנות, ISO |
| 15 | לוגיסטיקה והובלות | מעקב משלוחים, הובלות, לוגיסטיקה הפוכה |
| 16 | בטיחות וסביבה | תאונות, נהלים, הדרכות, ציוד מגן, היתרים |
| 17 | ניהול נכסים | דשבורד נכסים, כלים, ליסינג, ביטוח |
| 18 | ניהול ידע | בסיס ידע, SOP, הדרכות, מדריכים |
| 19 | ניהול חוזים | חוזים, חידושים, מעקב |
| 20 | שירות לקוחות | פניות, SLA, מוקד שירות |
| 21 | תפעול מפעל | לוח תפעול, קווי ייצור, יעילות |
| 22 | ניהול ספקים מתקדם | דירוג ספקים, ביצועים, סיכונים |
| 23 | BI ומודיעין עסקי | דשבורדים, חוקר נתונים, דוחות מתוזמנים |
| 24 | ניהול מכרזים | מכרזים, ניתוח הצעות |
| 25 | דוחות | דוחות כספיים, גיול, מע״מ, פיסקלי |
| 26 | אסטרטגיה | תוכנית עסקית, SWOT, BSC |
| 27 | הגדרות מערכת | משתמשים, הרשאות, גיבויים, מודלים |
| 28 | תמחור | מחירונים, מחשבון עלויות, תמחור דינמי |
| 29 | פבריקציה | פרופילים, זכוכית, חיתוך, ריתוך, ציפוי, הרכבה |

---

## מפרט מלא של בסיס הנתונים | Complete Database Schema

> 425 טבלאות, 13,423 שדות, 664 אילוצים

---

### אוטומציה ובקרה (Automation & Control) (18 טבלאות)

#### 1. `action_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('action_definitions_id_seq'::... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | action_type | text | N | - |  |
| 6 | handler_type | text | N | - |  |
| 7 | icon | text | Y | - |  |
| 8 | color | text | Y | - |  |
| 9 | conditions | jsonb | Y | '{}'::jsonb |  |
| 10 | handler_config | jsonb | Y | '{}'::jsonb |  |
| 11 | sort_order | integer | N | 0 |  |
| 12 | is_active | boolean | N | true |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | action_code | character varying | Y | - |  |
| 15 | action_name | character varying | Y | - |  |
| 16 | entity_type | character varying | Y | - |  |
| 17 | handler | text | Y | - |  |
| 18 | required_role | character varying | Y | - |  |
| 19 | tags | text | Y | - |  |

#### 2. `alerts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('alerts_id_seq'::regclass) | 🔑 PK |
| 2 | user_id | integer | Y | - |  |
| 3 | alert_type | text | Y | 'info'::text |  |
| 4 | category | text | Y | - |  |
| 5 | title | text | Y | - |  |
| 6 | message | text | Y | - |  |
| 7 | source_entity | text | Y | - |  |
| 8 | source_id | integer | Y | - |  |
| 9 | is_read | boolean | Y | false |  |
| 10 | is_dismissed | boolean | Y | false |  |
| 11 | action_url | text | Y | - |  |
| 12 | priority | integer | Y | 3 |  |
| 13 | expires_at | timestamp without time zone | Y | - |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |

#### 3. `approval_requests`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('approval_requests_id_seq'::r... | 🔑 PK |
| 2 | request_type | character varying | Y | - |  |
| 3 | entity_type | character varying | Y | - |  |
| 4 | entity_id | integer | Y | - |  |
| 5 | title | character varying | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | requested_by | integer | Y | - |  |
| 8 | assigned_to | integer | Y | - |  |
| 9 | status | character varying | Y | 'pending'::character varying |  |
| 10 | priority | character varying | Y | 'normal'::character varying |  |
| 11 | decided_at | timestamp without time zone | Y | - |  |
| 12 | decision_notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |
| 15 | request_number | character varying | Y | - |  |
| 16 | entity_ref | character varying | Y | - |  |
| 17 | entity_name | character varying | Y | - |  |
| 18 | requested_at | timestamp with time zone | Y | now() |  |
| 19 | approver_id | integer | Y | - |  |
| 20 | approver_name | character varying | Y | - |  |
| 21 | approval_level | integer | Y | 1 |  |
| 22 | amount | numeric | Y | - |  |
| 23 | decision | character varying | Y | - |  |
| 24 | decision_date | timestamp with time zone | Y | - |  |
| 25 | escalated | boolean | Y | false |  |
| 26 | escalated_to | character varying | Y | - |  |
| 27 | deadline | date | Y | - |  |
| 28 | tags | text | Y | - |  |

#### 4. `approval_workflows`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('approval_workflows_id_seq'::... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | entity_type | character varying | Y | - |  |
| 4 | conditions | jsonb | Y | '{}'::jsonb |  |
| 5 | steps | jsonb | Y | '[]'::jsonb |  |
| 6 | is_active | boolean | Y | true |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |
| 8 | updated_at | timestamp without time zone | Y | now() |  |

#### 5. `audit_controls`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('audit_controls_id_seq'::regc... | 🔑 PK |
| 2 | control_number | text | N | - |  |
| 3 | control_date | date | N | CURRENT_DATE |  |
| 4 | control_type | text | Y | 'balance_check'::text |  |
| 5 | account_number | text | Y | - |  |
| 6 | account_name | text | Y | - |  |
| 7 | expected_balance | numeric | Y | 0 |  |
| 8 | actual_balance | numeric | Y | 0 |  |
| 9 | variance | numeric | Y | 0 |  |
| 10 | status | text | Y | 'open'::text |  |
| 11 | severity | text | Y | 'low'::text |  |
| 12 | assigned_to | text | Y | - |  |
| 13 | resolved_date | date | Y | - |  |
| 14 | resolution_notes | text | Y | - |  |
| 15 | notes | text | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |
| 18 | control_name | character varying | Y | - |  |
| 19 | category | character varying | Y | - |  |
| 20 | department | character varying | Y | - |  |
| 21 | description | text | Y | - |  |
| 22 | risk_level | character varying | Y | - |  |
| 23 | frequency | character varying | Y | - |  |
| 24 | last_audit_date | date | Y | - |  |
| 25 | next_audit_date | date | Y | - |  |
| 26 | auditor | character varying | Y | - |  |
| 27 | finding | text | Y | - |  |
| 28 | corrective_action | text | Y | - |  |
| 29 | compliance_status | character varying | Y | - |  |
| 30 | is_active | boolean | Y | true |  |
| 31 | tags | text | Y | - |  |

#### 6. `audit_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('audit_log_id_seq'::regclass) | 🔑 PK |
| 2 | table_name | character varying | N | - |  |
| 3 | record_id | integer | Y | - |  |
| 4 | action | character varying | N | - |  |
| 5 | user_id | integer | Y | - |  |
| 6 | user_name | character varying | Y | - |  |
| 7 | old_values | jsonb | Y | - |  |
| 8 | new_values | jsonb | Y | - |  |
| 9 | changed_fields | ARRAY | Y | - |  |
| 10 | ip_address | character varying | Y | - |  |
| 11 | user_agent | text | Y | - |  |
| 12 | module | character varying | Y | - |  |
| 13 | description | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | action_type | character varying | Y | - |  |
| 16 | entity_type | character varying | Y | - |  |
| 17 | entity_id | integer | Y | - |  |
| 18 | entity_ref | character varying | Y | - |  |
| 19 | field_name | character varying | Y | - |  |
| 20 | old_value | text | Y | - |  |
| 21 | new_value | text | Y | - |  |
| 22 | timestamp | timestamp with time zone | Y | now() |  |
| 23 | tags | text | Y | - |  |

#### 7. `audit_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('audit_logs_id_seq'::regclass) | 🔑 PK |
| 2 | action | character varying | N | - |  |
| 3 | entity_type | character varying | Y | - |  |
| 4 | entity_id | character varying | Y | - |  |
| 5 | user_id | integer | Y | - |  |
| 6 | user_name | character varying | Y | - |  |
| 7 | details | jsonb | Y | '{}'::jsonb |  |
| 8 | ip_address | character varying | Y | - |  |
| 9 | created_at | timestamp with time zone | Y | now() |  |
| 10 | action_type | character varying | Y | - |  |
| 11 | entity_ref | character varying | Y | - |  |
| 12 | description | text | Y | - |  |
| 13 | tags | text | Y | - |  |

#### 8. `automation_execution_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('automation_execution_logs_id... | 🔑 PK |
| 2 | automation_id | integer | N | - |  |
| 3 | trigger_event | text | N | - |  |
| 4 | trigger_record_id | integer | Y | - |  |
| 5 | status | text | N | 'running'::text |  |
| 6 | steps_executed | jsonb | N | '[]'::jsonb |  |
| 7 | result | jsonb | Y | '{}'::jsonb |  |
| 8 | error_message | text | Y | - |  |
| 9 | started_at | timestamp without time zone | N | now() |  |
| 10 | completed_at | timestamp without time zone | Y | - |  |
| 11 | workflow_id | integer | Y | - |  |
| 12 | execution_type | text | N | 'automation'::text |  |
| 13 | entity_id | integer | Y | - |  |
| 14 | automation_name | character varying | Y | - |  |
| 15 | trigger_type | character varying | Y | - |  |
| 16 | entity_type | character varying | Y | - |  |
| 17 | input_data | text | Y | - |  |
| 18 | output_data | text | Y | - |  |
| 19 | success | boolean | Y | true |  |
| 20 | duration_ms | integer | Y | - |  |
| 21 | tags | text | Y | - |  |

#### 9. `automation_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('automation_log_id_seq'::regc... | 🔑 PK |
| 2 | flow_id | text | Y | - |  |
| 3 | flow_name | text | Y | - |  |
| 4 | affected | text | Y | - |  |
| 5 | status | text | Y | 'success'::text |  |
| 6 | details | jsonb | Y | - |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |
| 8 | automation_name | character varying | Y | - |  |
| 9 | automation_type | character varying | Y | - |  |
| 10 | trigger_event | character varying | Y | - |  |
| 11 | entity_type | character varying | Y | - |  |
| 12 | entity_id | integer | Y | - |  |
| 13 | action_taken | text | Y | - |  |
| 14 | execution_time | timestamp with time zone | Y | now() |  |
| 15 | success | boolean | Y | true |  |
| 16 | error_message | text | Y | - |  |
| 17 | duration_ms | integer | Y | - |  |
| 18 | tags | text | Y | - |  |

#### 10. `notification_delivery_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('notification_delivery_log_id... | 🔑 PK |
| 2 | notification_id | integer | Y | - |  |
| 3 | channel | text | N | - |  |
| 4 | status | text | N | 'pending'::text |  |
| 5 | recipient_user_id | integer | Y | - |  |
| 6 | recipient_email | text | Y | - |  |
| 7 | recipient_phone | text | Y | - |  |
| 8 | error_message | text | Y | - |  |
| 9 | sent_at | timestamp without time zone | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | metadata | jsonb | Y | - |  |
| 12 | recipient | character varying | Y | - |  |
| 13 | delivery_status | character varying | Y | - |  |
| 14 | delivered_at | timestamp with time zone | Y | - |  |
| 15 | retry_count | integer | Y | 0 |  |
| 16 | external_id | character varying | Y | - |  |
| 17 | tags | text | Y | - |  |

#### 11. `notification_preferences`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('notification_preferences_id_... | 🔑 PK |
| 2 | user_id | integer | N | - |  |
| 3 | category | text | N | - |  |
| 4 | enabled | boolean | N | true |  |
| 5 | min_priority | text | N | 'low'::text |  |
| 6 | created_at | timestamp without time zone | N | now() |  |
| 7 | updated_at | timestamp without time zone | N | now() |  |
| 8 | notification_type | character varying | Y | - |  |
| 9 | channel | character varying | Y | - |  |
| 10 | frequency | character varying | Y | 'immediate'::character varying |  |
| 11 | quiet_hours_start | time without time zone | Y | - |  |
| 12 | quiet_hours_end | time without time zone | Y | - |  |
| 13 | email_address | character varying | Y | - |  |
| 14 | phone_number | character varying | Y | - |  |
| 15 | tags | text | Y | - |  |

#### 12. `notification_routing_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('notification_routing_rules_i... | 🔑 PK |
| 2 | notification_type | text | N | '*'::text |  |
| 3 | category | text | N | 'system'::text |  |
| 4 | role_name | text | Y | - |  |
| 5 | user_id | integer | Y | - |  |
| 6 | channel_in_app | boolean | N | true |  |
| 7 | channel_email | boolean | N | false |  |
| 8 | channel_whatsapp | boolean | N | false |  |
| 9 | min_priority_in_app | text | N | 'low'::text |  |
| 10 | min_priority_email | text | N | 'high'::text |  |
| 11 | min_priority_whatsapp | text | N | 'critical'::text |  |
| 12 | is_active | boolean | N | true |  |
| 13 | description | text | Y | - |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |
| 16 | rule_name | character varying | Y | - |  |
| 17 | event_type | character varying | Y | - |  |
| 18 | entity_type | character varying | Y | - |  |
| 19 | condition | text | Y | - |  |
| 20 | recipients | text | Y | - |  |
| 21 | role_ids | text | Y | - |  |
| 22 | department | character varying | Y | - |  |
| 23 | channel | character varying | Y | - |  |
| 24 | template_id | integer | Y | - |  |
| 25 | priority | integer | Y | 0 |  |
| 26 | notes | text | Y | - |  |
| 27 | tags | text | Y | - |  |
| 28 | channel_slack | boolean | N | false |  |
| 29 | min_priority_slack | text | N | 'high'::text |  |
| 30 | channel_sms | boolean | N | false |  |
| 31 | channel_telegram | boolean | N | false |  |
| 32 | min_priority_sms | text | N | 'high'::text |  |
| 33 | min_priority_telegram | text | N | 'normal'::text |  |
| 34 | quiet_hours_enabled | boolean | N | false |  |
| 35 | quiet_hours_from | text | N | '22:00'::text |  |
| 36 | quiet_hours_to | text | N | '08:00'::text |  |
| 37 | quiet_hours_bypass_priority | text | N | 'critical'::text |  |

#### 13. `notifications`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('notifications_id_seq'::regcl... | 🔑 PK |
| 2 | type | text | N | - |  |
| 3 | title | text | N | - |  |
| 4 | message | text | N | - |  |
| 5 | module_id | integer | Y | - |  |
| 6 | record_id | integer | Y | - |  |
| 7 | is_read | boolean | N | false |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | user_id | integer | Y | - |  |
| 10 | priority | text | Y | 'normal'::text |  |
| 11 | category | text | Y | 'general'::text |  |
| 12 | action_url | text | Y | - |  |
| 13 | metadata | jsonb | Y | - |  |
| 14 | archived_at | timestamp without time zone | Y | - |  |
| 15 | notification_type | character varying | Y | - |  |
| 16 | severity | character varying | Y | 'info'::character varying |  |
| 17 | user_name | character varying | Y | - |  |
| 18 | entity_type | character varying | Y | - |  |
| 19 | entity_id | integer | Y | - |  |
| 20 | entity_ref | character varying | Y | - |  |
| 21 | read_status | boolean | Y | false |  |
| 22 | read_at | timestamp with time zone | Y | - |  |
| 23 | sent_method | character varying | Y | - |  |
| 24 | expires_at | timestamp with time zone | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 14. `platform_automations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_automations_id_seq'... | 🔑 PK |
| 2 | module_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | trigger_type | text | N | 'on_create'::text |  |
| 7 | trigger_entity_id | integer | Y | - |  |
| 8 | trigger_config | jsonb | N | '{}'::jsonb |  |
| 9 | conditions | jsonb | N | '[]'::jsonb |  |
| 10 | actions | jsonb | N | '[]'::jsonb |  |
| 11 | is_active | boolean | N | true |  |
| 12 | last_run_at | timestamp without time zone | Y | - |  |
| 13 | run_count | integer | N | 0 |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |
| 16 | automation_code | character varying | Y | - |  |
| 17 | automation_name | character varying | Y | - |  |
| 18 | automation_type | character varying | Y | - |  |
| 19 | action_type | character varying | Y | - |  |
| 20 | action_config | text | Y | - |  |
| 21 | schedule | character varying | Y | - |  |
| 22 | last_run | timestamp with time zone | Y | - |  |
| 23 | notes | text | Y | - |  |
| 24 | tags | text | Y | - |  |

#### 15. `platform_workflows`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_workflows_id_seq'::... | 🔑 PK |
| 2 | module_id | integer | N | - | FK → platform_modules.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | trigger_type | text | N | 'on_create'::text |  |
| 7 | trigger_config | jsonb | N | '{}'::jsonb |  |
| 8 | actions | jsonb | N | '[]'::jsonb |  |
| 9 | conditions | jsonb | N | '[]'::jsonb |  |
| 10 | is_active | boolean | N | true |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | workflow_code | character varying | Y | - |  |
| 14 | workflow_name | character varying | Y | - |  |
| 15 | workflow_type | character varying | Y | - |  |
| 16 | entity_type | character varying | Y | - |  |
| 17 | trigger_event | character varying | Y | - |  |
| 18 | notes | text | Y | - |  |
| 19 | tags | text | Y | - |  |

#### 16. `record_audit_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('record_audit_log_id_seq'::re... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | record_id | integer | N | - |  |
| 4 | action | text | N | - |  |
| 5 | changes | jsonb | Y | '{}'::jsonb |  |
| 6 | performed_by | text | Y | - |  |
| 7 | created_at | timestamp without time zone | N | now() |  |
| 8 | entity_type | character varying | Y | - |  |
| 9 | field_name | character varying | Y | - |  |
| 10 | old_value | text | Y | - |  |
| 11 | new_value | text | Y | - |  |
| 12 | user_name | character varying | Y | - |  |
| 13 | timestamp | timestamp with time zone | Y | now() |  |
| 14 | ip_address | character varying | Y | - |  |
| 15 | tags | text | Y | - |  |
| 16 | entity_ref | character varying | Y | - |  |
| 17 | session_id | character varying | Y | - |  |
| 18 | module | character varying | Y | - |  |
| 19 | severity | character varying | Y | - |  |

#### 17. `sla_alert_events`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sla_alert_events_id_seq'::re... | 🔑 PK |
| 2 | rule_id | integer | Y | - | FK → sla_alert_rules.id |
| 3 | rule_name | text | N | - |  |
| 4 | ticket | text | N | ''::text |  |
| 5 | customer | text | N | ''::text |  |
| 6 | message | text | N | - |  |
| 7 | channels | ARRAY | N | '{}'::text[] |  |
| 8 | severity | text | N | 'medium'::text |  |
| 9 | acknowledged | boolean | N | false |  |
| 10 | sent_at | timestamp with time zone | N | now() |  |
| 11 | alert_rule_id | integer | Y | - |  |
| 12 | sla_breach_id | integer | Y | - |  |
| 13 | entity_type | character varying | Y | - |  |
| 14 | entity_id | integer | Y | - |  |
| 15 | alert_type | character varying | Y | - |  |
| 16 | acknowledged_by | character varying | Y | - |  |
| 17 | acknowledged_at | timestamp with time zone | Y | - |  |
| 18 | created_at | timestamp with time zone | Y | now() |  |
| 19 | tags | text | Y | - |  |

#### 18. `sla_alert_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sla_alert_rules_id_seq'::reg... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | condition | text | N | - |  |
| 4 | channels | ARRAY | N | '{}'::text[] |  |
| 5 | recipients | ARRAY | N | '{}'::text[] |  |
| 6 | severity | text | N | 'medium'::text |  |
| 7 | active | boolean | N | true |  |
| 8 | created_at | timestamp with time zone | N | now() |  |
| 9 | updated_at | timestamp with time zone | N | now() |  |
| 10 | rule_name | character varying | Y | - |  |
| 11 | sla_rule_id | integer | Y | - |  |
| 12 | alert_type | character varying | Y | - |  |
| 13 | threshold_hours | numeric | Y | - |  |
| 14 | threshold_pct | numeric | Y | - |  |
| 15 | notification_channel | character varying | Y | - |  |
| 16 | escalation_chain | text | Y | - |  |
| 17 | is_active | boolean | Y | true |  |
| 18 | tags | text | Y | - |  |

---

### בטיחות וסביבה (EHS) (2 טבלאות)

#### 19. `safety_incidents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('safety_incidents_id_seq'::re... | 🔑 PK |
| 2 | incident_number | character varying | N | - | UNIQUE |
| 3 | incident_type | character varying | N | 'near_miss'::character varying |  |
| 4 | incident_date | date | N | CURRENT_DATE |  |
| 5 | incident_time | time without time zone | Y | - |  |
| 6 | title | text | N | - |  |
| 7 | description | text | Y | - |  |
| 8 | severity | character varying | Y | 'minor'::character varying |  |
| 9 | status | character varying | Y | 'reported'::character varying |  |
| 10 | location | character varying | Y | - |  |
| 11 | department | character varying | Y | - |  |
| 12 | reported_by | text | N | - |  |
| 13 | reported_date | date | Y | CURRENT_DATE |  |
| 14 | involved_persons | text | Y | - |  |
| 15 | witnesses | text | Y | - |  |
| 16 | injury_type | character varying | Y | - |  |
| 17 | injury_description | text | Y | - |  |
| 18 | body_part | character varying | Y | - |  |
| 19 | treatment_given | text | Y | - |  |
| 20 | hospitalized | boolean | Y | false |  |
| 21 | lost_work_days | integer | Y | 0 |  |
| 22 | equipment_involved | text | Y | - |  |
| 23 | material_involved | text | Y | - |  |
| 24 | root_cause | text | Y | - |  |
| 25 | immediate_cause | text | Y | - |  |
| 26 | contributing_factors | text | Y | - |  |
| 27 | corrective_action | text | Y | - |  |
| 28 | corrective_action_due | date | Y | - |  |
| 29 | corrective_action_status | character varying | Y | 'pending'::character varying |  |
| 30 | preventive_action | text | Y | - |  |
| 31 | investigation_by | text | Y | - |  |
| 32 | investigation_date | date | Y | - |  |
| 33 | investigation_findings | text | Y | - |  |
| 34 | reported_to_authorities | boolean | Y | false |  |
| 35 | authority_reference | character varying | Y | - |  |
| 36 | insurance_claim | boolean | Y | false |  |
| 37 | claim_number | character varying | Y | - |  |
| 38 | estimated_cost | numeric | Y | 0 |  |
| 39 | photos_url | text | Y | - |  |
| 40 | notes | text | Y | - |  |
| 41 | closed_by | text | Y | - |  |
| 42 | closed_at | timestamp with time zone | Y | - |  |
| 43 | created_at | timestamp with time zone | Y | now() |  |
| 44 | updated_at | timestamp with time zone | Y | now() |  |
| 45 | body_part_affected | character varying | Y | - |  |
| 46 | weather_conditions | character varying | Y | - |  |
| 47 | ppe_worn | boolean | Y | - |  |
| 48 | ppe_details | text | Y | - |  |
| 49 | osha_recordable | boolean | Y | false |  |
| 50 | insurance_claim_number | character varying | Y | - |  |
| 51 | return_to_work_date | date | Y | - |  |
| 52 | employee_id | integer | Y | - |  |
| 53 | employee_name | character varying | Y | - |  |
| 54 | machine_equipment | character varying | Y | - |  |
| 55 | hospital_name | character varying | Y | - |  |
| 56 | hospitalization_days | integer | Y | 0 |  |
| 57 | restricted_work_days | integer | Y | 0 |  |
| 58 | corrective_actions | text | Y | - |  |
| 59 | preventive_actions | text | Y | - |  |
| 60 | regulatory_reported | boolean | Y | false |  |
| 61 | regulatory_report_date | date | Y | - |  |
| 62 | regulatory_report_number | character varying | Y | - |  |
| 63 | insurance_amount | numeric | Y | - |  |
| 64 | investigation_complete | boolean | Y | false |  |
| 65 | investigator | character varying | Y | - |  |
| 66 | documents_url | text | Y | - |  |
| 67 | tags | text | Y | - |  |
| 68 | workstation | character varying | Y | - |  |
| 69 | machine_id | integer | Y | - |  |
| 70 | machine_name | character varying | Y | - |  |
| 71 | shift | character varying | Y | - |  |
| 72 | body_part_injured | character varying | Y | - |  |
| 73 | treatment | character varying | Y | - |  |
| 74 | hospital_visit | boolean | Y | false |  |
| 75 | days_lost | integer | Y | 0 |  |
| 76 | near_miss | boolean | Y | false |  |
| 77 | root_cause_analysis_method | character varying | Y | - |  |
| 78 | corrective_action_done | boolean | Y | false |  |
| 79 | authority_report_number | character varying | Y | - |  |
| 80 | authority_report_date | date | Y | - |  |
| 81 | bituach_leumi_claim | boolean | Y | false |  |
| 82 | bituach_leumi_ref | character varying | Y | - |  |
| 83 | insurance_claim_ref | character varying | Y | - |  |
| 84 | lost_time_incident | boolean | Y | false |  |
| 85 | modified_duty | boolean | Y | false |  |
| 86 | modified_duty_end | date | Y | - |  |
| 87 | safety_committee_reviewed | boolean | Y | false |  |
| 88 | safety_committee_date | date | Y | - |  |
| 89 | recurrence_risk | character varying | Y | - |  |
| 90 | lessons_learned | text | Y | - |  |

#### 20. `safety_procedures`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('safety_procedures_id_seq'::r... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | category | text | Y | - |  |
| 4 | department | text | Y | - |  |
| 5 | version | text | Y | '1.0'::text |  |
| 6 | effective_date | date | Y | - |  |
| 7 | review_date | date | Y | - |  |
| 8 | author | text | Y | - |  |
| 9 | approver | text | Y | - |  |
| 10 | description | text | Y | - |  |
| 11 | content | text | Y | - |  |
| 12 | status | text | Y | 'draft'::text |  |
| 13 | priority | text | Y | 'medium'::text |  |
| 14 | compliance_standard | text | Y | - |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | created_at | timestamp without time zone | N | now() |  |
| 17 | updated_at | timestamp without time zone | N | now() |  |

---

### גביה ותשלומים (Collections & Payments) (8 טבלאות)

#### 21. `collection_cases`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('collection_cases_id_seq'::re... | 🔑 PK |
| 2 | customer_id | integer | Y | - |  |
| 3 | invoice_id | integer | Y | - |  |
| 4 | amount | numeric | Y | - |  |
| 5 | due_date | date | Y | - |  |
| 6 | status | text | Y | 'pending'::text |  |
| 7 | priority | text | Y | 'normal'::text |  |
| 8 | notes | text | Y | - |  |
| 9 | assigned_to | integer | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 22. `collection_management`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('collection_management_id_seq... | 🔑 PK |
| 2 | collection_number | character varying | Y | - |  |
| 3 | customer_name | character varying | Y | - |  |
| 4 | customer_id | integer | Y | - |  |
| 5 | invoice_number | character varying | Y | - |  |
| 6 | invoice_date | date | Y | - |  |
| 7 | due_date | date | Y | - |  |
| 8 | original_amount | numeric | Y | 0 |  |
| 9 | paid_amount | numeric | Y | 0 |  |
| 10 | balance_due | numeric | Y | 0 |  |
| 11 | days_overdue | integer | Y | 0 |  |
| 12 | risk_level | character varying | Y | 'low'::character varying |  |
| 13 | status | character varying | Y | 'open'::character varying |  |
| 14 | collector | character varying | Y | - |  |
| 15 | phone | character varying | Y | - |  |
| 16 | email | character varying | Y | - |  |
| 17 | last_contact_date | date | Y | - |  |
| 18 | next_action | text | Y | - |  |
| 19 | next_action_date | date | Y | - |  |
| 20 | payment_plan | text | Y | - |  |
| 21 | dunning_letters_sent | integer | Y | 0 |  |
| 22 | escalation_level | integer | Y | 0 |  |
| 23 | notes | text | Y | - |  |
| 24 | created_at | timestamp with time zone | Y | now() |  |
| 25 | updated_at | timestamp with time zone | Y | now() |  |

#### 23. `collection_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | customer_id | uuid | Y | - |  |
| 3 | invoice_id | uuid | Y | - |  |
| 4 | amount_due | integer | Y | 0 |  |
| 5 | amount_collected | integer | Y | 0 |  |
| 6 | due_date | date | Y | - |  |
| 7 | collection_date | date | Y | - |  |
| 8 | status | character varying | Y | 'pending'::character varying |  |
| 9 | assigned_to | uuid | Y | - |  |
| 10 | follow_up_date | date | Y | - |  |
| 11 | attempts | integer | Y | 0 |  |
| 12 | last_contact_date | timestamp without time zone | Y | - |  |
| 13 | last_contact_method | character varying | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |

#### 24. `payment_anomalies`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('payment_anomalies_id_seq'::r... | 🔑 PK |
| 2 | anomaly_type | character varying | N | - |  |
| 3 | severity | character varying | N | 'warning'::character varying |  |
| 4 | title | character varying | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | supplier_name | character varying | Y | - |  |
| 7 | supplier_id | integer | Y | - |  |
| 8 | amount | numeric | Y | 0 |  |
| 9 | reference_amount | numeric | Y | - |  |
| 10 | payment_date | date | Y | - |  |
| 11 | payment_id | integer | Y | - |  |
| 12 | payment_ref | character varying | Y | - |  |
| 13 | recommendation | text | Y | - |  |
| 14 | status | character varying | N | 'open'::character varying |  |
| 15 | resolved_by | character varying | Y | - |  |
| 16 | resolved_at | timestamp without time zone | Y | - |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | updated_at | timestamp without time zone | N | now() |  |

#### 25. `payment_reminders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('payment_reminders_id_seq'::r... | 🔑 PK |
| 2 | customer_name | text | N | - |  |
| 3 | invoice_number | text | Y | - |  |
| 4 | amount | bigint | Y | 0 |  |
| 5 | due_date | date | Y | - |  |
| 6 | days_overdue | integer | Y | 0 |  |
| 7 | reminder_count | integer | Y | 0 |  |
| 8 | last_reminder | date | Y | - |  |
| 9 | contact_method | text | Y | 'email'::text |  |
| 10 | contact_info | text | Y | - |  |
| 11 | status | text | Y | 'pending'::text |  |
| 12 | priority | text | Y | 'medium'::text |  |
| 13 | notes | text | Y | - |  |
| 14 | assigned_to | text | Y | - |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | created_at | timestamp without time zone | N | now() |  |
| 17 | updated_at | timestamp without time zone | N | now() |  |

#### 26. `payment_runs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('payment_runs_id_seq'::regclass) | 🔑 PK |
| 2 | run_number | character varying | N | - | UNIQUE |
| 3 | run_date | date | N | CURRENT_DATE |  |
| 4 | run_type | character varying | N | 'supplier'::character varying |  |
| 5 | payment_method | character varying | N | 'bank_transfer'::character varying |  |
| 6 | bank_account | character varying | Y | - |  |
| 7 | status | character varying | Y | 'draft'::character varying |  |
| 8 | currency | character varying | Y | 'ILS'::character varying |  |
| 9 | total_invoices | integer | Y | 0 |  |
| 10 | total_suppliers | integer | Y | 0 |  |
| 11 | total_amount | numeric | Y | 0 |  |
| 12 | total_vat | numeric | Y | 0 |  |
| 13 | total_withholding_tax | numeric | Y | 0 |  |
| 14 | net_payment | numeric | Y | 0 |  |
| 15 | payment_date | date | Y | - |  |
| 16 | value_date | date | Y | - |  |
| 17 | cut_off_date | date | Y | - |  |
| 18 | min_amount | numeric | Y | 0 |  |
| 19 | max_amount | numeric | Y | - |  |
| 20 | include_overdue_only | boolean | Y | false |  |
| 21 | approved_by | text | Y | - |  |
| 22 | approved_at | timestamp with time zone | Y | - |  |
| 23 | executed_by | text | Y | - |  |
| 24 | executed_at | timestamp with time zone | Y | - |  |
| 25 | file_reference | character varying | Y | - |  |
| 26 | error_count | integer | Y | 0 |  |
| 27 | error_details | text | Y | - |  |
| 28 | notes | text | Y | - |  |
| 29 | created_by | integer | Y | - |  |
| 30 | created_by_name | text | Y | - |  |
| 31 | created_at | timestamp with time zone | Y | now() |  |
| 32 | updated_at | timestamp with time zone | Y | now() |  |
| 33 | bank_account_id | integer | Y | - |  |
| 34 | bank_account_name | character varying | Y | - |  |
| 35 | supplier_count | integer | Y | 0 |  |
| 36 | invoice_count | integer | Y | 0 |  |
| 37 | total_withholding | numeric | Y | 0 |  |
| 38 | total_net | numeric | Y | 0 |  |
| 39 | selection_criteria | text | Y | - |  |
| 40 | due_date_cutoff | date | Y | - |  |
| 41 | bank_file_generated | boolean | Y | false |  |
| 42 | bank_file_url | text | Y | - |  |
| 43 | bank_file_date | date | Y | - |  |
| 44 | journal_entry_id | integer | Y | - |  |
| 45 | posted | boolean | Y | false |  |
| 46 | tags | text | Y | - |  |

#### 27. `payment_terms`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | code | character varying | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | due_days | integer | Y | 30 |  |
| 6 | discount_days | integer | Y | - |  |
| 7 | discount_percent | numeric | Y | 0 |  |
| 8 | payment_type | character varying | Y | 'net'::character varying |  |
| 9 | installment_count | integer | Y | - |  |
| 10 | is_default | boolean | Y | false |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

#### 28. `payments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('payments_id_seq'::regclass) | 🔑 PK |
| 2 | payment_date | date | N | - |  |
| 3 | payment_type | character varying | N | - |  |
| 4 | payment_method | character varying | Y | - |  |
| 5 | amount | numeric | N | - |  |
| 6 | currency | character varying | Y | 'ILS'::character varying |  |
| 7 | payable_id | integer | Y | - | FK → accounts_payable.id |
| 8 | receivable_id | integer | Y | - | FK → accounts_receivable.id |
| 9 | bank_account_id | integer | Y | - | FK → bank_accounts.id |
| 10 | check_number | character varying | Y | - |  |
| 11 | reference_number | character varying | Y | - |  |
| 12 | description | text | Y | - |  |
| 13 | status | character varying | Y | 'completed'::character varying |  |
| 14 | created_at | timestamp with time zone | Y | now() |  |
| 15 | payment_number | character varying | Y | - |  |
| 16 | entity_type | character varying | Y | - |  |
| 17 | entity_id | integer | Y | - |  |
| 18 | entity_name | character varying | Y | - |  |
| 19 | invoice_id | integer | Y | - |  |
| 20 | invoice_number | character varying | Y | - |  |
| 21 | exchange_rate | numeric | Y | 1 |  |
| 22 | amount_ils | numeric | Y | - |  |
| 23 | bank_name | character varying | Y | - |  |
| 24 | bank_branch | character varying | Y | - |  |
| 25 | bank_account | character varying | Y | - |  |
| 26 | check_date | date | Y | - |  |
| 27 | reference | character varying | Y | - |  |
| 28 | receipt_number | character varying | Y | - |  |
| 29 | withholding_tax_pct | numeric | Y | - |  |
| 30 | withholding_tax_amount | numeric | Y | 0 |  |
| 31 | net_amount | numeric | Y | - |  |
| 32 | journal_entry_id | integer | Y | - |  |
| 33 | posted | boolean | Y | false |  |
| 34 | notes | text | Y | - |  |
| 35 | tags | text | Y | - |  |

---

### הגדרות מערכת (System Settings) (19 טבלאות)

#### 29. `system_backups`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_backups_id_seq'::regc... | 🔑 PK |
| 2 | backup_type | text | N | 'full'::text |  |
| 3 | status | text | N | 'pending'::text |  |
| 4 | size_bytes | bigint | Y | 0 |  |
| 5 | location | text | Y | 'local'::text |  |
| 6 | started_at | timestamp with time zone | Y | now() |  |
| 7 | completed_at | timestamp with time zone | Y | - |  |
| 8 | duration_seconds | integer | Y | 0 |  |
| 9 | notes | text | Y | - |  |
| 10 | triggered_by | text | Y | 'system'::text |  |
| 11 | created_at | timestamp with time zone | Y | now() |  |

#### 30. `system_buttons`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_buttons_id_seq'::regc... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | button_type | text | N | - |  |
| 6 | icon | text | Y | - |  |
| 7 | color | text | Y | - |  |
| 8 | action_type | text | Y | - |  |
| 9 | action_config | jsonb | Y | '{}'::jsonb |  |
| 10 | conditions | jsonb | Y | '{}'::jsonb |  |
| 11 | sort_order | integer | N | 0 |  |
| 12 | is_active | boolean | N | true |  |
| 13 | created_at | timestamp without time zone | N | now() |  |

#### 31. `system_categories`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_categories_id_seq'::r... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | name_he | text | Y | - |  |
| 5 | name_en | text | Y | - |  |
| 6 | slug | text | N | - |  |
| 7 | parent_id | integer | Y | - |  |
| 8 | color | text | Y | - |  |
| 9 | icon | text | Y | - |  |
| 10 | sort_order | integer | N | 0 |  |
| 11 | is_active | boolean | N | true |  |
| 12 | settings | jsonb | Y | '{}'::jsonb |  |
| 13 | created_at | timestamp without time zone | N | now() |  |

#### 32. `system_dashboard_pages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_dashboard_pages_id_se... | 🔑 PK |
| 2 | module_id | integer | Y | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | is_default | boolean | N | false |  |
| 6 | layout | jsonb | Y | '{}'::jsonb |  |
| 7 | settings | jsonb | Y | '{}'::jsonb |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |

#### 33. `system_dashboard_widgets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_dashboard_widgets_id_... | 🔑 PK |
| 2 | dashboard_id | integer | N | - |  |
| 3 | widget_type | text | N | - |  |
| 4 | title | text | N | - |  |
| 5 | entity_id | integer | Y | - |  |
| 6 | config | jsonb | Y | '{}'::jsonb |  |
| 7 | position | integer | N | 0 |  |
| 8 | size | text | Y | 'medium'::text |  |
| 9 | settings | jsonb | Y | '{}'::jsonb |  |
| 10 | created_at | timestamp without time zone | N | now() |  |

#### 34. `system_detail_pages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_detail_pages_id_seq':... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | is_default | boolean | N | false |  |
| 6 | settings | jsonb | Y | '{}'::jsonb |  |
| 7 | created_at | timestamp without time zone | N | now() |  |
| 8 | updated_at | timestamp without time zone | N | now() |  |

#### 35. `system_detail_sections`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_detail_sections_id_se... | 🔑 PK |
| 2 | detail_page_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | section_type | text | N | 'fields'::text |  |
| 6 | sort_order | integer | N | 0 |  |
| 7 | settings | jsonb | Y | '{}'::jsonb |  |
| 8 | created_at | timestamp without time zone | N | now() |  |

#### 36. `system_form_fields`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_form_fields_id_seq'::... | 🔑 PK |
| 2 | section_id | integer | N | - |  |
| 3 | field_id | integer | N | - |  |
| 4 | sort_order | integer | N | 0 |  |
| 5 | width | text | N | 'full'::text |  |
| 6 | is_visible | boolean | N | true |  |
| 7 | settings | jsonb | Y | '{}'::jsonb |  |
| 8 | created_at | timestamp without time zone | N | now() |  |

#### 37. `system_form_sections`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_form_sections_id_seq'... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | form_id | integer | Y | - |  |
| 4 | name | text | N | - |  |
| 5 | name_he | text | Y | - |  |
| 6 | name_en | text | Y | - |  |
| 7 | slug | text | N | - |  |
| 8 | sort_order | integer | N | 0 |  |
| 9 | is_collapsible | boolean | N | false |  |
| 10 | is_collapsed | boolean | N | false |  |
| 11 | settings | jsonb | Y | '{}'::jsonb |  |
| 12 | created_at | timestamp without time zone | N | now() |  |

#### 38. `system_menu_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_menu_items_id_seq'::r... | 🔑 PK |
| 2 | module_id | integer | Y | - |  |
| 3 | entity_id | integer | Y | - |  |
| 4 | parent_id | integer | Y | - |  |
| 5 | label | text | N | - |  |
| 6 | label_he | text | Y | - |  |
| 7 | label_en | text | Y | - |  |
| 8 | icon | text | Y | - |  |
| 9 | path | text | Y | - |  |
| 10 | sort_order | integer | N | 0 |  |
| 11 | is_active | boolean | N | true |  |
| 12 | settings | jsonb | Y | '{}'::jsonb |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | section | text | Y | - |  |
| 15 | roles | jsonb | Y | '[]'::jsonb |  |

#### 39. `system_permissions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_permissions_id_seq'::... | 🔑 PK |
| 2 | entity_id | integer | Y | - |  |
| 3 | module_id | integer | Y | - |  |
| 4 | role | text | N | - |  |
| 5 | action | text | N | - |  |
| 6 | is_allowed | boolean | N | true |  |
| 7 | conditions | jsonb | Y | '{}'::jsonb |  |
| 8 | settings | jsonb | Y | '{}'::jsonb |  |
| 9 | created_at | timestamp without time zone | N | now() |  |

#### 40. `system_publish_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_publish_logs_id_seq':... | 🔑 PK |
| 2 | module_id | integer | Y | - |  |
| 3 | entity_type | text | N | - |  |
| 4 | entity_id | integer | N | - |  |
| 5 | action | text | N | - |  |
| 6 | previous_version | integer | Y | - |  |
| 7 | new_version | integer | Y | - |  |
| 8 | published_by | text | Y | - |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |

#### 41. `system_settings`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_settings_id_seq'::reg... | 🔑 PK |
| 2 | key | character varying | N | - | UNIQUE |
| 3 | value | text | Y | - |  |
| 4 | updated_at | timestamp without time zone | Y | now() |  |
| 5 | category | text | Y | 'general'::text |  |

#### 42. `system_status_sets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_status_sets_id_seq'::... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | is_default | boolean | N | false |  |
| 6 | settings | jsonb | Y | '{}'::jsonb |  |
| 7 | created_at | timestamp without time zone | N | now() |  |

#### 43. `system_status_values`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_status_values_id_seq'... | 🔑 PK |
| 2 | status_set_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | name_he | text | Y | - |  |
| 5 | name_en | text | Y | - |  |
| 6 | slug | text | N | - |  |
| 7 | color | text | N | 'gray'::text |  |
| 8 | icon | text | Y | - |  |
| 9 | sort_order | integer | N | 0 |  |
| 10 | is_default | boolean | N | false |  |
| 11 | is_final | boolean | N | false |  |
| 12 | settings | jsonb | Y | '{}'::jsonb |  |
| 13 | created_at | timestamp without time zone | N | now() |  |

#### 44. `system_templates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_templates_id_seq'::re... | 🔑 PK |
| 2 | entity_id | integer | Y | - |  |
| 3 | module_id | integer | Y | - |  |
| 4 | name | text | N | - |  |
| 5 | slug | text | N | - |  |
| 6 | template_type | text | N | 'document'::text |  |
| 7 | content | jsonb | Y | '{}'::jsonb |  |
| 8 | is_active | boolean | N | true |  |
| 9 | settings | jsonb | Y | '{}'::jsonb |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |

#### 45. `system_validations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_validations_id_seq'::... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | field_id | integer | Y | - |  |
| 4 | validation_type | text | N | - |  |
| 5 | rule | jsonb | N | '{}'::jsonb |  |
| 6 | error_message | text | N | - |  |
| 7 | error_message_he | text | Y | - |  |
| 8 | error_message_en | text | Y | - |  |
| 9 | is_active | boolean | N | true |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | created_at | timestamp without time zone | N | now() |  |

#### 46. `system_versions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_versions_id_seq'::reg... | 🔑 PK |
| 2 | entity_type | text | N | - |  |
| 3 | entity_id | integer | N | - |  |
| 4 | version_number | integer | N | 1 |  |
| 5 | data | jsonb | N | '{}'::jsonb |  |
| 6 | created_by | text | Y | - |  |
| 7 | created_at | timestamp without time zone | N | now() |  |

#### 47. `system_view_columns`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('system_view_columns_id_seq':... | 🔑 PK |
| 2 | view_id | integer | N | - |  |
| 3 | field_id | integer | N | - |  |
| 4 | sort_order | integer | N | 0 |  |
| 5 | width | text | Y | - |  |
| 6 | is_visible | boolean | N | true |  |
| 7 | is_sortable | boolean | N | true |  |
| 8 | is_filterable | boolean | N | false |  |
| 9 | settings | jsonb | Y | '{}'::jsonb |  |
| 10 | created_at | timestamp without time zone | N | now() |  |

---

### חובות לקוחות (Accounts Receivable) (2 טבלאות)

#### 48. `ar_dunning_letters`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ar_dunning_letters_id_seq'::... | 🔑 PK |
| 2 | dunning_number | character varying | N | - |  |
| 3 | ar_id | integer | Y | - | FK → accounts_receivable.id |
| 4 | customer_name | text | N | - |  |
| 5 | customer_email | character varying | Y | - |  |
| 6 | dunning_level | integer | N | 1 |  |
| 7 | letter_date | date | N | CURRENT_DATE |  |
| 8 | due_amount | numeric | N | 0 |  |
| 9 | interest_amount | numeric | Y | 0 |  |
| 10 | total_amount | numeric | Y | 0 |  |
| 11 | days_overdue | integer | Y | 0 |  |
| 12 | subject | text | Y | - |  |
| 13 | body | text | Y | - |  |
| 14 | status | character varying | Y | 'draft'::character varying |  |
| 15 | sent_at | timestamp with time zone | Y | - |  |
| 16 | response_date | date | Y | - |  |
| 17 | response_notes | text | Y | - |  |
| 18 | created_by | integer | Y | - |  |
| 19 | created_by_name | text | Y | - |  |
| 20 | created_at | timestamp with time zone | Y | now() |  |
| 21 | letter_number | character varying | Y | - |  |
| 22 | customer_id | integer | Y | - |  |
| 23 | total_overdue | numeric | Y | - |  |
| 24 | oldest_invoice_date | date | Y | - |  |
| 25 | invoice_count | integer | Y | 0 |  |
| 26 | invoice_list | text | Y | - |  |
| 27 | due_response_date | date | Y | - |  |
| 28 | sent_method | character varying | Y | - |  |
| 29 | sent_to_email | character varying | Y | - |  |
| 30 | sent_date | date | Y | - |  |
| 31 | sent_by | character varying | Y | - |  |
| 32 | response_received | boolean | Y | false |  |
| 33 | payment_promise_date | date | Y | - |  |
| 34 | payment_promise_amount | numeric | Y | - |  |
| 35 | legal_action_threatened | boolean | Y | false |  |
| 36 | legal_action_initiated | boolean | Y | false |  |
| 37 | template_used | character varying | Y | - |  |
| 38 | pdf_url | text | Y | - |  |
| 39 | tags | text | Y | - |  |

#### 49. `ar_receipts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ar_receipts_id_seq'::regclass) | 🔑 PK |
| 2 | ar_id | integer | N | - | FK → accounts_receivable.id |
| 3 | receipt_number | character varying | N | - |  |
| 4 | receipt_date | date | N | CURRENT_DATE |  |
| 5 | amount | numeric | N | - |  |
| 6 | currency | character varying | Y | 'ILS'::character varying |  |
| 7 | payment_method | character varying | Y | - |  |
| 8 | bank_account | character varying | Y | - |  |
| 9 | check_number | character varying | Y | - |  |
| 10 | check_date | date | Y | - |  |
| 11 | reference | character varying | Y | - |  |
| 12 | notes | text | Y | - |  |
| 13 | created_by | integer | Y | - |  |
| 14 | created_by_name | text | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | customer_id | integer | Y | - |  |
| 17 | customer_name | character varying | Y | - |  |
| 18 | bank_name | character varying | Y | - |  |
| 19 | bank_branch | character varying | Y | - |  |
| 20 | allocated_amount | numeric | Y | 0 |  |
| 21 | unallocated_amount | numeric | Y | 0 |  |
| 22 | allocated_invoices | text | Y | - |  |
| 23 | withholding_tax | numeric | Y | 0 |  |
| 24 | net_received | numeric | Y | - |  |
| 25 | deposited | boolean | Y | false |  |
| 26 | deposit_date | date | Y | - |  |
| 27 | deposit_reference | character varying | Y | - |  |
| 28 | journal_entry_id | integer | Y | - |  |
| 29 | posted | boolean | Y | false |  |
| 30 | pdf_url | text | Y | - |  |
| 31 | email_sent | boolean | Y | false |  |
| 32 | status | character varying | Y | 'draft'::character varying |  |
| 33 | tags | text | Y | - |  |

---

### חובות ספקים (Accounts Payable) (2 טבלאות)

#### 50. `ap_aging_snapshots`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ap_aging_snapshots_id_seq'::... | 🔑 PK |
| 2 | snapshot_date | date | N | CURRENT_DATE |  |
| 3 | current_amount | numeric | Y | 0 |  |
| 4 | days_30 | numeric | Y | 0 |  |
| 5 | days_60 | numeric | Y | 0 |  |
| 6 | days_90 | numeric | Y | 0 |  |
| 7 | days_120_plus | numeric | Y | 0 |  |
| 8 | total_overdue | numeric | Y | 0 |  |
| 9 | total_balance | numeric | Y | 0 |  |
| 10 | supplier_count | integer | Y | 0 |  |
| 11 | overdue_count | integer | Y | 0 |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | supplier_id | integer | Y | - |  |
| 15 | supplier_name | character varying | Y | - |  |
| 16 | total_outstanding | numeric | Y | - |  |
| 17 | days_1_30 | numeric | Y | 0 |  |
| 18 | days_31_60 | numeric | Y | 0 |  |
| 19 | days_61_90 | numeric | Y | 0 |  |
| 20 | days_91_120 | numeric | Y | 0 |  |
| 21 | days_over_120 | numeric | Y | 0 |  |
| 22 | invoice_count | integer | Y | 0 |  |
| 23 | oldest_invoice_date | date | Y | - |  |
| 24 | avg_days_outstanding | numeric | Y | - |  |
| 25 | payment_terms | character varying | Y | - |  |
| 26 | currency | character varying | Y | 'ILS'::character varying |  |
| 27 | tags | text | Y | - |  |

#### 51. `ap_payments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ap_payments_id_seq'::regclass) | 🔑 PK |
| 2 | ap_id | integer | N | - | FK → accounts_payable.id |
| 3 | payment_number | character varying | N | - |  |
| 4 | payment_date | date | N | CURRENT_DATE |  |
| 5 | amount | numeric | N | - |  |
| 6 | currency | character varying | Y | 'ILS'::character varying |  |
| 7 | payment_method | character varying | Y | - |  |
| 8 | bank_account | character varying | Y | - |  |
| 9 | check_number | character varying | Y | - |  |
| 10 | reference | character varying | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | created_by | integer | Y | - |  |
| 13 | created_by_name | text | Y | - |  |
| 14 | created_at | timestamp with time zone | Y | now() |  |
| 15 | supplier_id | integer | Y | - |  |
| 16 | supplier_name | character varying | Y | - |  |
| 17 | bank_name | character varying | Y | - |  |
| 18 | allocated_invoices | text | Y | - |  |
| 19 | allocated_amount | numeric | Y | 0 |  |
| 20 | unallocated_amount | numeric | Y | 0 |  |
| 21 | withholding_tax | numeric | Y | 0 |  |
| 22 | net_paid | numeric | Y | - |  |
| 23 | payment_run_id | integer | Y | - |  |
| 24 | approved_by | character varying | Y | - |  |
| 25 | approved_at | timestamp with time zone | Y | - |  |
| 26 | journal_entry_id | integer | Y | - |  |
| 27 | posted | boolean | Y | false |  |
| 28 | voided | boolean | Y | false |  |
| 29 | void_reason | text | Y | - |  |
| 30 | status | character varying | Y | 'draft'::character varying |  |
| 31 | tags | text | Y | - |  |

---

### ייצור ופבריקציה (Production & Fabrication) (22 טבלאות)

#### 52. `assembly_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('assembly_orders_id_seq'::reg... | 🔑 PK |
| 2 | assembly_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | product_name | text | Y | - |  |
| 6 | product_type | text | Y | - |  |
| 7 | system_id | integer | Y | - |  |
| 8 | system_name | text | Y | - |  |
| 9 | width_mm | numeric | Y | - |  |
| 10 | height_mm | numeric | Y | - |  |
| 11 | opening_type | text | Y | - |  |
| 12 | opening_direction | text | Y | - |  |
| 13 | panels_count | integer | Y | 1 |  |
| 14 | frame_color | text | Y | - |  |
| 15 | finish_id | integer | Y | - |  |
| 16 | hardware_set_id | integer | Y | - |  |
| 17 | glass_id | integer | Y | - |  |
| 18 | seal_type | text | Y | - |  |
| 19 | gasket_type | text | Y | - |  |
| 20 | thermal_break | boolean | Y | false |  |
| 21 | components_json | jsonb | Y | - |  |
| 22 | assembly_steps | jsonb | Y | - |  |
| 23 | assembly_station | text | Y | - |  |
| 24 | assigned_to | text | Y | - |  |
| 25 | estimated_minutes | integer | Y | - |  |
| 26 | actual_minutes | integer | Y | - |  |
| 27 | priority | text | Y | 'normal'::text |  |
| 28 | status | text | N | 'pending'::text |  |
| 29 | started_at | timestamp without time zone | Y | - |  |
| 30 | completed_at | timestamp without time zone | Y | - |  |
| 31 | qc_result | text | Y | - |  |
| 32 | qc_notes | text | Y | - |  |
| 33 | notes | text | Y | - |  |
| 34 | created_at | timestamp without time zone | Y | now() |  |
| 35 | updated_at | timestamp without time zone | Y | now() |  |

#### 53. `capacity_planning`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('capacity_planning_id_seq'::r... | 🔑 PK |
| 2 | plan_number | character varying | Y | - |  |
| 3 | plan_name | character varying | Y | - |  |
| 4 | plan_type | character varying | Y | 'weekly'::character varying |  |
| 5 | fiscal_year | integer | Y | - |  |
| 6 | fiscal_week | integer | Y | - |  |
| 7 | fiscal_month | integer | Y | - |  |
| 8 | start_date | date | Y | - |  |
| 9 | end_date | date | Y | - |  |
| 10 | department | character varying | Y | - |  |
| 11 | workstation | character varying | Y | - |  |
| 12 | machine_id | integer | Y | - |  |
| 13 | machine_name | character varying | Y | - |  |
| 14 | shift_count | integer | Y | 1 |  |
| 15 | hours_per_shift | numeric | Y | 8 |  |
| 16 | available_hours | numeric | Y | - |  |
| 17 | planned_hours | numeric | Y | 0 |  |
| 18 | actual_hours | numeric | Y | 0 |  |
| 19 | utilization_pct | numeric | Y | - |  |
| 20 | overload | boolean | Y | false |  |
| 21 | overload_hours | numeric | Y | 0 |  |
| 22 | efficiency_pct | numeric | Y | - |  |
| 23 | oee_pct | numeric | Y | - |  |
| 24 | bottleneck | boolean | Y | false |  |
| 25 | maintenance_hours | numeric | Y | 0 |  |
| 26 | downtime_hours | numeric | Y | 0 |  |
| 27 | setup_hours | numeric | Y | 0 |  |
| 28 | work_order_count | integer | Y | 0 |  |
| 29 | work_order_ids | text | Y | - |  |
| 30 | product_mix | text | Y | - |  |
| 31 | material_requirements | text | Y | - |  |
| 32 | labor_requirements | text | Y | - |  |
| 33 | labor_hours_needed | numeric | Y | - |  |
| 34 | labor_hours_available | numeric | Y | - |  |
| 35 | labor_gap | numeric | Y | 0 |  |
| 36 | overtime_hours | numeric | Y | 0 |  |
| 37 | subcontract_hours | numeric | Y | 0 |  |
| 38 | constraint_type | character varying | Y | - |  |
| 39 | constraint_description | text | Y | - |  |
| 40 | resolution_plan | text | Y | - |  |
| 41 | approved_by | character varying | Y | - |  |
| 42 | approved_at | timestamp with time zone | Y | - |  |
| 43 | status | character varying | Y | 'draft'::character varying |  |
| 44 | is_active | boolean | Y | true |  |
| 45 | created_at | timestamp with time zone | Y | now() |  |
| 46 | updated_at | timestamp with time zone | Y | now() |  |
| 47 | created_by | character varying | Y | - |  |
| 48 | updated_by | character varying | Y | - |  |
| 49 | notes | text | Y | - |  |
| 50 | tags | text | Y | - |  |

#### 54. `coating_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('coating_orders_id_seq'::regc... | 🔑 PK |
| 2 | coating_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | coating_type | text | N | 'powder_coating'::text |  |
| 6 | finish_id | integer | Y | - |  |
| 7 | color_id | integer | Y | - |  |
| 8 | color_code | text | Y | - |  |
| 9 | color_name | text | Y | - |  |
| 10 | surface | text | Y | 'aluminum'::text |  |
| 11 | pretreatment | text | Y | - |  |
| 12 | primer_required | boolean | Y | false |  |
| 13 | coats_required | integer | Y | 1 |  |
| 14 | thickness_microns | numeric | Y | - |  |
| 15 | cure_temperature_c | numeric | Y | - |  |
| 16 | cure_time_minutes | integer | Y | - |  |
| 17 | total_area_sqm | numeric | Y | - |  |
| 18 | pieces_count | integer | Y | 0 |  |
| 19 | pieces_json | jsonb | Y | - |  |
| 20 | batch_number | text | Y | - |  |
| 21 | oven_id | text | Y | - |  |
| 22 | assigned_to | text | Y | - |  |
| 23 | estimated_minutes | integer | Y | - |  |
| 24 | actual_minutes | integer | Y | - |  |
| 25 | quality_check | text | Y | - |  |
| 26 | adhesion_test | text | Y | - |  |
| 27 | thickness_test | text | Y | - |  |
| 28 | priority | text | Y | 'normal'::text |  |
| 29 | status | text | N | 'pending'::text |  |
| 30 | sent_at | timestamp without time zone | Y | - |  |
| 31 | received_at | timestamp without time zone | Y | - |  |
| 32 | is_external | boolean | Y | false |  |
| 33 | external_supplier | text | Y | - |  |
| 34 | external_cost | numeric | Y | - |  |
| 35 | notes | text | Y | - |  |
| 36 | created_at | timestamp without time zone | Y | now() |  |
| 37 | updated_at | timestamp without time zone | Y | now() |  |

#### 55. `cutting_lists`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cutting_lists_id_seq'::regcl... | 🔑 PK |
| 2 | cutting_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | product_name | text | Y | - |  |
| 6 | profile_id | integer | Y | - |  |
| 7 | profile_number | text | Y | - |  |
| 8 | profile_name | text | Y | - |  |
| 9 | material | text | Y | 'aluminum'::text |  |
| 10 | raw_length_mm | numeric | Y | 6000 |  |
| 11 | cut_length_mm | numeric | N | - |  |
| 12 | angle_degrees_1 | numeric | Y | 90 |  |
| 13 | angle_degrees_2 | numeric | Y | 90 |  |
| 14 | quantity | integer | N | 1 |  |
| 15 | position | text | Y | - |  |
| 16 | part_label | text | Y | - |  |
| 17 | machining_operations | text | Y | - |  |
| 18 | drill_holes | jsonb | Y | - |  |
| 19 | notches | jsonb | Y | - |  |
| 20 | waste_percent | numeric | Y | - |  |
| 21 | optimization_group | text | Y | - |  |
| 22 | bar_assignment | text | Y | - |  |
| 23 | cnc_program_id | text | Y | - |  |
| 24 | machine_id | integer | Y | - |  |
| 25 | operator_name | text | Y | - |  |
| 26 | status | text | N | 'pending'::text |  |
| 27 | cut_at | timestamp without time zone | Y | - |  |
| 28 | notes | text | Y | - |  |
| 29 | created_at | timestamp without time zone | Y | now() |  |
| 30 | updated_at | timestamp without time zone | Y | now() |  |

#### 56. `glazing_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('glazing_orders_id_seq'::regc... | 🔑 PK |
| 2 | glazing_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | assembly_order_id | integer | Y | - |  |
| 6 | glass_id | integer | Y | - |  |
| 7 | glass_code | text | Y | - |  |
| 8 | glass_type | text | Y | - |  |
| 9 | width_mm | numeric | N | - |  |
| 10 | height_mm | numeric | N | - |  |
| 11 | area_sqm | numeric | Y | - |  |
| 12 | quantity | integer | N | 1 |  |
| 13 | edge_work | text | Y | - |  |
| 14 | spacer_type | text | Y | - |  |
| 15 | sealant_type | text | Y | - |  |
| 16 | glazing_method | text | Y | 'dry'::text |  |
| 17 | glazing_beads_required | boolean | Y | true |  |
| 18 | setting_blocks_required | boolean | Y | true |  |
| 19 | assigned_to | text | Y | - |  |
| 20 | glazing_station | text | Y | - |  |
| 21 | estimated_minutes | integer | Y | - |  |
| 22 | actual_minutes | integer | Y | - |  |
| 23 | qc_result | text | Y | - |  |
| 24 | priority | text | Y | 'normal'::text |  |
| 25 | status | text | N | 'pending'::text |  |
| 26 | started_at | timestamp without time zone | Y | - |  |
| 27 | completed_at | timestamp without time zone | Y | - |  |
| 28 | notes | text | Y | - |  |
| 29 | created_at | timestamp without time zone | Y | now() |  |
| 30 | updated_at | timestamp without time zone | Y | now() |  |

#### 57. `installer_work_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('installer_work_orders_id_seq... | 🔑 PK |
| 2 | iwo_number | character varying | Y | - | UNIQUE |
| 3 | installation_id | integer | Y | - | FK → installations.id |
| 4 | installer_id | integer | Y | - | FK → installers.id |
| 5 | instructions | text | Y | - |  |
| 6 | checklist | jsonb | Y | '[]'::jsonb |  |
| 7 | safety_briefing | text | Y | - |  |
| 8 | materials_list | jsonb | Y | '[]'::jsonb |  |
| 9 | tools_list | jsonb | Y | '[]'::jsonb |  |
| 10 | estimated_hours | numeric | Y | - |  |
| 11 | status | character varying | Y | 'pending'::character varying |  |
| 12 | completed_checklist | jsonb | Y | '[]'::jsonb |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |

#### 58. `packing_lists`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('packing_lists_id_seq'::regcl... | 🔑 PK |
| 2 | packing_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | customer_name | text | Y | - |  |
| 6 | delivery_address | text | Y | - |  |
| 7 | packing_type | text | Y | 'standard'::text |  |
| 8 | items_json | jsonb | Y | - |  |
| 9 | total_pieces | integer | Y | 0 |  |
| 10 | total_weight | numeric | Y | - |  |
| 11 | total_volume_cbm | numeric | Y | - |  |
| 12 | crates_count | integer | Y | 0 |  |
| 13 | pallets_count | integer | Y | 0 |  |
| 14 | protection_type | text | Y | - |  |
| 15 | labeling_complete | boolean | Y | false |  |
| 16 | photos_json | jsonb | Y | - |  |
| 17 | special_instructions | text | Y | - |  |
| 18 | packed_by | text | Y | - |  |
| 19 | verified_by | text | Y | - |  |
| 20 | assigned_to | text | Y | - |  |
| 21 | estimated_minutes | integer | Y | - |  |
| 22 | actual_minutes | integer | Y | - |  |
| 23 | priority | text | Y | 'normal'::text |  |
| 24 | status | text | N | 'pending'::text |  |
| 25 | packed_at | timestamp without time zone | Y | - |  |
| 26 | notes | text | Y | - |  |
| 27 | created_at | timestamp without time zone | Y | now() |  |
| 28 | updated_at | timestamp without time zone | Y | now() |  |

#### 59. `product_categories`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('product_categories_id_seq'::... | 🔑 PK |
| 2 | name | text | N | - | UNIQUE |
| 3 | icon | text | Y | 'Package'::text |  |
| 4 | color | text | Y | '#3b82f6'::text |  |
| 5 | description | text | Y | - |  |
| 6 | sort_order | integer | Y | 0 |  |
| 7 | created_at | timestamp without time zone | N | now() |  |
| 8 | updated_at | timestamp without time zone | N | now() |  |
| 9 | category_code | character varying | Y | - |  |
| 10 | category_name | character varying | Y | - |  |
| 11 | parent_id | integer | Y | - |  |
| 12 | parent_name | character varying | Y | - |  |
| 13 | level | integer | Y | 1 |  |
| 14 | image_url | text | Y | - |  |
| 15 | product_count | integer | Y | 0 |  |
| 16 | material_type | character varying | Y | - |  |
| 17 | default_uom | character varying | Y | - |  |
| 18 | default_warehouse | character varying | Y | - |  |
| 19 | default_bin | character varying | Y | - |  |
| 20 | min_margin_pct | numeric | Y | - |  |
| 21 | default_vat_rate | numeric | Y | 18 |  |
| 22 | default_warranty_months | integer | Y | - |  |
| 23 | quality_check_required | boolean | Y | true |  |
| 24 | hazardous | boolean | Y | false |  |
| 25 | serialized | boolean | Y | false |  |
| 26 | batch_tracked | boolean | Y | false |  |
| 27 | si_standard | character varying | Y | - |  |
| 28 | ce_mark_required | boolean | Y | false |  |
| 29 | fire_rating_required | boolean | Y | false |  |
| 30 | thermal_rating_required | boolean | Y | false |  |
| 31 | gl_revenue_account | character varying | Y | - |  |
| 32 | gl_cost_account | character varying | Y | - |  |
| 33 | gl_inventory_account | character varying | Y | - |  |
| 34 | is_active | boolean | Y | true |  |
| 35 | created_by | character varying | Y | - |  |
| 36 | updated_by | character varying | Y | - |  |
| 37 | notes | text | Y | - |  |
| 38 | tags | text | Y | - |  |

#### 60. `product_materials`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('product_materials_id_seq'::r... | 🔑 PK |
| 2 | product_id | integer | N | - | FK → products.id |
| 3 | material_id | integer | N | - |  |
| 4 | quantity_per_sqm | numeric | N | 1 |  |
| 5 | unit_cost | numeric | Y | 0 |  |
| 6 | total_cost | numeric | Y | 0 |  |
| 7 | notes | text | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | product_name | character varying | Y | - |  |
| 10 | product_code | character varying | Y | - |  |
| 11 | material_name | character varying | Y | - |  |
| 12 | material_code | character varying | Y | - |  |
| 13 | quantity_per_unit | numeric | Y | - |  |
| 14 | uom | character varying | Y | 'יחידה'::character varying |  |
| 15 | waste_pct | numeric | Y | 0 |  |
| 16 | quantity_with_waste | numeric | Y | - |  |
| 17 | total_cost_per_unit | numeric | Y | - |  |
| 18 | is_primary | boolean | Y | false |  |
| 19 | is_optional | boolean | Y | false |  |
| 20 | substitute_material_id | integer | Y | - |  |
| 21 | substitute_material_name | character varying | Y | - |  |
| 22 | effective_date | date | Y | - |  |
| 23 | expiry_date | date | Y | - |  |
| 24 | sort_order | integer | Y | 0 |  |
| 25 | process_step | character varying | Y | - |  |
| 26 | workstation | character varying | Y | - |  |
| 27 | lead_time_days | integer | Y | - |  |
| 28 | supplier_id | integer | Y | - |  |
| 29 | supplier_name | character varying | Y | - |  |
| 30 | last_price | numeric | Y | - |  |
| 31 | last_price_date | date | Y | - |  |
| 32 | is_active | boolean | Y | true |  |
| 33 | updated_at | timestamp with time zone | Y | now() |  |
| 34 | tags | text | Y | - |  |

#### 61. `product_roadmap`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('product_roadmap_id_seq'::reg... | 🔑 PK |
| 2 | item_name | text | Y | - |  |
| 3 | description | text | Y | - |  |
| 4 | quarter | text | Y | - |  |
| 5 | year | integer | Y | - |  |
| 6 | priority | text | Y | 'medium'::text |  |
| 7 | status | text | Y | 'planned'::text |  |
| 8 | category | text | Y | - |  |
| 9 | owner | text | Y | - |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |

#### 62. `product_roadmap_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('product_roadmap_items_id_seq... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | quarter | text | Y | - |  |
| 5 | year | integer | Y | - |  |
| 6 | priority | text | Y | 'medium'::text |  |
| 7 | status | text | Y | 'planned'::text |  |
| 8 | category | text | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 63. `production_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('production_lines_id_seq'::re... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | code | character varying | Y | - |  |
| 4 | department | character varying | Y | - |  |
| 5 | line_type | character varying | Y | 'assembly'::character varying |  |
| 6 | capacity_per_hour | numeric | Y | 0 |  |
| 7 | status | character varying | Y | 'operational'::character varying |  |
| 8 | machines | jsonb | Y | '[]'::jsonb |  |
| 9 | operators | jsonb | Y | '[]'::jsonb |  |
| 10 | shift_schedule | jsonb | Y | '{}'::jsonb |  |
| 11 | notes | text | Y | - |  |
| 12 | is_active | boolean | Y | true |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

#### 64. `production_ncr`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('production_ncr_id_seq'::regc... | 🔑 PK |
| 2 | ncr_number | text | Y | - |  |
| 3 | title | text | N | - |  |
| 4 | product | text | Y | - |  |
| 5 | work_order | text | Y | - |  |
| 6 | defect_type | text | Y | - |  |
| 7 | severity | text | Y | 'medium'::text |  |
| 8 | detected_by | text | Y | - |  |
| 9 | detected_at | timestamp without time zone | Y | now() |  |
| 10 | department | text | Y | - |  |
| 11 | root_cause | text | Y | - |  |
| 12 | corrective_action | text | Y | - |  |
| 13 | preventive_action | text | Y | - |  |
| 14 | cost_impact | bigint | Y | 0 |  |
| 15 | status | text | Y | 'open'::text |  |
| 16 | assigned_to | text | Y | - |  |
| 17 | closed_at | timestamp without time zone | Y | - |  |
| 18 | notes | text | Y | - |  |
| 19 | is_active | boolean | Y | true |  |
| 20 | created_at | timestamp without time zone | N | now() |  |
| 21 | updated_at | timestamp without time zone | N | now() |  |

#### 65. `production_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('production_reports_id_seq'::... | 🔑 PK |
| 2 | report_type | text | Y | - |  |
| 3 | period | text | Y | - |  |
| 4 | data | jsonb | Y | '{}'::jsonb |  |
| 5 | notes | text | Y | - |  |
| 6 | created_by | integer | Y | - |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |
| 8 | updated_at | timestamp without time zone | Y | now() |  |

#### 66. `production_schedules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('production_schedules_id_seq'... | 🔑 PK |
| 2 | work_order_id | integer | Y | - |  |
| 3 | product_id | integer | Y | - |  |
| 4 | quantity | integer | Y | - |  |
| 5 | start_date | date | Y | - |  |
| 6 | end_date | date | Y | - |  |
| 7 | machine | text | Y | - |  |
| 8 | priority | text | Y | 'normal'::text |  |
| 9 | status | text | Y | 'planned'::text |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 67. `production_schedules_ent`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('production_schedules_ent_id_... | 🔑 PK |
| 2 | schedule_name | text | Y | - |  |
| 3 | product | text | Y | - |  |
| 4 | quantity | integer | Y | - |  |
| 5 | machine | text | Y | - |  |
| 6 | start_date | date | Y | - |  |
| 7 | end_date | date | Y | - |  |
| 8 | shift | text | Y | - |  |
| 9 | operator | text | Y | - |  |
| 10 | priority | text | Y | 'normal'::text |  |
| 11 | status | text | Y | 'planned'::text |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

#### 68. `production_work_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('production_work_orders_id_se... | 🔑 PK |
| 2 | order_number | text | N | - | UNIQUE |
| 3 | product_name | text | N | - |  |
| 4 | bom_id | integer | Y | - |  |
| 5 | planned_start | date | Y | - |  |
| 6 | planned_end | date | Y | - |  |
| 7 | actual_start | date | Y | - |  |
| 8 | actual_end | date | Y | - |  |
| 9 | quantity_planned | numeric | Y | 0 |  |
| 10 | quantity_produced | numeric | Y | 0 |  |
| 11 | status | text | N | 'planned'::text |  |
| 12 | assigned_to | text | Y | - |  |
| 13 | priority | text | N | 'medium'::text |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp without time zone | N | now() |  |
| 16 | updated_at | timestamp without time zone | N | now() |  |
| 17 | sales_order_id | integer | Y | - |  |
| 18 | customer_name | character varying | Y | - |  |
| 19 | production_line | character varying | Y | - |  |
| 20 | machine_id | integer | Y | - |  |
| 21 | unit_cost | numeric | Y | 0 |  |
| 22 | total_cost | numeric | Y | 0 |  |
| 23 | scrap_quantity | numeric | Y | 0 |  |
| 24 | reject_quantity | numeric | Y | 0 |  |
| 25 | labor_hours | numeric | Y | 0 |  |
| 26 | setup_hours | numeric | Y | 0 |  |
| 27 | machine_hours | numeric | Y | 0 |  |
| 28 | efficiency_rate | numeric | Y | - |  |
| 29 | yield_rate | numeric | Y | - |  |
| 30 | quality_status | character varying | Y | 'pending'::character varying |  |
| 31 | quality_notes | text | Y | - |  |
| 32 | work_instructions | text | Y | - |  |
| 33 | department | character varying | Y | - |  |
| 34 | cost_center | character varying | Y | - |  |
| 35 | created_by | character varying | Y | - |  |
| 36 | approved_by | character varying | Y | - |  |
| 37 | approved_at | timestamp with time zone | Y | - |  |
| 38 | material_cost | numeric | Y | 0 |  |
| 39 | labor_cost | numeric | Y | 0 |  |
| 40 | overhead_cost | numeric | Y | 0 |  |
| 41 | batch_number | character varying | Y | - |  |
| 42 | lot_number | character varying | Y | - |  |
| 43 | routing_id | integer | Y | - |  |
| 44 | shift | character varying | Y | - |  |
| 45 | downtime_minutes | integer | Y | 0 |  |
| 46 | rework_quantity | numeric | Y | 0 |  |
| 47 | work_order_type | character varying | Y | 'standard'::character varying |  |
| 48 | customer_id | integer | Y | - |  |
| 49 | delivery_date | date | Y | - |  |
| 50 | completion_percentage | numeric | Y | 0 |  |
| 51 | parent_work_order_id | integer | Y | - |  |
| 52 | is_rework | boolean | Y | false |  |
| 53 | rework_reason | text | Y | - |  |
| 54 | original_work_order_id | integer | Y | - |  |
| 55 | tooling_required | text | Y | - |  |
| 56 | special_instructions | text | Y | - |  |
| 57 | safety_requirements | text | Y | - |  |
| 58 | raw_material_status | character varying | Y | 'pending'::character varying |  |
| 59 | cutting_status | character varying | Y | 'pending'::character varying |  |
| 60 | welding_status | character varying | Y | 'pending'::character varying |  |
| 61 | assembly_status | character varying | Y | 'pending'::character varying |  |
| 62 | painting_status | character varying | Y | 'pending'::character varying |  |
| 63 | glass_status | character varying | Y | 'pending'::character varying |  |
| 64 | packaging_status | character varying | Y | 'pending'::character varying |  |
| 65 | inspection_status | character varying | Y | 'pending'::character varying |  |
| 66 | energy_consumption_kwh | numeric | Y | 0 |  |
| 67 | waste_material_kg | numeric | Y | 0 |  |
| 68 | recycled_material_kg | numeric | Y | 0 |  |
| 69 | ambient_temperature | numeric | Y | - |  |
| 70 | humidity_percent | numeric | Y | - |  |
| 71 | operator_count | integer | Y | 1 |  |
| 72 | overtime_hours | numeric | Y | 0 |  |
| 73 | actual_unit_cost | numeric | Y | - |  |
| 74 | variance_cost | numeric | Y | 0 |  |
| 75 | work_order_number | text | Y | - |  |
| 76 | order_id | integer | Y | - |  |
| 77 | foreman | character varying | Y | - |  |
| 78 | foreman_phone | character varying | Y | - |  |
| 79 | team_members | text | Y | - |  |
| 80 | total_labor_hours | numeric | Y | 0 |  |
| 81 | total_labor_cost | numeric | Y | 0 |  |
| 82 | total_material_cost | numeric | Y | 0 |  |
| 83 | total_overhead_cost | numeric | Y | 0 |  |
| 84 | yield_pct | numeric | Y | - |  |
| 85 | rework_count | integer | Y | 0 |  |
| 86 | rework_cost | numeric | Y | 0 |  |
| 87 | downtime_reason | text | Y | - |  |
| 88 | setup_time_minutes | integer | Y | 0 |  |
| 89 | cleanup_time_minutes | integer | Y | 0 |  |
| 90 | photos_url | text | Y | - |  |
| 91 | documents_url | text | Y | - |  |
| 92 | customer_approval_required | boolean | Y | false |  |
| 93 | customer_approved | boolean | Y | false |  |
| 94 | customer_approved_date | date | Y | - |  |
| 95 | tags | text | Y | - |  |
| 96 | project_id | integer | Y | - |  |
| 97 | project_name | character varying | Y | - |  |
| 98 | sales_order_line_id | integer | Y | - |  |
| 99 | bom_version | integer | Y | - |  |
| 100 | workstation | character varying | Y | - |  |
| 101 | machine_name | character varying | Y | - |  |
| 102 | operator_id | integer | Y | - |  |
| 103 | operator_name | character varying | Y | - |  |
| 104 | supervisor_id | integer | Y | - |  |
| 105 | supervisor_name | character varying | Y | - |  |
| 106 | planned_hours | numeric | Y | - |  |
| 107 | actual_hours | numeric | Y | 0 |  |
| 108 | planned_qty | numeric | Y | - |  |
| 109 | completed_qty | numeric | Y | 0 |  |
| 110 | scrap_qty | numeric | Y | 0 |  |
| 111 | rework_qty | numeric | Y | 0 |  |
| 112 | scrap_reason | text | Y | - |  |
| 113 | oee_pct | numeric | Y | - |  |
| 114 | energy_kwh | numeric | Y | - |  |
| 115 | waste_kg | numeric | Y | - |  |
| 116 | material_consumption | text | Y | - |  |
| 117 | quality_check_required | boolean | Y | true |  |
| 118 | quality_check_passed | boolean | Y | - |  |
| 119 | quality_inspector | character varying | Y | - |  |
| 120 | quality_check_date | date | Y | - |  |
| 121 | safety_checklist_done | boolean | Y | false |  |
| 122 | safety_incident | boolean | Y | false |  |
| 123 | safety_incident_id | integer | Y | - |  |
| 124 | instruction_url | text | Y | - |  |
| 125 | drawing_url | text | Y | - |  |
| 126 | version_number | integer | Y | 1 |  |
| 127 | parent_wo_id | integer | Y | - |  |
| 128 | sub_wo_count | integer | Y | 0 |  |

#### 69. `products`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('products_id_seq'::regclass) | 🔑 PK |
| 2 | product_number | text | N | - | UNIQUE |
| 3 | product_name | text | N | - |  |
| 4 | category_id | integer | N | - | FK → product_categories.id |
| 5 | description | text | Y | - |  |
| 6 | image_path | text | Y | - |  |
| 7 | price_per_sqm_before_vat | numeric | Y | 0 |  |
| 8 | materials_cost_per_sqm | numeric | Y | 0 |  |
| 9 | price_per_sqm_after_vat | numeric | Y | 0 |  |
| 10 | gross_profit | numeric | Y | 0 |  |
| 11 | status | text | N | 'פעיל'::text |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | updated_at | timestamp without time zone | N | now() |  |
| 15 | min_stock | numeric | Y | 0 |  |
| 16 | max_stock | numeric | Y | 0 |  |
| 17 | current_stock | numeric | Y | 0 |  |
| 18 | unit | text | Y | 'יחידה'::text |  |
| 19 | sku | character varying | Y | - |  |
| 20 | barcode | character varying | Y | - |  |
| 21 | brand | character varying | Y | - |  |
| 22 | model | character varying | Y | - |  |
| 23 | weight_kg | numeric | Y | - |  |
| 24 | dimensions | character varying | Y | - |  |
| 25 | color | character varying | Y | - |  |
| 26 | material_type | character varying | Y | - |  |
| 27 | finish_type | character varying | Y | - |  |
| 28 | thickness_mm | numeric | Y | - |  |
| 29 | width_mm | numeric | Y | - |  |
| 30 | height_mm | numeric | Y | - |  |
| 31 | length_mm | numeric | Y | - |  |
| 32 | lead_time_days | integer | Y | - |  |
| 33 | warranty_months | integer | Y | - |  |
| 34 | supplier_id | integer | Y | - |  |
| 35 | supplier_name | character varying | Y | - |  |
| 36 | cost_price | numeric | Y | - |  |
| 37 | selling_price | numeric | Y | - |  |
| 38 | tax_rate | numeric | Y | 18 |  |
| 39 | is_active | boolean | Y | true |  |
| 40 | certification | character varying | Y | - |  |
| 41 | image_url | text | Y | - |  |
| 42 | technical_drawing_url | text | Y | - |  |
| 43 | product_type | character varying | Y | 'finished_good'::character varying |  |
| 44 | product_group | character varying | Y | - |  |
| 45 | product_family | character varying | Y | - |  |
| 46 | glass_type | character varying | Y | - |  |
| 47 | glass_thickness_mm | numeric | Y | - |  |
| 48 | glass_color | character varying | Y | - |  |
| 49 | glass_treatment | character varying | Y | - |  |
| 50 | frame_type | character varying | Y | - |  |
| 51 | frame_material | character varying | Y | - |  |
| 52 | frame_profile | character varying | Y | - |  |
| 53 | frame_color | character varying | Y | - |  |
| 54 | coating_type | character varying | Y | - |  |
| 55 | surface_treatment | character varying | Y | - |  |
| 56 | thermal_break | boolean | Y | false |  |
| 57 | acoustic_rating | character varying | Y | - |  |
| 58 | fire_rating | character varying | Y | - |  |
| 59 | wind_resistance | character varying | Y | - |  |
| 60 | water_resistance | character varying | Y | - |  |
| 61 | security_level | character varying | Y | - |  |
| 62 | energy_rating | character varying | Y | - |  |
| 63 | si_standard | character varying | Y | - |  |
| 64 | iso_standard | character varying | Y | - |  |
| 65 | production_time_hours | numeric | Y | - |  |
| 66 | assembly_time_hours | numeric | Y | - |  |
| 67 | installation_time_hours | numeric | Y | - |  |
| 68 | min_order_quantity | numeric | Y | 1 |  |
| 69 | max_dimension_width_mm | numeric | Y | - |  |
| 70 | max_dimension_height_mm | numeric | Y | - |  |
| 71 | standard_width_mm | numeric | Y | - |  |
| 72 | standard_height_mm | numeric | Y | - |  |
| 73 | requires_measurement | boolean | Y | true |  |
| 74 | requires_installation | boolean | Y | true |  |
| 75 | installation_type | character varying | Y | - |  |
| 76 | hardware_included | boolean | Y | true |  |
| 77 | hardware_type | character varying | Y | - |  |
| 78 | handle_type | character varying | Y | - |  |
| 79 | lock_type | character varying | Y | - |  |
| 80 | hinge_type | character varying | Y | - |  |
| 81 | seal_type | character varying | Y | - |  |
| 82 | opening_direction | character varying | Y | - |  |
| 83 | opening_type | character varying | Y | - |  |
| 84 | panels_count | integer | Y | 1 |  |
| 85 | custom_design | boolean | Y | false |  |
| 86 | drawing_required | boolean | Y | false |  |
| 87 | drawing_url | text | Y | - |  |
| 88 | bom_id | integer | Y | - |  |
| 89 | production_line | character varying | Y | - |  |
| 90 | quality_standard | character varying | Y | - |  |
| 91 | test_required | boolean | Y | false |  |
| 92 | packaging_type | character varying | Y | - |  |
| 93 | packaging_instructions | text | Y | - |  |
| 94 | transport_requirements | text | Y | - |  |
| 95 | country_of_origin | character varying | Y | 'ישראל'::character varying |  |
| 96 | customs_code | character varying | Y | - |  |
| 97 | discontinued | boolean | Y | false |  |
| 98 | discontinued_date | date | Y | - |  |
| 99 | replacement_product_id | integer | Y | - |  |
| 100 | safety_data_sheet_url | text | Y | - |  |
| 101 | qr_code | text | Y | - |  |
| 102 | series | text | Y | - |  |
| 103 | revision | text | Y | - |  |
| 104 | lifecycle_status | character varying | Y | 'active'::character varying |  |
| 105 | min_order_qty | numeric | Y | 1 |  |
| 106 | max_order_qty | numeric | Y | - |  |
| 107 | order_multiple | numeric | Y | 1 |  |
| 108 | lead_time_production_days | integer | Y | - |  |
| 109 | lead_time_delivery_days | integer | Y | - |  |
| 110 | shelf_life_days | integer | Y | - |  |
| 111 | tariff_code | character varying | Y | - |  |
| 112 | export_controlled | boolean | Y | false |  |
| 113 | hazardous | boolean | Y | false |  |
| 114 | hazard_class | character varying | Y | - |  |
| 115 | msds_url | text | Y | - |  |
| 116 | labor_cost_per_unit | numeric | Y | 0 |  |
| 117 | overhead_cost_per_unit | numeric | Y | 0 |  |
| 118 | material_cost_per_unit | numeric | Y | 0 |  |
| 119 | total_cost_per_unit | numeric | Y | 0 |  |
| 120 | markup_pct | numeric | Y | - |  |
| 121 | margin_pct | numeric | Y | - |  |
| 122 | price_list_id | integer | Y | - |  |
| 123 | volume_discount_eligible | boolean | Y | false |  |
| 124 | tax_category | character varying | Y | - |  |
| 125 | vat_rate | numeric | Y | 18 |  |
| 126 | photo_urls | text | Y | - |  |
| 127 | installation_guide_url | text | Y | - |  |
| 128 | video_url | text | Y | - |  |
| 129 | related_products | text | Y | - |  |
| 130 | accessories | text | Y | - |  |
| 131 | spare_parts | text | Y | - |  |
| 132 | customer_rating | numeric | Y | - |  |
| 133 | total_sold | integer | Y | 0 |  |
| 134 | total_produced | integer | Y | 0 |  |
| 135 | last_sold_date | date | Y | - |  |
| 136 | last_produced_date | date | Y | - |  |
| 137 | avg_production_time_hours | numeric | Y | - |  |
| 138 | defect_rate_pct | numeric | Y | - |  |
| 139 | return_rate_pct | numeric | Y | - |  |

#### 70. `products_demo`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('products_demo_id_seq'::regcl... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | price | integer | N | - |  |
| 4 | category | text | N | - |  |
| 5 | stock_quantity | integer | N | 0 |  |

#### 71. `transport_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('transport_orders_id_seq'::re... | 🔑 PK |
| 2 | transport_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | packing_list_id | integer | Y | - |  |
| 5 | customer_name | text | Y | - |  |
| 6 | pickup_address | text | Y | - |  |
| 7 | delivery_address | text | N | - |  |
| 8 | delivery_floor | integer | Y | - |  |
| 9 | has_crane_access | boolean | Y | false |  |
| 10 | has_elevator_access | boolean | Y | false |  |
| 11 | site_contact_name | text | Y | - |  |
| 12 | site_contact_phone | text | Y | - |  |
| 13 | vehicle_type | text | Y | 'truck'::text |  |
| 14 | vehicle_number | text | Y | - |  |
| 15 | driver_name | text | Y | - |  |
| 16 | driver_phone | text | Y | - |  |
| 17 | total_weight | numeric | Y | - |  |
| 18 | total_pieces | integer | Y | - |  |
| 19 | requires_crane | boolean | Y | false |  |
| 20 | scheduled_date | date | Y | - |  |
| 21 | scheduled_time | text | Y | - |  |
| 22 | actual_delivery_at | timestamp without time zone | Y | - |  |
| 23 | delivery_confirmed_by | text | Y | - |  |
| 24 | receiver_signature | text | Y | - |  |
| 25 | damage_report | text | Y | - |  |
| 26 | photos_json | jsonb | Y | - |  |
| 27 | transport_cost | numeric | Y | - |  |
| 28 | assigned_to | text | Y | - |  |
| 29 | priority | text | Y | 'normal'::text |  |
| 30 | status | text | N | 'scheduled'::text |  |
| 31 | notes | text | Y | - |  |
| 32 | created_at | timestamp without time zone | Y | now() |  |
| 33 | updated_at | timestamp without time zone | Y | now() |  |

#### 72. `welding_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('welding_orders_id_seq'::regc... | 🔑 PK |
| 2 | welding_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | assembly_order_id | integer | Y | - |  |
| 6 | product_name | text | Y | - |  |
| 7 | material | text | Y | 'steel'::text |  |
| 8 | weld_type | text | Y | 'MIG'::text |  |
| 9 | joint_type | text | Y | - |  |
| 10 | weld_position | text | Y | - |  |
| 11 | filler_material | text | Y | - |  |
| 12 | shielding_gas | text | Y | - |  |
| 13 | pre_heat_temp_c | numeric | Y | - |  |
| 14 | interpass_temp_c | numeric | Y | - |  |
| 15 | amperage_range | text | Y | - |  |
| 16 | voltage_range | text | Y | - |  |
| 17 | weld_length_mm | numeric | Y | - |  |
| 18 | throat_thickness_mm | numeric | Y | - |  |
| 19 | wps_number | text | Y | - |  |
| 20 | welder_cert_number | text | Y | - |  |
| 21 | assigned_to | text | Y | - |  |
| 22 | machine_id | integer | Y | - |  |
| 23 | estimated_minutes | integer | Y | - |  |
| 24 | actual_minutes | integer | Y | - |  |
| 25 | inspection_type | text | Y | - |  |
| 26 | inspection_result | text | Y | - |  |
| 27 | priority | text | Y | 'normal'::text |  |
| 28 | status | text | N | 'pending'::text |  |
| 29 | started_at | timestamp without time zone | Y | - |  |
| 30 | completed_at | timestamp without time zone | Y | - |  |
| 31 | notes | text | Y | - |  |
| 32 | created_at | timestamp without time zone | Y | now() |  |
| 33 | updated_at | timestamp without time zone | Y | now() |  |

#### 73. `work_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('work_orders_id_seq'::regclass) | 🔑 PK |
| 2 | order_number | character varying | N | - | UNIQUE |
| 3 | order_type | character varying | N | 'production'::character varying |  |
| 4 | title | text | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | priority | character varying | Y | 'medium'::character varying |  |
| 7 | status | character varying | Y | 'draft'::character varying |  |
| 8 | department | character varying | Y | - |  |
| 9 | assigned_to | text | Y | - |  |
| 10 | assigned_team | text | Y | - |  |
| 11 | customer_name | text | Y | - |  |
| 12 | project_name | text | Y | - |  |
| 13 | product_name | text | Y | - |  |
| 14 | product_code | character varying | Y | - |  |
| 15 | quantity_ordered | numeric | Y | 0 |  |
| 16 | quantity_completed | numeric | Y | 0 |  |
| 17 | quantity_rejected | numeric | Y | 0 |  |
| 18 | completion_percentage | numeric | Y | - |  |
| 19 | unit_of_measure | character varying | Y | 'יחידה'::character varying |  |
| 20 | start_date | date | Y | - |  |
| 21 | due_date | date | Y | - |  |
| 22 | actual_start_date | date | Y | - |  |
| 23 | actual_end_date | date | Y | - |  |
| 24 | estimated_hours | numeric | Y | 0 |  |
| 25 | actual_hours | numeric | Y | 0 |  |
| 26 | material_cost | numeric | Y | 0 |  |
| 27 | labor_cost | numeric | Y | 0 |  |
| 28 | overhead_cost | numeric | Y | 0 |  |
| 29 | total_cost | numeric | Y | - |  |
| 30 | machine_name | character varying | Y | - |  |
| 31 | work_center | character varying | Y | - |  |
| 32 | routing_steps | text | Y | - |  |
| 33 | quality_notes | text | Y | - |  |
| 34 | safety_notes | text | Y | - |  |
| 35 | notes | text | Y | - |  |
| 36 | created_by | integer | Y | - |  |
| 37 | created_by_name | text | Y | - |  |
| 38 | approved_by_name | text | Y | - |  |
| 39 | created_at | timestamp with time zone | Y | now() |  |
| 40 | updated_at | timestamp with time zone | Y | now() |  |
| 41 | estimated_cost | numeric | Y | - |  |
| 42 | actual_cost | numeric | Y | - |  |
| 43 | completion_percent | numeric | Y | 0 |  |
| 44 | sales_order_id | integer | Y | - |  |
| 45 | project_id | integer | Y | - |  |
| 46 | production_line | character varying | Y | - |  |
| 47 | machine | character varying | Y | - |  |
| 48 | cost_center | character varying | Y | - |  |
| 49 | approved_by | character varying | Y | - |  |
| 50 | approved_at | timestamp with time zone | Y | - |  |
| 51 | quality_status | character varying | Y | - |  |
| 52 | safety_checklist_done | boolean | Y | false |  |
| 53 | drawing_number | character varying | Y | - |  |
| 54 | drawing_revision | character varying | Y | - |  |
| 55 | customer_phone | character varying | Y | - |  |
| 56 | site_address | text | Y | - |  |
| 57 | safety_requirements | text | Y | - |  |
| 58 | quality_standard | character varying | Y | - |  |
| 59 | scrap_rate | numeric | Y | - |  |
| 60 | rework_count | integer | Y | 0 |  |
| 61 | machine_id | integer | Y | - |  |
| 62 | setup_time_minutes | integer | Y | - |  |
| 63 | work_order_number | character varying | Y | - |  |
| 64 | customer_id | integer | Y | - |  |
| 65 | product_id | integer | Y | - |  |
| 66 | bom_id | integer | Y | - |  |
| 67 | routing_id | integer | Y | - |  |
| 68 | workstation | character varying | Y | - |  |
| 69 | operator_id | integer | Y | - |  |
| 70 | operator_name | character varying | Y | - |  |
| 71 | supervisor_id | integer | Y | - |  |
| 72 | supervisor_name | character varying | Y | - |  |
| 73 | planned_hours | numeric | Y | - |  |
| 74 | setup_hours | numeric | Y | 0 |  |
| 75 | planned_qty | numeric | Y | - |  |
| 76 | completed_qty | numeric | Y | 0 |  |
| 77 | scrap_qty | numeric | Y | 0 |  |
| 78 | rework_qty | numeric | Y | 0 |  |
| 79 | yield_pct | numeric | Y | - |  |
| 80 | oee_pct | numeric | Y | - |  |
| 81 | energy_consumption | numeric | Y | - |  |
| 82 | waste_generated | numeric | Y | - |  |
| 83 | quality_check_required | boolean | Y | true |  |
| 84 | quality_check_passed | boolean | Y | - |  |
| 85 | quality_inspector | character varying | Y | - |  |
| 86 | photos_url | text | Y | - |  |
| 87 | documents_url | text | Y | - |  |
| 88 | tags | text | Y | - |  |
| 89 | parent_wo_id | integer | Y | - |  |
| 90 | sub_wo_count | integer | Y | 0 |  |
| 91 | shift | character varying | Y | - |  |
| 92 | planned_start | timestamp with time zone | Y | - |  |
| 93 | planned_end | timestamp with time zone | Y | - |  |
| 94 | actual_start | timestamp with time zone | Y | - |  |
| 95 | actual_end | timestamp with time zone | Y | - |  |
| 96 | instruction_url | text | Y | - |  |
| 97 | drawing_url | text | Y | - |  |
| 98 | version_number | integer | Y | 1 |  |
| 99 | energy_kwh | numeric | Y | - |  |
| 100 | waste_kg | numeric | Y | - |  |
| 101 | material_consumption | text | Y | - |  |

---

### כללי (General) (99 טבלאות)

#### 74. `accounts_payable`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('accounts_payable_id_seq'::re... | 🔑 PK |
| 2 | invoice_number | character varying | N | - |  |
| 3 | supplier_id | integer | Y | - | FK → suppliers.id |
| 4 | supplier_name | text | N | - |  |
| 5 | invoice_date | date | N | - |  |
| 6 | due_date | date | N | - |  |
| 7 | amount | numeric | N | - |  |
| 8 | paid_amount | numeric | Y | 0 |  |
| 9 | balance_due | numeric | Y | - |  |
| 10 | currency | character varying | Y | 'ILS'::character varying |  |
| 11 | status | character varying | Y | 'open'::character varying |  |
| 12 | payment_terms | character varying | Y | - |  |
| 13 | description | text | Y | - |  |
| 14 | category | character varying | Y | - |  |
| 15 | project_id | integer | Y | - |  |
| 16 | purchase_order_id | integer | Y | - | FK → purchase_orders.id |
| 17 | created_at | timestamp with time zone | Y | now() |  |
| 18 | updated_at | timestamp with time zone | Y | now() |  |
| 19 | ap_number | character varying | Y | - |  |
| 20 | vat_amount | numeric | Y | 0 |  |
| 21 | net_amount | numeric | Y | 0 |  |
| 22 | withholding_tax | numeric | Y | 0 |  |
| 23 | discount_percent | numeric | Y | 0 |  |
| 24 | discount_amount | numeric | Y | 0 |  |
| 25 | discount_date | date | Y | - |  |
| 26 | approved_by | integer | Y | - |  |
| 27 | approved_by_name | text | Y | - |  |
| 28 | approved_at | timestamp with time zone | Y | - |  |
| 29 | gl_account | character varying | Y | - |  |
| 30 | gl_account_name | text | Y | - |  |
| 31 | cost_center | character varying | Y | - |  |
| 32 | department | character varying | Y | - |  |
| 33 | project_name | text | Y | - |  |
| 34 | payment_method | character varying | Y | - |  |
| 35 | bank_account | character varying | Y | - |  |
| 36 | check_number | character varying | Y | - |  |
| 37 | receipt_number | character varying | Y | - |  |
| 38 | notes | text | Y | - |  |
| 39 | tags | text | Y | - |  |
| 40 | priority | character varying | Y | 'normal'::character varying |  |
| 41 | is_recurring | boolean | Y | false |  |
| 42 | recurring_frequency | character varying | Y | - |  |
| 43 | aging_bucket | character varying | Y | - |  |
| 44 | days_overdue | integer | Y | 0 |  |
| 45 | contact_person | text | Y | - |  |
| 46 | contact_phone | character varying | Y | - |  |
| 47 | contact_email | character varying | Y | - |  |
| 48 | attachment_url | text | Y | - |  |
| 49 | three_way_match | boolean | Y | false |  |
| 50 | po_matched | boolean | Y | false |  |
| 51 | grn_matched | boolean | Y | false |  |
| 52 | grn_number | character varying | Y | - |  |
| 53 | payment_priority | character varying | Y | 'normal'::character varying |  |
| 54 | payment_reference | character varying | Y | - |  |
| 55 | payment_date | date | Y | - |  |
| 56 | early_payment_discount | numeric | Y | 0 |  |
| 57 | early_payment_date | date | Y | - |  |
| 58 | recurring | boolean | Y | false |  |
| 59 | tax_invoice_number | character varying | Y | - |  |
| 60 | deduction_tax_amount | numeric | Y | 0 |  |
| 61 | exchange_rate | numeric | Y | 1 |  |
| 62 | foreign_amount | numeric | Y | - |  |
| 63 | created_by | character varying | Y | - |  |
| 64 | supplier_invoice_number | character varying | Y | - |  |
| 65 | supplier_invoice_date | date | Y | - |  |
| 66 | goods_receipt_id | integer | Y | - |  |
| 67 | match_status | character varying | Y | - |  |
| 68 | price_variance | numeric | Y | 0 |  |
| 69 | quantity_variance | numeric | Y | 0 |  |
| 70 | subtotal | numeric | Y | 0 |  |
| 71 | early_payment_discount_pct | numeric | Y | - |  |
| 72 | withholding_tax_amount | numeric | Y | 0 |  |
| 73 | retention_amount | numeric | Y | 0 |  |
| 74 | amount_paid | numeric | Y | 0 |  |
| 75 | payment_bank | character varying | Y | - |  |
| 76 | scheduled_payment_date | date | Y | - |  |
| 77 | payment_batch_id | integer | Y | - |  |
| 78 | dispute | boolean | Y | false |  |
| 79 | dispute_reason | text | Y | - |  |
| 80 | dispute_resolved_date | date | Y | - |  |
| 81 | documents_url | text | Y | - |  |

#### 75. `accounts_receivable`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('accounts_receivable_id_seq':... | 🔑 PK |
| 2 | invoice_number | character varying | N | - |  |
| 3 | customer_name | text | N | - |  |
| 4 | customer_phone | character varying | Y | - |  |
| 5 | customer_email | character varying | Y | - |  |
| 6 | invoice_date | date | N | - |  |
| 7 | due_date | date | N | - |  |
| 8 | amount | numeric | N | - |  |
| 9 | paid_amount | numeric | Y | 0 |  |
| 10 | balance_due | numeric | Y | - |  |
| 11 | currency | character varying | Y | 'ILS'::character varying |  |
| 12 | status | character varying | Y | 'open'::character varying |  |
| 13 | payment_terms | character varying | Y | - |  |
| 14 | description | text | Y | - |  |
| 15 | category | character varying | Y | - |  |
| 16 | project_id | integer | Y | - |  |
| 17 | created_at | timestamp with time zone | Y | now() |  |
| 18 | updated_at | timestamp with time zone | Y | now() |  |
| 19 | ar_number | character varying | Y | - |  |
| 20 | customer_id | integer | Y | - |  |
| 21 | vat_amount | numeric | Y | 0 |  |
| 22 | net_amount | numeric | Y | 0 |  |
| 23 | withholding_tax | numeric | Y | 0 |  |
| 24 | discount_percent | numeric | Y | 0 |  |
| 25 | discount_amount | numeric | Y | 0 |  |
| 26 | discount_date | date | Y | - |  |
| 27 | gl_account | character varying | Y | - |  |
| 28 | gl_account_name | text | Y | - |  |
| 29 | cost_center | character varying | Y | - |  |
| 30 | department | character varying | Y | - |  |
| 31 | project_name | text | Y | - |  |
| 32 | payment_method | character varying | Y | - |  |
| 33 | bank_account | character varying | Y | - |  |
| 34 | check_number | character varying | Y | - |  |
| 35 | receipt_number | character varying | Y | - |  |
| 36 | notes | text | Y | - |  |
| 37 | tags | text | Y | - |  |
| 38 | priority | character varying | Y | 'normal'::character varying |  |
| 39 | salesperson | text | Y | - |  |
| 40 | contact_person | text | Y | - |  |
| 41 | contact_phone | character varying | Y | - |  |
| 42 | contact_email_secondary | character varying | Y | - |  |
| 43 | dunning_level | integer | Y | 0 |  |
| 44 | last_dunning_date | date | Y | - |  |
| 45 | dunning_blocked | boolean | Y | false |  |
| 46 | days_overdue | integer | Y | 0 |  |
| 47 | aging_bucket | character varying | Y | - |  |
| 48 | credit_limit | numeric | Y | 0 |  |
| 49 | order_number | character varying | Y | - |  |
| 50 | delivery_note | character varying | Y | - |  |
| 51 | attachment_url | text | Y | - |  |
| 52 | collection_notes | text | Y | - |  |
| 53 | collection_status | character varying | Y | - |  |
| 54 | collection_agent | character varying | Y | - |  |
| 55 | disputed | boolean | Y | false |  |
| 56 | dispute_reason | text | Y | - |  |
| 57 | dispute_date | date | Y | - |  |
| 58 | credit_memo_number | character varying | Y | - |  |
| 59 | write_off_amount | numeric | Y | 0 |  |
| 60 | write_off_date | date | Y | - |  |
| 61 | write_off_reason | text | Y | - |  |
| 62 | interest_amount | numeric | Y | 0 |  |
| 63 | late_fee_amount | numeric | Y | 0 |  |
| 64 | sales_order_id | integer | Y | - |  |
| 65 | created_by | character varying | Y | - |  |
| 66 | customer_contact | character varying | Y | - |  |
| 67 | last_reminder_date | date | Y | - |  |
| 68 | reminder_count | integer | Y | 0 |  |
| 69 | next_reminder_date | date | Y | - |  |
| 70 | dispute_amount | numeric | Y | 0 |  |
| 71 | dispute_resolved | boolean | Y | false |  |
| 72 | promise_to_pay_date | date | Y | - |  |
| 73 | promise_to_pay_amount | numeric | Y | - |  |
| 74 | write_off_approved_by | character varying | Y | - |  |
| 75 | interest_charged | numeric | Y | 0 |  |
| 76 | legal_action | boolean | Y | false |  |
| 77 | legal_action_date | date | Y | - |  |
| 78 | credit_hold | boolean | Y | false |  |
| 79 | payment_plan | text | Y | - |  |
| 80 | last_payment_date | date | Y | - |  |
| 81 | last_payment_amount | numeric | Y | - |  |

#### 76. `adjusting_entries`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('adjusting_entries_id_seq'::r... | 🔑 PK |
| 2 | entry_number | text | N | - |  |
| 3 | entry_date | date | N | CURRENT_DATE |  |
| 4 | entry_type | text | Y | 'accrual'::text |  |
| 5 | account_number | text | Y | - |  |
| 6 | account_name | text | Y | - |  |
| 7 | debit_amount | numeric | Y | 0 |  |
| 8 | credit_amount | numeric | Y | 0 |  |
| 9 | description | text | Y | - |  |
| 10 | period_start | date | Y | - |  |
| 11 | period_end | date | Y | - |  |
| 12 | fiscal_year | integer | Y | - |  |
| 13 | fiscal_period | integer | Y | - |  |
| 14 | status | text | Y | 'draft'::text |  |
| 15 | approved_by | text | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp with time zone | Y | now() |  |
| 18 | updated_at | timestamp with time zone | Y | now() |  |
| 19 | fiscal_month | integer | Y | - |  |
| 20 | debit_account_id | integer | Y | - |  |
| 21 | debit_account_number | character varying | Y | - |  |
| 22 | debit_account_name | character varying | Y | - |  |
| 23 | credit_account_id | integer | Y | - |  |
| 24 | credit_account_number | character varying | Y | - |  |
| 25 | credit_account_name | character varying | Y | - |  |
| 26 | amount | numeric | Y | - |  |
| 27 | currency | character varying | Y | 'ILS'::character varying |  |
| 28 | reversal_entry | boolean | Y | false |  |
| 29 | reversal_date | date | Y | - |  |
| 30 | reversal_of_id | integer | Y | - |  |
| 31 | recurring | boolean | Y | false |  |
| 32 | recurrence_pattern | character varying | Y | - |  |
| 33 | journal_entry_id | integer | Y | - |  |
| 34 | approved_at | timestamp with time zone | Y | - |  |
| 35 | posted | boolean | Y | false |  |
| 36 | tags | text | Y | - |  |

#### 77. `agent_activity_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('agent_activity_logs_id_seq':... | 🔑 PK |
| 2 | agent_id | text | N | - |  |
| 3 | action | text | N | - |  |
| 4 | status | text | N | 'success'::text |  |
| 5 | details | text | Y | - |  |
| 6 | created_at | timestamp without time zone | N | now() |  |

#### 78. `auto_number_counters`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('auto_number_counters_id_seq'... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | field_slug | text | N | - |  |
| 4 | prefix | text | N | ''::text |  |
| 5 | suffix | text | N | ''::text |  |
| 6 | padding | integer | N | 4 |  |
| 7 | current_value | integer | N | 0 |  |
| 8 | start_value | integer | N | 1 |  |
| 9 | increment_by | integer | N | 1 |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | entity_type | character varying | Y | - |  |
| 14 | current_number | integer | Y | 0 |  |
| 15 | number_format | character varying | Y | - |  |
| 16 | fiscal_year | integer | Y | - |  |
| 17 | reset_annually | boolean | Y | true |  |
| 18 | is_active | boolean | Y | true |  |
| 19 | tags | text | Y | - |  |

#### 79. `balanced_scorecard_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('balanced_scorecard_items_id_... | 🔑 PK |
| 2 | perspective | text | N | - |  |
| 3 | objective | text | N | - |  |
| 4 | measure | text | Y | - |  |
| 5 | target | text | Y | - |  |
| 6 | actual | text | Y | - |  |
| 7 | status | text | Y | 'on_track'::text |  |
| 8 | weight | integer | Y | 1 |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 80. `business_plan_sections`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('business_plan_sections_id_se... | 🔑 PK |
| 2 | plan_name | text | Y | - |  |
| 3 | version | text | Y | '1.0'::text |  |
| 4 | section_type | text | Y | - |  |
| 5 | title | text | Y | - |  |
| 6 | content | text | Y | - |  |
| 7 | order | integer | Y | 0 |  |
| 8 | status | text | Y | 'draft'::text |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 81. `competitive_analyses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('competitive_analyses_id_seq'... | 🔑 PK |
| 2 | competitor_name | text | Y | - |  |
| 3 | product_market | text | Y | - |  |
| 4 | strengths | text | Y | - |  |
| 5 | weaknesses | text | Y | - |  |
| 6 | our_advantage | text | Y | - |  |
| 7 | threat_level | text | Y | 'medium'::text |  |
| 8 | date | date | Y | now() |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 82. `contacts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('contacts_id_seq'::regclass) | 🔑 PK |
| 2 | customer_id | integer | Y | - | FK → customers.id |
| 3 | first_name | text | Y | - |  |
| 4 | last_name | text | Y | - |  |
| 5 | title | text | Y | - |  |
| 6 | department | text | Y | - |  |
| 7 | email | text | Y | - |  |
| 8 | phone | text | Y | - |  |
| 9 | mobile | text | Y | - |  |
| 10 | is_primary | boolean | Y | false |  |
| 11 | is_billing_contact | boolean | Y | false |  |
| 12 | is_shipping_contact | boolean | Y | false |  |
| 13 | preferred_contact_method | text | Y | 'phone'::text |  |
| 14 | birthday | date | Y | - |  |
| 15 | notes | text | Y | - |  |
| 16 | is_active | boolean | Y | true |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | updated_at | timestamp without time zone | N | now() |  |

#### 83. `credit_card_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('credit_card_transactions_id_... | 🔑 PK |
| 2 | customer_name | character varying | Y | - |  |
| 3 | customer_id | integer | Y | - |  |
| 4 | amount | numeric | Y | 0 |  |
| 5 | card_last4 | character varying | Y | - |  |
| 6 | card_type | character varying | Y | - |  |
| 7 | source | character varying | Y | - |  |
| 8 | status | character varying | Y | 'pending'::character varying |  |
| 9 | linked_document | character varying | Y | - |  |
| 10 | products | text | Y | - |  |
| 11 | description | text | Y | - |  |
| 12 | installments | integer | Y | 1 |  |
| 13 | transaction_date | date | Y | CURRENT_DATE |  |
| 14 | approval_number | character varying | Y | - |  |
| 15 | terminal_number | character varying | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |
| 18 | card_name | character varying | Y | - |  |
| 19 | card_holder | character varying | Y | - |  |
| 20 | card_company | character varying | Y | - |  |
| 21 | merchant_name | character varying | Y | - |  |
| 22 | merchant_category | character varying | Y | - |  |
| 23 | merchant_id | character varying | Y | - |  |
| 24 | original_amount | numeric | Y | - |  |
| 25 | original_currency | character varying | Y | - |  |
| 26 | exchange_rate | numeric | Y | - |  |
| 27 | amount_ils | numeric | Y | - |  |
| 28 | vat_amount | numeric | Y | 0 |  |
| 29 | vat_rate | numeric | Y | 18 |  |
| 30 | vat_reclaimable | boolean | Y | true |  |
| 31 | installment_number | integer | Y | 1 |  |
| 32 | installment_amount | numeric | Y | - |  |
| 33 | first_installment_amount | numeric | Y | - |  |
| 34 | department | character varying | Y | - |  |
| 35 | employee_id | integer | Y | - |  |
| 36 | employee_name | character varying | Y | - |  |
| 37 | cost_center | character varying | Y | - |  |
| 38 | project_id | integer | Y | - |  |
| 39 | project_name | character varying | Y | - |  |
| 40 | budget_code | character varying | Y | - |  |
| 41 | gl_account_id | integer | Y | - |  |
| 42 | gl_account_name | character varying | Y | - |  |
| 43 | journal_entry_id | integer | Y | - |  |
| 44 | reconciled | boolean | Y | false |  |
| 45 | reconciled_date | date | Y | - |  |
| 46 | statement_date | date | Y | - |  |
| 47 | statement_amount | numeric | Y | - |  |
| 48 | receipt_url | text | Y | - |  |
| 49 | documents_url | text | Y | - |  |
| 50 | approved_by | character varying | Y | - |  |
| 51 | approved_at | timestamp with time zone | Y | - |  |
| 52 | personal_expense | boolean | Y | false |  |
| 53 | tags | text | Y | - |  |

#### 84. `cross_module_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cross_module_transactions_id... | 🔑 PK |
| 2 | transaction_id | text | N | - | UNIQUE |
| 3 | flow_name | text | N | - |  |
| 4 | from_module | text | N | - |  |
| 5 | to_module | text | N | - |  |
| 6 | action | text | N | 'flow'::text |  |
| 7 | status | text | N | 'completed'::text |  |
| 8 | source_entity_type | text | Y | - |  |
| 9 | source_entity_id | integer | Y | - |  |
| 10 | target_entity_type | text | Y | - |  |
| 11 | target_entity_id | integer | Y | - |  |
| 12 | amount | numeric | Y | - |  |
| 13 | currency | text | Y | 'ILS'::text |  |
| 14 | params | jsonb | Y | - |  |
| 15 | result_summary | text | Y | - |  |
| 16 | duration_ms | integer | Y | - |  |
| 17 | user_id | integer | Y | - |  |
| 18 | user_name | text | Y | - |  |
| 19 | error_message | text | Y | - |  |
| 20 | created_at | timestamp with time zone | Y | now() |  |

#### 85. `currencies`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | code | character varying | N | - | UNIQUE |
| 3 | name | character varying | Y | - |  |
| 4 | symbol | character varying | Y | - |  |
| 5 | exchange_rate_to_ils | numeric | Y | 1 |  |
| 6 | last_updated | timestamp without time zone | Y | now() |  |
| 7 | is_active | boolean | Y | true |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 86. `data_flow_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('data_flow_definitions_id_seq... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | source | text | Y | - |  |
| 5 | target | text | Y | - |  |
| 6 | schedule | text | Y | - |  |
| 7 | status | text | Y | 'active'::text |  |
| 8 | last_run | timestamp without time zone | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 87. `decision_models`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('decision_models_id_seq'::reg... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | model_type | character varying | Y | 'pricing'::character varying |  |
| 4 | parameters | jsonb | Y | '{}'::jsonb |  |
| 5 | weights | jsonb | Y | '{}'::jsonb |  |
| 6 | threshold_values | jsonb | Y | '{}'::jsonb |  |
| 7 | result_history | jsonb | Y | '[]'::jsonb |  |
| 8 | is_active | boolean | Y | true |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 88. `departments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('departments_id_seq'::regclass) | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | name_en | character varying | Y | - |  |
| 4 | manager_name | character varying | Y | - |  |
| 5 | manager_id | integer | Y | - |  |
| 6 | parent_department_id | integer | Y | - | FK → departments.id |
| 7 | description | text | Y | - |  |
| 8 | budget | integer | Y | 0 |  |
| 9 | employee_count | integer | Y | 0 |  |
| 10 | location | character varying | Y | - |  |
| 11 | phone | character varying | Y | - |  |
| 12 | email | character varying | Y | - |  |
| 13 | cost_center | character varying | Y | - |  |
| 14 | status | character varying | Y | 'active'::character varying |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |
| 18 | code | text | Y | - |  |
| 19 | manager | text | Y | - |  |
| 20 | parent_department | text | Y | - |  |

#### 89. `detail_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('detail_definitions_id_seq'::... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | sections | jsonb | Y | '[]'::jsonb |  |
| 6 | settings | jsonb | Y | '{}'::jsonb |  |
| 7 | is_default | boolean | N | false |  |
| 8 | show_related_records | boolean | N | true |  |
| 9 | created_at | timestamp without time zone | N | now() |  |
| 10 | updated_at | timestamp without time zone | N | now() |  |
| 11 | header_fields | jsonb | Y | '[]'::jsonb |  |
| 12 | tabs | jsonb | Y | '[]'::jsonb |  |
| 13 | related_lists | jsonb | Y | '[]'::jsonb |  |
| 14 | action_bar | jsonb | Y | '[]'::jsonb |  |
| 15 | detail_code | character varying | Y | - |  |
| 16 | detail_name | character varying | Y | - |  |
| 17 | entity_type | character varying | Y | - |  |
| 18 | layout | text | Y | - |  |
| 19 | sections_config | text | Y | - |  |
| 20 | tabs_config | text | Y | - |  |
| 21 | actions_config | text | Y | - |  |
| 22 | is_active | boolean | Y | true |  |
| 23 | tags | text | Y | - |  |

#### 90. `email_sync_accounts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | user_id | uuid | Y | - |  |
| 3 | provider | character varying | Y | 'gmail'::character varying |  |
| 4 | email_address | character varying | Y | - |  |
| 5 | oauth_token_ref | text | Y | - |  |
| 6 | sync_enabled | boolean | Y | true |  |
| 7 | last_sync_at | timestamp without time zone | Y | - |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 91. `entity_categories`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('entity_categories_id_seq'::r... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | parent_id | integer | Y | - |  |
| 4 | name | text | N | - |  |
| 5 | slug | text | N | - |  |
| 6 | icon | text | Y | - |  |
| 7 | color | text | Y | - |  |
| 8 | sort_order | integer | N | 0 |  |
| 9 | is_active | boolean | N | true |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | category_code | character varying | Y | - |  |
| 13 | category_name | character varying | Y | - |  |
| 14 | entity_type | character varying | Y | - |  |
| 15 | tags | text | Y | - |  |

#### 92. `entity_fields`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('entity_fields_id_seq'::regcl... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | field_type | text | N | - |  |
| 6 | group_name | text | Y | - |  |
| 7 | description | text | Y | - |  |
| 8 | placeholder | text | Y | - |  |
| 9 | help_text | text | Y | - |  |
| 10 | is_required | boolean | N | false |  |
| 11 | is_unique | boolean | N | false |  |
| 12 | is_searchable | boolean | N | true |  |
| 13 | is_sortable | boolean | N | true |  |
| 14 | show_in_list | boolean | N | true |  |
| 15 | show_in_form | boolean | N | true |  |
| 16 | show_in_detail | boolean | N | true |  |
| 17 | default_value | text | Y | - |  |
| 18 | validation_rules | jsonb | Y | '{}'::jsonb |  |
| 19 | display_rules | jsonb | Y | '{}'::jsonb |  |
| 20 | options | jsonb | Y | '[]'::jsonb |  |
| 21 | related_entity_id | integer | Y | - |  |
| 22 | related_display_field | text | Y | - |  |
| 23 | sort_order | integer | N | 0 |  |
| 24 | field_width | text | N | 'full'::text |  |
| 25 | settings | jsonb | Y | '{}'::jsonb |  |
| 26 | created_at | timestamp without time zone | N | now() |  |
| 27 | updated_at | timestamp without time zone | N | now() |  |
| 28 | name_he | text | Y | - |  |
| 29 | name_en | text | Y | - |  |
| 30 | field_key | text | Y | - |  |
| 31 | is_system_field | boolean | N | false |  |
| 32 | is_calculated | boolean | N | false |  |
| 33 | formula_expression | text | Y | - |  |
| 34 | options_json | jsonb | Y | - |  |
| 35 | relation_type | text | Y | - |  |
| 36 | min_value | text | Y | - |  |
| 37 | max_value | text | Y | - |  |
| 38 | max_length | integer | Y | - |  |
| 39 | section_key | text | Y | - |  |
| 40 | tab_key | text | Y | - |  |
| 41 | is_filterable | boolean | N | true |  |
| 42 | is_read_only | boolean | N | false |  |

#### 93. `entity_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('entity_records_id_seq'::regc... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | data | jsonb | N | '{}'::jsonb |  |
| 4 | status | text | Y | - |  |
| 5 | created_by | text | Y | - |  |
| 6 | updated_by | text | Y | - |  |
| 7 | created_at | timestamp without time zone | N | now() |  |
| 8 | updated_at | timestamp without time zone | N | now() |  |
| 9 | assigned_to | text | Y | - |  |
| 10 | assigned_team | text | Y | - |  |
| 11 | entity_type | character varying | Y | - |  |
| 12 | record_data | text | Y | - |  |
| 13 | version | integer | Y | 1 |  |
| 14 | is_active | boolean | Y | true |  |
| 15 | tags | text | Y | - |  |

#### 94. `entity_relations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('entity_relations_id_seq'::re... | 🔑 PK |
| 2 | source_entity_id | integer | N | - | FK → module_entities.id |
| 3 | target_entity_id | integer | N | - | FK → module_entities.id |
| 4 | relation_type | text | N | - |  |
| 5 | source_field_slug | text | Y | - |  |
| 6 | target_field_slug | text | Y | - |  |
| 7 | label | text | N | - |  |
| 8 | reverse_label | text | Y | - |  |
| 9 | cascade_delete | boolean | N | false |  |
| 10 | sort_order | integer | N | 0 |  |
| 11 | settings | jsonb | Y | '{}'::jsonb |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | source_entity_type | character varying | Y | - |  |
| 14 | target_entity_type | character varying | Y | - |  |
| 15 | relation_label | character varying | Y | - |  |
| 16 | is_active | boolean | Y | true |  |
| 17 | tags | text | Y | - |  |

#### 95. `entity_statuses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('entity_statuses_id_seq'::reg... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | color | text | N | 'gray'::text |  |
| 6 | icon | text | Y | - |  |
| 7 | sort_order | integer | N | 0 |  |
| 8 | is_default | boolean | N | false |  |
| 9 | is_final | boolean | N | false |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | status_code | character varying | Y | - |  |
| 13 | status_name | character varying | Y | - |  |
| 14 | entity_type | character varying | Y | - |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | tags | text | Y | - |  |

#### 96. `equipment`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('equipment_id_seq'::regclass) | 🔑 PK |
| 2 | asset_number | character varying | Y | - | UNIQUE |
| 3 | name | character varying | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | category | character varying | Y | 'hand_tool'::character varying |  |
| 6 | manufacturer | character varying | Y | - |  |
| 7 | model | character varying | Y | - |  |
| 8 | serial_number | character varying | Y | - |  |
| 9 | purchase_date | date | Y | - |  |
| 10 | purchase_price | integer | Y | 0 |  |
| 11 | current_value | integer | Y | 0 |  |
| 12 | depreciation_method | character varying | Y | 'straight_line'::character varying |  |
| 13 | useful_life_years | integer | Y | 10 |  |
| 14 | location | character varying | Y | - |  |
| 15 | department | character varying | Y | - |  |
| 16 | status | character varying | Y | 'operational'::character varying |  |
| 17 | last_maintenance_date | date | Y | - |  |
| 18 | next_maintenance_date | date | Y | - |  |
| 19 | maintenance_interval_days | integer | Y | 90 |  |
| 20 | warranty_expiry | date | Y | - |  |
| 21 | specifications | jsonb | Y | '{}'::jsonb |  |
| 22 | notes | text | Y | - |  |
| 23 | is_active | boolean | Y | true |  |
| 24 | created_at | timestamp without time zone | Y | now() |  |
| 25 | updated_at | timestamp without time zone | Y | now() |  |

#### 97. `fabrication_systems`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('fabrication_systems_id_seq':... | 🔑 PK |
| 2 | system_number | text | N | - | UNIQUE |
| 3 | system_name | text | N | - |  |
| 4 | system_type | text | N | 'window'::text |  |
| 5 | manufacturer | text | Y | - |  |
| 6 | series | text | Y | - |  |
| 7 | material | text | Y | 'aluminum'::text |  |
| 8 | description | text | Y | - |  |
| 9 | max_width_mm | numeric | Y | - |  |
| 10 | max_height_mm | numeric | Y | - |  |
| 11 | max_weight_kg | numeric | Y | - |  |
| 12 | min_glass_thickness_mm | numeric | Y | - |  |
| 13 | max_glass_thickness_mm | numeric | Y | - |  |
| 14 | thermal_break | boolean | Y | false |  |
| 15 | u_value_frame | numeric | Y | - |  |
| 16 | u_value_system | numeric | Y | - |  |
| 17 | acoustic_rating | character varying | Y | - |  |
| 18 | fire_rating | character varying | Y | - |  |
| 19 | wind_resistance_class | character varying | Y | - |  |
| 20 | water_tightness_class | character varying | Y | - |  |
| 21 | air_permeability_class | character varying | Y | - |  |
| 22 | security_class | character varying | Y | - |  |
| 23 | opening_types | text | Y | - |  |
| 24 | profile_ids | text | Y | - |  |
| 25 | default_hardware_set | text | Y | - |  |
| 26 | default_seal_type | text | Y | - |  |
| 27 | default_gasket_type | text | Y | - |  |
| 28 | installation_method | text | Y | - |  |
| 29 | certifications | text | Y | - |  |
| 30 | drawing_url | text | Y | - |  |
| 31 | catalog_url | text | Y | - |  |
| 32 | image_url | text | Y | - |  |
| 33 | cost_per_sqm | numeric | Y | - |  |
| 34 | labor_hours_per_sqm | numeric | Y | - |  |
| 35 | status | text | N | 'active'::text |  |
| 36 | notes | text | Y | - |  |
| 37 | created_at | timestamp without time zone | Y | now() |  |
| 38 | updated_at | timestamp without time zone | Y | now() |  |

#### 98. `feature_requests`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('feature_requests_id_seq'::re... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | priority | text | Y | 'medium'::text |  |
| 5 | status | text | Y | 'new'::text |  |
| 6 | requested_by | text | Y | - |  |
| 7 | votes | integer | Y | 0 |  |
| 8 | category | text | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 99. `field_agent_locations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | employee_id | uuid | Y | - |  |
| 3 | latitude | numeric | Y | - |  |
| 4 | longitude | numeric | Y | - |  |
| 5 | recorded_at | timestamp without time zone | Y | now() |  |
| 6 | activity_type | character varying | Y | 'travel'::character varying |  |

#### 100. `field_agents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('field_agents_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | phone | text | Y | - |  |
| 4 | email | text | Y | - |  |
| 5 | territory | text | Y | - |  |
| 6 | status | text | Y | 'active'::text |  |
| 7 | current_location | text | Y | - |  |
| 8 | last_checkin | timestamp without time zone | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 101. `field_measurements`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('field_measurements_id_seq'::... | 🔑 PK |
| 2 | measurement_number | character varying | N | - | UNIQUE |
| 3 | project_name | character varying | Y | - |  |
| 4 | project_id | integer | Y | - |  |
| 5 | customer_name | character varying | Y | - |  |
| 6 | site_address | text | Y | - |  |
| 7 | measured_by | character varying | Y | - |  |
| 8 | measurement_date | date | N | CURRENT_DATE |  |
| 9 | status | character varying | N | 'planned'::character varying |  |
| 10 | category | character varying | Y | 'windows'::character varying |  |
| 11 | floor | character varying | Y | - |  |
| 12 | room | character varying | Y | - |  |
| 13 | opening_type | character varying | Y | 'window'::character varying |  |
| 14 | width_mm | numeric | Y | - |  |
| 15 | height_mm | numeric | Y | - |  |
| 16 | depth_mm | numeric | Y | - |  |
| 17 | sill_height_mm | numeric | Y | - |  |
| 18 | lintel_type | character varying | Y | - |  |
| 19 | wall_material | character varying | Y | - |  |
| 20 | glass_type | character varying | Y | - |  |
| 21 | frame_color | character varying | Y | - |  |
| 22 | opening_direction | character varying | Y | - |  |
| 23 | handle_side | character varying | Y | - |  |
| 24 | mosquito_net | boolean | Y | false |  |
| 25 | shutter_type | character varying | Y | - |  |
| 26 | notes | text | Y | - |  |
| 27 | photos_count | integer | Y | 0 |  |
| 28 | approval_status | character varying | Y | 'pending'::character varying |  |
| 29 | approved_by | character varying | Y | - |  |
| 30 | approved_at | timestamp with time zone | Y | - |  |
| 31 | created_at | timestamp with time zone | Y | now() |  |
| 32 | updated_at | timestamp with time zone | Y | now() |  |

#### 102. `finance_change_tracking`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('finance_change_tracking_id_s... | 🔑 PK |
| 2 | change_date | timestamp with time zone | Y | now() |  |
| 3 | entity_type | text | Y | - |  |
| 4 | entity_id | integer | Y | - |  |
| 5 | entity_name | text | Y | - |  |
| 6 | field_changed | text | Y | - |  |
| 7 | old_value | text | Y | - |  |
| 8 | new_value | text | Y | - |  |
| 9 | changed_by | text | Y | - |  |
| 10 | change_reason | text | Y | - |  |
| 11 | ip_address | text | Y | - |  |
| 12 | action | text | Y | 'update'::text |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp with time zone | Y | now() |  |
| 15 | change_number | character varying | Y | - |  |
| 16 | entity_ref | character varying | Y | - |  |
| 17 | field_name | character varying | Y | - |  |
| 18 | change_type | character varying | Y | - |  |
| 19 | changed_at | timestamp with time zone | Y | now() |  |
| 20 | reason | text | Y | - |  |
| 21 | approved_by | character varying | Y | - |  |
| 22 | tags | text | Y | - |  |

#### 103. `fixed_assets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('fixed_assets_id_seq'::regclass) | 🔑 PK |
| 2 | asset_number | character varying | N | - | UNIQUE |
| 3 | asset_name | text | N | - |  |
| 4 | asset_type | character varying | N | 'machinery'::character varying |  |
| 5 | category | character varying | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | manufacturer | character varying | Y | - |  |
| 8 | model | character varying | Y | - |  |
| 9 | serial_number | character varying | Y | - |  |
| 10 | status | character varying | Y | 'active'::character varying |  |
| 11 | department | character varying | Y | - |  |
| 12 | location | character varying | Y | - |  |
| 13 | responsible_person | text | Y | - |  |
| 14 | purchase_date | date | Y | - |  |
| 15 | purchase_cost | numeric | Y | 0 |  |
| 16 | supplier_name | text | Y | - |  |
| 17 | invoice_number | character varying | Y | - |  |
| 18 | warranty_expiry | date | Y | - |  |
| 19 | useful_life_years | integer | Y | 10 |  |
| 20 | depreciation_method | character varying | Y | 'straight_line'::character varying |  |
| 21 | annual_depreciation | numeric | Y | 0 |  |
| 22 | accumulated_depreciation | numeric | Y | 0 |  |
| 23 | current_value | numeric | Y | - |  |
| 24 | salvage_value | numeric | Y | 0 |  |
| 25 | last_maintenance_date | date | Y | - |  |
| 26 | next_maintenance_date | date | Y | - |  |
| 27 | maintenance_frequency_days | integer | Y | - |  |
| 28 | insurance_policy | character varying | Y | - |  |
| 29 | insurance_expiry | date | Y | - |  |
| 30 | insurance_value | numeric | Y | 0 |  |
| 31 | barcode | character varying | Y | - |  |
| 32 | condition | character varying | Y | 'good'::character varying |  |
| 33 | disposal_date | date | Y | - |  |
| 34 | disposal_reason | text | Y | - |  |
| 35 | disposal_value | numeric | Y | - |  |
| 36 | photos_url | text | Y | - |  |
| 37 | notes | text | Y | - |  |
| 38 | created_at | timestamp with time zone | Y | now() |  |
| 39 | updated_at | timestamp with time zone | Y | now() |  |
| 40 | asset_class | character varying | Y | - |  |
| 41 | cost_center | character varying | Y | - |  |
| 42 | project_id | integer | Y | - |  |
| 43 | gl_account | character varying | Y | - |  |
| 44 | depreciation_start_date | date | Y | - |  |
| 45 | monthly_depreciation | numeric | Y | 0 |  |
| 46 | last_depreciation_date | date | Y | - |  |
| 47 | revaluation_amount | numeric | Y | 0 |  |
| 48 | revaluation_date | date | Y | - |  |
| 49 | lease_contract | character varying | Y | - |  |
| 50 | leased | boolean | Y | false |  |
| 51 | lease_start_date | date | Y | - |  |
| 52 | lease_end_date | date | Y | - |  |
| 53 | lease_monthly_payment | numeric | Y | - |  |
| 54 | parent_asset_id | integer | Y | - |  |
| 55 | child_count | integer | Y | 0 |  |
| 56 | rfid_tag | character varying | Y | - |  |
| 57 | gps_enabled | boolean | Y | false |  |
| 58 | power_rating | character varying | Y | - |  |
| 59 | capacity | character varying | Y | - |  |
| 60 | operating_hours | numeric | Y | 0 |  |
| 61 | downtime_hours | numeric | Y | 0 |  |
| 62 | utilization_rate | numeric | Y | - |  |
| 63 | created_by | character varying | Y | - |  |
| 64 | updated_by | character varying | Y | - |  |
| 65 | gps_tracked | boolean | Y | false |  |
| 66 | last_inventory_date | date | Y | - |  |
| 67 | energy_rating | character varying | Y | - |  |
| 68 | co2_emissions | numeric | Y | - |  |
| 69 | model_number | character varying | Y | - |  |
| 70 | maintenance_schedule | character varying | Y | - |  |
| 71 | maintenance_cost_ytd | numeric | Y | 0 |  |
| 72 | energy_consumption_kwh | numeric | Y | - |  |
| 73 | max_operating_hours | integer | Y | - |  |
| 74 | qr_code | character varying | Y | - |  |
| 75 | calibration_required | boolean | Y | false |  |
| 76 | calibration_date | date | Y | - |  |
| 77 | calibration_due_date | date | Y | - |  |
| 78 | calibration_certificate | character varying | Y | - |  |
| 79 | safety_inspection_date | date | Y | - |  |
| 80 | safety_inspection_due | date | Y | - |  |
| 81 | manuals_url | text | Y | - |  |
| 82 | tags | text | Y | - |  |
| 83 | year_manufactured | integer | Y | - |  |
| 84 | warranty_provider | character varying | Y | - |  |
| 85 | total_maintenance_cost | numeric | Y | 0 |  |
| 86 | meter_reading | numeric | Y | - |  |
| 87 | energy_consumption | numeric | Y | - |  |
| 88 | gps_coordinates | character varying | Y | - |  |
| 89 | photo_url | text | Y | - |  |
| 90 | documents_url | text | Y | - |  |
| 91 | asset_tag | character varying | Y | - |  |
| 92 | asset_subclass | character varying | Y | - |  |
| 93 | responsible_employee_id | integer | Y | - |  |
| 94 | responsible_employee | character varying | Y | - |  |
| 95 | acquisition_cost | numeric | Y | - |  |
| 96 | residual_value | numeric | Y | 0 |  |
| 97 | book_value | numeric | Y | - |  |
| 98 | useful_life_months | integer | Y | - |  |
| 99 | fully_depreciated | boolean | Y | false |  |
| 100 | fully_depreciated_date | date | Y | - |  |
| 101 | impairment_amount | numeric | Y | - |  |
| 102 | impairment_date | date | Y | - |  |
| 103 | disposal_method | character varying | Y | - |  |
| 104 | disposal_amount | numeric | Y | - |  |
| 105 | disposal_gain_loss | numeric | Y | - |  |
| 106 | power_consumption_kw | numeric | Y | - |  |
| 107 | requires_calibration | boolean | Y | false |  |
| 108 | calibration_frequency_months | integer | Y | - |  |
| 109 | last_calibration_date | date | Y | - |  |
| 110 | next_calibration_date | date | Y | - |  |
| 111 | calibration_certificate_url | text | Y | - |  |
| 112 | safety_certification_required | boolean | Y | false |  |
| 113 | safety_certification_expiry | date | Y | - |  |
| 114 | gl_account_id | integer | Y | - |  |

#### 104. `form_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('form_definitions_id_seq'::re... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | form_type | text | N | 'create'::text |  |
| 6 | sections | jsonb | Y | '[]'::jsonb |  |
| 7 | settings | jsonb | Y | '{}'::jsonb |  |
| 8 | is_default | boolean | N | false |  |
| 9 | created_at | timestamp without time zone | N | now() |  |
| 10 | updated_at | timestamp without time zone | N | now() |  |
| 11 | form_code | character varying | Y | - |  |
| 12 | form_name | character varying | Y | - |  |
| 13 | entity_type | character varying | Y | - |  |
| 14 | layout | text | Y | - |  |
| 15 | fields_config | text | Y | - |  |
| 16 | validations | text | Y | - |  |
| 17 | is_active | boolean | Y | true |  |
| 18 | tags | text | Y | - |  |

#### 105. `glass_catalog`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('glass_catalog_id_seq'::regcl... | 🔑 PK |
| 2 | glass_code | text | N | - | UNIQUE |
| 3 | glass_name | text | N | - |  |
| 4 | glass_type | text | N | 'float'::text |  |
| 5 | composition | text | Y | - |  |
| 6 | thickness_mm | numeric | N | - |  |
| 7 | is_laminated | boolean | Y | false |  |
| 8 | laminated_layers | text | Y | - |  |
| 9 | is_insulated | boolean | Y | false |  |
| 10 | insulated_config | text | Y | - |  |
| 11 | spacer_width_mm | numeric | Y | - |  |
| 12 | gas_fill | text | Y | - |  |
| 13 | is_tempered | boolean | Y | false |  |
| 14 | is_heat_strengthened | boolean | Y | false |  |
| 15 | coating | text | Y | - |  |
| 16 | coating_position | text | Y | - |  |
| 17 | tint_color | text | Y | - |  |
| 18 | u_value | numeric | Y | - |  |
| 19 | shgc | numeric | Y | - |  |
| 20 | light_transmission | numeric | Y | - |  |
| 21 | sound_reduction | numeric | Y | - |  |
| 22 | max_width_mm | numeric | Y | - |  |
| 23 | max_height_mm | numeric | Y | - |  |
| 24 | max_area_sqm | numeric | Y | - |  |
| 25 | weight_per_sqm | numeric | Y | - |  |
| 26 | breakage_pattern | text | Y | - |  |
| 27 | safety_class | text | Y | - |  |
| 28 | fire_rating | text | Y | - |  |
| 29 | si_standard | text | Y | - |  |
| 30 | iso_standard | text | Y | - |  |
| 31 | supplier_id | integer | Y | - |  |
| 32 | price_per_sqm | numeric | Y | - |  |
| 33 | lead_time_days | integer | Y | - |  |
| 34 | current_stock_sqm | numeric | Y | 0 |  |
| 35 | minimum_stock_sqm | numeric | Y | - |  |
| 36 | warehouse_location | text | Y | - |  |
| 37 | status | text | N | 'active'::text |  |
| 38 | notes | text | Y | - |  |
| 39 | created_at | timestamp without time zone | Y | now() |  |
| 40 | updated_at | timestamp without time zone | Y | now() |  |

#### 106. `import_insurance`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | policy_number | character varying | Y | - |  |
| 3 | import_order_id | uuid | Y | - |  |
| 4 | insurer | character varying | Y | - |  |
| 5 | coverage_type | character varying | Y | - |  |
| 6 | insured_amount | integer | Y | 0 |  |
| 7 | premium | integer | Y | 0 |  |
| 8 | deductible | integer | Y | 0 |  |
| 9 | valid_from | date | Y | - |  |
| 10 | valid_to | date | Y | - |  |
| 11 | status | character varying | Y | 'active'::character varying |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

#### 107. `installation_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('installation_orders_id_seq':... | 🔑 PK |
| 2 | installation_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | transport_order_id | integer | Y | - |  |
| 5 | customer_name | text | Y | - |  |
| 6 | site_address | text | N | - |  |
| 7 | site_contact_name | text | Y | - |  |
| 8 | site_contact_phone | text | Y | - |  |
| 9 | installation_type | text | Y | 'new'::text |  |
| 10 | items_json | jsonb | Y | - |  |
| 11 | total_units | integer | Y | 0 |  |
| 12 | team_leader | text | Y | - |  |
| 13 | team_members | text | Y | - |  |
| 14 | team_size | integer | Y | 2 |  |
| 15 | scheduled_start_date | date | Y | - |  |
| 16 | scheduled_end_date | date | Y | - |  |
| 17 | actual_start_date | date | Y | - |  |
| 18 | actual_end_date | date | Y | - |  |
| 19 | estimated_hours | numeric | Y | - |  |
| 20 | actual_hours | numeric | Y | - |  |
| 21 | anchor_type | text | Y | - |  |
| 22 | sealant_type | text | Y | - |  |
| 23 | insulation_required | boolean | Y | true |  |
| 24 | flashing_required | boolean | Y | false |  |
| 25 | removal_of_old | boolean | Y | false |  |
| 26 | site_conditions | text | Y | - |  |
| 27 | safety_requirements | text | Y | - |  |
| 28 | scaffolding_required | boolean | Y | false |  |
| 29 | crane_required | boolean | Y | false |  |
| 30 | permits_required | text | Y | - |  |
| 31 | punch_list_json | jsonb | Y | - |  |
| 32 | customer_signoff | boolean | Y | false |  |
| 33 | signoff_date | date | Y | - |  |
| 34 | photos_before_json | jsonb | Y | - |  |
| 35 | photos_after_json | jsonb | Y | - |  |
| 36 | labor_cost | numeric | Y | - |  |
| 37 | materials_cost | numeric | Y | - |  |
| 38 | total_cost | numeric | Y | - |  |
| 39 | priority | text | Y | 'normal'::text |  |
| 40 | status | text | N | 'scheduled'::text |  |
| 41 | notes | text | Y | - |  |
| 42 | created_at | timestamp without time zone | Y | now() |  |
| 43 | updated_at | timestamp without time zone | Y | now() |  |

#### 108. `installations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('installations_id_seq'::regcl... | 🔑 PK |
| 2 | installation_number | character varying | Y | - | UNIQUE |
| 3 | sales_order_id | integer | Y | - |  |
| 4 | work_order_id | integer | Y | - |  |
| 5 | customer_id | integer | Y | - |  |
| 6 | contact_id | integer | Y | - |  |
| 7 | installer_id | integer | Y | - | FK → installers.id |
| 8 | team_members | jsonb | Y | '[]'::jsonb |  |
| 9 | installation_type | character varying | Y | 'new'::character varying |  |
| 10 | scheduled_date | date | Y | - |  |
| 11 | scheduled_time_start | time without time zone | Y | - |  |
| 12 | scheduled_time_end | time without time zone | Y | - |  |
| 13 | actual_start | timestamp without time zone | Y | - |  |
| 14 | actual_end | timestamp without time zone | Y | - |  |
| 15 | status | character varying | Y | 'scheduled'::character varying |  |
| 16 | site_address | jsonb | Y | '{}'::jsonb |  |
| 17 | site_contact_name | character varying | Y | - |  |
| 18 | site_contact_phone | character varying | Y | - |  |
| 19 | scope_of_work | text | Y | - |  |
| 20 | materials_needed | jsonb | Y | '[]'::jsonb |  |
| 21 | materials_used | jsonb | Y | '[]'::jsonb |  |
| 22 | tools_needed | jsonb | Y | '[]'::jsonb |  |
| 23 | access_instructions | text | Y | - |  |
| 24 | safety_requirements | text | Y | - |  |
| 25 | photos_before | jsonb | Y | '[]'::jsonb |  |
| 26 | photos_after | jsonb | Y | '[]'::jsonb |  |
| 27 | customer_signature | text | Y | - |  |
| 28 | customer_satisfaction | integer | Y | - |  |
| 29 | completion_notes | text | Y | - |  |
| 30 | issues_found | text | Y | - |  |
| 31 | follow_up_needed | boolean | Y | false |  |
| 32 | follow_up_notes | text | Y | - |  |
| 33 | estimated_duration_hours | numeric | Y | - |  |
| 34 | actual_duration_hours | numeric | Y | - |  |
| 35 | travel_time_hours | numeric | Y | - |  |
| 36 | labor_cost | integer | Y | 0 |  |
| 37 | material_cost | integer | Y | 0 |  |
| 38 | total_cost | integer | Y | 0 |  |
| 39 | notes | text | Y | - |  |
| 40 | is_active | boolean | Y | true |  |
| 41 | created_by | integer | Y | - |  |
| 42 | created_at | timestamp without time zone | Y | now() |  |
| 43 | updated_at | timestamp without time zone | Y | now() |  |

#### 109. `installers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('installers_id_seq'::regclass) | 🔑 PK |
| 2 | installer_number | character varying | Y | - | UNIQUE |
| 3 | installer_type | character varying | Y | 'employee'::character varying |  |
| 4 | employee_id | integer | Y | - |  |
| 5 | supplier_id | integer | Y | - |  |
| 6 | name | character varying | N | - |  |
| 7 | phone | character varying | Y | - |  |
| 8 | mobile | character varying | Y | - |  |
| 9 | email | character varying | Y | - |  |
| 10 | specializations | jsonb | Y | '[]'::jsonb |  |
| 11 | certification | jsonb | Y | '[]'::jsonb |  |
| 12 | license_number | character varying | Y | - |  |
| 13 | license_expiry | date | Y | - |  |
| 14 | insurance_expiry | date | Y | - |  |
| 15 | vehicle_number | character varying | Y | - |  |
| 16 | rating | numeric | Y | 0 |  |
| 17 | availability_status | character varying | Y | 'available'::character varying |  |
| 18 | daily_rate | integer | Y | 0 |  |
| 19 | hourly_rate | integer | Y | 0 |  |
| 20 | area_coverage | jsonb | Y | '[]'::jsonb |  |
| 21 | notes | text | Y | - |  |
| 22 | is_active | boolean | Y | true |  |
| 23 | created_at | timestamp without time zone | Y | now() |  |
| 24 | updated_at | timestamp without time zone | Y | now() |  |

#### 110. `integration_connections`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('integration_connections_id_s... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | service_type | text | N | 'rest_api'::text |  |
| 6 | base_url | text | N | - |  |
| 7 | auth_method | text | N | 'none'::text |  |
| 8 | auth_config | jsonb | N | '{}'::jsonb |  |
| 9 | default_headers | jsonb | N | '{}'::jsonb |  |
| 10 | is_active | boolean | N | true |  |
| 11 | last_sync_at | timestamp without time zone | Y | - |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | updated_at | timestamp without time zone | N | now() |  |
| 14 | connection_name | character varying | Y | - |  |
| 15 | integration_type | character varying | Y | - |  |
| 16 | provider | character varying | Y | - |  |
| 17 | endpoint_url | text | Y | - |  |
| 18 | auth_type | character varying | Y | - |  |
| 19 | credentials | text | Y | - |  |
| 20 | last_sync | timestamp with time zone | Y | - |  |
| 21 | sync_status | character varying | Y | - |  |
| 22 | error_message | text | Y | - |  |
| 23 | notes | text | Y | - |  |
| 24 | tags | text | Y | - |  |

#### 111. `integration_endpoints`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('integration_endpoints_id_seq... | 🔑 PK |
| 2 | connection_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | method | text | N | 'GET'::text |  |
| 6 | path | text | N | - |  |
| 7 | request_headers | jsonb | N | '{}'::jsonb |  |
| 8 | request_body | jsonb | Y | 'null'::jsonb |  |
| 9 | field_mapping | jsonb | N | '[]'::jsonb |  |
| 10 | sync_direction | text | N | 'import'::text |  |
| 11 | entity_id | integer | Y | - |  |
| 12 | schedule_config | jsonb | Y | 'null'::jsonb |  |
| 13 | is_active | boolean | N | true |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |
| 16 | endpoint_name | character varying | Y | - |  |
| 17 | http_method | character varying | Y | - |  |
| 18 | url_path | text | Y | - |  |
| 19 | request_format | text | Y | - |  |
| 20 | response_format | text | Y | - |  |
| 21 | auth_required | boolean | Y | true |  |
| 22 | rate_limit | integer | Y | - |  |
| 23 | tags | text | Y | - |  |

#### 112. `integration_messages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('integration_messages_id_seq'... | 🔑 PK |
| 2 | connection_id | integer | N | - | FK → integration_connections.id |
| 3 | channel | text | N | - |  |
| 4 | direction | text | N | 'outbound'::text |  |
| 5 | external_id | text | Y | - |  |
| 6 | from_address | text | Y | - |  |
| 7 | to_address | text | N | - |  |
| 8 | subject | text | Y | - |  |
| 9 | body | text | N | - |  |
| 10 | body_html | text | Y | - |  |
| 11 | status | text | N | 'sent'::text |  |
| 12 | entity_type | text | Y | - |  |
| 13 | entity_id | integer | Y | - |  |
| 14 | entity_name | text | Y | - |  |
| 15 | metadata | jsonb | N | '{}'::jsonb |  |
| 16 | attachments | jsonb | N | '[]'::jsonb |  |
| 17 | sent_at | timestamp without time zone | Y | - |  |
| 18 | delivered_at | timestamp without time zone | Y | - |  |
| 19 | read_at | timestamp without time zone | Y | - |  |
| 20 | created_at | timestamp without time zone | N | now() |  |
| 21 | message_type | character varying | Y | - |  |
| 22 | payload | text | Y | - |  |
| 23 | response | text | Y | - |  |
| 24 | status_code | integer | Y | - |  |
| 25 | success | boolean | Y | true |  |
| 26 | error_message | text | Y | - |  |
| 27 | retry_count | integer | Y | 0 |  |
| 28 | tags | text | Y | - |  |

#### 113. `integration_sync_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('integration_sync_logs_id_seq... | 🔑 PK |
| 2 | connection_id | integer | N | - |  |
| 3 | endpoint_id | integer | Y | - |  |
| 4 | webhook_id | integer | Y | - |  |
| 5 | direction | text | N | - |  |
| 6 | status | text | N | 'pending'::text |  |
| 7 | records_processed | integer | N | 0 |  |
| 8 | records_failed | integer | N | 0 |  |
| 9 | error_message | text | Y | - |  |
| 10 | details | jsonb | Y | 'null'::jsonb |  |
| 11 | started_at | timestamp without time zone | N | now() |  |
| 12 | completed_at | timestamp without time zone | Y | - |  |
| 13 | sync_type | character varying | Y | - |  |
| 14 | entity_type | character varying | Y | - |  |
| 15 | records_synced | integer | Y | 0 |  |
| 16 | success | boolean | Y | true |  |
| 17 | tags | text | Y | - |  |

#### 114. `integration_webhooks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('integration_webhooks_id_seq'... | 🔑 PK |
| 2 | connection_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | webhook_secret | text | Y | - |  |
| 6 | entity_id | integer | Y | - |  |
| 7 | field_mapping | jsonb | N | '[]'::jsonb |  |
| 8 | event_type | text | N | 'create'::text |  |
| 9 | is_active | boolean | N | true |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |
| 12 | webhook_name | character varying | Y | - |  |
| 13 | webhook_url | text | Y | - |  |
| 14 | entity_type | character varying | Y | - |  |
| 15 | secret_key | character varying | Y | - |  |
| 16 | retry_count | integer | Y | 3 |  |
| 17 | last_triggered | timestamp with time zone | Y | - |  |
| 18 | last_status | integer | Y | - |  |
| 19 | tags | text | Y | - |  |

#### 115. `investment_benchmarks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('investment_benchmarks_id_seq... | 🔑 PK |
| 2 | benchmark_name | character varying | N | - |  |
| 3 | ticker | character varying | Y | - |  |
| 4 | period | character varying | N | - |  |
| 5 | return_pct | numeric | N | - |  |
| 6 | date | date | N | CURRENT_DATE |  |
| 7 | created_at | timestamp with time zone | Y | now() |  |

#### 116. `investment_portfolio`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('investment_portfolio_id_seq'... | 🔑 PK |
| 2 | ticker | character varying | N | - |  |
| 3 | name | text | N | - |  |
| 4 | name_he | text | Y | - |  |
| 5 | asset_class | character varying | N | 'stock'::character varying |  |
| 6 | sector | character varying | Y | - |  |
| 7 | currency | character varying | Y | 'ILS'::character varying |  |
| 8 | shares | numeric | Y | 0 |  |
| 9 | avg_cost_per_share | numeric | Y | 0 |  |
| 10 | current_price | numeric | Y | 0 |  |
| 11 | previous_close | numeric | Y | 0 |  |
| 12 | market_value | numeric | Y | - |  |
| 13 | cost_basis | numeric | Y | - |  |
| 14 | unrealized_pnl | numeric | Y | - |  |
| 15 | unrealized_pnl_pct | numeric | Y | - |  |
| 16 | day_change_pct | numeric | Y | - |  |
| 17 | weight_pct | numeric | Y | 0 |  |
| 18 | dividend_yield | numeric | Y | 0 |  |
| 19 | beta | numeric | Y | 1.000 |  |
| 20 | pe_ratio | numeric | Y | - |  |
| 21 | market_cap_b | numeric | Y | - |  |
| 22 | exchange | character varying | Y | 'TASE'::character varying |  |
| 23 | last_updated | timestamp with time zone | Y | now() |  |
| 24 | created_at | timestamp with time zone | Y | now() |  |

#### 117. `investment_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('investment_transactions_id_s... | 🔑 PK |
| 2 | portfolio_id | integer | Y | - | FK → investment_portfolio.id |
| 3 | ticker | character varying | N | - |  |
| 4 | transaction_type | character varying | N | 'buy'::character varying |  |
| 5 | shares | numeric | N | - |  |
| 6 | price_per_share | numeric | N | - |  |
| 7 | total_amount | numeric | N | - |  |
| 8 | commission | numeric | Y | 0 |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | transaction_date | date | N | CURRENT_DATE |  |
| 11 | settlement_date | date | Y | - |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |

#### 118. `kimi_agents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kimi_agents_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | system_prompt | text | Y | - |  |
| 5 | model | text | Y | 'gpt-4o'::text |  |
| 6 | temperature | numeric | Y | 0.7 |  |
| 7 | max_tokens | integer | Y | 4096 |  |
| 8 | is_active | boolean | Y | true |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |
| 11 | category | text | Y | - |  |
| 12 | icon | text | Y | - |  |
| 13 | sort_order | integer | N | 0 |  |
| 14 | default_model | text | Y | - |  |

#### 119. `kimi_conversations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kimi_conversations_id_seq'::... | 🔑 PK |
| 2 | agent_id | integer | Y | - | FK → kimi_agents.id |
| 3 | title | text | Y | - |  |
| 4 | user_id | text | N | ''::text |  |
| 5 | messages | jsonb | Y | '[]'::jsonb |  |
| 6 | created_at | timestamp without time zone | Y | now() |  |
| 7 | updated_at | timestamp without time zone | Y | now() |  |
| 8 | status | text | N | 'active'::text |  |
| 9 | total_messages | integer | N | 0 |  |
| 10 | model | text | Y | - |  |

#### 120. `kobi_chat_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kobi_chat_logs_id_seq'::regc... | 🔑 PK |
| 2 | user_id | character varying | Y | ''::character varying |  |
| 3 | user_message | text | Y | ''::text |  |
| 4 | assistant_response | text | Y | ''::text |  |
| 5 | tool_loops | integer | Y | 0 |  |
| 6 | response_time_ms | integer | Y | 0 |  |
| 7 | created_at | timestamp with time zone | Y | now() |  |

#### 121. `kobi_memory`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kobi_memory_id_seq'::regclass) | 🔑 PK |
| 2 | user_id | character varying | N | - |  |
| 3 | category | character varying | N | - |  |
| 4 | key | character varying | N | - |  |
| 5 | value | text | N | - |  |
| 6 | importance | integer | Y | 5 |  |
| 7 | source_session_id | integer | Y | - | FK → kobi_sessions.id |
| 8 | expires_at | timestamp with time zone | Y | - |  |
| 9 | created_at | timestamp with time zone | Y | now() |  |
| 10 | updated_at | timestamp with time zone | Y | now() |  |

#### 122. `kobi_messages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kobi_messages_id_seq'::regcl... | 🔑 PK |
| 2 | session_id | integer | N | - | FK → kobi_sessions.id |
| 3 | role | character varying | N | - |  |
| 4 | content | text | N | - |  |
| 5 | tool_calls | jsonb | Y | '[]'::jsonb |  |
| 6 | tool_results | jsonb | Y | '[]'::jsonb |  |
| 7 | response_time_ms | integer | Y | 0 |  |
| 8 | tool_loops | integer | Y | 0 |  |
| 9 | created_at | timestamp with time zone | Y | now() |  |

#### 123. `kobi_tasks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kobi_tasks_id_seq'::regclass) | 🔑 PK |
| 2 | session_id | integer | Y | - | FK → kobi_sessions.id |
| 3 | user_id | character varying | N | - |  |
| 4 | title | character varying | N | - |  |
| 5 | description | text | Y | ''::text |  |
| 6 | status | character varying | Y | 'pending'::character varying |  |
| 7 | priority | integer | Y | 5 |  |
| 8 | progress | integer | Y | 0 |  |
| 9 | result | text | Y | ''::text |  |
| 10 | error | text | Y | ''::text |  |
| 11 | started_at | timestamp with time zone | Y | - |  |
| 12 | completed_at | timestamp with time zone | Y | - |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |

#### 124. `lc_amendments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('lc_amendments_id_seq'::regcl... | 🔑 PK |
| 2 | lc_id | integer | N | - | FK → letters_of_credit.id |
| 3 | amendment_number | integer | N | 1 |  |
| 4 | amendment_date | date | N | CURRENT_DATE |  |
| 5 | amendment_type | text | N | 'שינוי סכום'::text |  |
| 6 | description | text | N | - |  |
| 7 | old_value | text | Y | - |  |
| 8 | new_value | text | Y | - |  |
| 9 | status | text | N | 'ממתין'::text |  |
| 10 | requested_by | text | Y | - |  |
| 11 | approved_by | text | Y | - |  |
| 12 | approved_date | date | Y | - |  |
| 13 | bank_reference | text | Y | - |  |
| 14 | fee_amount | numeric | Y | 0 |  |
| 15 | notes | text | Y | - |  |
| 16 | created_at | timestamp without time zone | N | now() |  |
| 17 | lc_number | character varying | Y | - |  |
| 18 | amount_change | numeric | Y | 0 |  |
| 19 | new_amount | numeric | Y | - |  |
| 20 | new_expiry_date | date | Y | - |  |
| 21 | new_shipment_date | date | Y | - |  |
| 22 | bank_charges | numeric | Y | 0 |  |
| 23 | approved_at | timestamp with time zone | Y | - |  |
| 24 | documents_url | text | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 125. `leads`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('leads_id_seq'::regclass) | 🔑 PK |
| 2 | lead_number | text | Y | - | UNIQUE |
| 3 | source | text | Y | 'other'::text |  |
| 4 | status | text | Y | 'new'::text |  |
| 5 | first_name | text | Y | - |  |
| 6 | last_name | text | Y | - |  |
| 7 | company_name | text | Y | - |  |
| 8 | email | text | Y | - |  |
| 9 | phone | text | Y | - |  |
| 10 | mobile | text | Y | - |  |
| 11 | address_city | text | Y | - |  |
| 12 | product_interest | jsonb | Y | '[]'::jsonb |  |
| 13 | estimated_value | numeric | Y | 0 |  |
| 14 | estimated_close_date | date | Y | - |  |
| 15 | lead_score | numeric | Y | 0 |  |
| 16 | assigned_to | text | Y | - |  |
| 17 | next_follow_up | timestamp without time zone | Y | - |  |
| 18 | follow_up_count | integer | Y | 0 |  |
| 19 | lost_reason | text | Y | - |  |
| 20 | converted_customer_id | integer | Y | - |  |
| 21 | tags | jsonb | Y | '[]'::jsonb |  |
| 22 | notes | text | Y | - |  |
| 23 | is_active | boolean | Y | true |  |
| 24 | created_by | text | Y | - |  |
| 25 | created_at | timestamp without time zone | N | now() |  |
| 26 | updated_at | timestamp without time zone | N | now() |  |

#### 126. `machine_maintenance`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('machine_maintenance_id_seq':... | 🔑 PK |
| 2 | machine_id | integer | N | - |  |
| 3 | maintenance_type | text | N | 'preventive'::text |  |
| 4 | scheduled_date | date | Y | - |  |
| 5 | completed_date | date | Y | - |  |
| 6 | performed_by | text | Y | - |  |
| 7 | description | text | Y | - |  |
| 8 | cost | numeric | Y | 0 |  |
| 9 | parts_replaced | text | Y | - |  |
| 10 | next_maintenance_date | date | Y | - |  |
| 11 | status | text | N | 'scheduled'::text |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | updated_at | timestamp without time zone | N | now() |  |
| 15 | maintenance_number | text | Y | - |  |
| 16 | machine_name | text | Y | - |  |
| 17 | machine_code | text | Y | - |  |
| 18 | title | text | Y | - |  |
| 19 | frequency | text | Y | 'monthly'::text |  |
| 20 | priority | text | Y | 'medium'::text |  |
| 21 | assigned_to | text | Y | - |  |
| 22 | estimated_hours | numeric | Y | 0 |  |
| 23 | actual_hours | numeric | Y | 0 |  |
| 24 | parts_cost | numeric | Y | 0 |  |
| 25 | labor_cost | numeric | Y | 0 |  |
| 26 | total_cost | numeric | Y | 0 |  |
| 27 | downtime_hours | numeric | Y | 0 |  |
| 28 | parts_used | text | Y | - |  |
| 29 | findings | text | Y | - |  |
| 30 | location | text | Y | - |  |

#### 127. `machine_maintenance_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('machine_maintenance_records_... | 🔑 PK |
| 2 | record_number | text | N | - | UNIQUE |
| 3 | machine_id | integer | N | - |  |
| 4 | maintenance_type | text | N | 'preventive'::text |  |
| 5 | scheduled_date | date | Y | - |  |
| 6 | completed_date | date | Y | - |  |
| 7 | performed_by | text | Y | - |  |
| 8 | description | text | Y | - |  |
| 9 | cost | numeric | Y | 0 |  |
| 10 | parts_replaced | text | Y | - |  |
| 11 | next_scheduled_date | date | Y | - |  |
| 12 | status | text | N | 'scheduled'::text |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |

#### 128. `machine_registry`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('machine_registry_id_seq'::re... | 🔑 PK |
| 2 | machine_number | character varying | Y | - |  |
| 3 | machine_name | character varying | Y | - |  |
| 4 | machine_type | character varying | Y | - |  |
| 5 | manufacturer | character varying | Y | - |  |
| 6 | model | character varying | Y | - |  |
| 7 | serial_number | character varying | Y | - |  |
| 8 | department | character varying | Y | - |  |
| 9 | workstation | character varying | Y | - |  |
| 10 | location | character varying | Y | - |  |
| 11 | purchase_date | date | Y | - |  |
| 12 | purchase_cost | numeric | Y | - |  |
| 13 | fixed_asset_id | integer | Y | - |  |
| 14 | warranty_expiry | date | Y | - |  |
| 15 | status | character varying | Y | 'active'::character varying |  |
| 16 | condition | character varying | Y | 'good'::character varying |  |
| 17 | capacity_per_hour | numeric | Y | - |  |
| 18 | capacity_unit | character varying | Y | - |  |
| 19 | power_consumption_kw | numeric | Y | - |  |
| 20 | max_material_thickness | numeric | Y | - |  |
| 21 | max_material_width | numeric | Y | - |  |
| 22 | max_material_length | numeric | Y | - |  |
| 23 | supported_materials | text | Y | - |  |
| 24 | supported_operations | text | Y | - |  |
| 25 | requires_certification | boolean | Y | false |  |
| 26 | certification_type | character varying | Y | - |  |
| 27 | certified_operators | text | Y | - |  |
| 28 | setup_time_avg_minutes | numeric | Y | - |  |
| 29 | maintenance_schedule | character varying | Y | - |  |
| 30 | last_maintenance_date | date | Y | - |  |
| 31 | next_maintenance_date | date | Y | - |  |
| 32 | total_runtime_hours | numeric | Y | 0 |  |
| 33 | mtbf_hours | numeric | Y | - |  |
| 34 | mttr_hours | numeric | Y | - |  |
| 35 | oee_pct | numeric | Y | - |  |
| 36 | availability_pct | numeric | Y | - |  |
| 37 | performance_pct | numeric | Y | - |  |
| 38 | quality_pct | numeric | Y | - |  |
| 39 | downtime_ytd_hours | numeric | Y | 0 |  |
| 40 | breakdown_count_ytd | integer | Y | 0 |  |
| 41 | calibration_required | boolean | Y | false |  |
| 42 | calibration_frequency_months | integer | Y | - |  |
| 43 | last_calibration_date | date | Y | - |  |
| 44 | next_calibration_date | date | Y | - |  |
| 45 | safety_certification_required | boolean | Y | false |  |
| 46 | safety_cert_expiry | date | Y | - |  |
| 47 | safety_instructions_url | text | Y | - |  |
| 48 | operator_manual_url | text | Y | - |  |
| 49 | photos_url | text | Y | - |  |
| 50 | documents_url | text | Y | - |  |
| 51 | is_active | boolean | Y | true |  |
| 52 | created_at | timestamp with time zone | Y | now() |  |
| 53 | updated_at | timestamp with time zone | Y | now() |  |
| 54 | created_by | character varying | Y | - |  |
| 55 | notes | text | Y | - |  |
| 56 | tags | text | Y | - |  |

#### 129. `machines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('machines_id_seq'::regclass) | 🔑 PK |
| 2 | machine_number | text | N | - | UNIQUE |
| 3 | name | text | N | - |  |
| 4 | asset_tag | text | Y | - |  |
| 5 | location | text | Y | - |  |
| 6 | machine_type | text | Y | - |  |
| 7 | manufacturer | text | Y | - |  |
| 8 | model | text | Y | - |  |
| 9 | serial_number | text | Y | - |  |
| 10 | status | text | N | 'active'::text |  |
| 11 | purchase_date | date | Y | - |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | updated_at | timestamp without time zone | N | now() |  |

#### 130. `maintenance_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('maintenance_orders_id_seq'::... | 🔑 PK |
| 2 | order_number | character varying | N | - | UNIQUE |
| 3 | maintenance_type | character varying | N | 'corrective'::character varying |  |
| 4 | title | text | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | priority | character varying | Y | 'medium'::character varying |  |
| 7 | status | character varying | Y | 'open'::character varying |  |
| 8 | equipment_name | text | N | - |  |
| 9 | equipment_code | character varying | Y | - |  |
| 10 | equipment_location | character varying | Y | - |  |
| 11 | department | character varying | Y | - |  |
| 12 | reported_by | text | Y | - |  |
| 13 | reported_date | date | Y | CURRENT_DATE |  |
| 14 | assigned_to | text | Y | - |  |
| 15 | assigned_team | text | Y | - |  |
| 16 | scheduled_date | date | Y | - |  |
| 17 | completed_date | date | Y | - |  |
| 18 | downtime_hours | numeric | Y | 0 |  |
| 19 | estimated_hours | numeric | Y | 0 |  |
| 20 | actual_hours | numeric | Y | 0 |  |
| 21 | parts_used | text | Y | - |  |
| 22 | parts_cost | numeric | Y | 0 |  |
| 23 | labor_cost | numeric | Y | 0 |  |
| 24 | total_cost | numeric | Y | - |  |
| 25 | failure_cause | text | Y | - |  |
| 26 | failure_code | character varying | Y | - |  |
| 27 | solution | text | Y | - |  |
| 28 | preventive_action | text | Y | - |  |
| 29 | next_maintenance_date | date | Y | - |  |
| 30 | frequency_days | integer | Y | - |  |
| 31 | is_recurring | boolean | Y | false |  |
| 32 | warranty_covered | boolean | Y | false |  |
| 33 | vendor_name | text | Y | - |  |
| 34 | vendor_contact | text | Y | - |  |
| 35 | safety_notes | text | Y | - |  |
| 36 | photos_url | text | Y | - |  |
| 37 | notes | text | Y | - |  |
| 38 | approved_by | text | Y | - |  |
| 39 | created_at | timestamp with time zone | Y | now() |  |
| 40 | updated_at | timestamp with time zone | Y | now() |  |
| 41 | root_cause | text | Y | - |  |
| 42 | resolution | text | Y | - |  |
| 43 | labor_hours | numeric | Y | 0 |  |
| 44 | safety_permit_required | boolean | Y | false |  |
| 45 | safety_permit_number | character varying | Y | - |  |
| 46 | contractor_name | character varying | Y | - |  |
| 47 | warranty_claim | boolean | Y | false |  |
| 48 | recurring | boolean | Y | false |  |
| 49 | recurring_interval_days | integer | Y | - |  |
| 50 | sla_due_date | timestamp with time zone | Y | - |  |
| 51 | sla_status | character varying | Y | - |  |
| 52 | failure_analysis | text | Y | - |  |
| 53 | mtbf_hours | numeric | Y | - |  |
| 54 | mttr_hours | numeric | Y | - |  |
| 55 | energy_consumption | numeric | Y | - |  |
| 56 | calibration_due | date | Y | - |  |
| 57 | vendor_service_report | text | Y | - |  |
| 58 | frequency | character varying | Y | - |  |
| 59 | external_service_cost | numeric | Y | 0 |  |
| 60 | failure_mode | text | Y | - |  |
| 61 | corrective_action | text | Y | - |  |
| 62 | safety_lockout | boolean | Y | false |  |
| 63 | production_impact | text | Y | - |  |
| 64 | documents_url | text | Y | - |  |
| 65 | tags | text | Y | - |  |
| 66 | maintenance_number | character varying | Y | - |  |
| 67 | asset_id | integer | Y | - |  |
| 68 | asset_name | character varying | Y | - |  |
| 69 | asset_number | character varying | Y | - |  |
| 70 | equipment_id | integer | Y | - |  |
| 71 | location | character varying | Y | - |  |
| 72 | requested_by | character varying | Y | - |  |
| 73 | requested_date | date | Y | - |  |
| 74 | scheduled_start | date | Y | - |  |
| 75 | scheduled_end | date | Y | - |  |
| 76 | actual_start | timestamp with time zone | Y | - |  |
| 77 | actual_end | timestamp with time zone | Y | - |  |
| 78 | warranty_provider | character varying | Y | - |  |
| 79 | external_vendor | character varying | Y | - |  |
| 80 | external_vendor_ref | character varying | Y | - |  |
| 81 | meter_reading_before | numeric | Y | - |  |
| 82 | meter_reading_after | numeric | Y | - |  |
| 83 | checklist | text | Y | - |  |
| 84 | next_scheduled_date | date | Y | - |  |
| 85 | recurrence_pattern | character varying | Y | - |  |
| 86 | purchase_order_id | integer | Y | - |  |
| 87 | approval_required | boolean | Y | false |  |
| 88 | approved_at | timestamp with time zone | Y | - |  |

#### 131. `material_categories`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('material_categories_id_seq':... | 🔑 PK |
| 2 | name | text | N | - | UNIQUE |
| 3 | parent_category | text | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | sort_order | integer | Y | 0 |  |
| 6 | created_at | timestamp without time zone | N | now() |  |
| 7 | updated_at | timestamp without time zone | N | now() |  |
| 8 | category_code | character varying | Y | - |  |
| 9 | category_name | character varying | Y | - |  |
| 10 | parent_id | integer | Y | - |  |
| 11 | parent_name | character varying | Y | - |  |
| 12 | level | integer | Y | 1 |  |
| 13 | icon | character varying | Y | - |  |
| 14 | color | character varying | Y | - |  |
| 15 | material_count | integer | Y | 0 |  |
| 16 | material_type | character varying | Y | - |  |
| 17 | default_uom | character varying | Y | - |  |
| 18 | default_warehouse | character varying | Y | - |  |
| 19 | default_bin | character varying | Y | - |  |
| 20 | reorder_policy | character varying | Y | - |  |
| 21 | min_stock_level | numeric | Y | - |  |
| 22 | max_stock_level | numeric | Y | - |  |
| 23 | safety_stock | numeric | Y | - |  |
| 24 | lead_time_days | integer | Y | - |  |
| 25 | hazardous | boolean | Y | false |  |
| 26 | requires_certificate | boolean | Y | false |  |
| 27 | requires_heat_number | boolean | Y | false |  |
| 28 | inspection_required | boolean | Y | true |  |
| 29 | shelf_life_days | integer | Y | - |  |
| 30 | storage_conditions | text | Y | - |  |
| 31 | handling_instructions | text | Y | - |  |
| 32 | gl_inventory_account | character varying | Y | - |  |
| 33 | gl_expense_account | character varying | Y | - |  |
| 34 | gl_variance_account | character varying | Y | - |  |
| 35 | is_active | boolean | Y | true |  |
| 36 | created_by | character varying | Y | - |  |
| 37 | updated_by | character varying | Y | - |  |
| 38 | notes | text | Y | - |  |
| 39 | tags | text | Y | - |  |

#### 132. `module_entities`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('module_entities_id_seq'::reg... | 🔑 PK |
| 2 | module_id | integer | N | - | FK → platform_modules.id |
| 3 | name | text | N | - |  |
| 4 | name_plural | text | N | - |  |
| 5 | slug | text | N | - |  |
| 6 | description | text | Y | - |  |
| 7 | icon | text | N | 'FileText'::text |  |
| 8 | entity_type | text | N | 'master'::text |  |
| 9 | parent_entity_id | integer | Y | - |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | sort_order | integer | N | 0 |  |
| 12 | is_active | boolean | N | true |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | updated_at | timestamp without time zone | N | now() |  |
| 15 | name_he | text | Y | - |  |
| 16 | name_en | text | Y | - |  |
| 17 | entity_key | text | Y | - | UNIQUE |
| 18 | table_name | text | Y | - | UNIQUE |
| 19 | primary_display_field | text | Y | - |  |
| 20 | has_status | boolean | N | false |  |
| 21 | has_categories | boolean | N | false |  |
| 22 | has_attachments | boolean | N | false |  |
| 23 | has_notes | boolean | N | false |  |
| 24 | has_owner | boolean | N | false |  |
| 25 | has_numbering | boolean | N | false |  |
| 26 | has_created_updated | boolean | N | true |  |
| 27 | has_soft_delete | boolean | N | false |  |
| 28 | has_audit | boolean | N | false |  |
| 29 | entity_code | character varying | Y | - |  |
| 30 | entity_name | character varying | Y | - |  |
| 31 | entity_name_he | character varying | Y | - |  |
| 32 | route_path | character varying | Y | - |  |
| 33 | tags | text | Y | - |  |

#### 133. `non_conformance_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('non_conformance_reports_id_s... | 🔑 PK |
| 2 | ncr_number | character varying | Y | - | UNIQUE |
| 3 | source | character varying | Y | 'production'::character varying |  |
| 4 | severity | character varying | Y | 'minor'::character varying |  |
| 5 | status | character varying | Y | 'open'::character varying |  |
| 6 | description | text | Y | - |  |
| 7 | root_cause | text | Y | - |  |
| 8 | corrective_action | text | Y | - |  |
| 9 | preventive_action | text | Y | - |  |
| 10 | affected_product_id | integer | Y | - |  |
| 11 | affected_order_id | integer | Y | - |  |
| 12 | responsible_id | integer | Y | - |  |
| 13 | due_date | date | Y | - |  |
| 14 | closed_date | date | Y | - |  |
| 15 | cost_of_quality | integer | Y | 0 |  |
| 16 | photos | jsonb | Y | '[]'::jsonb |  |
| 17 | notes | text | Y | - |  |
| 18 | is_active | boolean | Y | true |  |
| 19 | created_by | integer | Y | - |  |
| 20 | created_at | timestamp without time zone | Y | now() |  |
| 21 | updated_at | timestamp without time zone | Y | now() |  |

#### 134. `onboarding_tasks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('onboarding_tasks_id_seq'::re... | 🔑 PK |
| 2 | employee_id | integer | Y | - |  |
| 3 | employee_name | text | Y | - |  |
| 4 | task_title | text | N | - |  |
| 5 | task_category | text | Y | 'general'::text |  |
| 6 | description | text | Y | - |  |
| 7 | assigned_to | text | Y | - |  |
| 8 | due_date | date | Y | - |  |
| 9 | status | text | Y | 'pending'::text |  |
| 10 | completed_at | timestamp without time zone | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |
| 14 | department | character varying | Y | - |  |
| 15 | position | character varying | Y | - |  |
| 16 | priority | character varying | Y | 'רגיל'::character varying |  |
| 17 | estimated_hours | numeric | Y | - |  |
| 18 | actual_hours | numeric | Y | - |  |
| 19 | template_id | integer | Y | - |  |
| 20 | requires_signature | boolean | Y | false |  |
| 21 | signed_at | timestamp without time zone | Y | - |  |
| 22 | document_url | text | Y | - |  |
| 23 | checklist_items | text | Y | - |  |
| 24 | mentor_name | character varying | Y | - |  |
| 25 | order_index | integer | Y | 0 |  |
| 26 | task_type | character varying | Y | - |  |
| 27 | category | character varying | Y | - |  |
| 28 | responsible_person | character varying | Y | - |  |
| 29 | responsible_id | integer | Y | - |  |
| 30 | completed_date | date | Y | - |  |
| 31 | mandatory | boolean | Y | true |  |
| 32 | documents_required | text | Y | - |  |
| 33 | documents_received | boolean | Y | false |  |
| 34 | equipment_issued | text | Y | - |  |
| 35 | access_granted | text | Y | - |  |
| 36 | training_completed | boolean | Y | false |  |
| 37 | tags | text | Y | - |  |
| 38 | safety_orientation | boolean | Y | false |  |
| 39 | safety_orientation_date | date | Y | - |  |
| 40 | ppe_issued | boolean | Y | false |  |
| 41 | ppe_items | text | Y | - |  |
| 42 | locker_assigned | character varying | Y | - |  |
| 43 | parking_assigned | character varying | Y | - |  |
| 44 | id_badge_issued | boolean | Y | false |  |
| 45 | id_badge_number | character varying | Y | - |  |
| 46 | system_access_granted | boolean | Y | false |  |
| 47 | email_created | boolean | Y | false |  |
| 48 | bank_details_received | boolean | Y | false |  |
| 49 | tax_forms_received | boolean | Y | false |  |
| 50 | emergency_contacts_received | boolean | Y | false |  |
| 51 | photos_url | text | Y | - |  |

#### 135. `org_departments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('org_departments_id_seq'::reg... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | code | text | Y | - |  |
| 4 | manager | text | Y | - |  |
| 5 | parent_department | text | Y | - |  |
| 6 | location | text | Y | - |  |
| 7 | phone | text | Y | - |  |
| 8 | email | text | Y | - |  |
| 9 | budget | numeric | Y | 0 |  |
| 10 | employee_count | integer | Y | 0 |  |
| 11 | description | text | Y | - |  |
| 12 | status | text | Y | 'active'::text |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |

#### 136. `performance_reviews`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('performance_reviews_id_seq':... | 🔑 PK |
| 2 | review_number | character varying | N | - | UNIQUE |
| 3 | employee_name | text | N | - |  |
| 4 | employee_id_ref | integer | Y | - |  |
| 5 | department | character varying | Y | - |  |
| 6 | job_title | character varying | Y | - |  |
| 7 | reviewer_name | text | Y | - |  |
| 8 | review_period | character varying | Y | 'annual'::character varying |  |
| 9 | review_date | date | N | - |  |
| 10 | period_start | date | Y | - |  |
| 11 | period_end | date | Y | - |  |
| 12 | overall_score | numeric | Y | - |  |
| 13 | goals_score | numeric | Y | - |  |
| 14 | skills_score | numeric | Y | - |  |
| 15 | teamwork_score | numeric | Y | - |  |
| 16 | communication_score | numeric | Y | - |  |
| 17 | initiative_score | numeric | Y | - |  |
| 18 | attendance_score | numeric | Y | - |  |
| 19 | strengths | text | Y | - |  |
| 20 | improvements | text | Y | - |  |
| 21 | goals_next_period | text | Y | - |  |
| 22 | training_recommendations | text | Y | - |  |
| 23 | salary_recommendation | character varying | Y | - |  |
| 24 | promotion_recommendation | boolean | Y | false |  |
| 25 | employee_comments | text | Y | - |  |
| 26 | reviewer_comments | text | Y | - |  |
| 27 | status | character varying | Y | 'draft'::character varying |  |
| 28 | approved_by | integer | Y | - |  |
| 29 | approved_by_name | text | Y | - |  |
| 30 | approved_at | timestamp with time zone | Y | - |  |
| 31 | notes | text | Y | - |  |
| 32 | created_by | integer | Y | - |  |
| 33 | created_by_name | text | Y | - |  |
| 34 | created_at | timestamp with time zone | Y | now() |  |
| 35 | updated_at | timestamp with time zone | Y | now() |  |
| 36 | employee_id | integer | Y | - |  |
| 37 | employee_number | character varying | Y | - |  |
| 38 | position | character varying | Y | - |  |
| 39 | reviewer_id | integer | Y | - |  |
| 40 | review_type | character varying | Y | 'annual'::character varying |  |
| 41 | review_period_start | date | Y | - |  |
| 42 | review_period_end | date | Y | - |  |
| 43 | technical_score | numeric | Y | - |  |
| 44 | leadership_score | numeric | Y | - |  |
| 45 | safety_score | numeric | Y | - |  |
| 46 | quality_score | numeric | Y | - |  |
| 47 | productivity_score | numeric | Y | - |  |
| 48 | improvement_areas | text | Y | - |  |
| 49 | training_needs | text | Y | - |  |
| 50 | salary_increase_pct | numeric | Y | - |  |
| 51 | promotion_recommended | boolean | Y | false |  |
| 52 | promotion_to_position | character varying | Y | - |  |
| 53 | employee_signed | boolean | Y | false |  |
| 54 | employee_signed_date | date | Y | - |  |
| 55 | manager_signed | boolean | Y | false |  |
| 56 | manager_signed_date | date | Y | - |  |
| 57 | hr_reviewed | boolean | Y | false |  |
| 58 | hr_reviewed_by | character varying | Y | - |  |
| 59 | hr_reviewed_date | date | Y | - |  |
| 60 | documents_url | text | Y | - |  |
| 61 | tags | text | Y | - |  |

#### 137. `platform_contexts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_contexts_id_seq'::r... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | slug | character varying | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | context_type | character varying | Y | 'entity'::character varying |  |
| 6 | conditions | jsonb | Y | '[]'::jsonb |  |
| 7 | effects | jsonb | Y | '[]'::jsonb |  |
| 8 | entity_id | integer | Y | - |  |
| 9 | module_id | integer | Y | - |  |
| 10 | priority | integer | Y | 0 |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | created_at | timestamp with time zone | Y | now() |  |
| 13 | updated_at | timestamp with time zone | Y | now() |  |

#### 138. `platform_modules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_modules_id_seq'::re... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - | UNIQUE |
| 4 | description | text | Y | - |  |
| 5 | icon | text | N | 'Box'::text |  |
| 6 | color | text | N | 'blue'::text |  |
| 7 | category | text | N | 'כללי'::text |  |
| 8 | parent_module_id | integer | Y | - |  |
| 9 | status | text | N | 'draft'::text |  |
| 10 | version | integer | N | 1 |  |
| 11 | settings | jsonb | Y | '{}'::jsonb |  |
| 12 | sort_order | integer | N | 0 |  |
| 13 | is_system | boolean | N | false |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |
| 16 | name_he | text | Y | - |  |
| 17 | name_en | text | Y | - |  |
| 18 | module_key | text | Y | - | UNIQUE |
| 19 | show_in_sidebar | boolean | N | true |  |
| 20 | show_in_dashboard | boolean | N | false |  |
| 21 | permissions_scope | text | Y | - |  |
| 22 | notes | text | Y | - |  |
| 23 | is_active | boolean | Y | true |  |
| 24 | module_code | character varying | Y | - |  |
| 25 | module_name | character varying | Y | - |  |
| 26 | module_name_he | character varying | Y | - |  |
| 27 | route_path | character varying | Y | - |  |
| 28 | required_role | character varying | Y | - |  |
| 29 | tags | text | Y | - |  |

#### 139. `platform_roles`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_roles_id_seq'::regc... | 🔑 PK |
| 2 | name | text | N | - | UNIQUE |
| 3 | name_he | text | Y | - |  |
| 4 | name_en | text | Y | - |  |
| 5 | slug | text | N | - | UNIQUE |
| 6 | description | text | Y | - |  |
| 7 | color | text | N | 'blue'::text |  |
| 8 | is_system | boolean | N | false |  |
| 9 | is_active | boolean | N | true |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | role_code | character varying | Y | - |  |
| 14 | role_name | character varying | Y | - |  |
| 15 | role_name_he | character varying | Y | - |  |
| 16 | permissions | text | Y | - |  |
| 17 | module_access | text | Y | - |  |
| 18 | is_system_role | boolean | Y | false |  |
| 19 | notes | text | Y | - |  |
| 20 | tags | text | Y | - |  |

#### 140. `platform_tools`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_tools_id_seq'::regc... | 🔑 PK |
| 2 | module_id | integer | Y | - |  |
| 3 | name | character varying | N | - |  |
| 4 | slug | character varying | Y | - |  |
| 5 | description | text | Y | - |  |
| 6 | tool_type | character varying | Y | 'utility'::character varying |  |
| 7 | entity_id | integer | Y | - |  |
| 8 | input_config | jsonb | Y | '{}'::jsonb |  |
| 9 | output_config | jsonb | Y | '{}'::jsonb |  |
| 10 | execution_config | jsonb | Y | '{}'::jsonb |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | last_run_at | timestamp with time zone | Y | - |  |
| 13 | run_count | integer | Y | 0 |  |
| 14 | created_at | timestamp with time zone | Y | now() |  |
| 15 | updated_at | timestamp with time zone | Y | now() |  |

#### 141. `platform_widgets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('platform_widgets_id_seq'::re... | 🔑 PK |
| 2 | module_id | integer | N | - | FK → platform_modules.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | widget_type | text | N | 'count'::text |  |
| 6 | entity_id | integer | Y | - |  |
| 7 | config | jsonb | N | '{}'::jsonb |  |
| 8 | position | integer | N | 0 |  |
| 9 | is_active | boolean | N | true |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |
| 12 | widget_code | character varying | Y | - |  |
| 13 | widget_name | character varying | Y | - |  |
| 14 | data_source | character varying | Y | - |  |
| 15 | refresh_interval | integer | Y | - |  |
| 16 | required_role | character varying | Y | - |  |
| 17 | sort_order | integer | Y | 0 |  |
| 18 | tags | text | Y | - |  |

#### 142. `price_quote_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('price_quote_items_id_seq'::r... | 🔑 PK |
| 2 | quote_id | integer | N | - |  |
| 3 | material_id | integer | Y | - |  |
| 4 | item_code | text | Y | - |  |
| 5 | item_description | text | N | - |  |
| 6 | quantity | numeric | N | 1 |  |
| 7 | unit | text | Y | 'יחידה'::text |  |
| 8 | unit_price | numeric | N | 0 |  |
| 9 | discount_percent | numeric | Y | 0 |  |
| 10 | tax_percent | numeric | Y | 18 |  |
| 11 | total_price | numeric | N | 0 |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | line_number | integer | Y | - |  |
| 15 | product_id | integer | Y | - |  |
| 16 | product_name | character varying | Y | - |  |
| 17 | description | text | Y | - |  |
| 18 | uom | character varying | Y | - |  |
| 19 | discount_pct | numeric | Y | 0 |  |
| 20 | line_total | numeric | Y | - |  |
| 21 | width_mm | numeric | Y | - |  |
| 22 | height_mm | numeric | Y | - |  |
| 23 | area_sqm | numeric | Y | - |  |
| 24 | material_type | character varying | Y | - |  |
| 25 | glass_type | character varying | Y | - |  |
| 26 | color | character varying | Y | - |  |
| 27 | tags | text | Y | - |  |

#### 143. `price_quotes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('price_quotes_id_seq'::regclass) | 🔑 PK |
| 2 | quote_number | text | N | - | UNIQUE |
| 3 | supplier_id | integer | N | - |  |
| 4 | request_id | integer | Y | - |  |
| 5 | status | text | N | 'טיוטה'::text |  |
| 6 | quote_date | date | Y | CURRENT_DATE |  |
| 7 | validity_date | date | Y | - |  |
| 8 | total_amount | numeric | Y | 0 |  |
| 9 | total_before_tax | numeric | Y | 0 |  |
| 10 | tax_amount | numeric | Y | 0 |  |
| 11 | currency | text | Y | 'ILS'::text |  |
| 12 | payment_terms | text | Y | - |  |
| 13 | delivery_days | integer | Y | - |  |
| 14 | is_recommended | boolean | Y | false |  |
| 15 | comparison_group | text | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | created_by | text | Y | - |  |
| 18 | created_at | timestamp without time zone | N | now() |  |
| 19 | updated_at | timestamp without time zone | N | now() |  |
| 20 | supplier_name | character varying | Y | - |  |
| 21 | contact_person | character varying | Y | - |  |
| 22 | contact_email | character varying | Y | - |  |
| 23 | contact_phone | character varying | Y | - |  |
| 24 | shipping_cost | numeric | Y | - |  |
| 25 | discount_pct | numeric | Y | - |  |
| 26 | discount_amount | numeric | Y | - |  |
| 27 | incoterms | character varying | Y | - |  |
| 28 | shipping_method | character varying | Y | - |  |
| 29 | warranty_terms | text | Y | - |  |
| 30 | min_order_qty | numeric | Y | - |  |
| 31 | sample_available | boolean | Y | false |  |
| 32 | certifications | text | Y | - |  |
| 33 | evaluation_score | numeric | Y | - |  |
| 34 | approved_by | character varying | Y | - |  |
| 35 | rejection_reason | text | Y | - |  |
| 36 | customer_id | integer | Y | - |  |
| 37 | customer_name | character varying | Y | - |  |
| 38 | project_name | character varying | Y | - |  |
| 39 | valid_until | date | Y | - |  |
| 40 | includes_installation | boolean | Y | false |  |
| 41 | installation_cost | numeric | Y | - |  |
| 42 | includes_delivery | boolean | Y | false |  |
| 43 | delivery_cost | numeric | Y | - |  |
| 44 | converted | boolean | Y | false |  |
| 45 | converted_to_id | integer | Y | - |  |
| 46 | tags | text | Y | - |  |

#### 144. `qa_test_cases`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('qa_test_cases_id_seq'::regcl... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | test_type | text | Y | 'functional'::text |  |
| 5 | steps | text | Y | - |  |
| 6 | expected_result | text | Y | - |  |
| 7 | actual_result | text | Y | - |  |
| 8 | status | text | Y | 'pending'::text |  |
| 9 | severity | text | Y | 'medium'::text |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 145. `qa_tests`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('qa_tests_id_seq'::regclass) | 🔑 PK |
| 2 | test_name | text | Y | - |  |
| 3 | description | text | Y | - |  |
| 4 | test_type | text | Y | 'functional'::text |  |
| 5 | module | text | Y | - |  |
| 6 | severity | text | Y | 'medium'::text |  |
| 7 | steps | text | Y | - |  |
| 8 | expected_result | text | Y | - |  |
| 9 | actual_result | text | Y | - |  |
| 10 | status | text | Y | 'pending'::text |  |
| 11 | tester | text | Y | - |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

#### 146. `quote_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | quote_id | integer | Y | - |  |
| 3 | line_number | integer | Y | - |  |
| 4 | product_id | uuid | Y | - |  |
| 5 | description | text | Y | - |  |
| 6 | quantity | numeric | Y | - |  |
| 7 | unit | character varying | Y | - |  |
| 8 | unit_price | integer | Y | 0 |  |
| 9 | cost_price | integer | Y | 0 |  |
| 10 | margin_percent | numeric | Y | - |  |
| 11 | discount_percent | numeric | Y | 0 |  |
| 12 | discount_amount | integer | Y | 0 |  |
| 13 | tax_rate | numeric | Y | 18 |  |
| 14 | line_total | integer | Y | 0 |  |
| 15 | delivery_days | integer | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | sort_order | integer | Y | 0 |  |
| 18 | created_at | timestamp without time zone | Y | now() |  |
| 19 | updated_at | timestamp without time zone | Y | now() |  |

#### 147. `quotes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('quotes_id_seq'::regclass) | 🔑 PK |
| 2 | quote_number | character varying | Y | - |  |
| 3 | customer_id | integer | Y | - |  |
| 4 | customer_name | character varying | Y | - |  |
| 5 | quote_date | date | Y | CURRENT_DATE |  |
| 6 | valid_until | date | Y | - |  |
| 7 | status | character varying | Y | 'draft'::character varying |  |
| 8 | sales_rep | character varying | Y | - |  |
| 9 | subtotal | numeric | Y | 0 |  |
| 10 | discount_amount | numeric | Y | 0 |  |
| 11 | tax_amount | numeric | Y | 0 |  |
| 12 | total_amount | numeric | Y | 0 |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp with time zone | Y | now() |  |
| 15 | updated_at | timestamp with time zone | Y | now() |  |
| 16 | customer_contact | character varying | Y | - |  |
| 17 | customer_phone | character varying | Y | - |  |
| 18 | customer_email | character varying | Y | - |  |
| 19 | quote_type | character varying | Y | 'standard'::character varying |  |
| 20 | priority | character varying | Y | 'normal'::character varying |  |
| 21 | payment_terms | character varying | Y | - |  |
| 22 | delivery_terms | character varying | Y | - |  |
| 23 | delivery_date | date | Y | - |  |
| 24 | installation_required | boolean | Y | false |  |
| 25 | measurement_required | boolean | Y | false |  |
| 26 | revision_number | integer | Y | 0 |  |
| 27 | approved_by | character varying | Y | - |  |
| 28 | approved_at | timestamp with time zone | Y | - |  |
| 29 | project_name | character varying | Y | - |  |
| 30 | project_id | integer | Y | - |  |
| 31 | cost_center | character varying | Y | - |  |
| 32 | total_area_sqm | numeric | Y | - |  |
| 33 | internal_notes | text | Y | - |  |
| 34 | line_items_json | text | Y | - |  |
| 35 | currency | character varying | Y | 'ILS'::character varying |  |
| 36 | created_by | character varying | Y | - |  |
| 37 | converted_order_id | integer | Y | - |  |
| 38 | contact_id | integer | Y | - |  |
| 39 | contact_name | character varying | Y | - |  |
| 40 | vat_amount | numeric | Y | 0 |  |
| 41 | discount_pct | numeric | Y | 0 |  |
| 42 | delivery_days | integer | Y | - |  |
| 43 | converted_to_order | boolean | Y | false |  |
| 44 | order_id | integer | Y | - |  |
| 45 | order_number | character varying | Y | - |  |
| 46 | tags | text | Y | - |  |

#### 148. `reconciliation_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('reconciliation_items_id_seq'... | 🔑 PK |
| 2 | reconciliation_id | integer | N | - | FK → bank_reconciliations.id |
| 3 | item_number | character varying | Y | - |  |
| 4 | item_date | date | N | CURRENT_DATE |  |
| 5 | description | text | N | - |  |
| 6 | reference | character varying | Y | - |  |
| 7 | item_type | character varying | N | 'bank_only'::character varying |  |
| 8 | amount | numeric | N | 0 |  |
| 9 | debit_amount | numeric | Y | 0 |  |
| 10 | credit_amount | numeric | Y | 0 |  |
| 11 | bank_amount | numeric | Y | 0 |  |
| 12 | book_amount | numeric | Y | 0 |  |
| 13 | difference | numeric | Y | 0 |  |
| 14 | matched | boolean | Y | false |  |
| 15 | matched_to_id | integer | Y | - |  |
| 16 | matched_date | date | Y | - |  |
| 17 | category | character varying | Y | - |  |
| 18 | source | character varying | Y | 'manual'::character varying |  |
| 19 | notes | text | Y | - |  |
| 20 | created_at | timestamp with time zone | Y | now() |  |
| 21 | transaction_date | date | Y | - |  |
| 22 | debit | numeric | Y | 0 |  |
| 23 | credit | numeric | Y | 0 |  |
| 24 | match_method | character varying | Y | - |  |
| 25 | match_date | date | Y | - |  |
| 26 | status | character varying | Y | 'unmatched'::character varying |  |
| 27 | tags | text | Y | - |  |

#### 149. `record_versions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('record_versions_id_seq'::reg... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | record_id | integer | N | - |  |
| 4 | version_number | integer | N | 1 |  |
| 5 | data | jsonb | N | '{}'::jsonb |  |
| 6 | status | text | Y | - |  |
| 7 | created_by | text | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | entity_type | character varying | Y | - |  |
| 10 | snapshot_data | text | Y | - |  |
| 11 | changed_fields | text | Y | - |  |
| 12 | changed_by | character varying | Y | - |  |
| 13 | changed_at | timestamp with time zone | Y | now() |  |
| 14 | change_reason | text | Y | - |  |
| 15 | is_current | boolean | Y | false |  |
| 16 | tags | text | Y | - |  |
| 17 | entity_ref | character varying | Y | - |  |
| 18 | change_type | character varying | Y | - |  |
| 19 | approved_by | character varying | Y | - |  |
| 20 | approved_at | timestamp with time zone | Y | - |  |
| 21 | rollback_available | boolean | Y | true |  |

#### 150. `recruitment_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('recruitment_records_id_seq':... | 🔑 PK |
| 2 | job_number | character varying | N | - | UNIQUE |
| 3 | position_title | text | N | - |  |
| 4 | department | character varying | Y | - |  |
| 5 | employment_type | character varying | Y | 'full_time'::character varying |  |
| 6 | location | character varying | Y | - |  |
| 7 | salary_range_min | numeric | Y | 0 |  |
| 8 | salary_range_max | numeric | Y | 0 |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | required_experience | character varying | Y | - |  |
| 11 | education_level | character varying | Y | - |  |
| 12 | description | text | Y | - |  |
| 13 | requirements | text | Y | - |  |
| 14 | benefits | text | Y | - |  |
| 15 | hiring_manager | text | Y | - |  |
| 16 | recruiter_name | text | Y | - |  |
| 17 | publish_date | date | Y | - |  |
| 18 | deadline_date | date | Y | - |  |
| 19 | candidates_count | integer | Y | 0 |  |
| 20 | interviews_scheduled | integer | Y | 0 |  |
| 21 | offers_made | integer | Y | 0 |  |
| 22 | positions_filled | integer | Y | 0 |  |
| 23 | total_positions | integer | Y | 1 |  |
| 24 | priority | character varying | Y | 'normal'::character varying |  |
| 25 | source | character varying | Y | - |  |
| 26 | status | character varying | Y | 'draft'::character varying |  |
| 27 | notes | text | Y | - |  |
| 28 | created_by | integer | Y | - |  |
| 29 | created_by_name | text | Y | - |  |
| 30 | created_at | timestamp with time zone | Y | now() |  |
| 31 | updated_at | timestamp with time zone | Y | now() |  |
| 32 | job_type | character varying | Y | - |  |
| 33 | min_age | integer | Y | - |  |
| 34 | max_age | integer | Y | - |  |
| 35 | gender_preference | character varying | Y | - |  |
| 36 | languages_required | text | Y | - |  |
| 37 | skills_required | text | Y | - |  |
| 38 | screening_questions | text | Y | - |  |
| 39 | assessment_type | character varying | Y | - |  |
| 40 | average_time_to_hire | integer | Y | - |  |
| 41 | cost_per_hire | numeric | Y | - |  |
| 42 | referral_bonus | numeric | Y | - |  |
| 43 | posting_urls | text | Y | - |  |
| 44 | requisition_number | character varying | Y | - |  |
| 45 | candidate_name | character varying | Y | - |  |
| 46 | candidate_email | character varying | Y | - |  |
| 47 | candidate_phone | character varying | Y | - |  |
| 48 | candidate_address | text | Y | - |  |
| 49 | recruitment_source | character varying | Y | - |  |
| 50 | source_detail | character varying | Y | - |  |
| 51 | resume_url | text | Y | - |  |
| 52 | cover_letter_url | text | Y | - |  |
| 53 | portfolio_url | text | Y | - |  |
| 54 | linkedin_url | text | Y | - |  |
| 55 | current_employer | character varying | Y | - |  |
| 56 | current_title | character varying | Y | - |  |
| 57 | years_experience | integer | Y | - |  |
| 58 | expected_salary | numeric | Y | - |  |
| 59 | offered_salary | numeric | Y | - |  |
| 60 | interview_date | date | Y | - |  |
| 61 | interview_score | numeric | Y | - |  |
| 62 | technical_test_score | numeric | Y | - |  |
| 63 | reference_1_name | character varying | Y | - |  |
| 64 | reference_1_phone | character varying | Y | - |  |
| 65 | reference_2_name | character varying | Y | - |  |
| 66 | reference_2_phone | character varying | Y | - |  |
| 67 | background_check | boolean | Y | false |  |
| 68 | background_check_date | date | Y | - |  |
| 69 | offer_date | date | Y | - |  |
| 70 | offer_accepted_date | date | Y | - |  |
| 71 | rejection_reason | text | Y | - |  |
| 72 | start_date | date | Y | - |  |
| 73 | onboarding_complete | boolean | Y | false |  |
| 74 | tags | text | Y | - |  |
| 75 | hiring_manager_id | integer | Y | - |  |
| 76 | candidate_id_number | character varying | Y | - |  |
| 77 | interviewer | character varying | Y | - |  |
| 78 | interview_notes | text | Y | - |  |
| 79 | reference_check | boolean | Y | false |  |
| 80 | reference_notes | text | Y | - |  |
| 81 | offered_date | date | Y | - |  |
| 82 | offer_accepted | boolean | Y | - |  |
| 83 | requires_security_clearance | boolean | Y | false |  |
| 84 | security_clearance_status | character varying | Y | - |  |
| 85 | documents_url | text | Y | - |  |
| 86 | medical_check_required | boolean | Y | false |  |
| 87 | medical_check_done | boolean | Y | false |  |
| 88 | medical_check_date | date | Y | - |  |
| 89 | background_check_done | boolean | Y | false |  |
| 90 | onboarding_started | boolean | Y | false |  |
| 91 | onboarding_completed | boolean | Y | false |  |
| 92 | equipment_ordered | boolean | Y | false |  |
| 93 | workstation_assigned | character varying | Y | - |  |
| 94 | mentor_assigned | character varying | Y | - |  |
| 95 | probation_end_date | date | Y | - |  |
| 96 | probation_passed | boolean | Y | - |  |

#### 151. `report_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('report_definitions_id_seq'::... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | entity_id | integer | Y | - |  |
| 6 | query_config | jsonb | N | '{}'::jsonb |  |
| 7 | columns | jsonb | N | '[]'::jsonb |  |
| 8 | aggregations | jsonb | N | '[]'::jsonb |  |
| 9 | grouping | jsonb | N | '[]'::jsonb |  |
| 10 | filters | jsonb | N | '[]'::jsonb |  |
| 11 | sorting | jsonb | N | '[]'::jsonb |  |
| 12 | calculated_fields | jsonb | N | '[]'::jsonb |  |
| 13 | display_type | text | N | 'table'::text |  |
| 14 | chart_config | jsonb | N | '{}'::jsonb |  |
| 15 | schedule_config | jsonb | Y | 'null'::jsonb |  |
| 16 | schedule_email | text | Y | - |  |
| 17 | is_active | boolean | N | true |  |
| 18 | created_at | timestamp without time zone | N | now() |  |
| 19 | updated_at | timestamp without time zone | N | now() |  |
| 20 | report_code | character varying | Y | - |  |
| 21 | report_name | character varying | Y | - |  |
| 22 | report_type | character varying | Y | - |  |
| 23 | category | character varying | Y | - |  |
| 24 | data_source | character varying | Y | - |  |
| 25 | query_template | text | Y | - |  |
| 26 | columns_config | text | Y | - |  |
| 27 | filters_config | text | Y | - |  |
| 28 | grouping_config | text | Y | - |  |
| 29 | sorting_config | text | Y | - |  |
| 30 | access_roles | text | Y | - |  |
| 31 | is_scheduled | boolean | Y | false |  |
| 32 | schedule_cron | character varying | Y | - |  |
| 33 | notes | text | Y | - |  |
| 34 | tags | text | Y | - |  |

#### 152. `rfqs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | rfq_number | character varying | Y | - | UNIQUE |
| 3 | supplier_ids | jsonb | Y | '[]'::jsonb |  |
| 4 | items | jsonb | Y | '[]'::jsonb |  |
| 5 | deadline | date | Y | - |  |
| 6 | status | character varying | Y | 'draft'::character varying |  |
| 7 | notes | text | Y | - |  |
| 8 | created_by | uuid | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 153. `role_assignments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('role_assignments_id_seq'::re... | 🔑 PK |
| 2 | role_id | integer | N | - |  |
| 3 | user_id | text | N | - |  |
| 4 | assigned_by | text | Y | - |  |
| 5 | created_at | timestamp without time zone | N | now() |  |
| 6 | role_name | character varying | Y | - |  |
| 7 | department | character varying | Y | - |  |
| 8 | assigned_at | timestamp with time zone | Y | now() |  |
| 9 | expires_at | timestamp with time zone | Y | - |  |
| 10 | is_active | boolean | Y | true |  |
| 11 | tags | text | Y | - |  |
| 12 | reason | text | Y | - |  |
| 13 | is_primary | boolean | Y | false |  |

#### 154. `roles_config`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('roles_config_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | display_name | text | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | permissions | jsonb | Y | '[]'::jsonb |  |
| 6 | user_count | integer | Y | 0 |  |
| 7 | is_system | boolean | Y | false |  |
| 8 | status | text | Y | 'active'::text |  |
| 9 | is_active | boolean | Y | true |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |

#### 155. `routing_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('routing_log_id_seq'::regclass) | 🔑 PK |
| 2 | lead_name | text | N | - |  |
| 3 | company | text | N | ''::text |  |
| 4 | source | text | N | ''::text |  |
| 5 | assigned_to | text | N | - |  |
| 6 | rule_name | text | N | - |  |
| 7 | reason | text | N | ''::text |  |
| 8 | priority | text | N | 'medium'::text |  |
| 9 | created_at | timestamp with time zone | N | now() |  |
| 10 | log_number | character varying | Y | - |  |
| 11 | work_order_id | integer | Y | - |  |
| 12 | work_order_number | character varying | Y | - |  |
| 13 | routing_rule_id | integer | Y | - |  |
| 14 | step_number | integer | Y | - |  |
| 15 | step_name | character varying | Y | - |  |
| 16 | operator_id | integer | Y | - |  |
| 17 | operator_name | character varying | Y | - |  |
| 18 | machine_id | integer | Y | - |  |
| 19 | machine_name | character varying | Y | - |  |
| 20 | workstation | character varying | Y | - |  |
| 21 | planned_start | timestamp with time zone | Y | - |  |
| 22 | planned_end | timestamp with time zone | Y | - |  |
| 23 | actual_start | timestamp with time zone | Y | - |  |
| 24 | actual_end | timestamp with time zone | Y | - |  |
| 25 | setup_start | timestamp with time zone | Y | - |  |
| 26 | setup_end | timestamp with time zone | Y | - |  |
| 27 | setup_minutes | numeric | Y | - |  |
| 28 | run_minutes | numeric | Y | - |  |
| 29 | wait_minutes | numeric | Y | - |  |
| 30 | total_minutes | numeric | Y | - |  |
| 31 | qty_input | numeric | Y | - |  |
| 32 | qty_output | numeric | Y | - |  |
| 33 | qty_scrap | numeric | Y | 0 |  |
| 34 | qty_rework | numeric | Y | 0 |  |
| 35 | scrap_reason | text | Y | - |  |
| 36 | yield_pct | numeric | Y | - |  |
| 37 | quality_passed | boolean | Y | - |  |
| 38 | quality_inspector | character varying | Y | - |  |
| 39 | quality_notes | text | Y | - |  |
| 40 | energy_kwh | numeric | Y | - |  |
| 41 | downtime_minutes | numeric | Y | 0 |  |
| 42 | downtime_reason | text | Y | - |  |
| 43 | notes | text | Y | - |  |
| 44 | photos_url | text | Y | - |  |
| 45 | tags | text | Y | - |  |
| 46 | status | character varying | Y | 'pending'::character varying |  |

#### 156. `routing_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('routing_rules_id_seq'::regcl... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | N | ''::text |  |
| 4 | strategy | text | N | 'round_robin'::text |  |
| 5 | lead_type | text | N | 'ליד רגיל'::text |  |
| 6 | conditions | ARRAY | N | '{}'::text[] |  |
| 7 | agents | ARRAY | N | '{}'::text[] |  |
| 8 | active | boolean | N | true |  |
| 9 | routed | integer | N | 0 |  |
| 10 | created_at | timestamp with time zone | N | now() |  |
| 11 | updated_at | timestamp with time zone | N | now() |  |
| 12 | routing_number | character varying | Y | - |  |
| 13 | routing_name | character varying | Y | - |  |
| 14 | product_id | integer | Y | - |  |
| 15 | product_name | character varying | Y | - |  |
| 16 | product_category | character varying | Y | - |  |
| 17 | bom_id | integer | Y | - |  |
| 18 | version | integer | Y | 1 |  |
| 19 | step_number | integer | Y | - |  |
| 20 | step_name | character varying | Y | - |  |
| 21 | operation_type | character varying | Y | - |  |
| 22 | workstation | character varying | Y | - |  |
| 23 | workstation_alt | character varying | Y | - |  |
| 24 | machine_id | integer | Y | - |  |
| 25 | machine_name | character varying | Y | - |  |
| 26 | machine_alt_id | integer | Y | - |  |
| 27 | department | character varying | Y | - |  |
| 28 | skill_required | character varying | Y | - |  |
| 29 | min_workers | integer | Y | 1 |  |
| 30 | max_workers | integer | Y | - |  |
| 31 | setup_time_minutes | numeric | Y | 0 |  |
| 32 | run_time_per_unit | numeric | Y | - |  |
| 33 | run_time_per_batch | numeric | Y | - |  |
| 34 | wait_time_minutes | numeric | Y | 0 |  |
| 35 | move_time_minutes | numeric | Y | 0 |  |
| 36 | queue_time_minutes | numeric | Y | 0 |  |
| 37 | total_time_per_unit | numeric | Y | - |  |
| 38 | capacity_per_hour | numeric | Y | - |  |
| 39 | capacity_per_shift | numeric | Y | - |  |
| 40 | standard_batch_size | numeric | Y | - |  |
| 41 | overlap_pct | numeric | Y | 0 |  |
| 42 | is_bottleneck | boolean | Y | false |  |
| 43 | is_outsourced | boolean | Y | false |  |
| 44 | outsource_vendor | character varying | Y | - |  |
| 45 | outsource_cost_per_unit | numeric | Y | - |  |
| 46 | quality_check_after | boolean | Y | false |  |
| 47 | inspection_type | character varying | Y | - |  |
| 48 | scrap_rate_pct | numeric | Y | 0 |  |
| 49 | rework_rate_pct | numeric | Y | 0 |  |
| 50 | safety_requirements | text | Y | - |  |
| 51 | tooling_required | text | Y | - |  |
| 52 | instruction_url | text | Y | - |  |
| 53 | drawing_url | text | Y | - |  |
| 54 | video_url | text | Y | - |  |
| 55 | effective_date | date | Y | - |  |
| 56 | expiry_date | date | Y | - |  |
| 57 | is_active | boolean | Y | true |  |
| 58 | created_by | character varying | Y | - |  |
| 59 | notes | text | Y | - |  |
| 60 | tags | text | Y | - |  |

#### 157. `shift_assignments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('shift_assignments_id_seq'::r... | 🔑 PK |
| 2 | assignment_number | character varying | Y | - | UNIQUE |
| 3 | employee_name | character varying | N | - |  |
| 4 | employee_id_ref | integer | Y | - |  |
| 5 | shift_date | date | N | CURRENT_DATE |  |
| 6 | shift_type | character varying | Y | 'morning'::character varying |  |
| 7 | start_time | time without time zone | Y | - |  |
| 8 | end_time | time without time zone | Y | - |  |
| 9 | actual_start | time without time zone | Y | - |  |
| 10 | actual_end | time without time zone | Y | - |  |
| 11 | department | character varying | Y | - |  |
| 12 | location | character varying | Y | - |  |
| 13 | position | character varying | Y | - |  |
| 14 | status | character varying | Y | 'scheduled'::character varying |  |
| 15 | break_minutes | integer | Y | 30 |  |
| 16 | is_holiday | boolean | Y | false |  |
| 17 | is_overtime | boolean | Y | false |  |
| 18 | swap_with | character varying | Y | - |  |
| 19 | swap_status | character varying | Y | - |  |
| 20 | approved_by | character varying | Y | - |  |
| 21 | notes | text | Y | - |  |
| 22 | created_at | timestamp without time zone | Y | now() |  |
| 23 | updated_at | timestamp without time zone | Y | now() |  |
| 24 | overtime_hours | numeric | Y | - |  |
| 25 | overtime_rate | numeric | Y | - |  |
| 26 | hourly_rate | numeric | Y | - |  |
| 27 | total_pay | numeric | Y | - |  |
| 28 | reason | character varying | Y | - |  |
| 29 | absence_type | character varying | Y | - |  |
| 30 | replacement_name | character varying | Y | - |  |
| 31 | check_in_method | character varying | Y | - |  |
| 32 | gps_latitude | numeric | Y | - |  |
| 33 | gps_longitude | numeric | Y | - |  |
| 34 | employee_id | integer | Y | - |  |
| 35 | shift_name | character varying | Y | - |  |
| 36 | break_duration_minutes | integer | Y | 30 |  |
| 37 | date | date | Y | - |  |
| 38 | week_number | integer | Y | - |  |
| 39 | substitute_for | character varying | Y | - |  |
| 40 | substitute_reason | text | Y | - |  |
| 41 | supervisor | character varying | Y | - |  |
| 42 | workstation | character varying | Y | - |  |
| 43 | machine_id | integer | Y | - |  |
| 44 | no_show | boolean | Y | false |  |
| 45 | tags | text | Y | - |  |
| 46 | production_target | numeric | Y | - |  |
| 47 | production_achieved | numeric | Y | - |  |
| 48 | quality_issues | integer | Y | 0 |  |
| 49 | safety_incidents | integer | Y | 0 |  |
| 50 | handover_notes | text | Y | - |  |

#### 158. `shift_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | start_time | time without time zone | Y | - |  |
| 4 | end_time | time without time zone | Y | - |  |
| 5 | break_duration_minutes | integer | Y | 30 |  |
| 6 | department | character varying | Y | - |  |
| 7 | color | character varying | Y | '#3b82f6'::character varying |  |
| 8 | is_active | boolean | Y | true |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |

#### 159. `site_measurements`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('site_measurements_id_seq'::r... | 🔑 PK |
| 2 | measurement_number | character varying | Y | - | UNIQUE |
| 3 | sales_order_id | integer | Y | - |  |
| 4 | customer_id | integer | Y | - |  |
| 5 | measurer_id | integer | Y | - |  |
| 6 | measurement_date | date | Y | CURRENT_DATE |  |
| 7 | measurement_time | time without time zone | Y | - |  |
| 8 | site_address | jsonb | Y | '{}'::jsonb |  |
| 9 | status | character varying | Y | 'scheduled'::character varying |  |
| 10 | measurements_data | jsonb | Y | '{}'::jsonb |  |
| 11 | total_linear_meters | numeric | Y | 0 |  |
| 12 | total_square_meters | numeric | Y | 0 |  |
| 13 | floor_plan_url | character varying | Y | - |  |
| 14 | photos | jsonb | Y | '[]'::jsonb |  |
| 15 | special_requirements | text | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | is_active | boolean | Y | true |  |
| 18 | created_by | integer | Y | - |  |
| 19 | created_at | timestamp without time zone | Y | now() |  |
| 20 | updated_at | timestamp without time zone | Y | now() |  |

#### 160. `sla_breaches`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sla_breaches_id_seq'::regclass) | 🔑 PK |
| 2 | ticket | text | N | - |  |
| 3 | customer | text | N | - |  |
| 4 | breach_type | text | N | 'resolution'::text |  |
| 5 | priority | text | N | 'medium'::text |  |
| 6 | assigned_to | text | N | ''::text |  |
| 7 | hours_overdue | numeric | N | 0 |  |
| 8 | status | text | N | 'open'::text |  |
| 9 | created_at | timestamp with time zone | N | now() |  |
| 10 | updated_at | timestamp with time zone | N | now() |  |
| 11 | sla_rule_id | integer | Y | - |  |
| 12 | entity_type | character varying | Y | - |  |
| 13 | entity_id | integer | Y | - |  |
| 14 | entity_ref | character varying | Y | - |  |
| 15 | breach_date | timestamp with time zone | Y | - |  |
| 16 | expected_by | timestamp with time zone | Y | - |  |
| 17 | actual_time | timestamp with time zone | Y | - |  |
| 18 | overdue_hours | numeric | Y | - |  |
| 19 | escalated | boolean | Y | false |  |
| 20 | resolved | boolean | Y | false |  |
| 21 | resolved_at | timestamp with time zone | Y | - |  |
| 22 | penalty_applied | boolean | Y | false |  |
| 23 | penalty_amount | numeric | Y | - |  |
| 24 | notes | text | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 161. `sla_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sla_rules_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | ticket_type | text | N | 'תמיכה טכנית'::text |  |
| 4 | priority | text | N | 'medium'::text |  |
| 5 | first_response_hours | numeric | N | 4 |  |
| 6 | resolution_hours | numeric | N | 24 |  |
| 7 | escalation_hours | numeric | N | 8 |  |
| 8 | assigned_team | text | N | 'תמיכה רגילה'::text |  |
| 9 | active | boolean | N | true |  |
| 10 | created_at | timestamp with time zone | N | now() |  |
| 11 | updated_at | timestamp with time zone | N | now() |  |
| 12 | rule_name | character varying | Y | - |  |
| 13 | sla_type | character varying | Y | - |  |
| 14 | entity_type | character varying | Y | - |  |
| 15 | response_time_hours | numeric | Y | - |  |
| 16 | resolution_time_hours | numeric | Y | - |  |
| 17 | escalation_time_hours | numeric | Y | - |  |
| 18 | escalation_to | character varying | Y | - |  |
| 19 | business_hours_only | boolean | Y | true |  |
| 20 | penalty_amount | numeric | Y | - |  |
| 21 | applies_to_roles | text | Y | - |  |
| 22 | applies_to_customers | text | Y | - |  |
| 23 | is_active | boolean | Y | true |  |
| 24 | notes | text | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 162. `smart_routing_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('smart_routing_rules_id_seq':... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | criteria | text | Y | - |  |
| 5 | target_team | text | Y | - |  |
| 6 | priority | integer | Y | 1 |  |
| 7 | status | text | Y | 'active'::text |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 163. `social_media_metrics`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('social_media_metrics_id_seq'... | 🔑 PK |
| 2 | platform | text | Y | - |  |
| 3 | account_name | text | Y | - |  |
| 4 | followers | integer | Y | 0 |  |
| 5 | followers_change | integer | Y | 0 |  |
| 6 | posts | integer | Y | 0 |  |
| 7 | engagement | numeric | Y | 0 |  |
| 8 | reach | integer | Y | 0 |  |
| 9 | impressions | integer | Y | 0 |  |
| 10 | clicks | integer | Y | 0 |  |
| 11 | shares | integer | Y | 0 |  |
| 12 | metric_date | date | Y | - |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |

#### 164. `social_media_posts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('social_media_posts_id_seq'::... | 🔑 PK |
| 2 | platform | character varying | N | - |  |
| 3 | content | text | Y | - |  |
| 4 | status | character varying | Y | 'draft'::character varying |  |
| 5 | scheduled_at | timestamp without time zone | Y | - |  |
| 6 | published_at | timestamp without time zone | Y | - |  |
| 7 | engagement | integer | Y | 0 |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 165. `standing_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('standing_orders_id_seq'::reg... | 🔑 PK |
| 2 | customer_name | character varying | Y | - |  |
| 3 | customer_id | integer | Y | - |  |
| 4 | amount | numeric | Y | 0 |  |
| 5 | frequency | character varying | Y | 'monthly'::character varying |  |
| 6 | start_date | date | Y | - |  |
| 7 | end_date | date | Y | - |  |
| 8 | payment_method | character varying | Y | - |  |
| 9 | description | text | Y | - |  |
| 10 | status | character varying | Y | 'active'::character varying |  |
| 11 | last_charge_date | date | Y | - |  |
| 12 | next_charge_date | date | Y | - |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |
| 16 | order_number | character varying | Y | - |  |
| 17 | supplier_name | character varying | Y | - |  |
| 18 | supplier_id | integer | Y | - |  |
| 19 | category | character varying | Y | - |  |
| 20 | bank_account | character varying | Y | - |  |
| 21 | currency | character varying | Y | 'ILS'::character varying |  |
| 22 | vat_amount | numeric | Y | - |  |
| 23 | total_with_vat | numeric | Y | - |  |
| 24 | charge_day | integer | Y | - |  |
| 25 | total_charged | numeric | Y | 0 |  |
| 26 | charges_count | integer | Y | 0 |  |
| 27 | max_charges | integer | Y | - |  |
| 28 | approval_required | boolean | Y | false |  |
| 29 | approved_by | character varying | Y | - |  |
| 30 | reference_number | character varying | Y | - |  |
| 31 | order_type | character varying | Y | - |  |
| 32 | next_delivery_date | date | Y | - |  |
| 33 | last_delivery_date | date | Y | - |  |
| 34 | total_deliveries | integer | Y | 0 |  |
| 35 | max_deliveries | integer | Y | - |  |
| 36 | min_order_value | numeric | Y | - |  |
| 37 | max_order_value | numeric | Y | - |  |
| 38 | auto_generate_po | boolean | Y | false |  |
| 39 | auto_generate_days_before | integer | Y | 7 |  |
| 40 | items | text | Y | - |  |
| 41 | documents_url | text | Y | - |  |
| 42 | tags | text | Y | - |  |

#### 166. `status_transitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('status_transitions_id_seq'::... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | from_status_id | integer | Y | - | FK → entity_statuses.id |
| 4 | to_status_id | integer | N | - | FK → entity_statuses.id |
| 5 | label | text | N | - |  |
| 6 | icon | text | Y | - |  |
| 7 | conditions | jsonb | Y | '{}'::jsonb |  |
| 8 | settings | jsonb | Y | '{}'::jsonb |  |
| 9 | created_at | timestamp without time zone | N | now() |  |
| 10 | entity_type | character varying | Y | - |  |
| 11 | from_status | character varying | Y | - |  |
| 12 | to_status | character varying | Y | - |  |
| 13 | required_role | character varying | Y | - |  |
| 14 | requires_approval | boolean | Y | false |  |
| 15 | auto_transition | boolean | Y | false |  |
| 16 | condition | text | Y | - |  |
| 17 | is_active | boolean | Y | true |  |
| 18 | tags | text | Y | - |  |

#### 167. `strategic_goals`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('strategic_goals_id_seq'::reg... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | category | text | Y | - |  |
| 5 | owner | text | Y | - |  |
| 6 | status | text | N | 'draft'::text |  |
| 7 | target_date | date | Y | - |  |
| 8 | progress_pct | numeric | Y | 0 |  |
| 9 | key_results | jsonb | Y | - |  |
| 10 | linked_department | text | Y | - |  |
| 11 | created_at | timestamp with time zone | Y | now() |  |
| 12 | updated_at | timestamp with time zone | Y | now() |  |
| 13 | goal_number | character varying | Y | - |  |
| 14 | goal_name | character varying | Y | - |  |
| 15 | department | character varying | Y | - |  |
| 16 | owner_id | integer | Y | - |  |
| 17 | fiscal_year | integer | Y | - |  |
| 18 | start_date | date | Y | - |  |
| 19 | end_date | date | Y | - |  |
| 20 | target_value | numeric | Y | - |  |
| 21 | current_value | numeric | Y | 0 |  |
| 22 | target_unit | character varying | Y | - |  |
| 23 | completion_pct | numeric | Y | 0 |  |
| 24 | priority | character varying | Y | 'medium'::character varying |  |
| 25 | parent_goal_id | integer | Y | - |  |
| 26 | milestones | text | Y | - |  |
| 27 | kpis | text | Y | - |  |
| 28 | risks | text | Y | - |  |
| 29 | notes | text | Y | - |  |
| 30 | tags | text | Y | - |  |

#### 168. `swot_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('swot_items_id_seq'::regclass) | 🔑 PK |
| 2 | type | text | N | - |  |
| 3 | title | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | impact | text | Y | - |  |
| 6 | owner | text | Y | - |  |
| 7 | date | date | Y | - |  |
| 8 | created_at | timestamp with time zone | Y | now() |  |
| 9 | updated_at | timestamp with time zone | Y | now() |  |
| 10 | swot_type | character varying | Y | - |  |
| 11 | category | character varying | Y | - |  |
| 12 | impact_level | character varying | Y | - |  |
| 13 | likelihood | character varying | Y | - |  |
| 14 | priority | integer | Y | 0 |  |
| 15 | action_required | text | Y | - |  |
| 16 | responsible | character varying | Y | - |  |
| 17 | deadline | date | Y | - |  |
| 18 | fiscal_year | integer | Y | - |  |
| 19 | department | character varying | Y | - |  |
| 20 | related_goal_id | integer | Y | - |  |
| 21 | status | character varying | Y | 'active'::character varying |  |
| 22 | notes | text | Y | - |  |
| 23 | tags | text | Y | - |  |

#### 169. `unit_conversions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('unit_conversions_id_seq'::re... | 🔑 PK |
| 2 | from_unit | text | N | - |  |
| 3 | to_unit | text | N | - |  |
| 4 | conversion_factor | numeric | N | - |  |
| 5 | material_category | text | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | is_active | boolean | Y | true |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |

#### 170. `validation_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('validation_rules_id_seq'::re... | 🔑 PK |
| 2 | entity_id | integer | N | - |  |
| 3 | name | text | N | - |  |
| 4 | rule_type | text | N | - |  |
| 5 | field_slug | text | Y | - |  |
| 6 | operator | text | N | - |  |
| 7 | value | text | Y | - |  |
| 8 | error_message | text | N | - |  |
| 9 | error_message_he | text | Y | - |  |
| 10 | sort_order | integer | N | 0 |  |
| 11 | is_active | boolean | N | true |  |
| 12 | conditions | jsonb | Y | '{}'::jsonb |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | rule_name | character varying | Y | - |  |
| 15 | entity_type | character varying | Y | - |  |
| 16 | field_name | character varying | Y | - |  |
| 17 | validation_type | character varying | Y | - |  |
| 18 | validation_params | text | Y | - |  |
| 19 | severity | character varying | Y | 'error'::character varying |  |
| 20 | notes | text | Y | - |  |
| 21 | tags | text | Y | - |  |

#### 171. `view_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('view_definitions_id_seq'::re... | 🔑 PK |
| 2 | entity_id | integer | N | - | FK → module_entities.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - |  |
| 5 | view_type | text | N | 'table'::text |  |
| 6 | is_default | boolean | N | false |  |
| 7 | columns | jsonb | Y | '[]'::jsonb |  |
| 8 | filters | jsonb | Y | '[]'::jsonb |  |
| 9 | sorting | jsonb | Y | '[]'::jsonb |  |
| 10 | grouping | jsonb | Y | '{}'::jsonb |  |
| 11 | settings | jsonb | Y | '{}'::jsonb |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | updated_at | timestamp without time zone | N | now() |  |
| 14 | view_code | character varying | Y | - |  |
| 15 | view_name | character varying | Y | - |  |
| 16 | entity_type | character varying | Y | - |  |
| 17 | columns_config | text | Y | - |  |
| 18 | filters_config | text | Y | - |  |
| 19 | sorting_config | text | Y | - |  |
| 20 | grouping_config | text | Y | - |  |
| 21 | is_active | boolean | Y | true |  |
| 22 | tags | text | Y | - |  |

#### 172. `work_instructions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('work_instructions_id_seq'::r... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | product_id | integer | Y | - |  |
| 4 | department | text | Y | - |  |
| 5 | version | text | Y | '1.0'::text |  |
| 6 | content | text | Y | - |  |
| 7 | safety_notes | text | Y | - |  |
| 8 | quality_checks | text | Y | - |  |
| 9 | status | text | Y | 'active'::text |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

---

### כספים וחשבונאות (Finance & Accounting) (44 טבלאות)

#### 173. `aging_snapshots`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('aging_snapshots_id_seq'::reg... | 🔑 PK |
| 2 | snapshot_number | character varying | N | - | UNIQUE |
| 3 | snapshot_type | character varying | N | 'receivable'::character varying |  |
| 4 | snapshot_date | date | N | CURRENT_DATE |  |
| 5 | entity_name | text | N | - |  |
| 6 | entity_type | character varying | Y | 'customer'::character varying |  |
| 7 | total_outstanding | numeric | Y | 0 |  |
| 8 | current_amount | numeric | Y | 0 |  |
| 9 | days_1_30 | numeric | Y | 0 |  |
| 10 | days_31_60 | numeric | Y | 0 |  |
| 11 | days_61_90 | numeric | Y | 0 |  |
| 12 | days_91_120 | numeric | Y | 0 |  |
| 13 | days_over_120 | numeric | Y | 0 |  |
| 14 | oldest_invoice_date | date | Y | - |  |
| 15 | oldest_invoice_number | character varying | Y | - |  |
| 16 | payment_terms | character varying | Y | - |  |
| 17 | credit_limit | numeric | Y | 0 |  |
| 18 | risk_level | character varying | Y | 'low'::character varying |  |
| 19 | last_payment_date | date | Y | - |  |
| 20 | last_payment_amount | numeric | Y | - |  |
| 21 | avg_days_to_pay | integer | Y | - |  |
| 22 | contact_name | text | Y | - |  |
| 23 | contact_phone | character varying | Y | - |  |
| 24 | collection_notes | text | Y | - |  |
| 25 | notes | text | Y | - |  |
| 26 | created_by | integer | Y | - |  |
| 27 | created_by_name | text | Y | - |  |
| 28 | created_at | timestamp with time zone | Y | now() |  |
| 29 | customer_id | integer | Y | - |  |
| 30 | customer_name | character varying | Y | - |  |
| 31 | invoice_count | integer | Y | 0 |  |
| 32 | avg_days_outstanding | numeric | Y | - |  |
| 33 | over_credit_limit | boolean | Y | false |  |
| 34 | currency | character varying | Y | 'ILS'::character varying |  |
| 35 | tags | text | Y | - |  |

#### 174. `annual_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('annual_reports_id_seq'::regc... | 🔑 PK |
| 2 | report_number | text | N | - |  |
| 3 | fiscal_year | integer | N | - |  |
| 4 | total_assets | numeric | Y | 0 |  |
| 5 | total_liabilities | numeric | Y | 0 |  |
| 6 | total_equity | numeric | Y | 0 |  |
| 7 | total_revenue | numeric | Y | 0 |  |
| 8 | total_expenses | numeric | Y | 0 |  |
| 9 | net_income | numeric | Y | 0 |  |
| 10 | operating_cash_flow | numeric | Y | 0 |  |
| 11 | status | text | Y | 'draft'::text |  |
| 12 | approved_by | text | Y | - |  |
| 13 | approved_date | date | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | updated_at | timestamp with time zone | Y | now() |  |
| 17 | report_type | character varying | Y | - |  |
| 18 | report_date | date | Y | - |  |
| 19 | period_start | date | Y | - |  |
| 20 | period_end | date | Y | - |  |
| 21 | net_profit | numeric | Y | - |  |
| 22 | prepared_by | character varying | Y | - |  |
| 23 | reviewed_by | character varying | Y | - |  |
| 24 | approved_at | timestamp with time zone | Y | - |  |
| 25 | filed | boolean | Y | false |  |
| 26 | filed_date | date | Y | - |  |
| 27 | file_url | text | Y | - |  |
| 28 | tags | text | Y | - |  |

#### 175. `bank_accounts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('bank_accounts_id_seq'::regcl... | 🔑 PK |
| 2 | bank_name | text | N | - |  |
| 3 | branch_number | character varying | Y | - |  |
| 4 | account_number | character varying | N | - |  |
| 5 | account_type | character varying | Y | 'checking'::character varying |  |
| 6 | current_balance | numeric | Y | 0 |  |
| 7 | available_balance | numeric | Y | 0 |  |
| 8 | credit_limit | numeric | Y | 0 |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | is_active | boolean | Y | true |  |
| 11 | last_reconciled_at | timestamp with time zone | Y | - |  |
| 12 | financial_account_id | integer | Y | - | FK → financial_accounts.id |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |
| 15 | bank_code | character varying | Y | - |  |
| 16 | iban | character varying | Y | - |  |
| 17 | swift_code | character varying | Y | - |  |
| 18 | account_holder_name | character varying | Y | - |  |
| 19 | opening_date | date | Y | - |  |
| 20 | contact_person | character varying | Y | - |  |
| 21 | contact_phone | character varying | Y | - |  |
| 22 | interest_rate | numeric | Y | - |  |
| 23 | overdraft_limit | numeric | Y | - |  |
| 24 | monthly_fee | numeric | Y | - |  |
| 25 | last_statement_date | date | Y | - |  |
| 26 | purpose | character varying | Y | - |  |
| 27 | authorized_signers | text | Y | - |  |
| 28 | notes | text | Y | - |  |
| 29 | branch_name | character varying | Y | - |  |
| 30 | branch_address | text | Y | - |  |
| 31 | credit_line | numeric | Y | 0 |  |
| 32 | credit_line_used | numeric | Y | 0 |  |
| 33 | last_reconciled_date | date | Y | - |  |
| 34 | last_reconciled_balance | numeric | Y | - |  |
| 35 | daily_limit | numeric | Y | - |  |
| 36 | monthly_limit | numeric | Y | - |  |
| 37 | cheque_book_number | character varying | Y | - |  |
| 38 | cheque_next_number | integer | Y | - |  |
| 39 | default_for_receipts | boolean | Y | false |  |
| 40 | default_for_payments | boolean | Y | false |  |
| 41 | pos_terminal_id | character varying | Y | - |  |
| 42 | routing_number | character varying | Y | - |  |
| 43 | bank_contact | character varying | Y | - |  |
| 44 | bank_phone | character varying | Y | - |  |
| 45 | bank_email | character varying | Y | - |  |
| 46 | bank_address | text | Y | - |  |
| 47 | signatory_1 | character varying | Y | - |  |
| 48 | signatory_2 | character varying | Y | - |  |
| 49 | signatory_3 | character varying | Y | - |  |
| 50 | min_signatories | integer | Y | 1 |  |
| 51 | overdraft_interest_rate | numeric | Y | - |  |
| 52 | online_banking | boolean | Y | true |  |
| 53 | last_statement_balance | numeric | Y | - |  |
| 54 | last_reconciliation_date | date | Y | - |  |
| 55 | unreconciled_items | integer | Y | 0 |  |
| 56 | frozen | boolean | Y | false |  |
| 57 | frozen_reason | text | Y | - |  |
| 58 | closing_date | date | Y | - |  |
| 59 | tags | text | Y | - |  |

#### 176. `bank_reconciliations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('bank_reconciliations_id_seq'... | 🔑 PK |
| 2 | reconciliation_number | character varying | N | - | UNIQUE |
| 3 | bank_account_id | integer | Y | - | FK → bank_accounts.id |
| 4 | bank_account_name | text | Y | - |  |
| 5 | statement_date | date | N | - |  |
| 6 | statement_start_date | date | Y | - |  |
| 7 | statement_end_date | date | Y | - |  |
| 8 | opening_balance_bank | numeric | Y | 0 |  |
| 9 | closing_balance_bank | numeric | Y | 0 |  |
| 10 | opening_balance_books | numeric | Y | 0 |  |
| 11 | closing_balance_books | numeric | Y | 0 |  |
| 12 | deposits_in_transit | numeric | Y | 0 |  |
| 13 | outstanding_checks | numeric | Y | 0 |  |
| 14 | bank_charges | numeric | Y | 0 |  |
| 15 | interest_earned | numeric | Y | 0 |  |
| 16 | other_adjustments | numeric | Y | 0 |  |
| 17 | adjusted_bank_balance | numeric | Y | - |  |
| 18 | adjusted_book_balance | numeric | Y | - |  |
| 19 | difference | numeric | Y | 0 |  |
| 20 | status | character varying | Y | 'in_progress'::character varying |  |
| 21 | reconciled_items_count | integer | Y | 0 |  |
| 22 | unreconciled_items_count | integer | Y | 0 |  |
| 23 | notes | text | Y | - |  |
| 24 | reconciled_by | integer | Y | - |  |
| 25 | reconciled_by_name | text | Y | - |  |
| 26 | reconciled_at | timestamp with time zone | Y | - |  |
| 27 | currency | character varying | Y | 'ILS'::character varying |  |
| 28 | created_at | timestamp with time zone | Y | now() |  |
| 29 | updated_at | timestamp with time zone | Y | now() |  |
| 30 | auto_matched_count | integer | Y | 0 |  |
| 31 | manual_matched_count | integer | Y | 0 |  |
| 32 | total_items_count | integer | Y | 0 |  |
| 33 | match_rate | numeric | Y | 0 |  |
| 34 | statement_balance | numeric | Y | - |  |
| 35 | book_balance | numeric | Y | - |  |
| 36 | bank_interest | numeric | Y | 0 |  |
| 37 | adjustments | numeric | Y | 0 |  |
| 38 | items_matched | integer | Y | 0 |  |
| 39 | items_unmatched | integer | Y | 0 |  |
| 40 | auto_matched | integer | Y | 0 |  |
| 41 | manual_matched | integer | Y | 0 |  |
| 42 | documents_url | text | Y | - |  |
| 43 | tags | text | Y | - |  |
| 44 | bank_name | character varying | Y | - |  |
| 45 | reconciled_balance | numeric | Y | - |  |
| 46 | outstanding_deposits | numeric | Y | 0 |  |
| 47 | outstanding_transfers | numeric | Y | 0 |  |
| 48 | unmatched_items | integer | Y | 0 |  |
| 49 | matched_items | integer | Y | 0 |  |
| 50 | total_items | integer | Y | 0 |  |
| 51 | is_balanced | boolean | Y | false |  |
| 52 | completed | boolean | Y | false |  |
| 53 | completed_by | character varying | Y | - |  |
| 54 | completed_at | timestamp with time zone | Y | - |  |
| 55 | approved_by | character varying | Y | - |  |
| 56 | approved_at | timestamp with time zone | Y | - |  |

#### 177. `budget_departments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('budget_departments_id_seq'::... | 🔑 PK |
| 2 | department | text | N | - |  |
| 3 | year | text | Y | '2026'::text |  |
| 4 | quarter | text | Y | - |  |
| 5 | allocated | bigint | Y | 0 |  |
| 6 | spent | bigint | Y | 0 |  |
| 7 | committed | bigint | Y | 0 |  |
| 8 | available | bigint | Y | 0 |  |
| 9 | utilization | numeric | Y | 0 |  |
| 10 | variance | numeric | Y | 0 |  |
| 11 | manager | text | Y | - |  |
| 12 | status | text | Y | 'draft'::text |  |
| 13 | notes | text | Y | - |  |
| 14 | is_active | boolean | Y | true |  |
| 15 | created_at | timestamp without time zone | N | now() |  |
| 16 | updated_at | timestamp without time zone | N | now() |  |

#### 178. `budget_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | budget_id | integer | Y | - |  |
| 3 | account_id | uuid | Y | - |  |
| 4 | category | character varying | Y | - |  |
| 5 | jan | integer | Y | 0 |  |
| 6 | feb | integer | Y | 0 |  |
| 7 | mar | integer | Y | 0 |  |
| 8 | apr | integer | Y | 0 |  |
| 9 | may | integer | Y | 0 |  |
| 10 | jun | integer | Y | 0 |  |
| 11 | jul | integer | Y | 0 |  |
| 12 | aug | integer | Y | 0 |  |
| 13 | sep | integer | Y | 0 |  |
| 14 | oct | integer | Y | 0 |  |
| 15 | nov | integer | Y | 0 |  |
| 16 | dec | integer | Y | 0 |  |
| 17 | annual_total | integer | Y | 0 |  |
| 18 | actual_total | integer | Y | 0 |  |
| 19 | variance | integer | Y | 0 |  |
| 20 | notes | text | Y | - |  |
| 21 | created_at | timestamp without time zone | Y | now() |  |
| 22 | updated_at | timestamp without time zone | Y | now() |  |

#### 179. `budgets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('budgets_id_seq'::regclass) | 🔑 PK |
| 2 | budget_name | text | N | - |  |
| 3 | fiscal_year | integer | N | - |  |
| 4 | fiscal_month | integer | Y | - |  |
| 5 | category | character varying | N | - |  |
| 6 | department | character varying | Y | - |  |
| 7 | budgeted_amount | numeric | N | - |  |
| 8 | actual_amount | numeric | Y | 0 |  |
| 9 | variance | numeric | Y | - |  |
| 10 | project_id | integer | Y | - | FK → projects.id |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp with time zone | N | now() |  |
| 13 | updated_at | timestamp with time zone | N | now() |  |
| 14 | budget_number | text | Y | - |  |
| 15 | budget_type | text | Y | 'תפעולי'::text |  |
| 16 | status | text | Y | 'פעיל'::text |  |
| 17 | approved_by | text | Y | - |  |
| 18 | approved_date | date | Y | - |  |
| 19 | alert_threshold_80 | boolean | Y | true |  |
| 20 | alert_threshold_90 | boolean | Y | true |  |
| 21 | alert_threshold_100 | boolean | Y | true |  |
| 22 | forecast_amount | numeric | Y | 0 |  |
| 23 | committed_amount | numeric | Y | 0 |  |
| 24 | remaining_amount | numeric | Y | - |  |
| 25 | utilization_pct | numeric | Y | - |  |
| 26 | responsible_person | text | Y | - |  |
| 27 | priority | text | Y | 'רגילה'::text |  |
| 28 | tags | text | Y | - |  |
| 29 | spent | numeric | Y | 0 |  |
| 30 | period_start | date | Y | - |  |
| 31 | period_end | date | Y | - |  |
| 32 | amount | numeric | Y | 0 |  |
| 33 | revision_number | integer | Y | 0 |  |
| 34 | approved_at | timestamp with time zone | Y | - |  |
| 35 | locked | boolean | Y | false |  |
| 36 | available_amount | numeric | Y | 0 |  |
| 37 | variance_percent | numeric | Y | - |  |
| 38 | parent_budget_id | integer | Y | - |  |
| 39 | gl_account | character varying | Y | - |  |
| 40 | alert_threshold | numeric | Y | 90 |  |
| 41 | currency | character varying | Y | 'ILS'::character varying |  |
| 42 | baseline_amount | numeric | Y | - |  |
| 43 | contingency_pct | numeric | Y | - |  |
| 44 | contingency_amount | numeric | Y | - |  |
| 45 | variance_explanation | text | Y | - |  |
| 46 | department_id | integer | Y | - |  |
| 47 | department_name | character varying | Y | - |  |
| 48 | project_name | character varying | Y | - |  |
| 49 | cost_center_id | integer | Y | - |  |
| 50 | cost_center_name | character varying | Y | - |  |
| 51 | total_budget | numeric | Y | 0 |  |
| 52 | total_actual | numeric | Y | 0 |  |
| 53 | total_committed | numeric | Y | 0 |  |
| 54 | total_available | numeric | Y | 0 |  |
| 55 | variance_amount | numeric | Y | 0 |  |
| 56 | variance_pct | numeric | Y | - |  |
| 57 | carry_forward | boolean | Y | false |  |
| 58 | carry_forward_amount | numeric | Y | 0 |  |
| 59 | locked_by | character varying | Y | - |  |
| 60 | locked_at | timestamp with time zone | Y | - |  |
| 61 | documents_url | text | Y | - |  |
| 62 | jan_budget | numeric | Y | 0 |  |
| 63 | feb_budget | numeric | Y | 0 |  |
| 64 | mar_budget | numeric | Y | 0 |  |
| 65 | apr_budget | numeric | Y | 0 |  |
| 66 | may_budget | numeric | Y | 0 |  |
| 67 | jun_budget | numeric | Y | 0 |  |
| 68 | jul_budget | numeric | Y | 0 |  |
| 69 | aug_budget | numeric | Y | 0 |  |
| 70 | sep_budget | numeric | Y | 0 |  |
| 71 | oct_budget | numeric | Y | 0 |  |
| 72 | nov_budget | numeric | Y | 0 |  |
| 73 | dec_budget | numeric | Y | 0 |  |
| 74 | jan_actual | numeric | Y | 0 |  |
| 75 | feb_actual | numeric | Y | 0 |  |
| 76 | mar_actual | numeric | Y | 0 |  |
| 77 | apr_actual | numeric | Y | 0 |  |
| 78 | may_actual | numeric | Y | 0 |  |
| 79 | jun_actual | numeric | Y | 0 |  |
| 80 | jul_actual | numeric | Y | 0 |  |
| 81 | aug_actual | numeric | Y | 0 |  |
| 82 | sep_actual | numeric | Y | 0 |  |
| 83 | oct_actual | numeric | Y | 0 |  |
| 84 | nov_actual | numeric | Y | 0 |  |
| 85 | dec_actual | numeric | Y | 0 |  |
| 86 | account_id | integer | Y | - |  |
| 87 | account_number | character varying | Y | - |  |
| 88 | account_name | character varying | Y | - |  |
| 89 | subcategory | character varying | Y | - |  |
| 90 | responsible_id | integer | Y | - |  |
| 91 | alert_recipients | text | Y | - |  |
| 92 | last_alert_date | date | Y | - |  |
| 93 | last_alert_pct | numeric | Y | - |  |
| 94 | frozen | boolean | Y | false |  |
| 95 | frozen_reason | text | Y | - |  |

#### 180. `cash_flow_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cash_flow_records_id_seq'::r... | 🔑 PK |
| 2 | record_number | character varying | N | - | UNIQUE |
| 3 | record_date | date | N | CURRENT_DATE |  |
| 4 | flow_type | character varying | N | 'inflow'::character varying |  |
| 5 | category | character varying | N | - |  |
| 6 | sub_category | character varying | Y | - |  |
| 7 | description | text | Y | - |  |
| 8 | amount | numeric | N | - |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | bank_account_id | integer | Y | - | FK → bank_accounts.id |
| 11 | bank_account_name | text | Y | - |  |
| 12 | is_recurring | boolean | Y | false |  |
| 13 | recurring_frequency | character varying | Y | - |  |
| 14 | source_type | character varying | Y | - |  |
| 15 | source_reference | character varying | Y | - |  |
| 16 | customer_name | text | Y | - |  |
| 17 | supplier_name | text | Y | - |  |
| 18 | project_name | text | Y | - |  |
| 19 | is_forecast | boolean | Y | false |  |
| 20 | forecast_date | date | Y | - |  |
| 21 | forecast_probability | numeric | Y | 100 |  |
| 22 | actual_date | date | Y | - |  |
| 23 | actual_amount | numeric | Y | - |  |
| 24 | variance | numeric | Y | - |  |
| 25 | fiscal_year | integer | Y | - |  |
| 26 | fiscal_period | integer | Y | - |  |
| 27 | status | character varying | Y | 'actual'::character varying |  |
| 28 | notes | text | Y | - |  |
| 29 | created_by | integer | Y | - |  |
| 30 | created_at | timestamp with time zone | Y | now() |  |
| 31 | updated_at | timestamp with time zone | Y | now() |  |
| 32 | period_start | date | Y | - |  |
| 33 | period_end | date | Y | - |  |
| 34 | fiscal_month | integer | Y | - |  |
| 35 | cash_flow_type | character varying | Y | - |  |
| 36 | subcategory | character varying | Y | - |  |
| 37 | reference_type | character varying | Y | - |  |
| 38 | reference_id | integer | Y | - |  |
| 39 | opening_balance | numeric | Y | - |  |
| 40 | closing_balance | numeric | Y | - |  |
| 41 | tags | text | Y | - |  |

#### 181. `cash_register_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cash_register_transactions_i... | 🔑 PK |
| 2 | transaction_number | character varying | Y | - |  |
| 3 | register_id | integer | Y | - | FK → cash_registers.id |
| 4 | register_name | character varying | Y | - |  |
| 5 | transaction_date | date | Y | CURRENT_DATE |  |
| 6 | transaction_time | time without time zone | Y | - |  |
| 7 | transaction_type | character varying | N | - |  |
| 8 | direction | character varying | N | 'in'::character varying |  |
| 9 | amount | numeric | N | 0 |  |
| 10 | vat_amount | numeric | Y | 0 |  |
| 11 | total_amount | numeric | Y | 0 |  |
| 12 | balance_after | numeric | Y | - |  |
| 13 | entity_type | character varying | Y | - |  |
| 14 | entity_id | integer | Y | - |  |
| 15 | entity_name | character varying | Y | - |  |
| 16 | invoice_id | integer | Y | - |  |
| 17 | invoice_number | character varying | Y | - |  |
| 18 | receipt_number | character varying | Y | - |  |
| 19 | payment_id | integer | Y | - |  |
| 20 | purchase_order_id | integer | Y | - |  |
| 21 | expense_id | integer | Y | - |  |
| 22 | payment_method | character varying | Y | 'cash'::character varying |  |
| 23 | check_number | character varying | Y | - |  |
| 24 | check_bank | character varying | Y | - |  |
| 25 | check_date | date | Y | - |  |
| 26 | category | character varying | Y | - |  |
| 27 | subcategory | character varying | Y | - |  |
| 28 | description | text | Y | - |  |
| 29 | purpose | text | Y | - |  |
| 30 | approved | boolean | Y | false |  |
| 31 | approved_by | character varying | Y | - |  |
| 32 | approved_at | timestamp with time zone | Y | - |  |
| 33 | journal_entry_id | integer | Y | - |  |
| 34 | gl_account_id | integer | Y | - |  |
| 35 | cost_center | character varying | Y | - |  |
| 36 | project_id | integer | Y | - |  |
| 37 | project_name | character varying | Y | - |  |
| 38 | status | character varying | Y | 'completed'::character varying |  |
| 39 | voided | boolean | Y | false |  |
| 40 | voided_date | date | Y | - |  |
| 41 | voided_reason | text | Y | - |  |
| 42 | voided_by | character varying | Y | - |  |
| 43 | created_by | character varying | Y | - |  |
| 44 | created_by_id | integer | Y | - |  |
| 45 | documents_url | text | Y | - |  |
| 46 | receipt_url | text | Y | - |  |
| 47 | notes | text | Y | - |  |
| 48 | tags | text | Y | - |  |
| 49 | created_at | timestamp with time zone | Y | now() |  |
| 50 | updated_at | timestamp with time zone | Y | now() |  |

#### 182. `cash_registers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cash_registers_id_seq'::regc... | 🔑 PK |
| 2 | register_number | character varying | N | - |  |
| 3 | register_name | character varying | Y | - |  |
| 4 | location | character varying | Y | - |  |
| 5 | department | character varying | Y | - |  |
| 6 | register_type | character varying | Y | 'main'::character varying |  |
| 7 | currency | character varying | Y | 'ILS'::character varying |  |
| 8 | opening_balance | numeric | Y | 0 |  |
| 9 | current_balance | numeric | Y | 0 |  |
| 10 | max_balance | numeric | Y | 5000 |  |
| 11 | min_balance | numeric | Y | 0 |  |
| 12 | float_amount | numeric | Y | 500 |  |
| 13 | status | character varying | Y | 'active'::character varying |  |
| 14 | custodian_id | integer | Y | - |  |
| 15 | custodian_name | character varying | Y | - |  |
| 16 | backup_custodian_id | integer | Y | - |  |
| 17 | backup_custodian_name | character varying | Y | - |  |
| 18 | requires_approval_above | numeric | Y | 500 |  |
| 19 | approval_manager_id | integer | Y | - |  |
| 20 | approval_manager_name | character varying | Y | - |  |
| 21 | two_signatures_above | numeric | Y | 1000 |  |
| 22 | daily_limit | numeric | Y | 5000 |  |
| 23 | monthly_limit | numeric | Y | 50000 |  |
| 24 | last_count_date | date | Y | - |  |
| 25 | last_count_amount | numeric | Y | - |  |
| 26 | last_count_by | character varying | Y | - |  |
| 27 | last_count_variance | numeric | Y | 0 |  |
| 28 | count_frequency | character varying | Y | 'weekly'::character varying |  |
| 29 | next_count_date | date | Y | - |  |
| 30 | gl_account_id | integer | Y | - |  |
| 31 | gl_account_number | character varying | Y | - |  |
| 32 | bank_deposit_account_id | integer | Y | - |  |
| 33 | total_receipts_today | numeric | Y | 0 |  |
| 34 | total_payments_today | numeric | Y | 0 |  |
| 35 | total_receipts_month | numeric | Y | 0 |  |
| 36 | total_payments_month | numeric | Y | 0 |  |
| 37 | notes | text | Y | - |  |
| 38 | tags | text | Y | - |  |
| 39 | created_by | character varying | Y | - |  |
| 40 | created_at | timestamp with time zone | Y | now() |  |
| 41 | updated_at | timestamp with time zone | Y | now() |  |

#### 183. `chart_of_accounts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('chart_of_accounts_id_seq'::r... | 🔑 PK |
| 2 | account_number | character varying | N | - | UNIQUE |
| 3 | account_name | text | N | - |  |
| 4 | account_name_en | text | Y | - |  |
| 5 | account_type | character varying | N | 'expense'::character varying |  |
| 6 | account_subtype | character varying | Y | - |  |
| 7 | parent_account_id | integer | Y | - |  |
| 8 | parent_account_number | character varying | Y | - |  |
| 9 | hierarchy_level | integer | Y | 1 |  |
| 10 | hierarchy_path | text | Y | - |  |
| 11 | is_group | boolean | Y | false |  |
| 12 | is_system_account | boolean | Y | false |  |
| 13 | currency | character varying | Y | 'ILS'::character varying |  |
| 14 | status | character varying | Y | 'active'::character varying |  |
| 15 | opening_balance | numeric | Y | 0 |  |
| 16 | current_balance | numeric | Y | 0 |  |
| 17 | debit_total | numeric | Y | 0 |  |
| 18 | credit_total | numeric | Y | 0 |  |
| 19 | normal_balance | character varying | Y | 'debit'::character varying |  |
| 20 | tax_category | character varying | Y | - |  |
| 21 | tax_rate | numeric | Y | - |  |
| 22 | cost_center | character varying | Y | - |  |
| 23 | department | character varying | Y | - |  |
| 24 | bank_account_number | character varying | Y | - |  |
| 25 | bank_name | text | Y | - |  |
| 26 | bank_branch | character varying | Y | - |  |
| 27 | reconciliation_required | boolean | Y | false |  |
| 28 | allow_direct_posting | boolean | Y | true |  |
| 29 | budget_code | character varying | Y | - |  |
| 30 | budget_amount | numeric | Y | 0 |  |
| 31 | sort_order | integer | Y | 0 |  |
| 32 | description | text | Y | - |  |
| 33 | notes | text | Y | - |  |
| 34 | created_by | integer | Y | - |  |
| 35 | created_by_name | text | Y | - |  |
| 36 | created_at | timestamp with time zone | Y | now() |  |
| 37 | updated_at | timestamp with time zone | Y | now() |  |
| 38 | account_class | character varying | Y | - |  |
| 39 | bank_reconcilable | boolean | Y | false |  |
| 40 | intercompany | boolean | Y | false |  |
| 41 | cost_element | character varying | Y | - |  |
| 42 | ytd_debit | numeric | Y | 0 |  |
| 43 | ytd_credit | numeric | Y | 0 |  |
| 44 | level | integer | Y | 0 |  |
| 45 | is_header | boolean | Y | false |  |
| 46 | is_posting | boolean | Y | true |  |
| 47 | cash_flow_category | character varying | Y | - |  |
| 48 | tax_code | character varying | Y | - |  |
| 49 | bank_account_id | integer | Y | - |  |
| 50 | reconcilable | boolean | Y | false |  |
| 51 | locked | boolean | Y | false |  |
| 52 | system_account | boolean | Y | false |  |
| 53 | report_group | character varying | Y | - |  |
| 54 | report_line | integer | Y | - |  |
| 55 | tags | text | Y | - |  |
| 56 | is_postable | boolean | Y | true |  |
| 57 | multi_currency | boolean | Y | false |  |
| 58 | vat_applicable | boolean | Y | false |  |
| 59 | bank_account | boolean | Y | false |  |
| 60 | cash_account | boolean | Y | false |  |
| 61 | is_active | boolean | Y | true |  |
| 62 | documents_url | text | Y | - |  |

#### 184. `checks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | check_number | character varying | Y | - |  |
| 3 | check_type | character varying | Y | 'received'::character varying |  |
| 4 | bank_name | character varying | Y | - |  |
| 5 | branch | character varying | Y | - |  |
| 6 | account_number | character varying | Y | - |  |
| 7 | payee | character varying | Y | - |  |
| 8 | payer | character varying | Y | - |  |
| 9 | amount | integer | Y | 0 |  |
| 10 | currency | character varying | Y | 'ILS'::character varying |  |
| 11 | issue_date | date | Y | - |  |
| 12 | due_date | date | Y | - |  |
| 13 | status | character varying | Y | 'pending'::character varying |  |
| 14 | partner_type | character varying | Y | - |  |
| 15 | partner_id | uuid | Y | - |  |
| 16 | bank_account_id | uuid | Y | - |  |
| 17 | endorsed_to | character varying | Y | - |  |
| 18 | endorsement_date | date | Y | - |  |
| 19 | notes | text | Y | - |  |
| 20 | created_by | uuid | Y | - |  |
| 21 | created_at | timestamp without time zone | Y | now() |  |
| 22 | updated_at | timestamp without time zone | Y | now() |  |

#### 185. `cost_centers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cost_centers_id_seq'::regclass) | 🔑 PK |
| 2 | center_number | character varying | N | - | UNIQUE |
| 3 | center_name | text | N | - |  |
| 4 | center_type | character varying | N | 'production'::character varying |  |
| 5 | parent_center_id | integer | Y | - |  |
| 6 | department | character varying | Y | - |  |
| 7 | manager_name | text | Y | - |  |
| 8 | status | character varying | Y | 'active'::character varying |  |
| 9 | budget_annual | numeric | Y | 0 |  |
| 10 | budget_used | numeric | Y | 0 |  |
| 11 | budget_remaining | numeric | Y | - |  |
| 12 | budget_utilization_pct | numeric | Y | - |  |
| 13 | cost_allocation_method | character varying | Y | 'direct'::character varying |  |
| 14 | allocation_base | character varying | Y | - |  |
| 15 | allocation_rate | numeric | Y | 0 |  |
| 16 | revenue | numeric | Y | 0 |  |
| 17 | direct_costs | numeric | Y | 0 |  |
| 18 | indirect_costs | numeric | Y | 0 |  |
| 19 | total_costs | numeric | Y | - |  |
| 20 | profit_contribution | numeric | Y | - |  |
| 21 | headcount | integer | Y | 0 |  |
| 22 | area_sqm | numeric | Y | 0 |  |
| 23 | description | text | Y | - |  |
| 24 | notes | text | Y | - |  |
| 25 | created_at | timestamp with time zone | Y | now() |  |
| 26 | updated_at | timestamp with time zone | Y | now() |  |
| 27 | parent_id | integer | Y | - |  |
| 28 | manager_id | integer | Y | - |  |
| 29 | budget_amount | numeric | Y | 0 |  |
| 30 | actual_amount | numeric | Y | 0 |  |
| 31 | committed_amount | numeric | Y | 0 |  |
| 32 | available_amount | numeric | Y | 0 |  |
| 33 | variance_pct | numeric | Y | - |  |
| 34 | tags | text | Y | - |  |
| 35 | cost_center_code | character varying | Y | - |  |
| 36 | cost_center_name | character varying | Y | - |  |
| 37 | budget_used_ytd | numeric | Y | 0 |  |
| 38 | allocation_method | character varying | Y | - |  |
| 39 | overhead_rate | numeric | Y | - |  |
| 40 | direct_labor_rate | numeric | Y | - |  |
| 41 | machine_hour_rate | numeric | Y | - |  |
| 42 | profit_center | boolean | Y | false |  |
| 43 | gl_account_id | integer | Y | - |  |

#### 186. `credit_notes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('credit_notes_id_seq'::regclass) | 🔑 PK |
| 2 | credit_number | character varying | N | - | UNIQUE |
| 3 | credit_type | character varying | N | 'credit'::character varying |  |
| 4 | credit_date | date | N | CURRENT_DATE |  |
| 5 | original_invoice_number | character varying | Y | - |  |
| 6 | original_invoice_id | integer | Y | - |  |
| 7 | customer_name | text | N | - |  |
| 8 | customer_tax_id | character varying | Y | - |  |
| 9 | reason | character varying | N | 'return'::character varying |  |
| 10 | reason_description | text | Y | - |  |
| 11 | status | character varying | Y | 'draft'::character varying |  |
| 12 | currency | character varying | Y | 'ILS'::character varying |  |
| 13 | subtotal | numeric | Y | 0 |  |
| 14 | vat_rate | numeric | Y | 18 |  |
| 15 | vat_amount | numeric | Y | 0 |  |
| 16 | total_amount | numeric | Y | 0 |  |
| 17 | refund_method | character varying | Y | - |  |
| 18 | refund_date | date | Y | - |  |
| 19 | refund_reference | character varying | Y | - |  |
| 20 | approved_by | text | Y | - |  |
| 21 | approved_at | timestamp with time zone | Y | - |  |
| 22 | notes | text | Y | - |  |
| 23 | created_by | integer | Y | - |  |
| 24 | created_by_name | text | Y | - |  |
| 25 | created_at | timestamp with time zone | Y | now() |  |
| 26 | updated_at | timestamp with time zone | Y | now() |  |
| 27 | credit_note_number | character varying | Y | - |  |
| 28 | customer_id | integer | Y | - |  |
| 29 | reason_code | character varying | Y | - |  |
| 30 | applied_to_invoice | boolean | Y | false |  |
| 31 | applied_amount | numeric | Y | 0 |  |
| 32 | documents_url | text | Y | - |  |
| 33 | tags | text | Y | - |  |
| 34 | invoice_id | integer | Y | - |  |
| 35 | invoice_number | character varying | Y | - |  |
| 36 | supplier_id | integer | Y | - |  |
| 37 | supplier_name | character varying | Y | - |  |
| 38 | reason_detail | text | Y | - |  |
| 39 | exchange_rate | numeric | Y | - |  |
| 40 | amount_foreign | numeric | Y | - |  |
| 41 | refund_processed | boolean | Y | false |  |
| 42 | bank_account | character varying | Y | - |  |
| 43 | check_number | character varying | Y | - |  |
| 44 | journal_entry_id | integer | Y | - |  |
| 45 | posted | boolean | Y | false |  |
| 46 | posted_date | date | Y | - |  |
| 47 | vat_report_period | character varying | Y | - |  |
| 48 | digital_signature | text | Y | - |  |
| 49 | pdf_url | text | Y | - |  |
| 50 | email_sent | boolean | Y | false |  |
| 51 | email_sent_date | date | Y | - |  |

#### 187. `deferred_expenses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('deferred_expenses_id_seq'::r... | 🔑 PK |
| 2 | record_number | text | N | - |  |
| 3 | vendor_name | text | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | total_amount | numeric | Y | 0 |  |
| 6 | recognized_amount | numeric | Y | 0 |  |
| 7 | remaining_amount | numeric | Y | 0 |  |
| 8 | recognition_start | date | Y | - |  |
| 9 | recognition_end | date | Y | - |  |
| 10 | recognition_method | text | Y | 'straight_line'::text |  |
| 11 | monthly_recognition | numeric | Y | 0 |  |
| 12 | status | text | Y | 'active'::text |  |
| 13 | gl_account | text | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | updated_at | timestamp with time zone | Y | now() |  |
| 17 | entry_number | character varying | Y | - |  |
| 18 | invoice_id | integer | Y | - |  |
| 19 | invoice_number | character varying | Y | - |  |
| 20 | start_date | date | Y | - |  |
| 21 | end_date | date | Y | - |  |
| 22 | total_periods | integer | Y | - |  |
| 23 | current_period | integer | Y | 0 |  |
| 24 | amount_per_period | numeric | Y | - |  |
| 25 | recognized_to_date | numeric | Y | 0 |  |
| 26 | gl_prepaid_account | character varying | Y | - |  |
| 27 | gl_expense_account | character varying | Y | - |  |
| 28 | cost_center | character varying | Y | - |  |
| 29 | department | character varying | Y | - |  |
| 30 | auto_recognize | boolean | Y | true |  |
| 31 | last_recognition_date | date | Y | - |  |
| 32 | fully_recognized | boolean | Y | false |  |
| 33 | tags | text | Y | - |  |

#### 188. `deferred_revenue`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('deferred_revenue_id_seq'::re... | 🔑 PK |
| 2 | record_number | text | N | - |  |
| 3 | customer_name | text | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | total_amount | numeric | Y | 0 |  |
| 6 | recognized_amount | numeric | Y | 0 |  |
| 7 | remaining_amount | numeric | Y | 0 |  |
| 8 | recognition_start | date | Y | - |  |
| 9 | recognition_end | date | Y | - |  |
| 10 | recognition_method | text | Y | 'straight_line'::text |  |
| 11 | monthly_recognition | numeric | Y | 0 |  |
| 12 | status | text | Y | 'active'::text |  |
| 13 | gl_account | text | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | updated_at | timestamp with time zone | Y | now() |  |
| 17 | entry_number | character varying | Y | - |  |
| 18 | customer_id | integer | Y | - |  |
| 19 | invoice_id | integer | Y | - |  |
| 20 | invoice_number | character varying | Y | - |  |
| 21 | start_date | date | Y | - |  |
| 22 | end_date | date | Y | - |  |
| 23 | total_periods | integer | Y | - |  |
| 24 | current_period | integer | Y | 0 |  |
| 25 | amount_per_period | numeric | Y | - |  |
| 26 | recognized_to_date | numeric | Y | 0 |  |
| 27 | gl_deferred_account | character varying | Y | - |  |
| 28 | gl_revenue_account | character varying | Y | - |  |
| 29 | cost_center | character varying | Y | - |  |
| 30 | project_id | integer | Y | - |  |
| 31 | project_name | character varying | Y | - |  |
| 32 | auto_recognize | boolean | Y | true |  |
| 33 | last_recognition_date | date | Y | - |  |
| 34 | fully_recognized | boolean | Y | false |  |
| 35 | tags | text | Y | - |  |

#### 189. `depreciation_schedules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('depreciation_schedules_id_se... | 🔑 PK |
| 2 | schedule_number | text | N | - |  |
| 3 | asset_name | text | N | - |  |
| 4 | asset_number | text | Y | - |  |
| 5 | purchase_date | date | Y | - |  |
| 6 | purchase_price | numeric | Y | 0 |  |
| 7 | residual_value | numeric | Y | 0 |  |
| 8 | useful_life_years | integer | Y | 5 |  |
| 9 | depreciation_method | text | Y | 'straight_line'::text |  |
| 10 | annual_depreciation | numeric | Y | 0 |  |
| 11 | accumulated_depreciation | numeric | Y | 0 |  |
| 12 | current_book_value | numeric | Y | 0 |  |
| 13 | fiscal_year | integer | Y | - |  |
| 14 | period_depreciation | numeric | Y | 0 |  |
| 15 | status | text | Y | 'active'::text |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp with time zone | Y | now() |  |
| 18 | updated_at | timestamp with time zone | Y | now() |  |
| 19 | asset_id | integer | Y | - |  |
| 20 | asset_tag | character varying | Y | - |  |
| 21 | period_start | date | Y | - |  |
| 22 | period_end | date | Y | - |  |
| 23 | fiscal_month | integer | Y | - |  |
| 24 | opening_book_value | numeric | Y | - |  |
| 25 | depreciation_amount | numeric | Y | - |  |
| 26 | closing_book_value | numeric | Y | - |  |
| 27 | useful_life_months | integer | Y | - |  |
| 28 | remaining_life_months | integer | Y | - |  |
| 29 | journal_entry_id | integer | Y | - |  |
| 30 | posted | boolean | Y | false |  |
| 31 | posted_date | date | Y | - |  |
| 32 | gl_debit_account | character varying | Y | - |  |
| 33 | gl_credit_account | character varying | Y | - |  |
| 34 | cost_center | character varying | Y | - |  |
| 35 | adjustment_amount | numeric | Y | - |  |
| 36 | adjustment_reason | text | Y | - |  |
| 37 | is_active | boolean | Y | true |  |
| 38 | tags | text | Y | - |  |

#### 190. `expense_categories`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | code | character varying | Y | - |  |
| 4 | parent_id | uuid | Y | - |  |
| 5 | account_id | uuid | Y | - |  |
| 6 | budget_annual | integer | Y | 0 |  |
| 7 | is_active | boolean | Y | true |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |

#### 191. `expense_claims`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('expense_claims_id_seq'::regc... | 🔑 PK |
| 2 | claim_number | character varying | N | - | UNIQUE |
| 3 | claim_date | date | N | CURRENT_DATE |  |
| 4 | employee_name | text | N | - |  |
| 5 | employee_id_ref | integer | Y | - |  |
| 6 | department | character varying | Y | - |  |
| 7 | claim_type | character varying | N | 'business'::character varying |  |
| 8 | period_from | date | Y | - |  |
| 9 | period_to | date | Y | - |  |
| 10 | status | character varying | Y | 'draft'::character varying |  |
| 11 | currency | character varying | Y | 'ILS'::character varying |  |
| 12 | total_claimed | numeric | Y | 0 |  |
| 13 | total_approved | numeric | Y | 0 |  |
| 14 | total_rejected | numeric | Y | 0 |  |
| 15 | total_paid | numeric | Y | 0 |  |
| 16 | balance_due | numeric | Y | - |  |
| 17 | items_count | integer | Y | 0 |  |
| 18 | travel_km | numeric | Y | 0 |  |
| 19 | travel_rate | numeric | Y | 0 |  |
| 20 | travel_amount | numeric | Y | 0 |  |
| 21 | meals_amount | numeric | Y | 0 |  |
| 22 | accommodation_amount | numeric | Y | 0 |  |
| 23 | transport_amount | numeric | Y | 0 |  |
| 24 | other_amount | numeric | Y | 0 |  |
| 25 | cost_center | character varying | Y | - |  |
| 26 | project_name | text | Y | - |  |
| 27 | approver_name | text | Y | - |  |
| 28 | approved_at | timestamp with time zone | Y | - |  |
| 29 | paid_date | date | Y | - |  |
| 30 | payment_method | character varying | Y | - |  |
| 31 | payment_reference | character varying | Y | - |  |
| 32 | rejection_reason | text | Y | - |  |
| 33 | notes | text | Y | - |  |
| 34 | created_by | integer | Y | - |  |
| 35 | created_by_name | text | Y | - |  |
| 36 | created_at | timestamp with time zone | Y | now() |  |
| 37 | updated_at | timestamp with time zone | Y | now() |  |
| 38 | trip_destination | character varying | Y | - |  |
| 39 | trip_purpose | text | Y | - |  |
| 40 | mileage_km | numeric | Y | - |  |
| 41 | mileage_rate | numeric | Y | - |  |
| 42 | advance_amount | numeric | Y | - |  |
| 43 | advance_date | date | Y | - |  |
| 44 | settlement_date | date | Y | - |  |
| 45 | policy_compliant | boolean | Y | true |  |
| 46 | employee_id | integer | Y | - |  |
| 47 | project_id | integer | Y | - |  |
| 48 | cost_center_id | integer | Y | - |  |
| 49 | total_amount | numeric | Y | 0 |  |
| 50 | vat_reclaimable | numeric | Y | 0 |  |
| 51 | net_amount | numeric | Y | 0 |  |
| 52 | paid_amount | numeric | Y | 0 |  |
| 53 | payment_date | date | Y | - |  |
| 54 | per_diem_days | integer | Y | - |  |
| 55 | per_diem_rate | numeric | Y | - |  |
| 56 | receipts_url | text | Y | - |  |
| 57 | documents_url | text | Y | - |  |
| 58 | tags | text | Y | - |  |
| 59 | employee_number | character varying | Y | - |  |
| 60 | claim_period_start | date | Y | - |  |
| 61 | claim_period_end | date | Y | - |  |
| 62 | line_count | integer | Y | 0 |  |
| 63 | net_payable | numeric | Y | 0 |  |
| 64 | approved_by | character varying | Y | - |  |
| 65 | second_approval_by | character varying | Y | - |  |
| 66 | second_approval_at | timestamp with time zone | Y | - |  |
| 67 | journal_entry_id | integer | Y | - |  |
| 68 | posted | boolean | Y | false |  |
| 69 | budget_code | character varying | Y | - |  |
| 70 | over_budget | boolean | Y | false |  |

#### 192. `expense_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('expense_reports_id_seq'::reg... | 🔑 PK |
| 2 | employee_id | integer | Y | - |  |
| 3 | title | text | N | - |  |
| 4 | total_amount | numeric | Y | 0 |  |
| 5 | status | character varying | Y | 'draft'::character varying |  |
| 6 | submitted_at | timestamp without time zone | Y | - |  |
| 7 | approved_at | timestamp without time zone | Y | - |  |
| 8 | approved_by | integer | Y | - |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 193. `expense_upload`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('expense_upload_id_seq'::regc... | 🔑 PK |
| 2 | file_name | character varying | Y | - |  |
| 3 | upload_date | date | Y | CURRENT_DATE |  |
| 4 | source | character varying | Y | 'manual'::character varying |  |
| 5 | amount | numeric | Y | 0 |  |
| 6 | vendor_name | character varying | Y | - |  |
| 7 | category | character varying | Y | - |  |
| 8 | status | character varying | Y | 'pending'::character varying |  |
| 9 | description | text | Y | - |  |
| 10 | receipt_number | character varying | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

#### 194. `expenses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('expenses_id_seq'::regclass) | 🔑 PK |
| 2 | expense_number | character varying | Y | - |  |
| 3 | expense_date | date | N | - |  |
| 4 | category | character varying | N | - |  |
| 5 | subcategory | character varying | Y | - |  |
| 6 | description | text | N | - |  |
| 7 | amount | numeric | N | - |  |
| 8 | vat_amount | numeric | Y | 0 |  |
| 9 | total_with_vat | numeric | Y | - |  |
| 10 | currency | character varying | Y | 'ILS'::character varying |  |
| 11 | payment_method | character varying | Y | - |  |
| 12 | vendor_name | text | Y | - |  |
| 13 | receipt_number | character varying | Y | - |  |
| 14 | is_recurring | boolean | Y | false |  |
| 15 | recurrence_period | character varying | Y | - |  |
| 16 | department | character varying | Y | - |  |
| 17 | project_id | integer | Y | - |  |
| 18 | approved_by | text | Y | - |  |
| 19 | status | character varying | Y | 'pending'::character varying |  |
| 20 | account_id | integer | Y | - | FK → financial_accounts.id |
| 21 | created_at | timestamp with time zone | Y | now() |  |
| 22 | updated_at | timestamp with time zone | Y | now() |  |
| 23 | file_url | text | Y | - |  |
| 24 | receipt_url | text | Y | - |  |
| 25 | employee_id | integer | Y | - |  |
| 26 | employee_name | character varying | Y | - |  |
| 27 | project_name | character varying | Y | - |  |
| 28 | cost_center | character varying | Y | - |  |
| 29 | mileage_km | numeric | Y | - |  |
| 30 | mileage_rate | numeric | Y | - |  |
| 31 | vehicle_number | character varying | Y | - |  |
| 32 | reimbursable | boolean | Y | true |  |
| 33 | reimbursed | boolean | Y | false |  |
| 34 | reimbursement_date | date | Y | - |  |
| 35 | advance_payment_id | integer | Y | - |  |
| 36 | exchange_rate | numeric | Y | 1 |  |
| 37 | base_amount | numeric | Y | - |  |
| 38 | budget_code | character varying | Y | - |  |
| 39 | over_budget | boolean | Y | false |  |
| 40 | recurring | boolean | Y | false |  |
| 41 | recurring_period | character varying | Y | - |  |
| 42 | tags | text | Y | - |  |
| 43 | expense_type | character varying | Y | 'regular'::character varying |  |
| 44 | vendor_tax_id | character varying | Y | - |  |
| 45 | invoice_number | character varying | Y | - |  |
| 46 | invoice_date | date | Y | - |  |
| 47 | vat_rate | numeric | Y | 18 |  |
| 48 | vat_reclaimable | boolean | Y | true |  |
| 49 | vat_reclaimed | boolean | Y | false |  |
| 50 | withholding_tax_rate | numeric | Y | - |  |
| 51 | withholding_tax_amount | numeric | Y | 0 |  |
| 52 | net_amount | numeric | Y | - |  |
| 53 | bank_account_id | integer | Y | - |  |
| 54 | check_number | character varying | Y | - |  |
| 55 | check_date | date | Y | - |  |
| 56 | credit_card_last4 | character varying | Y | - |  |
| 57 | credit_card_type | character varying | Y | - |  |
| 58 | approved_at | timestamp with time zone | Y | - |  |
| 59 | approval_required | boolean | Y | false |  |
| 60 | paid | boolean | Y | false |  |
| 61 | paid_date | date | Y | - |  |
| 62 | paid_amount | numeric | Y | - |  |
| 63 | journal_entry_id | integer | Y | - |  |
| 64 | gl_account_id | integer | Y | - |  |
| 65 | gl_account_name | character varying | Y | - |  |
| 66 | reconciled | boolean | Y | false |  |
| 67 | reconciled_date | date | Y | - |  |
| 68 | reimbursement_amount | numeric | Y | - |  |
| 69 | supplier_id | integer | Y | - |  |
| 70 | supplier_name | character varying | Y | - |  |
| 71 | purchase_order_id | integer | Y | - |  |
| 72 | asset_id | integer | Y | - |  |
| 73 | is_capex | boolean | Y | false |  |
| 74 | documents_url | text | Y | - |  |

#### 195. `finance_registrations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('finance_registrations_id_seq... | 🔑 PK |
| 2 | registration_number | text | N | - |  |
| 3 | registration_date | date | N | CURRENT_DATE |  |
| 4 | registration_type | text | Y | 'general'::text |  |
| 5 | entity_type | text | Y | - |  |
| 6 | entity_name | text | Y | - |  |
| 7 | source | text | Y | - |  |
| 8 | amount | numeric | Y | 0 |  |
| 9 | description | text | Y | - |  |
| 10 | reference | text | Y | - |  |
| 11 | status | text | Y | 'active'::text |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |
| 15 | tax_id | character varying | Y | - |  |
| 16 | expiry_date | date | Y | - |  |
| 17 | authority | character varying | Y | - |  |
| 18 | registration_ref | character varying | Y | - |  |
| 19 | certificate_url | text | Y | - |  |
| 20 | auto_renew | boolean | Y | false |  |
| 21 | renewal_reminder_days | integer | Y | 30 |  |
| 22 | cost | numeric | Y | - |  |
| 23 | tags | text | Y | - |  |

#### 196. `financial_accounts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('financial_accounts_id_seq'::... | 🔑 PK |
| 2 | account_number | character varying | N | - | UNIQUE |
| 3 | account_name | text | N | - |  |
| 4 | account_name_he | text | N | - |  |
| 5 | account_type | character varying | N | - |  |
| 6 | parent_account_id | integer | Y | - | FK → financial_accounts.id |
| 7 | balance | numeric | Y | 0 |  |
| 8 | currency | character varying | Y | 'ILS'::character varying |  |
| 9 | is_active | boolean | Y | true |  |
| 10 | description | text | Y | - |  |
| 11 | created_at | timestamp with time zone | N | now() |  |
| 12 | updated_at | timestamp with time zone | N | now() |  |
| 13 | account_level | integer | Y | 1 |  |
| 14 | opening_balance | numeric | Y | 0 |  |
| 15 | debit_total | numeric | Y | 0 |  |
| 16 | credit_total | numeric | Y | 0 |  |
| 17 | department | character varying | Y | - |  |
| 18 | cost_center | character varying | Y | - |  |
| 19 | tax_category | character varying | Y | - |  |
| 20 | tax_code | character varying | Y | - |  |
| 21 | is_reconcilable | boolean | Y | false |  |
| 22 | reconciliation_date | date | Y | - |  |
| 23 | budget_amount | numeric | Y | 0 |  |
| 24 | budget_warning_percent | numeric | Y | 80 |  |
| 25 | is_locked | boolean | Y | false |  |
| 26 | locked_date | date | Y | - |  |
| 27 | notes | text | Y | - |  |
| 28 | sort_order | integer | Y | 0 |  |
| 29 | account_group | character varying | Y | - |  |
| 30 | gl_linked | boolean | Y | false |  |
| 31 | tax_applicable | boolean | Y | false |  |
| 32 | tags | text | Y | - |  |

#### 197. `financial_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('financial_transactions_id_se... | 🔑 PK |
| 2 | transaction_date | date | N | - |  |
| 3 | transaction_type | character varying | N | - |  |
| 4 | reference_type | character varying | Y | - |  |
| 5 | reference_id | integer | Y | - |  |
| 6 | debit_account_id | integer | Y | - | FK → financial_accounts.id |
| 7 | credit_account_id | integer | Y | - | FK → financial_accounts.id |
| 8 | amount | numeric | N | - |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | description | text | N | - |  |
| 11 | category | character varying | Y | - |  |
| 12 | project_id | integer | Y | - |  |
| 13 | created_by | text | Y | - |  |
| 14 | status | character varying | Y | 'posted'::character varying |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | transaction_number | character varying | Y | - |  |
| 17 | value_date | date | Y | - |  |
| 18 | reference | character varying | Y | - |  |
| 19 | cost_center | character varying | Y | - |  |
| 20 | department | character varying | Y | - |  |
| 21 | bank_account_id | integer | Y | - |  |
| 22 | reconciled | boolean | Y | false |  |
| 23 | journal_entry_id | integer | Y | - |  |
| 24 | posted | boolean | Y | false |  |
| 25 | notes | text | Y | - |  |
| 26 | tags | text | Y | - |  |

#### 198. `general_ledger`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('general_ledger_id_seq'::regc... | 🔑 PK |
| 2 | entry_number | text | N | - |  |
| 3 | entry_date | date | N | CURRENT_DATE |  |
| 4 | account_number | text | N | - |  |
| 5 | account_name | text | N | - |  |
| 6 | account_type | text | Y | - |  |
| 7 | description | text | Y | - |  |
| 8 | reference | text | Y | - |  |
| 9 | source_document | text | Y | - |  |
| 10 | source_type | text | Y | - |  |
| 11 | debit_amount | numeric | Y | 0 |  |
| 12 | credit_amount | numeric | Y | 0 |  |
| 13 | balance | numeric | Y | 0 |  |
| 14 | running_balance | numeric | Y | 0 |  |
| 15 | currency | text | Y | 'ILS'::text |  |
| 16 | exchange_rate | numeric | Y | 1 |  |
| 17 | amount_ils | numeric | Y | 0 |  |
| 18 | fiscal_year | integer | Y | - |  |
| 19 | fiscal_period | integer | Y | - |  |
| 20 | cost_center | text | Y | - |  |
| 21 | department | text | Y | - |  |
| 22 | project_name | text | Y | - |  |
| 23 | journal_entry_id | integer | Y | - |  |
| 24 | status | text | Y | 'posted'::text |  |
| 25 | posted_by | integer | Y | - |  |
| 26 | posted_by_name | text | Y | - |  |
| 27 | notes | text | Y | - |  |
| 28 | created_at | timestamp with time zone | Y | now() |  |
| 29 | updated_at | timestamp with time zone | Y | now() |  |
| 30 | posting_date | date | Y | - |  |
| 31 | source_module | character varying | Y | - |  |
| 32 | tax_code | character varying | Y | - |  |
| 33 | cost_center_id | integer | Y | - |  |
| 34 | project_id | integer | Y | - |  |
| 35 | reconciled | boolean | Y | false |  |
| 36 | reconciliation_date | date | Y | - |  |
| 37 | account_id | integer | Y | - |  |
| 38 | cost_center_name | character varying | Y | - |  |
| 39 | reconciliation_id | integer | Y | - |  |
| 40 | tags | text | Y | - |  |
| 41 | debit | numeric | Y | 0 |  |
| 42 | credit | numeric | Y | 0 |  |
| 43 | journal_entry_number | character varying | Y | - |  |
| 44 | transaction_date | date | Y | - |  |
| 45 | value_date | date | Y | - |  |
| 46 | reference_type | character varying | Y | - |  |
| 47 | reference_id | integer | Y | - |  |
| 48 | amount_foreign | numeric | Y | - |  |
| 49 | fiscal_month | integer | Y | - |  |
| 50 | period_closed | boolean | Y | false |  |
| 51 | source | character varying | Y | - |  |
| 52 | auto_posted | boolean | Y | false |  |
| 53 | reversal_entry_id | integer | Y | - |  |

#### 199. `journal_entries`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('journal_entries_id_seq'::reg... | 🔑 PK |
| 2 | entry_number | character varying | N | - | UNIQUE |
| 3 | entry_date | date | N | CURRENT_DATE |  |
| 4 | description | text | N | - |  |
| 5 | reference | character varying | Y | - |  |
| 6 | entry_type | character varying | Y | 'standard'::character varying |  |
| 7 | debit_account_id | integer | Y | - | FK → financial_accounts.id |
| 8 | debit_account_name | text | Y | - |  |
| 9 | credit_account_id | integer | Y | - | FK → financial_accounts.id |
| 10 | credit_account_name | text | Y | - |  |
| 11 | amount | numeric | N | - |  |
| 12 | currency | character varying | Y | 'ILS'::character varying |  |
| 13 | exchange_rate | numeric | Y | 1 |  |
| 14 | amount_ils | numeric | Y | - |  |
| 15 | status | character varying | Y | 'draft'::character varying |  |
| 16 | source_document | character varying | Y | - |  |
| 17 | source_type | character varying | Y | - |  |
| 18 | notes | text | Y | - |  |
| 19 | created_by | integer | Y | - |  |
| 20 | created_by_name | text | Y | - |  |
| 21 | approved_by | integer | Y | - |  |
| 22 | approved_by_name | text | Y | - |  |
| 23 | approved_at | timestamp with time zone | Y | - |  |
| 24 | posted_at | timestamp with time zone | Y | - |  |
| 25 | reversed_at | timestamp with time zone | Y | - |  |
| 26 | reversal_entry_id | integer | Y | - |  |
| 27 | fiscal_year | integer | Y | - |  |
| 28 | fiscal_period | integer | Y | - |  |
| 29 | tags | text | Y | - |  |
| 30 | is_recurring | boolean | Y | false |  |
| 31 | recurring_frequency | character varying | Y | - |  |
| 32 | created_at | timestamp with time zone | Y | now() |  |
| 33 | updated_at | timestamp with time zone | Y | now() |  |
| 34 | total_debit | numeric | Y | 0 |  |
| 35 | total_credit | numeric | Y | 0 |  |
| 36 | is_balanced | boolean | Y | true |  |
| 37 | lines_count | integer | Y | 1 |  |
| 38 | cost_center | character varying | Y | - |  |
| 39 | department | character varying | Y | - |  |
| 40 | project_name | text | Y | - |  |
| 41 | attachment_url | text | Y | - |  |
| 42 | journal_type | character varying | Y | 'general'::character varying |  |
| 43 | tax_code | character varying | Y | - |  |
| 44 | tax_amount | numeric | Y | 0 |  |
| 45 | reconciled | boolean | Y | false |  |
| 46 | reconciled_date | date | Y | - |  |
| 47 | reconciled_by | character varying | Y | - |  |
| 48 | reversed | boolean | Y | false |  |
| 49 | reversal_date | date | Y | - |  |
| 50 | source_id | integer | Y | - |  |
| 51 | posted | boolean | Y | false |  |
| 52 | posted_by | character varying | Y | - |  |
| 53 | base_amount | numeric | Y | - |  |
| 54 | auto_reverse | boolean | Y | false |  |
| 55 | reversed_entry_id | integer | Y | - |  |
| 56 | audit_trail | text | Y | - |  |

#### 200. `journal_entry_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('journal_entry_lines_id_seq':... | 🔑 PK |
| 2 | journal_entry_id | integer | N | - | FK → journal_entries.id |
| 3 | line_number | integer | N | 1 |  |
| 4 | account_number | character varying | Y | - |  |
| 5 | account_name | text | N | - |  |
| 6 | account_id | integer | Y | - |  |
| 7 | debit_amount | numeric | Y | 0 |  |
| 8 | credit_amount | numeric | Y | 0 |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | exchange_rate | numeric | Y | 1 |  |
| 11 | debit_amount_ils | numeric | Y | 0 |  |
| 12 | credit_amount_ils | numeric | Y | 0 |  |
| 13 | cost_center | character varying | Y | - |  |
| 14 | department | character varying | Y | - |  |
| 15 | project_name | text | Y | - |  |
| 16 | tax_code | character varying | Y | - |  |
| 17 | tax_amount | numeric | Y | 0 |  |
| 18 | description | text | Y | - |  |
| 19 | reference | character varying | Y | - |  |
| 20 | notes | text | Y | - |  |
| 21 | debit | numeric | Y | 0 |  |
| 22 | credit | numeric | Y | 0 |  |
| 23 | project_id | integer | Y | - |  |
| 24 | customer_id | integer | Y | - |  |
| 25 | supplier_id | integer | Y | - |  |
| 26 | employee_id | integer | Y | - |  |
| 27 | amount_foreign | numeric | Y | - |  |
| 28 | reference_type | character varying | Y | - |  |
| 29 | reference_id | integer | Y | - |  |
| 30 | reconciled | boolean | Y | false |  |
| 31 | tags | text | Y | - |  |

#### 201. `journal_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('journal_reports_id_seq'::reg... | 🔑 PK |
| 2 | report_number | text | N | - |  |
| 3 | report_name | text | Y | - |  |
| 4 | period_start | date | Y | - |  |
| 5 | period_end | date | Y | - |  |
| 6 | fiscal_year | integer | Y | - |  |
| 7 | fiscal_period | integer | Y | - |  |
| 8 | total_debit | numeric | Y | 0 |  |
| 9 | total_credit | numeric | Y | 0 |  |
| 10 | net_balance | numeric | Y | 0 |  |
| 11 | entry_count | integer | Y | 0 |  |
| 12 | status | text | Y | 'draft'::text |  |
| 13 | generated_by | text | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | updated_at | timestamp with time zone | Y | now() |  |
| 17 | report_type | character varying | Y | - |  |
| 18 | fiscal_month | integer | Y | - |  |
| 19 | generated_date | date | Y | - |  |
| 20 | report_data | text | Y | - |  |
| 21 | file_url | text | Y | - |  |
| 22 | tags | text | Y | - |  |

#### 202. `journal_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('journal_transactions_id_seq'... | 🔑 PK |
| 2 | transaction_number | text | N | - |  |
| 3 | transaction_date | date | N | CURRENT_DATE |  |
| 4 | account_number | text | Y | - |  |
| 5 | account_name | text | Y | - |  |
| 6 | transaction_type | text | Y | 'debit'::text |  |
| 7 | debit_amount | numeric | Y | 0 |  |
| 8 | credit_amount | numeric | Y | 0 |  |
| 9 | description | text | Y | - |  |
| 10 | reference | text | Y | - |  |
| 11 | journal_entry_ref | text | Y | - |  |
| 12 | fiscal_year | integer | Y | - |  |
| 13 | fiscal_period | integer | Y | - |  |
| 14 | status | text | Y | 'posted'::text |  |
| 15 | notes | text | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |
| 18 | journal_id | integer | Y | - |  |
| 19 | journal_type | character varying | Y | - |  |
| 20 | posting_date | date | Y | - |  |
| 21 | account_id | integer | Y | - |  |
| 22 | debit | numeric | Y | 0 |  |
| 23 | credit | numeric | Y | 0 |  |
| 24 | reference_type | character varying | Y | - |  |
| 25 | reference_id | integer | Y | - |  |
| 26 | cost_center | character varying | Y | - |  |
| 27 | department | character varying | Y | - |  |
| 28 | project_id | integer | Y | - |  |
| 29 | currency | character varying | Y | 'ILS'::character varying |  |
| 30 | amount_foreign | numeric | Y | - |  |
| 31 | exchange_rate | numeric | Y | - |  |
| 32 | posted | boolean | Y | false |  |
| 33 | tags | text | Y | - |  |

#### 203. `loan_analyses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('loan_analyses_id_seq'::regcl... | 🔑 PK |
| 2 | loan_number | text | N | - |  |
| 3 | loan_name | text | Y | - |  |
| 4 | lender | text | Y | - |  |
| 5 | borrower | text | Y | - |  |
| 6 | principal_amount | numeric | Y | 0 |  |
| 7 | interest_rate | numeric | Y | 0 |  |
| 8 | loan_date | date | Y | - |  |
| 9 | maturity_date | date | Y | - |  |
| 10 | payment_frequency | text | Y | 'monthly'::text |  |
| 11 | monthly_payment | numeric | Y | 0 |  |
| 12 | total_payments | numeric | Y | 0 |  |
| 13 | total_interest | numeric | Y | 0 |  |
| 14 | outstanding_balance | numeric | Y | 0 |  |
| 15 | payments_made | integer | Y | 0 |  |
| 16 | loan_type | text | Y | 'bank_loan'::text |  |
| 17 | status | text | Y | 'active'::text |  |
| 18 | notes | text | Y | - |  |
| 19 | created_at | timestamp with time zone | Y | now() |  |
| 20 | updated_at | timestamp with time zone | Y | now() |  |
| 21 | analysis_number | character varying | Y | - |  |
| 22 | principal | numeric | Y | - |  |
| 23 | interest_type | character varying | Y | - |  |
| 24 | term_months | integer | Y | - |  |
| 25 | start_date | date | Y | - |  |
| 26 | end_date | date | Y | - |  |
| 27 | total_repayment | numeric | Y | - |  |
| 28 | collateral | text | Y | - |  |
| 29 | purpose | text | Y | - |  |
| 30 | approved | boolean | Y | false |  |
| 31 | tags | text | Y | - |  |

#### 204. `marketing_budget`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('marketing_budget_id_seq'::re... | 🔑 PK |
| 2 | budget_name | text | Y | - |  |
| 3 | channel | text | Y | - |  |
| 4 | campaign_ref | text | Y | - |  |
| 5 | month | text | Y | - |  |
| 6 | year | integer | Y | - |  |
| 7 | planned_budget | numeric | Y | 0 |  |
| 8 | actual_spend | numeric | Y | 0 |  |
| 9 | remaining | numeric | Y | 0 |  |
| 10 | roi | numeric | Y | 0 |  |
| 11 | status | text | Y | 'active'::text |  |
| 12 | approved_by | text | Y | - |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |

#### 205. `marketing_budgets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('marketing_budgets_id_seq'::r... | 🔑 PK |
| 2 | category | text | Y | - |  |
| 3 | month | text | Y | - |  |
| 4 | planned | numeric | Y | - |  |
| 5 | actual | numeric | Y | 0 |  |
| 6 | notes | text | Y | - |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |
| 8 | updated_at | timestamp without time zone | Y | now() |  |

#### 206. `marketing_budgets_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('marketing_budgets_items_id_s... | 🔑 PK |
| 2 | budget_category | text | Y | - |  |
| 3 | month | text | Y | - |  |
| 4 | year | integer | Y | - |  |
| 5 | planned_amount | numeric | Y | 0 |  |
| 6 | actual_amount | numeric | Y | 0 |  |
| 7 | variance | numeric | Y | 0 |  |
| 8 | notes | text | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 207. `petty_cash`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('petty_cash_id_seq'::regclass) | 🔑 PK |
| 2 | transaction_number | character varying | N | - | UNIQUE |
| 3 | transaction_type | character varying | N | 'expense'::character varying |  |
| 4 | transaction_date | date | N | CURRENT_DATE |  |
| 5 | cash_box_name | character varying | Y | 'ראשי'::character varying |  |
| 6 | category | character varying | N | 'office'::character varying |  |
| 7 | description | text | N | - |  |
| 8 | amount | numeric | N | 0 |  |
| 9 | vat_included | boolean | Y | false |  |
| 10 | vat_amount | numeric | Y | 0 |  |
| 11 | net_amount | numeric | Y | 0 |  |
| 12 | receipt_number | character varying | Y | - |  |
| 13 | vendor_name | text | Y | - |  |
| 14 | paid_to | text | Y | - |  |
| 15 | approved_by | text | Y | - |  |
| 16 | approved_at | timestamp with time zone | Y | - |  |
| 17 | status | character varying | Y | 'pending'::character varying |  |
| 18 | cost_center | character varying | Y | - |  |
| 19 | project_name | text | Y | - |  |
| 20 | balance_before | numeric | Y | 0 |  |
| 21 | balance_after | numeric | Y | 0 |  |
| 22 | replenishment_needed | boolean | Y | false |  |
| 23 | notes | text | Y | - |  |
| 24 | attachment_url | text | Y | - |  |
| 25 | created_by | integer | Y | - |  |
| 26 | created_by_name | text | Y | - |  |
| 27 | created_at | timestamp with time zone | Y | now() |  |
| 28 | updated_at | timestamp with time zone | Y | now() |  |
| 29 | receipt_url | text | Y | - |  |
| 30 | tax_deductible | boolean | Y | true |  |
| 31 | vat_reclaimable | boolean | Y | false |  |
| 32 | project_id | integer | Y | - |  |
| 33 | reimbursed | boolean | Y | false |  |
| 34 | reimbursement_date | date | Y | - |  |
| 35 | fund_name | character varying | Y | - |  |
| 36 | fund_limit | numeric | Y | 5000 |  |
| 37 | current_fund_balance | numeric | Y | - |  |
| 38 | custodian_id | integer | Y | - |  |
| 39 | custodian_name | character varying | Y | - |  |
| 40 | department | character varying | Y | - |  |
| 41 | currency | character varying | Y | 'ILS'::character varying |  |
| 42 | employee_id | integer | Y | - |  |
| 43 | employee_name | character varying | Y | - |  |
| 44 | vendor_tax_id | character varying | Y | - |  |
| 45 | invoice_number | character varying | Y | - |  |
| 46 | invoice_date | date | Y | - |  |
| 47 | vat_rate | numeric | Y | 18 |  |
| 48 | withholding_tax | numeric | Y | 0 |  |
| 49 | payment_method | character varying | Y | 'cash'::character varying |  |
| 50 | gl_account_id | integer | Y | - |  |
| 51 | journal_entry_id | integer | Y | - |  |
| 52 | budget_code | character varying | Y | - |  |
| 53 | over_budget | boolean | Y | false |  |
| 54 | replenishment_amount | numeric | Y | - |  |
| 55 | replenishment_date | date | Y | - |  |
| 56 | replenishment_ref | character varying | Y | - |  |
| 57 | last_audit_date | date | Y | - |  |
| 58 | last_audit_by | character varying | Y | - |  |
| 59 | audit_variance | numeric | Y | 0 |  |
| 60 | documents_url | text | Y | - |  |
| 61 | tags | text | Y | - |  |

#### 208. `petty_cash_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | transaction_date | date | Y | - |  |
| 3 | amount | integer | Y | 0 |  |
| 4 | transaction_type | character varying | Y | 'withdrawal'::character varying |  |
| 5 | category | character varying | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | receipt_url | character varying | Y | - |  |
| 8 | approved_by | uuid | Y | - |  |
| 9 | created_by | uuid | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |

#### 209. `project_budget_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_budget_lines_id_seq'... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | category | text | Y | - |  |
| 4 | planned_amount | numeric | Y | - |  |
| 5 | actual_amount | numeric | Y | 0 |  |
| 6 | variance | numeric | Y | 0 |  |
| 7 | notes | text | Y | - |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 210. `project_budgets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_budgets_id_seq'::reg... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | category | text | Y | - |  |
| 4 | planned_amount | numeric | Y | - |  |
| 5 | actual_amount | numeric | Y | 0 |  |
| 6 | notes | text | Y | - |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |
| 8 | updated_at | timestamp without time zone | Y | now() |  |

#### 211. `project_budgets_ent`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_budgets_ent_id_seq':... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | category | text | Y | - |  |
| 4 | planned_amount | numeric | Y | - |  |
| 5 | actual_amount | numeric | Y | 0 |  |
| 6 | variance | numeric | Y | 0 |  |
| 7 | notes | text | Y | - |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 212. `revenues`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | revenue_number | character varying | Y | - |  |
| 3 | revenue_date | date | Y | - |  |
| 4 | category | character varying | Y | 'product_sales'::character varying |  |
| 5 | customer_id | integer | Y | - |  |
| 6 | invoice_id | uuid | Y | - |  |
| 7 | account_id | uuid | Y | - |  |
| 8 | amount | integer | Y | 0 |  |
| 9 | tax_amount | integer | Y | 0 |  |
| 10 | description | text | Y | - |  |
| 11 | project_id | uuid | Y | - |  |
| 12 | department | character varying | Y | - |  |
| 13 | is_recurring | boolean | Y | false |  |
| 14 | notes | text | Y | - |  |
| 15 | created_by | uuid | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |

#### 213. `tax_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('tax_records_id_seq'::regclass) | 🔑 PK |
| 2 | record_number | character varying | N | - | UNIQUE |
| 3 | tax_type | character varying | N | - |  |
| 4 | tax_period | character varying | N | - |  |
| 5 | period_start | date | N | - |  |
| 6 | period_end | date | N | - |  |
| 7 | filing_deadline | date | Y | - |  |
| 8 | filing_date | date | Y | - |  |
| 9 | tax_base | numeric | Y | 0 |  |
| 10 | tax_rate | numeric | Y | 18 |  |
| 11 | tax_amount | numeric | Y | 0 |  |
| 12 | input_vat | numeric | Y | 0 |  |
| 13 | output_vat | numeric | Y | 0 |  |
| 14 | net_vat | numeric | Y | - |  |
| 15 | withholding_tax | numeric | Y | 0 |  |
| 16 | advance_payments | numeric | Y | 0 |  |
| 17 | amount_due | numeric | Y | 0 |  |
| 18 | amount_paid | numeric | Y | 0 |  |
| 19 | balance_due | numeric | Y | - |  |
| 20 | payment_date | date | Y | - |  |
| 21 | payment_reference | character varying | Y | - |  |
| 22 | status | character varying | Y | 'pending'::character varying |  |
| 23 | filing_status | character varying | Y | 'not_filed'::character varying |  |
| 24 | confirmation_number | character varying | Y | - |  |
| 25 | tax_authority | character varying | Y | 'רשות המסים'::character varying |  |
| 26 | currency | character varying | Y | 'ILS'::character varying |  |
| 27 | notes | text | Y | - |  |
| 28 | attachments | text | Y | - |  |
| 29 | created_by | integer | Y | - |  |
| 30 | created_by_name | text | Y | - |  |
| 31 | reviewed_by | integer | Y | - |  |
| 32 | reviewed_by_name | text | Y | - |  |
| 33 | created_at | timestamp with time zone | Y | now() |  |
| 34 | updated_at | timestamp with time zone | Y | now() |  |
| 35 | sales_vat | numeric | Y | 0 |  |
| 36 | purchase_vat | numeric | Y | 0 |  |
| 37 | withholding_tax_total | numeric | Y | 0 |  |
| 38 | payment_amount | numeric | Y | 0 |  |
| 39 | penalty_amount | numeric | Y | 0 |  |
| 40 | interest_amount | numeric | Y | 0 |  |
| 41 | documents_url | text | Y | - |  |
| 42 | tags | text | Y | - |  |
| 43 | fiscal_year | integer | Y | - |  |
| 44 | fiscal_month | integer | Y | - |  |
| 45 | filing_period | character varying | Y | - |  |
| 46 | filed_date | date | Y | - |  |
| 47 | form_type | character varying | Y | - |  |
| 48 | gross_income | numeric | Y | 0 |  |
| 49 | taxable_income | numeric | Y | 0 |  |
| 50 | tax_due | numeric | Y | 0 |  |
| 51 | tax_paid | numeric | Y | 0 |  |
| 52 | assessment_number | character varying | Y | - |  |
| 53 | assessment_date | date | Y | - |  |
| 54 | objection_filed | boolean | Y | false |  |
| 55 | objection_date | date | Y | - |  |
| 56 | accountant_reviewed | boolean | Y | false |  |
| 57 | accountant_name | character varying | Y | - |  |

#### 214. `vat_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('vat_reports_id_seq'::regclass) | 🔑 PK |
| 2 | report_number | character varying | Y | - |  |
| 3 | report_type | character varying | Y | 'regular'::character varying |  |
| 4 | period_type | character varying | Y | 'monthly'::character varying |  |
| 5 | fiscal_year | integer | N | - |  |
| 6 | fiscal_month | integer | Y | - |  |
| 7 | fiscal_quarter | integer | Y | - |  |
| 8 | period_start | date | N | - |  |
| 9 | period_end | date | N | - |  |
| 10 | status | character varying | Y | 'draft'::character varying |  |
| 11 | sales_invoices_count | integer | Y | 0 |  |
| 12 | sales_total_before_vat | numeric | Y | 0 |  |
| 13 | sales_vat_amount | numeric | Y | 0 |  |
| 14 | sales_total_with_vat | numeric | Y | 0 |  |
| 15 | sales_zero_rated | numeric | Y | 0 |  |
| 16 | sales_exempt | numeric | Y | 0 |  |
| 17 | sales_export | numeric | Y | 0 |  |
| 18 | credit_notes_total | numeric | Y | 0 |  |
| 19 | credit_notes_vat | numeric | Y | 0 |  |
| 20 | purchase_invoices_count | integer | Y | 0 |  |
| 21 | purchase_total_before_vat | numeric | Y | 0 |  |
| 22 | purchase_vat_amount | numeric | Y | 0 |  |
| 23 | purchase_total_with_vat | numeric | Y | 0 |  |
| 24 | purchase_fixed_assets_vat | numeric | Y | 0 |  |
| 25 | purchase_import_vat | numeric | Y | 0 |  |
| 26 | disallowed_vat | numeric | Y | 0 |  |
| 27 | net_vat_payable | numeric | Y | 0 |  |
| 28 | vat_rate_applied | numeric | Y | 18 |  |
| 29 | payment_due_date | date | Y | - |  |
| 30 | payment_amount | numeric | Y | - |  |
| 31 | payment_date | date | Y | - |  |
| 32 | payment_reference | character varying | Y | - |  |
| 33 | payment_method | character varying | Y | - |  |
| 34 | penalty_amount | numeric | Y | 0 |  |
| 35 | interest_amount | numeric | Y | 0 |  |
| 36 | filed | boolean | Y | false |  |
| 37 | filed_date | date | Y | - |  |
| 38 | filed_by | character varying | Y | - |  |
| 39 | filing_confirmation | character varying | Y | - |  |
| 40 | amended | boolean | Y | false |  |
| 41 | amendment_number | integer | Y | 0 |  |
| 42 | amendment_reason | text | Y | - |  |
| 43 | original_report_id | integer | Y | - |  |
| 44 | pcn874_generated | boolean | Y | false |  |
| 45 | pcn874_file_url | text | Y | - |  |
| 46 | pcn874_submission_date | date | Y | - |  |
| 47 | pcn874_confirmation | character varying | Y | - |  |
| 48 | pcn874_errors | text | Y | - |  |
| 49 | shaam_report_id | character varying | Y | - |  |
| 50 | shaam_status | character varying | Y | - |  |
| 51 | shaam_submission_date | date | Y | - |  |
| 52 | shaam_confirmation | character varying | Y | - |  |
| 53 | notes | text | Y | - |  |
| 54 | internal_notes | text | Y | - |  |
| 55 | approved_by | character varying | Y | - |  |
| 56 | approved_at | timestamp with time zone | Y | - |  |
| 57 | documents_url | text | Y | - |  |
| 58 | tags | text | Y | - |  |
| 59 | created_by | character varying | Y | - |  |
| 60 | created_at | timestamp with time zone | Y | now() |  |
| 61 | updated_at | timestamp with time zone | Y | now() |  |

#### 215. `withholding_tax`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('withholding_tax_id_seq'::reg... | 🔑 PK |
| 2 | certificate_number | character varying | N | - | UNIQUE |
| 3 | tax_year | integer | N | EXTRACT(year FROM CURRENT_DATE) |  |
| 4 | tax_month | integer | Y | - |  |
| 5 | entity_name | text | N | - |  |
| 6 | entity_type | character varying | Y | 'supplier'::character varying |  |
| 7 | entity_tax_id | character varying | Y | - |  |
| 8 | certificate_type | character varying | N | 'withholding'::character varying |  |
| 9 | tax_rate | numeric | N | 0 |  |
| 10 | gross_amount | numeric | Y | 0 |  |
| 11 | tax_withheld | numeric | Y | 0 |  |
| 12 | net_paid | numeric | Y | - |  |
| 13 | invoice_number | character varying | Y | - |  |
| 14 | invoice_date | date | Y | - |  |
| 15 | payment_date | date | Y | - |  |
| 16 | payment_method | character varying | Y | - |  |
| 17 | status | character varying | Y | 'active'::character varying |  |
| 18 | certificate_valid_from | date | Y | - |  |
| 19 | certificate_valid_to | date | Y | - |  |
| 20 | exemption_pct | numeric | Y | 0 |  |
| 21 | reduced_rate | numeric | Y | - |  |
| 22 | authority_reference | character varying | Y | - |  |
| 23 | reported_to_tax | boolean | Y | false |  |
| 24 | reported_date | date | Y | - |  |
| 25 | notes | text | Y | - |  |
| 26 | created_by | integer | Y | - |  |
| 27 | created_by_name | text | Y | - |  |
| 28 | created_at | timestamp with time zone | Y | now() |  |
| 29 | updated_at | timestamp with time zone | Y | now() |  |
| 30 | entity_id | integer | Y | - |  |
| 31 | tax_id | character varying | Y | - |  |
| 32 | withholding_rate | numeric | Y | - |  |
| 33 | valid_from | date | Y | - |  |
| 34 | valid_until | date | Y | - |  |
| 35 | certificate_url | text | Y | - |  |
| 36 | issuing_authority | character varying | Y | 'רשות המסים'::character varying |  |
| 37 | exemption | boolean | Y | false |  |
| 38 | exemption_reason | text | Y | - |  |
| 39 | total_withheld_ytd | numeric | Y | 0 |  |
| 40 | total_payments_ytd | numeric | Y | 0 |  |
| 41 | last_payment_date | date | Y | - |  |
| 42 | renewal_reminder_date | date | Y | - |  |
| 43 | renewal_in_progress | boolean | Y | false |  |
| 44 | annual_report_filed | boolean | Y | false |  |
| 45 | annual_report_date | date | Y | - |  |
| 46 | documents_url | text | Y | - |  |
| 47 | tags | text | Y | - |  |

#### 216. `working_files`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('working_files_id_seq'::regcl... | 🔑 PK |
| 2 | file_number | text | N | - |  |
| 3 | file_name | text | N | - |  |
| 4 | file_type | text | Y | 'working_paper'::text |  |
| 5 | fiscal_year | integer | Y | - |  |
| 6 | fiscal_period | integer | Y | - |  |
| 7 | accountant | text | Y | - |  |
| 8 | reviewer | text | Y | - |  |
| 9 | status | text | Y | 'in_progress'::text |  |
| 10 | priority | text | Y | 'normal'::text |  |
| 11 | due_date | date | Y | - |  |
| 12 | completed_date | date | Y | - |  |
| 13 | description | text | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | updated_at | timestamp with time zone | Y | now() |  |
| 17 | file_url | text | Y | - |  |
| 18 | entity_type | character varying | Y | - |  |
| 19 | entity_id | integer | Y | - |  |
| 20 | work_order_id | integer | Y | - |  |
| 21 | project_id | integer | Y | - |  |
| 22 | file_category | character varying | Y | - |  |
| 23 | version | integer | Y | 1 |  |
| 24 | uploaded_by | character varying | Y | - |  |
| 25 | uploaded_at | timestamp with time zone | Y | now() |  |
| 26 | is_active | boolean | Y | true |  |
| 27 | tags | text | Y | - |  |

---

### כרטיס מאוזן (Balanced Scorecard) (1 טבלאות)

#### 217. `bsc_objectives`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('bsc_objectives_id_seq'::regc... | 🔑 PK |
| 2 | perspective | text | Y | - |  |
| 3 | objective | text | Y | - |  |
| 4 | measure | text | Y | - |  |
| 5 | target | text | Y | - |  |
| 6 | actual | text | Y | - |  |
| 7 | status | text | Y | 'on_track'::text |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

---

### לקוחות ומכירות (Sales & Customers) (27 טבלאות)

#### 218. `customer_invoice_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('customer_invoice_items_id_se... | 🔑 PK |
| 2 | invoice_id | integer | N | - | FK → customer_invoices.id |
| 3 | item_number | integer | Y | 1 |  |
| 4 | item_description | text | N | - |  |
| 5 | item_code | character varying | Y | - |  |
| 6 | quantity | numeric | Y | 1 |  |
| 7 | unit_type | character varying | Y | 'יחידה'::character varying |  |
| 8 | unit_price | numeric | Y | 0 |  |
| 9 | discount_pct | numeric | Y | 0 |  |
| 10 | discount_amount | numeric | Y | 0 |  |
| 11 | line_total | numeric | Y | 0 |  |
| 12 | vat_rate | numeric | Y | 18 |  |
| 13 | vat_amount | numeric | Y | 0 |  |
| 14 | total_with_vat | numeric | Y | 0 |  |
| 15 | cost_center | character varying | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | product_id | integer | Y | - |  |
| 18 | product_sku | character varying | Y | - |  |
| 19 | width_mm | numeric | Y | - |  |
| 20 | height_mm | numeric | Y | - |  |
| 21 | area_sqm | numeric | Y | - |  |
| 22 | material_type | character varying | Y | - |  |
| 23 | glass_type | character varying | Y | - |  |
| 24 | tax_rate | numeric | Y | 18 |  |
| 25 | tax_amount | numeric | Y | 0 |  |
| 26 | cost_price | numeric | Y | 0 |  |
| 27 | profit_margin | numeric | Y | - |  |
| 28 | location_name | character varying | Y | - |  |
| 29 | work_order_id | integer | Y | - |  |
| 30 | delivery_note_number | character varying | Y | - |  |
| 31 | line_number | integer | Y | - |  |
| 32 | item_type | character varying | Y | 'product'::character varying |  |
| 33 | barcode | character varying | Y | - |  |
| 34 | serial_number | character varying | Y | - |  |
| 35 | batch_number | character varying | Y | - |  |
| 36 | warehouse | character varying | Y | - |  |
| 37 | bin_location | character varying | Y | - |  |
| 38 | weight_kg | numeric | Y | - |  |
| 39 | length_mm | numeric | Y | - |  |
| 40 | frame_color | character varying | Y | - |  |
| 41 | frame_profile | character varying | Y | - |  |
| 42 | opening_type | character varying | Y | - |  |
| 43 | glass_thickness | character varying | Y | - |  |
| 44 | hardware_details | text | Y | - |  |
| 45 | installation_location | character varying | Y | - |  |
| 46 | floor_number | character varying | Y | - |  |
| 47 | room_name | character varying | Y | - |  |
| 48 | custom_specs | text | Y | - |  |
| 49 | warranty_months | integer | Y | - |  |
| 50 | warranty_start | date | Y | - |  |
| 51 | warranty_end | date | Y | - |  |
| 52 | production_order_id | integer | Y | - |  |
| 53 | delivery_status | character varying | Y | - |  |
| 54 | delivered_date | date | Y | - |  |
| 55 | delivered_qty | numeric | Y | - |  |
| 56 | returned_qty | numeric | Y | 0 |  |
| 57 | return_reason | text | Y | - |  |
| 58 | tags | text | Y | - |  |

#### 219. `customer_invoices`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('customer_invoices_id_seq'::r... | 🔑 PK |
| 2 | invoice_number | character varying | N | - | UNIQUE |
| 3 | invoice_type | character varying | N | 'tax_invoice'::character varying |  |
| 4 | invoice_date | date | N | CURRENT_DATE |  |
| 5 | due_date | date | Y | - |  |
| 6 | customer_name | text | N | - |  |
| 7 | customer_id_ref | integer | Y | - |  |
| 8 | customer_address | text | Y | - |  |
| 9 | customer_tax_id | character varying | Y | - |  |
| 10 | contact_name | text | Y | - |  |
| 11 | contact_phone | character varying | Y | - |  |
| 12 | contact_email | character varying | Y | - |  |
| 13 | status | character varying | Y | 'draft'::character varying |  |
| 14 | currency | character varying | Y | 'ILS'::character varying |  |
| 15 | exchange_rate | numeric | Y | 1 |  |
| 16 | subtotal | numeric | Y | 0 |  |
| 17 | discount_pct | numeric | Y | 0 |  |
| 18 | discount_amount | numeric | Y | 0 |  |
| 19 | before_vat | numeric | Y | 0 |  |
| 20 | vat_rate | numeric | Y | 18 |  |
| 21 | vat_amount | numeric | Y | 0 |  |
| 22 | total_amount | numeric | Y | 0 |  |
| 23 | amount_paid | numeric | Y | 0 |  |
| 24 | balance_due | numeric | Y | - |  |
| 25 | payment_terms | character varying | Y | 'net_30'::character varying |  |
| 26 | payment_method | character varying | Y | - |  |
| 27 | reference_number | character varying | Y | - |  |
| 28 | po_number | character varying | Y | - |  |
| 29 | project_name | text | Y | - |  |
| 30 | cost_center | character varying | Y | - |  |
| 31 | salesperson | text | Y | - |  |
| 32 | delivery_date | date | Y | - |  |
| 33 | delivery_address | text | Y | - |  |
| 34 | item_description | text | Y | - |  |
| 35 | notes | text | Y | - |  |
| 36 | internal_notes | text | Y | - |  |
| 37 | sent_at | timestamp with time zone | Y | - |  |
| 38 | paid_at | timestamp with time zone | Y | - |  |
| 39 | cancelled_reason | text | Y | - |  |
| 40 | created_by | integer | Y | - |  |
| 41 | created_by_name | text | Y | - |  |
| 42 | created_at | timestamp with time zone | Y | now() |  |
| 43 | updated_at | timestamp with time zone | Y | now() |  |
| 44 | line_items_json | text | Y | - |  |
| 45 | bank_ref | character varying | Y | - |  |
| 46 | contract_ref | character varying | Y | - |  |
| 47 | einvoice_xml | text | Y | - |  |
| 48 | payment_date | date | Y | - |  |
| 49 | shipping_address | text | Y | - |  |
| 50 | billing_address | text | Y | - |  |
| 51 | commission_pct | numeric | Y | - |  |
| 52 | commission_amount | numeric | Y | - |  |
| 53 | dunning_level | integer | Y | 0 |  |
| 54 | last_dunning_date | date | Y | - |  |
| 55 | payment_reminder_sent | boolean | Y | false |  |
| 56 | digital_signature | text | Y | - |  |
| 57 | delivery_city | character varying | Y | - |  |
| 58 | gps_latitude | numeric | Y | - |  |
| 59 | gps_longitude | numeric | Y | - |  |
| 60 | project_id | integer | Y | - |  |
| 61 | withholding_tax_rate | numeric | Y | 0 |  |
| 62 | withholding_tax_amount | numeric | Y | 0 |  |
| 63 | deposit_invoice | boolean | Y | false |  |
| 64 | final_invoice | boolean | Y | false |  |
| 65 | is_credit_note | boolean | Y | false |  |
| 66 | original_invoice_id | integer | Y | - |  |
| 67 | credit_note_reason | text | Y | - |  |
| 68 | recurring | boolean | Y | false |  |
| 69 | recurring_period | character varying | Y | - |  |
| 70 | qr_code_url | text | Y | - |  |
| 71 | viewed_at | timestamp with time zone | Y | - |  |
| 72 | collection_status | character varying | Y | 'current'::character varying |  |
| 73 | reminder_sent_count | integer | Y | 0 |  |
| 74 | last_reminder_date | date | Y | - |  |
| 75 | promise_to_pay_date | date | Y | - |  |
| 76 | proforma | boolean | Y | false |  |
| 77 | customer_po_number | character varying | Y | - |  |
| 78 | delivery_note_id | integer | Y | - |  |
| 79 | delivery_note_number | character varying | Y | - |  |
| 80 | withholding_tax_pct | numeric | Y | - |  |
| 81 | rounding_amount | numeric | Y | 0 |  |
| 82 | payment_reference | character varying | Y | - |  |
| 83 | check_number | character varying | Y | - |  |
| 84 | check_date | date | Y | - |  |
| 85 | check_bank | character varying | Y | - |  |
| 86 | overdue_days | integer | Y | 0 |  |
| 87 | sent_to_customer | boolean | Y | false |  |
| 88 | sent_date | date | Y | - |  |
| 89 | sent_method | character varying | Y | - |  |
| 90 | e_invoice_status | character varying | Y | - |  |
| 91 | e_invoice_reference | character varying | Y | - |  |
| 92 | credit_note_id | integer | Y | - |  |
| 93 | documents_url | text | Y | - |  |
| 94 | tags | text | Y | - |  |

#### 220. `customer_payments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('customer_payments_id_seq'::r... | 🔑 PK |
| 2 | payment_number | character varying | Y | - | UNIQUE |
| 3 | payment_date | date | Y | CURRENT_DATE |  |
| 4 | customer_name | character varying | Y | - |  |
| 5 | customer_tax_id | character varying | Y | - |  |
| 6 | invoice_number | character varying | Y | - |  |
| 7 | amount | numeric | Y | 0 |  |
| 8 | payment_method | character varying | Y | 'bank_transfer'::character varying |  |
| 9 | reference_number | character varying | Y | - |  |
| 10 | bank_name | character varying | Y | - |  |
| 11 | check_number | character varying | Y | - |  |
| 12 | status | character varying | Y | 'completed'::character varying |  |
| 13 | notes | text | Y | - |  |
| 14 | created_by | integer | Y | - |  |
| 15 | created_by_name | character varying | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |
| 18 | customer_id | integer | Y | - |  |
| 19 | invoice_id | integer | Y | - |  |
| 20 | receipt_type | character varying | Y | 'payment'::character varying |  |
| 21 | currency | character varying | Y | 'ILS'::character varying |  |
| 22 | exchange_rate | numeric | Y | 1 |  |
| 23 | amount_in_currency | numeric | Y | - |  |
| 24 | amount_in_ils | numeric | Y | - |  |
| 25 | vat_amount | numeric | Y | 0 |  |
| 26 | withholding_tax_amount | numeric | Y | 0 |  |
| 27 | net_amount | numeric | Y | - |  |
| 28 | discount_amount | numeric | Y | 0 |  |
| 29 | check_bank | character varying | Y | - |  |
| 30 | check_date | date | Y | - |  |
| 31 | check_branch | character varying | Y | - |  |
| 32 | check_account | character varying | Y | - |  |
| 33 | check_status | character varying | Y | - |  |
| 34 | check_deposited_date | date | Y | - |  |
| 35 | check_cleared_date | date | Y | - |  |
| 36 | check_bounced | boolean | Y | false |  |
| 37 | check_bounced_date | date | Y | - |  |
| 38 | check_bounced_reason | text | Y | - |  |
| 39 | credit_card_type | character varying | Y | - |  |
| 40 | credit_card_last4 | character varying | Y | - |  |
| 41 | credit_card_auth | character varying | Y | - |  |
| 42 | credit_card_installments | integer | Y | 1 |  |
| 43 | credit_card_first_amount | numeric | Y | - |  |
| 44 | credit_card_installment_amount | numeric | Y | - |  |
| 45 | wire_transfer_ref | character varying | Y | - |  |
| 46 | wire_transfer_bank | character varying | Y | - |  |
| 47 | wire_transfer_date | date | Y | - |  |
| 48 | cash_register_id | integer | Y | - |  |
| 49 | deposit_bank_account_id | integer | Y | - |  |
| 50 | deposit_date | date | Y | - |  |
| 51 | deposit_slip_number | character varying | Y | - |  |
| 52 | allocation_status | character varying | Y | 'unallocated'::character varying |  |
| 53 | allocated_invoices | text | Y | - |  |
| 54 | overpayment | numeric | Y | 0 |  |
| 55 | overpayment_action | character varying | Y | - |  |
| 56 | refund_id | integer | Y | - |  |
| 57 | reversed | boolean | Y | false |  |
| 58 | reversed_date | date | Y | - |  |
| 59 | reversed_reason | text | Y | - |  |
| 60 | reversed_by | character varying | Y | - |  |
| 61 | receipt_printed | boolean | Y | false |  |
| 62 | receipt_print_count | integer | Y | 0 |  |
| 63 | receipt_emailed | boolean | Y | false |  |
| 64 | receipt_url | text | Y | - |  |
| 65 | approved_by | character varying | Y | - |  |
| 66 | approved_at | timestamp with time zone | Y | - |  |
| 67 | journal_entry_id | integer | Y | - |  |
| 68 | gl_account_id | integer | Y | - |  |
| 69 | reconciled | boolean | Y | false |  |
| 70 | reconciled_date | date | Y | - |  |
| 71 | project_id | integer | Y | - |  |
| 72 | project_name | character varying | Y | - |  |
| 73 | cost_center | character varying | Y | - |  |
| 74 | documents_url | text | Y | - |  |
| 75 | tags | text | Y | - |  |

#### 221. `customer_portal_users`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | customer_id | uuid | Y | - |  |
| 3 | email | character varying | Y | - |  |
| 4 | password_hash | text | Y | - |  |
| 5 | last_login | timestamp without time zone | Y | - |  |
| 6 | is_active | boolean | Y | true |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |
| 8 | updated_at | timestamp without time zone | Y | now() |  |

#### 222. `customer_refunds`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('customer_refunds_id_seq'::re... | 🔑 PK |
| 2 | refund_number | character varying | Y | - | UNIQUE |
| 3 | refund_date | date | Y | CURRENT_DATE |  |
| 4 | customer_name | character varying | Y | - |  |
| 5 | customer_tax_id | character varying | Y | - |  |
| 6 | invoice_number | character varying | Y | - |  |
| 7 | reason | text | Y | - |  |
| 8 | amount | numeric | Y | 0 |  |
| 9 | vat_rate | numeric | Y | 18 |  |
| 10 | vat_amount | numeric | Y | 0 |  |
| 11 | total_amount | numeric | Y | 0 |  |
| 12 | status | character varying | Y | 'pending'::character varying |  |
| 13 | payment_method | character varying | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | created_by | integer | Y | - |  |
| 16 | created_by_name | character varying | Y | - |  |
| 17 | created_at | timestamp without time zone | Y | now() |  |
| 18 | updated_at | timestamp without time zone | Y | now() |  |
| 19 | customer_id | integer | Y | - |  |
| 20 | invoice_id | integer | Y | - |  |
| 21 | credit_note_id | integer | Y | - |  |
| 22 | credit_note_number | character varying | Y | - |  |
| 23 | refund_amount | numeric | Y | - |  |
| 24 | currency | character varying | Y | 'ILS'::character varying |  |
| 25 | refund_method | character varying | Y | - |  |
| 26 | bank_name | character varying | Y | - |  |
| 27 | bank_branch | character varying | Y | - |  |
| 28 | bank_account | character varying | Y | - |  |
| 29 | check_number | character varying | Y | - |  |
| 30 | refund_reference | character varying | Y | - |  |
| 31 | approved_by | character varying | Y | - |  |
| 32 | approved_at | timestamp with time zone | Y | - |  |
| 33 | journal_entry_id | integer | Y | - |  |
| 34 | posted | boolean | Y | false |  |
| 35 | documents_url | text | Y | - |  |
| 36 | tags | text | Y | - |  |

#### 223. `customers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('customers_id_seq'::regclass) | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | email | character varying | Y | - |  |
| 4 | phone | character varying | Y | - |  |
| 5 | address | text | Y | - |  |
| 6 | city | character varying | Y | - |  |
| 7 | contact_person | character varying | Y | - |  |
| 8 | tax_id | character varying | Y | - |  |
| 9 | source | character varying | Y | - |  |
| 10 | status | character varying | Y | 'active'::character varying |  |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp with time zone | Y | now() |  |
| 13 | updated_at | timestamp with time zone | Y | now() |  |
| 14 | customer_number | character varying | Y | - |  |
| 15 | company_name | character varying | Y | - |  |
| 16 | contact_title | character varying | Y | - |  |
| 17 | mobile | character varying | Y | - |  |
| 18 | fax | character varying | Y | - |  |
| 19 | website | character varying | Y | - |  |
| 20 | country | character varying | Y | 'ישראל'::character varying |  |
| 21 | zip_code | character varying | Y | - |  |
| 22 | region | character varying | Y | - |  |
| 23 | shipping_address | text | Y | - |  |
| 24 | shipping_city | character varying | Y | - |  |
| 25 | shipping_country | character varying | Y | - |  |
| 26 | billing_address | text | Y | - |  |
| 27 | billing_city | character varying | Y | - |  |
| 28 | payment_terms | character varying | Y | 'net_30'::character varying |  |
| 29 | credit_limit | numeric | Y | 0 |  |
| 30 | credit_days | integer | Y | 30 |  |
| 31 | currency | character varying | Y | 'ILS'::character varying |  |
| 32 | discount_percent | numeric | Y | 0 |  |
| 33 | vat_exempt | boolean | Y | false |  |
| 34 | withholding_tax_rate | numeric | Y | 0 |  |
| 35 | customer_type | character varying | Y | 'regular'::character varying |  |
| 36 | industry | character varying | Y | - |  |
| 37 | customer_group | character varying | Y | - |  |
| 38 | salesperson_id | integer | Y | - |  |
| 39 | salesperson_name | character varying | Y | - |  |
| 40 | territory | character varying | Y | - |  |
| 41 | price_list_id | integer | Y | - |  |
| 42 | language | character varying | Y | 'he'::character varying |  |
| 43 | bank_name | character varying | Y | - |  |
| 44 | bank_branch | character varying | Y | - |  |
| 45 | bank_account_number | character varying | Y | - |  |
| 46 | swift_code | character varying | Y | - |  |
| 47 | iban | character varying | Y | - |  |
| 48 | total_revenue | numeric | Y | 0 |  |
| 49 | total_orders | integer | Y | 0 |  |
| 50 | last_order_date | date | Y | - |  |
| 51 | last_payment_date | date | Y | - |  |
| 52 | outstanding_balance | numeric | Y | 0 |  |
| 53 | overdue_amount | numeric | Y | 0 |  |
| 54 | rating | integer | Y | 0 |  |
| 55 | loyalty_tier | character varying | Y | 'standard'::character varying |  |
| 56 | gps_latitude | numeric | Y | - |  |
| 57 | gps_longitude | numeric | Y | - |  |
| 58 | delivery_zone | character varying | Y | - |  |
| 59 | preferred_delivery_day | character varying | Y | - |  |
| 60 | opening_balance | numeric | Y | 0 |  |
| 61 | opening_balance_date | date | Y | - |  |
| 62 | is_active | boolean | Y | true |  |
| 63 | blacklisted | boolean | Y | false |  |
| 64 | blacklist_reason | text | Y | - |  |
| 65 | secondary_contact | character varying | Y | - |  |
| 66 | secondary_phone | character varying | Y | - |  |
| 67 | secondary_email | character varying | Y | - |  |
| 68 | project_type | character varying | Y | - |  |
| 69 | default_warehouse | character varying | Y | - |  |
| 70 | company_name_en | text | Y | - |  |
| 71 | contact_first_name | character varying | Y | - |  |
| 72 | contact_last_name | character varying | Y | - |  |
| 73 | contact_position | character varying | Y | - |  |
| 74 | contact_email | character varying | Y | - |  |
| 75 | contact_mobile | character varying | Y | - |  |
| 76 | company_registration | character varying | Y | - |  |
| 77 | annual_revenue | numeric | Y | - |  |
| 78 | employee_count | integer | Y | - |  |
| 79 | year_established | integer | Y | - |  |
| 80 | company_size | character varying | Y | - |  |
| 81 | social_media | text | Y | - |  |
| 82 | referral_source | character varying | Y | - |  |
| 83 | referred_by | character varying | Y | - |  |
| 84 | acquisition_date | date | Y | - |  |
| 85 | acquisition_cost | numeric | Y | - |  |
| 86 | lifetime_value | numeric | Y | 0 |  |
| 87 | avg_order_value | numeric | Y | - |  |
| 88 | last_contact_date | date | Y | - |  |
| 89 | preferred_language | character varying | Y | 'he'::character varying |  |
| 90 | preferred_contact_method | character varying | Y | - |  |
| 91 | do_not_call | boolean | Y | false |  |
| 92 | do_not_email | boolean | Y | false |  |
| 93 | customer_since | date | Y | - |  |
| 94 | loyalty_points | integer | Y | 0 |  |
| 95 | risk_level | character varying | Y | 'low'::character varying |  |
| 96 | churn_risk | numeric | Y | - |  |
| 97 | satisfaction_score | numeric | Y | - |  |
| 98 | nps_score | integer | Y | - |  |
| 99 | complaints_count | integer | Y | 0 |  |
| 100 | returns_count | integer | Y | 0 |  |
| 101 | shipping_zip | character varying | Y | - |  |
| 102 | shipping_region | character varying | Y | - |  |
| 103 | billing_country | character varying | Y | - |  |
| 104 | billing_zip | character varying | Y | - |  |
| 105 | billing_region | character varying | Y | - |  |
| 106 | credit_used | numeric | Y | 0 |  |
| 107 | credit_available | numeric | Y | - |  |
| 108 | payment_method | character varying | Y | - |  |
| 109 | withholding_tax_exempt | boolean | Y | false |  |
| 110 | price_level | character varying | Y | - |  |
| 111 | custom_price_list_id | integer | Y | - |  |
| 112 | insurance_required | boolean | Y | false |  |
| 113 | insurance_certificate | text | Y | - |  |
| 114 | insurance_expiry | date | Y | - |  |
| 115 | approved_credit | boolean | Y | true |  |
| 116 | credit_check_date | date | Y | - |  |
| 117 | documents_url | text | Y | - |  |
| 118 | photo_url | text | Y | - |  |
| 119 | tags | text | Y | - |  |
| 120 | last_review_date | date | Y | - |  |
| 121 | next_review_date | date | Y | - |  |
| 122 | credit_terms_days | integer | Y | 30 |  |
| 123 | bank_account | character varying | Y | - |  |
| 124 | customer_category | character varying | Y | 'B'::character varying |  |
| 125 | num_employees | integer | Y | - |  |
| 126 | linkedin | text | Y | - |  |
| 127 | last_purchase_date | date | Y | - |  |
| 128 | contact_department | character varying | Y | - |  |
| 129 | contact_role | character varying | Y | - |  |
| 130 | alternate_contact_name | character varying | Y | - |  |
| 131 | alternate_contact_phone | character varying | Y | - |  |
| 132 | alternate_contact_email | character varying | Y | - |  |
| 133 | alternate_contact_role | character varying | Y | - |  |
| 134 | delivery_instructions | text | Y | - |  |
| 135 | preferred_delivery_time | character varying | Y | - |  |
| 136 | forklift_available | boolean | Y | false |  |
| 137 | crane_access | boolean | Y | false |  |
| 138 | site_restrictions | text | Y | - |  |
| 139 | gps_address | text | Y | - |  |
| 140 | waze_link | text | Y | - |  |
| 141 | credit_rating | character varying | Y | - |  |
| 142 | credit_insurance | boolean | Y | false |  |
| 143 | credit_insurance_provider | character varying | Y | - |  |
| 144 | credit_insurance_limit | numeric | Y | - |  |
| 145 | average_payment_days | integer | Y | - |  |
| 146 | last_payment_amount | numeric | Y | - |  |
| 147 | total_overdue | numeric | Y | 0 |  |
| 148 | overdue_invoices_count | integer | Y | 0 |  |
| 149 | bounced_checks_count | integer | Y | 0 |  |
| 150 | withholding_tax_certificate | text | Y | - |  |
| 151 | withholding_tax_valid_until | date | Y | - |  |
| 152 | vat_exempt_certificate | text | Y | - |  |
| 153 | vat_exempt_valid_until | date | Y | - |  |
| 154 | price_list_name | character varying | Y | - |  |
| 155 | special_pricing_notes | text | Y | - |  |
| 156 | volume_discount_tier | character varying | Y | - |  |
| 157 | annual_contract | boolean | Y | false |  |
| 158 | contract_start_date | date | Y | - |  |
| 159 | contract_end_date | date | Y | - |  |
| 160 | contract_value | numeric | Y | - |  |
| 161 | preferred_products | text | Y | - |  |
| 162 | typical_order_size | character varying | Y | - |  |
| 163 | seasonal_pattern | text | Y | - |  |
| 164 | competitor_using | text | Y | - |  |
| 165 | win_back_notes | text | Y | - |  |
| 166 | marketing_consent | boolean | Y | true |  |
| 167 | email_campaigns_sent | integer | Y | 0 |  |
| 168 | last_campaign_date | date | Y | - |  |
| 169 | campaign_response_rate | numeric | Y | - |  |
| 170 | preferred_notification_channel | character varying | Y | 'whatsapp'::character varying |  |
| 171 | notification_opt_out | boolean | Y | false |  |
| 172 | latitude | numeric | Y | - |  |
| 173 | longitude | numeric | Y | - |  |

#### 224. `delivery_note_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('delivery_note_items_id_seq':... | 🔑 PK |
| 2 | delivery_note_id | integer | Y | - | FK → delivery_notes.id |
| 3 | sales_order_item_id | integer | Y | - |  |
| 4 | product_id | integer | Y | - |  |
| 5 | quantity_shipped | numeric | Y | 0 |  |
| 6 | quantity_received | numeric | Y | 0 |  |
| 7 | condition_notes | text | Y | - |  |
| 8 | sort_order | integer | Y | 0 |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |

#### 225. `delivery_notes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('delivery_notes_id_seq'::regc... | 🔑 PK |
| 2 | delivery_number | character varying | Y | - | UNIQUE |
| 3 | sales_order_id | integer | Y | - |  |
| 4 | customer_id | integer | Y | - |  |
| 5 | delivery_date | date | Y | CURRENT_DATE |  |
| 6 | status | character varying | Y | 'draft'::character varying |  |
| 7 | shipping_method | character varying | Y | - |  |
| 8 | tracking_number | character varying | Y | - |  |
| 9 | carrier | character varying | Y | - |  |
| 10 | driver_name | character varying | Y | - |  |
| 11 | vehicle_number | character varying | Y | - |  |
| 12 | delivery_address | jsonb | Y | '{}'::jsonb |  |
| 13 | receiver_name | character varying | Y | - |  |
| 14 | receiver_signature | text | Y | - |  |
| 15 | notes | text | Y | - |  |
| 16 | is_active | boolean | Y | true |  |
| 17 | created_by | integer | Y | - |  |
| 18 | created_at | timestamp without time zone | Y | now() |  |
| 19 | updated_at | timestamp without time zone | Y | now() |  |

#### 226. `goods_receipt_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('goods_receipt_items_id_seq':... | 🔑 PK |
| 2 | receipt_id | integer | N | - |  |
| 3 | order_item_id | integer | Y | - |  |
| 4 | material_id | integer | Y | - |  |
| 5 | item_description | text | N | - |  |
| 6 | expected_quantity | numeric | Y | 0 |  |
| 7 | received_quantity | numeric | N | 0 |  |
| 8 | unit | text | Y | 'יחידה'::text |  |
| 9 | quality_status | text | Y | 'תקין'::text |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | item_code | text | Y | - |  |
| 13 | lot_number | text | Y | - |  |
| 14 | serial_number | text | Y | - |  |
| 15 | condition_notes | text | Y | - |  |
| 16 | photo_urls | text | Y | - |  |
| 17 | storage_location | text | Y | - |  |
| 18 | expiry_date | date | Y | - |  |
| 19 | line_number | integer | Y | - |  |
| 20 | material_name | character varying | Y | - |  |
| 21 | material_code | character varying | Y | - |  |
| 22 | product_id | integer | Y | - |  |
| 23 | product_name | character varying | Y | - |  |
| 24 | uom | character varying | Y | 'יחידה'::character varying |  |
| 25 | quantity_ordered | numeric | Y | - |  |
| 26 | quantity_received | numeric | Y | - |  |
| 27 | quantity_accepted | numeric | Y | - |  |
| 28 | quantity_rejected | numeric | Y | 0 |  |
| 29 | rejection_reason | text | Y | - |  |
| 30 | unit_price | numeric | Y | - |  |
| 31 | line_total | numeric | Y | - |  |
| 32 | warehouse | character varying | Y | - |  |
| 33 | bin_location | character varying | Y | - |  |
| 34 | batch_number | character varying | Y | - |  |
| 35 | heat_number | character varying | Y | - |  |
| 36 | inspection_required | boolean | Y | true |  |
| 37 | inspection_passed | boolean | Y | - |  |
| 38 | certificate_url | text | Y | - |  |
| 39 | dimensions_verified | boolean | Y | false |  |
| 40 | weight_verified | boolean | Y | false |  |
| 41 | tags | text | Y | - |  |

#### 227. `goods_receipts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('goods_receipts_id_seq'::regc... | 🔑 PK |
| 2 | receipt_number | text | N | - | UNIQUE |
| 3 | order_id | integer | Y | - |  |
| 4 | supplier_id | integer | N | - |  |
| 5 | receipt_date | date | Y | CURRENT_DATE |  |
| 6 | status | text | N | 'חדש'::text |  |
| 7 | received_by | text | Y | - |  |
| 8 | warehouse_location | text | Y | - |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |
| 12 | delivery_note_number | text | Y | - |  |
| 13 | vehicle_number | text | Y | - |  |
| 14 | inspector | text | Y | - |  |
| 15 | overall_quality | text | Y | 'תקין'::text |  |
| 16 | supplier_name | character varying | Y | - |  |
| 17 | purchase_order_number | character varying | Y | - |  |
| 18 | delivery_note_date | date | Y | - |  |
| 19 | driver_name | character varying | Y | - |  |
| 20 | driver_id | character varying | Y | - |  |
| 21 | unloading_method | character varying | Y | - |  |
| 22 | dock_number | character varying | Y | - |  |
| 23 | arrival_time | timestamp with time zone | Y | - |  |
| 24 | unloading_complete_time | timestamp with time zone | Y | - |  |
| 25 | total_packages | integer | Y | - |  |
| 26 | total_weight_kg | numeric | Y | - |  |
| 27 | total_pallets | integer | Y | - |  |
| 28 | inspection_required | boolean | Y | true |  |
| 29 | inspection_status | character varying | Y | 'pending'::character varying |  |
| 30 | inspection_date | date | Y | - |  |
| 31 | inspection_by | character varying | Y | - |  |
| 32 | accepted_quantity | numeric | Y | - |  |
| 33 | rejected_quantity | numeric | Y | 0 |  |
| 34 | rejection_reason | text | Y | - |  |
| 35 | damaged_quantity | numeric | Y | 0 |  |
| 36 | damage_description | text | Y | - |  |
| 37 | damage_photos_url | text | Y | - |  |
| 38 | temperature_check | numeric | Y | - |  |
| 39 | humidity_check | numeric | Y | - |  |
| 40 | certificate_of_conformity | boolean | Y | false |  |
| 41 | material_test_report | boolean | Y | false |  |
| 42 | material_certificate_number | character varying | Y | - |  |
| 43 | batch_number | character varying | Y | - |  |
| 44 | heat_number | character varying | Y | - |  |
| 45 | country_of_origin | character varying | Y | - |  |
| 46 | customs_entry_number | character varying | Y | - |  |
| 47 | quarantine | boolean | Y | false |  |
| 48 | quarantine_release_date | date | Y | - |  |
| 49 | quarantine_released_by | character varying | Y | - |  |
| 50 | warehouse_id | integer | Y | - |  |
| 51 | shelf_location | character varying | Y | - |  |
| 52 | bin_location | character varying | Y | - |  |
| 53 | inventory_updated | boolean | Y | false |  |
| 54 | invoice_verified | boolean | Y | false |  |
| 55 | supplier_invoice_number | character varying | Y | - |  |
| 56 | supplier_invoice_date | date | Y | - |  |
| 57 | total_amount | numeric | Y | - |  |
| 58 | currency | character varying | Y | 'ILS'::character varying |  |
| 59 | line_items_json | text | Y | - |  |
| 60 | photos_url | text | Y | - |  |
| 61 | approved_by | character varying | Y | - |  |
| 62 | approved_at | timestamp with time zone | Y | - |  |
| 63 | supplier_delivery_note | character varying | Y | - |  |
| 64 | truck_number | character varying | Y | - |  |
| 65 | gate_entry_time | timestamp with time zone | Y | - |  |
| 66 | unloading_start_time | timestamp with time zone | Y | - |  |
| 67 | unloading_end_time | timestamp with time zone | Y | - |  |
| 68 | storage_location | character varying | Y | - |  |
| 69 | bin_number | character varying | Y | - |  |
| 70 | temperature_reading | numeric | Y | - |  |
| 71 | weight_gross | numeric | Y | - |  |
| 72 | weight_tare | numeric | Y | - |  |
| 73 | weight_net | numeric | Y | - |  |
| 74 | quantity_ordered | numeric | Y | - |  |
| 75 | quantity_received | numeric | Y | - |  |
| 76 | quantity_rejected | numeric | Y | 0 |  |
| 77 | quantity_accepted | numeric | Y | - |  |
| 78 | quarantine_location | character varying | Y | - |  |
| 79 | certificate_of_analysis | boolean | Y | false |  |
| 80 | certificate_number | character varying | Y | - |  |
| 81 | documents_url | text | Y | - |  |
| 82 | tags | text | Y | - |  |
| 83 | purchase_order_id | integer | Y | - |  |
| 84 | import_order_id | integer | Y | - |  |
| 85 | material_certificate_url | text | Y | - |  |
| 86 | mill_certificate | boolean | Y | false |  |
| 87 | quality_status | character varying | Y | 'pending'::character varying |  |
| 88 | quality_inspector | character varying | Y | - |  |
| 89 | quality_inspection_date | date | Y | - |  |
| 90 | quality_report_url | text | Y | - |  |
| 91 | inventory_update_date | date | Y | - |  |
| 92 | cost_per_unit | numeric | Y | - |  |
| 93 | total_value | numeric | Y | - |  |
| 94 | landed_cost_per_unit | numeric | Y | - |  |
| 95 | variance_pct | numeric | Y | - |  |

#### 228. `sales_collection_cases`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_collection_cases_id_se... | 🔑 PK |
| 2 | case_number | character varying | Y | - | UNIQUE |
| 3 | customer_id | integer | Y | - | FK → sales_customers.id |
| 4 | customer_name | character varying | Y | - |  |
| 5 | invoice_refs | text | Y | - |  |
| 6 | total_overdue | numeric | Y | 0 |  |
| 7 | days_overdue | integer | Y | 0 |  |
| 8 | status | character varying | Y | 'active'::character varying |  |
| 9 | assigned_collector | character varying | Y | - |  |
| 10 | last_contact_date | date | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | next_action_date | date | Y | - |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |
| 15 | total_debt | numeric | Y | - |  |
| 16 | overdue_amount | numeric | Y | - |  |
| 17 | case_type | character varying | Y | - |  |
| 18 | severity | character varying | Y | - |  |
| 19 | assigned_to | character varying | Y | - |  |
| 20 | opened_date | date | Y | - |  |
| 21 | closed_date | date | Y | - |  |
| 22 | last_action_date | date | Y | - |  |
| 23 | last_action | character varying | Y | - |  |
| 24 | next_action | character varying | Y | - |  |
| 25 | payment_plan | boolean | Y | false |  |
| 26 | payment_plan_details | text | Y | - |  |
| 27 | legal_status | character varying | Y | - |  |
| 28 | collected_total | numeric | Y | 0 |  |
| 29 | write_off_amount | numeric | Y | 0 |  |
| 30 | tags | text | Y | - |  |

#### 229. `sales_cost_calculations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_cost_calculations_id_s... | 🔑 PK |
| 2 | calc_number | character varying | Y | - | UNIQUE |
| 3 | name | character varying | N | - |  |
| 4 | product_service | character varying | Y | - |  |
| 5 | material_cost | numeric | Y | 0 |  |
| 6 | labor_cost | numeric | Y | 0 |  |
| 7 | overhead_cost | numeric | Y | 0 |  |
| 8 | margin_percent | numeric | Y | 0 |  |
| 9 | selling_price | numeric | Y | 0 |  |
| 10 | notes | text | Y | - |  |
| 11 | created_by | character varying | Y | - |  |
| 12 | calc_date | date | Y | CURRENT_DATE |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |
| 15 | quote_id | integer | Y | - |  |
| 16 | order_id | integer | Y | - |  |
| 17 | product_id | integer | Y | - |  |
| 18 | product_name | character varying | Y | - |  |
| 19 | hardware_cost | numeric | Y | 0 |  |
| 20 | glass_cost | numeric | Y | 0 |  |
| 21 | finishing_cost | numeric | Y | 0 |  |
| 22 | installation_cost | numeric | Y | 0 |  |
| 23 | delivery_cost | numeric | Y | 0 |  |
| 24 | total_cost | numeric | Y | 0 |  |
| 25 | margin_pct | numeric | Y | - |  |
| 26 | profit | numeric | Y | - |  |
| 27 | width_mm | numeric | Y | - |  |
| 28 | height_mm | numeric | Y | - |  |
| 29 | area_sqm | numeric | Y | - |  |
| 30 | material_type | character varying | Y | - |  |
| 31 | color | character varying | Y | - |  |
| 32 | glass_type | character varying | Y | - |  |
| 33 | opening_type | character varying | Y | - |  |
| 34 | is_active | boolean | Y | true |  |
| 35 | tags | text | Y | - |  |

#### 230. `sales_customers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_customers_id_seq'::reg... | 🔑 PK |
| 2 | customer_number | character varying | Y | - | UNIQUE |
| 3 | name | character varying | N | - |  |
| 4 | customer_type | character varying | Y | 'company'::character varying |  |
| 5 | email | character varying | Y | - |  |
| 6 | phone | character varying | Y | - |  |
| 7 | address | text | Y | - |  |
| 8 | billing_address | text | Y | - |  |
| 9 | credit_limit | numeric | Y | 0 |  |
| 10 | payment_terms | character varying | Y | 'שוטף 30'::character varying |  |
| 11 | assigned_rep | character varying | Y | - |  |
| 12 | status | character varying | Y | 'active'::character varying |  |
| 13 | tags | text | Y | - |  |
| 14 | contact_person | character varying | Y | - |  |
| 15 | tax_id | character varying | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | total_revenue | numeric | Y | 0 |  |
| 18 | created_at | timestamp with time zone | Y | now() |  |
| 19 | updated_at | timestamp with time zone | Y | now() |  |
| 20 | mobile | character varying | Y | - |  |
| 21 | fax | character varying | Y | - |  |
| 22 | website | character varying | Y | - |  |
| 23 | industry | character varying | Y | - |  |
| 24 | city | character varying | Y | - |  |
| 25 | country | character varying | Y | 'ישראל'::character varying |  |
| 26 | postal_code | character varying | Y | - |  |
| 27 | currency | character varying | Y | 'ILS'::character varying |  |
| 28 | source | character varying | Y | - |  |
| 29 | category | character varying | Y | 'רגיל'::character varying |  |
| 30 | credit_terms_days | integer | Y | 30 |  |
| 31 | discount_percent | numeric | Y | 0 |  |
| 32 | price_list_id | integer | Y | - |  |
| 33 | bank_name | character varying | Y | - |  |
| 34 | bank_branch | character varying | Y | - |  |
| 35 | bank_account | character varying | Y | - |  |
| 36 | shipping_address | text | Y | - |  |
| 37 | last_order_date | date | Y | - |  |
| 38 | last_payment_date | date | Y | - |  |
| 39 | total_orders | integer | Y | 0 |  |
| 40 | outstanding_balance | numeric | Y | 0 |  |
| 41 | risk_level | character varying | Y | 'low'::character varying |  |
| 42 | vat_exempt | boolean | Y | false |  |
| 43 | withholding_tax_rate | numeric | Y | 0 |  |
| 44 | secondary_contact | character varying | Y | - |  |
| 45 | secondary_phone | character varying | Y | - |  |
| 46 | secondary_email | character varying | Y | - |  |
| 47 | latitude | numeric | Y | - |  |
| 48 | longitude | numeric | Y | - |  |
| 49 | region | character varying | Y | - |  |
| 50 | payment_method | character varying | Y | - |  |
| 51 | annual_revenue | numeric | Y | 0 |  |
| 52 | num_employees | integer | Y | - |  |
| 53 | linkedin | character varying | Y | - |  |
| 54 | salesperson_id | integer | Y | - |  |
| 55 | customer_since | date | Y | - |  |
| 56 | last_purchase_date | date | Y | - |  |
| 57 | lifetime_value | numeric | Y | 0 |  |
| 58 | loyalty_tier | character varying | Y | 'standard'::character varying |  |
| 59 | shipping_address_separate | boolean | Y | false |  |
| 60 | preferred_delivery | character varying | Y | - |  |
| 61 | language_pref | character varying | Y | 'he'::character varying |  |
| 62 | communication_pref | character varying | Y | 'phone'::character varying |  |
| 63 | internal_notes | text | Y | - |  |
| 64 | company_size | character varying | Y | - |  |
| 65 | annual_revenue_estimate | numeric | Y | - |  |
| 66 | loyalty_points | integer | Y | 0 |  |
| 67 | acquisition_source | character varying | Y | - |  |
| 68 | acquisition_date | date | Y | - |  |
| 69 | churn_risk | character varying | Y | - |  |
| 70 | nps_score | integer | Y | - |  |
| 71 | total_purchases | numeric | Y | 0 |  |
| 72 | average_order_value | numeric | Y | - |  |
| 73 | preferred_contact_method | character varying | Y | - |  |
| 74 | do_not_call | boolean | Y | false |  |
| 75 | company_registration | text | Y | - |  |
| 76 | employee_count | integer | Y | - |  |
| 77 | year_established | integer | Y | - |  |
| 78 | website_url | text | Y | - |  |
| 79 | social_media | text | Y | - |  |
| 80 | referral_source | character varying | Y | - |  |
| 81 | referred_by | character varying | Y | - |  |
| 82 | acquisition_cost | numeric | Y | - |  |
| 83 | avg_order_value | numeric | Y | - |  |
| 84 | last_contact_date | date | Y | - |  |
| 85 | preferred_language | character varying | Y | 'he'::character varying |  |
| 86 | do_not_email | boolean | Y | false |  |
| 87 | satisfaction_score | numeric | Y | - |  |
| 88 | complaints_count | integer | Y | 0 |  |
| 89 | returns_count | integer | Y | 0 |  |
| 90 | blacklisted | boolean | Y | false |  |
| 91 | blacklist_reason | text | Y | - |  |
| 92 | photo_url | text | Y | - |  |
| 93 | documents_url | text | Y | - |  |
| 94 | company_name_en | character varying | Y | - |  |
| 95 | contact_title | character varying | Y | - |  |
| 96 | contact_first_name | character varying | Y | - |  |
| 97 | contact_last_name | character varying | Y | - |  |
| 98 | contact_department | character varying | Y | - |  |
| 99 | contact_role | character varying | Y | - |  |
| 100 | alternate_contact | character varying | Y | - |  |
| 101 | alternate_phone | character varying | Y | - |  |
| 102 | alternate_email | character varying | Y | - |  |
| 103 | shipping_city | character varying | Y | - |  |
| 104 | shipping_country | character varying | Y | - |  |
| 105 | shipping_zip | character varying | Y | - |  |
| 106 | billing_city | character varying | Y | - |  |
| 107 | billing_country | character varying | Y | - |  |
| 108 | billing_zip | character varying | Y | - |  |
| 109 | delivery_instructions | text | Y | - |  |
| 110 | preferred_delivery_time | character varying | Y | - |  |
| 111 | forklift_available | boolean | Y | false |  |
| 112 | crane_access | boolean | Y | false |  |
| 113 | site_restrictions | text | Y | - |  |
| 114 | gps_latitude | numeric | Y | - |  |
| 115 | gps_longitude | numeric | Y | - |  |
| 116 | gps_address | text | Y | - |  |
| 117 | waze_link | text | Y | - |  |
| 118 | credit_days | integer | Y | 30 |  |
| 119 | credit_used | numeric | Y | 0 |  |
| 120 | credit_available | numeric | Y | - |  |
| 121 | credit_rating | character varying | Y | - |  |
| 122 | credit_insurance | boolean | Y | false |  |
| 123 | credit_insurance_limit | numeric | Y | - |  |
| 124 | withholding_tax_certificate | text | Y | - |  |
| 125 | withholding_tax_valid_until | date | Y | - |  |
| 126 | vat_exempt_certificate | text | Y | - |  |
| 127 | average_payment_days | integer | Y | - |  |
| 128 | last_payment_amount | numeric | Y | - |  |
| 129 | total_overdue | numeric | Y | 0 |  |
| 130 | overdue_invoices_count | integer | Y | 0 |  |
| 131 | bounced_checks_count | integer | Y | 0 |  |
| 132 | price_list_name | character varying | Y | - |  |
| 133 | special_pricing_notes | text | Y | - |  |
| 134 | volume_discount_tier | character varying | Y | - |  |
| 135 | annual_contract | boolean | Y | false |  |
| 136 | contract_start_date | date | Y | - |  |
| 137 | contract_end_date | date | Y | - |  |
| 138 | contract_value | numeric | Y | - |  |
| 139 | preferred_products | text | Y | - |  |
| 140 | typical_order_size | character varying | Y | - |  |
| 141 | seasonal_pattern | text | Y | - |  |
| 142 | competitor_using | text | Y | - |  |
| 143 | marketing_consent | boolean | Y | true |  |
| 144 | last_campaign_date | date | Y | - |  |
| 145 | territory | character varying | Y | - |  |
| 146 | salesperson_name | character varying | Y | - |  |
| 147 | last_review_date | date | Y | - |  |
| 148 | next_review_date | date | Y | - |  |
| 149 | preferred_notification_channel | character varying | Y | 'whatsapp'::character varying |  |
| 150 | notification_opt_out | boolean | Y | false |  |

#### 231. `sales_invoice_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | invoice_id | uuid | Y | - |  |
| 3 | line_number | integer | Y | - |  |
| 4 | product_id | uuid | Y | - |  |
| 5 | description | text | Y | - |  |
| 6 | quantity | numeric | Y | - |  |
| 7 | unit | character varying | Y | - |  |
| 8 | unit_price | integer | Y | 0 |  |
| 9 | discount_percent | numeric | Y | 0 |  |
| 10 | tax_rate | numeric | Y | 18 |  |
| 11 | line_total | integer | Y | 0 |  |
| 12 | sales_order_item_id | uuid | Y | - |  |
| 13 | sort_order | integer | Y | 0 |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |

#### 232. `sales_invoice_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_invoice_lines_id_seq':... | 🔑 PK |
| 2 | invoice_id | integer | Y | - | FK → sales_invoices.id |
| 3 | product_name | character varying | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | quantity | numeric | Y | 1 |  |
| 6 | unit_price | numeric | Y | 0 |  |
| 7 | discount_percent | numeric | Y | 0 |  |
| 8 | line_total | numeric | Y | 0 |  |
| 9 | sort_order | integer | Y | 0 |  |
| 10 | product_id | integer | Y | - |  |
| 11 | product_sku | character varying | Y | - |  |
| 12 | unit | character varying | Y | 'יחידה'::character varying |  |
| 13 | width_mm | numeric | Y | - |  |
| 14 | height_mm | numeric | Y | - |  |
| 15 | area_sqm | numeric | Y | - |  |
| 16 | tax_rate | numeric | Y | 18 |  |
| 17 | tax_amount | numeric | Y | 0 |  |
| 18 | cost_price | numeric | Y | 0 |  |
| 19 | notes | text | Y | - |  |
| 20 | line_number | integer | Y | - |  |
| 21 | product_code | character varying | Y | - |  |
| 22 | uom | character varying | Y | 'יחידה'::character varying |  |
| 23 | discount_pct | numeric | Y | 0 |  |
| 24 | discount_amount | numeric | Y | 0 |  |
| 25 | margin_pct | numeric | Y | - |  |
| 26 | serial_number | character varying | Y | - |  |
| 27 | batch_number | character varying | Y | - |  |
| 28 | warehouse | character varying | Y | - |  |
| 29 | project_id | integer | Y | - |  |
| 30 | project_name | character varying | Y | - |  |
| 31 | tags | text | Y | - |  |

#### 233. `sales_invoices`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_invoices_id_seq'::regc... | 🔑 PK |
| 2 | invoice_number | character varying | Y | - | UNIQUE |
| 3 | customer_id | integer | Y | - | FK → sales_customers.id |
| 4 | customer_name | character varying | Y | - |  |
| 5 | sales_order_id | integer | Y | - | FK → sales_orders.id |
| 6 | invoice_date | date | Y | CURRENT_DATE |  |
| 7 | due_date | date | Y | - |  |
| 8 | status | character varying | Y | 'draft'::character varying |  |
| 9 | subtotal | numeric | Y | 0 |  |
| 10 | tax_amount | numeric | Y | 0 |  |
| 11 | total | numeric | Y | 0 |  |
| 12 | amount_paid | numeric | Y | 0 |  |
| 13 | notes | text | Y | - |  |
| 14 | created_by | character varying | Y | - |  |
| 15 | created_at | timestamp with time zone | Y | now() |  |
| 16 | updated_at | timestamp with time zone | Y | now() |  |
| 17 | invoice_type | character varying | Y | 'tax'::character varying |  |
| 18 | payment_date | date | Y | - |  |
| 19 | line_items_json | text | Y | - |  |
| 20 | discount_amount | numeric | Y | 0 |  |
| 21 | payment_status | character varying | Y | 'draft'::character varying |  |
| 22 | payment_method | character varying | Y | - |  |
| 23 | bank_ref | character varying | Y | - |  |
| 24 | currency | character varying | Y | 'ILS'::character varying |  |
| 25 | exchange_rate | numeric | Y | 1 |  |
| 26 | po_reference | character varying | Y | - |  |
| 27 | contract_ref | character varying | Y | - |  |
| 28 | einvoice_xml | text | Y | - |  |
| 29 | customer_address | text | Y | - |  |
| 30 | customer_tax_id | character varying | Y | - |  |
| 31 | customer_contact | character varying | Y | - |  |
| 32 | customer_phone | character varying | Y | - |  |
| 33 | customer_email | character varying | Y | - |  |
| 34 | vat_rate | numeric | Y | 18 |  |
| 35 | vat_amount | numeric | Y | 0 |  |
| 36 | before_vat | numeric | Y | 0 |  |
| 37 | balance_due | numeric | Y | 0 |  |
| 38 | payment_terms | character varying | Y | - |  |
| 39 | salesperson | character varying | Y | - |  |
| 40 | salesperson_id | integer | Y | - |  |
| 41 | project_id | integer | Y | - |  |
| 42 | project_name | character varying | Y | - |  |
| 43 | cost_center | character varying | Y | - |  |
| 44 | delivery_address | text | Y | - |  |
| 45 | delivery_date | date | Y | - |  |
| 46 | internal_notes | text | Y | - |  |
| 47 | cancellation_reason | text | Y | - |  |
| 48 | credit_note_id | integer | Y | - |  |
| 49 | original_invoice_id | integer | Y | - |  |
| 50 | is_credit_note | boolean | Y | false |  |
| 51 | withholding_tax_rate | numeric | Y | 0 |  |
| 52 | withholding_tax_amount | numeric | Y | 0 |  |
| 53 | rounding_amount | numeric | Y | 0 |  |
| 54 | sent_at | timestamp with time zone | Y | - |  |
| 55 | paid_at | timestamp with time zone | Y | - |  |
| 56 | approved_by | character varying | Y | - |  |
| 57 | approved_at | timestamp with time zone | Y | - |  |
| 58 | deposit_invoice | boolean | Y | false |  |
| 59 | final_invoice | boolean | Y | false |  |
| 60 | recurring | boolean | Y | false |  |
| 61 | recurring_period | character varying | Y | - |  |
| 62 | digital_signature | text | Y | - |  |
| 63 | qr_code_url | text | Y | - |  |
| 64 | original_order_id | integer | Y | - |  |
| 65 | payment_reference | character varying | Y | - |  |
| 66 | payment_bank | character varying | Y | - |  |
| 67 | discount_pct | numeric | Y | - |  |
| 68 | total_amount | numeric | Y | 0 |  |
| 69 | overdue | boolean | Y | false |  |
| 70 | overdue_days | integer | Y | 0 |  |
| 71 | dunning_level | integer | Y | 0 |  |
| 72 | last_dunning_date | date | Y | - |  |
| 73 | credit_note_amount | numeric | Y | 0 |  |
| 74 | sent_to_customer | boolean | Y | false |  |
| 75 | sent_date | date | Y | - |  |
| 76 | sent_method | character varying | Y | - |  |
| 77 | receipt_confirmed | boolean | Y | false |  |
| 78 | receipt_date | date | Y | - |  |
| 79 | documents_url | text | Y | - |  |
| 80 | tags | text | Y | - |  |

#### 234. `sales_order_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_order_items_id_seq'::r... | 🔑 PK |
| 2 | order_id | integer | N | - | FK → sales_orders.id |
| 3 | material_id | integer | Y | - |  |
| 4 | product_code | text | Y | - |  |
| 5 | product_name | text | N | - |  |
| 6 | quantity | numeric | N | 1 |  |
| 7 | unit | text | Y | 'יחידה'::text |  |
| 8 | unit_price | numeric | N | 0 |  |
| 9 | discount_percent | numeric | Y | 0 |  |
| 10 | vat_percent | numeric | Y | 18 |  |
| 11 | total_price | numeric | N | 0 |  |
| 12 | delivered_quantity | numeric | Y | 0 |  |
| 13 | reserved_quantity | numeric | Y | 0 |  |
| 14 | notes | text | Y | - |  |
| 15 | created_at | timestamp without time zone | N | now() |  |

#### 235. `sales_order_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_order_lines_id_seq'::r... | 🔑 PK |
| 2 | order_id | integer | Y | - | FK → sales_orders.id |
| 3 | product_name | character varying | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | quantity | numeric | Y | 1 |  |
| 6 | unit_price | numeric | Y | 0 |  |
| 7 | discount_percent | numeric | Y | 0 |  |
| 8 | line_total | numeric | Y | 0 |  |
| 9 | sort_order | integer | Y | 0 |  |
| 10 | product_id | integer | Y | - |  |
| 11 | product_sku | character varying | Y | - |  |
| 12 | unit | character varying | Y | 'יחידה'::character varying |  |
| 13 | width_mm | numeric | Y | - |  |
| 14 | height_mm | numeric | Y | - |  |
| 15 | length_mm | numeric | Y | - |  |
| 16 | area_sqm | numeric | Y | - |  |
| 17 | weight_kg | numeric | Y | - |  |
| 18 | material_type | character varying | Y | - |  |
| 19 | glass_type | character varying | Y | - |  |
| 20 | glass_thickness | character varying | Y | - |  |
| 21 | frame_color | character varying | Y | - |  |
| 22 | frame_profile | character varying | Y | - |  |
| 23 | opening_type | character varying | Y | - |  |
| 24 | opening_direction | character varying | Y | - |  |
| 25 | handle_type | character varying | Y | - |  |
| 26 | lock_type | character varying | Y | - |  |
| 27 | hardware_details | text | Y | - |  |
| 28 | tax_rate | numeric | Y | 18 |  |
| 29 | tax_amount | numeric | Y | 0 |  |
| 30 | cost_price | numeric | Y | 0 |  |
| 31 | profit_margin | numeric | Y | - |  |
| 32 | delivery_date | date | Y | - |  |
| 33 | status | character varying | Y | 'pending'::character varying |  |
| 34 | production_status | character varying | Y | 'pending'::character varying |  |
| 35 | work_order_id | integer | Y | - |  |
| 36 | bom_id | integer | Y | - |  |
| 37 | location_name | character varying | Y | - |  |
| 38 | floor_number | character varying | Y | - |  |
| 39 | room_name | character varying | Y | - |  |
| 40 | installation_notes | text | Y | - |  |
| 41 | drawing_url | text | Y | - |  |
| 42 | image_url | text | Y | - |  |
| 43 | measurement_notes | text | Y | - |  |
| 44 | custom_specs | text | Y | - |  |
| 45 | panels_count | integer | Y | 1 |  |
| 46 | warranty_months | integer | Y | - |  |
| 47 | notes | text | Y | - |  |
| 48 | line_number | integer | Y | - |  |
| 49 | customer_item_ref | character varying | Y | - |  |
| 50 | color_code | character varying | Y | - |  |
| 51 | color_name | character varying | Y | - |  |
| 52 | finish_type | character varying | Y | - |  |
| 53 | sealant_type | character varying | Y | - |  |
| 54 | mosquito_net | boolean | Y | false |  |
| 55 | mosquito_net_type | character varying | Y | - |  |
| 56 | shutter_type | character varying | Y | - |  |
| 57 | shutter_color | character varying | Y | - |  |
| 58 | threshold_type | character varying | Y | - |  |
| 59 | sill_type | character varying | Y | - |  |
| 60 | glass_coating | character varying | Y | - |  |
| 61 | spacer_type | character varying | Y | - |  |
| 62 | gas_fill | character varying | Y | - |  |
| 63 | u_value | numeric | Y | - |  |
| 64 | shgc | numeric | Y | - |  |
| 65 | acoustic_rating | character varying | Y | - |  |
| 66 | fire_rating | character varying | Y | - |  |
| 67 | burglar_resistance | character varying | Y | - |  |
| 68 | wind_load_rating | character varying | Y | - |  |
| 69 | water_tightness | character varying | Y | - |  |
| 70 | air_permeability | character varying | Y | - |  |
| 71 | si_standard | character varying | Y | - |  |
| 72 | ce_marking | boolean | Y | false |  |
| 73 | produced_qty | numeric | Y | 0 |  |
| 74 | delivered_qty | numeric | Y | 0 |  |
| 75 | installed_qty | numeric | Y | 0 |  |
| 76 | rejected_qty | numeric | Y | 0 |  |
| 77 | production_start_date | date | Y | - |  |
| 78 | production_end_date | date | Y | - |  |
| 79 | quality_check_status | character varying | Y | - |  |
| 80 | quality_check_date | date | Y | - |  |
| 81 | quality_check_by | character varying | Y | - |  |
| 82 | delivery_date_actual | date | Y | - |  |
| 83 | installation_date | date | Y | - |  |
| 84 | installation_by | character varying | Y | - |  |
| 85 | installation_status | character varying | Y | - |  |
| 86 | installation_approved | boolean | Y | false |  |
| 87 | warranty_start | date | Y | - |  |
| 88 | warranty_end | date | Y | - |  |
| 89 | tags | text | Y | - |  |

#### 236. `sales_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_orders_id_seq'::regclass) | 🔑 PK |
| 2 | order_number | character varying | Y | - | UNIQUE |
| 3 | customer_id | integer | Y | - | FK → sales_customers.id |
| 4 | customer_name | character varying | Y | - |  |
| 5 | order_date | date | Y | CURRENT_DATE |  |
| 6 | delivery_date | date | Y | - |  |
| 7 | status | character varying | Y | 'draft'::character varying |  |
| 8 | notes | text | Y | - |  |
| 9 | subtotal | numeric | Y | 0 |  |
| 10 | discount_amount | numeric | Y | 0 |  |
| 11 | tax_amount | numeric | Y | 0 |  |
| 12 | total | numeric | Y | 0 |  |
| 13 | paid_amount | numeric | Y | 0 |  |
| 14 | payment_status | character varying | Y | 'unpaid'::character varying |  |
| 15 | created_by | character varying | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |
| 18 | quote_id | integer | Y | - |  |
| 19 | priority | character varying | Y | 'normal'::character varying |  |
| 20 | shipping_method | character varying | Y | - |  |
| 21 | shipping_address | text | Y | - |  |
| 22 | warehouse | character varying | Y | - |  |
| 23 | currency | character varying | Y | 'ILS'::character varying |  |
| 24 | payment_method | character varying | Y | - |  |
| 25 | delivery_terms | character varying | Y | - |  |
| 26 | salesperson | character varying | Y | - |  |
| 27 | commission_rate | numeric | Y | 0 |  |
| 28 | approval_status | character varying | Y | 'pending'::character varying |  |
| 29 | approved_by | character varying | Y | - |  |
| 30 | approved_at | timestamp with time zone | Y | - |  |
| 31 | cancelled_reason | text | Y | - |  |
| 32 | internal_notes | text | Y | - |  |
| 33 | reference_number | character varying | Y | - |  |
| 34 | project_id | integer | Y | - |  |
| 35 | cost_center | character varying | Y | - |  |
| 36 | department | character varying | Y | - |  |
| 37 | expected_revenue | numeric | Y | 0 |  |
| 38 | profit_margin | numeric | Y | - |  |
| 39 | warranty_terms | text | Y | - |  |
| 40 | contract_number | character varying | Y | - |  |
| 41 | po_number | character varying | Y | - |  |
| 42 | source_channel | character varying | Y | 'direct'::character varying |  |
| 43 | requested_delivery | date | Y | - |  |
| 44 | actual_delivery | date | Y | - |  |
| 45 | salesperson_id | integer | Y | - |  |
| 46 | order_source | character varying | Y | - |  |
| 47 | line_items_json | text | Y | - |  |
| 48 | shipping_cost | numeric | Y | 0 |  |
| 49 | invoice_id | integer | Y | - |  |
| 50 | delivery_note_id | integer | Y | - |  |
| 51 | return_status | character varying | Y | - |  |
| 52 | profit_margin_pct | numeric | Y | - |  |
| 53 | order_type | character varying | Y | 'standard'::character varying |  |
| 54 | customer_po_number | character varying | Y | - |  |
| 55 | customer_contact | character varying | Y | - |  |
| 56 | customer_phone | character varying | Y | - |  |
| 57 | customer_email | character varying | Y | - |  |
| 58 | billing_address | text | Y | - |  |
| 59 | billing_city | character varying | Y | - |  |
| 60 | installation_required | boolean | Y | false |  |
| 61 | installation_date | date | Y | - |  |
| 62 | installation_address | text | Y | - |  |
| 63 | installation_city | character varying | Y | - |  |
| 64 | installation_contact | character varying | Y | - |  |
| 65 | installation_phone | character varying | Y | - |  |
| 66 | installation_notes | text | Y | - |  |
| 67 | installation_team | character varying | Y | - |  |
| 68 | measurement_date | date | Y | - |  |
| 69 | measurement_by | character varying | Y | - |  |
| 70 | measurement_notes | text | Y | - |  |
| 71 | measurement_status | character varying | Y | - |  |
| 72 | production_status | character varying | Y | 'pending'::character varying |  |
| 73 | production_start_date | date | Y | - |  |
| 74 | production_end_date | date | Y | - |  |
| 75 | production_notes | text | Y | - |  |
| 76 | quality_check_status | character varying | Y | - |  |
| 77 | quality_check_date | date | Y | - |  |
| 78 | quality_check_by | character varying | Y | - |  |
| 79 | packaging_status | character varying | Y | - |  |
| 80 | shipping_status | character varying | Y | - |  |
| 81 | tracking_number | character varying | Y | - |  |
| 82 | shipped_date | date | Y | - |  |
| 83 | delivered_date | date | Y | - |  |
| 84 | delivery_confirmed | boolean | Y | false |  |
| 85 | delivery_signature_url | text | Y | - |  |
| 86 | warranty_start_date | date | Y | - |  |
| 87 | warranty_end_date | date | Y | - |  |
| 88 | total_weight_kg | numeric | Y | - |  |
| 89 | total_area_sqm | numeric | Y | - |  |
| 90 | deposit_required | boolean | Y | false |  |
| 91 | deposit_amount | numeric | Y | 0 |  |
| 92 | deposit_paid | boolean | Y | false |  |
| 93 | deposit_date | date | Y | - |  |
| 94 | credit_note_id | integer | Y | - |  |
| 95 | complaint_count | integer | Y | 0 |  |
| 96 | return_count | integer | Y | 0 |  |
| 97 | customer_satisfaction | integer | Y | - |  |
| 98 | customer_reference | text | Y | - |  |
| 99 | delivery_method | character varying | Y | - |  |
| 100 | freight_cost | numeric | Y | 0 |  |
| 101 | insurance_cost | numeric | Y | 0 |  |
| 102 | packaging_cost | numeric | Y | 0 |  |
| 103 | installation_cost | numeric | Y | 0 |  |
| 104 | warranty_months | integer | Y | 12 |  |
| 105 | warranty_start | date | Y | - |  |
| 106 | warranty_end | date | Y | - |  |
| 107 | signed_contract_url | text | Y | - |  |
| 108 | tags | text | Y | - |  |
| 109 | site_address | text | Y | - |  |
| 110 | site_contact | character varying | Y | - |  |
| 111 | site_phone | character varying | Y | - |  |
| 112 | gps_coordinates | character varying | Y | - |  |
| 113 | building_type | character varying | Y | - |  |
| 114 | floor_count | integer | Y | - |  |
| 115 | architect_name | character varying | Y | - |  |
| 116 | architect_phone | character varying | Y | - |  |
| 117 | contractor_name | character varying | Y | - |  |
| 118 | contractor_phone | character varying | Y | - |  |
| 119 | measurement_required | boolean | Y | false |  |
| 120 | measurement_approved | boolean | Y | false |  |
| 121 | material_type | character varying | Y | - |  |
| 122 | frame_color | character varying | Y | - |  |
| 123 | glass_type | character varying | Y | - |  |
| 124 | standard_compliance | character varying | Y | - |  |
| 125 | total_units_count | integer | Y | 0 |  |
| 126 | total_linear_m | numeric | Y | - |  |
| 127 | invoice_number | character varying | Y | - |  |
| 128 | invoiced | boolean | Y | false |  |
| 129 | invoiced_date | date | Y | - |  |
| 130 | invoiced_amount | numeric | Y | 0 |  |
| 131 | balance_due | numeric | Y | 0 |  |
| 132 | overdue | boolean | Y | false |  |
| 133 | overdue_days | integer | Y | 0 |  |
| 134 | collection_status | character varying | Y | - |  |
| 135 | last_reminder_date | date | Y | - |  |
| 136 | reminders_sent | integer | Y | 0 |  |
| 137 | documents_url | text | Y | - |  |
| 138 | photos_url | text | Y | - |  |
| 139 | version_number | integer | Y | 1 |  |
| 140 | print_count | integer | Y | 0 |  |
| 141 | last_printed_at | timestamp with time zone | Y | - |  |
| 142 | email_count | integer | Y | 0 |  |
| 143 | last_emailed_at | timestamp with time zone | Y | - |  |
| 144 | preferred_notification_channel | character varying | Y | 'whatsapp'::character varying |  |
| 145 | notification_opt_out | boolean | Y | false |  |

#### 237. `sales_price_list_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_price_list_items_id_se... | 🔑 PK |
| 2 | price_list_id | integer | Y | - | FK → sales_price_lists.id |
| 3 | product_name | character varying | N | - |  |
| 4 | sku | character varying | Y | - |  |
| 5 | base_price | numeric | Y | 0 |  |
| 6 | discounted_price | numeric | Y | 0 |  |
| 7 | min_quantity | integer | Y | 1 |  |
| 8 | sort_order | integer | Y | 0 |  |
| 9 | unit | character varying | Y | 'יחידה'::character varying |  |
| 10 | category | character varying | Y | - |  |
| 11 | cost_price | numeric | Y | 0 |  |
| 12 | markup_percent | numeric | Y | - |  |
| 13 | margin_percent | numeric | Y | - |  |
| 14 | max_quantity | integer | Y | - |  |
| 15 | price_per_sqm | numeric | Y | - |  |
| 16 | price_per_meter | numeric | Y | - |  |
| 17 | effective_from | date | Y | - |  |
| 18 | effective_to | date | Y | - |  |
| 19 | notes | text | Y | - |  |
| 20 | product_id | integer | Y | - |  |
| 21 | is_active | boolean | Y | true |  |
| 22 | product_code | character varying | Y | - |  |
| 23 | material_type | character varying | Y | - |  |
| 24 | frame_type | character varying | Y | - |  |
| 25 | glass_type | character varying | Y | - |  |
| 26 | color | character varying | Y | - |  |
| 27 | uom | character varying | Y | 'יחידה'::character varying |  |
| 28 | price_per_unit | numeric | Y | - |  |
| 29 | price_per_linear_m | numeric | Y | - |  |
| 30 | margin_pct | numeric | Y | - |  |
| 31 | min_price | numeric | Y | - |  |
| 32 | max_discount_pct | numeric | Y | - |  |
| 33 | volume_break_1_qty | numeric | Y | - |  |
| 34 | volume_break_1_price | numeric | Y | - |  |
| 35 | volume_break_2_qty | numeric | Y | - |  |
| 36 | volume_break_2_price | numeric | Y | - |  |
| 37 | volume_break_3_qty | numeric | Y | - |  |
| 38 | volume_break_3_price | numeric | Y | - |  |
| 39 | effective_date | date | Y | - |  |
| 40 | expiry_date | date | Y | - |  |
| 41 | created_at | timestamp with time zone | Y | now() |  |
| 42 | updated_at | timestamp with time zone | Y | now() |  |
| 43 | tags | text | Y | - |  |

#### 238. `sales_price_lists`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_price_lists_id_seq'::r... | 🔑 PK |
| 2 | list_number | character varying | Y | - | UNIQUE |
| 3 | name | character varying | N | - |  |
| 4 | currency | character varying | Y | 'ILS'::character varying |  |
| 5 | valid_from | date | Y | - |  |
| 6 | valid_to | date | Y | - |  |
| 7 | customer_group | character varying | Y | - |  |
| 8 | status | character varying | Y | 'active'::character varying |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp with time zone | Y | now() |  |
| 11 | updated_at | timestamp with time zone | Y | now() |  |
| 12 | description | text | Y | - |  |
| 13 | price_list_type | character varying | Y | 'retail'::character varying |  |
| 14 | priority | integer | Y | 0 |  |
| 15 | discount_percent | numeric | Y | 0 |  |
| 16 | min_order_amount | numeric | Y | - |  |
| 17 | max_discount_percent | numeric | Y | - |  |
| 18 | customer_id | integer | Y | - |  |
| 19 | approved_by | character varying | Y | - |  |
| 20 | approved_at | timestamp with time zone | Y | - |  |
| 21 | created_by | character varying | Y | - |  |
| 22 | is_default | boolean | Y | false |  |
| 23 | includes_vat | boolean | Y | false |  |
| 24 | price_list_code | character varying | Y | - |  |
| 25 | price_list_name | character varying | Y | - |  |
| 26 | customer_name | character varying | Y | - |  |
| 27 | region | character varying | Y | - |  |
| 28 | effective_date | date | Y | - |  |
| 29 | expiry_date | date | Y | - |  |
| 30 | discount_pct | numeric | Y | 0 |  |
| 31 | markup_pct | numeric | Y | - |  |
| 32 | includes_installation | boolean | Y | false |  |
| 33 | includes_delivery | boolean | Y | false |  |
| 34 | payment_terms | character varying | Y | - |  |
| 35 | approval_required | boolean | Y | false |  |
| 36 | revision | integer | Y | 1 |  |
| 37 | supersedes_id | integer | Y | - |  |
| 38 | item_count | integer | Y | 0 |  |
| 39 | is_active | boolean | Y | true |  |
| 40 | updated_by | character varying | Y | - |  |
| 41 | documents_url | text | Y | - |  |
| 42 | tags | text | Y | - |  |

#### 239. `sales_quotation_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_quotation_lines_id_seq... | 🔑 PK |
| 2 | quotation_id | integer | Y | - | FK → sales_quotations.id |
| 3 | product_name | character varying | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | quantity | numeric | Y | 1 |  |
| 6 | unit_price | numeric | Y | 0 |  |
| 7 | discount_percent | numeric | Y | 0 |  |
| 8 | line_total | numeric | Y | 0 |  |
| 9 | sort_order | integer | Y | 0 |  |
| 10 | product_id | integer | Y | - |  |
| 11 | product_sku | character varying | Y | - |  |
| 12 | unit | character varying | Y | 'יחידה'::character varying |  |
| 13 | width_mm | numeric | Y | - |  |
| 14 | height_mm | numeric | Y | - |  |
| 15 | area_sqm | numeric | Y | - |  |
| 16 | material_type | character varying | Y | - |  |
| 17 | glass_type | character varying | Y | - |  |
| 18 | frame_color | character varying | Y | - |  |
| 19 | opening_type | character varying | Y | - |  |
| 20 | handle_type | character varying | Y | - |  |
| 21 | tax_rate | numeric | Y | 18 |  |
| 22 | tax_amount | numeric | Y | 0 |  |
| 23 | cost_price | numeric | Y | 0 |  |
| 24 | profit_margin | numeric | Y | - |  |
| 25 | custom_specs | text | Y | - |  |
| 26 | drawing_url | text | Y | - |  |
| 27 | notes | text | Y | - |  |
| 28 | location_name | character varying | Y | - |  |
| 29 | image_url | text | Y | - |  |
| 30 | line_number | integer | Y | - |  |
| 31 | product_code | character varying | Y | - |  |
| 32 | frame_type | character varying | Y | - |  |
| 33 | color | character varying | Y | - |  |
| 34 | linear_m | numeric | Y | - |  |
| 35 | uom | character varying | Y | 'יחידה'::character varying |  |
| 36 | discount_pct | numeric | Y | 0 |  |
| 37 | discount_amount | numeric | Y | 0 |  |
| 38 | margin_pct | numeric | Y | - |  |
| 39 | delivery_days | integer | Y | - |  |
| 40 | specifications | text | Y | - |  |
| 41 | installation_included | boolean | Y | false |  |
| 42 | installation_cost | numeric | Y | - |  |
| 43 | warranty_months | integer | Y | 12 |  |
| 44 | tags | text | Y | - |  |
| 45 | hardware_type | character varying | Y | - |  |
| 46 | mosquito_net | boolean | Y | false |  |
| 47 | shutter_type | character varying | Y | - |  |
| 48 | sill_type | character varying | Y | - |  |

#### 240. `sales_quotations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_quotations_id_seq'::re... | 🔑 PK |
| 2 | quote_number | character varying | Y | - | UNIQUE |
| 3 | customer_id | integer | Y | - | FK → sales_customers.id |
| 4 | customer_name | character varying | Y | - |  |
| 5 | quote_date | date | Y | CURRENT_DATE |  |
| 6 | valid_until | date | Y | - |  |
| 7 | status | character varying | Y | 'draft'::character varying |  |
| 8 | notes | text | Y | - |  |
| 9 | subtotal | numeric | Y | 0 |  |
| 10 | tax_amount | numeric | Y | 0 |  |
| 11 | total | numeric | Y | 0 |  |
| 12 | converted_order_id | integer | Y | - |  |
| 13 | created_by | character varying | Y | - |  |
| 14 | created_at | timestamp with time zone | Y | now() |  |
| 15 | updated_at | timestamp with time zone | Y | now() |  |
| 16 | customer_contact | character varying | Y | - |  |
| 17 | customer_phone | character varying | Y | - |  |
| 18 | customer_email | character varying | Y | - |  |
| 19 | customer_address | text | Y | - |  |
| 20 | quote_type | character varying | Y | 'standard'::character varying |  |
| 21 | priority | character varying | Y | 'normal'::character varying |  |
| 22 | salesperson | character varying | Y | - |  |
| 23 | salesperson_id | integer | Y | - |  |
| 24 | commission_rate | numeric | Y | 0 |  |
| 25 | discount_amount | numeric | Y | 0 |  |
| 26 | discount_percent | numeric | Y | 0 |  |
| 27 | currency | character varying | Y | 'ILS'::character varying |  |
| 28 | payment_terms | character varying | Y | - |  |
| 29 | delivery_terms | character varying | Y | - |  |
| 30 | delivery_date | date | Y | - |  |
| 31 | installation_required | boolean | Y | false |  |
| 32 | installation_address | text | Y | - |  |
| 33 | measurement_required | boolean | Y | false |  |
| 34 | measurement_date | date | Y | - |  |
| 35 | measurement_by | character varying | Y | - |  |
| 36 | revision_number | integer | Y | 0 |  |
| 37 | previous_quote_id | integer | Y | - |  |
| 38 | converted_to_order | boolean | Y | false |  |
| 39 | conversion_date | date | Y | - |  |
| 40 | rejection_reason | text | Y | - |  |
| 41 | follow_up_date | date | Y | - |  |
| 42 | follow_up_notes | text | Y | - |  |
| 43 | approved_by | character varying | Y | - |  |
| 44 | approved_at | timestamp with time zone | Y | - |  |
| 45 | warranty_terms | text | Y | - |  |
| 46 | project_name | character varying | Y | - |  |
| 47 | project_id | integer | Y | - |  |
| 48 | reference_number | character varying | Y | - |  |
| 49 | cost_center | character varying | Y | - |  |
| 50 | internal_notes | text | Y | - |  |
| 51 | total_area_sqm | numeric | Y | - |  |
| 52 | total_weight_kg | numeric | Y | - |  |
| 53 | deposit_required | boolean | Y | false |  |
| 54 | deposit_percent | numeric | Y | 0 |  |
| 55 | deposit_amount | numeric | Y | 0 |  |
| 56 | line_items_json | text | Y | - |  |
| 57 | sent_at | timestamp with time zone | Y | - |  |
| 58 | viewed_at | timestamp with time zone | Y | - |  |
| 59 | responded_at | timestamp with time zone | Y | - |  |
| 60 | quotation_number | character varying | Y | - |  |
| 61 | customer_po_reference | character varying | Y | - |  |
| 62 | delivery_method | character varying | Y | - |  |
| 63 | freight_cost | numeric | Y | 0 |  |
| 64 | insurance_cost | numeric | Y | 0 |  |
| 65 | installation_cost | numeric | Y | 0 |  |
| 66 | warranty_months | integer | Y | 12 |  |
| 67 | payment_schedule | text | Y | - |  |
| 68 | margin_pct | numeric | Y | - |  |
| 69 | competitor_quote | numeric | Y | - |  |
| 70 | competitor_name | character varying | Y | - |  |
| 71 | win_probability | numeric | Y | - |  |
| 72 | lost_reason | text | Y | - |  |
| 73 | lost_to_competitor | character varying | Y | - |  |
| 74 | signed_url | text | Y | - |  |
| 75 | photos_url | text | Y | - |  |
| 76 | documents_url | text | Y | - |  |
| 77 | tags | text | Y | - |  |
| 78 | site_address | text | Y | - |  |
| 79 | site_contact | character varying | Y | - |  |
| 80 | site_phone | character varying | Y | - |  |
| 81 | gps_coordinates | character varying | Y | - |  |
| 82 | building_type | character varying | Y | - |  |
| 83 | floor_count | integer | Y | - |  |
| 84 | architect_name | character varying | Y | - |  |
| 85 | architect_phone | character varying | Y | - |  |
| 86 | contractor_name | character varying | Y | - |  |
| 87 | contractor_phone | character varying | Y | - |  |
| 88 | measurement_notes | text | Y | - |  |
| 89 | material_type | character varying | Y | - |  |
| 90 | frame_color | character varying | Y | - |  |
| 91 | glass_type | character varying | Y | - |  |
| 92 | opening_type | character varying | Y | - |  |
| 93 | hardware_spec | text | Y | - |  |
| 94 | standard_compliance | character varying | Y | - |  |
| 95 | energy_rating | character varying | Y | - |  |
| 96 | fire_rating | character varying | Y | - |  |
| 97 | acoustic_rating | character varying | Y | - |  |
| 98 | production_estimate_days | integer | Y | - |  |
| 99 | installation_estimate_days | integer | Y | - |  |
| 100 | total_units_count | integer | Y | 0 |  |
| 101 | total_linear_m | numeric | Y | - |  |
| 102 | approval_required | boolean | Y | false |  |
| 103 | converted_at | timestamp with time zone | Y | - |  |
| 104 | expiry_reminder_sent | boolean | Y | false |  |
| 105 | version_number | integer | Y | 1 |  |
| 106 | previous_version_id | integer | Y | - |  |
| 107 | print_count | integer | Y | 0 |  |
| 108 | last_printed_at | timestamp with time zone | Y | - |  |
| 109 | email_count | integer | Y | 0 |  |
| 110 | last_emailed_at | timestamp with time zone | Y | - |  |

#### 241. `sales_return_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | return_id | uuid | Y | - |  |
| 3 | product_id | uuid | Y | - |  |
| 4 | quantity | numeric | Y | - |  |
| 5 | unit_price | integer | Y | 0 |  |
| 6 | reason | text | Y | - |  |
| 7 | condition | character varying | Y | - |  |
| 8 | notes | text | Y | - |  |
| 9 | sort_order | integer | Y | 0 |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |

#### 242. `sales_returns`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_returns_id_seq'::regcl... | 🔑 PK |
| 2 | return_number | character varying | Y | - | UNIQUE |
| 3 | sales_order_id | integer | Y | - |  |
| 4 | customer_id | integer | Y | - |  |
| 5 | return_date | date | Y | CURRENT_DATE |  |
| 6 | status | character varying | Y | 'requested'::character varying |  |
| 7 | reason | character varying | Y | 'other'::character varying |  |
| 8 | description | text | Y | - |  |
| 9 | refund_amount | integer | Y | 0 |  |
| 10 | refund_method | character varying | Y | 'credit_note'::character varying |  |
| 11 | credit_note_id | integer | Y | - |  |
| 12 | approved_by | integer | Y | - |  |
| 13 | notes | text | Y | - |  |
| 14 | is_active | boolean | Y | true |  |
| 15 | created_by | integer | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |

#### 243. `sales_tickets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('sales_tickets_id_seq'::regcl... | 🔑 PK |
| 2 | ticket_number | character varying | Y | - |  |
| 3 | customer_id | integer | Y | - |  |
| 4 | customer_name | character varying | Y | - |  |
| 5 | subject | text | N | - |  |
| 6 | description | text | Y | - |  |
| 7 | category | character varying | Y | 'general'::character varying |  |
| 8 | priority | character varying | Y | 'medium'::character varying |  |
| 9 | status | character varying | Y | 'open'::character varying |  |
| 10 | assigned_to | character varying | Y | - |  |
| 11 | resolution | text | Y | - |  |
| 12 | resolution_hours | numeric | Y | - |  |
| 13 | created_at | timestamp with time zone | Y | now() |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |
| 15 | closed_at | timestamp with time zone | Y | - |  |
| 16 | sla_breach | boolean | Y | false |  |

#### 244. `supplier_invoices`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_invoices_id_seq'::r... | 🔑 PK |
| 2 | invoice_number | character varying | Y | - | UNIQUE |
| 3 | invoice_type | character varying | Y | 'tax_invoice'::character varying |  |
| 4 | invoice_date | date | Y | CURRENT_DATE |  |
| 5 | due_date | date | Y | - |  |
| 6 | supplier_name | character varying | Y | - |  |
| 7 | supplier_tax_id | character varying | Y | - |  |
| 8 | status | character varying | Y | 'draft'::character varying |  |
| 9 | currency | character varying | Y | 'ILS'::character varying |  |
| 10 | subtotal | numeric | Y | 0 |  |
| 11 | discount_amount | numeric | Y | 0 |  |
| 12 | before_vat | numeric | Y | 0 |  |
| 13 | vat_rate | numeric | Y | 18 |  |
| 14 | vat_amount | numeric | Y | 0 |  |
| 15 | total_amount | numeric | Y | 0 |  |
| 16 | amount_paid | numeric | Y | 0 |  |
| 17 | balance_due | numeric | Y | - |  |
| 18 | payment_terms | character varying | Y | 'net_30'::character varying |  |
| 19 | payment_method | character varying | Y | - |  |
| 20 | po_number | character varying | Y | - |  |
| 21 | item_description | text | Y | - |  |
| 22 | notes | text | Y | - |  |
| 23 | created_by | integer | Y | - |  |
| 24 | created_by_name | character varying | Y | - |  |
| 25 | created_at | timestamp without time zone | Y | now() |  |
| 26 | updated_at | timestamp without time zone | Y | now() |  |
| 27 | line_items_json | text | Y | - |  |
| 28 | bank_ref | character varying | Y | - |  |
| 29 | contract_ref | character varying | Y | - |  |
| 30 | einvoice_xml | text | Y | - |  |
| 31 | exchange_rate | numeric | Y | 1 |  |
| 32 | payment_date | date | Y | - |  |
| 33 | purchase_order_number | character varying | Y | - |  |
| 34 | goods_receipt_number | character varying | Y | - |  |
| 35 | bank_account | character varying | Y | - |  |
| 36 | check_number | character varying | Y | - |  |
| 37 | withholding_tax_pct | numeric | Y | - |  |
| 38 | withholding_tax_amount | numeric | Y | - |  |
| 39 | approved_by | character varying | Y | - |  |
| 40 | approved_at | timestamp without time zone | Y | - |  |
| 41 | three_way_match | boolean | Y | false |  |
| 42 | dispute_reason | text | Y | - |  |
| 43 | dispute_status | character varying | Y | - |  |
| 44 | scan_url | text | Y | - |  |
| 45 | ocr_processed | boolean | Y | false |  |
| 46 | supplier_invoice_number | character varying | Y | - |  |
| 47 | supplier_id | integer | Y | - |  |
| 48 | purchase_order_id | integer | Y | - |  |
| 49 | goods_receipt_id | integer | Y | - |  |
| 50 | match_status | character varying | Y | - |  |
| 51 | discount_pct | numeric | Y | - |  |
| 52 | scheduled_payment_date | date | Y | - |  |
| 53 | payment_reference | character varying | Y | - |  |
| 54 | approval_required | boolean | Y | true |  |
| 55 | dispute | boolean | Y | false |  |
| 56 | documents_url | text | Y | - |  |
| 57 | tags | text | Y | - |  |
| 58 | received_date | date | Y | - |  |
| 59 | withholding_tax_rate | numeric | Y | - |  |
| 60 | net_payable | numeric | Y | - |  |
| 61 | amount_foreign | numeric | Y | - |  |
| 62 | three_way_matched | boolean | Y | false |  |
| 63 | po_matched | boolean | Y | false |  |
| 64 | gr_matched | boolean | Y | false |  |
| 65 | price_variance | numeric | Y | 0 |  |
| 66 | quantity_variance | numeric | Y | 0 |  |
| 67 | variance_approved | boolean | Y | - |  |
| 68 | variance_approved_by | character varying | Y | - |  |
| 69 | payment_status | character varying | Y | 'unpaid'::character varying |  |
| 70 | approval_level | integer | Y | - |  |
| 71 | journal_entry_id | integer | Y | - |  |
| 72 | posted | boolean | Y | false |  |
| 73 | posted_date | date | Y | - |  |
| 74 | dispute_resolved | boolean | Y | - |  |
| 75 | pdf_url | text | Y | - |  |

---

### מטבע חוץ (Currency Management) (2 טבלאות)

#### 245. `currency_exposures`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('currency_exposures_id_seq'::... | 🔑 PK |
| 2 | exposure_number | text | N | - | UNIQUE |
| 3 | currency_code | text | N | - |  |
| 4 | exposure_type | text | N | 'יבוא'::text |  |
| 5 | category | text | Y | 'סחורות'::text |  |
| 6 | total_exposure | numeric | N | - |  |
| 7 | hedged_amount | numeric | Y | 0 |  |
| 8 | unhedged_amount | numeric | Y | 0 |  |
| 9 | hedge_ratio | numeric | Y | 0 |  |
| 10 | current_rate | numeric | Y | - |  |
| 11 | budget_rate | numeric | Y | - |  |
| 12 | impact_at_current | numeric | Y | - |  |
| 13 | impact_at_budget | numeric | Y | - |  |
| 14 | variance | numeric | Y | - |  |
| 15 | linked_supplier | text | Y | - |  |
| 16 | linked_orders | text | Y | - |  |
| 17 | maturity_month | text | Y | - |  |
| 18 | status | text | Y | 'פתוח'::text |  |
| 19 | risk_level | text | Y | 'בינוני'::text |  |
| 20 | notes | text | Y | - |  |
| 21 | created_at | timestamp without time zone | N | now() |  |
| 22 | updated_at | timestamp without time zone | N | now() |  |
| 23 | currency | character varying | Y | - |  |
| 24 | exposure_date | date | Y | - |  |
| 25 | maturity_date | date | Y | - |  |
| 26 | amount_foreign | numeric | Y | - |  |
| 27 | amount_ils | numeric | Y | - |  |
| 28 | exchange_rate | numeric | Y | - |  |
| 29 | unrealized_gain_loss | numeric | Y | - |  |
| 30 | hedged | boolean | Y | false |  |
| 31 | hedge_id | integer | Y | - |  |
| 32 | hedge_pct | numeric | Y | - |  |
| 33 | source_type | character varying | Y | - |  |
| 34 | source_id | integer | Y | - |  |
| 35 | source_reference | character varying | Y | - |  |
| 36 | supplier_id | integer | Y | - |  |
| 37 | customer_id | integer | Y | - |  |
| 38 | tags | text | Y | - |  |

#### 246. `exchange_rates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('exchange_rates_id_seq'::regc... | 🔑 PK |
| 2 | rate_number | text | N | - | UNIQUE |
| 3 | currency_code | text | N | - |  |
| 4 | currency_name | text | N | - |  |
| 5 | base_currency | text | N | 'ILS'::text |  |
| 6 | rate | numeric | N | - |  |
| 7 | previous_rate | numeric | Y | - |  |
| 8 | change_percent | numeric | Y | - |  |
| 9 | rate_date | date | N | - |  |
| 10 | source | text | Y | 'ידני'::text |  |
| 11 | rate_type | text | Y | 'רשמי'::text |  |
| 12 | buy_rate | numeric | Y | - |  |
| 13 | sell_rate | numeric | Y | - |  |
| 14 | mid_rate | numeric | Y | - |  |
| 15 | status | text | Y | 'פעיל'::text |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | updated_at | timestamp without time zone | N | now() |  |
| 19 | from_currency | character varying | Y | - |  |
| 20 | to_currency | character varying | Y | 'ILS'::character varying |  |
| 21 | boi_rate | numeric | Y | - |  |
| 22 | change_pct | numeric | Y | - |  |
| 23 | monthly_avg | numeric | Y | - |  |
| 24 | yearly_avg | numeric | Y | - |  |
| 25 | year_high | numeric | Y | - |  |
| 26 | year_low | numeric | Y | - |  |
| 27 | is_active | boolean | Y | true |  |

---

### מלאי ולוגיסטיקה (Inventory & Logistics) (11 טבלאות)

#### 247. `accounting_inventory`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('accounting_inventory_id_seq'... | 🔑 PK |
| 2 | item_number | text | N | - |  |
| 3 | item_name | text | N | - |  |
| 4 | category | text | Y | - |  |
| 5 | quantity | numeric | Y | 0 |  |
| 6 | unit | text | Y | 'יחידה'::text |  |
| 7 | cost_per_unit | numeric | Y | 0 |  |
| 8 | market_value_per_unit | numeric | Y | 0 |  |
| 9 | total_cost | numeric | Y | 0 |  |
| 10 | total_market_value | numeric | Y | 0 |  |
| 11 | provision_amount | numeric | Y | 0 |  |
| 12 | valuation_method | text | Y | 'fifo'::text |  |
| 13 | last_count_date | date | Y | - |  |
| 14 | status | text | Y | 'active'::text |  |
| 15 | notes | text | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |
| 18 | item_id | integer | Y | - |  |
| 19 | item_type | character varying | Y | - |  |
| 20 | item_code | character varying | Y | - |  |
| 21 | warehouse | character varying | Y | - |  |
| 22 | bin_location | character varying | Y | - |  |
| 23 | uom | character varying | Y | - |  |
| 24 | quantity_on_hand | numeric | Y | 0 |  |
| 25 | quantity_reserved | numeric | Y | 0 |  |
| 26 | quantity_available | numeric | Y | 0 |  |
| 27 | quantity_on_order | numeric | Y | 0 |  |
| 28 | quantity_in_transit | numeric | Y | 0 |  |
| 29 | quantity_in_production | numeric | Y | 0 |  |
| 30 | quantity_quarantine | numeric | Y | 0 |  |
| 31 | unit_cost | numeric | Y | - |  |
| 32 | weighted_avg_cost | numeric | Y | - |  |
| 33 | fifo_cost | numeric | Y | - |  |
| 34 | standard_cost | numeric | Y | - |  |
| 35 | last_purchase_cost | numeric | Y | - |  |
| 36 | total_value | numeric | Y | 0 |  |
| 37 | last_count_qty | numeric | Y | - |  |
| 38 | count_variance | numeric | Y | - |  |
| 39 | variance_value | numeric | Y | - |  |
| 40 | abc_class | character varying | Y | - |  |
| 41 | xyz_class | character varying | Y | - |  |
| 42 | annual_usage | numeric | Y | - |  |
| 43 | annual_usage_value | numeric | Y | - |  |
| 44 | turnover_ratio | numeric | Y | - |  |
| 45 | gl_account_id | integer | Y | - |  |
| 46 | gl_account_number | character varying | Y | - |  |
| 47 | cost_center | character varying | Y | - |  |
| 48 | last_valuation_date | date | Y | - |  |
| 49 | is_active | boolean | Y | true |  |
| 50 | tags | text | Y | - |  |

#### 248. `finished_goods_stock`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('finished_goods_stock_id_seq'... | 🔑 PK |
| 2 | product_id | integer | Y | - |  |
| 3 | warehouse_id | integer | Y | - | FK → warehouses.id |
| 4 | location_code | character varying | Y | - |  |
| 5 | batch_number | character varying | Y | - |  |
| 6 | serial_number | character varying | Y | - |  |
| 7 | quantity | numeric | Y | 0 |  |
| 8 | reserved_quantity | numeric | Y | 0 |  |
| 9 | unit_cost | integer | Y | 0 |  |
| 10 | production_date | date | Y | - |  |
| 11 | quality_status | character varying | Y | 'pending'::character varying |  |
| 12 | work_order_id | integer | Y | - |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |

#### 249. `inventory_alerts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('inventory_alerts_id_seq'::re... | 🔑 PK |
| 2 | material_id | integer | N | - | FK → raw_materials.id |
| 3 | alert_type | text | N | - |  |
| 4 | severity | text | N | 'warning'::text |  |
| 5 | current_stock | numeric | Y | - |  |
| 6 | threshold_value | numeric | Y | - |  |
| 7 | message | text | N | - |  |
| 8 | status | text | N | 'active'::text |  |
| 9 | acknowledged_by | text | Y | - |  |
| 10 | acknowledged_at | timestamp without time zone | Y | - |  |
| 11 | resolved_at | timestamp without time zone | Y | - |  |
| 12 | auto_po_generated | boolean | Y | false |  |
| 13 | suggested_order_qty | numeric | Y | - |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |
| 16 | alert_number | character varying | Y | - |  |
| 17 | product_id | integer | Y | - |  |
| 18 | product_name | character varying | Y | - |  |
| 19 | product_code | character varying | Y | - |  |
| 20 | material_name | character varying | Y | - |  |
| 21 | material_code | character varying | Y | - |  |
| 22 | warehouse | character varying | Y | - |  |
| 23 | bin_location | character varying | Y | - |  |
| 24 | current_qty | numeric | Y | - |  |
| 25 | min_qty | numeric | Y | - |  |
| 26 | max_qty | numeric | Y | - |  |
| 27 | reorder_qty | numeric | Y | - |  |
| 28 | reorder_point | numeric | Y | - |  |
| 29 | safety_stock | numeric | Y | - |  |
| 30 | days_of_stock | integer | Y | - |  |
| 31 | avg_daily_consumption | numeric | Y | - |  |
| 32 | lead_time_days | integer | Y | - |  |
| 33 | last_receipt_date | date | Y | - |  |
| 34 | last_issue_date | date | Y | - |  |
| 35 | expiry_date | date | Y | - |  |
| 36 | days_to_expiry | integer | Y | - |  |
| 37 | slow_moving | boolean | Y | false |  |
| 38 | days_since_movement | integer | Y | - |  |
| 39 | dead_stock | boolean | Y | false |  |
| 40 | overstock | boolean | Y | false |  |
| 41 | stockout_risk | boolean | Y | false |  |
| 42 | auto_po_id | integer | Y | - |  |
| 43 | acknowledged | boolean | Y | false |  |
| 44 | resolved | boolean | Y | false |  |
| 45 | resolved_by | character varying | Y | - |  |
| 46 | notified_users | text | Y | - |  |
| 47 | notification_sent | boolean | Y | false |  |
| 48 | is_active | boolean | Y | true |  |
| 49 | notes | text | Y | - |  |
| 50 | tags | text | Y | - |  |

#### 250. `inventory_transactions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('inventory_transactions_id_se... | 🔑 PK |
| 2 | material_id | integer | N | - |  |
| 3 | transaction_type | text | N | - |  |
| 4 | quantity | numeric | N | - |  |
| 5 | reference_type | text | Y | - |  |
| 6 | reference_id | integer | Y | - |  |
| 7 | warehouse_location | text | Y | - |  |
| 8 | notes | text | Y | - |  |
| 9 | performed_by | text | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | unit_cost | numeric | Y | - |  |
| 12 | balance_after | numeric | Y | - |  |
| 13 | batch_number | character varying | Y | - |  |
| 14 | lot_number | character varying | Y | - |  |
| 15 | serial_number | character varying | Y | - |  |
| 16 | total_cost | numeric | Y | - |  |
| 17 | source_warehouse | character varying | Y | - |  |
| 18 | destination_warehouse | character varying | Y | - |  |
| 19 | work_order_id | integer | Y | - |  |
| 20 | purchase_order_id | integer | Y | - |  |
| 21 | sales_order_id | integer | Y | - |  |
| 22 | approved_by | character varying | Y | - |  |
| 23 | quality_status | character varying | Y | - |  |
| 24 | expiry_date | date | Y | - |  |
| 25 | cost_center | character varying | Y | - |  |
| 26 | material_name | character varying | Y | - |  |
| 27 | unit | character varying | Y | - |  |
| 28 | currency | character varying | Y | 'ILS'::character varying |  |
| 29 | exchange_rate | numeric | Y | - |  |
| 30 | inspection_status | character varying | Y | - |  |
| 31 | shelf_location | character varying | Y | - |  |
| 32 | pallet_number | character varying | Y | - |  |
| 33 | weight_kg | numeric | Y | - |  |
| 34 | temperature | numeric | Y | - |  |
| 35 | humidity | numeric | Y | - |  |
| 36 | document_number | character varying | Y | - |  |
| 37 | document_type | character varying | Y | - |  |
| 38 | goods_receipt_id | integer | Y | - |  |
| 39 | supplier_id | integer | Y | - |  |
| 40 | customer_id | integer | Y | - |  |
| 41 | project_id | integer | Y | - |  |
| 42 | reason_code | character varying | Y | - |  |
| 43 | adjustment_type | character varying | Y | - |  |
| 44 | counted_quantity | numeric | Y | - |  |
| 45 | variance_quantity | numeric | Y | - |  |
| 46 | fifo_cost | numeric | Y | - |  |
| 47 | avg_cost | numeric | Y | - |  |
| 48 | bin_location | character varying | Y | - |  |
| 49 | zone | character varying | Y | - |  |
| 50 | is_reversal | boolean | Y | false |  |
| 51 | reversal_of_id | integer | Y | - |  |
| 52 | posted | boolean | Y | true |  |
| 53 | approved_at | timestamp with time zone | Y | - |  |
| 54 | batch_id | character varying | Y | - |  |
| 55 | cost_per_unit | numeric | Y | - |  |
| 56 | total_value | numeric | Y | - |  |
| 57 | adjustment_reason | text | Y | - |  |
| 58 | tags | text | Y | - |  |
| 59 | transaction_number | character varying | Y | - |  |
| 60 | product_id | integer | Y | - |  |
| 61 | product_name | character varying | Y | - |  |
| 62 | product_sku | character varying | Y | - |  |
| 63 | warehouse_from | character varying | Y | - |  |
| 64 | warehouse_to | character varying | Y | - |  |
| 65 | bin_from | character varying | Y | - |  |
| 66 | bin_to | character varying | Y | - |  |
| 67 | zone_from | character varying | Y | - |  |
| 68 | zone_to | character varying | Y | - |  |
| 69 | balance_before | numeric | Y | - |  |
| 70 | weighted_avg_cost | numeric | Y | - |  |
| 71 | total_inventory_value | numeric | Y | - |  |
| 72 | heat_number | character varying | Y | - |  |
| 73 | certificate_number | character varying | Y | - |  |
| 74 | country_of_origin | character varying | Y | - |  |
| 75 | customs_entry_number | character varying | Y | - |  |
| 76 | quarantine | boolean | Y | false |  |
| 77 | documents_url | text | Y | - |  |

#### 251. `raw_material_stock`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('raw_material_stock_id_seq'::... | 🔑 PK |
| 2 | material_id | integer | Y | - |  |
| 3 | warehouse_id | integer | Y | - | FK → warehouses.id |
| 4 | location_code | character varying | Y | - |  |
| 5 | batch_number | character varying | Y | - |  |
| 6 | lot_number | character varying | Y | - |  |
| 7 | quantity | numeric | Y | 0 |  |
| 8 | reserved_quantity | numeric | Y | 0 |  |
| 9 | available_quantity | numeric | Y | 0 |  |
| 10 | unit_cost | integer | Y | 0 |  |
| 11 | total_value | integer | Y | 0 |  |
| 12 | received_date | date | Y | - |  |
| 13 | expiry_date | date | Y | - |  |
| 14 | supplier_id | integer | Y | - |  |
| 15 | purchase_order_id | integer | Y | - |  |
| 16 | quality_status | character varying | Y | 'pending'::character varying |  |
| 17 | certificate_of_conformity | character varying | Y | - |  |
| 18 | notes | text | Y | - |  |
| 19 | created_at | timestamp without time zone | Y | now() |  |
| 20 | updated_at | timestamp without time zone | Y | now() |  |

#### 252. `raw_materials`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('raw_materials_id_seq'::regcl... | 🔑 PK |
| 2 | material_number | text | N | - | UNIQUE |
| 3 | material_name | text | N | - |  |
| 4 | category | text | N | 'כללי'::text |  |
| 5 | sub_category | text | Y | - |  |
| 6 | unit | text | N | 'יחידה'::text |  |
| 7 | description | text | Y | - |  |
| 8 | minimum_stock | numeric | Y | - |  |
| 9 | current_stock | numeric | Y | 0 |  |
| 10 | reorder_point | numeric | Y | - |  |
| 11 | standard_price | numeric | Y | - |  |
| 12 | currency | text | Y | 'ILS'::text |  |
| 13 | weight_per_unit | numeric | Y | - |  |
| 14 | dimensions | text | Y | - |  |
| 15 | material_grade | text | Y | - |  |
| 16 | status | text | N | 'פעיל'::text |  |
| 17 | notes | text | Y | - |  |
| 18 | created_at | timestamp without time zone | N | now() |  |
| 19 | updated_at | timestamp without time zone | N | now() |  |
| 20 | warehouse_location | text | Y | 'מחסן ראשי'::text |  |
| 21 | maximum_stock | numeric | Y | - |  |
| 22 | last_count_date | date | Y | - |  |
| 23 | last_count_quantity | numeric | Y | - |  |
| 24 | abc_classification | text | Y | 'C'::text |  |
| 25 | annual_usage_value | numeric | Y | 0 |  |
| 26 | lead_time_days | integer | Y | - |  |
| 27 | last_receipt_date | date | Y | - |  |
| 28 | last_issue_date | date | Y | - |  |
| 29 | supplier_id | integer | Y | - |  |
| 30 | rod_length | numeric | Y | - |  |
| 31 | pricing_method | text | Y | 'יחידה'::text |  |
| 32 | price_per_meter | numeric | Y | - |  |
| 33 | price_per_kg | numeric | Y | - |  |
| 34 | package_quantity | numeric | Y | - |  |
| 35 | total_price_before_vat | numeric | Y | - |  |
| 36 | total_price_after_vat | numeric | Y | - |  |
| 37 | weight_per_meter | numeric | Y | - |  |
| 38 | diameter | numeric | Y | - |  |
| 39 | inner_diameter | numeric | Y | - |  |
| 40 | inner_type | text | Y | - |  |
| 41 | standard | text | Y | - |  |
| 42 | country_of_origin | text | Y | - |  |
| 43 | color | text | Y | - |  |
| 44 | minimum_order | numeric | Y | - |  |
| 45 | delivery_days | integer | Y | - |  |
| 46 | warranty_months | integer | Y | - |  |
| 47 | barcode | text | Y | - |  |
| 48 | hazard_class | character varying | Y | - |  |
| 49 | shelf_life_days | integer | Y | - |  |
| 50 | lot_tracking | boolean | Y | false |  |
| 51 | serial_tracking | boolean | Y | false |  |
| 52 | inspection_required | boolean | Y | false |  |
| 53 | quality_grade | character varying | Y | - |  |
| 54 | preferred_supplier_id | integer | Y | - |  |
| 55 | alternate_supplier_id | integer | Y | - |  |
| 56 | economic_order_qty | numeric | Y | - |  |
| 57 | safety_stock | numeric | Y | 0 |  |
| 58 | last_purchase_price | numeric | Y | - |  |
| 59 | average_cost | numeric | Y | - |  |
| 60 | standard_cost | numeric | Y | - |  |
| 61 | customs_tariff_code | character varying | Y | - |  |
| 62 | storage_conditions | text | Y | - |  |
| 63 | handling_instructions | text | Y | - |  |
| 64 | msds_url | text | Y | - |  |
| 65 | image_url | text | Y | - |  |
| 66 | sku | character varying | Y | - |  |
| 67 | category_path | text | Y | - |  |
| 68 | weight_kg | numeric | Y | - |  |
| 69 | length_cm | numeric | Y | - |  |
| 70 | width_cm | numeric | Y | - |  |
| 71 | height_cm | numeric | Y | - |  |
| 72 | storage_temp_min | numeric | Y | - |  |
| 73 | storage_temp_max | numeric | Y | - |  |
| 74 | reorder_qty | numeric | Y | - |  |
| 75 | selling_price | numeric | Y | - |  |
| 76 | wholesale_price | numeric | Y | - |  |
| 77 | tax_rate | numeric | Y | 18 |  |
| 78 | bom_id | integer | Y | - |  |
| 79 | average_daily_usage | numeric | Y | - |  |
| 80 | last_price | numeric | Y | - |  |
| 81 | average_price | numeric | Y | - |  |
| 82 | last_supplier_id | integer | Y | - |  |
| 83 | last_supplier_name | character varying | Y | - |  |
| 84 | inspection_frequency | character varying | Y | - |  |
| 85 | tensile_strength | numeric | Y | - |  |
| 86 | yield_strength | numeric | Y | - |  |
| 87 | hardness_rating | character varying | Y | - |  |
| 88 | corrosion_resistance | character varying | Y | - |  |
| 89 | heat_treatment | character varying | Y | - |  |
| 90 | surface_finish | character varying | Y | - |  |
| 91 | alloy_composition | text | Y | - |  |
| 92 | density | numeric | Y | - |  |
| 93 | melting_point | numeric | Y | - |  |
| 94 | conductivity | character varying | Y | - |  |
| 95 | recyclable | boolean | Y | true |  |
| 96 | hazardous | boolean | Y | false |  |
| 97 | import_duty_rate | numeric | Y | - |  |
| 98 | anti_dumping_duty | boolean | Y | false |  |
| 99 | total_received_qty | numeric | Y | 0 |  |
| 100 | total_issued_qty | numeric | Y | 0 |  |
| 101 | total_returned_qty | numeric | Y | 0 |  |
| 102 | total_scrapped_qty | numeric | Y | 0 |  |
| 103 | inventory_value | numeric | Y | 0 |  |
| 104 | last_audit_date | date | Y | - |  |
| 105 | next_audit_date | date | Y | - |  |
| 106 | variance_count | integer | Y | 0 |  |
| 107 | bin_location | character varying | Y | - |  |
| 108 | rack_number | character varying | Y | - |  |
| 109 | shelf_number | character varying | Y | - |  |
| 110 | zone | character varying | Y | - |  |
| 111 | qr_code | text | Y | - |  |
| 112 | brand | text | Y | - |  |
| 113 | origin_country | character varying | Y | - |  |
| 114 | tariff_code | character varying | Y | - |  |
| 115 | storage_instructions | text | Y | - |  |
| 116 | approved_suppliers | text | Y | - |  |
| 117 | substitute_materials | text | Y | - |  |
| 118 | avg_consumption_monthly | numeric | Y | - |  |
| 119 | forecast_quantity | numeric | Y | - |  |
| 120 | total_consumed_ytd | numeric | Y | 0 |  |
| 121 | total_purchased_ytd | numeric | Y | 0 |  |
| 122 | total_wasted_ytd | numeric | Y | 0 |  |
| 123 | waste_pct | numeric | Y | - |  |
| 124 | count_variance | numeric | Y | - |  |
| 125 | abc_class | character varying | Y | - |  |
| 126 | critical_item | boolean | Y | false |  |
| 127 | insurance_value | numeric | Y | - |  |
| 128 | customs_cleared | boolean | Y | true |  |
| 129 | photo_urls | text | Y | - |  |
| 130 | material_type | text | Y | - |  |
| 131 | finish | text | Y | - |  |
| 132 | thickness | numeric | Y | - |  |
| 133 | width | numeric | Y | - |  |
| 134 | height | numeric | Y | - |  |
| 135 | product_code | text | Y | - |  |
| 136 | category_l1 | text | Y | - |  |
| 137 | category_l2 | text | Y | - |  |
| 138 | uom_stock | text | Y | 'יחידה'::text |  |
| 139 | uom_purchase | text | Y | - |  |
| 140 | weight_mm | numeric | Y | - |  |
| 141 | length_mm | numeric | Y | - |  |
| 142 | width_mm | numeric | Y | - |  |
| 143 | height_mm | numeric | Y | - |  |
| 144 | cost_price | numeric | Y | - |  |
| 145 | vat_rate | numeric | Y | 18 |  |
| 146 | hs_tariff_code | text | Y | - |  |
| 147 | track_serial | boolean | Y | false |  |
| 148 | track_batch | boolean | Y | false |  |
| 149 | primary_supplier_id | integer | Y | - |  |
| 150 | is_active | boolean | Y | true |  |

#### 253. `stock_count_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('stock_count_items_id_seq'::r... | 🔑 PK |
| 2 | stock_count_id | integer | Y | - | FK → stock_counts.id |
| 3 | material_id | integer | Y | - |  |
| 4 | location_code | character varying | Y | - |  |
| 5 | system_quantity | numeric | Y | 0 |  |
| 6 | counted_quantity | numeric | Y | 0 |  |
| 7 | variance | numeric | Y | 0 |  |
| 8 | variance_value | integer | Y | 0 |  |
| 9 | adjustment_approved | boolean | Y | false |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |

#### 254. `stock_counts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('stock_counts_id_seq'::regclass) | 🔑 PK |
| 2 | count_number | character varying | Y | - | UNIQUE |
| 3 | count_type | character varying | Y | 'full'::character varying |  |
| 4 | warehouse_id | integer | Y | - | FK → warehouses.id |
| 5 | count_date | date | Y | CURRENT_DATE |  |
| 6 | status | character varying | Y | 'planned'::character varying |  |
| 7 | counted_by | integer | Y | - |  |
| 8 | approved_by | integer | Y | - |  |
| 9 | approved_at | timestamp without time zone | Y | - |  |
| 10 | total_items | integer | Y | 0 |  |
| 11 | discrepancies | integer | Y | 0 |  |
| 12 | adjustment_value | integer | Y | 0 |  |
| 13 | notes | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |
| 15 | updated_at | timestamp without time zone | Y | now() |  |

#### 255. `stock_movements`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('stock_movements_id_seq'::reg... | 🔑 PK |
| 2 | movement_type | character varying | N | - |  |
| 3 | material_type | character varying | Y | 'raw_material'::character varying |  |
| 4 | material_id | integer | Y | - |  |
| 5 | from_warehouse_id | integer | Y | - |  |
| 6 | to_warehouse_id | integer | Y | - |  |
| 7 | quantity | numeric | N | - |  |
| 8 | unit_cost | integer | Y | 0 |  |
| 9 | reference_type | character varying | Y | - |  |
| 10 | reference_id | integer | Y | - |  |
| 11 | batch_number | character varying | Y | - |  |
| 12 | lot_number | character varying | Y | - |  |
| 13 | reason | text | Y | - |  |
| 14 | performed_by | integer | Y | - |  |
| 15 | approved_by | integer | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp without time zone | Y | now() |  |

#### 256. `warehouse_locations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('warehouse_locations_id_seq':... | 🔑 PK |
| 2 | warehouse_id | integer | Y | - | FK → warehouses.id |
| 3 | location_code | character varying | Y | - |  |
| 4 | zone | character varying | Y | - |  |
| 5 | aisle | character varying | Y | - |  |
| 6 | shelf | character varying | Y | - |  |
| 7 | bin | character varying | Y | - |  |
| 8 | max_weight | numeric | Y | - |  |
| 9 | max_volume | numeric | Y | - |  |
| 10 | is_occupied | boolean | Y | false |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |

#### 257. `warehouses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('warehouses_id_seq'::regclass) | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | code | character varying | Y | - | UNIQUE |
| 4 | warehouse_type | character varying | Y | 'main'::character varying |  |
| 5 | address | jsonb | Y | '{}'::jsonb |  |
| 6 | manager_id | integer | Y | - |  |
| 7 | capacity | numeric | Y | 0 |  |
| 8 | current_utilization | numeric | Y | 0 |  |
| 9 | notes | text | Y | - |  |
| 10 | is_active | boolean | Y | true |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |

---

### מנוע בינה מלאכותית (AI Engine) (20 טבלאות)

#### 258. `ai_agents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_agents_id_seq'::regclass) | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | agent_type | character varying | Y | 'backend'::character varying |  |
| 4 | system_prompt | text | Y | - |  |
| 5 | core_rules | jsonb | Y | '[]'::jsonb |  |
| 6 | tasks | jsonb | Y | '[]'::jsonb |  |
| 7 | model_id | integer | Y | - |  |
| 8 | execution_count | integer | Y | 0 |  |
| 9 | avg_execution_time | numeric | Y | 0 |  |
| 10 | success_rate | numeric | Y | 0 |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

#### 259. `ai_api_keys`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_api_keys_id_seq'::regclass) | 🔑 PK |
| 2 | provider_id | integer | N | - | FK → ai_providers.id |
| 3 | key_name | text | N | - |  |
| 4 | api_key | text | N | - |  |
| 5 | is_active | boolean | N | true |  |
| 6 | last_used_at | timestamp without time zone | Y | - |  |
| 7 | expires_at | timestamp without time zone | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |

#### 260. `ai_builder_configs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_builder_configs_id_seq'::... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | entity_id | integer | Y | - |  |
| 6 | feature_type | text | N | 'field_autofill'::text |  |
| 7 | provider_id | integer | Y | - |  |
| 8 | model_id | integer | Y | - |  |
| 9 | prompt_template_id | integer | Y | - |  |
| 10 | input_config | jsonb | N | '{}'::jsonb |  |
| 11 | output_config | jsonb | N | '{}'::jsonb |  |
| 12 | system_prompt | text | Y | - |  |
| 13 | user_prompt_template | text | Y | - |  |
| 14 | trigger_type | text | N | 'manual'::text |  |
| 15 | trigger_config | jsonb | N | '{}'::jsonb |  |
| 16 | is_active | boolean | N | true |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | updated_at | timestamp without time zone | N | now() |  |
| 19 | config_name | character varying | Y | - |  |
| 20 | builder_type | character varying | Y | - |  |
| 21 | entity_type | character varying | Y | - |  |
| 22 | template_id | integer | Y | - |  |
| 23 | parameters | text | Y | - |  |
| 24 | notes | text | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 261. `ai_builder_execution_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_builder_execution_logs_id... | 🔑 PK |
| 2 | config_id | integer | N | - |  |
| 3 | entity_id | integer | Y | - |  |
| 4 | record_id | integer | Y | - |  |
| 5 | input_data | jsonb | N | '{}'::jsonb |  |
| 6 | output_data | jsonb | Y | 'null'::jsonb |  |
| 7 | prompt_used | text | Y | - |  |
| 8 | status | text | N | 'pending'::text |  |
| 9 | error_message | text | Y | - |  |
| 10 | tokens_used | integer | Y | - |  |
| 11 | execution_time_ms | integer | Y | - |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | entity_type | character varying | Y | - |  |
| 14 | success | boolean | Y | true |  |
| 15 | duration_ms | integer | Y | - |  |
| 16 | tags | text | Y | - |  |

#### 262. `ai_call_analyses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_call_analyses_id_seq'::re... | 🔑 PK |
| 2 | call_id | integer | Y | - |  |
| 3 | transcript | text | Y | - |  |
| 4 | sentiment_score | numeric | Y | 0 |  |
| 5 | key_phrases | jsonb | Y | '[]'::jsonb |  |
| 6 | action_items | jsonb | Y | '[]'::jsonb |  |
| 7 | customer_intent | character varying | Y | 'other'::character varying |  |
| 8 | urgency_level | integer | Y | 1 |  |
| 9 | summary | text | Y | - |  |
| 10 | language | character varying | Y | 'he'::character varying |  |
| 11 | duration_seconds | integer | Y | 0 |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |

#### 263. `ai_chatbot_config`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_chatbot_config_id_seq'::r... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | model | character varying | Y | - |  |
| 4 | temperature | numeric | Y | 0.7 |  |
| 5 | max_tokens | integer | Y | 2000 |  |
| 6 | system_prompt | text | Y | - |  |
| 7 | knowledge_base_ids | jsonb | Y | '[]'::jsonb |  |
| 8 | active_channels | jsonb | Y | '[]'::jsonb |  |
| 9 | response_language | character varying | Y | 'he'::character varying |  |
| 10 | auto_escalation_rules | jsonb | Y | '{}'::jsonb |  |
| 11 | working_hours | jsonb | Y | '{}'::jsonb |  |
| 12 | is_active | boolean | Y | true |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

#### 264. `ai_data_flow_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_data_flow_log_id_seq'::re... | 🔑 PK |
| 2 | source_entity | character varying | N | - |  |
| 3 | target_module | character varying | N | - |  |
| 4 | source_data | jsonb | Y | '{}'::jsonb |  |
| 5 | propagated_data | jsonb | Y | '{}'::jsonb |  |
| 6 | status | character varying | Y | 'completed'::character varying |  |
| 7 | created_at | timestamp without time zone | Y | now() |  |

#### 265. `ai_document_history`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_document_history_id_seq':... | 🔑 PK |
| 2 | file_name | text | N | - |  |
| 3 | file_url | text | Y | - |  |
| 4 | document_type | text | Y | - |  |
| 5 | status | text | Y | 'pending'::text |  |
| 6 | extracted_data | jsonb | Y | - |  |
| 7 | distribution_log | jsonb | Y | - |  |
| 8 | error_message | text | Y | - |  |
| 9 | created_by | integer | Y | - |  |
| 10 | created_at | timestamp with time zone | Y | now() |  |
| 11 | updated_at | timestamp with time zone | Y | now() |  |
| 12 | document_id | integer | Y | - |  |
| 13 | action_type | character varying | Y | - |  |
| 14 | model_used | character varying | Y | - |  |
| 15 | input_text | text | Y | - |  |
| 16 | output_text | text | Y | - |  |
| 17 | tokens_used | integer | Y | - |  |
| 18 | user_name | character varying | Y | - |  |
| 19 | tags | text | Y | - |  |

#### 266. `ai_lead_scores`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_lead_scores_id_seq'::regc... | 🔑 PK |
| 2 | lead_id | integer | Y | - |  |
| 3 | score | numeric | Y | 0 |  |
| 4 | score_breakdown | jsonb | Y | '{}'::jsonb |  |
| 5 | predicted_conversion_rate | numeric | Y | 0 |  |
| 6 | predicted_deal_value | integer | Y | 0 |  |
| 7 | confidence_level | numeric | Y | 0 |  |
| 8 | model_version | character varying | Y | - |  |
| 9 | scoring_date | timestamp without time zone | Y | now() |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |

#### 267. `ai_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_logs_id_seq'::regclass) | 🔑 PK |
| 2 | event_type | character varying | Y | - |  |
| 3 | model_id | integer | Y | - |  |
| 4 | user_id | integer | Y | - |  |
| 5 | request_data | jsonb | Y | '{}'::jsonb |  |
| 6 | response_data | jsonb | Y | '{}'::jsonb |  |
| 7 | tokens_in | integer | Y | 0 |  |
| 8 | tokens_out | integer | Y | 0 |  |
| 9 | cost | integer | Y | 0 |  |
| 10 | latency_ms | integer | Y | 0 |  |
| 11 | error | text | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |

#### 268. `ai_models`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_models_id_seq'::regclass) | 🔑 PK |
| 2 | provider_id | integer | N | - | FK → ai_providers.id |
| 3 | name | text | N | - |  |
| 4 | slug | text | N | - | UNIQUE |
| 5 | description | text | Y | - |  |
| 6 | model_type | text | N | - |  |
| 7 | max_tokens | integer | Y | - |  |
| 8 | cost_per_input_token | numeric | Y | - |  |
| 9 | cost_per_output_token | numeric | Y | - |  |
| 10 | is_active | boolean | N | true |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | model_code | character varying | Y | - |  |
| 14 | model_name | character varying | Y | - |  |
| 15 | provider_name | character varying | Y | - |  |
| 16 | cost_per_1k_tokens | numeric | Y | - |  |
| 17 | supports_hebrew | boolean | Y | true |  |
| 18 | is_default | boolean | Y | false |  |
| 19 | notes | text | Y | - |  |
| 20 | tags | text | Y | - |  |

#### 269. `ai_operation_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_operation_logs_id_seq'::r... | 🔑 PK |
| 2 | module_id | character varying | N | - |  |
| 3 | action_type | character varying | N | - |  |
| 4 | action_description | text | Y | - |  |
| 5 | input_data | jsonb | Y | - |  |
| 6 | output_data | jsonb | Y | - |  |
| 7 | status | character varying | Y | 'success'::character varying |  |
| 8 | confidence | numeric | Y | - |  |
| 9 | duration_ms | integer | Y | - |  |
| 10 | user_id | integer | Y | - |  |
| 11 | linked_entity_type | character varying | Y | - |  |
| 12 | linked_entity_id | integer | Y | - |  |
| 13 | error_message | text | Y | - |  |
| 14 | created_at | timestamp without time zone | Y | now() |  |

#### 270. `ai_permissions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_permissions_id_seq'::regc... | 🔑 PK |
| 2 | role | text | N | - |  |
| 3 | model_id | integer | Y | - | FK → ai_models.id |
| 4 | can_query | boolean | N | false |  |
| 5 | can_manage_keys | boolean | N | false |  |
| 6 | can_view_logs | boolean | N | false |  |
| 7 | can_manage_models | boolean | N | false |  |
| 8 | can_manage_providers | boolean | N | false |  |
| 9 | max_queries_per_day | integer | Y | - |  |
| 10 | max_tokens_per_day | integer | Y | - |  |
| 11 | is_active | boolean | N | true |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | updated_at | timestamp without time zone | N | now() |  |
| 14 | role_id | integer | Y | - |  |
| 15 | role_name | character varying | Y | - |  |
| 16 | model_access | text | Y | - |  |
| 17 | template_access | text | Y | - |  |
| 18 | max_daily_requests | integer | Y | 100 |  |
| 19 | max_tokens_per_request | integer | Y | 4000 |  |
| 20 | can_create_templates | boolean | Y | false |  |
| 21 | tags | text | Y | - |  |

#### 271. `ai_predictions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_predictions_id_seq'::regc... | 🔑 PK |
| 2 | prediction_type | character varying | N | - |  |
| 3 | target_entity | character varying | Y | - |  |
| 4 | target_id | integer | Y | - |  |
| 5 | predicted_value | numeric | Y | 0 |  |
| 6 | confidence_interval_low | numeric | Y | 0 |  |
| 7 | confidence_interval_high | numeric | Y | 0 |  |
| 8 | prediction_date | date | Y | CURRENT_DATE |  |
| 9 | horizon_days | integer | Y | 30 |  |
| 10 | model_version | character varying | Y | - |  |
| 11 | actual_value | numeric | Y | - |  |
| 12 | accuracy_score | numeric | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |

#### 272. `ai_prompt_templates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_prompt_templates_id_seq':... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - | UNIQUE |
| 4 | description | text | Y | - |  |
| 5 | category | text | N | - |  |
| 6 | prompt_template | text | N | - |  |
| 7 | system_prompt | text | Y | - |  |
| 8 | default_model_id | integer | Y | - | FK → ai_models.id |
| 9 | variables | text | Y | - |  |
| 10 | is_active | boolean | N | true |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | template_code | character varying | Y | - |  |
| 14 | template_name | character varying | Y | - |  |
| 15 | prompt_text | text | Y | - |  |
| 16 | model_id | integer | Y | - |  |
| 17 | language | character varying | Y | 'he'::character varying |  |
| 18 | max_tokens | integer | Y | - |  |
| 19 | temperature | numeric | Y | - |  |
| 20 | notes | text | Y | - |  |
| 21 | tags | text | Y | - |  |

#### 273. `ai_providers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_providers_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - | UNIQUE |
| 4 | description | text | Y | - |  |
| 5 | website | text | Y | - |  |
| 6 | api_base_url | text | Y | - |  |
| 7 | is_active | boolean | N | true |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |

#### 274. `ai_queries`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_queries_id_seq'::regclass) | 🔑 PK |
| 2 | model_id | integer | N | - | FK → ai_models.id |
| 3 | prompt | text | N | - |  |
| 4 | system_prompt | text | Y | - |  |
| 5 | parameters | text | Y | - |  |
| 6 | status | text | N | 'pending'::text |  |
| 7 | created_at | timestamp without time zone | N | now() |  |
| 8 | updated_at | timestamp without time zone | N | now() |  |

#### 275. `ai_recommendations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_recommendations_id_seq'::... | 🔑 PK |
| 2 | model_id | integer | Y | - | FK → ai_models.id |
| 3 | title | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | category | text | N | - |  |
| 6 | confidence | numeric | Y | - |  |
| 7 | status | text | N | 'pending'::text |  |
| 8 | is_applied | boolean | N | false |  |
| 9 | metadata | text | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |
| 12 | recommendation_type | character varying | Y | - |  |
| 13 | entity_type | character varying | Y | - |  |
| 14 | entity_id | integer | Y | - |  |
| 15 | accepted | boolean | Y | - |  |
| 16 | accepted_by | character varying | Y | - |  |
| 17 | accepted_at | timestamp with time zone | Y | - |  |
| 18 | tags | text | Y | - |  |

#### 276. `ai_responses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_responses_id_seq'::regclass) | 🔑 PK |
| 2 | query_id | integer | N | - | FK → ai_queries.id |
| 3 | content | text | N | - |  |
| 4 | finish_reason | text | Y | - |  |
| 5 | tokens_used | integer | Y | - |  |
| 6 | response_time_ms | integer | Y | - |  |
| 7 | rating | integer | Y | - |  |
| 8 | feedback | text | Y | - |  |
| 9 | created_at | timestamp without time zone | N | now() |  |

#### 277. `ai_usage_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ai_usage_logs_id_seq'::regcl... | 🔑 PK |
| 2 | model_id | integer | N | - | FK → ai_models.id |
| 3 | api_key_id | integer | Y | - | FK → ai_api_keys.id |
| 4 | input_tokens | integer | Y | - |  |
| 5 | output_tokens | integer | Y | - |  |
| 6 | total_tokens | integer | Y | - |  |
| 7 | cost | numeric | Y | - |  |
| 8 | response_time_ms | integer | Y | - |  |
| 9 | status_code | integer | Y | - |  |
| 10 | error_message | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | user_id | integer | Y | - |  |
| 13 | user_name | character varying | Y | - |  |
| 14 | model_name | character varying | Y | - |  |
| 15 | template_id | integer | Y | - |  |
| 16 | tokens_used | integer | Y | - |  |
| 17 | success | boolean | Y | true |  |
| 18 | tags | text | Y | - |  |

---

### משאבי אנוש (Human Resources) (17 טבלאות)

#### 278. `attendance_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('attendance_records_id_seq'::... | 🔑 PK |
| 2 | record_number | character varying | Y | - | UNIQUE |
| 3 | employee_name | character varying | N | - |  |
| 4 | employee_id_ref | integer | Y | - |  |
| 5 | attendance_date | date | N | CURRENT_DATE |  |
| 6 | check_in | time without time zone | Y | - |  |
| 7 | check_out | time without time zone | Y | - |  |
| 8 | total_hours | numeric | Y | 0 |  |
| 9 | overtime_hours | numeric | Y | 0 |  |
| 10 | break_minutes | integer | Y | 0 |  |
| 11 | status | character varying | Y | 'present'::character varying |  |
| 12 | shift_type | character varying | Y | 'morning'::character varying |  |
| 13 | location | character varying | Y | - |  |
| 14 | department | character varying | Y | - |  |
| 15 | late_minutes | integer | Y | 0 |  |
| 16 | early_leave_minutes | integer | Y | 0 |  |
| 17 | approved_by | character varying | Y | - |  |
| 18 | approval_status | character varying | Y | 'pending'::character varying |  |
| 19 | notes | text | Y | - |  |
| 20 | created_at | timestamp without time zone | Y | now() |  |
| 21 | updated_at | timestamp without time zone | Y | now() |  |
| 22 | overtime_125 | numeric | Y | 0 |  |
| 23 | overtime_150 | numeric | Y | 0 |  |
| 24 | overtime_200 | numeric | Y | 0 |  |
| 25 | ip_address | character varying | Y | - |  |
| 26 | device_type | character varying | Y | - |  |
| 27 | approved_at | timestamp with time zone | Y | - |  |
| 28 | anomaly_flag | boolean | Y | false |  |
| 29 | anomaly_reason | text | Y | - |  |
| 30 | cost_center | character varying | Y | - |  |
| 31 | project_id | integer | Y | - |  |
| 32 | clock_in_method | character varying | Y | - |  |
| 33 | clock_out_method | character varying | Y | - |  |
| 34 | device_id | character varying | Y | - |  |
| 35 | geo_location | character varying | Y | - |  |
| 36 | meal_break_minutes | integer | Y | - |  |
| 37 | overtime_approved | boolean | Y | false |  |
| 38 | manager_notes | text | Y | - |  |
| 39 | employee_id | integer | Y | - |  |
| 40 | employee_number | character varying | Y | - |  |
| 41 | date | date | Y | - |  |
| 42 | clock_in | time without time zone | Y | - |  |
| 43 | clock_out | time without time zone | Y | - |  |
| 44 | break_start | time without time zone | Y | - |  |
| 45 | break_end | time without time zone | Y | - |  |
| 46 | regular_hours | numeric | Y | - |  |
| 47 | absence_type | character varying | Y | - |  |
| 48 | absence_approved | boolean | Y | - |  |
| 49 | biometric_verified | boolean | Y | false |  |
| 50 | manual_entry | boolean | Y | false |  |
| 51 | tags | text | Y | - |  |
| 52 | gps_location | character varying | Y | - |  |
| 53 | payroll_processed | boolean | Y | false |  |
| 54 | second_break_start | time without time zone | Y | - |  |
| 55 | second_break_end | time without time zone | Y | - |  |
| 56 | total_break_minutes | integer | Y | 0 |  |
| 57 | late_arrival | boolean | Y | false |  |
| 58 | early_departure | boolean | Y | false |  |
| 59 | early_minutes | integer | Y | 0 |  |
| 60 | shift_name | character varying | Y | - |  |
| 61 | shift_id | integer | Y | - |  |
| 62 | project_name | character varying | Y | - |  |
| 63 | approved | boolean | Y | false |  |
| 64 | exception_type | character varying | Y | - |  |
| 65 | exception_reason | text | Y | - |  |

#### 279. `benefit_plans`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('benefit_plans_id_seq'::regcl... | 🔑 PK |
| 2 | plan_number | character varying | Y | - | UNIQUE |
| 3 | plan_name | character varying | Y | - |  |
| 4 | plan_type | character varying | Y | 'health'::character varying |  |
| 5 | description | text | Y | - |  |
| 6 | provider_name | character varying | Y | - |  |
| 7 | provider_contact | character varying | Y | - |  |
| 8 | employer_contribution | numeric | Y | 0 |  |
| 9 | employee_contribution | numeric | Y | 0 |  |
| 10 | currency | character varying | Y | 'ILS'::character varying |  |
| 11 | coverage_details | text | Y | - |  |
| 12 | eligibility_criteria | text | Y | - |  |
| 13 | waiting_period_days | integer | Y | 0 |  |
| 14 | is_mandatory | boolean | Y | false |  |
| 15 | effective_date | date | Y | - |  |
| 16 | expiry_date | date | Y | - |  |
| 17 | renewal_date | date | Y | - |  |
| 18 | max_participants | integer | Y | - |  |
| 19 | current_participants | integer | Y | 0 |  |
| 20 | status | character varying | Y | 'draft'::character varying |  |
| 21 | notes | text | Y | - |  |
| 22 | created_by | integer | Y | - |  |
| 23 | created_by_name | character varying | Y | - |  |
| 24 | created_at | timestamp without time zone | Y | now() |  |
| 25 | updated_at | timestamp without time zone | Y | now() |  |
| 26 | provider | character varying | Y | - |  |
| 27 | provider_phone | character varying | Y | - |  |
| 28 | min_employee_pct | numeric | Y | - |  |
| 29 | max_employee_pct | numeric | Y | - |  |
| 30 | min_employer_pct | numeric | Y | - |  |
| 31 | max_employer_pct | numeric | Y | - |  |
| 32 | vesting_months | integer | Y | - |  |
| 33 | eligible_after_months | integer | Y | 0 |  |
| 34 | tax_deductible | boolean | Y | true |  |
| 35 | mandatory | boolean | Y | false |  |
| 36 | enrolled_count | integer | Y | 0 |  |
| 37 | total_monthly_cost | numeric | Y | 0 |  |
| 38 | documents_url | text | Y | - |  |
| 39 | tags | text | Y | - |  |

#### 280. `candidates_pipeline`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('candidates_pipeline_id_seq':... | 🔑 PK |
| 2 | candidate_number | character varying | Y | - | UNIQUE |
| 3 | full_name | character varying | N | - |  |
| 4 | email | character varying | Y | - |  |
| 5 | phone | character varying | Y | - |  |
| 6 | position_applied | character varying | Y | - |  |
| 7 | recruitment_id | integer | Y | - |  |
| 8 | department | character varying | Y | - |  |
| 9 | source | character varying | Y | 'linkedin'::character varying |  |
| 10 | stage | character varying | Y | 'applied'::character varying |  |
| 11 | experience_years | numeric | Y | 0 |  |
| 12 | education_level | character varying | Y | - |  |
| 13 | cv_url | text | Y | - |  |
| 14 | linkedin_url | text | Y | - |  |
| 15 | rating | integer | Y | 0 |  |
| 16 | salary_expectation | numeric | Y | - |  |
| 17 | availability_date | date | Y | - |  |
| 18 | notes | text | Y | - |  |
| 19 | rejection_reason | text | Y | - |  |
| 20 | interviewer_name | character varying | Y | - |  |
| 21 | interview_date | date | Y | - |  |
| 22 | interview_notes | text | Y | - |  |
| 23 | offer_amount | numeric | Y | - |  |
| 24 | offer_date | date | Y | - |  |
| 25 | hire_date | date | Y | - |  |
| 26 | created_by | integer | Y | - |  |
| 27 | created_by_name | character varying | Y | - |  |
| 28 | created_at | timestamp without time zone | Y | now() |  |
| 29 | updated_at | timestamp without time zone | Y | now() |  |

#### 281. `employee_benefits`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('employee_benefits_id_seq'::r... | 🔑 PK |
| 2 | enrollment_number | character varying | Y | - | UNIQUE |
| 3 | employee_name | character varying | Y | - |  |
| 4 | employee_id_ref | integer | Y | - |  |
| 5 | department | character varying | Y | - |  |
| 6 | plan_id | integer | Y | - | FK → benefit_plans.id |
| 7 | enrollment_date | date | Y | - |  |
| 8 | effective_date | date | Y | - |  |
| 9 | end_date | date | Y | - |  |
| 10 | employer_cost | numeric | Y | 0 |  |
| 11 | employee_cost | numeric | Y | 0 |  |
| 12 | coverage_level | character varying | Y | 'individual'::character varying |  |
| 13 | dependents_count | integer | Y | 0 |  |
| 14 | status | character varying | Y | 'pending'::character varying |  |
| 15 | notes | text | Y | - |  |
| 16 | created_by | integer | Y | - |  |
| 17 | created_by_name | character varying | Y | - |  |
| 18 | created_at | timestamp without time zone | Y | now() |  |
| 19 | updated_at | timestamp without time zone | Y | now() |  |
| 20 | employee_id | integer | Y | - |  |
| 21 | benefit_type | character varying | Y | - |  |
| 22 | benefit_name | character varying | Y | - |  |
| 23 | provider | character varying | Y | - |  |
| 24 | policy_number | character varying | Y | - |  |
| 25 | start_date | date | Y | - |  |
| 26 | employee_contribution | numeric | Y | 0 |  |
| 27 | employer_contribution | numeric | Y | 0 |  |
| 28 | contribution_pct_employee | numeric | Y | - |  |
| 29 | contribution_pct_employer | numeric | Y | - |  |
| 30 | coverage_amount | numeric | Y | - |  |
| 31 | beneficiary | character varying | Y | - |  |
| 32 | documents_url | text | Y | - |  |
| 33 | tags | text | Y | - |  |
| 34 | pension_track | character varying | Y | - |  |
| 35 | pension_comprehensive | boolean | Y | false |  |
| 36 | education_fund_track | character varying | Y | - |  |
| 37 | severance_component | boolean | Y | false |  |
| 38 | severance_completion_pct | numeric | Y | - |  |
| 39 | disability_insurance | boolean | Y | false |  |
| 40 | life_insurance | boolean | Y | false |  |
| 41 | health_insurance | boolean | Y | false |  |
| 42 | meal_vouchers | boolean | Y | false |  |
| 43 | meal_voucher_amount | numeric | Y | - |  |
| 44 | transportation_allowance | boolean | Y | false |  |
| 45 | transportation_amount | numeric | Y | - |  |
| 46 | phone_allowance | boolean | Y | false |  |
| 47 | phone_amount | numeric | Y | - |  |
| 48 | car_allowance | boolean | Y | false |  |
| 49 | car_value | numeric | Y | - |  |

#### 282. `employee_certifications`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | employee_id | uuid | Y | - |  |
| 3 | training_id | uuid | Y | - | FK → trainings.id |
| 4 | certification_name | character varying | Y | - |  |
| 5 | certificate_number | character varying | Y | - |  |
| 6 | issue_date | date | Y | - |  |
| 7 | expiry_date | date | Y | - |  |
| 8 | status | character varying | Y | 'valid'::character varying |  |
| 9 | document_url | character varying | Y | - |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |

#### 283. `employees`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('employees_id_seq'::regclass) | 🔑 PK |
| 2 | employee_number | character varying | Y | - | UNIQUE |
| 3 | first_name | character varying | Y | - |  |
| 4 | last_name | character varying | Y | - |  |
| 5 | full_name | character varying | Y | - |  |
| 6 | id_number | character varying | Y | - |  |
| 7 | email | character varying | Y | - |  |
| 8 | phone | character varying | Y | - |  |
| 9 | department | character varying | Y | 'כללי'::character varying |  |
| 10 | job_title | character varying | Y | - |  |
| 11 | employment_type | character varying | Y | 'full_time'::character varying |  |
| 12 | start_date | date | Y | - |  |
| 13 | end_date | date | Y | - |  |
| 14 | base_salary | numeric | Y | 0 |  |
| 15 | status | character varying | Y | 'active'::character varying |  |
| 16 | manager_id | integer | Y | - |  |
| 17 | notes | text | Y | - |  |
| 18 | created_at | timestamp without time zone | N | now() |  |
| 19 | updated_at | timestamp without time zone | N | now() |  |
| 20 | date_of_birth | date | Y | - |  |
| 21 | gender | character varying | Y | - |  |
| 22 | marital_status | character varying | Y | - |  |
| 23 | address | text | Y | - |  |
| 24 | city | character varying | Y | - |  |
| 25 | postal_code | character varying | Y | - |  |
| 26 | country | character varying | Y | 'ישראל'::character varying |  |
| 27 | emergency_contact | character varying | Y | - |  |
| 28 | emergency_phone | character varying | Y | - |  |
| 29 | emergency_relation | character varying | Y | - |  |
| 30 | bank_name | character varying | Y | - |  |
| 31 | bank_branch | character varying | Y | - |  |
| 32 | bank_account | character varying | Y | - |  |
| 33 | national_insurance | character varying | Y | - |  |
| 34 | health_insurance | character varying | Y | - |  |
| 35 | pension_fund | character varying | Y | - |  |
| 36 | education_fund | character varying | Y | - |  |
| 37 | tax_credit_points | numeric | Y | 2.25 |  |
| 38 | disability_percent | numeric | Y | 0 |  |
| 39 | vacation_days_balance | numeric | Y | 0 |  |
| 40 | sick_days_balance | numeric | Y | 0 |  |
| 41 | personal_days_balance | numeric | Y | 0 |  |
| 42 | hire_reason | text | Y | - |  |
| 43 | termination_reason | text | Y | - |  |
| 44 | contract_type | character varying | Y | 'unlimited'::character varying |  |
| 45 | contract_end_date | date | Y | - |  |
| 46 | shift_pattern | character varying | Y | - |  |
| 47 | cost_center | character varying | Y | - |  |
| 48 | work_location | character varying | Y | - |  |
| 49 | skills | text | Y | - |  |
| 50 | certifications | text | Y | - |  |
| 51 | languages | text | Y | - |  |
| 52 | photo_url | text | Y | - |  |
| 53 | travel_allowance | numeric | Y | 0 |  |
| 54 | meal_allowance | numeric | Y | 0 |  |
| 55 | phone_allowance | numeric | Y | 0 |  |
| 56 | overtime_eligible | boolean | Y | true |  |
| 57 | hourly_rate | numeric | Y | - |  |
| 58 | probation_end_date | date | Y | - |  |
| 59 | seniority_date | date | Y | - |  |
| 60 | tax_file_number | character varying | Y | - |  |
| 61 | direct_deposit | boolean | Y | true |  |
| 62 | uniform_size | character varying | Y | - |  |
| 63 | sub_department | character varying | Y | - |  |
| 64 | bonus_target | numeric | Y | 0 |  |
| 65 | commission_rate | numeric | Y | 0 |  |
| 66 | payment_frequency | character varying | Y | 'monthly'::character varying |  |
| 67 | weekly_hours | numeric | Y | 42 |  |
| 68 | vacation_days_annual | numeric | Y | 12 |  |
| 69 | education_json | text | Y | - |  |
| 70 | pension_pct | numeric | Y | 6 |  |
| 71 | performance_score | numeric | Y | - |  |
| 72 | last_review_date | date | Y | - |  |
| 73 | next_review_date | date | Y | - |  |
| 74 | national_id | character varying | Y | - |  |
| 75 | passport_number | character varying | Y | - |  |
| 76 | passport_expiry | date | Y | - |  |
| 77 | driving_license | character varying | Y | - |  |
| 78 | driving_license_type | character varying | Y | - |  |
| 79 | military_service | character varying | Y | - |  |
| 80 | tax_coordination_number | character varying | Y | - |  |
| 81 | disability_pct | numeric | Y | - |  |
| 82 | blood_type | character varying | Y | - |  |
| 83 | allergies | text | Y | - |  |
| 84 | shoe_size | character varying | Y | - |  |
| 85 | locker_number | character varying | Y | - |  |
| 86 | safety_training_date | date | Y | - |  |
| 87 | safety_training_expiry | date | Y | - |  |
| 88 | safety_level | character varying | Y | - |  |
| 89 | safety_certificate | character varying | Y | - |  |
| 90 | forklift_license | boolean | Y | false |  |
| 91 | forklift_license_expiry | date | Y | - |  |
| 92 | crane_license | boolean | Y | false |  |
| 93 | crane_license_expiry | date | Y | - |  |
| 94 | welding_certificate | character varying | Y | - |  |
| 95 | welding_certificate_expiry | date | Y | - |  |
| 96 | heights_certificate | boolean | Y | false |  |
| 97 | heights_certificate_expiry | date | Y | - |  |
| 98 | first_aid_trained | boolean | Y | false |  |
| 99 | first_aid_expiry | date | Y | - |  |
| 100 | ppe_issued | boolean | Y | false |  |
| 101 | ppe_details | text | Y | - |  |
| 102 | medical_exam_date | date | Y | - |  |
| 103 | medical_exam_expiry | date | Y | - |  |
| 104 | medical_restrictions | text | Y | - |  |
| 105 | hearing_test_date | date | Y | - |  |
| 106 | vision_test_date | date | Y | - |  |
| 107 | work_accident_count | integer | Y | 0 |  |
| 108 | last_accident_date | date | Y | - |  |
| 109 | mobile_phone | character varying | Y | - |  |
| 110 | personal_email | character varying | Y | - |  |
| 111 | secondary_phone | character varying | Y | - |  |
| 112 | emergency_contact2 | character varying | Y | - |  |
| 113 | emergency_phone2 | character varying | Y | - |  |
| 114 | emergency_relation2 | character varying | Y | - |  |
| 115 | children_count | integer | Y | 0 |  |
| 116 | spouse_name | character varying | Y | - |  |
| 117 | spouse_id_number | character varying | Y | - |  |
| 118 | spouse_works | boolean | Y | - |  |
| 119 | new_immigrant | boolean | Y | false |  |
| 120 | immigration_date | date | Y | - |  |
| 121 | residence_permit | character varying | Y | - |  |
| 122 | residence_permit_expiry | date | Y | - |  |
| 123 | gross_salary | numeric | Y | 0 |  |
| 124 | net_salary | numeric | Y | 0 |  |
| 125 | salary_currency | character varying | Y | 'ILS'::character varying |  |
| 126 | last_raise_date | date | Y | - |  |
| 127 | last_raise_amount | numeric | Y | - |  |
| 128 | last_raise_percent | numeric | Y | - |  |
| 129 | employer_pension_pct | numeric | Y | 6.5 |  |
| 130 | employee_pension_pct | numeric | Y | 6 |  |
| 131 | severance_pct | numeric | Y | 8.33 |  |
| 132 | education_fund_employer_pct | numeric | Y | 7.5 |  |
| 133 | education_fund_employee_pct | numeric | Y | 2.5 |  |
| 134 | income_tax_bracket | character varying | Y | - |  |
| 135 | convalescence_days | integer | Y | 0 |  |
| 136 | convalescence_per_day | numeric | Y | - |  |
| 137 | car_allowance | boolean | Y | false |  |
| 138 | car_value | numeric | Y | - |  |
| 139 | car_type | character varying | Y | - |  |
| 140 | car_number | character varying | Y | - |  |
| 141 | production_station | character varying | Y | - |  |
| 142 | primary_machine_id | integer | Y | - |  |
| 143 | secondary_skills | text | Y | - |  |
| 144 | can_operate_machines | text | Y | - |  |
| 145 | tool_allowance | numeric | Y | 0 |  |
| 146 | quality_rating | numeric | Y | - |  |
| 147 | productivity_rating | numeric | Y | - |  |
| 148 | attendance_rating | numeric | Y | - |  |
| 149 | team_name | character varying | Y | - |  |
| 150 | team_leader | boolean | Y | false |  |
| 151 | shift_preference | character varying | Y | - |  |
| 152 | form_101_signed | boolean | Y | false |  |
| 153 | form_101_date | date | Y | - |  |
| 154 | nda_signed | boolean | Y | false |  |
| 155 | nda_date | date | Y | - |  |
| 156 | contract_signed | boolean | Y | false |  |
| 157 | contract_url | text | Y | - |  |
| 158 | documents_url | text | Y | - |  |
| 159 | badge_number | character varying | Y | - |  |
| 160 | access_level | character varying | Y | - |  |
| 161 | parking_spot | character varying | Y | - |  |
| 162 | company_phone | character varying | Y | - |  |
| 163 | company_email | character varying | Y | - |  |
| 164 | linkedin_url | text | Y | - |  |
| 165 | tags | text | Y | - |  |
| 166 | position | text | Y | - |  |
| 167 | position_level | character varying | Y | - |  |
| 168 | grade | character varying | Y | - |  |
| 169 | rank | integer | Y | - |  |
| 170 | reporting_to | character varying | Y | - |  |
| 171 | direct_reports_count | integer | Y | 0 |  |
| 172 | functional_manager | character varying | Y | - |  |
| 173 | hire_date | date | Y | - |  |
| 174 | original_hire_date | date | Y | - |  |
| 175 | rehire_date | date | Y | - |  |
| 176 | termination_date | date | Y | - |  |
| 177 | termination_type | character varying | Y | - |  |
| 178 | eligible_for_rehire | boolean | Y | true |  |
| 179 | notice_period_days | integer | Y | 30 |  |
| 180 | notice_given_date | date | Y | - |  |
| 181 | last_working_day | date | Y | - |  |
| 182 | clearance_completed | boolean | Y | false |  |
| 183 | exit_interview_done | boolean | Y | false |  |
| 184 | exit_interview_notes | text | Y | - |  |
| 185 | separation_reason | text | Y | - |  |
| 186 | street | character varying | Y | - |  |
| 187 | house_number | character varying | Y | - |  |
| 188 | apartment | character varying | Y | - |  |
| 189 | neighborhood | character varying | Y | - |  |
| 190 | region | character varying | Y | - |  |
| 191 | gps_latitude | numeric | Y | - |  |
| 192 | gps_longitude | numeric | Y | - |  |
| 193 | home_phone | character varying | Y | - |  |
| 194 | work_phone | character varying | Y | - |  |
| 195 | fax | character varying | Y | - |  |
| 196 | whatsapp | character varying | Y | - |  |
| 197 | preferred_contact_method | character varying | Y | - |  |
| 198 | nationality | character varying | Y | - |  |
| 199 | ethnicity | character varying | Y | - |  |
| 200 | religion | character varying | Y | - |  |
| 201 | iban | character varying | Y | - |  |
| 202 | swift_code | character varying | Y | - |  |
| 203 | social_security_number | character varying | Y | - |  |
| 204 | tax_status | character varying | Y | - |  |
| 205 | tax_exemption | boolean | Y | false |  |
| 206 | tax_exemption_details | text | Y | - |  |
| 207 | work_permit | character varying | Y | - |  |
| 208 | work_permit_expiry | date | Y | - |  |
| 209 | visa_type | character varying | Y | - |  |
| 210 | visa_expiry | date | Y | - |  |
| 211 | union_member | boolean | Y | false |  |
| 212 | union_name | character varying | Y | - |  |
| 213 | collective_agreement | character varying | Y | - |  |
| 214 | education_level | character varying | Y | - |  |
| 215 | university | character varying | Y | - |  |
| 216 | degree | character varying | Y | - |  |
| 217 | graduation_year | integer | Y | - |  |
| 218 | professional_license | character varying | Y | - |  |
| 219 | professional_license_expiry | date | Y | - |  |
| 220 | training_budget | numeric | Y | 0 |  |
| 221 | training_hours_ytd | numeric | Y | 0 |  |
| 222 | required_training_hours | numeric | Y | - |  |
| 223 | special_needs | text | Y | - |  |
| 224 | accommodation_required | boolean | Y | false |  |
| 225 | accommodation_details | text | Y | - |  |
| 226 | disciplinary_warnings | integer | Y | 0 |  |
| 227 | last_disciplinary_date | date | Y | - |  |
| 228 | disciplinary_notes | text | Y | - |  |
| 229 | reward_points | integer | Y | 0 |  |
| 230 | employee_of_month_count | integer | Y | 0 |  |
| 231 | referral_bonus_eligible | boolean | Y | false |  |
| 232 | referred_by | character varying | Y | - |  |
| 233 | recruitment_source | character varying | Y | - |  |
| 234 | onboarding_completed | boolean | Y | false |  |
| 235 | onboarding_date | date | Y | - |  |
| 236 | mentor | character varying | Y | - |  |
| 237 | buddy | character varying | Y | - |  |
| 238 | it_equipment_issued | text | Y | - |  |
| 239 | it_access_granted | boolean | Y | false |  |
| 240 | vpn_access | boolean | Y | false |  |
| 241 | system_username | character varying | Y | - |  |
| 242 | last_login | timestamp with time zone | Y | - |  |
| 243 | finger_print_enrolled | boolean | Y | false |  |
| 244 | face_recognition_enrolled | boolean | Y | false |  |
| 245 | key_card_number | character varying | Y | - |  |
| 246 | gate_access_zones | text | Y | - |  |
| 247 | working_from_home_days | integer | Y | 0 |  |
| 248 | flex_time_eligible | boolean | Y | false |  |
| 249 | annual_leave_taken | numeric | Y | 0 |  |
| 250 | sick_leave_taken | numeric | Y | 0 |  |
| 251 | reserve_duty_days | integer | Y | 0 |  |
| 252 | last_reserve_duty | date | Y | - |  |
| 253 | maternity_leave_start | date | Y | - |  |
| 254 | maternity_leave_end | date | Y | - |  |
| 255 | sabbatical_eligible | boolean | Y | false |  |
| 256 | tax_id | text | Y | - |  |
| 257 | vacation_days_used | integer | Y | 0 |  |
| 258 | emergency_contact_name | text | Y | - |  |
| 259 | emergency_contact_phone | text | Y | - |  |
| 260 | insurance_plan | text | Y | - |  |
| 261 | preferred_notification_channel | character varying | Y | 'whatsapp'::character varying |  |
| 262 | notification_opt_out | boolean | Y | false |  |

#### 284. `hr_meetings`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('hr_meetings_id_seq'::regclass) | 🔑 PK |
| 2 | meeting_number | character varying | Y | - | UNIQUE |
| 3 | title | character varying | N | - |  |
| 4 | meeting_date | date | Y | - |  |
| 5 | meeting_time | character varying | Y | - |  |
| 6 | duration_minutes | integer | Y | 60 |  |
| 7 | meeting_type | character varying | Y | 'internal'::character varying |  |
| 8 | participants | text | Y | - |  |
| 9 | location | character varying | Y | - |  |
| 10 | notes | text | Y | - |  |
| 11 | ai_summary | text | Y | - |  |
| 12 | status | character varying | Y | 'scheduled'::character varying |  |
| 13 | created_by | integer | Y | - |  |
| 14 | created_by_name | character varying | Y | - |  |
| 15 | created_at | timestamp without time zone | Y | now() |  |
| 16 | updated_at | timestamp without time zone | Y | now() |  |
| 17 | employee_id | integer | Y | - |  |
| 18 | employee_name | character varying | Y | - |  |
| 19 | department | character varying | Y | - |  |
| 20 | attendees | text | Y | - |  |
| 21 | agenda | text | Y | - |  |
| 22 | summary | text | Y | - |  |
| 23 | action_items | text | Y | - |  |
| 24 | follow_up_date | date | Y | - |  |
| 25 | follow_up_completed | boolean | Y | false |  |
| 26 | confidential | boolean | Y | false |  |
| 27 | documents_url | text | Y | - |  |
| 28 | tags | text | Y | - |  |
| 29 | disciplinary | boolean | Y | false |  |
| 30 | disciplinary_type | character varying | Y | - |  |
| 31 | warning_level | integer | Y | - |  |
| 32 | previous_warning_date | date | Y | - |  |
| 33 | improvement_plan | boolean | Y | false |  |
| 34 | improvement_plan_deadline | date | Y | - |  |
| 35 | improvement_plan_met | boolean | Y | - |  |
| 36 | employee_response | text | Y | - |  |
| 37 | union_representative | character varying | Y | - |  |
| 38 | union_rep_present | boolean | Y | false |  |
| 39 | witness_name | character varying | Y | - |  |
| 40 | signed_by_employee | boolean | Y | false |  |
| 41 | signed_date | date | Y | - |  |

#### 285. `leave_requests`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('leave_requests_id_seq'::regc... | 🔑 PK |
| 2 | request_number | character varying | N | - | UNIQUE |
| 3 | employee_name | text | N | - |  |
| 4 | employee_id_ref | integer | Y | - |  |
| 5 | department | character varying | Y | - |  |
| 6 | leave_type | character varying | N | 'vacation'::character varying |  |
| 7 | start_date | date | N | - |  |
| 8 | end_date | date | N | - |  |
| 9 | total_days | numeric | Y | 0 |  |
| 10 | is_half_day | boolean | Y | false |  |
| 11 | reason | text | Y | - |  |
| 12 | status | character varying | Y | 'pending'::character varying |  |
| 13 | approved_by | integer | Y | - |  |
| 14 | approved_by_name | text | Y | - |  |
| 15 | approved_at | timestamp with time zone | Y | - |  |
| 16 | rejection_reason | text | Y | - |  |
| 17 | substitute_name | text | Y | - |  |
| 18 | remaining_balance | numeric | Y | - |  |
| 19 | is_paid | boolean | Y | true |  |
| 20 | attachment_url | text | Y | - |  |
| 21 | notes | text | Y | - |  |
| 22 | created_at | timestamp with time zone | Y | now() |  |
| 23 | updated_at | timestamp with time zone | Y | now() |  |
| 24 | half_day | boolean | Y | false |  |
| 25 | half_day_type | character varying | Y | - |  |
| 26 | rejected_reason | text | Y | - |  |
| 27 | cancelled_at | timestamp with time zone | Y | - |  |
| 28 | relief_employee_id | integer | Y | - |  |
| 29 | medical_certificate | boolean | Y | false |  |
| 30 | return_date | date | Y | - |  |
| 31 | days_count | numeric | Y | - |  |
| 32 | leave_balance | numeric | Y | - |  |
| 33 | certificate_url | text | Y | - |  |
| 34 | handover_to | character varying | Y | - |  |
| 35 | handover_notes | text | Y | - |  |
| 36 | cancellation_reason | text | Y | - |  |
| 37 | employee_id | integer | Y | - |  |
| 38 | employee_number | character varying | Y | - |  |
| 39 | manager_id | integer | Y | - |  |
| 40 | manager_name | character varying | Y | - |  |
| 41 | balance_before | numeric | Y | - |  |
| 42 | balance_after | numeric | Y | - |  |
| 43 | medical_certificate_url | text | Y | - |  |
| 44 | substitute_employee | character varying | Y | - |  |
| 45 | substitute_employee_id | integer | Y | - |  |
| 46 | payroll_processed | boolean | Y | false |  |
| 47 | payroll_record_id | integer | Y | - |  |
| 48 | tags | text | Y | - |  |
| 49 | sick_fund | character varying | Y | - |  |
| 50 | sick_certificate_number | character varying | Y | - |  |
| 51 | military_reserve_days | boolean | Y | false |  |
| 52 | military_order_url | text | Y | - |  |
| 53 | maternity_leave | boolean | Y | false |  |
| 54 | maternity_start_date | date | Y | - |  |
| 55 | maternity_end_date | date | Y | - |  |
| 56 | unpaid_leave | boolean | Y | false |  |

#### 286. `payroll_entries`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | payroll_run_id | uuid | Y | - | FK → payroll_runs.id |
| 3 | employee_id | uuid | Y | - |  |
| 4 | base_salary | integer | Y | 0 |  |
| 5 | overtime_hours | numeric | Y | 0 |  |
| 6 | overtime_amount | integer | Y | 0 |  |
| 7 | bonuses | integer | Y | 0 |  |
| 8 | commissions | integer | Y | 0 |  |
| 9 | allowances | jsonb | Y | '{}'::jsonb |  |
| 10 | gross_salary | integer | Y | 0 |  |
| 11 | income_tax | integer | Y | 0 |  |
| 12 | social_security | integer | Y | 0 |  |
| 13 | health_insurance | integer | Y | 0 |  |
| 14 | pension_employee | integer | Y | 0 |  |
| 15 | pension_employer | integer | Y | 0 |  |
| 16 | other_deductions | jsonb | Y | '{}'::jsonb |  |
| 17 | net_salary | integer | Y | 0 |  |
| 18 | total_employer_cost | integer | Y | 0 |  |
| 19 | payment_method | character varying | Y | 'bank_transfer'::character varying |  |
| 20 | payment_date | date | Y | - |  |
| 21 | notes | text | Y | - |  |
| 22 | created_at | timestamp without time zone | Y | now() |  |

#### 287. `payroll_periods`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('payroll_periods_id_seq'::reg... | 🔑 PK |
| 2 | period_number | character varying | N | - | UNIQUE |
| 3 | period_month | integer | N | - |  |
| 4 | period_year | integer | N | - |  |
| 5 | status | character varying | Y | 'open'::character varying |  |
| 6 | total_employee_gross | numeric | Y | 0 |  |
| 7 | total_employee_net | numeric | Y | 0 |  |
| 8 | total_employee_deductions | numeric | Y | 0 |  |
| 9 | total_employer_cost | numeric | Y | 0 |  |
| 10 | total_contractor_gross | numeric | Y | 0 |  |
| 11 | total_contractor_deductions | numeric | Y | 0 |  |
| 12 | total_contractor_net | numeric | Y | 0 |  |
| 13 | total_combined | numeric | Y | 0 |  |
| 14 | employee_count | integer | Y | 0 |  |
| 15 | contractor_count | integer | Y | 0 |  |
| 16 | absence_count | integer | Y | 0 |  |
| 17 | overtime_total_hours | numeric | Y | 0 |  |
| 18 | closed_by | character varying | Y | - |  |
| 19 | closed_at | timestamp without time zone | Y | - |  |
| 20 | notes | text | Y | - |  |
| 21 | created_at | timestamp without time zone | Y | now() |  |
| 22 | updated_at | timestamp without time zone | Y | now() |  |
| 23 | period_name | character varying | Y | - |  |
| 24 | fiscal_year | integer | Y | - |  |
| 25 | fiscal_month | integer | Y | - |  |
| 26 | start_date | date | Y | - |  |
| 27 | end_date | date | Y | - |  |
| 28 | payment_date | date | Y | - |  |
| 29 | total_gross | numeric | Y | 0 |  |
| 30 | total_net | numeric | Y | 0 |  |
| 31 | total_tax | numeric | Y | 0 |  |
| 32 | total_ni_employee | numeric | Y | 0 |  |
| 33 | total_ni_employer | numeric | Y | 0 |  |
| 34 | total_pension_employee | numeric | Y | 0 |  |
| 35 | total_pension_employer | numeric | Y | 0 |  |
| 36 | total_education_fund | numeric | Y | 0 |  |
| 37 | total_severance | numeric | Y | 0 |  |
| 38 | bank_file_generated | boolean | Y | false |  |
| 39 | bank_file_url | text | Y | - |  |
| 40 | bank_file_date | date | Y | - |  |
| 41 | tax_report_filed | boolean | Y | false |  |
| 42 | tax_report_date | date | Y | - |  |
| 43 | ni_report_filed | boolean | Y | false |  |
| 44 | ni_report_date | date | Y | - |  |
| 45 | pension_report_filed | boolean | Y | false |  |
| 46 | pension_report_date | date | Y | - |  |
| 47 | approved_by | character varying | Y | - |  |
| 48 | approved_at | timestamp with time zone | Y | - |  |
| 49 | locked | boolean | Y | false |  |
| 50 | locked_by | character varying | Y | - |  |
| 51 | locked_at | timestamp with time zone | Y | - |  |
| 52 | journal_entry_id | integer | Y | - |  |
| 53 | documents_url | text | Y | - |  |
| 54 | tags | text | Y | - |  |

#### 288. `payroll_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('payroll_records_id_seq'::reg... | 🔑 PK |
| 2 | record_number | character varying | Y | - | UNIQUE |
| 3 | employee_name | character varying | N | - |  |
| 4 | employee_id_ref | integer | Y | - |  |
| 5 | period_month | integer | N | - |  |
| 6 | period_year | integer | N | - |  |
| 7 | base_salary | numeric | Y | 0 |  |
| 8 | overtime_hours | numeric | Y | 0 |  |
| 9 | overtime_pay | numeric | Y | 0 |  |
| 10 | bonus | numeric | Y | 0 |  |
| 11 | commission | numeric | Y | 0 |  |
| 12 | allowances | numeric | Y | 0 |  |
| 13 | travel_allowance | numeric | Y | 0 |  |
| 14 | gross_salary | numeric | Y | 0 |  |
| 15 | income_tax | numeric | Y | 0 |  |
| 16 | national_insurance | numeric | Y | 0 |  |
| 17 | health_insurance | numeric | Y | 0 |  |
| 18 | pension_employee | numeric | Y | 0 |  |
| 19 | pension_employer | numeric | Y | 0 |  |
| 20 | severance_fund | numeric | Y | 0 |  |
| 21 | education_fund | numeric | Y | 0 |  |
| 22 | other_deductions | numeric | Y | 0 |  |
| 23 | total_deductions | numeric | Y | - |  |
| 24 | net_salary | numeric | Y | - |  |
| 25 | employer_cost | numeric | Y | - |  |
| 26 | bank_name | character varying | Y | - |  |
| 27 | bank_branch | character varying | Y | - |  |
| 28 | bank_account | character varying | Y | - |  |
| 29 | payment_method | character varying | Y | 'bank_transfer'::character varying |  |
| 30 | status | character varying | Y | 'draft'::character varying |  |
| 31 | approved_by | character varying | Y | - |  |
| 32 | payment_date | date | Y | - |  |
| 33 | department | character varying | Y | - |  |
| 34 | notes | text | Y | - |  |
| 35 | created_at | timestamp without time zone | Y | now() |  |
| 36 | updated_at | timestamp without time zone | Y | now() |  |
| 37 | education_employee | numeric | Y | 0 |  |
| 38 | education_employer | numeric | Y | 0 |  |
| 39 | severance_contribution | numeric | Y | 0 |  |
| 40 | national_insurance_employee | numeric | Y | 0 |  |
| 41 | national_insurance_employer | numeric | Y | 0 |  |
| 42 | health_insurance_deduction | numeric | Y | 0 |  |
| 43 | meal_allowance | numeric | Y | 0 |  |
| 44 | phone_allowance | numeric | Y | 0 |  |
| 45 | clothing_allowance | numeric | Y | 0 |  |
| 46 | convalescence_pay | numeric | Y | 0 |  |
| 47 | holiday_bonus | numeric | Y | 0 |  |
| 48 | retroactive_pay | numeric | Y | 0 |  |
| 49 | loan_deduction | numeric | Y | 0 |  |
| 50 | union_dues | numeric | Y | 0 |  |
| 51 | cost_center | character varying | Y | - |  |
| 52 | approved_at | timestamp with time zone | Y | - |  |
| 53 | payment_reference | character varying | Y | - |  |
| 54 | locked | boolean | Y | false |  |
| 55 | payroll_number | character varying | Y | - |  |
| 56 | employee_id | integer | Y | - |  |
| 57 | employee_number | character varying | Y | - |  |
| 58 | position | character varying | Y | - |  |
| 59 | pay_period_start | date | Y | - |  |
| 60 | pay_period_end | date | Y | - |  |
| 61 | basic_salary | numeric | Y | 0 |  |
| 62 | overtime_rate | numeric | Y | 1.25 |  |
| 63 | overtime_amount | numeric | Y | 0 |  |
| 64 | shift_allowance | numeric | Y | 0 |  |
| 65 | hazard_pay | numeric | Y | 0 |  |
| 66 | transportation_allowance | numeric | Y | 0 |  |
| 67 | education_fund_employee | numeric | Y | 0 |  |
| 68 | education_fund_employer | numeric | Y | 0 |  |
| 69 | severance_provision | numeric | Y | 0 |  |
| 70 | total_cost | numeric | Y | 0 |  |
| 71 | bank_transfer_ref | character varying | Y | - |  |
| 72 | vacation_days_taken | numeric | Y | 0 |  |
| 73 | sick_days_taken | numeric | Y | 0 |  |
| 74 | absence_days | numeric | Y | 0 |  |
| 75 | work_days | integer | Y | - |  |
| 76 | tax_credit_points | numeric | Y | - |  |
| 77 | cumulative_gross_ytd | numeric | Y | 0 |  |
| 78 | cumulative_tax_ytd | numeric | Y | 0 |  |
| 79 | cumulative_ni_ytd | numeric | Y | 0 |  |
| 80 | tags | text | Y | - |  |
| 81 | recuperation_pay | numeric | Y | 0 |  |
| 82 | form_106_generated | boolean | Y | false |  |
| 83 | form_106_url | text | Y | - |  |
| 84 | batch_id | integer | Y | - |  |
| 85 | batch_number | character varying | Y | - |  |
| 86 | journal_entry_id | integer | Y | - |  |
| 87 | documents_url | text | Y | - |  |

#### 289. `payroll_runs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | period_month | integer | Y | - |  |
| 3 | period_year | integer | Y | - |  |
| 4 | run_date | date | Y | - |  |
| 5 | status | character varying | Y | 'draft'::character varying |  |
| 6 | total_gross | integer | Y | 0 |  |
| 7 | total_net | integer | Y | 0 |  |
| 8 | total_employer_cost | integer | Y | 0 |  |
| 9 | approved_by | uuid | Y | - |  |
| 10 | approved_at | timestamp without time zone | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | created_by | uuid | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |

#### 290. `project_timesheets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_timesheets_id_seq'::... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | employee_id | integer | Y | - |  |
| 4 | date | date | Y | - |  |
| 5 | hours | numeric | Y | - |  |
| 6 | task | text | Y | - |  |
| 7 | notes | text | Y | - |  |
| 8 | approved | boolean | Y | false |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 291. `project_timesheets_ent`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_timesheets_ent_id_se... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | employee_name | text | Y | - |  |
| 4 | date | date | Y | - |  |
| 5 | hours | numeric | Y | - |  |
| 6 | task | text | Y | - |  |
| 7 | billable | boolean | Y | true |  |
| 8 | approved | boolean | Y | false |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 292. `timesheet_entries`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('timesheet_entries_id_seq'::r... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | task_id | integer | Y | - |  |
| 4 | employee | text | Y | - |  |
| 5 | date | date | Y | - |  |
| 6 | hours | numeric | Y | - |  |
| 7 | description | text | Y | - |  |
| 8 | status | text | Y | 'draft'::text |  |
| 9 | approved_by | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 293. `training_records`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('training_records_id_seq'::re... | 🔑 PK |
| 2 | training_number | character varying | N | - | UNIQUE |
| 3 | training_name | text | N | - |  |
| 4 | training_type | character varying | N | 'internal'::character varying |  |
| 5 | category | character varying | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | trainer_name | text | Y | - |  |
| 8 | trainer_type | character varying | Y | 'internal'::character varying |  |
| 9 | location | character varying | Y | - |  |
| 10 | start_date | date | N | - |  |
| 11 | end_date | date | Y | - |  |
| 12 | duration_hours | numeric | Y | 0 |  |
| 13 | max_participants | integer | Y | 20 |  |
| 14 | current_participants | integer | Y | 0 |  |
| 15 | target_audience | text | Y | - |  |
| 16 | department | character varying | Y | - |  |
| 17 | cost_per_person | numeric | Y | 0 |  |
| 18 | total_cost | numeric | Y | 0 |  |
| 19 | currency | character varying | Y | 'ILS'::character varying |  |
| 20 | is_mandatory | boolean | Y | false |  |
| 21 | is_certification | boolean | Y | false |  |
| 22 | certification_name | character varying | Y | - |  |
| 23 | certification_expiry | date | Y | - |  |
| 24 | status | character varying | Y | 'planned'::character varying |  |
| 25 | satisfaction_score | numeric | Y | - |  |
| 26 | pass_rate | numeric | Y | - |  |
| 27 | materials_url | text | Y | - |  |
| 28 | notes | text | Y | - |  |
| 29 | created_by | integer | Y | - |  |
| 30 | created_by_name | text | Y | - |  |
| 31 | created_at | timestamp with time zone | Y | now() |  |
| 32 | updated_at | timestamp with time zone | Y | now() |  |
| 33 | provider | character varying | Y | - |  |
| 34 | passing_score | numeric | Y | - |  |
| 35 | actual_score | numeric | Y | - |  |
| 36 | certificate_number | character varying | Y | - |  |
| 37 | certificate_expiry | date | Y | - |  |
| 38 | feedback_rating | integer | Y | - |  |
| 39 | retraining_due | date | Y | - |  |
| 40 | budget_allocated | numeric | Y | - |  |
| 41 | actual_cost_per_person | numeric | Y | - |  |
| 42 | employee_id | integer | Y | - |  |
| 43 | employee_name | character varying | Y | - |  |
| 44 | instructor | character varying | Y | - |  |
| 45 | cost | numeric | Y | 0 |  |
| 46 | cost_currency | character varying | Y | 'ILS'::character varying |  |
| 47 | certificate_url | text | Y | - |  |
| 48 | score | numeric | Y | - |  |
| 49 | passed | boolean | Y | - |  |
| 50 | mandatory | boolean | Y | false |  |
| 51 | safety_related | boolean | Y | false |  |
| 52 | regulatory_required | boolean | Y | false |  |
| 53 | renewal_required | boolean | Y | false |  |
| 54 | renewal_period_months | integer | Y | - |  |
| 55 | next_renewal_date | date | Y | - |  |
| 56 | documents_url | text | Y | - |  |
| 57 | tags | text | Y | - |  |
| 58 | employee_number | character varying | Y | - |  |
| 59 | training_category | character varying | Y | - |  |
| 60 | trainer | character varying | Y | - |  |
| 61 | trainer_qualification | character varying | Y | - |  |
| 62 | external_provider | character varying | Y | - |  |
| 63 | regulatory_requirement | boolean | Y | false |  |
| 64 | regulatory_authority | character varying | Y | - |  |
| 65 | valid_from | date | Y | - |  |
| 66 | valid_until | date | Y | - |  |
| 67 | renewal_reminder_date | date | Y | - |  |
| 68 | forklift_license | boolean | Y | false |  |
| 69 | crane_license | boolean | Y | false |  |
| 70 | welding_certification | character varying | Y | - |  |
| 71 | first_aid | boolean | Y | false |  |
| 72 | fire_safety | boolean | Y | false |  |
| 73 | electrical_safety | boolean | Y | false |  |
| 74 | working_at_heights | boolean | Y | false |  |
| 75 | confined_spaces | boolean | Y | false |  |
| 76 | hazmat_handling | boolean | Y | false |  |
| 77 | ppe_training | boolean | Y | false |  |
| 78 | lockout_tagout | boolean | Y | false |  |
| 79 | hot_work_permit | boolean | Y | false |  |
| 80 | glass_handling | boolean | Y | false |  |
| 81 | metal_cutting | boolean | Y | false |  |
| 82 | cnc_operation | boolean | Y | false |  |
| 83 | quality_systems | boolean | Y | false |  |

#### 294. `trainings`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | training_type | character varying | Y | 'technical'::character varying |  |
| 5 | instructor | character varying | Y | - |  |
| 6 | start_date | date | Y | - |  |
| 7 | end_date | date | Y | - |  |
| 8 | location | character varying | Y | - |  |
| 9 | max_participants | integer | Y | - |  |
| 10 | cost | integer | Y | 0 |  |
| 11 | certification_name | character varying | Y | - |  |
| 12 | certification_validity_months | integer | Y | - |  |
| 13 | is_mandatory | boolean | Y | false |  |
| 14 | status | character varying | Y | 'planned'::character varying |  |
| 15 | created_at | timestamp without time zone | Y | now() |  |
| 16 | updated_at | timestamp without time zone | Y | now() |  |

---

### ניהול איכות (Quality Management) (2 טבלאות)

#### 295. `compliance_certificates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('compliance_certificates_id_s... | 🔑 PK |
| 2 | cert_number | text | N | - | UNIQUE |
| 3 | cert_name | text | N | - |  |
| 4 | cert_type | text | N | 'תעודת מקור'::text |  |
| 5 | status | text | N | 'פעיל'::text |  |
| 6 | linked_import_order_id | integer | Y | - |  |
| 7 | linked_supplier | text | Y | - |  |
| 8 | supplier_country | text | Y | - |  |
| 9 | product_name | text | Y | - |  |
| 10 | hs_code | text | Y | - |  |
| 11 | issuing_authority | text | Y | - |  |
| 12 | issuing_country | text | Y | - |  |
| 13 | document_number | text | Y | - |  |
| 14 | reference_number | text | Y | - |  |
| 15 | issue_date | date | Y | - |  |
| 16 | expiry_date | date | Y | - |  |
| 17 | renewal_date | date | Y | - |  |
| 18 | last_audit_date | date | Y | - |  |
| 19 | next_audit_date | date | Y | - |  |
| 20 | scope | text | Y | - |  |
| 21 | standards | text | Y | - |  |
| 22 | accreditation_body | text | Y | - |  |
| 23 | certificate_holder | text | Y | - |  |
| 24 | holder_address | text | Y | - |  |
| 25 | file_url | text | Y | - |  |
| 26 | file_name | text | Y | - |  |
| 27 | verification_url | text | Y | - |  |
| 28 | verification_status | text | Y | 'לא אומת'::text |  |
| 29 | verified_by | text | Y | - |  |
| 30 | verified_date | date | Y | - |  |
| 31 | is_mandatory | boolean | Y | false |  |
| 32 | is_original | boolean | Y | false |  |
| 33 | copies_count | integer | Y | 0 |  |
| 34 | notarized | boolean | Y | false |  |
| 35 | apostille | boolean | Y | false |  |
| 36 | translated | boolean | Y | false |  |
| 37 | translation_language | text | Y | - |  |
| 38 | linked_lc_id | integer | Y | - |  |
| 39 | linked_customs_id | integer | Y | - |  |
| 40 | rejection_reason | text | Y | - |  |
| 41 | amendment_notes | text | Y | - |  |
| 42 | priority | text | Y | 'רגיל'::text |  |
| 43 | category | text | Y | 'סחר'::text |  |
| 44 | tags | text | Y | - |  |
| 45 | notes | text | Y | - |  |
| 46 | created_by | text | Y | - |  |
| 47 | approved_by | text | Y | - |  |
| 48 | approved_date | date | Y | - |  |
| 49 | created_at | timestamp without time zone | N | now() |  |
| 50 | updated_at | timestamp without time zone | N | now() |  |
| 51 | issuing_body | character varying | Y | - |  |
| 52 | certificate_scope | text | Y | - |  |
| 53 | audit_frequency | character varying | Y | - |  |
| 54 | non_conformities | integer | Y | 0 |  |
| 55 | corrective_actions_open | integer | Y | 0 |  |
| 56 | certificate_file_url | text | Y | - |  |
| 57 | certificate_number | character varying | Y | - |  |
| 58 | certificate_type | character varying | Y | - |  |
| 59 | scope_description | text | Y | - |  |
| 60 | audit_date | date | Y | - |  |
| 61 | auditor | character varying | Y | - |  |
| 62 | audit_findings | text | Y | - |  |
| 63 | corrective_actions_required | text | Y | - |  |
| 64 | corrective_actions_deadline | date | Y | - |  |
| 65 | corrective_actions_complete | boolean | Y | false |  |
| 66 | renewal_cost | numeric | Y | - |  |
| 67 | renewal_reminder_date | date | Y | - |  |
| 68 | documents_url | text | Y | - |  |
| 69 | standard_name | character varying | Y | - |  |
| 70 | standard_number | character varying | Y | - |  |
| 71 | product_id | integer | Y | - |  |
| 72 | material_id | integer | Y | - |  |
| 73 | material_name | character varying | Y | - |  |
| 74 | supplier_id | integer | Y | - |  |
| 75 | supplier_name | character varying | Y | - |  |
| 76 | test_lab | character varying | Y | - |  |
| 77 | test_lab_accreditation | character varying | Y | - |  |
| 78 | test_report_number | character varying | Y | - |  |
| 79 | test_report_url | text | Y | - |  |
| 80 | si_standard | boolean | Y | false |  |
| 81 | ce_mark | boolean | Y | false |  |
| 82 | en_standard | boolean | Y | false |  |
| 83 | iso_standard | boolean | Y | false |  |
| 84 | fire_rating | character varying | Y | - |  |
| 85 | thermal_rating | character varying | Y | - |  |
| 86 | acoustic_rating | character varying | Y | - |  |
| 87 | wind_load_rating | character varying | Y | - |  |
| 88 | water_tightness_rating | character varying | Y | - |  |
| 89 | air_permeability_rating | character varying | Y | - |  |
| 90 | burglar_resistance_rating | character varying | Y | - |  |
| 91 | renewal_in_progress | boolean | Y | false |  |
| 92 | renewal_application_date | date | Y | - |  |
| 93 | renewal_expected_date | date | Y | - |  |

#### 296. `quality_inspections`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('quality_inspections_id_seq':... | 🔑 PK |
| 2 | inspection_number | character varying | N | - | UNIQUE |
| 3 | inspection_type | character varying | N | 'incoming'::character varying |  |
| 4 | inspection_date | date | N | CURRENT_DATE |  |
| 5 | product_name | text | N | - |  |
| 6 | product_code | character varying | Y | - |  |
| 7 | batch_number | character varying | Y | - |  |
| 8 | order_reference | character varying | Y | - |  |
| 9 | supplier_name | text | Y | - |  |
| 10 | customer_name | text | Y | - |  |
| 11 | inspector_name | text | N | - |  |
| 12 | inspection_method | character varying | Y | - |  |
| 13 | sample_size | integer | Y | 1 |  |
| 14 | accepted_count | integer | Y | 0 |  |
| 15 | rejected_count | integer | Y | 0 |  |
| 16 | defect_type | character varying | Y | - |  |
| 17 | defect_description | text | Y | - |  |
| 18 | severity | character varying | Y | 'minor'::character varying |  |
| 19 | measurements | text | Y | - |  |
| 20 | specifications | text | Y | - |  |
| 21 | result | character varying | Y | 'pending'::character varying |  |
| 22 | corrective_action | text | Y | - |  |
| 23 | preventive_action | text | Y | - |  |
| 24 | disposition | character varying | Y | 'pending'::character varying |  |
| 25 | quarantine_location | character varying | Y | - |  |
| 26 | rework_required | boolean | Y | false |  |
| 27 | rework_completed | boolean | Y | false |  |
| 28 | cost_of_quality | numeric | Y | 0 |  |
| 29 | certificate_number | character varying | Y | - |  |
| 30 | photos_url | text | Y | - |  |
| 31 | notes | text | Y | - |  |
| 32 | reviewed_by | text | Y | - |  |
| 33 | reviewed_at | timestamp with time zone | Y | - |  |
| 34 | created_at | timestamp with time zone | Y | now() |  |
| 35 | updated_at | timestamp with time zone | Y | now() |  |
| 36 | sampling_method | character varying | Y | - |  |
| 37 | defects_found | integer | Y | 0 |  |
| 38 | defect_rate | numeric | Y | - |  |
| 39 | standard_reference | character varying | Y | - |  |
| 40 | measurement_tools | text | Y | - |  |
| 41 | environmental_conditions | text | Y | - |  |
| 42 | corrective_action_required | boolean | Y | false |  |
| 43 | corrective_action_details | text | Y | - |  |
| 44 | work_order_id | integer | Y | - |  |
| 45 | production_station | character varying | Y | - |  |
| 46 | product_id | integer | Y | - |  |
| 47 | product_sku | character varying | Y | - |  |
| 48 | batch_id | character varying | Y | - |  |
| 49 | heat_number | character varying | Y | - |  |
| 50 | customer_order_number | character varying | Y | - |  |
| 51 | dimension_check | boolean | Y | false |  |
| 52 | dimension_width | numeric | Y | - |  |
| 53 | dimension_height | numeric | Y | - |  |
| 54 | dimension_tolerance | numeric | Y | - |  |
| 55 | surface_finish_ok | boolean | Y | - |  |
| 56 | color_match_ok | boolean | Y | - |  |
| 57 | weld_quality_ok | boolean | Y | - |  |
| 58 | glass_clarity_ok | boolean | Y | - |  |
| 59 | seal_integrity_ok | boolean | Y | - |  |
| 60 | hardware_function_ok | boolean | Y | - |  |
| 61 | lock_function_ok | boolean | Y | - |  |
| 62 | opening_function_ok | boolean | Y | - |  |
| 63 | water_test_passed | boolean | Y | - |  |
| 64 | air_test_passed | boolean | Y | - |  |
| 65 | load_test_passed | boolean | Y | - |  |
| 66 | safety_glass_verified | boolean | Y | - |  |
| 67 | temper_stamp_verified | boolean | Y | - |  |
| 68 | iso_compliance | character varying | Y | - |  |
| 69 | si_standard_compliance | character varying | Y | - |  |
| 70 | customer_spec_compliance | boolean | Y | - |  |
| 71 | passed | boolean | Y | - |  |
| 72 | hold_reason | text | Y | - |  |
| 73 | release_conditions | text | Y | - |  |
| 74 | retest_required | boolean | Y | false |  |
| 75 | retest_date | date | Y | - |  |
| 76 | tags | text | Y | - |  |
| 77 | pass_count | integer | Y | 0 |  |
| 78 | fail_count | integer | Y | 0 |  |
| 79 | pass_rate | numeric | Y | - |  |
| 80 | rework_description | text | Y | - |  |
| 81 | rework_cost | numeric | Y | 0 |  |
| 82 | scrap_quantity | numeric | Y | 0 |  |
| 83 | scrap_cost | numeric | Y | 0 |  |
| 84 | root_cause | text | Y | - |  |
| 85 | calibration_due_date | date | Y | - |  |
| 86 | equipment_used | text | Y | - |  |
| 87 | documents_url | text | Y | - |  |
| 88 | customer_notified | boolean | Y | false |  |
| 89 | customer_notified_date | date | Y | - |  |
| 90 | ncr_number | character varying | Y | - |  |
| 91 | ncr_status | character varying | Y | - |  |
| 92 | customer_spec_reference | character varying | Y | - |  |
| 93 | measurement_instrument | character varying | Y | - |  |
| 94 | instrument_calibration_date | date | Y | - |  |
| 95 | instrument_calibration_due | date | Y | - |  |
| 96 | tolerance_min | numeric | Y | - |  |
| 97 | tolerance_max | numeric | Y | - |  |
| 98 | measured_value | numeric | Y | - |  |
| 99 | within_tolerance | boolean | Y | - |  |
| 100 | dimension_checks | text | Y | - |  |
| 101 | visual_check_passed | boolean | Y | - |  |
| 102 | functional_test_passed | boolean | Y | - |  |
| 103 | pressure_test | boolean | Y | false |  |
| 104 | pressure_test_result | character varying | Y | - |  |
| 105 | water_test | boolean | Y | false |  |
| 106 | water_test_result | character varying | Y | - |  |
| 107 | air_test | boolean | Y | false |  |
| 108 | air_test_result | character varying | Y | - |  |
| 109 | weld_inspection | boolean | Y | false |  |
| 110 | weld_inspection_result | character varying | Y | - |  |
| 111 | coating_thickness | numeric | Y | - |  |
| 112 | coating_adhesion | character varying | Y | - |  |
| 113 | color_match_approved | boolean | Y | - |  |
| 114 | glass_clarity_check | boolean | Y | - |  |
| 115 | seal_integrity_check | boolean | Y | - |  |
| 116 | hardware_function_check | boolean | Y | - |  |

---

### ניהול חוזים (Contract Management) (5 טבלאות)

#### 297. `contractor_payments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | contractor_id | integer | Y | - |  |
| 3 | payment_period_start | date | Y | - |  |
| 4 | payment_period_end | date | Y | - |  |
| 5 | hours_worked | numeric | Y | 0 |  |
| 6 | hourly_rate | integer | Y | 0 |  |
| 7 | fixed_amount | integer | Y | 0 |  |
| 8 | deductions | jsonb | Y | '{}'::jsonb |  |
| 9 | total_amount | integer | Y | 0 |  |
| 10 | withholding_tax_amount | integer | Y | 0 |  |
| 11 | net_amount | integer | Y | 0 |  |
| 12 | invoice_number | character varying | Y | - |  |
| 13 | status | character varying | Y | 'pending'::character varying |  |
| 14 | payment_date | date | Y | - |  |
| 15 | notes | text | Y | - |  |
| 16 | approved_by | uuid | Y | - |  |
| 17 | created_at | timestamp without time zone | Y | now() |  |
| 18 | updated_at | timestamp without time zone | Y | now() |  |

#### 298. `contractor_work_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('contractor_work_log_id_seq':... | 🔑 PK |
| 2 | log_number | character varying | N | - | UNIQUE |
| 3 | contractor_id | integer | Y | - | FK → contractors.id |
| 4 | contractor_name | character varying | Y | - |  |
| 5 | work_type | character varying | Y | 'production'::character varying |  |
| 6 | work_order_id | integer | Y | - |  |
| 7 | work_order_number | character varying | Y | - |  |
| 8 | description | text | Y | - |  |
| 9 | work_date | date | Y | CURRENT_DATE |  |
| 10 | quantity | numeric | Y | 0 |  |
| 11 | unit | character varying | Y | 'units'::character varying |  |
| 12 | rate | numeric | Y | 0 |  |
| 13 | hours_worked | numeric | Y | 0 |  |
| 14 | gross_amount | numeric | Y | 0 |  |
| 15 | deductions | numeric | Y | 0 |  |
| 16 | withholding_tax | numeric | Y | 0 |  |
| 17 | net_amount | numeric | Y | 0 |  |
| 18 | status | character varying | Y | 'pending'::character varying |  |
| 19 | approved_by | character varying | Y | - |  |
| 20 | period_month | integer | Y | - |  |
| 21 | period_year | integer | Y | - |  |
| 22 | notes | text | Y | - |  |
| 23 | created_at | timestamp without time zone | Y | now() |  |
| 24 | updated_at | timestamp without time zone | Y | now() |  |
| 25 | project_id | integer | Y | - |  |
| 26 | project_name | character varying | Y | - |  |
| 27 | daily_rate | numeric | Y | - |  |
| 28 | hourly_rate | numeric | Y | - |  |
| 29 | total_amount | numeric | Y | - |  |
| 30 | approved | boolean | Y | false |  |
| 31 | invoiced | boolean | Y | false |  |
| 32 | invoice_number | character varying | Y | - |  |
| 33 | photos_url | text | Y | - |  |
| 34 | tags | text | Y | - |  |

#### 299. `contractors`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('contractors_id_seq'::regclass) | 🔑 PK |
| 2 | contractor_number | character varying | N | - | UNIQUE |
| 3 | full_name | character varying | N | - |  |
| 4 | id_number | character varying | Y | - |  |
| 5 | phone | character varying | Y | - |  |
| 6 | email | character varying | Y | - |  |
| 7 | address | text | Y | - |  |
| 8 | contractor_type | character varying | Y | 'production'::character varying |  |
| 9 | specialization | character varying | Y | - |  |
| 10 | payment_type | character varying | Y | 'per_job'::character varying |  |
| 11 | rate_per_hour | numeric | Y | 0 |  |
| 12 | rate_per_unit | numeric | Y | 0 |  |
| 13 | commission_percent | numeric | Y | 0 |  |
| 14 | fixed_monthly | numeric | Y | 0 |  |
| 15 | bank_name | character varying | Y | - |  |
| 16 | bank_branch | character varying | Y | - |  |
| 17 | bank_account | character varying | Y | - |  |
| 18 | tax_id | character varying | Y | - |  |
| 19 | withholding_tax_percent | numeric | Y | 0 |  |
| 20 | has_tax_exemption | boolean | Y | false |  |
| 21 | status | character varying | Y | 'active'::character varying |  |
| 22 | notes | text | Y | - |  |
| 23 | created_at | timestamp without time zone | Y | now() |  |
| 24 | updated_at | timestamp without time zone | Y | now() |  |
| 25 | insurance_company | character varying | Y | - |  |
| 26 | insurance_policy_number | character varying | Y | - |  |
| 27 | insurance_expiry_date | date | Y | - |  |
| 28 | safety_certificate | character varying | Y | - |  |
| 29 | safety_expiry | date | Y | - |  |
| 30 | equipment_provided | text | Y | - |  |
| 31 | max_workers | integer | Y | - |  |
| 32 | avg_daily_rate | numeric | Y | - |  |
| 33 | rating | numeric | Y | - |  |
| 34 | total_projects_completed | integer | Y | 0 |  |
| 35 | contractor_name | character varying | Y | - |  |
| 36 | company_name | character varying | Y | - |  |
| 37 | city | character varying | Y | - |  |
| 38 | license_number | character varying | Y | - |  |
| 39 | license_expiry | date | Y | - |  |
| 40 | insurance_policy | character varying | Y | - |  |
| 41 | insurance_expiry | date | Y | - |  |
| 42 | insurance_amount | numeric | Y | - |  |
| 43 | safety_certification | boolean | Y | false |  |
| 44 | safety_cert_expiry | date | Y | - |  |
| 45 | hourly_rate | numeric | Y | - |  |
| 46 | daily_rate | numeric | Y | - |  |
| 47 | payment_terms | character varying | Y | - |  |
| 48 | withholding_tax_pct | numeric | Y | 20 |  |
| 49 | withholding_tax_cert_expiry | date | Y | - |  |
| 50 | total_invoices | numeric | Y | 0 |  |
| 51 | documents_url | text | Y | - |  |
| 52 | tags | text | Y | - |  |

#### 300. `contracts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('contracts_id_seq'::regclass) | 🔑 PK |
| 2 | contract_number | character varying | Y | - | UNIQUE |
| 3 | title | character varying | N | - |  |
| 4 | contract_type | character varying | Y | 'customer'::character varying |  |
| 5 | party_type | character varying | Y | 'customer'::character varying |  |
| 6 | party_id | integer | Y | - |  |
| 7 | party_name | character varying | Y | - |  |
| 8 | start_date | date | Y | - |  |
| 9 | end_date | date | Y | - |  |
| 10 | renewal_date | date | Y | - |  |
| 11 | auto_renew | boolean | Y | false |  |
| 12 | value | integer | Y | 0 |  |
| 13 | currency | character varying | Y | 'ILS'::character varying |  |
| 14 | payment_schedule | jsonb | Y | '[]'::jsonb |  |
| 15 | terms | text | Y | - |  |
| 16 | special_conditions | text | Y | - |  |
| 17 | status | character varying | Y | 'draft'::character varying |  |
| 18 | signed_date | date | Y | - |  |
| 19 | signed_by | character varying | Y | - |  |
| 20 | document_url | character varying | Y | - |  |
| 21 | reminders | jsonb | Y | '[]'::jsonb |  |
| 22 | notes | text | Y | - |  |
| 23 | is_active | boolean | Y | true |  |
| 24 | created_by | integer | Y | - |  |
| 25 | created_at | timestamp without time zone | Y | now() |  |
| 26 | updated_at | timestamp without time zone | Y | now() |  |

#### 301. `hedging_contracts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('hedging_contracts_id_seq'::r... | 🔑 PK |
| 2 | contract_number | text | N | - | UNIQUE |
| 3 | contract_type | text | N | 'פורוורד'::text |  |
| 4 | status | text | N | 'פעיל'::text |  |
| 5 | currency_code | text | N | - |  |
| 6 | amount | numeric | N | - |  |
| 7 | hedged_rate | numeric | N | - |  |
| 8 | spot_rate_at_contract | numeric | Y | - |  |
| 9 | start_date | date | N | - |  |
| 10 | maturity_date | date | N | - |  |
| 11 | settlement_date | date | Y | - |  |
| 12 | counterparty | text | Y | - |  |
| 13 | bank_name | text | Y | - |  |
| 14 | linked_import_order | text | Y | - |  |
| 15 | linked_lc | text | Y | - |  |
| 16 | premium_cost | numeric | Y | - |  |
| 17 | premium_currency | text | Y | 'ILS'::text |  |
| 18 | strike_price | numeric | Y | - |  |
| 19 | option_type | text | Y | - |  |
| 20 | notional_amount | numeric | Y | - |  |
| 21 | settlement_amount | numeric | Y | - |  |
| 22 | realized_pnl | numeric | Y | - |  |
| 23 | unrealized_pnl | numeric | Y | - |  |
| 24 | margin_required | numeric | Y | - |  |
| 25 | margin_deposited | numeric | Y | - |  |
| 26 | reference_number | text | Y | - |  |
| 27 | priority | text | Y | 'רגיל'::text |  |
| 28 | notes | text | Y | - |  |
| 29 | created_by | text | Y | - |  |
| 30 | approved_by | text | Y | - |  |
| 31 | approved_date | date | Y | - |  |
| 32 | created_at | timestamp without time zone | N | now() |  |
| 33 | updated_at | timestamp without time zone | N | now() |  |
| 34 | currency_pair | character varying | Y | - |  |
| 35 | buy_currency | character varying | Y | - |  |
| 36 | sell_currency | character varying | Y | - |  |
| 37 | strike_rate | numeric | Y | - |  |
| 38 | spot_rate_at_inception | numeric | Y | - |  |
| 39 | current_rate | numeric | Y | - |  |
| 40 | trade_date | date | Y | - |  |
| 41 | premium | numeric | Y | 0 |  |
| 42 | mtm_value | numeric | Y | - |  |
| 43 | realized_gain_loss | numeric | Y | - |  |
| 44 | settled | boolean | Y | false |  |
| 45 | exposure_ids | text | Y | - |  |
| 46 | journal_entry_id | integer | Y | - |  |
| 47 | tags | text | Y | - |  |

---

### ניהול לקוחות (CRM) (21 טבלאות)

#### 302. `crm_activities`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | activity_type | character varying | Y | 'note'::character varying |  |
| 3 | subject | character varying | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | customer_id | uuid | Y | - |  |
| 6 | contact_id | uuid | Y | - |  |
| 7 | deal_id | uuid | Y | - |  |
| 8 | lead_id | uuid | Y | - |  |
| 9 | assigned_to | uuid | Y | - |  |
| 10 | start_time | timestamp without time zone | Y | - |  |
| 11 | end_time | timestamp without time zone | Y | - |  |
| 12 | duration_minutes | integer | Y | - |  |
| 13 | status | character varying | Y | 'planned'::character varying |  |
| 14 | outcome | text | Y | - |  |
| 15 | location | character varying | Y | - |  |
| 16 | is_active | boolean | Y | true |  |
| 17 | created_by | uuid | Y | - |  |
| 18 | created_at | timestamp without time zone | Y | now() |  |
| 19 | updated_at | timestamp without time zone | Y | now() |  |

#### 303. `crm_automation_history`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_automation_history_id_se... | 🔑 PK |
| 2 | automation_id | integer | Y | - | FK → crm_automations.id |
| 3 | automation_name | text | N | - |  |
| 4 | category | text | N | ''::text |  |
| 5 | triggered_by | text | N | - |  |
| 6 | status | text | N | 'success'::text |  |
| 7 | actions_completed | integer | N | 0 |  |
| 8 | actions_total | integer | N | 0 |  |
| 9 | duration_seconds | numeric | N | 0 |  |
| 10 | error_message | text | Y | - |  |
| 11 | created_at | timestamp with time zone | N | now() |  |
| 12 | entity_type | character varying | Y | - |  |
| 13 | entity_id | integer | Y | - |  |
| 14 | entity_ref | character varying | Y | - |  |
| 15 | action_taken | text | Y | - |  |
| 16 | execution_time | timestamp with time zone | Y | now() |  |
| 17 | success | boolean | Y | true |  |
| 18 | execution_duration_ms | integer | Y | - |  |
| 19 | result_data | text | Y | - |  |
| 20 | tags | text | Y | - |  |

#### 304. `crm_automations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_automations_id_seq'::reg... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | N | ''::text |  |
| 4 | trigger_event | text | N | - |  |
| 5 | actions | ARRAY | N | '{}'::text[] |  |
| 6 | category | text | N | 'לידים'::text |  |
| 7 | active | boolean | N | true |  |
| 8 | run_count | integer | N | 0 |  |
| 9 | last_run | timestamp with time zone | Y | - |  |
| 10 | is_template | boolean | N | false |  |
| 11 | tags | ARRAY | N | '{}'::text[] |  |
| 12 | created_at | timestamp with time zone | N | now() |  |
| 13 | updated_at | timestamp with time zone | N | now() |  |
| 14 | automation_name | character varying | Y | - |  |
| 15 | trigger_type | character varying | Y | - |  |
| 16 | trigger_entity | character varying | Y | - |  |
| 17 | trigger_conditions | text | Y | - |  |
| 18 | action_type | character varying | Y | - |  |
| 19 | action_config | text | Y | - |  |
| 20 | execution_count | integer | Y | 0 |  |
| 21 | last_execution | timestamp with time zone | Y | - |  |
| 22 | is_active | boolean | Y | true |  |
| 23 | notes | text | Y | - |  |

#### 305. `crm_cohorts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_cohorts_id_seq'::regclass) | 🔑 PK |
| 2 | cohort_number | text | Y | - | UNIQUE |
| 3 | name | text | N | - |  |
| 4 | description | text | N | ''::text |  |
| 5 | segment_criteria | text | N | ''::text |  |
| 6 | customer_count | integer | N | 0 |  |
| 7 | total_revenue | numeric | N | 0 |  |
| 8 | retention_rate | numeric | N | 0 |  |
| 9 | growth_rate | numeric | N | 0 |  |
| 10 | avg_ltv | numeric | N | 0 |  |
| 11 | avg_cac | numeric | N | 0 |  |
| 12 | color | text | N | 'blue'::text |  |
| 13 | status | text | N | 'active'::text |  |
| 14 | created_at | timestamp with time zone | N | now() |  |
| 15 | updated_at | timestamp with time zone | N | now() |  |

#### 306. `crm_collections`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_collections_id_seq'::reg... | 🔑 PK |
| 2 | collection_number | character varying | Y | - | UNIQUE |
| 3 | customer_name | character varying | Y | - |  |
| 4 | invoice_number | character varying | Y | - |  |
| 5 | original_amount | numeric | Y | 0 |  |
| 6 | paid_amount | numeric | Y | 0 |  |
| 7 | balance_due | numeric | Y | - |  |
| 8 | due_date | date | Y | - |  |
| 9 | days_overdue | integer | Y | 0 |  |
| 10 | risk_level | character varying | Y | 'low'::character varying |  |
| 11 | status | character varying | Y | 'open'::character varying |  |
| 12 | escalation_level | integer | Y | 0 |  |
| 13 | collector | character varying | Y | - |  |
| 14 | last_contact_date | date | Y | - |  |
| 15 | next_action | character varying | Y | - |  |
| 16 | next_action_date | date | Y | - |  |
| 17 | payment_plan | text | Y | - |  |
| 18 | phone | character varying | Y | - |  |
| 19 | email | character varying | Y | - |  |
| 20 | notes | text | Y | - |  |
| 21 | dunning_letters_sent | integer | Y | 0 |  |
| 22 | created_at | timestamp without time zone | Y | now() |  |
| 23 | updated_at | timestamp without time zone | Y | now() |  |
| 24 | customer_id | integer | Y | - |  |
| 25 | assigned_to | character varying | Y | - |  |
| 26 | assigned_to_id | integer | Y | - |  |
| 27 | total_overdue | numeric | Y | - |  |
| 28 | oldest_invoice_date | date | Y | - |  |
| 29 | invoice_count | integer | Y | 0 |  |
| 30 | invoice_list | text | Y | - |  |
| 31 | collection_stage | character varying | Y | - |  |
| 32 | last_contact_method | character varying | Y | - |  |
| 33 | next_followup_date | date | Y | - |  |
| 34 | promise_date | date | Y | - |  |
| 35 | promise_amount | numeric | Y | - |  |
| 36 | collected_amount | numeric | Y | 0 |  |
| 37 | legal_action | boolean | Y | false |  |
| 38 | legal_date | date | Y | - |  |
| 39 | attorney_name | character varying | Y | - |  |
| 40 | is_active | boolean | Y | true |  |
| 41 | tags | text | Y | - |  |

#### 307. `crm_contacts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_contacts_id_seq'::regclass) | 🔑 PK |
| 2 | contact_number | character varying | Y | - |  |
| 3 | entity_type | character varying | N | 'customer'::character varying |  |
| 4 | entity_id | integer | Y | - |  |
| 5 | entity_name | character varying | Y | - |  |
| 6 | first_name | character varying | Y | - |  |
| 7 | last_name | character varying | Y | - |  |
| 8 | full_name | character varying | Y | - |  |
| 9 | title | character varying | Y | - |  |
| 10 | position | character varying | Y | - |  |
| 11 | department | character varying | Y | - |  |
| 12 | role | character varying | Y | - |  |
| 13 | email | character varying | Y | - |  |
| 14 | phone | character varying | Y | - |  |
| 15 | mobile | character varying | Y | - |  |
| 16 | fax | character varying | Y | - |  |
| 17 | direct_line | character varying | Y | - |  |
| 18 | office_extension | character varying | Y | - |  |
| 19 | address | text | Y | - |  |
| 20 | city | character varying | Y | - |  |
| 21 | country | character varying | Y | 'ישראל'::character varying |  |
| 22 | zip_code | character varying | Y | - |  |
| 23 | linkedin | character varying | Y | - |  |
| 24 | whatsapp | character varying | Y | - |  |
| 25 | preferred_language | character varying | Y | 'he'::character varying |  |
| 26 | preferred_contact_method | character varying | Y | 'phone'::character varying |  |
| 27 | available_hours | text | Y | - |  |
| 28 | timezone | character varying | Y | 'Asia/Jerusalem'::character varying |  |
| 29 | birthday | date | Y | - |  |
| 30 | gender | character varying | Y | - |  |
| 31 | photo_url | text | Y | - |  |
| 32 | is_primary | boolean | Y | false |  |
| 33 | is_billing | boolean | Y | false |  |
| 34 | is_shipping | boolean | Y | false |  |
| 35 | is_technical | boolean | Y | false |  |
| 36 | is_decision_maker | boolean | Y | false |  |
| 37 | is_influencer | boolean | Y | false |  |
| 38 | is_blocked | boolean | Y | false |  |
| 39 | block_reason | text | Y | - |  |
| 40 | do_not_call | boolean | Y | false |  |
| 41 | do_not_email | boolean | Y | false |  |
| 42 | marketing_consent | boolean | Y | true |  |
| 43 | last_contact_date | date | Y | - |  |
| 44 | last_contact_method | character varying | Y | - |  |
| 45 | last_contact_notes | text | Y | - |  |
| 46 | contact_frequency | character varying | Y | - |  |
| 47 | next_follow_up | date | Y | - |  |
| 48 | total_interactions | integer | Y | 0 |  |
| 49 | total_meetings | integer | Y | 0 |  |
| 50 | total_emails_sent | integer | Y | 0 |  |
| 51 | total_calls | integer | Y | 0 |  |
| 52 | satisfaction_score | numeric | Y | - |  |
| 53 | relationship_strength | character varying | Y | 'neutral'::character varying |  |
| 54 | notes | text | Y | - |  |
| 55 | tags | text | Y | - |  |
| 56 | created_by | character varying | Y | - |  |
| 57 | created_at | timestamp with time zone | Y | now() |  |
| 58 | updated_at | timestamp with time zone | Y | now() |  |
| 59 | is_active | boolean | Y | true |  |
| 60 | contact_type | character varying | Y | - |  |
| 61 | architect | boolean | Y | false |  |
| 62 | engineer | boolean | Y | false |  |
| 63 | project_manager | boolean | Y | false |  |
| 64 | purchasing | boolean | Y | false |  |
| 65 | decision_maker | boolean | Y | false |  |
| 66 | influencer | boolean | Y | false |  |
| 67 | technical_contact | boolean | Y | false |  |
| 68 | last_meeting_date | date | Y | - |  |
| 69 | last_call_date | date | Y | - |  |
| 70 | next_scheduled_contact | date | Y | - |  |
| 71 | preferred_meeting_location | character varying | Y | - |  |
| 72 | assistant_name | character varying | Y | - |  |
| 73 | assistant_phone | character varying | Y | - |  |

#### 308. `crm_custom_reports`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_custom_reports_id_seq'::... | 🔑 PK |
| 2 | report_number | text | Y | - | UNIQUE |
| 3 | name | text | N | - |  |
| 4 | description | text | N | ''::text |  |
| 5 | data_source | text | N | 'leads'::text |  |
| 6 | report_type | text | N | 'table'::text |  |
| 7 | fields | ARRAY | N | '{}'::text[] |  |
| 8 | filters | jsonb | N | '{}'::jsonb |  |
| 9 | schedule | text | N | 'manual'::text |  |
| 10 | last_run | timestamp with time zone | Y | - |  |
| 11 | row_count | integer | N | 0 |  |
| 12 | status | text | N | 'active'::text |  |
| 13 | created_by | text | N | 'admin'::text |  |
| 14 | created_at | timestamp with time zone | N | now() |  |
| 15 | updated_at | timestamp with time zone | N | now() |  |

#### 309. `crm_deals`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_deals_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | Y | - |  |
| 3 | stage | text | Y | 'prospect'::text |  |
| 4 | value | numeric | Y | 0 |  |
| 5 | customer_id | integer | Y | - |  |
| 6 | assigned_to | integer | Y | - |  |
| 7 | probability | integer | Y | 50 |  |
| 8 | expected_close | date | Y | - |  |
| 9 | notes | text | Y | - |  |
| 10 | status | text | Y | 'open'::text |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |

#### 310. `crm_field_agents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_field_agents_id_seq'::re... | 🔑 PK |
| 2 | agent_number | character varying | Y | - | UNIQUE |
| 3 | full_name | character varying | Y | - |  |
| 4 | phone | character varying | Y | - |  |
| 5 | email | character varying | Y | - |  |
| 6 | region | character varying | Y | - |  |
| 7 | territory | character varying | Y | - |  |
| 8 | status | character varying | Y | 'active'::character varying |  |
| 9 | hire_date | date | Y | - |  |
| 10 | commission_rate | numeric | Y | 0 |  |
| 11 | monthly_target | numeric | Y | 0 |  |
| 12 | mtd_sales | numeric | Y | 0 |  |
| 13 | ytd_sales | numeric | Y | 0 |  |
| 14 | total_customers | integer | Y | 0 |  |
| 15 | total_visits_month | integer | Y | 0 |  |
| 16 | avg_deal_size | numeric | Y | 0 |  |
| 17 | vehicle_number | character varying | Y | - |  |
| 18 | license_expiry | date | Y | - |  |
| 19 | manager | character varying | Y | - |  |
| 20 | notes | text | Y | - |  |
| 21 | created_at | timestamp without time zone | Y | now() |  |
| 22 | updated_at | timestamp without time zone | Y | now() |  |
| 23 | agent_name | character varying | Y | - |  |
| 24 | employee_id | integer | Y | - |  |
| 25 | assigned_customers | text | Y | - |  |
| 26 | customer_count | integer | Y | 0 |  |
| 27 | monthly_actual | numeric | Y | - |  |
| 28 | ytd_target | numeric | Y | - |  |
| 29 | ytd_actual | numeric | Y | - |  |
| 30 | commission_earned | numeric | Y | 0 |  |
| 31 | visit_count_month | integer | Y | 0 |  |
| 32 | last_visit_date | date | Y | - |  |
| 33 | vehicle_type | character varying | Y | - |  |
| 34 | vehicle_plate | character varying | Y | - |  |
| 35 | gps_enabled | boolean | Y | false |  |
| 36 | is_active | boolean | Y | true |  |
| 37 | tags | text | Y | - |  |

#### 311. `crm_leads`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_leads_id_seq'::regclass) | 🔑 PK |
| 2 | lead_number | character varying | Y | - | UNIQUE |
| 3 | first_name | character varying | Y | - |  |
| 4 | last_name | character varying | Y | - |  |
| 5 | company | character varying | Y | - |  |
| 6 | phone | character varying | Y | - |  |
| 7 | email | character varying | Y | - |  |
| 8 | source | character varying | Y | 'website'::character varying |  |
| 9 | status | character varying | Y | 'new'::character varying |  |
| 10 | priority | character varying | Y | 'medium'::character varying |  |
| 11 | assigned_to | character varying | Y | - |  |
| 12 | estimated_value | numeric | Y | 0 |  |
| 13 | product_interest | character varying | Y | - |  |
| 14 | address | text | Y | - |  |
| 15 | city | character varying | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | next_follow_up | date | Y | - |  |
| 18 | last_contact_date | date | Y | - |  |
| 19 | conversion_date | date | Y | - |  |
| 20 | lost_reason | character varying | Y | - |  |
| 21 | tags | text | Y | - |  |
| 22 | created_at | timestamp without time zone | Y | now() |  |
| 23 | updated_at | timestamp without time zone | Y | now() |  |
| 24 | whatsapp | text | Y | - |  |
| 25 | phone2 | text | Y | - |  |
| 26 | region | text | Y | - |  |
| 27 | zip | text | Y | - |  |
| 28 | country | text | Y | 'ישראל'::text |  |
| 29 | contact_preference | text | Y | 'email'::text |  |
| 30 | website | text | Y | - |  |
| 31 | industry | text | Y | - |  |
| 32 | company_size | text | Y | - |  |
| 33 | annual_revenue | numeric | Y | 0 |  |
| 34 | employees_count | integer | Y | 0 |  |
| 35 | competitors | text | Y | - |  |
| 36 | pain_points | text | Y | - |  |
| 37 | referral_name | text | Y | - |  |
| 38 | campaign | text | Y | - |  |
| 39 | utm_source | text | Y | - |  |
| 40 | utm_medium | text | Y | - |  |
| 41 | utm_campaign | text | Y | - |  |
| 42 | lead_score | integer | Y | 50 |  |
| 43 | lead_temperature | text | Y | 'warm'::text |  |
| 44 | probability | integer | Y | 50 |  |
| 45 | expected_close_date | date | Y | - |  |
| 46 | budget | numeric | Y | 0 |  |
| 47 | timeline | text | Y | - |  |
| 48 | linkedin | text | Y | - |  |
| 49 | facebook | text | Y | - |  |
| 50 | instagram | text | Y | - |  |
| 51 | twitter | text | Y | - |  |
| 52 | contacts_count | integer | Y | 0 |  |
| 53 | preferred_language | text | Y | 'he'::text |  |
| 54 | meeting_type | text | Y | 'zoom'::text |  |
| 55 | first_contact_date | date | Y | - |  |
| 56 | meeting_date | date | Y | - |  |
| 57 | proposal_date | date | Y | - |  |
| 58 | decision_date | date | Y | - |  |
| 59 | interaction_count | integer | Y | 0 |  |
| 60 | email_open_rate | numeric | Y | 0 |  |
| 61 | custom_field_1 | text | Y | - |  |
| 62 | custom_field_2 | text | Y | - |  |
| 63 | custom_field_3 | text | Y | - |  |
| 64 | custom_field_4 | text | Y | - |  |
| 65 | custom_field_5 | text | Y | - |  |
| 66 | budget_range | character varying | Y | - |  |
| 67 | decision_timeline | character varying | Y | - |  |
| 68 | competitor | character varying | Y | - |  |
| 69 | contact_count | integer | Y | 0 |  |
| 70 | referral_source | character varying | Y | - |  |
| 71 | lost_to_competitor | character varying | Y | - |  |
| 72 | won_date | date | Y | - |  |
| 73 | lost_date | date | Y | - |  |
| 74 | latitude | numeric | Y | - |  |
| 75 | longitude | numeric | Y | - |  |
| 76 | first_touch_date | date | Y | - |  |
| 77 | days_in_pipeline | integer | Y | - |  |
| 78 | conversion_probability | numeric | Y | - |  |
| 79 | lead_quality | character varying | Y | - |  |
| 80 | landing_page | character varying | Y | - |  |
| 81 | ip_address | character varying | Y | - |  |
| 82 | last_activity_date | date | Y | - |  |
| 83 | activity_count | integer | Y | 0 |  |
| 84 | email_sent_count | integer | Y | 0 |  |
| 85 | email_opened_count | integer | Y | 0 |  |
| 86 | call_count | integer | Y | 0 |  |
| 87 | meeting_count | integer | Y | 0 |  |
| 88 | estimated_close_date | date | Y | - |  |
| 89 | documents_url | text | Y | - |  |
| 90 | project_type | character varying | Y | - |  |
| 91 | project_location | character varying | Y | - |  |
| 92 | project_city | character varying | Y | - |  |
| 93 | estimated_sqm | numeric | Y | - |  |
| 94 | estimated_linear_m | numeric | Y | - |  |
| 95 | estimated_units | integer | Y | - |  |
| 96 | material_preference | character varying | Y | - |  |
| 97 | glass_preference | character varying | Y | - |  |
| 98 | frame_preference | character varying | Y | - |  |
| 99 | architect_name | character varying | Y | - |  |
| 100 | architect_phone | character varying | Y | - |  |
| 101 | general_contractor | character varying | Y | - |  |
| 102 | general_contractor_phone | character varying | Y | - |  |
| 103 | building_permit_status | character varying | Y | - |  |
| 104 | construction_stage | character varying | Y | - |  |
| 105 | competitor_quoted | boolean | Y | false |  |
| 106 | competitor_name | character varying | Y | - |  |
| 107 | competitor_price | numeric | Y | - |  |
| 108 | referral_source_detail | text | Y | - |  |
| 109 | site_visit_scheduled | date | Y | - |  |
| 110 | site_visit_completed | boolean | Y | false |  |
| 111 | site_visit_notes | text | Y | - |  |

#### 312. `crm_messages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_messages_id_seq'::regclass) | 🔑 PK |
| 2 | contact_id | integer | Y | - |  |
| 3 | direction | character varying | Y | 'outbound'::character varying |  |
| 4 | channel | character varying | Y | 'whatsapp'::character varying |  |
| 5 | phone | character varying | Y | - |  |
| 6 | message_text | text | Y | - |  |
| 7 | template_name | character varying | Y | - |  |
| 8 | status | character varying | Y | 'sent'::character varying |  |
| 9 | sent_at | timestamp with time zone | Y | now() |  |
| 10 | created_at | timestamp with time zone | Y | now() |  |

#### 313. `crm_messaging_log`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | channel | character varying | Y | 'whatsapp'::character varying |  |
| 3 | direction | character varying | Y | 'outbound'::character varying |  |
| 4 | customer_id | uuid | Y | - |  |
| 5 | contact_id | uuid | Y | - |  |
| 6 | from_number | character varying | Y | - |  |
| 7 | to_number | character varying | Y | - |  |
| 8 | content | text | Y | - |  |
| 9 | template_id | uuid | Y | - |  |
| 10 | status | character varying | Y | 'sent'::character varying |  |
| 11 | external_id | character varying | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |

#### 314. `crm_opportunities`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_opportunities_id_seq'::r... | 🔑 PK |
| 2 | opportunity_number | character varying | Y | - | UNIQUE |
| 3 | name | character varying | N | - |  |
| 4 | customer_id | integer | Y | - | FK → sales_customers.id |
| 5 | customer_name | character varying | Y | - |  |
| 6 | contact_name | character varying | Y | - |  |
| 7 | email | character varying | Y | - |  |
| 8 | phone | character varying | Y | - |  |
| 9 | stage | character varying | Y | 'lead'::character varying |  |
| 10 | value | numeric | Y | 0 |  |
| 11 | probability | integer | Y | 0 |  |
| 12 | expected_close_date | date | Y | - |  |
| 13 | assigned_rep | character varying | Y | - |  |
| 14 | source | character varying | Y | - |  |
| 15 | notes | text | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |
| 18 | currency | character varying | Y | 'ILS'::character varying |  |
| 19 | deal_type | character varying | Y | - |  |
| 20 | product_interest | text | Y | - |  |
| 21 | competitor_name | character varying | Y | - |  |
| 22 | loss_reason | character varying | Y | - |  |
| 23 | win_reason | character varying | Y | - |  |
| 24 | next_step | text | Y | - |  |
| 25 | next_follow_up | date | Y | - |  |
| 26 | decision_maker | character varying | Y | - |  |
| 27 | budget_confirmed | boolean | Y | false |  |
| 28 | timeline | character varying | Y | - |  |
| 29 | lead_id | integer | Y | - |  |
| 30 | quote_id | integer | Y | - |  |
| 31 | priority | character varying | Y | 'רגיל'::character varying |  |
| 32 | region | character varying | Y | - |  |
| 33 | campaign_source | character varying | Y | - |  |
| 34 | closed_date | date | Y | - |  |
| 35 | weighted_value | numeric | Y | - |  |
| 36 | contact_phone | character varying | Y | - |  |
| 37 | contact_email | character varying | Y | - |  |
| 38 | quantity_estimate | numeric | Y | - |  |
| 39 | budget_range | character varying | Y | - |  |
| 40 | decision_makers | text | Y | - |  |
| 41 | decision_date | date | Y | - |  |
| 42 | next_step_date | date | Y | - |  |
| 43 | referral_source | character varying | Y | - |  |
| 44 | competitor_info | text | Y | - |  |
| 45 | site_visit_date | date | Y | - |  |
| 46 | site_visit_notes | text | Y | - |  |
| 47 | measurement_date | date | Y | - |  |
| 48 | measurement_notes | text | Y | - |  |
| 49 | quotation_id | integer | Y | - |  |
| 50 | quotation_amount | numeric | Y | - |  |
| 51 | documents_url | text | Y | - |  |
| 52 | photos_url | text | Y | - |  |
| 53 | tags | text | Y | - |  |
| 54 | contact_id | integer | Y | - |  |
| 55 | sales_rep_id | integer | Y | - |  |
| 56 | sales_rep_name | character varying | Y | - |  |
| 57 | team_id | integer | Y | - |  |
| 58 | team_name | character varying | Y | - |  |
| 59 | opportunity_type | character varying | Y | - |  |
| 60 | product_category | character varying | Y | - |  |
| 61 | material_type | character varying | Y | - |  |
| 62 | glass_type | character varying | Y | - |  |
| 63 | frame_type | character varying | Y | - |  |
| 64 | project_type | character varying | Y | - |  |
| 65 | project_location | character varying | Y | - |  |
| 66 | project_city | character varying | Y | - |  |
| 67 | estimated_sqm | numeric | Y | - |  |
| 68 | estimated_linear_m | numeric | Y | - |  |
| 69 | estimated_units | integer | Y | - |  |
| 70 | estimated_amount | numeric | Y | - |  |
| 71 | weighted_amount | numeric | Y | - |  |
| 72 | win_probability | numeric | Y | - |  |
| 73 | stage_changed_at | timestamp with time zone | Y | - |  |
| 74 | days_in_stage | integer | Y | 0 |  |
| 75 | pipeline | character varying | Y | - |  |
| 76 | forecast_category | character varying | Y | - |  |
| 77 | close_date | date | Y | - |  |
| 78 | expected_start_date | date | Y | - |  |
| 79 | expected_delivery_date | date | Y | - |  |
| 80 | competitor_1 | character varying | Y | - |  |
| 81 | competitor_1_price | numeric | Y | - |  |
| 82 | competitor_2 | character varying | Y | - |  |
| 83 | competitor_2_price | numeric | Y | - |  |
| 84 | competitive_advantage | text | Y | - |  |
| 85 | decision_criteria | text | Y | - |  |
| 86 | budget_available | boolean | Y | - |  |
| 87 | budget_amount | numeric | Y | - |  |
| 88 | pain_points | text | Y | - |  |
| 89 | solution_proposed | text | Y | - |  |
| 90 | quotation_number | character varying | Y | - |  |
| 91 | won_reason | text | Y | - |  |
| 92 | lost_reason | text | Y | - |  |
| 93 | lost_to_competitor | character varying | Y | - |  |
| 94 | reopen_date | date | Y | - |  |
| 95 | next_action | text | Y | - |  |
| 96 | next_action_date | date | Y | - |  |
| 97 | last_activity_date | date | Y | - |  |
| 98 | last_contact_date | date | Y | - |  |
| 99 | total_activities | integer | Y | 0 |  |
| 100 | total_meetings | integer | Y | 0 |  |
| 101 | site_visit_done | boolean | Y | false |  |
| 102 | measurement_done | boolean | Y | false |  |
| 103 | architect_name | character varying | Y | - |  |
| 104 | architect_phone | character varying | Y | - |  |
| 105 | general_contractor | character varying | Y | - |  |
| 106 | building_permit_status | character varying | Y | - |  |

#### 315. `crm_pipeline_stages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_pipeline_stages_id_seq':... | 🔑 PK |
| 2 | stage_name | text | Y | - |  |
| 3 | display_order | integer | Y | - |  |
| 4 | color | text | Y | - |  |
| 5 | probability | integer | Y | 50 |  |
| 6 | deals_count | integer | Y | 0 |  |
| 7 | deals_value | numeric | Y | 0 |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 316. `crm_pricing_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_pricing_rules_id_seq'::r... | 🔑 PK |
| 2 | rule_number | character varying | Y | - | UNIQUE |
| 3 | rule_name | character varying | Y | - |  |
| 4 | product_category | character varying | Y | - |  |
| 5 | customer_segment | character varying | Y | - |  |
| 6 | base_price | numeric | Y | 0 |  |
| 7 | discount_percent | numeric | Y | 0 |  |
| 8 | final_price | numeric | Y | - |  |
| 9 | min_quantity | integer | Y | 1 |  |
| 10 | max_quantity | integer | Y | - |  |
| 11 | valid_from | date | Y | - |  |
| 12 | valid_to | date | Y | - |  |
| 13 | status | character varying | Y | 'active'::character varying |  |
| 14 | priority | integer | Y | 0 |  |
| 15 | conditions | text | Y | - |  |
| 16 | approved_by | character varying | Y | - |  |
| 17 | notes | text | Y | - |  |
| 18 | created_at | timestamp without time zone | Y | now() |  |
| 19 | updated_at | timestamp without time zone | Y | now() |  |
| 20 | rule_type | character varying | Y | - |  |
| 21 | customer_id | integer | Y | - |  |
| 22 | customer_group | character varying | Y | - |  |
| 23 | product_id | integer | Y | - |  |
| 24 | material_type | character varying | Y | - |  |
| 25 | min_amount | numeric | Y | - |  |
| 26 | discount_type | character varying | Y | - |  |
| 27 | discount_value | numeric | Y | - |  |
| 28 | effective_from | date | Y | - |  |
| 29 | effective_to | date | Y | - |  |
| 30 | is_active | boolean | Y | true |  |
| 31 | tags | text | Y | - |  |

#### 317. `crm_sla_config`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_sla_config_id_seq'::regc... | 🔑 PK |
| 2 | sla_name | text | Y | - |  |
| 3 | priority | text | Y | - |  |
| 4 | first_response_hours | integer | Y | 24 |  |
| 5 | resolution_hours | integer | Y | 72 |  |
| 6 | escalation_hours | integer | Y | 48 |  |
| 7 | active | boolean | Y | true |  |
| 8 | notes | text | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 318. `crm_sla_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_sla_rules_id_seq'::regcl... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | response_time_hours | integer | Y | 24 |  |
| 5 | resolution_time_hours | integer | Y | 72 |  |
| 6 | priority | text | Y | 'normal'::text |  |
| 7 | status | text | Y | 'active'::text |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 319. `crm_smart_routing_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_smart_routing_rules_id_s... | 🔑 PK |
| 2 | rule_name | text | Y | - |  |
| 3 | criteria | text | Y | - |  |
| 4 | target_agent | text | Y | - |  |
| 5 | priority | integer | Y | 1 |  |
| 6 | active | boolean | Y | true |  |
| 7 | notes | text | Y | - |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 320. `crm_sync_devices`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_sync_devices_id_seq'::re... | 🔑 PK |
| 2 | device_name | text | N | - |  |
| 3 | device_type | text | N | 'desktop'::text |  |
| 4 | os | text | N | ''::text |  |
| 5 | user_name | text | N | ''::text |  |
| 6 | last_sync | timestamp with time zone | Y | - |  |
| 7 | sync_status | text | N | 'synced'::text |  |
| 8 | sync_frequency | text | N | '30 seconds'::text |  |
| 9 | data_size | text | N | '0 MB'::text |  |
| 10 | ip_address | text | N | ''::text |  |
| 11 | status | text | N | 'active'::text |  |
| 12 | created_at | timestamp with time zone | N | now() |  |
| 13 | updated_at | timestamp with time zone | N | now() |  |

#### 321. `crm_tasks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_tasks_id_seq'::regclass) | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | due_date | date | Y | - |  |
| 5 | priority | text | Y | 'medium'::text |  |
| 6 | status | text | Y | 'pending'::text |  |
| 7 | assigned_to | integer | Y | - |  |
| 8 | related_to | text | Y | - |  |
| 9 | related_id | integer | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 322. `crm_tasks_module`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('crm_tasks_module_id_seq'::re... | 🔑 PK |
| 2 | task_title | text | Y | - |  |
| 3 | description | text | Y | - |  |
| 4 | assigned_to | text | Y | - |  |
| 5 | related_entity | text | Y | - |  |
| 6 | related_id | integer | Y | - |  |
| 7 | due_date | date | Y | - |  |
| 8 | priority | text | Y | 'medium'::text |  |
| 9 | status | text | Y | 'pending'::text |  |
| 10 | completed_at | timestamp without time zone | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

---

### ניהול מסמכים (Document Management) (12 טבלאות)

#### 323. `controlled_documents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('controlled_documents_id_seq'... | 🔑 PK |
| 2 | document_number | character varying | N | - | UNIQUE |
| 3 | document_type | character varying | N | 'procedure'::character varying |  |
| 4 | title | text | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | category | character varying | Y | - |  |
| 7 | department | character varying | Y | - |  |
| 8 | status | character varying | Y | 'draft'::character varying |  |
| 9 | version | character varying | Y | '1.0'::character varying |  |
| 10 | revision_number | integer | Y | 1 |  |
| 11 | classification | character varying | Y | 'internal'::character varying |  |
| 12 | author_name | text | Y | - |  |
| 13 | owner_name | text | Y | - |  |
| 14 | reviewer_name | text | Y | - |  |
| 15 | approver_name | text | Y | - |  |
| 16 | effective_date | date | Y | - |  |
| 17 | expiry_date | date | Y | - |  |
| 18 | review_date | date | Y | - |  |
| 19 | review_frequency_months | integer | Y | 12 |  |
| 20 | file_path | text | Y | - |  |
| 21 | file_size_kb | integer | Y | - |  |
| 22 | file_type | character varying | Y | - |  |
| 23 | related_standard | character varying | Y | - |  |
| 24 | related_regulation | character varying | Y | - |  |
| 25 | distribution_list | text | Y | - |  |
| 26 | change_description | text | Y | - |  |
| 27 | previous_version | character varying | Y | - |  |
| 28 | retention_years | integer | Y | 7 |  |
| 29 | is_controlled | boolean | Y | true |  |
| 30 | is_confidential | boolean | Y | false |  |
| 31 | keywords | text | Y | - |  |
| 32 | notes | text | Y | - |  |
| 33 | approved_at | timestamp with time zone | Y | - |  |
| 34 | created_at | timestamp with time zone | Y | now() |  |
| 35 | updated_at | timestamp with time zone | Y | now() |  |
| 36 | document_title | character varying | Y | - |  |
| 37 | revision_date | date | Y | - |  |
| 38 | author | character varying | Y | - |  |
| 39 | reviewed_by | character varying | Y | - |  |
| 40 | reviewed_date | date | Y | - |  |
| 41 | approved_by | character varying | Y | - |  |
| 42 | approved_date | date | Y | - |  |
| 43 | access_level | character varying | Y | - |  |
| 44 | iso_reference | character varying | Y | - |  |
| 45 | supersedes_id | integer | Y | - |  |
| 46 | file_url | text | Y | - |  |
| 47 | is_active | boolean | Y | true |  |
| 48 | tags | text | Y | - |  |

#### 324. `document_files`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('document_files_id_seq'::regc... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | original_name | character varying | Y | - |  |
| 4 | file_path | character varying | N | - |  |
| 5 | file_size | integer | Y | 0 |  |
| 6 | mime_type | character varying | Y | - |  |
| 7 | folder_id | integer | Y | - | FK → document_folders.id |
| 8 | tags | ARRAY | Y | - |  |
| 9 | is_trashed | boolean | Y | false |  |
| 10 | uploaded_by | character varying | Y | - |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |
| 13 | size | bigint | Y | 0 |  |
| 14 | thumbnail_path | text | Y | - |  |
| 15 | description | text | Y | - |  |
| 16 | file_number | character varying | Y | - |  |
| 17 | file_name | character varying | Y | - |  |
| 18 | file_type | character varying | Y | - |  |
| 19 | file_url | text | Y | - |  |
| 20 | thumbnail_url | text | Y | - |  |
| 21 | entity_type | character varying | Y | - |  |
| 22 | entity_id | integer | Y | - |  |
| 23 | entity_ref | character varying | Y | - |  |
| 24 | uploaded_at | timestamp with time zone | Y | now() |  |
| 25 | version | integer | Y | 1 |  |
| 26 | is_public | boolean | Y | false |  |

#### 325. `document_folders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('document_folders_id_seq'::re... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | parent_id | integer | Y | - | FK → document_folders.id |
| 4 | color | character varying | Y | '#6366f1'::character varying |  |
| 5 | icon | character varying | Y | 'folder'::character varying |  |
| 6 | description | text | Y | - |  |
| 7 | is_system | boolean | Y | false |  |
| 8 | is_trashed | boolean | Y | false |  |
| 9 | created_by | character varying | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |
| 12 | folder_name | character varying | Y | - |  |
| 13 | folder_path | text | Y | - |  |
| 14 | entity_type | character varying | Y | - |  |
| 15 | entity_id | integer | Y | - |  |
| 16 | owner_id | integer | Y | - |  |
| 17 | access_level | character varying | Y | 'private'::character varying |  |
| 18 | file_count | integer | Y | 0 |  |
| 19 | is_active | boolean | Y | true |  |
| 20 | notes | text | Y | - |  |
| 21 | tags | text | Y | - |  |

#### 326. `document_tags`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('document_tags_id_seq'::regcl... | 🔑 PK |
| 2 | name | character varying | N | - | UNIQUE |
| 3 | color | character varying | Y | '#6366f1'::character varying |  |
| 4 | created_at | timestamp without time zone | Y | now() |  |
| 5 | tag_name | character varying | Y | - |  |
| 6 | tag_color | character varying | Y | - |  |
| 7 | category | character varying | Y | - |  |
| 8 | entity_type | character varying | Y | - |  |
| 9 | entity_id | integer | Y | - |  |
| 10 | created_by | character varying | Y | - |  |
| 11 | tags | text | Y | - |  |
| 12 | description | text | Y | - |  |
| 13 | usage_count | integer | Y | 0 |  |
| 14 | is_active | boolean | Y | true |  |

#### 327. `document_templates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('document_templates_id_seq'::... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | document_type | text | N | 'invoice'::text |  |
| 6 | entity_id | integer | Y | - |  |
| 7 | template_content | text | N | ''::text |  |
| 8 | header_content | text | Y | - |  |
| 9 | footer_content | text | Y | - |  |
| 10 | placeholders | jsonb | N | '[]'::jsonb |  |
| 11 | styles | jsonb | N | '{}'::jsonb |  |
| 12 | page_settings | jsonb | N | '{}'::jsonb |  |
| 13 | sample_data | jsonb | Y | 'null'::jsonb |  |
| 14 | is_active | boolean | N | true |  |
| 15 | created_at | timestamp without time zone | N | now() |  |
| 16 | updated_at | timestamp without time zone | N | now() |  |
| 17 | template_number | character varying | Y | - |  |
| 18 | template_name | character varying | Y | - |  |
| 19 | template_type | character varying | Y | - |  |
| 20 | category | character varying | Y | - |  |
| 21 | document_format | character varying | Y | - |  |
| 22 | language | character varying | Y | 'he'::character varying |  |
| 23 | content | text | Y | - |  |
| 24 | variables | text | Y | - |  |
| 25 | page_size | character varying | Y | 'A4'::character varying |  |
| 26 | orientation | character varying | Y | 'portrait'::character varying |  |
| 27 | version | integer | Y | 1 |  |
| 28 | is_default | boolean | Y | false |  |
| 29 | created_by | character varying | Y | - |  |
| 30 | notes | text | Y | - |  |
| 31 | tags | text | Y | - |  |

#### 328. `documents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('documents_id_seq'::regclass) | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | type | text | Y | - |  |
| 4 | category | text | Y | - |  |
| 5 | file_path | text | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | uploaded_by | integer | Y | - |  |
| 8 | tags | text | Y | - |  |
| 9 | version | text | Y | '1.0'::text |  |
| 10 | status | text | Y | 'active'::text |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |

#### 329. `fabrication_profiles`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('fabrication_profiles_id_seq'... | 🔑 PK |
| 2 | profile_number | text | N | - | UNIQUE |
| 3 | profile_name | text | N | - |  |
| 4 | series | text | Y | - |  |
| 5 | system_type | text | Y | 'aluminum'::text |  |
| 6 | profile_type | text | Y | 'frame'::text |  |
| 7 | material | text | Y | 'aluminum'::text |  |
| 8 | alloy | text | Y | - |  |
| 9 | temper | text | Y | - |  |
| 10 | weight_per_meter | numeric | Y | - |  |
| 11 | length_mm | numeric | Y | 6000 |  |
| 12 | width_mm | numeric | Y | - |  |
| 13 | height_mm | numeric | Y | - |  |
| 14 | wall_thickness_mm | numeric | Y | - |  |
| 15 | moment_of_inertia_x | numeric | Y | - |  |
| 16 | moment_of_inertia_y | numeric | Y | - |  |
| 17 | cross_section_area | numeric | Y | - |  |
| 18 | thermal_break | boolean | Y | false |  |
| 19 | thermal_break_width_mm | numeric | Y | - |  |
| 20 | gasket_slots | integer | Y | 0 |  |
| 21 | glazing_pocket_mm | numeric | Y | - |  |
| 22 | max_span_mm | numeric | Y | - |  |
| 23 | surface_treatment | text | Y | - |  |
| 24 | default_finish | text | Y | 'anodized'::text |  |
| 25 | default_color | text | Y | - |  |
| 26 | compatible_systems | text | Y | - |  |
| 27 | drawing_url | text | Y | - |  |
| 28 | image_url | text | Y | - |  |
| 29 | supplier_id | integer | Y | - |  |
| 30 | supplier_part_number | text | Y | - |  |
| 31 | cost_per_meter | numeric | Y | - |  |
| 32 | current_stock_meters | numeric | Y | 0 |  |
| 33 | minimum_stock_meters | numeric | Y | - |  |
| 34 | reorder_point_meters | numeric | Y | - |  |
| 35 | warehouse_location | text | Y | - |  |
| 36 | si_standard | text | Y | - |  |
| 37 | iso_standard | text | Y | - |  |
| 38 | status | text | N | 'active'::text |  |
| 39 | notes | text | Y | - |  |
| 40 | created_at | timestamp without time zone | Y | now() |  |
| 41 | updated_at | timestamp without time zone | Y | now() |  |

#### 330. `generated_documents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('generated_documents_id_seq':... | 🔑 PK |
| 2 | template_id | integer | N | - |  |
| 3 | record_id | integer | Y | - |  |
| 4 | document_number | text | Y | - |  |
| 5 | generated_html | text | Y | - |  |
| 6 | data | jsonb | N | '{}'::jsonb |  |
| 7 | status | text | N | 'generated'::text |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | document_type | character varying | Y | - |  |
| 10 | template_name | character varying | Y | - |  |
| 11 | entity_type | character varying | Y | - |  |
| 12 | entity_id | integer | Y | - |  |
| 13 | entity_ref | character varying | Y | - |  |
| 14 | entity_name | character varying | Y | - |  |
| 15 | generated_by | character varying | Y | - |  |
| 16 | generated_at | timestamp with time zone | Y | now() |  |
| 17 | file_url | text | Y | - |  |
| 18 | file_format | character varying | Y | - |  |
| 19 | file_size | integer | Y | - |  |
| 20 | sent_to_email | character varying | Y | - |  |
| 21 | sent_date | timestamp with time zone | Y | - |  |
| 22 | printed | boolean | Y | false |  |
| 23 | print_count | integer | Y | 0 |  |
| 24 | notes | text | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 331. `import_documents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | import_order_id | uuid | Y | - |  |
| 3 | document_type | character varying | Y | 'other'::character varying |  |
| 4 | document_number | character varying | Y | - |  |
| 5 | file_url | character varying | Y | - |  |
| 6 | issue_date | date | Y | - |  |
| 7 | expiry_date | date | Y | - |  |
| 8 | status | character varying | Y | 'pending'::character varying |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 332. `income_documents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('income_documents_id_seq'::re... | 🔑 PK |
| 2 | document_number | character varying | Y | - |  |
| 3 | document_type | character varying | Y | 'tax_invoice_receipt'::character varying |  |
| 4 | customer_name | character varying | Y | - |  |
| 5 | customer_id | integer | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | amount | numeric | Y | 0 |  |
| 8 | vat_amount | numeric | Y | 0 |  |
| 9 | total_with_vat | numeric | Y | 0 |  |
| 10 | payment_method | character varying | Y | 'bank_transfer'::character varying |  |
| 11 | invoice_date | date | Y | CURRENT_DATE |  |
| 12 | due_date | date | Y | - |  |
| 13 | products | text | Y | - |  |
| 14 | status | character varying | Y | 'draft'::character varying |  |
| 15 | linked_document | character varying | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp without time zone | Y | now() |  |
| 18 | updated_at | timestamp without time zone | Y | now() |  |
| 19 | order_id | integer | Y | - |  |
| 20 | document_date | date | Y | - |  |
| 21 | total_amount | numeric | Y | - |  |
| 22 | currency | character varying | Y | 'ILS'::character varying |  |
| 23 | payment_received | boolean | Y | false |  |
| 24 | payment_date | date | Y | - |  |
| 25 | payment_reference | character varying | Y | - |  |
| 26 | linked_invoice_id | integer | Y | - |  |
| 27 | journal_entry_id | integer | Y | - |  |
| 28 | posted | boolean | Y | false |  |
| 29 | pdf_url | text | Y | - |  |
| 30 | tags | text | Y | - |  |

#### 333. `integration_templates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('integration_templates_id_seq... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | slug | text | N | - |  |
| 4 | channel | text | N | - |  |
| 5 | subject | text | Y | - |  |
| 6 | body | text | N | - |  |
| 7 | body_html | text | Y | - |  |
| 8 | variables | jsonb | N | '[]'::jsonb |  |
| 9 | category | text | Y | - |  |
| 10 | is_active | boolean | N | true |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | template_name | character varying | Y | - |  |
| 14 | integration_type | character varying | Y | - |  |
| 15 | provider | character varying | Y | - |  |
| 16 | description | text | Y | - |  |
| 17 | config_template | text | Y | - |  |
| 18 | mapping_template | text | Y | - |  |
| 19 | version | integer | Y | 1 |  |
| 20 | notes | text | Y | - |  |
| 21 | tags | text | Y | - |  |

#### 334. `template_definitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('template_definitions_id_seq'... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | slug | character varying | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | entity_id | integer | Y | - |  |
| 6 | category | character varying | Y | - |  |
| 7 | template_content | text | Y | - |  |
| 8 | variables | jsonb | Y | '[]'::jsonb |  |
| 9 | styles | jsonb | Y | '{}'::jsonb |  |
| 10 | settings | jsonb | Y | '{}'::jsonb |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | created_at | timestamp with time zone | Y | now() |  |
| 13 | updated_at | timestamp with time zone | Y | now() |  |

---

### ניהול משתמשים (User Management) (4 טבלאות)

#### 335. `kobi_sessions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('kobi_sessions_id_seq'::regcl... | 🔑 PK |
| 2 | user_id | character varying | N | - |  |
| 3 | title | character varying | Y | 'שיחה חדשה'::character varying |  |
| 4 | status | character varying | Y | 'active'::character varying |  |
| 5 | agent_type | character varying | Y | 'general'::character varying |  |
| 6 | total_messages | integer | Y | 0 |  |
| 7 | total_tool_calls | integer | Y | 0 |  |
| 8 | total_tokens | integer | Y | 0 |  |
| 9 | context_summary | text | Y | ''::text |  |
| 10 | pinned | boolean | Y | false |  |
| 11 | created_at | timestamp with time zone | Y | now() |  |
| 12 | updated_at | timestamp with time zone | Y | now() |  |

#### 336. `role_permissions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('role_permissions_id_seq'::re... | 🔑 PK |
| 2 | role_id | integer | N | - | FK → platform_roles.id |
| 3 | entity_id | integer | Y | - |  |
| 4 | module_id | integer | Y | - |  |
| 5 | action | text | N | - |  |
| 6 | is_allowed | boolean | N | true |  |
| 7 | conditions | jsonb | Y | '{}'::jsonb |  |
| 8 | settings | jsonb | Y | '{}'::jsonb |  |
| 9 | created_at | timestamp without time zone | N | now() |  |

#### 337. `user_sessions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('user_sessions_id_seq'::regcl... | 🔑 PK |
| 2 | user_id | integer | N | - | FK → users.id |
| 3 | token | character varying | N | - | UNIQUE |
| 4 | ip_address | character varying | Y | - |  |
| 5 | user_agent | text | Y | - |  |
| 6 | is_active | boolean | N | true |  |
| 7 | expires_at | timestamp without time zone | N | - |  |
| 8 | last_activity_at | timestamp without time zone | N | now() |  |
| 9 | created_at | timestamp without time zone | N | now() |  |
| 10 | user_name | character varying | Y | - |  |
| 11 | session_token | text | Y | - |  |
| 12 | login_at | timestamp with time zone | Y | now() |  |
| 13 | last_activity | timestamp with time zone | Y | - |  |
| 14 | device_type | character varying | Y | - |  |
| 15 | browser | character varying | Y | - |  |
| 16 | location | character varying | Y | - |  |
| 17 | login_method | character varying | Y | - |  |

#### 338. `users`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('users_id_seq'::regclass) | 🔑 PK |
| 2 | username | character varying | N | - | UNIQUE |
| 3 | email | character varying | Y | - | UNIQUE |
| 4 | password_hash | text | N | - |  |
| 5 | full_name | character varying | N | - |  |
| 6 | full_name_he | character varying | Y | - |  |
| 7 | phone | character varying | Y | - |  |
| 8 | department | character varying | Y | - |  |
| 9 | job_title | character varying | Y | - |  |
| 10 | avatar_url | text | Y | - |  |
| 11 | is_active | boolean | N | true |  |
| 12 | is_super_admin | boolean | N | false |  |
| 13 | last_login_at | timestamp without time zone | Y | - |  |
| 14 | login_count | integer | N | 0 |  |
| 15 | failed_login_attempts | integer | N | 0 |  |
| 16 | locked_until | timestamp without time zone | Y | - |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | updated_at | timestamp without time zone | N | now() |  |
| 19 | employee_number | character varying | Y | - |  |
| 20 | id_number | character varying | Y | - |  |
| 21 | date_of_birth | date | Y | - |  |
| 22 | gender | character varying | Y | - |  |
| 23 | marital_status | character varying | Y | - |  |
| 24 | nationality | character varying | Y | 'ישראלי'::character varying |  |
| 25 | address | text | Y | - |  |
| 26 | city | character varying | Y | - |  |
| 27 | zip_code | character varying | Y | - |  |
| 28 | mobile | character varying | Y | - |  |
| 29 | emergency_contact_name | character varying | Y | - |  |
| 30 | emergency_contact_phone | character varying | Y | - |  |
| 31 | emergency_contact_relation | character varying | Y | - |  |
| 32 | hire_date | date | Y | - |  |
| 33 | probation_end_date | date | Y | - |  |
| 34 | termination_date | date | Y | - |  |
| 35 | termination_reason | text | Y | - |  |
| 36 | employment_type | character varying | Y | 'full_time'::character varying |  |
| 37 | work_schedule | character varying | Y | 'regular'::character varying |  |
| 38 | weekly_hours | numeric | Y | 42 |  |
| 39 | salary | numeric | Y | - |  |
| 40 | salary_currency | character varying | Y | 'ILS'::character varying |  |
| 41 | pay_frequency | character varying | Y | 'monthly'::character varying |  |
| 42 | bank_name | character varying | Y | - |  |
| 43 | bank_branch | character varying | Y | - |  |
| 44 | bank_account_number | character varying | Y | - |  |
| 45 | tax_bracket | character varying | Y | - |  |
| 46 | tax_credits | numeric | Y | 0 |  |
| 47 | pension_plan | character varying | Y | - |  |
| 48 | pension_employee_rate | numeric | Y | 6 |  |
| 49 | pension_employer_rate | numeric | Y | 6.5 |  |
| 50 | health_insurance | character varying | Y | - |  |
| 51 | education_fund_rate | numeric | Y | 2.5 |  |
| 52 | vacation_days_annual | integer | Y | 12 |  |
| 53 | vacation_days_used | numeric | Y | 0 |  |
| 54 | vacation_days_balance | numeric | Y | 0 |  |
| 55 | sick_days_annual | integer | Y | 18 |  |
| 56 | sick_days_used | numeric | Y | 0 |  |
| 57 | sick_days_balance | numeric | Y | 0 |  |
| 58 | manager_id | integer | Y | - |  |
| 59 | cost_center | character varying | Y | - |  |
| 60 | work_location | character varying | Y | 'מפעל ראשי'::character varying |  |
| 61 | shift | character varying | Y | - |  |
| 62 | skills | text | Y | - |  |
| 63 | certifications | text | Y | - |  |
| 64 | drivers_license | character varying | Y | - |  |
| 65 | vehicle_type | character varying | Y | - |  |
| 66 | vehicle_plate | character varying | Y | - |  |
| 67 | uniform_size | character varying | Y | - |  |
| 68 | shoe_size | character varying | Y | - |  |
| 69 | safety_training_date | date | Y | - |  |
| 70 | safety_training_expiry | date | Y | - |  |
| 71 | medical_exam_date | date | Y | - |  |
| 72 | medical_exam_expiry | date | Y | - |  |
| 73 | notes | text | Y | - |  |
| 74 | profile_image_url | text | Y | - |  |
| 75 | digital_signature_url | text | Y | - |  |
| 76 | telegram_chat_id | text | Y | - |  |

---

### ניהול פרויקטים (Project Management) (14 טבלאות)

#### 339. `commodity_risks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('commodity_risks_id_seq'::reg... | 🔑 PK |
| 2 | material_name | text | N | - |  |
| 3 | quantity | numeric | Y | 0 |  |
| 4 | unit | text | Y | 'kg'::text |  |
| 5 | current_price | numeric | Y | 0 |  |
| 6 | floor_price | numeric | Y | - |  |
| 7 | ceiling_price | numeric | Y | - |  |
| 8 | hedging_recommendation | text | Y | - |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |
| 12 | commodity_name | character varying | Y | - |  |
| 13 | commodity_type | character varying | Y | - |  |
| 14 | avg_price_30d | numeric | Y | - |  |
| 15 | avg_price_90d | numeric | Y | - |  |
| 16 | price_change_pct_30d | numeric | Y | - |  |
| 17 | price_change_pct_90d | numeric | Y | - |  |
| 18 | annual_consumption | numeric | Y | - |  |
| 19 | annual_spend | numeric | Y | - |  |
| 20 | exposure_amount | numeric | Y | - |  |
| 21 | hedged_pct | numeric | Y | 0 |  |
| 22 | unhedged_exposure | numeric | Y | - |  |
| 23 | var_95 | numeric | Y | - |  |
| 24 | var_99 | numeric | Y | - |  |
| 25 | risk_level | character varying | Y | - |  |
| 26 | mitigation_strategy | text | Y | - |  |
| 27 | supplier_contracts | text | Y | - |  |
| 28 | last_update | date | Y | - |  |
| 29 | price_source | character varying | Y | - |  |
| 30 | currency | character varying | Y | 'USD'::character varying |  |
| 31 | status | character varying | Y | 'active'::character varying |  |
| 32 | tags | text | Y | - |  |

#### 340. `project_analyses`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_analyses_id_seq'::re... | 🔑 PK |
| 2 | project_code | text | N | - | UNIQUE |
| 3 | project_name | text | N | - |  |
| 4 | customer_name | text | Y | - |  |
| 5 | manager_name | text | Y | - |  |
| 6 | status | text | N | 'draft'::text |  |
| 7 | start_date | text | Y | - |  |
| 8 | end_date | text | Y | - |  |
| 9 | description | text | Y | - |  |
| 10 | labor_cost | numeric | Y | 0 |  |
| 11 | installation_cost | numeric | Y | 0 |  |
| 12 | transport_cost | numeric | Y | 0 |  |
| 13 | insurance_cost | numeric | Y | 0 |  |
| 14 | storage_cost | numeric | Y | 0 |  |
| 15 | customs_cost | numeric | Y | 0 |  |
| 16 | packaging_cost | numeric | Y | 0 |  |
| 17 | overhead_cost | numeric | Y | 0 |  |
| 18 | payment_terms | text | Y | - |  |
| 19 | number_of_payments | integer | Y | 1 |  |
| 20 | credit_fee_percent | numeric | Y | 0 |  |
| 21 | contingency_percent | numeric | Y | 0 |  |
| 22 | operational_overhead_percent | numeric | Y | 0 |  |
| 23 | target_margin_percent | numeric | Y | 0 |  |
| 24 | proposed_sale_price | numeric | Y | 0 |  |
| 25 | actual_sale_price | numeric | Y | 0 |  |
| 26 | risk_score | numeric | Y | 5 |  |
| 27 | supplier_risk | numeric | Y | 5 |  |
| 28 | currency_risk | numeric | Y | 5 |  |
| 29 | market_risk | numeric | Y | 5 |  |
| 30 | operational_risk | numeric | Y | 5 |  |
| 31 | source_type | text | Y | - |  |
| 32 | source_id | text | Y | - |  |
| 33 | notes | text | Y | - |  |
| 34 | audit_trail | jsonb | Y | '[]'::jsonb |  |
| 35 | created_at | timestamp without time zone | N | now() |  |
| 36 | updated_at | timestamp without time zone | N | now() |  |
| 37 | analysis_number | character varying | Y | - |  |
| 38 | project_id | integer | Y | - |  |
| 39 | analysis_type | character varying | Y | - |  |
| 40 | analysis_date | date | Y | - |  |
| 41 | estimated_revenue | numeric | Y | - |  |
| 42 | estimated_cost | numeric | Y | - |  |
| 43 | estimated_profit | numeric | Y | - |  |
| 44 | margin_pct | numeric | Y | - |  |
| 45 | actual_revenue | numeric | Y | - |  |
| 46 | actual_cost | numeric | Y | - |  |
| 47 | actual_profit | numeric | Y | - |  |
| 48 | variance_pct | numeric | Y | - |  |
| 49 | roi_pct | numeric | Y | - |  |
| 50 | payback_months | numeric | Y | - |  |
| 51 | risk_level | character varying | Y | - |  |
| 52 | tags | text | Y | - |  |

#### 341. `project_analysis_costs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_analysis_costs_id_se... | 🔑 PK |
| 2 | project_analysis_id | integer | N | - |  |
| 3 | cost_type | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | amount | numeric | Y | 0 |  |
| 6 | currency | text | Y | 'ILS'::text |  |
| 7 | notes | text | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | analysis_id | integer | Y | - |  |
| 10 | cost_category | character varying | Y | - |  |
| 11 | estimated_amount | numeric | Y | - |  |
| 12 | actual_amount | numeric | Y | - |  |
| 13 | variance | numeric | Y | - |  |
| 14 | tags | text | Y | - |  |
| 15 | period | character varying | Y | - |  |
| 16 | vendor | character varying | Y | - |  |
| 17 | invoice_ref | character varying | Y | - |  |
| 18 | allocated_pct | numeric | Y | 100 |  |
| 19 | cost_center | character varying | Y | - |  |
| 20 | approved | boolean | Y | false |  |

#### 342. `project_analysis_materials`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_analysis_materials_i... | 🔑 PK |
| 2 | project_analysis_id | integer | N | - |  |
| 3 | raw_material_id | integer | Y | - |  |
| 4 | material_name | text | N | - |  |
| 5 | material_number | text | Y | - |  |
| 6 | quantity | numeric | Y | 1 |  |
| 7 | unit | text | Y | 'יחידה'::text |  |
| 8 | unit_price | numeric | Y | 0 |  |
| 9 | total_price | numeric | Y | 0 |  |
| 10 | vat_amount | numeric | Y | 0 |  |
| 11 | supplier_discount | numeric | Y | 0 |  |
| 12 | price_per_meter | numeric | Y | - |  |
| 13 | supplier_id | integer | Y | - |  |
| 14 | supplier_name | text | Y | - |  |
| 15 | notes | text | Y | - |  |
| 16 | created_at | timestamp without time zone | N | now() |  |
| 17 | analysis_id | integer | Y | - |  |
| 18 | material_id | integer | Y | - |  |
| 19 | material_code | character varying | Y | - |  |
| 20 | uom | character varying | Y | - |  |
| 21 | unit_cost | numeric | Y | - |  |
| 22 | total_cost | numeric | Y | - |  |
| 23 | waste_pct | numeric | Y | 0 |  |
| 24 | lead_time_days | integer | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 343. `project_analysis_simulations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_analysis_simulations... | 🔑 PK |
| 2 | project_analysis_id | integer | N | - |  |
| 3 | simulation_name | text | N | - |  |
| 4 | parameters | jsonb | Y | '{}'::jsonb |  |
| 5 | results | jsonb | Y | '{}'::jsonb |  |
| 6 | created_at | timestamp without time zone | N | now() |  |
| 7 | analysis_id | integer | Y | - |  |
| 8 | scenario_type | character varying | Y | - |  |
| 9 | revenue_impact | numeric | Y | - |  |
| 10 | cost_impact | numeric | Y | - |  |
| 11 | profit_impact | numeric | Y | - |  |
| 12 | risk_assessment | text | Y | - |  |
| 13 | recommendation | text | Y | - |  |
| 14 | status | character varying | Y | 'draft'::character varying |  |
| 15 | notes | text | Y | - |  |
| 16 | tags | text | Y | - |  |
| 17 | probability | numeric | Y | - |  |
| 18 | impact_level | character varying | Y | - |  |
| 19 | sensitivity_factor | character varying | Y | - |  |
| 20 | approved | boolean | Y | false |  |
| 21 | approved_by | character varying | Y | - |  |

#### 344. `project_milestones`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_milestones_id_seq'::... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | milestone_number | text | Y | - |  |
| 4 | title | text | N | - |  |
| 5 | description | text | Y | - |  |
| 6 | phase | text | Y | - |  |
| 7 | weight_pct | numeric | Y | 0 |  |
| 8 | planned_date | date | Y | - |  |
| 9 | actual_date | date | Y | - |  |
| 10 | status | text | Y | 'pending'::text |  |
| 11 | assigned_to | text | Y | - |  |
| 12 | deliverables | text | Y | - |  |
| 13 | dependencies | text | Y | - |  |
| 14 | notes | text | Y | - |  |
| 15 | completed_at | timestamp without time zone | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |
| 18 | project_name | character varying | Y | - |  |
| 19 | milestone_type | character varying | Y | - |  |
| 20 | completion_pct | numeric | Y | 0 |  |
| 21 | payment_linked | boolean | Y | false |  |
| 22 | payment_amount | numeric | Y | - |  |
| 23 | payment_pct | numeric | Y | - |  |
| 24 | invoice_id | integer | Y | - |  |
| 25 | invoiced | boolean | Y | false |  |
| 26 | responsible_person | character varying | Y | - |  |
| 27 | approved_by | character varying | Y | - |  |
| 28 | approved_at | timestamp with time zone | Y | - |  |
| 29 | documents_url | text | Y | - |  |
| 30 | photos_url | text | Y | - |  |
| 31 | tags | text | Y | - |  |

#### 345. `project_resources`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_resources_id_seq'::r... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | name | text | N | - |  |
| 4 | role | text | Y | - |  |
| 5 | allocation | integer | Y | 100 |  |
| 6 | hourly_rate | numeric | Y | - |  |
| 7 | start_date | date | Y | - |  |
| 8 | end_date | date | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |
| 11 | resource_type | text | Y | 'human'::text |  |
| 12 | allocation_pct | integer | Y | 100 |  |
| 13 | daily_rate | numeric | Y | - |  |
| 14 | total_cost | numeric | Y | 0 |  |

#### 346. `project_risks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_risks_id_seq'::regcl... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | title | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | probability | text | Y | 'medium'::text |  |
| 6 | impact | text | Y | 'medium'::text |  |
| 7 | mitigation_plan | text | Y | - |  |
| 8 | status | text | Y | 'open'::text |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |
| 11 | category | text | Y | 'general'::text |  |
| 12 | risk_score | integer | Y | 5 |  |
| 13 | owner | text | Y | - |  |
| 14 | identified_date | date | Y | now() |  |

#### 347. `project_tasks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_tasks_id_seq'::regcl... | 🔑 PK |
| 2 | project_id | integer | Y | - |  |
| 3 | title | text | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | assignee | text | Y | - |  |
| 6 | due_date | date | Y | - |  |
| 7 | priority | text | Y | 'medium'::text |  |
| 8 | status | text | Y | 'pending'::text |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 348. `project_workflow_stages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('project_workflow_stages_id_s... | 🔑 PK |
| 2 | project_id | integer | N | - |  |
| 3 | stage_name | text | N | - |  |
| 4 | stage_order | integer | N | - |  |
| 5 | status | text | N | 'pending'::text |  |
| 6 | assigned_to | text | Y | - |  |
| 7 | started_at | timestamp without time zone | Y | - |  |
| 8 | completed_at | timestamp without time zone | Y | - |  |
| 9 | due_date | date | Y | - |  |
| 10 | completion_percent | numeric | Y | 0 |  |
| 11 | blocked_by | text | Y | - |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

#### 349. `projects`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('projects_id_seq'::regclass) | 🔑 PK |
| 2 | project_number | character varying | N | - | UNIQUE |
| 3 | project_name | text | N | - |  |
| 4 | customer_name | text | Y | - |  |
| 5 | start_date | date | Y | - |  |
| 6 | end_date | date | Y | - |  |
| 7 | estimated_revenue | numeric | Y | 0 |  |
| 8 | actual_revenue | numeric | Y | 0 |  |
| 9 | estimated_cost | numeric | Y | 0 |  |
| 10 | actual_cost | numeric | Y | 0 |  |
| 11 | profit_margin | numeric | Y | - |  |
| 12 | status | character varying | Y | 'active'::character varying |  |
| 13 | department | character varying | Y | - |  |
| 14 | manager_name | text | Y | - |  |
| 15 | description | text | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |
| 18 | completion_pct | numeric | Y | 0 |  |
| 19 | billable_hours | numeric | Y | 0 |  |
| 20 | total_hours | numeric | Y | 0 |  |
| 21 | risk_count | integer | Y | 0 |  |
| 22 | issues_count | integer | Y | 0 |  |
| 23 | project_type | character varying | Y | - |  |
| 24 | priority | character varying | Y | 'רגיל'::character varying |  |
| 25 | customer_id | integer | Y | - |  |
| 26 | customer_contact | character varying | Y | - |  |
| 27 | customer_phone | character varying | Y | - |  |
| 28 | site_address | text | Y | - |  |
| 29 | city | character varying | Y | - |  |
| 30 | area_sqm | numeric | Y | - |  |
| 31 | floor_count | integer | Y | - |  |
| 32 | building_permit | character varying | Y | - |  |
| 33 | architect_name | character varying | Y | - |  |
| 34 | engineer_name | character varying | Y | - |  |
| 35 | contract_number | character varying | Y | - |  |
| 36 | contract_date | date | Y | - |  |
| 37 | warranty_end_date | date | Y | - |  |
| 38 | payment_terms | character varying | Y | - |  |
| 39 | retention_pct | numeric | Y | - |  |
| 40 | safety_officer | character varying | Y | - |  |
| 41 | contract_amount | numeric | Y | - |  |
| 42 | contract_signed_date | date | Y | - |  |
| 43 | deposit_amount | numeric | Y | 0 |  |
| 44 | deposit_received | boolean | Y | false |  |
| 45 | payment_milestones | text | Y | - |  |
| 46 | site_contact | character varying | Y | - |  |
| 47 | site_phone | character varying | Y | - |  |
| 48 | gps_latitude | numeric | Y | - |  |
| 49 | gps_longitude | numeric | Y | - |  |
| 50 | architect_phone | character varying | Y | - |  |
| 51 | contractor_name | character varying | Y | - |  |
| 52 | contractor_phone | character varying | Y | - |  |
| 53 | measurement_date | date | Y | - |  |
| 54 | measurement_by | character varying | Y | - |  |
| 55 | measurement_completed | boolean | Y | false |  |
| 56 | production_start_date | date | Y | - |  |
| 57 | production_end_date | date | Y | - |  |
| 58 | installation_start_date | date | Y | - |  |
| 59 | installation_end_date | date | Y | - |  |
| 60 | installation_team | character varying | Y | - |  |
| 61 | installation_notes | text | Y | - |  |
| 62 | warranty_start_date | date | Y | - |  |
| 63 | warranty_terms | text | Y | - |  |
| 64 | total_area_sqm | numeric | Y | - |  |
| 65 | total_items | integer | Y | - |  |
| 66 | total_cost | numeric | Y | - |  |
| 67 | salesperson | character varying | Y | - |  |
| 68 | salesperson_id | integer | Y | - |  |
| 69 | foreman | character varying | Y | - |  |
| 70 | foreman_phone | character varying | Y | - |  |
| 71 | approved_by | character varying | Y | - |  |
| 72 | approved_at | timestamp with time zone | Y | - |  |
| 73 | completion_percent | numeric | Y | 0 |  |
| 74 | sign_off_date | date | Y | - |  |
| 75 | sign_off_by | character varying | Y | - |  |
| 76 | customer_satisfaction | integer | Y | - |  |
| 77 | punch_list | text | Y | - |  |
| 78 | photos_url | text | Y | - |  |
| 79 | documents_url | text | Y | - |  |
| 80 | cost_center | character varying | Y | - |  |
| 81 | internal_notes | text | Y | - |  |
| 82 | tags | text | Y | - |  |
| 83 | customer_email | character varying | Y | - |  |
| 84 | gps_coordinates | character varying | Y | - |  |
| 85 | building_permit_number | character varying | Y | - |  |
| 86 | phase | character varying | Y | - |  |
| 87 | risk_level | character varying | Y | 'low'::character varying |  |
| 88 | risk_notes | text | Y | - |  |
| 89 | revenue_recognized | numeric | Y | 0 |  |
| 90 | invoiced_amount | numeric | Y | 0 |  |
| 91 | collected_amount | numeric | Y | 0 |  |
| 92 | retention_amount | numeric | Y | 0 |  |
| 93 | penalties_amount | numeric | Y | 0 |  |
| 94 | bonuses_amount | numeric | Y | 0 |  |
| 95 | change_orders_count | integer | Y | 0 |  |
| 96 | change_orders_value | numeric | Y | 0 |  |
| 97 | building_permit_date | date | Y | - |  |
| 98 | engineer_phone | character varying | Y | - |  |
| 99 | structural_engineer | character varying | Y | - |  |
| 100 | structural_engineer_phone | character varying | Y | - |  |
| 101 | safety_officer_phone | character varying | Y | - |  |
| 102 | total_units | integer | Y | 0 |  |
| 103 | total_linear_m | numeric | Y | - |  |
| 104 | material_type | character varying | Y | - |  |
| 105 | glass_type | character varying | Y | - |  |
| 106 | frame_color | character varying | Y | - |  |
| 107 | standard_compliance | character varying | Y | - |  |
| 108 | energy_rating | character varying | Y | - |  |
| 109 | fire_rating | character varying | Y | - |  |
| 110 | weather_delays_days | integer | Y | 0 |  |
| 111 | total_man_days | numeric | Y | 0 |  |
| 112 | daily_progress_log | text | Y | - |  |
| 113 | milestone_count | integer | Y | 0 |  |
| 114 | milestones_completed | integer | Y | 0 |  |
| 115 | punch_list_items | integer | Y | 0 |  |
| 116 | punch_list_completed | integer | Y | 0 |  |
| 117 | final_inspection_date | date | Y | - |  |
| 118 | final_inspection_passed | boolean | Y | - |  |
| 119 | handover_date | date | Y | - |  |
| 120 | handover_signed | boolean | Y | false |  |
| 121 | warranty_start | date | Y | - |  |
| 122 | warranty_end | date | Y | - |  |
| 123 | warranty_claims | integer | Y | 0 |  |

#### 350. `projects_module`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('projects_module_id_seq'::reg... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | client | text | Y | - |  |
| 5 | budget | numeric | Y | - |  |
| 6 | start_date | date | Y | - |  |
| 7 | end_date | date | Y | - |  |
| 8 | manager | text | Y | - |  |
| 9 | status | text | Y | 'active'::text |  |
| 10 | priority | text | Y | 'medium'::text |  |
| 11 | completion | integer | Y | 0 |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

#### 351. `rd_projects`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('rd_projects_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | budget | numeric | Y | - |  |
| 5 | start_date | date | Y | - |  |
| 6 | end_date | date | Y | - |  |
| 7 | lead | text | Y | - |  |
| 8 | status | text | Y | 'active'::text |  |
| 9 | category | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 352. `risk_assessments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | risk_type | character varying | Y | 'operational'::character varying |  |
| 3 | title | character varying | Y | - |  |
| 4 | description | text | Y | - |  |
| 5 | probability | numeric | Y | 0 |  |
| 6 | impact | numeric | Y | 0 |  |
| 7 | risk_score | numeric | Y | 0 |  |
| 8 | mitigation_plan | text | Y | - |  |
| 9 | status | character varying | Y | 'identified'::character varying |  |
| 10 | owner_id | uuid | Y | - |  |
| 11 | review_date | date | Y | - |  |
| 12 | is_active | boolean | Y | true |  |
| 13 | created_at | timestamp without time zone | Y | now() |  |
| 14 | updated_at | timestamp without time zone | Y | now() |  |

---

### ניתוח כוח עבודה (Workforce Analytics) (9 טבלאות)

#### 353. `wa_installer_monthly`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_installer_monthly_id_seq'... | 🔑 PK |
| 2 | installer_id | integer | N | - |  |
| 3 | month | character varying | N | - |  |
| 4 | regular_jobs | integer | Y | 0 |  |
| 5 | complex_jobs | integer | Y | 0 |  |
| 6 | service_jobs | integer | Y | 0 |  |
| 7 | total_revenue | numeric | Y | 0 |  |
| 8 | total_cost | numeric | Y | 0 |  |
| 9 | customer_satisfaction | numeric | Y | 0 |  |
| 10 | callback_rate | numeric | Y | 0 |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | fiscal_year | integer | Y | - |  |
| 13 | fiscal_month | integer | Y | - |  |
| 14 | installer_name | character varying | Y | - |  |
| 15 | installations_planned | integer | Y | 0 |  |
| 16 | installations_completed | integer | Y | 0 |  |
| 17 | completion_rate | numeric | Y | - |  |
| 18 | callbacks | integer | Y | 0 |  |
| 19 | avg_install_hours | numeric | Y | - |  |
| 20 | revenue_generated | numeric | Y | - |  |
| 21 | cost | numeric | Y | - |  |
| 22 | profit | numeric | Y | - |  |
| 23 | is_active | boolean | Y | true |  |
| 24 | notes | text | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 354. `wa_installers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_installers_id_seq'::regcl... | 🔑 PK |
| 2 | full_name | character varying | N | - |  |
| 3 | type | character varying | Y | 'קבלן משנה'::character varying |  |
| 4 | photo_url | character varying | Y | - |  |
| 5 | regular_rate | numeric | Y | 0 |  |
| 6 | complex_rate | numeric | Y | 0 |  |
| 7 | service_rate | numeric | Y | 0 |  |
| 8 | fuel_cost | numeric | Y | 0 |  |
| 9 | vehicle_depreciation | numeric | Y | 0 |  |
| 10 | tools_cost | numeric | Y | 0 |  |
| 11 | notes | text | Y | - |  |
| 12 | is_active | boolean | N | true |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | updated_at | timestamp without time zone | N | now() |  |
| 15 | employee_id | integer | Y | - |  |
| 16 | installer_name | character varying | Y | - |  |
| 17 | phone | character varying | Y | - |  |
| 18 | territory | character varying | Y | - |  |
| 19 | skill_level | character varying | Y | - |  |
| 20 | certifications | text | Y | - |  |
| 21 | vehicle_type | character varying | Y | - |  |
| 22 | vehicle_plate | character varying | Y | - |  |
| 23 | monthly_target | integer | Y | 0 |  |
| 24 | rating | numeric | Y | - |  |
| 25 | tags | text | Y | - |  |

#### 355. `wa_production_monthly`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_production_monthly_id_seq... | 🔑 PK |
| 2 | worker_id | integer | N | - |  |
| 3 | month | character varying | N | - |  |
| 4 | units_produced | integer | Y | 0 |  |
| 5 | target_units | integer | Y | 0 |  |
| 6 | hours_worked | numeric | Y | 0 |  |
| 7 | defect_rate | numeric | Y | 0 |  |
| 8 | rework_rate | numeric | Y | 0 |  |
| 9 | total_pay | numeric | Y | 0 |  |
| 10 | production_value | numeric | Y | 0 |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | fiscal_year | integer | Y | - |  |
| 13 | fiscal_month | integer | Y | - |  |
| 14 | department | character varying | Y | - |  |
| 15 | planned_units | integer | Y | 0 |  |
| 16 | actual_units | integer | Y | 0 |  |
| 17 | efficiency_pct | numeric | Y | - |  |
| 18 | quality_pct | numeric | Y | - |  |
| 19 | scrap_pct | numeric | Y | - |  |
| 20 | rework_pct | numeric | Y | - |  |
| 21 | downtime_hours | numeric | Y | 0 |  |
| 22 | labor_hours | numeric | Y | - |  |
| 23 | overtime_hours | numeric | Y | 0 |  |
| 24 | material_cost | numeric | Y | - |  |
| 25 | labor_cost | numeric | Y | - |  |
| 26 | overhead_cost | numeric | Y | - |  |
| 27 | total_cost | numeric | Y | - |  |
| 28 | oee_pct | numeric | Y | - |  |
| 29 | is_active | boolean | Y | true |  |
| 30 | notes | text | Y | - |  |
| 31 | tags | text | Y | - |  |

#### 356. `wa_production_workers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_production_workers_id_seq... | 🔑 PK |
| 2 | full_name | character varying | N | - |  |
| 3 | type | character varying | Y | 'קבלן משנה'::character varying |  |
| 4 | specialization | character varying | Y | - |  |
| 5 | photo_url | character varying | Y | - |  |
| 6 | pay_model | character varying | Y | 'per_unit'::character varying |  |
| 7 | rate_per_unit | numeric | Y | 0 |  |
| 8 | rate_per_hour | numeric | Y | 0 |  |
| 9 | overhead_cost | numeric | Y | 0 |  |
| 10 | material_waste_cost | numeric | Y | 0 |  |
| 11 | notes | text | Y | - |  |
| 12 | is_active | boolean | N | true |  |
| 13 | created_at | timestamp without time zone | N | now() |  |
| 14 | updated_at | timestamp without time zone | N | now() |  |
| 15 | employee_id | integer | Y | - |  |
| 16 | worker_name | character varying | Y | - |  |
| 17 | department | character varying | Y | - |  |
| 18 | skill_level | character varying | Y | - |  |
| 19 | skills | text | Y | - |  |
| 20 | shift | character varying | Y | - |  |
| 21 | monthly_output_target | numeric | Y | - |  |
| 22 | monthly_output_actual | numeric | Y | 0 |  |
| 23 | quality_score | numeric | Y | - |  |
| 24 | efficiency_pct | numeric | Y | - |  |
| 25 | safety_incidents | integer | Y | 0 |  |
| 26 | attendance_pct | numeric | Y | - |  |
| 27 | tags | text | Y | - |  |

#### 357. `wa_salaried_employees`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_salaried_employees_id_seq... | 🔑 PK |
| 2 | full_name | character varying | N | - |  |
| 3 | title | character varying | Y | - |  |
| 4 | department | character varying | Y | - |  |
| 5 | manager | character varying | Y | - |  |
| 6 | start_date | date | Y | - |  |
| 7 | photo_url | character varying | Y | - |  |
| 8 | attrition_risk | numeric | Y | 0 |  |
| 9 | base_salary | numeric | Y | 0 |  |
| 10 | bonus | numeric | Y | 0 |  |
| 11 | pension_cost | numeric | Y | 0 |  |
| 12 | health_insurance | numeric | Y | 0 |  |
| 13 | meal_allowance | numeric | Y | 0 |  |
| 14 | vehicle_cost | numeric | Y | 0 |  |
| 15 | licenses_cost | numeric | Y | 0 |  |
| 16 | cloud_cost | numeric | Y | 0 |  |
| 17 | coaching_cost | numeric | Y | 0 |  |
| 18 | recruitment_cost | numeric | Y | 0 |  |
| 19 | direct_value | numeric | Y | 0 |  |
| 20 | indirect_value | numeric | Y | 0 |  |
| 21 | notes | text | Y | - |  |
| 22 | is_active | boolean | N | true |  |
| 23 | created_at | timestamp without time zone | N | now() |  |
| 24 | updated_at | timestamp without time zone | N | now() |  |
| 25 | employee_id | integer | Y | - |  |
| 26 | employee_name | character varying | Y | - |  |
| 27 | position | character varying | Y | - |  |
| 28 | hire_date | date | Y | - |  |
| 29 | salary | numeric | Y | - |  |
| 30 | bonus_target | numeric | Y | - |  |
| 31 | bonus_actual | numeric | Y | 0 |  |
| 32 | performance_score | numeric | Y | - |  |
| 33 | attendance_pct | numeric | Y | - |  |
| 34 | projects_completed | integer | Y | 0 |  |
| 35 | kpi_score | numeric | Y | - |  |
| 36 | tags | text | Y | - |  |

#### 358. `wa_salaried_kpis`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_salaried_kpis_id_seq'::re... | 🔑 PK |
| 2 | employee_id | integer | N | - |  |
| 3 | kpi_name | character varying | N | - |  |
| 4 | actual_value | numeric | Y | 0 |  |
| 5 | benchmark_value | numeric | Y | 0 |  |
| 6 | unit | character varying | Y | - |  |
| 7 | period | character varying | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | kpi_type | character varying | Y | - |  |
| 10 | target_value | numeric | Y | - |  |
| 11 | weight | numeric | Y | 1 |  |
| 12 | score | numeric | Y | - |  |
| 13 | fiscal_year | integer | Y | - |  |
| 14 | fiscal_month | integer | Y | - |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | notes | text | Y | - |  |
| 17 | tags | text | Y | - |  |

#### 359. `wa_salaried_tasks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_salaried_tasks_id_seq'::r... | 🔑 PK |
| 2 | employee_id | integer | N | - |  |
| 3 | task_name | character varying | N | - |  |
| 4 | quality_score | numeric | Y | - |  |
| 5 | status | character varying | Y | 'active'::character varying |  |
| 6 | due_date | date | Y | - |  |
| 7 | completed_at | timestamp without time zone | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | task_type | character varying | Y | - |  |
| 10 | description | text | Y | - |  |
| 11 | priority | character varying | Y | 'medium'::character varying |  |
| 12 | completed_date | date | Y | - |  |
| 13 | assigned_by | character varying | Y | - |  |
| 14 | project_id | integer | Y | - |  |
| 15 | estimated_hours | numeric | Y | - |  |
| 16 | actual_hours | numeric | Y | - |  |
| 17 | notes | text | Y | - |  |
| 18 | tags | text | Y | - |  |

#### 360. `wa_sales_agents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_sales_agents_id_seq'::reg... | 🔑 PK |
| 2 | full_name | character varying | N | - |  |
| 3 | type | character varying | Y | 'קבלן משנה'::character varying |  |
| 4 | photo_url | character varying | Y | - |  |
| 5 | retainer_fee | numeric | Y | 0 |  |
| 6 | closing_commission_pct | numeric | Y | 0 |  |
| 7 | upsell_commission_pct | numeric | Y | 0 |  |
| 8 | target_bonus_amount | numeric | Y | 0 |  |
| 9 | target_bonus_threshold | numeric | Y | 0 |  |
| 10 | notes | text | Y | - |  |
| 11 | is_active | boolean | N | true |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | updated_at | timestamp without time zone | N | now() |  |
| 14 | employee_id | integer | Y | - |  |
| 15 | agent_name | character varying | Y | - |  |
| 16 | territory | character varying | Y | - |  |
| 17 | monthly_target | numeric | Y | - |  |
| 18 | monthly_actual | numeric | Y | 0 |  |
| 19 | ytd_target | numeric | Y | - |  |
| 20 | ytd_actual | numeric | Y | 0 |  |
| 21 | deals_count | integer | Y | 0 |  |
| 22 | conversion_rate | numeric | Y | - |  |
| 23 | avg_deal_size | numeric | Y | - |  |
| 24 | commission_earned | numeric | Y | 0 |  |
| 25 | tags | text | Y | - |  |

#### 361. `wa_sales_deals`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('wa_sales_deals_id_seq'::regc... | 🔑 PK |
| 2 | agent_id | integer | N | - |  |
| 3 | deal_name | character varying | N | - |  |
| 4 | contract_value | numeric | Y | 0 |  |
| 5 | commission_pct | numeric | Y | 0 |  |
| 6 | actual_commission | numeric | Y | 0 |  |
| 7 | status | character varying | Y | 'pipeline'::character varying |  |
| 8 | closed_at | date | Y | - |  |
| 9 | notes | text | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | deal_number | character varying | Y | - |  |
| 12 | customer_id | integer | Y | - |  |
| 13 | customer_name | character varying | Y | - |  |
| 14 | amount | numeric | Y | - |  |
| 15 | stage | character varying | Y | - |  |
| 16 | probability_pct | numeric | Y | - |  |
| 17 | expected_close_date | date | Y | - |  |
| 18 | actual_close_date | date | Y | - |  |
| 19 | product_category | character varying | Y | - |  |
| 20 | source | character varying | Y | - |  |
| 21 | competitor | character varying | Y | - |  |
| 22 | won | boolean | Y | - |  |
| 23 | lost_reason | character varying | Y | - |  |
| 24 | is_active | boolean | Y | true |  |
| 25 | tags | text | Y | - |  |

---

### ניתוח עסקי (Business Analytics) (1 טבלאות)

#### 362. `ba_currency_exposures`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('ba_currency_exposures_id_seq... | 🔑 PK |
| 2 | currency_pair | text | N | - |  |
| 3 | exposure_amount | numeric | Y | 0 |  |
| 4 | expiry_date | text | Y | - |  |
| 5 | hedging_type | text | Y | 'none'::text |  |
| 6 | hedging_cost_percent | numeric | Y | 0 |  |
| 7 | notes | text | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |
| 10 | currency | character varying | Y | - |  |
| 11 | exposure_type | character varying | Y | - |  |
| 12 | total_amount | numeric | Y | - |  |
| 13 | hedged_amount | numeric | Y | 0 |  |
| 14 | unhedged_amount | numeric | Y | - |  |
| 15 | exchange_rate | numeric | Y | - |  |
| 16 | ils_equivalent | numeric | Y | - |  |
| 17 | risk_level | character varying | Y | - |  |
| 18 | as_of_date | date | Y | - |  |
| 19 | is_active | boolean | Y | true |  |
| 20 | tags | text | Y | - |  |

---

### סחר חוץ (Foreign Trade) (6 טבלאות)

#### 363. `customs_clearances`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('customs_clearances_id_seq'::... | 🔑 PK |
| 2 | clearance_number | text | N | - | UNIQUE |
| 3 | import_order_id | integer | Y | - |  |
| 4 | declaration_number | text | Y | - |  |
| 5 | customs_broker | text | Y | - |  |
| 6 | broker_phone | text | Y | - |  |
| 7 | broker_email | text | Y | - |  |
| 8 | port_of_entry | text | Y | 'חיפה'::text |  |
| 9 | arrival_date | date | Y | - |  |
| 10 | submission_date | date | Y | - |  |
| 11 | release_date | date | Y | - |  |
| 12 | clearance_date | date | Y | - |  |
| 13 | goods_value | numeric | Y | 0 |  |
| 14 | goods_currency | text | Y | 'USD'::text |  |
| 15 | exchange_rate | numeric | Y | 1 |  |
| 16 | goods_value_ils | numeric | Y | 0 |  |
| 17 | customs_duty_pct | numeric | Y | 0 |  |
| 18 | customs_duty_amount | numeric | Y | 0 |  |
| 19 | purchase_tax_pct | numeric | Y | 0 |  |
| 20 | purchase_tax_amount | numeric | Y | 0 |  |
| 21 | vat_pct | numeric | Y | 18 |  |
| 22 | vat_amount | numeric | Y | 0 |  |
| 23 | port_fees | numeric | Y | 0 |  |
| 24 | storage_fees | numeric | Y | 0 |  |
| 25 | inspection_fees | numeric | Y | 0 |  |
| 26 | broker_fees | numeric | Y | 0 |  |
| 27 | other_fees | numeric | Y | 0 |  |
| 28 | total_fees | numeric | Y | 0 |  |
| 29 | total_taxes | numeric | Y | 0 |  |
| 30 | total_cost | numeric | Y | 0 |  |
| 31 | hs_codes | text | Y | - |  |
| 32 | customs_classification | text | Y | - |  |
| 33 | container_numbers | text | Y | - |  |
| 34 | bill_of_lading | text | Y | - |  |
| 35 | doc_commercial_invoice | boolean | Y | false |  |
| 36 | doc_packing_list | boolean | Y | false |  |
| 37 | doc_bill_of_lading | boolean | Y | false |  |
| 38 | doc_certificate_of_origin | boolean | Y | false |  |
| 39 | doc_insurance_certificate | boolean | Y | false |  |
| 40 | doc_customs_declaration | boolean | Y | false |  |
| 41 | doc_inspection_report | boolean | Y | false |  |
| 42 | doc_letter_of_credit | boolean | Y | false |  |
| 43 | doc_phytosanitary | boolean | Y | false |  |
| 44 | doc_standards_certificate | boolean | Y | false |  |
| 45 | supplier_name | text | Y | - |  |
| 46 | country_of_origin | text | Y | - |  |
| 47 | responsible_person | text | Y | - |  |
| 48 | notes | text | Y | - |  |
| 49 | status | text | N | 'ממתין'::text |  |
| 50 | priority | text | Y | 'רגילה'::text |  |
| 51 | created_at | timestamp without time zone | N | now() |  |
| 52 | updated_at | timestamp without time zone | N | now() |  |
| 53 | broker_fee | numeric | Y | - |  |
| 54 | inspection_required | boolean | Y | false |  |
| 55 | inspection_result | character varying | Y | - |  |
| 56 | quarantine_required | boolean | Y | false |  |
| 57 | quarantine_release_date | date | Y | - |  |
| 58 | preferential_origin | boolean | Y | false |  |
| 59 | fta_certificate | character varying | Y | - |  |
| 60 | customs_agent | character varying | Y | - |  |
| 61 | agent_phone | character varying | Y | - |  |
| 62 | container_number | character varying | Y | - |  |
| 63 | container_type | character varying | Y | - |  |
| 64 | seal_number | character varying | Y | - |  |
| 65 | inspection_date | date | Y | - |  |
| 66 | delivery_to_warehouse_date | date | Y | - |  |
| 67 | documents_url | text | Y | - |  |
| 68 | tags | text | Y | - |  |

#### 364. `import_order_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('import_order_items_id_seq'::... | 🔑 PK |
| 2 | import_order_id | integer | N | - | FK → import_orders.id |
| 3 | item_name | text | N | - |  |
| 4 | item_code | text | Y | - |  |
| 5 | hs_code | text | Y | - |  |
| 6 | description | text | Y | - |  |
| 7 | quantity | numeric | N | 1 |  |
| 8 | unit | text | Y | 'יח'::text |  |
| 9 | unit_price | numeric | N | 0 |  |
| 10 | total_price | numeric | Y | 0 |  |
| 11 | customs_duty_pct | numeric | Y | 0 |  |
| 12 | customs_duty_amount | numeric | Y | 0 |  |
| 13 | weight_kg | numeric | Y | - |  |
| 14 | volume_cbm | numeric | Y | - |  |
| 15 | country_of_origin | text | Y | - |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | line_number | integer | Y | - |  |
| 19 | material_id | integer | Y | - |  |
| 20 | material_name | character varying | Y | - |  |
| 21 | material_code | character varying | Y | - |  |
| 22 | product_id | integer | Y | - |  |
| 23 | product_name | character varying | Y | - |  |
| 24 | uom | character varying | Y | - |  |
| 25 | unit_price_fob | numeric | Y | - |  |
| 26 | unit_price_cif | numeric | Y | - |  |
| 27 | landed_cost_per_unit | numeric | Y | - |  |
| 28 | customs_tariff | character varying | Y | - |  |
| 29 | heat_number | character varying | Y | - |  |
| 30 | certificate_number | character varying | Y | - |  |
| 31 | tags | text | Y | - |  |

#### 365. `import_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('import_orders_id_seq'::regcl... | 🔑 PK |
| 2 | order_number | text | N | - | UNIQUE |
| 3 | supplier_id | integer | Y | - |  |
| 4 | supplier_name | text | Y | - |  |
| 5 | country_of_origin | text | Y | - |  |
| 6 | incoterms | text | Y | 'FOB'::text |  |
| 7 | currency | text | Y | 'USD'::text |  |
| 8 | exchange_rate | numeric | Y | 1 |  |
| 9 | total_value | numeric | Y | 0 |  |
| 10 | total_value_ils | numeric | Y | 0 |  |
| 11 | customs_duty_pct | numeric | Y | 0 |  |
| 12 | estimated_customs_duty | numeric | Y | 0 |  |
| 13 | customs_classification | text | Y | - |  |
| 14 | shipping_method | text | Y | 'sea'::text |  |
| 15 | container_type | text | Y | - |  |
| 16 | container_count | integer | Y | 1 |  |
| 17 | port_of_origin | text | Y | - |  |
| 18 | port_of_destination | text | Y | 'חיפה'::text |  |
| 19 | estimated_departure | date | Y | - |  |
| 20 | estimated_arrival | date | Y | - |  |
| 21 | actual_arrival | date | Y | - |  |
| 22 | insurance_company | text | Y | - |  |
| 23 | insurance_policy_number | text | Y | - |  |
| 24 | insurance_value | numeric | Y | 0 |  |
| 25 | lc_number | text | Y | - |  |
| 26 | lc_bank | text | Y | - |  |
| 27 | lc_amount | numeric | Y | 0 |  |
| 28 | lc_expiry_date | date | Y | - |  |
| 29 | freight_cost | numeric | Y | 0 |  |
| 30 | handling_cost | numeric | Y | 0 |  |
| 31 | other_costs | numeric | Y | 0 |  |
| 32 | total_landed_cost | numeric | Y | 0 |  |
| 33 | customs_broker | text | Y | - |  |
| 34 | forwarding_agent | text | Y | - |  |
| 35 | contact_person | text | Y | - |  |
| 36 | contact_phone | text | Y | - |  |
| 37 | contact_email | text | Y | - |  |
| 38 | notes | text | Y | - |  |
| 39 | status | text | N | 'טיוטה'::text |  |
| 40 | priority | text | Y | 'רגילה'::text |  |
| 41 | created_at | timestamp without time zone | N | now() |  |
| 42 | updated_at | timestamp without time zone | N | now() |  |
| 43 | port_of_loading | character varying | Y | - |  |
| 44 | port_of_discharge | character varying | Y | - |  |
| 45 | vessel_name | character varying | Y | - |  |
| 46 | eta | date | Y | - |  |
| 47 | ata | date | Y | - |  |
| 48 | container_number | character varying | Y | - |  |
| 49 | origin_country | character varying | Y | - |  |
| 50 | origin_port | character varying | Y | - |  |
| 51 | destination_port | character varying | Y | - |  |
| 52 | shipping_line | character varying | Y | - |  |
| 53 | voyage_number | character varying | Y | - |  |
| 54 | bill_of_lading | character varying | Y | - |  |
| 55 | customs_clearance_id | integer | Y | - |  |
| 56 | total_fob | numeric | Y | 0 |  |
| 57 | insurance_cost | numeric | Y | 0 |  |
| 58 | customs_duty | numeric | Y | 0 |  |
| 59 | vat_on_import | numeric | Y | 0 |  |
| 60 | total_cost_ils | numeric | Y | 0 |  |
| 61 | documents_url | text | Y | - |  |
| 62 | tags | text | Y | - |  |
| 63 | import_number | character varying | Y | - |  |
| 64 | customs_broker_phone | character varying | Y | - |  |
| 65 | freight_forwarder | character varying | Y | - |  |
| 66 | freight_forwarder_phone | character varying | Y | - |  |
| 67 | insurance_provider | character varying | Y | - |  |
| 68 | insurance_policy | character varying | Y | - |  |
| 69 | insurance_amount | numeric | Y | - |  |
| 70 | customs_tariff_code | character varying | Y | - |  |
| 71 | customs_duty_amount | numeric | Y | - |  |
| 72 | anti_dumping_duty | numeric | Y | 0 |  |
| 73 | purchase_tax | numeric | Y | 0 |  |
| 74 | import_license_number | character varying | Y | - |  |
| 75 | import_license_expiry | date | Y | - |  |
| 76 | standards_approval | character varying | Y | - |  |
| 77 | standards_approval_number | character varying | Y | - |  |
| 78 | certificate_of_origin | boolean | Y | false |  |
| 79 | eur1_certificate | boolean | Y | false |  |
| 80 | free_trade_agreement | character varying | Y | - |  |
| 81 | reduced_duty_pct | numeric | Y | - |  |
| 82 | container_numbers | text | Y | - |  |
| 83 | weight_gross_kg | numeric | Y | - |  |
| 84 | weight_net_kg | numeric | Y | - |  |
| 85 | volume_cbm | numeric | Y | - |  |
| 86 | landing_costs_total | numeric | Y | - |  |
| 87 | exchange_rate_at_order | numeric | Y | - |  |
| 88 | exchange_rate_at_customs | numeric | Y | - |  |

#### 366. `letters_of_credit`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('letters_of_credit_id_seq'::r... | 🔑 PK |
| 2 | lc_number | text | N | - | UNIQUE |
| 3 | lc_type | text | N | 'Irrevocable'::text |  |
| 4 | status | text | N | 'טיוטה'::text |  |
| 5 | issuing_bank | text | N | - |  |
| 6 | issuing_bank_branch | text | Y | - |  |
| 7 | issuing_bank_swift | text | Y | - |  |
| 8 | advising_bank | text | Y | - |  |
| 9 | advising_bank_swift | text | Y | - |  |
| 10 | confirming_bank | text | Y | - |  |
| 11 | applicant_name | text | N | - |  |
| 12 | applicant_address | text | Y | - |  |
| 13 | beneficiary_name | text | N | - |  |
| 14 | beneficiary_address | text | Y | - |  |
| 15 | beneficiary_country | text | Y | - |  |
| 16 | amount | numeric | N | 0 |  |
| 17 | currency | text | N | 'USD'::text |  |
| 18 | amount_tolerance_plus | numeric | Y | 0 |  |
| 19 | amount_tolerance_minus | numeric | Y | 0 |  |
| 20 | amount_in_words | text | Y | - |  |
| 21 | issue_date | date | Y | - |  |
| 22 | expiry_date | date | N | - |  |
| 23 | expiry_place | text | Y | - |  |
| 24 | latest_shipment_date | date | Y | - |  |
| 25 | presentation_period | integer | Y | 21 |  |
| 26 | partial_shipments | text | Y | 'Allowed'::text |  |
| 27 | transshipment | text | Y | 'Allowed'::text |  |
| 28 | incoterms | text | Y | 'FOB'::text |  |
| 29 | port_of_loading | text | Y | - |  |
| 30 | port_of_discharge | text | Y | - |  |
| 31 | country_of_origin | text | Y | - |  |
| 32 | goods_description | text | Y | - |  |
| 33 | hs_code | text | Y | - |  |
| 34 | linked_import_order_id | integer | Y | - |  |
| 35 | linked_supplier_id | integer | Y | - |  |
| 36 | required_documents | text | Y | - |  |
| 37 | additional_conditions | text | Y | - |  |
| 38 | payment_terms | text | Y | 'At Sight'::text |  |
| 39 | deferred_payment_days | integer | Y | - |  |
| 40 | charges_applicant | text | Y | 'Opening charges'::text |  |
| 41 | charges_beneficiary | text | Y | 'Advising charges'::text |  |
| 42 | commission_rate | numeric | Y | 0 |  |
| 43 | commission_amount | numeric | Y | 0 |  |
| 44 | insurance_required | boolean | Y | false |  |
| 45 | insurance_coverage | numeric | Y | 110 |  |
| 46 | amendment_count | integer | Y | 0 |  |
| 47 | last_amendment_date | date | Y | - |  |
| 48 | negotiation_date | date | Y | - |  |
| 49 | payment_date | date | Y | - |  |
| 50 | paid_amount | numeric | Y | 0 |  |
| 51 | outstanding_amount | numeric | Y | 0 |  |
| 52 | discrepancy_notes | text | Y | - |  |
| 53 | rejection_reason | text | Y | - |  |
| 54 | swift_message_type | text | Y | 'MT700'::text |  |
| 55 | ucp_version | text | Y | 'UCP 600'::text |  |
| 56 | governing_law | text | Y | 'ICC Rules'::text |  |
| 57 | notes | text | Y | - |  |
| 58 | created_by | text | Y | - |  |
| 59 | approved_by | text | Y | - |  |
| 60 | approved_date | date | Y | - |  |
| 61 | created_at | timestamp without time zone | N | now() |  |
| 62 | updated_at | timestamp without time zone | N | now() |  |
| 63 | confirmation_charge | numeric | Y | - |  |
| 64 | discrepancy_count | integer | Y | 0 |  |
| 65 | last_discrepancy | text | Y | - |  |
| 66 | swift_reference | character varying | Y | - |  |
| 67 | usance_days | integer | Y | - |  |
| 68 | bank_reference | character varying | Y | - |  |
| 69 | beneficiary_bank | character varying | Y | - |  |
| 70 | beneficiary_bank_swift | character varying | Y | - |  |
| 71 | documents_required | text | Y | - |  |
| 72 | documents_submitted | text | Y | - |  |
| 73 | discrepancies | text | Y | - |  |
| 74 | commission_pct | numeric | Y | - |  |
| 75 | margin_pct | numeric | Y | - |  |
| 76 | margin_amount | numeric | Y | - |  |
| 77 | tags | text | Y | - |  |

#### 367. `shipment_status_updates`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('shipment_status_updates_id_s... | 🔑 PK |
| 2 | shipment_id | integer | N | - | FK → shipment_tracking.id |
| 3 | status | text | N | - |  |
| 4 | location | text | Y | - |  |
| 5 | description | text | Y | - |  |
| 6 | update_date | timestamp without time zone | N | now() |  |
| 7 | updated_by | text | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | carrier_status | character varying | Y | - |  |
| 10 | carrier_reference | character varying | Y | - |  |
| 11 | estimated_arrival | date | Y | - |  |
| 12 | documents_url | text | Y | - |  |
| 13 | tags | text | Y | - |  |
| 14 | customs_status | character varying | Y | - |  |
| 15 | weather_delay | boolean | Y | false |  |
| 16 | delay_reason | text | Y | - |  |
| 17 | photo_url | text | Y | - |  |

#### 368. `shipment_tracking`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('shipment_tracking_id_seq'::r... | 🔑 PK |
| 2 | shipment_number | text | N | - | UNIQUE |
| 3 | import_order_id | integer | Y | - |  |
| 4 | carrier_name | text | Y | - |  |
| 5 | carrier_type | text | Y | 'sea'::text |  |
| 6 | tracking_number | text | Y | - |  |
| 7 | booking_number | text | Y | - |  |
| 8 | vessel_name | text | Y | - |  |
| 9 | voyage_number | text | Y | - |  |
| 10 | origin_port | text | Y | - |  |
| 11 | destination_port | text | Y | 'חיפה'::text |  |
| 12 | origin_country | text | Y | - |  |
| 13 | etd | date | Y | - |  |
| 14 | eta | date | Y | - |  |
| 15 | actual_departure | date | Y | - |  |
| 16 | actual_arrival | date | Y | - |  |
| 17 | container_number | text | Y | - |  |
| 18 | container_type | text | Y | - |  |
| 19 | container_count | integer | Y | 1 |  |
| 20 | seal_number | text | Y | - |  |
| 21 | bill_of_lading | text | Y | - |  |
| 22 | goods_description | text | Y | - |  |
| 23 | weight_kg | numeric | Y | - |  |
| 24 | volume_cbm | numeric | Y | - |  |
| 25 | packages_count | integer | Y | - |  |
| 26 | freight_cost | numeric | Y | 0 |  |
| 27 | freight_currency | text | Y | 'USD'::text |  |
| 28 | insurance_value | numeric | Y | 0 |  |
| 29 | goods_value | numeric | Y | 0 |  |
| 30 | supplier_name | text | Y | - |  |
| 31 | consignee | text | Y | - |  |
| 32 | notify_party | text | Y | - |  |
| 33 | forwarding_agent | text | Y | - |  |
| 34 | agent_phone | text | Y | - |  |
| 35 | agent_email | text | Y | - |  |
| 36 | customs_broker | text | Y | - |  |
| 37 | current_location | text | Y | - |  |
| 38 | last_update_date | timestamp without time zone | Y | - |  |
| 39 | delay_days | integer | Y | 0 |  |
| 40 | delay_reason | text | Y | - |  |
| 41 | notes | text | Y | - |  |
| 42 | status | text | N | 'הוזמן'::text |  |
| 43 | priority | text | Y | 'רגילה'::text |  |
| 44 | created_at | timestamp without time zone | N | now() |  |
| 45 | updated_at | timestamp without time zone | N | now() |  |
| 46 | carrier_tracking_url | text | Y | - |  |
| 47 | pod_signed | boolean | Y | false |  |
| 48 | pod_signer | character varying | Y | - |  |
| 49 | pod_date | timestamp without time zone | Y | - |  |
| 50 | damage_reported | boolean | Y | false |  |
| 51 | damage_description | text | Y | - |  |
| 52 | insurance_claimed | boolean | Y | false |  |
| 53 | carrier_phone | character varying | Y | - |  |
| 54 | driver_name | character varying | Y | - |  |
| 55 | driver_phone | character varying | Y | - |  |
| 56 | vehicle_number | character varying | Y | - |  |
| 57 | pickup_date | date | Y | - |  |
| 58 | pickup_time | time without time zone | Y | - |  |
| 59 | delivery_date | date | Y | - |  |
| 60 | delivery_time | time without time zone | Y | - |  |
| 61 | actual_delivery_date | date | Y | - |  |
| 62 | estimated_arrival | timestamp with time zone | Y | - |  |
| 63 | pallets_count | integer | Y | - |  |
| 64 | temperature_controlled | boolean | Y | false |  |
| 65 | temperature_range | character varying | Y | - |  |
| 66 | fragile | boolean | Y | false |  |
| 67 | hazardous | boolean | Y | false |  |
| 68 | proof_of_delivery_url | text | Y | - |  |
| 69 | photos_url | text | Y | - |  |
| 70 | documents_url | text | Y | - |  |
| 71 | tags | text | Y | - |  |
| 72 | carrier | character varying | Y | - |  |
| 73 | eta_port | date | Y | - |  |
| 74 | ata_port | date | Y | - |  |
| 75 | customs_clearance_date | date | Y | - |  |
| 76 | warehouse_arrival | date | Y | - |  |
| 77 | delivery_confirmed | boolean | Y | false |  |
| 78 | delivery_confirmed_by | character varying | Y | - |  |
| 79 | delivery_confirmed_date | date | Y | - |  |
| 80 | damage_photos_url | text | Y | - |  |
| 81 | insurance_claim | boolean | Y | false |  |
| 82 | insurance_claim_ref | character varying | Y | - |  |

---

### עצי מוצר (Bill of Materials) (2 טבלאות)

#### 369. `bom_headers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('bom_headers_id_seq'::regclass) | 🔑 PK |
| 2 | bom_number | text | N | - | UNIQUE |
| 3 | name | text | N | - |  |
| 4 | product_name | text | Y | - |  |
| 5 | product_sku | text | Y | - |  |
| 6 | version | text | Y | '1.0'::text |  |
| 7 | status | text | Y | 'draft'::text |  |
| 8 | description | text | Y | - |  |
| 9 | total_cost | numeric | Y | 0 |  |
| 10 | created_by | text | Y | - |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |
| 13 | category | character varying | Y | - |  |
| 14 | effective_date | date | Y | - |  |
| 15 | expiry_date | date | Y | - |  |
| 16 | approved_by | character varying | Y | - |  |
| 17 | approved_at | timestamp with time zone | Y | - |  |
| 18 | labor_cost | numeric | Y | 0 |  |
| 19 | overhead_cost | numeric | Y | 0 |  |
| 20 | cycle_time_minutes | numeric | Y | - |  |
| 21 | yield_percent | numeric | Y | 100 |  |
| 22 | routing_notes | text | Y | - |  |
| 23 | revision_number | integer | Y | 1 |  |
| 24 | unit | character varying | Y | 'יחידה'::character varying |  |
| 25 | batch_size | numeric | Y | 1 |  |
| 26 | drawing_number | character varying | Y | - |  |
| 27 | customer_name | character varying | Y | - |  |
| 28 | project_id | integer | Y | - |  |
| 29 | bom_type | character varying | Y | - |  |
| 30 | revision_date | date | Y | - |  |
| 31 | approval_date | date | Y | - |  |
| 32 | engineering_change_number | character varying | Y | - |  |
| 33 | production_quantity | numeric | Y | - |  |
| 34 | scrap_factor | numeric | Y | - |  |
| 35 | routing_id | integer | Y | - |  |
| 36 | alternative_bom_id | integer | Y | - |  |
| 37 | product_id | integer | Y | - |  |
| 38 | customer_id | integer | Y | - |  |
| 39 | project_name | character varying | Y | - |  |
| 40 | complexity | character varying | Y | 'standard'::character varying |  |
| 41 | total_material_cost | numeric | Y | 0 |  |
| 42 | total_items_count | integer | Y | 0 |  |
| 43 | standard_time_minutes | numeric | Y | - |  |
| 44 | yield_pct | numeric | Y | 100 |  |
| 45 | scrap_pct | numeric | Y | 0 |  |
| 46 | revision_notes | text | Y | - |  |
| 47 | change_reason | text | Y | - |  |
| 48 | reviewed_by | character varying | Y | - |  |
| 49 | reviewed_at | timestamp with time zone | Y | - |  |
| 50 | locked | boolean | Y | false |  |
| 51 | locked_at | timestamp with time zone | Y | - |  |
| 52 | drawing_url | text | Y | - |  |
| 53 | photo_url | text | Y | - |  |
| 54 | internal_notes | text | Y | - |  |
| 55 | tags | text | Y | - |  |
| 56 | production_type | character varying | Y | - |  |
| 57 | standard_batch_size | numeric | Y | - |  |
| 58 | labor_hours_per_unit | numeric | Y | - |  |
| 59 | machine_hours_per_unit | numeric | Y | - |  |
| 60 | total_labor_cost | numeric | Y | 0 |  |
| 61 | total_overhead | numeric | Y | 0 |  |
| 62 | total_cost_per_unit | numeric | Y | 0 |  |
| 63 | waste_factor_pct | numeric | Y | 0 |  |
| 64 | routing_steps | text | Y | - |  |
| 65 | quality_requirements | text | Y | - |  |
| 66 | safety_requirements | text | Y | - |  |
| 67 | environmental_requirements | text | Y | - |  |
| 68 | packaging_instructions | text | Y | - |  |
| 69 | shipping_instructions | text | Y | - |  |

#### 370. `bom_lines`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('bom_lines_id_seq'::regclass) | 🔑 PK |
| 2 | bom_header_id | integer | N | - |  |
| 3 | component_name | text | N | - |  |
| 4 | component_sku | text | Y | - |  |
| 5 | quantity | numeric | Y | 1 |  |
| 6 | unit | text | Y | 'יחידה'::text |  |
| 7 | unit_cost | numeric | Y | 0 |  |
| 8 | total_cost | numeric | Y | 0 |  |
| 9 | level | integer | Y | 1 |  |
| 10 | parent_line_id | integer | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |
| 14 | material_id | integer | Y | - |  |
| 15 | scrap_factor | numeric | Y | 0 |  |
| 16 | is_critical | boolean | Y | false |  |
| 17 | substitute_material | text | Y | - |  |
| 18 | position_number | integer | Y | - |  |
| 19 | operation_number | integer | Y | - |  |
| 20 | lead_time_offset_days | integer | Y | 0 |  |
| 21 | warehouse | character varying | Y | - |  |
| 22 | phantom | boolean | Y | false |  |
| 23 | effective_date | date | Y | - |  |
| 24 | expiry_date | date | Y | - |  |
| 25 | item_type | character varying | Y | 'material'::character varying |  |
| 26 | cost_per_unit | numeric | Y | 0 |  |
| 27 | currency | character varying | Y | 'ILS'::character varying |  |
| 28 | supplier_id | integer | Y | - |  |
| 29 | supplier_name | character varying | Y | - |  |
| 30 | drawing_reference | character varying | Y | - |  |
| 31 | alternative_item | text | Y | - |  |
| 32 | quality_specs | text | Y | - |  |
| 33 | line_number | integer | Y | - |  |
| 34 | item_id | integer | Y | - |  |
| 35 | item_name | character varying | Y | - |  |
| 36 | item_code | character varying | Y | - |  |
| 37 | uom | character varying | Y | 'יחידה'::character varying |  |
| 38 | quantity_per_unit | numeric | Y | - |  |
| 39 | scrap_pct | numeric | Y | 0 |  |
| 40 | quantity_with_scrap | numeric | Y | - |  |
| 41 | lead_time_days | integer | Y | - |  |
| 42 | bin_location | character varying | Y | - |  |
| 43 | is_phantom | boolean | Y | false |  |
| 44 | tags | text | Y | - |  |

---

### קובי-AI (Claude Integration) (6 טבלאות)

#### 371. `claude_audit_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('claude_audit_logs_id_seq'::r... | 🔑 PK |
| 2 | action_type | text | N | - |  |
| 3 | caller | text | Y | - |  |
| 4 | target_api | text | N | - |  |
| 5 | http_method | text | N | - |  |
| 6 | http_path | text | N | - |  |
| 7 | input_summary | text | Y | - |  |
| 8 | output_summary | text | Y | - |  |
| 9 | status | text | N | - |  |
| 10 | status_code | integer | Y | - |  |
| 11 | response_time_ms | integer | Y | - |  |
| 12 | session_id | integer | Y | - |  |
| 13 | error_message | text | Y | - |  |
| 14 | created_at | timestamp without time zone | N | now() |  |

#### 372. `claude_chat_conversations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('claude_chat_conversations_id... | 🔑 PK |
| 2 | channel | text | N | - |  |
| 3 | title | text | N | - |  |
| 4 | model | text | N | 'claude-sonnet-4-6'::text |  |
| 5 | status | text | N | 'active'::text |  |
| 6 | total_messages | integer | N | 0 |  |
| 7 | total_input_tokens | integer | N | 0 |  |
| 8 | total_output_tokens | integer | N | 0 |  |
| 9 | pinned | boolean | N | false |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |

#### 373. `claude_chat_messages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('claude_chat_messages_id_seq'... | 🔑 PK |
| 2 | conversation_id | integer | N | - |  |
| 3 | role | text | N | - |  |
| 4 | content | text | N | - |  |
| 5 | channel | text | N | - |  |
| 6 | input_tokens | integer | Y | - |  |
| 7 | output_tokens | integer | Y | - |  |
| 8 | model | text | Y | - |  |
| 9 | response_time_ms | integer | Y | - |  |
| 10 | created_at | timestamp without time zone | N | now() |  |

#### 374. `claude_connection_tests`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('claude_connection_tests_id_s... | 🔑 PK |
| 2 | status | text | N | - |  |
| 3 | model | text | N | - |  |
| 4 | response_time_ms | integer | Y | - |  |
| 5 | input_tokens | integer | Y | - |  |
| 6 | output_tokens | integer | Y | - |  |
| 7 | response_summary | text | Y | - |  |
| 8 | error_message | text | Y | - |  |
| 9 | error_code | text | Y | - |  |
| 10 | tested_at | timestamp without time zone | N | now() |  |

#### 375. `claude_governance_logs`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('claude_governance_logs_id_se... | 🔑 PK |
| 2 | action | text | N | - |  |
| 3 | entity_type | text | N | - |  |
| 4 | entity_id | integer | N | - |  |
| 5 | module_id | integer | Y | - |  |
| 6 | status | text | N | 'pending'::text |  |
| 7 | validation_result | jsonb | Y | '{}'::jsonb |  |
| 8 | change_set_id | text | Y | - |  |
| 9 | previous_state | jsonb | Y | - |  |
| 10 | new_state | jsonb | Y | - |  |
| 11 | performed_by | text | Y | 'claude'::text |  |
| 12 | notes | text | Y | - |  |
| 13 | created_at | timestamp without time zone | N | now() |  |

#### 376. `claude_sessions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('claude_sessions_id_seq'::reg... | 🔑 PK |
| 2 | model | text | N | - |  |
| 3 | status | text | N | 'active'::text |  |
| 4 | total_input_tokens | integer | N | 0 |  |
| 5 | total_output_tokens | integer | N | 0 |  |
| 6 | message_count | integer | N | 0 |  |
| 7 | metadata | text | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |
| 10 | ended_at | timestamp without time zone | Y | - |  |

---

### קטלוג פבריקציה (Fabrication Catalog) (3 טבלאות)

#### 377. `accessories_hardware`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('accessories_hardware_id_seq'... | 🔑 PK |
| 2 | part_number | text | N | - | UNIQUE |
| 3 | part_name | text | N | - |  |
| 4 | part_name_he | text | Y | - |  |
| 5 | category | text | N | 'handle'::text |  |
| 6 | sub_category | text | Y | - |  |
| 7 | material | text | Y | - |  |
| 8 | finish | text | Y | - |  |
| 9 | color | text | Y | - |  |
| 10 | brand | text | Y | - |  |
| 11 | model | text | Y | - |  |
| 12 | compatible_systems | text | Y | - |  |
| 13 | compatible_profiles | text | Y | - |  |
| 14 | dimensions_mm | text | Y | - |  |
| 15 | weight_grams | numeric | Y | - |  |
| 16 | load_capacity_kg | numeric | Y | - |  |
| 17 | operation_cycles | integer | Y | - |  |
| 18 | security_level | text | Y | - |  |
| 19 | fire_rated | boolean | Y | false |  |
| 20 | anti_corrosion | boolean | Y | false |  |
| 21 | child_safe | boolean | Y | false |  |
| 22 | supplier_id | integer | Y | - |  |
| 23 | cost_per_unit | numeric | Y | - |  |
| 24 | selling_price | numeric | Y | - |  |
| 25 | current_stock | numeric | Y | 0 |  |
| 26 | minimum_stock | numeric | Y | - |  |
| 27 | reorder_point | numeric | Y | - |  |
| 28 | warehouse_location | text | Y | - |  |
| 29 | image_url | text | Y | - |  |
| 30 | drawing_url | text | Y | - |  |
| 31 | status | text | N | 'active'::text |  |
| 32 | notes | text | Y | - |  |
| 33 | created_at | timestamp without time zone | Y | now() |  |
| 34 | updated_at | timestamp without time zone | Y | now() |  |

#### 378. `colors`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('colors_id_seq'::regclass) | 🔑 PK |
| 2 | color_code | text | N | - | UNIQUE |
| 3 | color_name | text | N | - |  |
| 4 | color_name_he | text | Y | - |  |
| 5 | color_system | text | N | 'RAL'::text |  |
| 6 | ral_number | text | Y | - |  |
| 7 | hex_value | text | Y | - |  |
| 8 | color_family | text | Y | - |  |
| 9 | is_metallic | boolean | Y | false |  |
| 10 | is_wood_grain | boolean | Y | false |  |
| 11 | texture_type | text | Y | - |  |
| 12 | applicable_finishes | text | Y | - |  |
| 13 | surcharge_percent | numeric | Y | 0 |  |
| 14 | popularity_rank | integer | Y | - |  |
| 15 | image_url | text | Y | - |  |
| 16 | status | text | N | 'active'::text |  |
| 17 | notes | text | Y | - |  |
| 18 | created_at | timestamp without time zone | Y | now() |  |
| 19 | updated_at | timestamp without time zone | Y | now() |  |

#### 379. `finishes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('finishes_id_seq'::regclass) | 🔑 PK |
| 2 | finish_code | text | N | - | UNIQUE |
| 3 | finish_name | text | N | - |  |
| 4 | finish_type | text | N | 'powder_coating'::text |  |
| 5 | applicable_materials | text | Y | - |  |
| 6 | thickness_microns | numeric | Y | - |  |
| 7 | min_coats | integer | Y | 1 |  |
| 8 | cure_temperature_c | numeric | Y | - |  |
| 9 | cure_time_minutes | integer | Y | - |  |
| 10 | durability_class | text | Y | - |  |
| 11 | weather_resistance | text | Y | - |  |
| 12 | corrosion_resistance | text | Y | - |  |
| 13 | warranty_years | integer | Y | - |  |
| 14 | qualicoat_class | text | Y | - |  |
| 15 | qualideco_certified | boolean | Y | false |  |
| 16 | supplier_id | integer | Y | - |  |
| 17 | cost_per_sqm | numeric | Y | - |  |
| 18 | lead_time_days | integer | Y | - |  |
| 19 | status | text | N | 'active'::text |  |
| 20 | notes | text | Y | - |  |
| 21 | created_at | timestamp without time zone | Y | now() |  |
| 22 | updated_at | timestamp without time zone | Y | now() |  |

---

### רכש ושרשרת אספקה (Procurement & Supply Chain) (22 טבלאות)

#### 380. `foreign_suppliers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('foreign_suppliers_id_seq'::r... | 🔑 PK |
| 2 | supplier_code | text | N | - | UNIQUE |
| 3 | company_name | text | N | - |  |
| 4 | company_name_english | text | Y | - |  |
| 5 | country | text | N | - |  |
| 6 | city | text | Y | - |  |
| 7 | address | text | Y | - |  |
| 8 | postal_code | text | Y | - |  |
| 9 | contact_person | text | Y | - |  |
| 10 | contact_title | text | Y | - |  |
| 11 | phone | text | Y | - |  |
| 12 | mobile | text | Y | - |  |
| 13 | email | text | Y | - |  |
| 14 | website | text | Y | - |  |
| 15 | language | text | Y | 'English'::text |  |
| 16 | time_zone | text | Y | 'UTC'::text |  |
| 17 | preferred_currency | text | Y | 'USD'::text |  |
| 18 | payment_method | text | Y | 'Wire Transfer'::text |  |
| 19 | bank_name | text | Y | - |  |
| 20 | bank_branch | text | Y | - |  |
| 21 | bank_account | text | Y | - |  |
| 22 | swift_code | text | Y | - |  |
| 23 | iban | text | Y | - |  |
| 24 | payment_terms | text | Y | 'Net 30'::text |  |
| 25 | credit_limit | numeric | Y | 0 |  |
| 26 | tax_id | text | Y | - |  |
| 27 | vat_number | text | Y | - |  |
| 28 | duns_number | text | Y | - |  |
| 29 | trade_agreements | text | Y | - |  |
| 30 | free_trade_zone | boolean | Y | false |  |
| 31 | preferential_origin | boolean | Y | false |  |
| 32 | incoterms | text | Y | 'FOB'::text |  |
| 33 | min_order_value | numeric | Y | 0 |  |
| 34 | lead_time_days | integer | Y | 30 |  |
| 35 | iso_9001 | boolean | Y | false |  |
| 36 | iso_14001 | boolean | Y | false |  |
| 37 | iso_45001 | boolean | Y | false |  |
| 38 | ce_marking | boolean | Y | false |  |
| 39 | ul_listed | boolean | Y | false |  |
| 40 | rohs_compliant | boolean | Y | false |  |
| 41 | reach_compliant | boolean | Y | false |  |
| 42 | other_certifications | text | Y | - |  |
| 43 | product_categories | text | Y | - |  |
| 44 | main_products | text | Y | - |  |
| 45 | annual_import_volume | numeric | Y | 0 |  |
| 46 | total_orders | integer | Y | 0 |  |
| 47 | total_import_value | numeric | Y | 0 |  |
| 48 | last_order_date | date | Y | - |  |
| 49 | avg_delivery_score | numeric | Y | 0 |  |
| 50 | avg_quality_score | numeric | Y | 0 |  |
| 51 | blacklisted_countries | text | Y | - |  |
| 52 | sanctions_check | boolean | Y | false |  |
| 53 | sanctions_check_date | date | Y | - |  |
| 54 | insurance_required | boolean | Y | false |  |
| 55 | lc_required | boolean | Y | false |  |
| 56 | rating | text | Y | 'B'::text |  |
| 57 | notes | text | Y | - |  |
| 58 | status | text | N | 'פעיל'::text |  |
| 59 | created_at | timestamp without time zone | N | now() |  |
| 60 | updated_at | timestamp without time zone | N | now() |  |
| 61 | supplier_number | character varying | Y | - |  |
| 62 | company_name_en | character varying | Y | - |  |
| 63 | company_name_local | character varying | Y | - |  |
| 64 | country_code | character varying | Y | - |  |
| 65 | timezone | character varying | Y | - |  |
| 66 | communication_preference | character varying | Y | - |  |
| 67 | trade_agreement | character varying | Y | - |  |
| 68 | anti_dumping_duty | boolean | Y | false |  |
| 69 | anti_dumping_rate | numeric | Y | - |  |
| 70 | documents_url | text | Y | - |  |
| 71 | tags | text | Y | - |  |

#### 381. `procurement_approvals`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('procurement_approvals_id_seq... | 🔑 PK |
| 2 | document_type | character varying | N | - |  |
| 3 | document_id | integer | Y | - |  |
| 4 | approval_step | integer | Y | 1 |  |
| 5 | approver_id | integer | Y | - |  |
| 6 | status | character varying | Y | 'pending'::character varying |  |
| 7 | comments | text | Y | - |  |
| 8 | approved_at | timestamp without time zone | Y | - |  |
| 9 | amount_threshold | integer | Y | 0 |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |

#### 382. `purchase_order_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_order_items_id_seq'... | 🔑 PK |
| 2 | order_id | integer | N | - | FK → purchase_orders.id |
| 3 | material_id | integer | Y | - |  |
| 4 | item_description | text | N | - |  |
| 5 | quantity | numeric | N | 1 |  |
| 6 | unit | text | Y | 'יחידה'::text |  |
| 7 | unit_price | numeric | N | 0 |  |
| 8 | total_price | numeric | N | 0 |  |
| 9 | received_quantity | numeric | Y | 0 |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | item_code | text | Y | - |  |
| 13 | discount_percent | numeric | Y | 0 |  |
| 14 | tax_percent | numeric | Y | 18 |  |
| 15 | delivery_date | date | Y | - |  |
| 16 | product_sku | character varying | Y | - |  |
| 17 | product_id | integer | Y | - |  |
| 18 | width_mm | numeric | Y | - |  |
| 19 | height_mm | numeric | Y | - |  |
| 20 | length_mm | numeric | Y | - |  |
| 21 | area_sqm | numeric | Y | - |  |
| 22 | weight_kg | numeric | Y | - |  |
| 23 | batch_number | character varying | Y | - |  |
| 24 | heat_number | character varying | Y | - |  |
| 25 | certificate_required | boolean | Y | false |  |
| 26 | status | character varying | Y | 'pending'::character varying |  |
| 27 | accepted_quantity | numeric | Y | 0 |  |
| 28 | rejected_quantity | numeric | Y | 0 |  |
| 29 | warehouse | character varying | Y | - |  |
| 30 | shelf_location | character varying | Y | - |  |
| 31 | inspection_status | character varying | Y | - |  |
| 32 | work_order_id | integer | Y | - |  |
| 33 | bom_id | integer | Y | - |  |
| 34 | tax_rate | numeric | Y | 18 |  |
| 35 | tax_amount | numeric | Y | 0 |  |
| 36 | cost_center | character varying | Y | - |  |
| 37 | budget_line_id | integer | Y | - |  |
| 38 | line_number | integer | Y | - |  |
| 39 | item_type | character varying | Y | 'material'::character varying |  |
| 40 | material_name | character varying | Y | - |  |
| 41 | material_code | character varying | Y | - |  |
| 42 | product_name | character varying | Y | - |  |
| 43 | uom | character varying | Y | 'יחידה'::character varying |  |
| 44 | discount_pct | numeric | Y | 0 |  |
| 45 | discount_amount | numeric | Y | 0 |  |
| 46 | line_total | numeric | Y | 0 |  |
| 47 | received_qty | numeric | Y | 0 |  |
| 48 | remaining_qty | numeric | Y | - |  |
| 49 | actual_delivery_date | date | Y | - |  |
| 50 | bin_location | character varying | Y | - |  |
| 51 | quality_check_required | boolean | Y | true |  |
| 52 | quality_check_passed | boolean | Y | - |  |
| 53 | specifications | text | Y | - |  |
| 54 | drawing_url | text | Y | - |  |
| 55 | tags | text | Y | - |  |

#### 383. `purchase_orders`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_orders_id_seq'::reg... | 🔑 PK |
| 2 | order_number | text | N | - | UNIQUE |
| 3 | supplier_id | integer | N | - | FK → suppliers.id |
| 4 | request_id | integer | Y | - |  |
| 5 | status | text | N | 'טיוטה'::text |  |
| 6 | order_date | date | Y | CURRENT_DATE |  |
| 7 | expected_delivery | date | Y | - |  |
| 8 | total_amount | numeric | Y | 0 |  |
| 9 | currency | text | Y | 'ILS'::text |  |
| 10 | payment_terms | text | Y | - |  |
| 11 | shipping_address | text | Y | - |  |
| 12 | notes | text | Y | - |  |
| 13 | approved_by | text | Y | - |  |
| 14 | approved_at | timestamp without time zone | Y | - |  |
| 15 | created_at | timestamp without time zone | N | now() |  |
| 16 | updated_at | timestamp without time zone | N | now() |  |
| 17 | shipping_method | text | Y | - |  |
| 18 | total_before_tax | numeric | Y | - |  |
| 19 | tax_amount | numeric | Y | - |  |
| 20 | created_by | text | Y | - |  |
| 21 | priority | character varying | Y | 'normal'::character varying |  |
| 22 | discount_amount | numeric | Y | 0 |  |
| 23 | received_date | date | Y | - |  |
| 24 | delivery_terms | character varying | Y | - |  |
| 25 | warehouse | character varying | Y | - |  |
| 26 | project_id | integer | Y | - |  |
| 27 | cost_center | character varying | Y | - |  |
| 28 | department | character varying | Y | - |  |
| 29 | internal_notes | text | Y | - |  |
| 30 | reference_number | character varying | Y | - |  |
| 31 | cancelled_reason | text | Y | - |  |
| 32 | payment_status | character varying | Y | 'unpaid'::character varying |  |
| 33 | paid_amount | numeric | Y | 0 |  |
| 34 | incoterms | character varying | Y | - |  |
| 35 | freight_cost | numeric | Y | 0 |  |
| 36 | insurance_cost | numeric | Y | 0 |  |
| 37 | customs_cost | numeric | Y | 0 |  |
| 38 | landed_cost | numeric | Y | 0 |  |
| 39 | quality_check_required | boolean | Y | false |  |
| 40 | blanket_agreement_id | integer | Y | - |  |
| 41 | revision_number | integer | Y | 0 |  |
| 42 | urgency | character varying | Y | - |  |
| 43 | tracking_number | character varying | Y | - |  |
| 44 | insurance_amount | numeric | Y | - |  |
| 45 | customs_value | numeric | Y | - |  |
| 46 | quality_inspection_required | boolean | Y | false |  |
| 47 | blanket_order | boolean | Y | false |  |
| 48 | blanket_amount | numeric | Y | - |  |
| 49 | amendment_count | integer | Y | 0 |  |
| 50 | cancellation_reason | text | Y | - |  |
| 51 | receipt_confirmed | boolean | Y | false |  |
| 52 | order_type | character varying | Y | 'standard'::character varying |  |
| 53 | requisition_number | character varying | Y | - |  |
| 54 | requisition_date | date | Y | - |  |
| 55 | requested_by | character varying | Y | - |  |
| 56 | buyer | character varying | Y | - |  |
| 57 | supplier_contact | character varying | Y | - |  |
| 58 | supplier_phone | character varying | Y | - |  |
| 59 | supplier_email | character varying | Y | - |  |
| 60 | ship_to_address | text | Y | - |  |
| 61 | ship_to_city | character varying | Y | - |  |
| 62 | estimated_arrival | date | Y | - |  |
| 63 | actual_arrival | date | Y | - |  |
| 64 | goods_received | boolean | Y | false |  |
| 65 | goods_received_date | date | Y | - |  |
| 66 | goods_received_by | character varying | Y | - |  |
| 67 | invoice_received | boolean | Y | false |  |
| 68 | invoice_number | character varying | Y | - |  |
| 69 | invoice_date | date | Y | - |  |
| 70 | invoice_amount | numeric | Y | - |  |
| 71 | three_way_match | boolean | Y | false |  |
| 72 | variance_amount | numeric | Y | 0 |  |
| 73 | variance_reason | text | Y | - |  |
| 74 | return_reason | text | Y | - |  |
| 75 | return_date | date | Y | - |  |
| 76 | return_amount | numeric | Y | 0 |  |
| 77 | quality_issues | text | Y | - |  |
| 78 | penalty_amount | numeric | Y | 0 |  |
| 79 | penalty_reason | text | Y | - |  |
| 80 | total_weight_kg | numeric | Y | - |  |
| 81 | total_volume_cbm | numeric | Y | - |  |
| 82 | container_type | character varying | Y | - |  |
| 83 | container_number | character varying | Y | - |  |
| 84 | bill_of_lading | character varying | Y | - |  |
| 85 | customs_declaration | character varying | Y | - |  |
| 86 | exchange_rate | numeric | Y | 1 |  |
| 87 | original_currency | character varying | Y | 'ILS'::character varying |  |
| 88 | amount_in_original_currency | numeric | Y | - |  |
| 89 | supplier_reference | character varying | Y | - |  |
| 90 | landing_cost | numeric | Y | 0 |  |
| 91 | total_landed_cost | numeric | Y | 0 |  |
| 92 | inspection_required | boolean | Y | false |  |
| 93 | inspection_status | character varying | Y | - |  |
| 94 | quality_approved | boolean | Y | - |  |
| 95 | documents_received | text | Y | - |  |
| 96 | tags | text | Y | - |  |
| 97 | po_number | character varying | Y | - |  |
| 98 | revision | integer | Y | 0 |  |
| 99 | supplier_name | character varying | Y | - |  |
| 100 | buyer_id | integer | Y | - |  |
| 101 | buyer_name | character varying | Y | - |  |
| 102 | purchase_request_id | integer | Y | - |  |
| 103 | actual_delivery | date | Y | - |  |
| 104 | delivery_address | text | Y | - |  |
| 105 | payment_method | character varying | Y | - |  |
| 106 | advance_payment_pct | numeric | Y | - |  |
| 107 | advance_payment_amount | numeric | Y | - |  |
| 108 | advance_payment_date | date | Y | - |  |
| 109 | goods_receipt_count | integer | Y | 0 |  |
| 110 | fully_received | boolean | Y | false |  |
| 111 | fully_invoiced | boolean | Y | false |  |
| 112 | approval_required | boolean | Y | false |  |
| 113 | approval_limit | numeric | Y | - |  |
| 114 | documents_url | text | Y | - |  |

#### 384. `purchase_request_approvals`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_request_approvals_i... | 🔑 PK |
| 2 | request_id | integer | N | - |  |
| 3 | approver_name | text | N | - |  |
| 4 | approval_status | text | N | 'ממתין'::text |  |
| 5 | approval_level | integer | Y | 1 |  |
| 6 | comments | text | Y | - |  |
| 7 | approved_at | timestamp without time zone | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | request_number | character varying | Y | - |  |
| 10 | approver_id | integer | Y | - |  |
| 11 | department | character varying | Y | - |  |
| 12 | amount | numeric | Y | - |  |
| 13 | decision | character varying | Y | - |  |
| 14 | decision_date | timestamp with time zone | Y | - |  |
| 15 | decision_notes | text | Y | - |  |
| 16 | delegated_from | character varying | Y | - |  |
| 17 | deadline | date | Y | - |  |
| 18 | status | character varying | Y | 'pending'::character varying |  |
| 19 | tags | text | Y | - |  |

#### 385. `purchase_request_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_request_items_id_se... | 🔑 PK |
| 2 | request_id | integer | N | - |  |
| 3 | material_id | integer | Y | - |  |
| 4 | item_description | text | N | - |  |
| 5 | quantity | numeric | N | 1 |  |
| 6 | unit | text | Y | 'יחידה'::text |  |
| 7 | estimated_price | numeric | Y | - |  |
| 8 | currency | text | Y | 'ILS'::text |  |
| 9 | preferred_supplier_id | integer | Y | - |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | product_id | integer | Y | - |  |
| 13 | product_sku | character varying | Y | - |  |
| 14 | material_name | character varying | Y | - |  |
| 15 | category | character varying | Y | - |  |
| 16 | width_mm | numeric | Y | - |  |
| 17 | height_mm | numeric | Y | - |  |
| 18 | length_mm | numeric | Y | - |  |
| 19 | weight_kg | numeric | Y | - |  |
| 20 | area_sqm | numeric | Y | - |  |
| 21 | urgency_level | character varying | Y | 'normal'::character varying |  |
| 22 | lead_time_days | integer | Y | - |  |
| 23 | delivery_date | date | Y | - |  |
| 24 | work_order_id | integer | Y | - |  |
| 25 | bom_id | integer | Y | - |  |
| 26 | min_stock_level | numeric | Y | - |  |
| 27 | current_stock | numeric | Y | - |  |
| 28 | budget_line_id | integer | Y | - |  |
| 29 | line_number | integer | Y | - |  |
| 30 | material_code | character varying | Y | - |  |
| 31 | product_name | character varying | Y | - |  |
| 32 | uom | character varying | Y | 'יחידה'::character varying |  |
| 33 | estimated_unit_price | numeric | Y | - |  |
| 34 | estimated_total | numeric | Y | - |  |
| 35 | required_date | date | Y | - |  |
| 36 | suggested_supplier | character varying | Y | - |  |
| 37 | purpose | text | Y | - |  |
| 38 | specifications | text | Y | - |  |
| 39 | drawing_url | text | Y | - |  |
| 40 | approved | boolean | Y | - |  |
| 41 | approved_qty | numeric | Y | - |  |
| 42 | tags | text | Y | - |  |

#### 386. `purchase_requests`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_requests_id_seq'::r... | 🔑 PK |
| 2 | request_number | text | N | - | UNIQUE |
| 3 | title | text | N | - |  |
| 4 | requester_name | text | Y | - |  |
| 5 | department | text | Y | - |  |
| 6 | priority | text | N | 'רגיל'::text |  |
| 7 | status | text | N | 'טיוטה'::text |  |
| 8 | total_estimated | numeric | Y | 0 |  |
| 9 | currency | text | Y | 'ILS'::text |  |
| 10 | needed_by | date | Y | - |  |
| 11 | notes | text | Y | - |  |
| 12 | approved_by | text | Y | - |  |
| 13 | approved_at | timestamp without time zone | Y | - |  |
| 14 | created_at | timestamp without time zone | N | now() |  |
| 15 | updated_at | timestamp without time zone | N | now() |  |
| 16 | requester_id | integer | Y | - |  |
| 17 | requester_phone | character varying | Y | - |  |
| 18 | requester_email | character varying | Y | - |  |
| 19 | request_type | character varying | Y | 'standard'::character varying |  |
| 20 | category | character varying | Y | - |  |
| 21 | cost_center | character varying | Y | - |  |
| 22 | project_id | integer | Y | - |  |
| 23 | project_name | character varying | Y | - |  |
| 24 | budget_code | character varying | Y | - |  |
| 25 | budget_available | numeric | Y | - |  |
| 26 | over_budget | boolean | Y | false |  |
| 27 | suggested_supplier | character varying | Y | - |  |
| 28 | suggested_supplier_id | integer | Y | - |  |
| 29 | alternate_supplier | character varying | Y | - |  |
| 30 | justification | text | Y | - |  |
| 31 | urgency_reason | text | Y | - |  |
| 32 | specifications | text | Y | - |  |
| 33 | attachment_urls | text | Y | - |  |
| 34 | approval_level | integer | Y | 1 |  |
| 35 | max_approval_level | integer | Y | 1 |  |
| 36 | rejection_reason | text | Y | - |  |
| 37 | converted_to_po | boolean | Y | false |  |
| 38 | purchase_order_id | integer | Y | - |  |
| 39 | purchase_order_number | character varying | Y | - |  |
| 40 | delivery_address | text | Y | - |  |
| 41 | delivery_contact | character varying | Y | - |  |
| 42 | warehouse_id | integer | Y | - |  |
| 43 | recurring | boolean | Y | false |  |
| 44 | recurring_period | character varying | Y | - |  |
| 45 | internal_notes | text | Y | - |  |
| 46 | line_items_json | text | Y | - |  |
| 47 | cost_center_id | integer | Y | - |  |
| 48 | urgency | character varying | Y | 'normal'::character varying |  |
| 49 | estimated_cost | numeric | Y | 0 |  |
| 50 | approved_budget | numeric | Y | - |  |
| 51 | supplier_suggestion | character varying | Y | - |  |
| 52 | three_quotes_required | boolean | Y | false |  |
| 53 | quote_1_supplier | character varying | Y | - |  |
| 54 | quote_1_amount | numeric | Y | - |  |
| 55 | quote_2_supplier | character varying | Y | - |  |
| 56 | quote_2_amount | numeric | Y | - |  |
| 57 | quote_3_supplier | character varying | Y | - |  |
| 58 | quote_3_amount | numeric | Y | - |  |
| 59 | selected_supplier | character varying | Y | - |  |
| 60 | documents_url | text | Y | - |  |
| 61 | tags | text | Y | - |  |
| 62 | requested_by | character varying | Y | - |  |
| 63 | requested_by_id | integer | Y | - |  |
| 64 | production_wo_id | integer | Y | - |  |
| 65 | purpose | text | Y | - |  |
| 66 | estimated_total | numeric | Y | - |  |
| 67 | approval_level_1 | character varying | Y | - |  |
| 68 | approval_level_1_date | timestamp with time zone | Y | - |  |
| 69 | approval_level_2 | character varying | Y | - |  |
| 70 | approval_level_2_date | timestamp with time zone | Y | - |  |
| 71 | po_id | integer | Y | - |  |
| 72 | po_number | character varying | Y | - |  |

#### 387. `purchase_requisitions`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | requisition_number | character varying | Y | - | UNIQUE |
| 3 | requested_by | uuid | Y | - |  |
| 4 | department | character varying | Y | - |  |
| 5 | urgency | character varying | Y | 'medium'::character varying |  |
| 6 | status | character varying | Y | 'draft'::character varying |  |
| 7 | items | jsonb | Y | '[]'::jsonb |  |
| 8 | justification | text | Y | - |  |
| 9 | budget_code | character varying | Y | - |  |
| 10 | approved_by | uuid | Y | - |  |
| 11 | approved_at | timestamp without time zone | Y | - |  |
| 12 | converted_po_id | uuid | Y | - |  |
| 13 | notes | text | Y | - |  |
| 14 | is_active | boolean | Y | true |  |
| 15 | created_by | uuid | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |

#### 388. `purchase_return_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_return_items_id_seq... | 🔑 PK |
| 2 | return_id | integer | N | - | FK → purchase_returns.id |
| 3 | material_id | integer | Y | - |  |
| 4 | item_code | text | Y | - |  |
| 5 | item_name | text | N | - |  |
| 6 | unit | text | Y | 'יח'::text |  |
| 7 | ordered_quantity | numeric | Y | 0 |  |
| 8 | received_quantity | numeric | Y | 0 |  |
| 9 | returned_quantity | numeric | N | 0 |  |
| 10 | unit_price | numeric | Y | 0 |  |
| 11 | total_price | numeric | Y | 0 |  |
| 12 | reason | text | Y | - |  |
| 13 | condition_on_return | text | Y | 'פגום'::text |  |
| 14 | lot_number | text | Y | - |  |
| 15 | serial_number | text | Y | - |  |
| 16 | inspection_notes | text | Y | - |  |
| 17 | photo_urls | text | Y | - |  |
| 18 | status | text | Y | 'ממתין'::text |  |
| 19 | created_at | timestamp without time zone | N | now() |  |
| 20 | line_number | integer | Y | - |  |
| 21 | material_name | character varying | Y | - |  |
| 22 | product_id | integer | Y | - |  |
| 23 | product_name | character varying | Y | - |  |
| 24 | quantity_returned | numeric | Y | - |  |
| 25 | uom | character varying | Y | - |  |
| 26 | line_total | numeric | Y | - |  |
| 27 | return_reason | text | Y | - |  |
| 28 | quality_issue | boolean | Y | false |  |
| 29 | defect_description | text | Y | - |  |
| 30 | photos_url | text | Y | - |  |
| 31 | restocked | boolean | Y | false |  |
| 32 | restock_date | date | Y | - |  |
| 33 | disposal_method | character varying | Y | - |  |
| 34 | notes | text | Y | - |  |
| 35 | tags | text | Y | - |  |

#### 389. `purchase_returns`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('purchase_returns_id_seq'::re... | 🔑 PK |
| 2 | return_number | text | N | - | UNIQUE |
| 3 | purchase_order_id | integer | Y | - |  |
| 4 | goods_receipt_id | integer | Y | - |  |
| 5 | supplier_id | integer | N | - |  |
| 6 | return_date | date | N | CURRENT_DATE |  |
| 7 | reason_category | text | N | 'פגם באיכות'::text |  |
| 8 | reason_details | text | Y | - |  |
| 9 | returned_by | text | Y | - |  |
| 10 | approved_by | text | Y | - |  |
| 11 | credit_note_number | text | Y | - |  |
| 12 | credit_note_amount | numeric | Y | 0 |  |
| 13 | credit_note_date | date | Y | - |  |
| 14 | credit_note_received | boolean | Y | false |  |
| 15 | replacement_order_id | integer | Y | - |  |
| 16 | replacement_requested | boolean | Y | false |  |
| 17 | shipping_method | text | Y | - |  |
| 18 | tracking_number | text | Y | - |  |
| 19 | warehouse_location | text | Y | - |  |
| 20 | total_items | integer | Y | 0 |  |
| 21 | total_value | numeric | Y | 0 |  |
| 22 | currency | text | Y | 'ILS'::text |  |
| 23 | status | text | N | 'טיוטה'::text |  |
| 24 | notes | text | Y | - |  |
| 25 | created_at | timestamp without time zone | N | now() |  |
| 26 | updated_at | timestamp without time zone | N | now() |  |
| 27 | purchase_order_number | character varying | Y | - |  |
| 28 | supplier_name | character varying | Y | - |  |
| 29 | return_reason | text | Y | - |  |
| 30 | return_type | character varying | Y | - |  |
| 31 | quality_issue | boolean | Y | false |  |
| 32 | quality_report_id | integer | Y | - |  |
| 33 | credit_note_expected | boolean | Y | true |  |
| 34 | replacement_expected | boolean | Y | false |  |
| 35 | replacement_received | boolean | Y | false |  |
| 36 | replacement_po_id | integer | Y | - |  |
| 37 | shipping_cost | numeric | Y | - |  |
| 38 | shipping_paid_by | character varying | Y | - |  |
| 39 | documents_url | text | Y | - |  |
| 40 | photos_url | text | Y | - |  |
| 41 | tags | text | Y | - |  |
| 42 | po_id | integer | Y | - |  |
| 43 | po_number | character varying | Y | - |  |
| 44 | receipt_id | integer | Y | - |  |
| 45 | total_amount | numeric | Y | - |  |
| 46 | reason | character varying | Y | - |  |
| 47 | shipped_date | date | Y | - |  |
| 48 | received_by_supplier | boolean | Y | false |  |
| 49 | credit_received | boolean | Y | false |  |

#### 390. `supplier_communications`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_communications_id_s... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | type | text | N | 'general'::text |  |
| 4 | subject | text | N | - |  |
| 5 | content | text | Y | - |  |
| 6 | direction | text | N | 'outgoing'::text |  |
| 7 | status | text | N | 'draft'::text |  |
| 8 | priority | text | Y | 'normal'::text |  |
| 9 | sent_by | text | Y | - |  |
| 10 | sent_at | timestamp without time zone | Y | - |  |
| 11 | read_at | timestamp without time zone | Y | - |  |
| 12 | recipient_email | text | Y | - |  |
| 13 | recipient_name | text | Y | - |  |
| 14 | attachments | jsonb | Y | '[]'::jsonb |  |
| 15 | related_doc_type | text | Y | - |  |
| 16 | related_doc_id | integer | Y | - |  |
| 17 | tags | text | Y | - |  |
| 18 | notes | text | Y | - |  |
| 19 | created_at | timestamp without time zone | N | now() |  |
| 20 | updated_at | timestamp without time zone | N | now() |  |
| 21 | communication_number | character varying | Y | - |  |
| 22 | supplier_name | character varying | Y | - |  |
| 23 | contact_id | integer | Y | - |  |
| 24 | contact_name | character varying | Y | - |  |
| 25 | communication_type | character varying | Y | - |  |
| 26 | body | text | Y | - |  |
| 27 | regarding | character varying | Y | - |  |
| 28 | regarding_id | integer | Y | - |  |
| 29 | regarding_number | character varying | Y | - |  |
| 30 | follow_up_required | boolean | Y | false |  |
| 31 | follow_up_date | date | Y | - |  |
| 32 | follow_up_done | boolean | Y | false |  |
| 33 | attachments_url | text | Y | - |  |

#### 391. `supplier_contacts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_contacts_id_seq'::r... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | contact_name | text | N | - |  |
| 4 | role | text | Y | - |  |
| 5 | phone | text | Y | - |  |
| 6 | mobile | text | Y | - |  |
| 7 | email | text | Y | - |  |
| 8 | notes | text | Y | - |  |
| 9 | created_at | timestamp without time zone | N | now() |  |
| 10 | updated_at | timestamp without time zone | N | now() |  |
| 11 | title | character varying | Y | - |  |
| 12 | department | character varying | Y | - |  |
| 13 | fax | character varying | Y | - |  |
| 14 | is_primary | boolean | Y | false |  |
| 15 | is_billing | boolean | Y | false |  |
| 16 | is_technical | boolean | Y | false |  |
| 17 | is_quality | boolean | Y | false |  |
| 18 | preferred_language | character varying | Y | - |  |
| 19 | available_hours | text | Y | - |  |
| 20 | contact_number | character varying | Y | - |  |
| 21 | first_name | character varying | Y | - |  |
| 22 | last_name | character varying | Y | - |  |
| 23 | position | character varying | Y | - |  |
| 24 | direct_line | character varying | Y | - |  |
| 25 | office_extension | character varying | Y | - |  |
| 26 | linkedin | character varying | Y | - |  |
| 27 | whatsapp | character varying | Y | - |  |
| 28 | birthday | date | Y | - |  |
| 29 | photo_url | text | Y | - |  |
| 30 | is_shipping | boolean | Y | false |  |
| 31 | is_decision_maker | boolean | Y | false |  |
| 32 | do_not_call | boolean | Y | false |  |
| 33 | do_not_email | boolean | Y | false |  |
| 34 | last_contact_date | date | Y | - |  |
| 35 | next_follow_up | date | Y | - |  |
| 36 | relationship_strength | character varying | Y | 'neutral'::character varying |  |
| 37 | tags | text | Y | - |  |
| 38 | is_active | boolean | Y | true |  |
| 39 | supplier_name | character varying | Y | - |  |
| 40 | is_billing_contact | boolean | Y | false |  |
| 41 | is_technical_contact | boolean | Y | false |  |
| 42 | is_quality_contact | boolean | Y | false |  |
| 43 | is_logistics_contact | boolean | Y | false |  |
| 44 | language | character varying | Y | 'he'::character varying |  |
| 45 | timezone | character varying | Y | - |  |
| 46 | preferred_contact_method | character varying | Y | - |  |
| 47 | documents_url | text | Y | - |  |

#### 392. `supplier_contracts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_contracts_id_seq'::... | 🔑 PK |
| 2 | contract_number | text | N | - | UNIQUE |
| 3 | supplier_id | integer | N | - |  |
| 4 | contract_type | text | N | 'מסגרת'::text |  |
| 5 | title | text | N | - |  |
| 6 | description | text | Y | - |  |
| 7 | start_date | date | N | - |  |
| 8 | end_date | date | Y | - |  |
| 9 | auto_renewal | boolean | Y | false |  |
| 10 | renewal_period_months | integer | Y | 12 |  |
| 11 | renewal_notice_days | integer | Y | 30 |  |
| 12 | contract_value | numeric | Y | 0 |  |
| 13 | currency | text | Y | 'ILS'::text |  |
| 14 | payment_terms | text | Y | - |  |
| 15 | payment_frequency | text | Y | 'חודשי'::text |  |
| 16 | sla_response_time | text | Y | - |  |
| 17 | sla_resolution_time | text | Y | - |  |
| 18 | sla_uptime_pct | numeric | Y | - |  |
| 19 | sla_details | text | Y | - |  |
| 20 | penalty_late_delivery | numeric | Y | 0 |  |
| 21 | penalty_quality_issue | numeric | Y | 0 |  |
| 22 | penalty_sla_breach | numeric | Y | 0 |  |
| 23 | penalty_details | text | Y | - |  |
| 24 | warranty_period_months | integer | Y | 0 |  |
| 25 | warranty_details | text | Y | - |  |
| 26 | termination_notice_days | integer | Y | 30 |  |
| 27 | termination_conditions | text | Y | - |  |
| 28 | contact_person | text | Y | - |  |
| 29 | contact_email | text | Y | - |  |
| 30 | contact_phone | text | Y | - |  |
| 31 | responsible_person | text | Y | - |  |
| 32 | department | text | Y | - |  |
| 33 | categories | text | Y | - |  |
| 34 | notes | text | Y | - |  |
| 35 | attachment_urls | text | Y | - |  |
| 36 | status | text | N | 'טיוטה'::text |  |
| 37 | created_at | timestamp without time zone | N | now() |  |
| 38 | updated_at | timestamp without time zone | N | now() |  |
| 39 | supplier_name | character varying | Y | - |  |
| 40 | min_order_value | numeric | Y | - |  |
| 41 | max_order_value | numeric | Y | - |  |
| 42 | volume_discount_pct | numeric | Y | - |  |
| 43 | quality_standard | character varying | Y | - |  |
| 44 | insurance_required | boolean | Y | false |  |
| 45 | insurance_certificate | character varying | Y | - |  |
| 46 | insurance_expiry | date | Y | - |  |
| 47 | approved_by | character varying | Y | - |  |
| 48 | approved_at | timestamp with time zone | Y | - |  |
| 49 | total_spent | numeric | Y | 0 |  |
| 50 | order_count | integer | Y | 0 |  |
| 51 | performance_rating | numeric | Y | - |  |
| 52 | last_order_date | date | Y | - |  |
| 53 | next_review_date | date | Y | - |  |
| 54 | tags | text | Y | - |  |
| 55 | auto_renew | boolean | Y | false |  |
| 56 | termination_clause | text | Y | - |  |
| 57 | penalty_clause | text | Y | - |  |
| 58 | sla_terms | text | Y | - |  |
| 59 | performance_metrics | text | Y | - |  |
| 60 | price_escalation_pct | numeric | Y | - |  |
| 61 | price_review_date | date | Y | - |  |
| 62 | bond_required | boolean | Y | false |  |
| 63 | bond_amount | numeric | Y | - |  |
| 64 | documents_url | text | Y | - |  |
| 65 | min_order_qty | numeric | Y | - |  |
| 66 | max_order_qty | numeric | Y | - |  |
| 67 | annual_volume_commitment | numeric | Y | - |  |
| 68 | volume_achieved_ytd | numeric | Y | 0 |  |
| 69 | price_list_url | text | Y | - |  |
| 70 | price_escalation_formula | text | Y | - |  |
| 71 | quality_requirements | text | Y | - |  |
| 72 | delivery_sla_days | integer | Y | - |  |
| 73 | rejection_rate_max_pct | numeric | Y | - |  |
| 74 | warranty_terms | text | Y | - |  |
| 75 | contract_signed | boolean | Y | false |  |
| 76 | signed_date | date | Y | - |  |
| 77 | signed_by | character varying | Y | - |  |

#### 393. `supplier_credit_notes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_credit_notes_id_seq... | 🔑 PK |
| 2 | credit_number | character varying | Y | - | UNIQUE |
| 3 | credit_date | date | Y | CURRENT_DATE |  |
| 4 | supplier_name | character varying | Y | - |  |
| 5 | supplier_tax_id | character varying | Y | - |  |
| 6 | invoice_number | character varying | Y | - |  |
| 7 | reason | text | Y | - |  |
| 8 | amount | numeric | Y | 0 |  |
| 9 | vat_rate | numeric | Y | 18 |  |
| 10 | vat_amount | numeric | Y | 0 |  |
| 11 | total_amount | numeric | Y | 0 |  |
| 12 | status | character varying | Y | 'draft'::character varying |  |
| 13 | notes | text | Y | - |  |
| 14 | created_by | integer | Y | - |  |
| 15 | created_by_name | character varying | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |
| 18 | credit_note_number | character varying | Y | - |  |
| 19 | supplier_credit_number | character varying | Y | - |  |
| 20 | supplier_id | integer | Y | - |  |
| 21 | invoice_id | integer | Y | - |  |
| 22 | credit_amount | numeric | Y | - |  |
| 23 | currency | character varying | Y | 'ILS'::character varying |  |
| 24 | reason_detail | text | Y | - |  |
| 25 | applied | boolean | Y | false |  |
| 26 | applied_to_invoice_id | integer | Y | - |  |
| 27 | applied_date | date | Y | - |  |
| 28 | refund_requested | boolean | Y | false |  |
| 29 | refund_received | boolean | Y | false |  |
| 30 | refund_date | date | Y | - |  |
| 31 | refund_amount | numeric | Y | - |  |
| 32 | journal_entry_id | integer | Y | - |  |
| 33 | posted | boolean | Y | false |  |
| 34 | documents_url | text | Y | - |  |
| 35 | tags | text | Y | - |  |

#### 394. `supplier_documents`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_documents_id_seq'::... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | document_name | text | N | - |  |
| 4 | document_type | text | N | 'כללי'::text |  |
| 5 | file_url | text | Y | - |  |
| 6 | notes | text | Y | - |  |
| 7 | expiry_date | timestamp without time zone | Y | - |  |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |
| 10 | document_number | character varying | Y | - |  |
| 11 | issue_date | date | Y | - |  |
| 12 | verified | boolean | Y | false |  |
| 13 | verified_by | character varying | Y | - |  |
| 14 | is_active | boolean | Y | true |  |
| 15 | tags | text | Y | - |  |

#### 395. `supplier_evaluations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_evaluations_id_seq'... | 🔑 PK |
| 2 | supplier_id | integer | N | - | FK → suppliers.id |
| 3 | evaluation_date | date | N | CURRENT_DATE |  |
| 4 | evaluator | text | Y | - |  |
| 5 | period_start | date | Y | - |  |
| 6 | period_end | date | Y | - |  |
| 7 | delivery_score | numeric | N | 0 |  |
| 8 | quality_score | numeric | N | 0 |  |
| 9 | pricing_score | numeric | N | 0 |  |
| 10 | service_score | numeric | N | 0 |  |
| 11 | reliability_score | numeric | N | 0 |  |
| 12 | overall_score | numeric | N | 0 |  |
| 13 | delivery_notes | text | Y | - |  |
| 14 | quality_notes | text | Y | - |  |
| 15 | pricing_notes | text | Y | - |  |
| 16 | service_notes | text | Y | - |  |
| 17 | reliability_notes | text | Y | - |  |
| 18 | general_notes | text | Y | - |  |
| 19 | total_orders | integer | Y | 0 |  |
| 20 | on_time_deliveries | integer | Y | 0 |  |
| 21 | quality_rejections | integer | Y | 0 |  |
| 22 | price_compliance_pct | numeric | Y | 0 |  |
| 23 | response_time_avg | numeric | Y | 0 |  |
| 24 | recommendation | text | Y | 'ממשיך'::text |  |
| 25 | status | text | N | 'פעיל'::text |  |
| 26 | created_at | timestamp without time zone | N | now() |  |
| 27 | updated_at | timestamp without time zone | N | now() |  |
| 28 | price_score | numeric | Y | - |  |
| 29 | communication_score | numeric | Y | - |  |
| 30 | compliance_score | numeric | Y | - |  |
| 31 | evaluation_type | character varying | Y | 'periodic'::character varying |  |
| 32 | evaluation_period_start | date | Y | - |  |
| 33 | evaluation_period_end | date | Y | - |  |
| 34 | late_deliveries | integer | Y | 0 |  |
| 35 | total_value | numeric | Y | - |  |
| 36 | issues_reported | integer | Y | 0 |  |
| 37 | issues_resolved | integer | Y | 0 |  |
| 38 | avg_lead_time_days | numeric | Y | - |  |
| 39 | certification_valid | boolean | Y | false |  |
| 40 | approved_by | character varying | Y | - |  |
| 41 | approved_at | timestamp with time zone | Y | - |  |
| 42 | action_items | text | Y | - |  |
| 43 | follow_up_date | date | Y | - |  |
| 44 | evaluation_number | character varying | Y | - |  |
| 45 | supplier_name | character varying | Y | - |  |
| 46 | grade | character varying | Y | - |  |
| 47 | improvement_areas | text | Y | - |  |
| 48 | next_evaluation_date | date | Y | - |  |
| 49 | documents_url | text | Y | - |  |
| 50 | tags | text | Y | - |  |
| 51 | evaluator_id | integer | Y | - |  |
| 52 | evaluator_name | character varying | Y | - |  |
| 53 | flexibility_score | numeric | Y | - |  |
| 54 | documentation_score | numeric | Y | - |  |
| 55 | on_time_delivery_pct | numeric | Y | - |  |
| 56 | quality_reject_pct | numeric | Y | - |  |
| 57 | total_amount | numeric | Y | 0 |  |
| 58 | ncr_count | integer | Y | 0 |  |
| 59 | corrective_actions_open | integer | Y | 0 |  |
| 60 | corrective_actions_closed | integer | Y | 0 |  |
| 61 | action_plan | text | Y | - |  |

#### 396. `supplier_materials`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_materials_id_seq'::... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | material_id | integer | N | - |  |
| 4 | supplier_material_code | text | Y | - |  |
| 5 | supplier_price | numeric | Y | - |  |
| 6 | currency | text | Y | 'ILS'::text |  |
| 7 | lead_time_days | integer | Y | - |  |
| 8 | minimum_order_qty | numeric | Y | - |  |
| 9 | is_preferred | boolean | Y | false |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | supplier_name | character varying | Y | - |  |
| 14 | material_name | character varying | Y | - |  |
| 15 | material_code | character varying | Y | - |  |
| 16 | supplier_part_number | character varying | Y | - |  |
| 17 | supplier_description | character varying | Y | - |  |
| 18 | unit_price | numeric | Y | - |  |
| 19 | min_order_qty | numeric | Y | - |  |
| 20 | max_order_qty | numeric | Y | - |  |
| 21 | uom | character varying | Y | - |  |
| 22 | price_per_kg | numeric | Y | - |  |
| 23 | price_per_sqm | numeric | Y | - |  |
| 24 | price_per_linear_m | numeric | Y | - |  |
| 25 | discount_pct | numeric | Y | 0 |  |
| 26 | volume_discount_pct | numeric | Y | - |  |
| 27 | volume_discount_qty | numeric | Y | - |  |
| 28 | last_order_date | date | Y | - |  |
| 29 | last_order_qty | numeric | Y | - |  |
| 30 | last_order_price | numeric | Y | - |  |
| 31 | avg_quality_score | numeric | Y | - |  |
| 32 | reject_rate_pct | numeric | Y | - |  |
| 33 | is_approved | boolean | Y | true |  |
| 34 | approval_date | date | Y | - |  |
| 35 | certificate_url | text | Y | - |  |
| 36 | contract_id | integer | Y | - |  |
| 37 | contract_price | numeric | Y | - |  |
| 38 | contract_valid_until | date | Y | - |  |
| 39 | country_of_origin | character varying | Y | - |  |
| 40 | incoterms | character varying | Y | - |  |
| 41 | is_active | boolean | Y | true |  |
| 42 | tags | text | Y | - |  |

#### 397. `supplier_notes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_notes_id_seq'::regc... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | note_text | text | N | - |  |
| 4 | author | text | Y | - |  |
| 5 | created_at | timestamp without time zone | N | now() |  |
| 6 | note_type | character varying | Y | - |  |
| 7 | subject | character varying | Y | - |  |
| 8 | content | text | Y | - |  |
| 9 | created_by | character varying | Y | - |  |
| 10 | importance | character varying | Y | 'normal'::character varying |  |
| 11 | related_entity_type | character varying | Y | - |  |
| 12 | related_entity_id | integer | Y | - |  |
| 13 | is_private | boolean | Y | false |  |
| 14 | is_active | boolean | Y | true |  |
| 15 | tags | text | Y | - |  |

#### 398. `supplier_payments`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_payments_id_seq'::r... | 🔑 PK |
| 2 | payment_number | character varying | Y | - | UNIQUE |
| 3 | payment_date | date | Y | CURRENT_DATE |  |
| 4 | supplier_name | character varying | Y | - |  |
| 5 | supplier_tax_id | character varying | Y | - |  |
| 6 | invoice_number | character varying | Y | - |  |
| 7 | amount | numeric | Y | 0 |  |
| 8 | payment_method | character varying | Y | 'bank_transfer'::character varying |  |
| 9 | reference_number | character varying | Y | - |  |
| 10 | bank_name | character varying | Y | - |  |
| 11 | check_number | character varying | Y | - |  |
| 12 | status | character varying | Y | 'completed'::character varying |  |
| 13 | notes | text | Y | - |  |
| 14 | created_by | integer | Y | - |  |
| 15 | created_by_name | character varying | Y | - |  |
| 16 | created_at | timestamp without time zone | Y | now() |  |
| 17 | updated_at | timestamp without time zone | Y | now() |  |
| 18 | supplier_id | integer | Y | - |  |
| 19 | invoice_id | integer | Y | - |  |
| 20 | payment_type | character varying | Y | 'regular'::character varying |  |
| 21 | currency | character varying | Y | 'ILS'::character varying |  |
| 22 | exchange_rate | numeric | Y | 1 |  |
| 23 | amount_in_currency | numeric | Y | - |  |
| 24 | amount_in_ils | numeric | Y | - |  |
| 25 | vat_amount | numeric | Y | 0 |  |
| 26 | withholding_tax_pct | numeric | Y | - |  |
| 27 | withholding_tax_amount | numeric | Y | 0 |  |
| 28 | net_amount | numeric | Y | - |  |
| 29 | discount_amount | numeric | Y | 0 |  |
| 30 | early_payment_discount | numeric | Y | 0 |  |
| 31 | check_bank | character varying | Y | - |  |
| 32 | check_date | date | Y | - |  |
| 33 | check_branch | character varying | Y | - |  |
| 34 | check_account | character varying | Y | - |  |
| 35 | check_printed | boolean | Y | false |  |
| 36 | check_signed | boolean | Y | false |  |
| 37 | check_mailed | boolean | Y | false |  |
| 38 | check_mailed_date | date | Y | - |  |
| 39 | wire_transfer_ref | character varying | Y | - |  |
| 40 | wire_transfer_bank | character varying | Y | - |  |
| 41 | wire_transfer_date | date | Y | - |  |
| 42 | wire_transfer_confirmation | character varying | Y | - |  |
| 43 | payment_batch_id | integer | Y | - |  |
| 44 | payment_batch_number | character varying | Y | - |  |
| 45 | payment_run_date | date | Y | - |  |
| 46 | scheduled_date | date | Y | - |  |
| 47 | allocation_status | character varying | Y | 'unallocated'::character varying |  |
| 48 | allocated_invoices | text | Y | - |  |
| 49 | overpayment | numeric | Y | 0 |  |
| 50 | reversed | boolean | Y | false |  |
| 51 | reversed_date | date | Y | - |  |
| 52 | reversed_reason | text | Y | - |  |
| 53 | reversed_by | character varying | Y | - |  |
| 54 | approved_by | character varying | Y | - |  |
| 55 | approved_at | timestamp with time zone | Y | - |  |
| 56 | approval_required | boolean | Y | true |  |
| 57 | two_signatures_required | boolean | Y | false |  |
| 58 | second_approver | character varying | Y | - |  |
| 59 | second_approved_at | timestamp with time zone | Y | - |  |
| 60 | journal_entry_id | integer | Y | - |  |
| 61 | gl_account_id | integer | Y | - |  |
| 62 | reconciled | boolean | Y | false |  |
| 63 | reconciled_date | date | Y | - |  |
| 64 | project_id | integer | Y | - |  |
| 65 | project_name | character varying | Y | - |  |
| 66 | cost_center | character varying | Y | - |  |
| 67 | purchase_order_id | integer | Y | - |  |
| 68 | purchase_order_number | character varying | Y | - |  |
| 69 | documents_url | text | Y | - |  |
| 70 | tags | text | Y | - |  |

#### 399. `supplier_performance`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_performance_id_seq'... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | quality_rating | numeric | Y | - |  |
| 4 | availability_rating | numeric | Y | - |  |
| 5 | price_rating | numeric | Y | - |  |
| 6 | service_rating | numeric | Y | - |  |
| 7 | reliability_rating | numeric | Y | - |  |
| 8 | delay_percentage | numeric | Y | - |  |
| 9 | performance_notes | text | Y | - |  |
| 10 | evaluation_date | timestamp without time zone | N | now() |  |
| 11 | evaluated_by | text | Y | - |  |
| 12 | created_at | timestamp without time zone | N | now() |  |
| 13 | updated_at | timestamp without time zone | N | now() |  |
| 14 | supplier_name | character varying | Y | - |  |
| 15 | evaluation_period | character varying | Y | - |  |
| 16 | fiscal_year | integer | Y | - |  |
| 17 | fiscal_month | integer | Y | - |  |
| 18 | delivery_on_time_pct | numeric | Y | - |  |
| 19 | quality_acceptance_pct | numeric | Y | - |  |
| 20 | price_competitiveness | numeric | Y | - |  |
| 21 | responsiveness_score | numeric | Y | - |  |
| 22 | overall_score | numeric | Y | - |  |
| 23 | order_count | integer | Y | 0 |  |
| 24 | total_ordered | numeric | Y | 0 |  |
| 25 | defect_count | integer | Y | 0 |  |
| 26 | late_delivery_count | integer | Y | 0 |  |
| 27 | return_count | integer | Y | 0 |  |
| 28 | compliance_status | character varying | Y | - |  |
| 29 | rank_position | integer | Y | - |  |
| 30 | rating | character varying | Y | - |  |
| 31 | is_active | boolean | Y | true |  |
| 32 | notes | text | Y | - |  |
| 33 | tags | text | Y | - |  |

#### 400. `supplier_price_history`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('supplier_price_history_id_se... | 🔑 PK |
| 2 | supplier_id | integer | N | - |  |
| 3 | material_id | integer | N | - |  |
| 4 | price | numeric | N | - |  |
| 5 | currency | text | Y | 'ILS'::text |  |
| 6 | valid_from | date | Y | CURRENT_DATE |  |
| 7 | valid_until | date | Y | - |  |
| 8 | price_list_name | text | Y | - |  |
| 9 | discount_percentage | numeric | Y | - |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | product_sku | character varying | Y | - |  |
| 13 | product_id | integer | Y | - |  |
| 14 | price_type | character varying | Y | 'list'::character varying |  |
| 15 | discount_percent | numeric | Y | 0 |  |
| 16 | net_price | numeric | Y | - |  |
| 17 | min_quantity | numeric | Y | - |  |
| 18 | max_quantity | numeric | Y | - |  |
| 19 | lead_time_days | integer | Y | - |  |
| 20 | payment_terms | character varying | Y | - |  |
| 21 | quote_reference | character varying | Y | - |  |
| 22 | valid_to | date | Y | - |  |
| 23 | price_change_pct | numeric | Y | - |  |
| 24 | supplier_name | character varying | Y | - |  |
| 25 | material_name | character varying | Y | - |  |
| 26 | material_code | character varying | Y | - |  |
| 27 | product_name | character varying | Y | - |  |
| 28 | price_ils | numeric | Y | - |  |
| 29 | exchange_rate | numeric | Y | - |  |
| 30 | uom | character varying | Y | - |  |
| 31 | price_per_kg | numeric | Y | - |  |
| 32 | price_per_sqm | numeric | Y | - |  |
| 33 | price_per_linear_m | numeric | Y | - |  |
| 34 | min_order_qty | numeric | Y | - |  |
| 35 | discount_pct | numeric | Y | - |  |
| 36 | previous_price | numeric | Y | - |  |
| 37 | effective_date | date | Y | - |  |
| 38 | expiry_date | date | Y | - |  |
| 39 | source | character varying | Y | - |  |
| 40 | quotation_ref | character varying | Y | - |  |
| 41 | contract_id | integer | Y | - |  |
| 42 | approved | boolean | Y | false |  |
| 43 | approved_by | character varying | Y | - |  |
| 44 | is_active | boolean | Y | true |  |
| 45 | tags | text | Y | - |  |

#### 401. `suppliers`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('suppliers_id_seq'::regclass) | 🔑 PK |
| 2 | supplier_number | text | N | - | UNIQUE |
| 3 | supplier_name | text | N | - |  |
| 4 | contact_person | text | Y | - |  |
| 5 | phone | text | Y | - |  |
| 6 | mobile | text | Y | - |  |
| 7 | email | text | Y | - |  |
| 8 | address | text | Y | - |  |
| 9 | city | text | Y | - |  |
| 10 | category | text | N | 'כללי'::text |  |
| 11 | supply_type | text | Y | - |  |
| 12 | payment_terms | text | Y | - |  |
| 13 | lead_time_days | integer | Y | - |  |
| 14 | vat_number | text | Y | - |  |
| 15 | status | text | N | 'פעיל'::text |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp without time zone | N | now() |  |
| 18 | updated_at | timestamp without time zone | N | now() |  |
| 19 | activity_field | text | Y | - |  |
| 20 | material_types | text | Y | - |  |
| 21 | geographic_area | text | Y | - |  |
| 22 | currency | text | Y | 'ILS'::text |  |
| 23 | credit_days | integer | Y | - |  |
| 24 | minimum_order | text | Y | - |  |
| 25 | urgent_lead_time_days | integer | Y | - |  |
| 26 | fax | text | Y | - |  |
| 27 | website | text | Y | - |  |
| 28 | country | text | Y | - |  |
| 29 | bank_name | text | Y | - |  |
| 30 | bank_branch | text | Y | - |  |
| 31 | bank_account_number | text | Y | - |  |
| 32 | credit_limit | numeric | Y | - |  |
| 33 | rating | integer | Y | 0 |  |
| 34 | certifications | text | Y | - |  |
| 35 | contract_start_date | date | Y | - |  |
| 36 | contract_end_date | date | Y | - |  |
| 37 | tax_id | text | Y | - |  |
| 38 | swift_code | character varying | Y | - |  |
| 39 | iban | character varying | Y | - |  |
| 40 | secondary_contact | character varying | Y | - |  |
| 41 | secondary_phone | character varying | Y | - |  |
| 42 | secondary_email | character varying | Y | - |  |
| 43 | preferred_supplier | boolean | Y | false |  |
| 44 | payment_method | character varying | Y | - |  |
| 45 | tax_withholding_rate | numeric | Y | 0 |  |
| 46 | vat_exempt | boolean | Y | false |  |
| 47 | quality_rating | numeric | Y | - |  |
| 48 | delivery_rating | numeric | Y | - |  |
| 49 | price_rating | numeric | Y | - |  |
| 50 | insurance_certificate | text | Y | - |  |
| 51 | insurance_expiry | date | Y | - |  |
| 52 | iso_certified | boolean | Y | false |  |
| 53 | iso_certificate_number | character varying | Y | - |  |
| 54 | blacklisted | boolean | Y | false |  |
| 55 | blacklist_reason | text | Y | - |  |
| 56 | annual_volume | numeric | Y | 0 |  |
| 57 | discount_percent | numeric | Y | 0 |  |
| 58 | return_policy | text | Y | - |  |
| 59 | latitude | numeric | Y | - |  |
| 60 | longitude | numeric | Y | - |  |
| 61 | supplier_tier | character varying | Y | 'approved'::character varying |  |
| 62 | country_of_origin | character varying | Y | - |  |
| 63 | last_audit_date | date | Y | - |  |
| 64 | next_audit_date | date | Y | - |  |
| 65 | supply_categories | text | Y | - |  |
| 66 | supplier_type | character varying | Y | - |  |
| 67 | industry | character varying | Y | - |  |
| 68 | iso_certification | character varying | Y | - |  |
| 69 | overall_rating | numeric | Y | - |  |
| 70 | min_order_amount | numeric | Y | - |  |
| 71 | average_lead_time_days | integer | Y | - |  |
| 72 | license_number | character varying | Y | - |  |
| 73 | license_expiry | date | Y | - |  |
| 74 | preferred | boolean | Y | false |  |
| 75 | company_name_en | text | Y | - |  |
| 76 | company_registration | text | Y | - |  |
| 77 | year_established | integer | Y | - |  |
| 78 | employee_count | integer | Y | - |  |
| 79 | annual_revenue | numeric | Y | - |  |
| 80 | credit_score | character varying | Y | - |  |
| 81 | duns_number | character varying | Y | - |  |
| 82 | website_url | text | Y | - |  |
| 83 | specialization | text | Y | - |  |
| 84 | quality_certification | text | Y | - |  |
| 85 | iso_expiry | date | Y | - |  |
| 86 | insurance_amount | numeric | Y | - |  |
| 87 | approved_date | date | Y | - |  |
| 88 | approved_by | character varying | Y | - |  |
| 89 | audit_score | numeric | Y | - |  |
| 90 | on_time_delivery_pct | numeric | Y | - |  |
| 91 | quality_reject_pct | numeric | Y | - |  |
| 92 | avg_lead_time_days | integer | Y | - |  |
| 93 | min_order_value | numeric | Y | - |  |
| 94 | backup_supplier | boolean | Y | false |  |
| 95 | sole_source | boolean | Y | false |  |
| 96 | consignment_supplier | boolean | Y | false |  |
| 97 | dropship_capable | boolean | Y | false |  |
| 98 | returns_policy | text | Y | - |  |
| 99 | warranty_terms | text | Y | - |  |
| 100 | total_orders | integer | Y | 0 |  |
| 101 | total_spent | numeric | Y | 0 |  |
| 102 | last_order_date | date | Y | - |  |
| 103 | tags | text | Y | - |  |
| 104 | contact_title | character varying | Y | - |  |
| 105 | contact_first_name | character varying | Y | - |  |
| 106 | contact_last_name | character varying | Y | - |  |
| 107 | contact_department | character varying | Y | - |  |
| 108 | contact_role | character varying | Y | - |  |
| 109 | alternate_contact | character varying | Y | - |  |
| 110 | alternate_phone | character varying | Y | - |  |
| 111 | alternate_email | character varying | Y | - |  |
| 112 | accounts_contact | character varying | Y | - |  |
| 113 | accounts_phone | character varying | Y | - |  |
| 114 | accounts_email | character varying | Y | - |  |
| 115 | delivery_contact | character varying | Y | - |  |
| 116 | delivery_phone | character varying | Y | - |  |
| 117 | country_code | character varying | Y | - |  |
| 118 | postal_code | character varying | Y | - |  |
| 119 | region | character varying | Y | - |  |
| 120 | timezone | character varying | Y | - |  |
| 121 | language | character varying | Y | 'he'::character varying |  |
| 122 | gps_latitude | numeric | Y | - |  |
| 123 | gps_longitude | numeric | Y | - |  |
| 124 | withholding_tax_rate | numeric | Y | - |  |
| 125 | withholding_tax_certificate | text | Y | - |  |
| 126 | withholding_tax_valid_until | date | Y | - |  |
| 127 | vat_rate | numeric | Y | 18 |  |
| 128 | price_list_url | text | Y | - |  |
| 129 | catalog_url | text | Y | - |  |
| 130 | delivery_days_regular | integer | Y | - |  |
| 131 | delivery_days_express | integer | Y | - |  |
| 132 | free_shipping_min | numeric | Y | - |  |
| 133 | return_policy_days | integer | Y | - |  |
| 134 | quality_grade | character varying | Y | - |  |
| 135 | last_price_update | date | Y | - |  |
| 136 | price_increase_pct | numeric | Y | - |  |
| 137 | contract_id | integer | Y | - |  |
| 138 | contract_start | date | Y | - |  |
| 139 | contract_end | date | Y | - |  |
| 140 | contract_value | numeric | Y | - |  |
| 141 | payment_reliability_score | numeric | Y | - |  |
| 142 | delivery_reliability_score | numeric | Y | - |  |
| 143 | response_time_hours | integer | Y | - |  |
| 144 | complaint_resolution_days | integer | Y | - |  |
| 145 | materials_supplied | text | Y | - |  |
| 146 | brands_carried | text | Y | - |  |
| 147 | environmental_cert | boolean | Y | false |  |
| 148 | safety_cert | boolean | Y | false |  |
| 149 | documents_url | text | Y | - |  |
| 150 | photo_url | text | Y | - |  |
| 151 | bank_iban | text | Y | - |  |
| 152 | bank_swift | text | Y | - |  |
| 153 | quality_score | numeric | Y | 3.0 |  |
| 154 | delivery_score | numeric | Y | 3.0 |  |
| 155 | contract_expiry_date | date | Y | - |  |
| 156 | certifications_json | text | Y | - |  |
| 157 | annual_spend | numeric | Y | - |  |
| 158 | internal_notes | text | Y | - |  |
| 159 | preferred_notification_channel | character varying | Y | 'whatsapp'::character varying |  |
| 160 | notification_opt_out | boolean | Y | false |  |

---

### שיווק (Marketing) (7 טבלאות)

#### 402. `competitor_prices`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('competitor_prices_id_seq'::r... | 🔑 PK |
| 2 | competitor_id | integer | N | - |  |
| 3 | product_category | text | N | - |  |
| 4 | product_name | text | Y | - |  |
| 5 | our_price | numeric | Y | 0 |  |
| 6 | competitor_price | numeric | Y | 0 |  |
| 7 | last_updated | text | Y | - |  |
| 8 | notes | text | Y | - |  |
| 9 | created_at | timestamp without time zone | N | now() |  |
| 10 | updated_at | timestamp without time zone | N | now() |  |
| 11 | competitor_name | character varying | Y | - |  |
| 12 | material_type | character varying | Y | - |  |
| 13 | price | numeric | Y | - |  |
| 14 | price_per_sqm | numeric | Y | - |  |
| 15 | price_per_linear_m | numeric | Y | - |  |
| 16 | currency | character varying | Y | 'ILS'::character varying |  |
| 17 | includes_installation | boolean | Y | false |  |
| 18 | includes_glass | boolean | Y | false |  |
| 19 | price_date | date | Y | - |  |
| 20 | valid_until | date | Y | - |  |
| 21 | source | character varying | Y | - |  |
| 22 | price_diff_pct | numeric | Y | - |  |
| 23 | our_advantage | text | Y | - |  |
| 24 | tags | text | Y | - |  |
| 25 | product_id | integer | Y | - |  |
| 26 | price_per_unit | numeric | Y | - |  |
| 27 | includes_vat | boolean | Y | false |  |
| 28 | price_source | character varying | Y | - |  |
| 29 | price_gap_pct | numeric | Y | - |  |
| 30 | market_position | character varying | Y | - |  |
| 31 | quality_comparison | character varying | Y | - |  |
| 32 | delivery_comparison | character varying | Y | - |  |
| 33 | warranty_comparison | text | Y | - |  |
| 34 | verified | boolean | Y | false |  |
| 35 | verified_by | character varying | Y | - |  |
| 36 | is_active | boolean | Y | true |  |

#### 403. `competitors`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('competitors_id_seq'::regclass) | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | domain | text | Y | - |  |
| 4 | market_share | numeric | Y | 0 |  |
| 5 | is_active | boolean | Y | true |  |
| 6 | swot_strengths | text | Y | - |  |
| 7 | swot_weaknesses | text | Y | - |  |
| 8 | swot_opportunities | text | Y | - |  |
| 9 | swot_threats | text | Y | - |  |
| 10 | notes | text | Y | - |  |
| 11 | created_at | timestamp without time zone | N | now() |  |
| 12 | updated_at | timestamp without time zone | N | now() |  |
| 13 | website | character varying | Y | - |  |
| 14 | contact_person | character varying | Y | - |  |
| 15 | phone | character varying | Y | - |  |
| 16 | email | character varying | Y | - |  |
| 17 | city | character varying | Y | - |  |
| 18 | country | character varying | Y | - |  |
| 19 | employee_count | integer | Y | - |  |
| 20 | annual_revenue | numeric | Y | - |  |
| 21 | founding_year | integer | Y | - |  |
| 22 | products_offered | text | Y | - |  |
| 23 | price_level | character varying | Y | - |  |
| 24 | quality_rating | integer | Y | - |  |
| 25 | delivery_speed | character varying | Y | - |  |
| 26 | key_customers | text | Y | - |  |
| 27 | competitive_advantage | text | Y | - |  |
| 28 | threat_level | character varying | Y | - |  |
| 29 | last_analysis_date | date | Y | - |  |
| 30 | social_media_presence | text | Y | - |  |
| 31 | competitor_name | character varying | Y | - |  |
| 32 | company_name | character varying | Y | - |  |
| 33 | address | text | Y | - |  |
| 34 | main_products | text | Y | - |  |
| 35 | material_types | text | Y | - |  |
| 36 | certifications | text | Y | - |  |
| 37 | estimated_revenue | numeric | Y | - |  |
| 38 | market_share_pct | numeric | Y | - |  |
| 39 | strength_areas | text | Y | - |  |
| 40 | weakness_areas | text | Y | - |  |
| 41 | quality_level | character varying | Y | - |  |
| 42 | recent_wins | text | Y | - |  |
| 43 | recent_losses | text | Y | - |  |
| 44 | last_updated | date | Y | - |  |
| 45 | intelligence_source | character varying | Y | - |  |
| 46 | documents_url | text | Y | - |  |
| 47 | tags | text | Y | - |  |

#### 404. `content_calendar`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('content_calendar_id_seq'::re... | 🔑 PK |
| 2 | content_title | text | Y | - |  |
| 3 | content_type | text | Y | - |  |
| 4 | channel | text | Y | - |  |
| 5 | planned_date | date | Y | - |  |
| 6 | publish_time | text | Y | - |  |
| 7 | content_text | text | Y | - |  |
| 8 | creative_link | text | Y | - |  |
| 9 | assignee | text | Y | - |  |
| 10 | status | text | Y | 'planned'::text |  |
| 11 | notes | text | Y | - |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

#### 405. `content_calendar_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('content_calendar_items_id_se... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | content_type | character varying | Y | 'post'::character varying |  |
| 4 | channel | character varying | Y | - |  |
| 5 | scheduled_date | date | Y | - |  |
| 6 | status | character varying | Y | 'draft'::character varying |  |
| 7 | created_by | integer | Y | - |  |
| 8 | created_at | timestamp without time zone | Y | now() |  |
| 9 | updated_at | timestamp without time zone | Y | now() |  |

#### 406. `email_campaigns`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('email_campaigns_id_seq'::reg... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | subject | text | Y | - |  |
| 4 | status | character varying | Y | 'draft'::character varying |  |
| 5 | sent_count | integer | Y | 0 |  |
| 6 | open_rate | numeric | Y | 0 |  |
| 7 | click_rate | numeric | Y | 0 |  |
| 8 | scheduled_at | timestamp without time zone | Y | - |  |
| 9 | sent_at | timestamp without time zone | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |

#### 407. `email_marketing`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('email_marketing_id_seq'::reg... | 🔑 PK |
| 2 | campaign_name | text | Y | - |  |
| 3 | subject | text | Y | - |  |
| 4 | list_name | text | Y | - |  |
| 5 | recipients | integer | Y | 0 |  |
| 6 | sent | integer | Y | 0 |  |
| 7 | delivered | integer | Y | 0 |  |
| 8 | opens | integer | Y | 0 |  |
| 9 | clicks | integer | Y | 0 |  |
| 10 | bounces | integer | Y | 0 |  |
| 11 | unsubscribes | integer | Y | 0 |  |
| 12 | open_rate | numeric | Y | 0 |  |
| 13 | click_rate | numeric | Y | 0 |  |
| 14 | send_date | timestamp without time zone | Y | - |  |
| 15 | status | text | Y | 'draft'::text |  |
| 16 | notes | text | Y | - |  |
| 17 | created_at | timestamp without time zone | Y | now() |  |
| 18 | updated_at | timestamp without time zone | Y | now() |  |

#### 408. `marketing_campaigns`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('marketing_campaigns_id_seq':... | 🔑 PK |
| 2 | campaign_name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | type | text | Y | - |  |
| 5 | budget | numeric | Y | - |  |
| 6 | start_date | date | Y | - |  |
| 7 | end_date | date | Y | - |  |
| 8 | status | text | Y | 'draft'::text |  |
| 9 | target_audience | text | Y | - |  |
| 10 | created_at | timestamp without time zone | Y | now() |  |
| 11 | updated_at | timestamp without time zone | Y | now() |  |
| 12 | channel | text | Y | 'digital'::text |  |
| 13 | actual_spend | numeric | Y | 0 |  |
| 14 | leads_count | integer | Y | 0 |  |
| 15 | conversions | integer | Y | 0 |  |
| 16 | revenue | numeric | Y | 0 |  |
| 17 | roi | numeric | Y | 0 |  |
| 18 | manager | text | Y | - |  |
| 19 | notes | text | Y | - |  |

---

### שירות לקוחות (Customer Service) (2 טבלאות)

#### 409. `service_tickets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('service_tickets_id_seq'::reg... | 🔑 PK |
| 2 | ticket_number | text | N | - | UNIQUE |
| 3 | project_id | integer | Y | - |  |
| 4 | installation_order_id | integer | Y | - |  |
| 5 | customer_name | text | N | - |  |
| 6 | customer_phone | text | Y | - |  |
| 7 | customer_email | text | Y | - |  |
| 8 | site_address | text | N | - |  |
| 9 | category | text | Y | 'repair'::text |  |
| 10 | urgency | text | Y | 'normal'::text |  |
| 11 | issue_type | text | Y | - |  |
| 12 | issue_description | text | N | - |  |
| 13 | product_type | text | Y | - |  |
| 14 | product_serial | text | Y | - |  |
| 15 | warranty_status | text | Y | 'unknown'::text |  |
| 16 | warranty_expiry | date | Y | - |  |
| 17 | diagnosis_notes | text | Y | - |  |
| 18 | resolution_notes | text | Y | - |  |
| 19 | parts_used_json | jsonb | Y | - |  |
| 20 | technician_name | text | Y | - |  |
| 21 | scheduled_date | date | Y | - |  |
| 22 | visited_at | timestamp without time zone | Y | - |  |
| 23 | resolved_at | timestamp without time zone | Y | - |  |
| 24 | estimated_hours | numeric | Y | - |  |
| 25 | actual_hours | numeric | Y | - |  |
| 26 | parts_cost | numeric | Y | 0 |  |
| 27 | labor_cost | numeric | Y | 0 |  |
| 28 | total_cost | numeric | Y | 0 |  |
| 29 | billable | boolean | Y | true |  |
| 30 | customer_satisfaction | integer | Y | - |  |
| 31 | photos_json | jsonb | Y | - |  |
| 32 | follow_up_required | boolean | Y | false |  |
| 33 | follow_up_date | date | Y | - |  |
| 34 | priority | text | Y | 'normal'::text |  |
| 35 | status | text | N | 'new'::text |  |
| 36 | notes | text | Y | - |  |
| 37 | created_at | timestamp without time zone | Y | now() |  |
| 38 | updated_at | timestamp without time zone | Y | now() |  |

#### 410. `support_tickets`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('support_tickets_id_seq'::reg... | 🔑 PK |
| 2 | ticket_number | character varying | Y | - | UNIQUE |
| 3 | customer_id | integer | Y | - | FK → sales_customers.id |
| 4 | customer_name | character varying | Y | - |  |
| 5 | subject | character varying | N | - |  |
| 6 | description | text | Y | - |  |
| 7 | category | character varying | Y | - |  |
| 8 | priority | character varying | Y | 'medium'::character varying |  |
| 9 | status | character varying | Y | 'open'::character varying |  |
| 10 | assigned_to | character varying | Y | - |  |
| 11 | created_at | timestamp with time zone | Y | now() |  |
| 12 | resolved_at | timestamp with time zone | Y | - |  |
| 13 | resolution_notes | text | Y | - |  |
| 14 | updated_at | timestamp with time zone | Y | now() |  |
| 15 | channel | character varying | Y | - |  |
| 16 | sla_due_date | timestamp without time zone | Y | - |  |
| 17 | sla_breached | boolean | Y | false |  |
| 18 | escalation_level | integer | Y | 0 |  |
| 19 | escalated_to | character varying | Y | - |  |
| 20 | response_time_minutes | integer | Y | - |  |
| 21 | resolution_time_hours | numeric | Y | - |  |
| 22 | satisfaction_rating | integer | Y | - |  |
| 23 | product_name | character varying | Y | - |  |
| 24 | order_number | character varying | Y | - |  |
| 25 | contact_phone | character varying | Y | - |  |
| 26 | contact_email | character varying | Y | - |  |
| 27 | attachments_count | integer | Y | 0 |  |
| 28 | is_recurring | boolean | Y | false |  |
| 29 | related_ticket_id | integer | Y | - |  |
| 30 | tags | text | Y | - |  |
| 31 | contact_id | integer | Y | - |  |
| 32 | contact_name | character varying | Y | - |  |
| 33 | subcategory | character varying | Y | - |  |
| 34 | severity | character varying | Y | - |  |
| 35 | assigned_team | character varying | Y | - |  |
| 36 | escalated | boolean | Y | false |  |
| 37 | escalated_at | timestamp with time zone | Y | - |  |
| 38 | first_response_at | timestamp with time zone | Y | - |  |
| 39 | resolution | text | Y | - |  |
| 40 | resolution_type | character varying | Y | - |  |
| 41 | satisfaction_score | integer | Y | - |  |
| 42 | satisfaction_comment | text | Y | - |  |
| 43 | related_order_id | integer | Y | - |  |
| 44 | related_order_number | character varying | Y | - |  |
| 45 | related_invoice_id | integer | Y | - |  |
| 46 | related_project_id | integer | Y | - |  |
| 47 | product_id | integer | Y | - |  |
| 48 | warranty_claim | boolean | Y | false |  |
| 49 | warranty_approved | boolean | Y | - |  |
| 50 | site_visit_required | boolean | Y | false |  |
| 51 | site_visit_date | date | Y | - |  |
| 52 | site_visit_technician | character varying | Y | - |  |
| 53 | cost_estimate | numeric | Y | - |  |
| 54 | cost_actual | numeric | Y | - |  |
| 55 | photos_url | text | Y | - |  |
| 56 | documents_url | text | Y | - |  |
| 57 | created_by | integer | Y | - | FK → users.id |
| 58 | channel_id | integer | Y | - |  |

---

### תמחור (Pricing) (6 טבלאות)

#### 411. `cost_calculations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('cost_calculations_id_seq'::r... | 🔑 PK |
| 2 | calculation_number | character varying | Y | - |  |
| 3 | product_name | character varying | Y | - |  |
| 4 | product_code | character varying | Y | - |  |
| 5 | category | character varying | Y | - |  |
| 6 | materials_cost | numeric | Y | 0 |  |
| 7 | labor_cost | numeric | Y | 0 |  |
| 8 | overhead_cost | numeric | Y | 0 |  |
| 9 | packaging_cost | numeric | Y | 0 |  |
| 10 | shipping_cost | numeric | Y | 0 |  |
| 11 | customs_cost | numeric | Y | 0 |  |
| 12 | other_costs | numeric | Y | 0 |  |
| 13 | total_cost | numeric | Y | 0 |  |
| 14 | margin_percent | numeric | Y | 0 |  |
| 15 | selling_price | numeric | Y | 0 |  |
| 16 | profit | numeric | Y | 0 |  |
| 17 | currency | character varying | Y | 'ILS'::character varying |  |
| 18 | status | character varying | Y | 'draft'::character varying |  |
| 19 | calculated_by | character varying | Y | - |  |
| 20 | approved_by | character varying | Y | - |  |
| 21 | notes | text | Y | - |  |
| 22 | created_at | timestamp with time zone | Y | now() |  |
| 23 | updated_at | timestamp with time zone | Y | now() |  |

#### 412. `dynamic_pricing_rules`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('dynamic_pricing_rules_id_seq... | 🔑 PK |
| 2 | name | text | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | rule_type | text | Y | 'discount'::text |  |
| 5 | condition_field | text | Y | - |  |
| 6 | condition_operator | text | Y | - |  |
| 7 | condition_value | text | Y | - |  |
| 8 | adjustment_type | text | Y | 'percentage'::text |  |
| 9 | adjustment_value | numeric | Y | - |  |
| 10 | status | text | Y | 'active'::text |  |
| 11 | created_at | timestamp without time zone | Y | now() |  |
| 12 | updated_at | timestamp without time zone | Y | now() |  |

#### 413. `import_cost_calculations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('import_cost_calculations_id_... | 🔑 PK |
| 2 | calc_number | text | N | - | UNIQUE |
| 3 | calc_name | text | N | - |  |
| 4 | status | text | N | 'טיוטה'::text |  |
| 5 | linked_import_order_id | integer | Y | - |  |
| 6 | linked_supplier | text | Y | - |  |
| 7 | supplier_country | text | Y | - |  |
| 8 | product_name | text | N | - |  |
| 9 | product_description | text | Y | - |  |
| 10 | hs_code | text | Y | - |  |
| 11 | quantity | numeric | N | 1 |  |
| 12 | unit_type | text | Y | 'יחידה'::text |  |
| 13 | unit_weight_kg | numeric | Y | 0 |  |
| 14 | total_weight_kg | numeric | Y | 0 |  |
| 15 | currency | text | N | 'USD'::text |  |
| 16 | exchange_rate | numeric | Y | 3.6 |  |
| 17 | product_cost_per_unit | numeric | N | 0 |  |
| 18 | total_product_cost | numeric | Y | 0 |  |
| 19 | shipping_method | text | Y | 'ים'::text |  |
| 20 | shipping_cost | numeric | Y | 0 |  |
| 21 | container_type | text | Y | - |  |
| 22 | container_count | integer | Y | 1 |  |
| 23 | insurance_rate | numeric | Y | 0.5 |  |
| 24 | insurance_cost | numeric | Y | 0 |  |
| 25 | customs_duty_rate | numeric | Y | 0 |  |
| 26 | customs_duty_amount | numeric | Y | 0 |  |
| 27 | purchase_tax_rate | numeric | Y | 0 |  |
| 28 | purchase_tax_amount | numeric | Y | 0 |  |
| 29 | vat_rate | numeric | Y | 18 |  |
| 30 | vat_amount | numeric | Y | 0 |  |
| 31 | port_fees | numeric | Y | 0 |  |
| 32 | storage_fees | numeric | Y | 0 |  |
| 33 | inspection_fees | numeric | Y | 0 |  |
| 34 | inland_transport | numeric | Y | 0 |  |
| 35 | handling_fees | numeric | Y | 0 |  |
| 36 | unloading_fees | numeric | Y | 0 |  |
| 37 | customs_broker_fee | numeric | Y | 0 |  |
| 38 | forwarding_agent_fee | numeric | Y | 0 |  |
| 39 | agent_commission_rate | numeric | Y | 0 |  |
| 40 | agent_commission_amount | numeric | Y | 0 |  |
| 41 | bank_charges | numeric | Y | 0 |  |
| 42 | lc_charges | numeric | Y | 0 |  |
| 43 | documentation_fees | numeric | Y | 0 |  |
| 44 | other_costs | numeric | Y | 0 |  |
| 45 | other_costs_description | text | Y | - |  |
| 46 | total_freight_costs | numeric | Y | 0 |  |
| 47 | total_taxes_duties | numeric | Y | 0 |  |
| 48 | total_port_fees | numeric | Y | 0 |  |
| 49 | total_agent_fees | numeric | Y | 0 |  |
| 50 | total_financial_costs | numeric | Y | 0 |  |
| 51 | total_other_costs | numeric | Y | 0 |  |
| 52 | total_landed_cost | numeric | Y | 0 |  |
| 53 | landed_cost_per_unit | numeric | Y | 0 |  |
| 54 | landed_cost_per_kg | numeric | Y | 0 |  |
| 55 | cost_markup_percentage | numeric | Y | 0 |  |
| 56 | notes | text | Y | - |  |
| 57 | created_by | text | Y | - |  |
| 58 | created_at | timestamp without time zone | N | now() |  |
| 59 | updated_at | timestamp without time zone | N | now() |  |

#### 414. `price_list_items`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | price_list_id | uuid | Y | - | FK → price_lists.id |
| 3 | product_id | uuid | Y | - |  |
| 4 | unit_price | integer | Y | 0 |  |
| 5 | min_quantity | numeric | Y | 1 |  |
| 6 | discount_percent | numeric | Y | 0 |  |
| 7 | valid_from | date | Y | - |  |
| 8 | valid_to | date | Y | - |  |
| 9 | created_at | timestamp without time zone | Y | now() |  |
| 10 | updated_at | timestamp without time zone | Y | now() |  |

#### 415. `price_lists`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | currency | character varying | Y | 'ILS'::character varying |  |
| 4 | price_list_type | character varying | Y | 'standard'::character varying |  |
| 5 | valid_from | date | Y | - |  |
| 6 | valid_to | date | Y | - |  |
| 7 | base_price_list_id | uuid | Y | - |  |
| 8 | markup_percent | numeric | Y | 0 |  |
| 9 | discount_percent | numeric | Y | 0 |  |
| 10 | is_default | boolean | Y | false |  |
| 11 | is_active | boolean | Y | true |  |
| 12 | created_at | timestamp without time zone | Y | now() |  |
| 13 | updated_at | timestamp without time zone | Y | now() |  |

#### 416. `price_lists_ent`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('price_lists_ent_id_seq'::reg... | 🔑 PK |
| 2 | list_number | character varying | Y | - |  |
| 3 | list_name | character varying | N | - |  |
| 4 | list_type | character varying | Y | 'general'::character varying |  |
| 5 | customer_category | character varying | Y | - |  |
| 6 | currency | character varying | Y | 'ILS'::character varying |  |
| 7 | valid_from | date | Y | - |  |
| 8 | valid_to | date | Y | - |  |
| 9 | discount_percent | numeric | Y | 0 |  |
| 10 | items_json | jsonb | Y | '[]'::jsonb |  |
| 11 | total_products | integer | Y | 0 |  |
| 12 | status | character varying | Y | 'draft'::character varying |  |
| 13 | notes | text | Y | - |  |
| 14 | approved_by | character varying | Y | - |  |
| 15 | approved_at | timestamp with time zone | Y | - |  |
| 16 | created_at | timestamp with time zone | Y | now() |  |
| 17 | updated_at | timestamp with time zone | Y | now() |  |

---

### תקשורת ושיתוף פעולה (Communication & Collaboration) (4 טבלאות)

#### 417. `calendar_events`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('calendar_events_id_seq'::reg... | 🔑 PK |
| 2 | user_id | integer | N | - |  |
| 3 | title | character varying | N | - |  |
| 4 | description | text | Y | - |  |
| 5 | event_type | character varying | N | 'meeting'::character varying |  |
| 6 | event_date | date | N | - |  |
| 7 | start_time | time without time zone | N | - |  |
| 8 | end_time | time without time zone | N | - |  |
| 9 | location | character varying | Y | - |  |
| 10 | color | character varying | Y | '#3B82F6'::character varying |  |
| 11 | is_all_day | boolean | N | false |  |
| 12 | is_completed | boolean | N | false |  |
| 13 | priority | character varying | Y | 'normal'::character varying |  |
| 14 | reminder_minutes | integer | Y | - |  |
| 15 | google_event_id | character varying | Y | - |  |
| 16 | google_calendar_id | character varying | Y | - |  |
| 17 | related_entity_type | character varying | Y | - |  |
| 18 | related_entity_id | integer | Y | - |  |
| 19 | related_entity_name | character varying | Y | - |  |
| 20 | created_at | timestamp without time zone | N | now() |  |
| 21 | updated_at | timestamp without time zone | N | now() |  |
| 22 | event_number | character varying | Y | - |  |
| 23 | event_title | character varying | Y | - |  |
| 24 | start_datetime | timestamp with time zone | Y | - |  |
| 25 | end_datetime | timestamp with time zone | Y | - |  |
| 26 | all_day | boolean | Y | false |  |
| 27 | recurring | boolean | Y | false |  |
| 28 | recurrence_pattern | character varying | Y | - |  |
| 29 | recurrence_end | date | Y | - |  |
| 30 | organizer_id | integer | Y | - |  |
| 31 | organizer_name | character varying | Y | - |  |
| 32 | attendees | text | Y | - |  |
| 33 | is_private | boolean | Y | false |  |
| 34 | status | character varying | Y | 'scheduled'::character varying |  |
| 35 | notes | text | Y | - |  |
| 36 | tags | text | Y | - |  |

#### 418. `collaboration_notes`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('collaboration_notes_id_seq':... | 🔑 PK |
| 2 | content | text | N | - |  |
| 3 | author | character varying | N | - |  |
| 4 | entity_type | character varying | Y | - |  |
| 5 | entity_id | integer | Y | - |  |
| 6 | is_pinned | boolean | Y | false |  |
| 7 | mentions | ARRAY | Y | - |  |
| 8 | created_at | timestamp with time zone | Y | now() |  |
| 9 | updated_at | timestamp with time zone | Y | now() |  |

#### 419. `collaboration_tasks`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('collaboration_tasks_id_seq':... | 🔑 PK |
| 2 | title | text | N | - |  |
| 3 | assignee | character varying | Y | - |  |
| 4 | due_date | date | Y | - |  |
| 5 | priority | character varying | Y | 'medium'::character varying |  |
| 6 | is_done | boolean | Y | false |  |
| 7 | entity_type | character varying | Y | - |  |
| 8 | entity_ref | character varying | Y | - |  |
| 9 | created_at | timestamp with time zone | Y | now() |  |

#### 420. `meetings`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | uuid | N | gen_random_uuid() | 🔑 PK |
| 2 | title | character varying | Y | - |  |
| 3 | description | text | Y | - |  |
| 4 | meeting_type | character varying | Y | 'internal'::character varying |  |
| 5 | customer_id | uuid | Y | - |  |
| 6 | contact_id | uuid | Y | - |  |
| 7 | lead_id | uuid | Y | - |  |
| 8 | organizer_id | uuid | Y | - |  |
| 9 | attendees | jsonb | Y | '[]'::jsonb |  |
| 10 | location | character varying | Y | - |  |
| 11 | start_time | timestamp without time zone | Y | - |  |
| 12 | end_time | timestamp without time zone | Y | - |  |
| 13 | duration_minutes | integer | Y | - |  |
| 14 | status | character varying | Y | 'scheduled'::character varying |  |
| 15 | outcome | text | Y | - |  |
| 16 | action_items | jsonb | Y | '[]'::jsonb |  |
| 17 | reminder_before_minutes | integer | Y | 30 |  |
| 18 | is_active | boolean | Y | true |  |
| 19 | created_by | uuid | Y | - |  |
| 20 | created_at | timestamp without time zone | Y | now() |  |
| 21 | updated_at | timestamp without time zone | Y | now() |  |

---

### תקשורת פנימית (Internal Chat) (5 טבלאות)

#### 421. `chat_channel_members`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('chat_channel_members_id_seq'... | 🔑 PK |
| 2 | channel_id | integer | N | - | FK → chat_channels.id |
| 3 | user_id | integer | N | - | FK → users.id |
| 4 | role | character varying | N | 'member'::character varying |  |
| 5 | joined_at | timestamp without time zone | N | now() |  |
| 6 | last_read_at | timestamp without time zone | Y | - |  |
| 7 | user_name | character varying | Y | - |  |
| 8 | muted | boolean | Y | false |  |
| 9 | is_active | boolean | Y | true |  |
| 10 | tags | text | Y | - |  |

#### 422. `chat_channels`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('chat_channels_id_seq'::regcl... | 🔑 PK |
| 2 | name | character varying | N | - |  |
| 3 | description | text | Y | - |  |
| 4 | type | character varying | N | 'group'::character varying |  |
| 5 | department | character varying | Y | - |  |
| 6 | is_default | boolean | N | false |  |
| 7 | created_by | integer | Y | - | FK → users.id |
| 8 | created_at | timestamp without time zone | N | now() |  |
| 9 | updated_at | timestamp without time zone | N | now() |  |
| 10 | icon | text | Y | - |  |
| 11 | channel_name | character varying | Y | - |  |
| 12 | channel_type | character varying | Y | - |  |
| 13 | is_private | boolean | Y | false |  |
| 14 | member_count | integer | Y | 0 |  |
| 15 | is_active | boolean | Y | true |  |
| 16 | last_message_at | timestamp with time zone | Y | - |  |
| 17 | tags | text | Y | - |  |

#### 423. `chat_direct_conversations`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('chat_direct_conversations_id... | 🔑 PK |
| 2 | user1_id | integer | N | - | FK → users.id |
| 3 | user2_id | integer | N | - | FK → users.id |
| 4 | last_message_at | timestamp without time zone | Y | - |  |
| 5 | created_at | timestamp without time zone | N | now() |  |
| 6 | is_active | boolean | Y | true |  |

#### 424. `chat_messages`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('chat_messages_id_seq'::regcl... | 🔑 PK |
| 2 | channel_id | integer | Y | - | FK → chat_channels.id |
| 3 | sender_id | integer | N | - | FK → users.id |
| 4 | recipient_id | integer | Y | - | FK → users.id |
| 5 | content | text | N | - |  |
| 6 | message_type | character varying | N | 'text'::character varying |  |
| 7 | attachments | jsonb | Y | - |  |
| 8 | is_edited | boolean | N | false |  |
| 9 | is_deleted | boolean | N | false |  |
| 10 | created_at | timestamp without time zone | N | now() |  |
| 11 | updated_at | timestamp without time zone | N | now() |  |
| 12 | is_internal | boolean | Y | false |  |
| 13 | sender_name | character varying | Y | - |  |
| 14 | attachment_url | text | Y | - |  |
| 15 | reply_to_id | integer | Y | - |  |
| 16 | edited | boolean | Y | false |  |
| 17 | deleted | boolean | Y | false |  |
| 18 | tags | text | Y | - |  |

#### 425. `chat_read_receipts`

| # | שדה (Column) | סוג (Type) | NULL | ברירת מחדל (Default) | הערות |
|---|---|---|---|---|---|
| 1 | id | integer | N | nextval('chat_read_receipts_id_seq'::... | 🔑 PK |
| 2 | user_id | integer | N | - | FK → users.id |
| 3 | channel_id | integer | Y | - | FK → chat_channels.id |
| 4 | direct_conversation_id | integer | Y | - | FK → chat_direct_conversations.id |
| 5 | last_read_message_id | integer | Y | - | FK → chat_messages.id |
| 6 | last_read_at | timestamp without time zone | N | now() |  |
| 7 | unread_count | integer | Y | 0 |  |

---

## נקודות API | API Endpoints Summary

> סה״כ 2,421+ נקודות API ב-Express 5

| קטגוריה | בסיס נתיב | פעולות |
|---|---|---|
| אימות | `/api/auth` | login, logout, me, refresh |
| CRUD דינמי לכל ישות | `/api/entity/:slug` | list, create, update, delete, bulk |
| ניהול לקוחות | `/api/customers` | CRUD, חיפוש, סטטיסטיקות |
| ניהול ספקים | `/api/suppliers` | CRUD, דירוג, ביצועים |
| קטלוג מוצרים | `/api/products` | CRUD, מלאי, BOM |
| הזמנות רכש | `/api/purchase-orders` | CRUD, אישורים, קבלות |
| מכירות | `/api/sales/*` | הצעות, הזמנות, חשבוניות, תעודות משלוח |
| מלאי | `/api/inventory/*` | מחסנים, תנועות, ספירות, התראות |
| ייצור | `/api/production/*` | הזמנות עבודה, קנבאן, גאנט, BOM |
| כספים | `/api/finance/*` | יומנים, חשבונות, מאזן, רווח/הפסד |
| משאבי אנוש | `/api/hr/*` | עובדים, נוכחות, שכר, חופשות |
| פרויקטים | `/api/projects/*` | ניהול, ניתוח, משאבים, סיכונים |
| מסמכים | `/api/documents/*` | העלאה, ארכיון, תבניות, חתימות |
| שיווק | `/api/marketing/*` | קמפיינים, דיוור, מתחרים |
| צאט פנימי | `/api/chat/*` | ערוצים, הודעות, שיחות |
| קובי-AI | `/api/claude/*` | שיחות, כלים, אבחון, בנייה |
| קובי | `/api/kobi/*` | צאט, כלים, הוראות מערכת |
| מנוע אנליטיקה | `/api/analytics/*` | שאילתות, דוחות, KPI |
| תחזוקה | `/api/cmms/*` | ציוד, הזמנות תחזוקה, חלקי חילוף |
| איכות | `/api/quality/*` | בדיקות, NCR, כיול, תעודות |
| תקציבים | `/api/budgets/*` | תכנון, מעקב, ביצוע |
| הגדרות | `/api/settings/*` | מערכת, משתמשים, הרשאות |
| התראות | `/api/notifications/*` | שליחה, ניתוב, תצורה |
| דוחות | `/api/reports/*` | כספיים, תפעוליים, BI |
| פלטפורמה | `/api/platform/*` | תצורה, תפריטים, טפסים, תצוגות |

---

## אבטחה ואימות | Security & Authentication

| פרמטר | ערך |
|---|---|
| אימות | JWT (JSON Web Tokens) |
| הצפנת סיסמאות | PBKDF2-SHA512 |
| ניהול הרשאות | Role-Based (Admin, Manager, User, Viewer) |
| מע״מ | 18% (קבוע) |
| מטבע בסיס | ILS (שקלים — אגורות) |
| גיבוי אוטומטי | כל שעה |
| Audit Log | כל פעולה נרשמת |

---

## קובי-AI — סוכן אוטונומי | Kobi-AI Autonomous Agent

| פרמטר | ערך |
|---|---|
| מודל | Claude claude-sonnet-4-20250514 (Anthropic) |
| יכולות | שאילתת DB, יצירת רשומות, עדכון, מחיקה, ניתוח, דוחות |
| כלים | 50+ כלים מובנים |
| שיחות | נשמרות בהיסטוריה |
| IDE | עורך קוד מובנה לשאילתות |
| Governance | כל פעולה נרשמת ב-audit log |

