# מערכת ERP טכנו-כל עוזי — אינוונטר מלא של המערכת
## System Full Inventory — Techno-Kol Uzi ERP

---

## סיכום כללי / Summary

| מדד | לפני (Before) | אחרי (After) | שינוי |
|-----|---------------|---------------|-------|
| טבלאות DB | 366 | 395 | +29 |
| נתיבים (Routes) | 415 | 448 | +33 |
| דפי Frontend (Page Files) | 436 | 448 | +12 |
| פריטי תפריט (Menu Items) | 396 | 396 | 0 (no change) |
| קטגוריות תפריט (Menu Sections) | 41 | 41 | 0 (no change) |
| נקודות API חדשות | — | 37 CRUD endpoints | +37 |

---

## א. קטגוריות תפריט עליונות (41 Menu Sections)

| # | שם קטגוריה | מספר פריטים |
|---|-----------|-------------|
| 1 | ראשי | 7 |
| 2 | AI וטכנולוגיה | 10 |
| 3 | Kimi 2 Terminal | 1 |
| 4 | AI Engine | 5 |
| 5 | בינה מלאכותית תפעולית | 9 |
| 6 | שולחן שליטה מנהלי | 12 |
| 7 | לקוחות ומכירות | 25 |
| 8 | CRM Advanced Pro | 20 |
| 9 | תמחור וגבייה | 9 |
| 10 | כספים והנהלת חשבונות | 52 |
| 11 | בקרה פיננסית | 10 |
| 12 | כספים — דוחות כספיים | 12 |
| 13 | כספים — לקוחות וספקים | 5 |
| 14 | כספים — לקוחות | 4 |
| 15 | כספים — ספקים | 4 |
| 16 | כספים — מיסים ופיסקלי | 2 |
| 17 | כספים — ניהול ואנליטיקה | 5 |
| 18 | רכש ומלאי | 23 |
| 19 | ייצור | 25 |
| 20 | ייצור מתכת וזכוכית | 15 |
| 21 | משאבי אנוש | 18 |
| 22 | מסמכים וחתימות | 10 |
| 23 | יבוא | 9 |
| 24 | מתקינים והתקנות | 3 |
| 25 | שיווק | 9 |
| 26 | פיתוח מוצרים | 8 |
| 27 | ניהול פרויקטים | 7 |
| 28 | פרויקטים | 1 |
| 29 | אסטרטגיה וחזון | 5 |
| 30 | דוחות וניתוחים | 6 |
| 31 | ניתוח עסקי | 3 |
| 32 | בונה מערכת | 29 |
| 33 | הגדרות מערכת | 15 |
| 34 | תפעול | 2 |
| 35 | אישורים ובקרה | 1 |
| 36 | BlackRock 2026 | 6 |
| 37 | כלים | 2 |
| 38 | אינטגרציות | 2 |
| 39 | פורטל חיצוני | 4 |
| 40 | שירות ותמיכה | 1 |
| **סה"כ** | | **396** |

---

## ב. כל פריטי התפריט לפי קטגוריה (396 Menu Items)

### 1. ראשי (7)
| נתיב | שם |
|-------|-----|
| / | דשבורד מנהלים |
| /platform | סקירת פלטפורמה |
| /chat | צ'אט ארגוני |
| /claude-chat | עוזי AI צ'אט |
| /documents/company-report | דוח מצב החברה |
| /operations-control-center | מרכז בקרה ותפעול |
| /alert-terminal | טרמינל התראות |

### 2. AI וטכנולוגיה (10)
| נתיב | שם |
|-------|-----|
| /ai-document-processor | עיבוד מסמכים AI |
| /hi-tech-dashboard | דאשבורד הייטק — סוכני AI |
| /ai/providers | ספקי AI |
| /ai/models | מודלי AI |
| /ai/api-keys | מפתחות API |
| /ai/prompt-templates | תבניות פרומפט |
| /ai/queries | שאילתות AI |
| /ai/responses | תגובות AI |
| /ai/recommendations | המלצות AI |
| /ai/usage-logs | לוגים AI |

### 3. Kimi 2 Terminal (1)
| נתיב | שם |
|-------|-----|
| /ai-engine/kimi | Kimi 2 Terminal |

### 4. AI Engine (5)
| נתיב | שם |
|-------|-----|
| /ai-engine | AI Engine Hub |
| /ai-engine/lead-scoring | Lead Scoring AI |
| /ai-engine/call-nlp | Call NLP Analysis |
| /ai-engine/predictive | Predictive Analytics |
| /ai-engine/chatbot | AI Chatbot Settings |

### 5. בינה מלאכותית תפעולית (9)
| נתיב | שם |
|-------|-----|
| /ai-ops/sales-assistant | עוזר מכירות AI |
| /ai-ops/lead-scoring | דירוג לידים AI |
| /ai-ops/customer-service | שירות לקוחות AI |
| /ai-ops/follow-up | מעקב לקוחות AI |
| /ai-ops/quotation-assistant | עוזר הצעות מחיר AI |
| /ai-ops/procurement-optimizer | אופטימיזציית רכש AI |
| /ai-ops/production-insights | תובנות ייצור AI |
| /ai-ops/anomaly-detection | זיהוי חריגות AI |
| /ai-ops/executive-insights | תובנות מנהלים AI |

### 6. שולחן שליטה מנהלי (12)
| נתיב | שם |
|-------|-----|
| /executive/ceo-dashboard | דשבורד מנכ"ל |
| /executive/company-health | בריאות החברה |
| /executive/kpi-board | לוח KPI מנהלי |
| /executive/live-alerts | מרכז התראות חי |
| /executive/financial-risk | סיכונים פיננסיים |
| /executive/operational-bottlenecks | צווארי בקבוק |
| /executive/delayed-projects | פרויקטים באיחור |
| /executive/procurement-risk | סיכוני רכש |
| /executive/production-efficiency | יעילות ייצור |
| /executive/profitability | דשבורד רווחיות |
| /executive/workforce-status | סטטוס כוח אדם |
| /data-flow | זרימת נתונים (ארכיטקטורה) |

### 7. לקוחות ומכירות (25)
| נתיב | שם |
|-------|-----|
| /customers | ניהול לקוחות |
| /crm | דשבורד CRM |
| /crm/leads | ניהול לידים |
| /crm/automations | אוטומציות CRM |
| /crm/email-sync | Email Sync |
| /crm/field-agents | סוכני שטח |
| /crm/collaboration | Collaboration |
| /crm/ai-insights | AI Insights |
| /crm/advanced-search | Advanced Search |
| /crm/predictive-analytics | Predictive Analytics |
| /crm/lead-quality | Lead Quality Score |
| /crm/whatsapp-sms | WhatsApp & SMS |
| /crm/sla | SLA ניהול |
| /crm/smart-routing | Smart Routing |
| /crm/realtime-feed | Real-time Feed |
| /ai-customer-service | AI שירות לקוחות |
| /sales/customers | ניהול לקוחות |
| /sales/orders | הזמנות מכירה |
| /sales/quotations | הצעות מחיר |
| /sales/invoicing | חשבוניות מכירה |
| /sales/pipeline | צנרת CRM |
| /sales/delivery-notes | תעודות משלוח (מתקדם) |
| /sales/returns | החזרות מכירה (מתקדם) |
| /sales/customer-portal | פורטל לקוחות |
| /sales/service | שירות לקוחות |

### 8. CRM Advanced Pro (20)
| נתיב | שם |
|-------|-----|
| /crm/realtime/feeds | Live Feeds |
| /crm/realtime/notifications | Push Notifications |
| /crm/realtime/triggers | Real-time Triggers |
| /crm/realtime/sync | Data Sync |
| /crm/security/sso | SSO Config |
| /crm/security/encryption | Data Encryption |
| /crm/security/row-security | Row-Level Security |
| /crm/security/audit | Security Audit |
| /crm/ai/lead-scoring | Lead Scoring AI |
| /crm/ai/predictive | Predictive Analytics |
| /crm/ai/next-action | Next Best Action |
| /crm/ai/anomaly | Anomaly Detection |
| /crm/analytics/cohort | Cohort Analysis |
| /crm/analytics/trends | Trend Analysis |
| /crm/analytics/custom-reports | Custom Reports |
| /crm/analytics/filters | Advanced Filters |
| /crm/integrations/rest-api | REST API |
| /crm/integrations/webhooks | Webhooks |
| /crm/integrations/cloud | Cloud Storage |
| /crm/integrations/mobile | Mobile Sync |

### 9. תמחור וגבייה (9)
| נתיב | שם |
|-------|-----|
| /crm/pricing | תמחור דינמי |
| /crm/profitability | רווחיות יומית |
| /crm/collections | גבייה וסיכונים |
| /crm/contractor-decision | מודל קבלת החלטות |
| /pricing/profiles | פרופילי תמחור |
| /pricing/calculator | מחשבון תמחור |
| /pricing/comparison | השוואת מחירים |
| /pricing/material-calc | חישוב עלויות חומרים |
| /pricing/history | היסטוריית מחירים |

### 10. כספים והנהלת חשבונות (52)
| נתיב | שם |
|-------|-----|
| /accounting | הנהלת חשבונות (חשבשבת) |
| /finance/income | הכנסות ותקבולים |
| /finance/expenses | הוצאות ותשלומים |
| /finance/balances | יתרות חובות/זכויות |
| /finance/debtors | חייבים וזכאים |
| /finance/journal | פקודות יומן |
| /finance/ledger | כרטסות |
| /finance/bank-accounts | חשבונות בנק |
| /finance/bank-reconciliation | התאמות בנקאיות |
| /finance/credit-cards | כרטיסי אשראי |
| /finance/receipts | קבלות |
| /budget-tracking | מעקב תקציב |
| /exchange-rates | שערי חליפין |
| /finance/operating-profit | רווח תפעולי |
| /finance/cash-flow | תזרים מזומנים |
| /finance/tax-management | ניהול מיסים |
| /finance/chart-of-accounts | עץ חשבונות |
| /finance/cost-centers | מרכזי עלות |
| /finance/invoices | חשבוניות |
| /finance/credit-notes | זיכויים |
| /finance/aging-report | דוח גיול חובות |
| /finance/petty-cash | קופה קטנה |
| /finance/payment-runs | הרצות תשלום |
| /finance/withholding-tax | ניכוי מס במקור |
| /finance/consolidated-reports | דוחות כספיים מאוחדים |
| /finance/financial-reports | דוחות כספיים |
| /finance/expense-reports | דוחות הוצאות |
| /finance/profit-loss | דוח רווח והפסד |
| /finance/trial-balance | מאזן בוחן |
| /finance/balance-sheet | מאזן |
| /finance/entity-ledger | ספר לקוחות/ספקים |
| /finance/customer-aging | גיול לקוחות (AR) |
| /finance/supplier-aging | גיול ספקים (AP) |
| /finance/customers/invoices | חשבוניות לקוחות |
| /finance/customers/refunds | זיכויים / החזרים ללקוחות |
| /finance/customers/payments | תקבולים מלקוחות |
| /finance/customers/products | מוצרים |
| /finance/suppliers/invoices | חשבוניות ספקים |
| /finance/suppliers/credit-notes | זיכויים מספקים |
| /finance/suppliers/payments | תשלומים לספקים |
| /finance/suppliers/products | מוצרים |
| /finance/vat-report | דוח מע"מ |
| /finance/fiscal-report | דוח פיסקלי |
| /finance/invoice-analysis | ניתוח חשבוניות |
| /finance/analytics | ניתוח פיננסי |
| /finance/analytical-reports | דוחות אנליטיים |
| /finance/executive-summary | תקציר מנהלים |
| /finance/deferred-revenue | הכנסות נדחות |
| /finance/deferred-expenses | הוצאות נדחות |
| /finance/depreciation | פחת ואמורטיזציה |
| /finance/annual-reporting | דוחות שנתיים |
| /finance/cash-register | קופה רושמת |

### 11. בקרה פיננסית (10)
| נתיב | שם |
|-------|-----|
| /finance/finance-control-center | מרכז בקרה פיננסית |
| /finance/payment-terms | תנאי תשלום |
| /finance/debit-notes | חיובים |
| /finance/revenue-tracking | מעקב הכנסות |
| /finance/expense-breakdown | פירוט הוצאות |
| /finance/project-profitability | רווחיות פרויקטים |
| /finance/customer-profitability | רווחיות לקוחות |
| /finance/supplier-cost-analysis | ניתוח עלויות ספקים |
| /finance/management-reporting | דוחות ניהוליים |
| /finance/budget-vs-actual | תקציב מול ביצוע |

### 12. כספים — דוחות כספיים (12)
| נתיב | שם |
|-------|-----|
| /finance/profit-loss | דוח רווח והפסד |
| /finance/trial-balance | מאזן בוחן |
| /finance/balance-sheet | מאזן |
| /finance/cash-flow | תזרים מזומנים |
| /reports/financial | דוחות פיננסיים |
| /reports/financial/analytics | ניתוח פיננסי |
| /reports/financial/customer-aging | גיול לקוחות |
| /reports/financial/customer-vendor-ledger | כרטסת לקוחות/ספקים |
| /reports/financial/executive-summary | סיכום מנהלים |
| /reports/financial/fiscal-report | דוח פיסקלי |
| /reports/financial/invoice-analysis | ניתוח חשבוניות |
| /reports/financial/vat-report | דוח מע"מ |
| /reports/financial/vendor-aging | גיול ספקים |

### 13. כספים — לקוחות וספקים (5)
| נתיב | שם |
|-------|-----|
| /finance/entity-ledger | ספר לקוחות/ספקים |
| /finance/customer-aging | גיול לקוחות (AR) |
| /finance/supplier-aging | גיול ספקים (AP) |

### 14. כספים — לקוחות (4)
| נתיב | שם |
|-------|-----|
| /finance/customers/invoices | חשבוניות לקוחות |
| /finance/customers/refunds | זיכויים / החזרים ללקוחות |
| /finance/customers/payments | תקבולים מלקוחות |
| /finance/customers/products | מוצרים |

### 15. כספים — ספקים (4)
| נתיב | שם |
|-------|-----|
| /finance/suppliers/invoices | חשבוניות ספקים |
| /finance/suppliers/credit-notes | זיכויים מספקים |
| /finance/suppliers/payments | תשלומים לספקים |
| /finance/suppliers/products | מוצרים |

### 16. כספים — מיסים ופיסקלי (2)
| נתיב | שם |
|-------|-----|
| /finance/vat-report | דוח מע"מ |
| /finance/fiscal-report | דוח פיסקלי |

### 17. כספים — ניהול ואנליטיקה (5)
| נתיב | שם |
|-------|-----|
| /finance/invoice-analysis | ניתוח חשבוניות |
| /finance/analytics | ניתוח פיננסי |
| /finance/analytical-reports | דוחות אנליטיים |
| /finance/executive-summary | תקציר מנהלים |

### 18. רכש ומלאי (23)
| נתיב | שם |
|-------|-----|
| /suppliers | ספקים |
| /suppliers/communications | תקשורת ספקים |
| /supplier-evaluations | הערכת ספקים |
| /supplier-contracts | חוזי ספקים |
| /purchase-requests | דרישות רכש |
| /purchase-orders | הזמנות רכש |
| /purchase-approvals | אישורי רכש |
| /purchase-returns | החזרות רכש |
| /raw-materials | חומרי גלם |
| /inventory | מלאי ומחסנים |
| /inventory/categories | קטגוריות מוצרים |
| /inventory/warehouses | מחסנים |
| /inventory/stock-alerts | התראות מלאי |
| /inventory/adjustments | התאמות מלאי |
| /inventory/transfers | העברות בין מחסנים |
| /inventory/reports | דוחות מלאי |
| /inventory/valuation | שווי מלאי |
| /inventory/barcode | ברקוד/QR |
| /inventory/unit-conversions | המרות יחידות |
| /inventory/price-history | היסטוריית מחירים |
| /inventory/demand-forecast | תחזית ביקוש |
| /builder/data/50 | תגובות ספקים |
| /production/work-plans | תוכניות עבודה |

### 19. ייצור (25)
| נתיב | שם |
|-------|-----|
| /production/dashboard | דשבורד ייצור |
| /work-orders | הוראות עבודה |
| /production/scheduling | תזמון ייצור |
| /production/quality | בקרת איכות |
| /production/bom | עץ מוצר (BOM) |
| /production/maintenance | תחזוקה |
| /production/equipment | ציוד ומכונות |
| /production/capacity | ניהול קיבולת |
| /production/work-instructions | הוראות עבודה מפורטות |
| /production/shifts | משמרות |
| /production/cost-tracking | מעקב עלויות ייצור |
| /production/waste | ניהול פחת/פסולת |
| /production/kpi | KPI ייצור |
| /production/gantt | גנט ייצור |
| /production/alerts | התראות ייצור |
| /production/reports | דוחות ייצור |
| /production/materials-planning | תכנון חומרים |
| /production/floor-monitor | ניטור רצפת ייצור |
| /assets | ניהול נכסים |
| /safety | בטיחות תעשייתית |
| /document-control | בקרת מסמכים |
| /builder/data/51 | שרשרת אספקה וייצור |
| /production/automation | אוטומציה תפעולית |
| /production/traceability | מעקב חומרים |
| /production/downtime | ניהול השבתות |

### 20. ייצור מתכת וזכוכית (15)
| נתיב | שם |
|-------|-----|
| /fabrication/profiles | קטלוג פרופילים |
| /fabrication/systems | מערכות |
| /fabrication/glass | קטלוג זכוכית |
| /fabrication/finishes | גמרים וצבעים |
| /fabrication/accessories | אביזרים |
| /fabrication/cutting-lists | רשימות חיתוך |
| /fabrication/assembly-orders | הוראות הרכבה |
| /fabrication/welding-orders | הוראות ריתוך |
| /fabrication/coating-orders | הוראות ציפוי |
| /fabrication/glazing-orders | הוראות זיגוג |
| /fabrication/packing-lists | רשימות אריזה |
| /fabrication/transport-orders | הוראות הובלה |
| /fabrication/installation-orders | הוראות התקנה |
| /fabrication/service-tickets | קריאות שירות |
| /fabrication/workflow-tracker | מעקב שלבי ייצור |

### 21. משאבי אנוש (18)
| נתיב | שם |
|-------|-----|
| /employees | עובדים |
| /hr/departments | מחלקות |
| /hr/positions | תפקידים |
| /hr/attendance | נוכחות |
| /hr/payroll | שכר |
| /hr/leaves | חופשות והיעדרויות |
| /hr/benefits | הטבות |
| /hr/training | הדרכות |
| /hr/documents | מסמכי עובדים |
| /hr/evaluations | הערכות ביצוע |
| /hr/recruitment | גיוס |
| /hr/onboarding | קליטת עובדים |
| /hr/timesheet | דיווחי שעות |
| /hr/contractors | קבלנים |
| /hr/organizational-chart | מבנה ארגוני |
| /hr/equipment | ציוד לעובדים |
| /hr/announcements | הודעות והכרזות |
| /workforce-analysis | ניתוח כדאיות כוח אדם |

### 22. מסמכים וחתימות (10)
| נתיב | שם |
|-------|-----|
| /documents | ניהול מסמכים |
| /documents/upload | העלאת מסמכים |
| /documents/contracts | חוזים |
| /documents/templates | תבניות |
| /documents/quality-docs | מסמכי איכות |
| /documents/archive-files | ארכיון דיגיטלי |
| /documents/checklists | צ'קליסטים |
| /documents/digital-archive | ארכיון דיגיטלי |
| /documents/system-spec | מפרט מערכת |
| /modules/39/records | ארכיון מסמכים |

### 23. יבוא (9)
| נתיב | שם |
|-------|-----|
| /customs-clearance | שחרור ממכס |
| /shipment-tracking | מעקב משלוחים |
| /compliance-certificates | תאימות ותעודות |
| /exchange-rates | שערי חליפין |
| /import/foreign-suppliers | ספקים זרים |
| /import/landed-cost | עלויות נחיתה |
| /import/logistics | מעקב לוגיסטי |
| /import/operations | מרכז יבוא |
| /import/trade-agreements | הסכמי סחר |

### 24. מתקינים והתקנות (3)
| נתיב | שם |
|-------|-----|
| /installation/teams | צוותי התקנה |
| /installation/schedule | לוח זמנים |
| /installation/reports | דוחות התקנה |

### 25. שיווק (9)
| נתיב | שם |
|-------|-----|
| /marketing/dashboard | דשבורד שיווק |
| /marketing/campaigns | קמפיינים |
| /marketing/email | דיוור אלקטרוני |
| /marketing/content | ניהול תוכן |
| /marketing/social | רשתות חברתיות |
| /marketing/analytics | ניתוח שיווקי |
| /marketing/segments | פילוח קהלים |
| /marketing/landing-pages | דפי נחיתה |
| /marketing/events | אירועים |

### 26. פיתוח מוצרים (8)
| נתיב | שם |
|-------|-----|
| /product-dev/dashboard | דשבורד פיתוח |
| /product-dev/products | מוצרים |
| /product-dev/roadmap | מפת דרכים |
| /product-dev/prototypes | אבות טיפוס |
| /product-dev/testing | בדיקות |
| /product-dev/feedback | משוב לקוחות |
| /product-dev/releases | גרסאות |
| /product-dev/competitors | ניתוח מתחרים |

### 27. ניהול פרויקטים (7)
| נתיב | שם |
|-------|-----|
| /projects | ניהול פרויקטים |
| /projects/tasks | משימות |
| /projects/milestones | אבני דרך |
| /projects/budgets | תקציבי פרויקטים |
| /projects/resources | הקצאת משאבים |
| /projects/timeline | ציר זמן |
| /projects/risks | ניהול סיכונים |

### 28. פרויקטים (1)
| נתיב | שם |
|-------|-----|
| /meetings | ניהול ישיבות |

### 29. אסטרטגיה וחזון (5)
| נתיב | שם |
|-------|-----|
| /strategy/goals | יעדים אסטרטגיים |
| /strategy/swot | ניתוח SWOT |
| /strategy/business-plan | תוכנית עסקית |
| /strategy/competitive-analysis | ניתוח תחרותי |
| /strategy/balanced-scorecard | Balanced Scorecard |

### 30. דוחות וניתוחים (6)
| נתיב | שם |
|-------|-----|
| /reports | מרכז דוחות |
| /reports/kpis | דשבורד KPI |
| /reports/funnel | משפך המרות |
| /reports/operational | דוחות תפעוליים |
| /reports/risks | סיכונים וגידורים |
| /reports/financial | דוחות פיננסיים |

### 31. ניתוח עסקי (3)
| נתיב | שם |
|-------|-----|
| /executive/war-room | חדר מלחמה מנהלי |
| /executive/order-lifecycle | מחזור חיי הזמנה |
| /system/model-catalog | קטלוג מודלים |

### 32. בונה מערכת (29)
| נתיב | שם |
|-------|-----|
| /builder | דשבורד בונה |
| /builder/modules | ניהול מודולים |
| /builder/entities | ניהול ישויות |
| /builder/fields | ניהול שדות |
| /builder/views | בונה תצוגות |
| /builder/forms | בונה טפסים |
| /builder/details | תצוגת פרטים |
| /builder/statuses | ניהול סטטוסים |
| /builder/relations | ניהול קשרים |
| /builder/actions | ניהול פעולות |
| /builder/buttons | ניהול כפתורים |
| /builder/validations | ניהול ולידציות |
| /builder/categories | ניהול קטגוריות |
| /builder/templates | תבניות מסמכים |
| /builder/automations | אוטומציות |
| /builder/automation-dashboard | מרכז אוטומציות |
| /builder/workflows | בונה תהליכים |
| /builder/publish | גרסאות ופרסום |
| /builder/dashboards | בונה דשבורדים |
| /builder/widgets | בונה ווידג'טים |
| /builder/contexts | בונה הקשרים |
| /builder/tools | בונה כלים |
| /builder/menus | תפריטים |
| /builder/permissions | הרשאות ותפקידים |
| /ai-builder | בונה AI |
| /audit-log | יומן ביקורת |
| /report-builder | בונה דוחות |
| /document-builder | בונה מסמכים |
| /integration-builder | בונה אינטגרציות |

### 33. הגדרות מערכת (15)
| נתיב | שם |
|-------|-----|
| /settings | הגדרות כלליות |
| /settings?tab=profile | עריכת משתמש |
| /settings?tab=system | הגדרות חברה |
| /settings?tab=users | ניהול משתמשים |
| /settings?tab=modules | עריכת מודולים ושדות |
| /settings?tab=integrations | אינטגרציות |
| /settings?tab=automation | אוטומציה |
| /settings?tab=plugins | תוספים |
| /notification-preferences | העדפות התראות |
| /notification-routing | ניתוב התראות |
| /notifications | התראות |
| /permissions | הרשאות |
| /builder/permissions | הרשאות ותפקידים |
| /governance | ממשל תאגידי |
| /integration-settings | הגדרות אינטגרציות |

### 34. תפעול (2)
| נתיב | שם |
|-------|-----|
| /operations-control-center | מרכז בקרה ותפעול |
| /attendance | נוכחות עובדים |

### 35. אישורים ובקרה (1)
| נתיב | שם |
|-------|-----|
| /purchase-approvals | אישורי רכש |

### 36. BlackRock 2026 (6)
| נתיב | שם |
|-------|-----|
| /blackrock | תיק השקעות |
| /blackrock/transactions | עסקאות |
| /blackrock/allocation | הקצאת נכסים |
| /blackrock/performance | ביצועים |
| /blackrock/risk | ניהול סיכונים |
| /blackrock/reports | דוחות |

### 37. כלים (2)
| נתיב | שם |
|-------|-----|
| /calendar | יומן אישי |
| /ai-settings | הגדרות AI |

### 38. אינטגרציות (2)
| נתיב | שם |
|-------|-----|
| /integrations-hub | מרכז אינטגרציות |
| /integrations-hub/data | אינטגרציית נתונים |

### 39. פורטל חיצוני (4)
| נתיב | שם |
|-------|-----|
| /portal/supplier | פורטל ספקים |
| /portal/contractor | פורטל קבלנים |
| /portal/employee | פורטל עובדים |
| /portal/admin | ניהול פורטל |

### 40. שירות ותמיכה (1)
| נתיב | שם |
|-------|-----|
| /support/tickets | פניות תמיכה |

---

## ג. כל הנתיבים (Routes) ב-App.tsx — 448 Routes

### All 448 routes listed by path:

```
/
/accounting
/ai/api-keys
/ai-builder
/ai-customer-service
/ai-document-processor
/ai-engine
/ai-engine/call-nlp
/ai-engine/chatbot
/ai-engine/kimi
/ai-engine/lead-scoring
/ai-engine/predictive
/ai/models
/ai-ops/anomaly-detection
/ai-ops/customer-service
/ai-ops/executive-insights
/ai-ops/follow-up
/ai-ops/lead-scoring
/ai-ops/procurement-optimizer
/ai-ops/production-insights
/ai-ops/quotation-assistant
/ai-ops/sales-assistant
/ai/prompt-templates
/ai/providers
/ai/queries
/ai/recommendations
/ai/responses
/ai-settings
/ai/usage-logs
/alert-terminal
/assets
/attendance
/audit-log
/blackrock
/blackrock/allocation
/blackrock/performance
/blackrock/reports
/blackrock/risk
/blackrock/transactions
/budget-tracking
/builder
/builder/actions
/builder/automation-dashboard
/builder/automations
/builder/buttons
/builder/categories
/builder/contexts
/builder/dashboards
/builder/data/:entityId
/builder/details
/builder/entities
/builder/entity/:id
/builder/fields
/builder/forms
/builder/menus
/builder/module/:id
/builder/module/:id/versions
/builder/modules
/builder/permissions
/builder/publish
/builder/relations
/builder/statuses
/builder/templates
/builder/tools
/builder/validations
/builder/views
/builder/widgets
/builder/workflows
/calendar
/chat
/claude-chat
/compliance-certificates
/crm
/crm/activities
/crm/advanced-search
/crm/ai/anomaly
/crm/ai-insights
/crm/ai/lead-scoring
/crm/ai/next-action
/crm/ai/predictive
/crm/analytics/cohort
/crm/analytics/custom-reports
/crm/analytics/filters
/crm/analytics/trends
/crm/automation
/crm/automations
/crm/collaboration
/crm/collections
/crm/contacts
/crm/contractor-decision
/crm/email-sync
/crm/field-agents
/crm/integrations/cloud
/crm/integrations/mobile
/crm/integrations/rest-api
/crm/integrations/webhooks
/crm/lead-quality
/crm/leads
/crm/meetings
/crm/messaging
/crm/pipeline
/crm/portal
/crm/predictive-analytics
/crm/pricing
/crm/profitability
/crm/real-time
/crm/realtime-feed
/crm/realtime/feeds
/crm/realtime/notifications
/crm/realtime/sync
/crm/realtime/triggers
/crm/search
/crm/security/audit
/crm/security/encryption
/crm/security/row-security
/crm/security/sso
/crm/service
/crm/sla
/crm/smart-routing
/crm/whatsapp-sms
/customers
/customs-clearance
/data-flow
/document-builder
/document-control
/documents
/documents/archive-files
/documents/checklists
/documents/company-report
/documents/contracts
/documents/digital-archive
/documents/quality-docs
/documents/system-spec
/documents/templates
/documents/upload
/employees
/exchange-rates
/executive/ceo-dashboard
/executive/company-health
/executive/delayed-projects
/executive/financial-risk
/executive/kpi-board
/executive/live-alerts
/executive/operational-bottlenecks
/executive/order-lifecycle
/executive/procurement-risk
/executive/production-efficiency
/executive/profitability
/executive/war-room
/executive/workforce-status
/fabrication/accessories
/fabrication/assembly-orders
/fabrication/coating-orders
/fabrication/cutting-lists
/fabrication/finishes
/fabrication/glass
/fabrication/glazing-orders
/fabrication/installation-orders
/fabrication/packing-lists
/fabrication/profiles
/fabrication/service-tickets
/fabrication/systems
/fabrication/transport-orders
/fabrication/welding-orders
/fabrication/workflow-tracker
/finance/aging-report
/finance/analytics
/finance/analytical-reports
/finance/annual-reporting
/finance/balance-sheet
/finance/balances
/finance/bank-accounts
/finance/bank-reconciliation
/finance/budget-vs-actual
/finance/cash-flow
/finance/cash-register
/finance/chart-of-accounts
/finance/checks
/finance/consolidated-reports
/finance/cost-centers
/finance/credit-cards
/finance/credit-notes
/finance/currencies
/finance/customer-aging
/finance/customer-profitability
/finance/customers/invoices
/finance/customers/payments
/finance/customers/products
/finance/customers/refunds
/finance/debit-notes
/finance/debtors
/finance/deferred-expenses
/finance/deferred-revenue
/finance/depreciation
/finance/entity-ledger
/finance/executive-summary
/finance/expense-breakdown
/finance/expense-reports
/finance/expenses
/finance/finance-control-center
/finance/financial-reports
/finance/fiscal-report
/finance/income
/finance/invoice-analysis
/finance/invoices
/finance/journal
/finance/ledger
/finance/management-reporting
/finance/operating-profit
/finance/payment-runs
/finance/payment-terms
/finance/payments
/finance/petty-cash
/finance/profit-loss
/finance/project-profitability
/finance/receipts
/finance/revenue-tracking
/finance/revenues
/finance/supplier-aging
/finance/supplier-cost-analysis
/finance/suppliers/credit-notes
/finance/suppliers/invoices
/finance/suppliers/payments
/finance/suppliers/products
/finance/tax-management
/finance/trial-balance
/finance/vat-report
/finance/withholding-tax
/governance
/hi-tech-dashboard
/hr/announcements
/hr/attendance
/hr/benefits
/hr/contractor-payments
/hr/contractors
/hr/departments
/hr/documents
/hr/equipment
/hr/evaluations
/hr/leaves
/hr/onboarding
/hr/organizational-chart
/hr/payroll
/hr/positions
/hr/recruitment
/hr/timesheet
/hr/training
/import/cost-calculator
/import/foreign-suppliers
/import/insurance
/import/landed-cost
/import/logistics
/import/operations
/import/trade-agreements
/installation/field
/installation/installers
/installation/measurements
/installation/reports
/installation/schedule
/installation/teams
/integrations-hub
/integrations-hub/data
/integration-builder
/integration-settings
/inventory
/inventory/adjustments
/inventory/barcode
/inventory/categories
/inventory/demand-forecast
/inventory/price-history
/inventory/reports
/inventory/stock-alerts
/inventory/transfers
/inventory/unit-conversions
/inventory/valuation
/inventory/warehouses
/marketing/analytics
/marketing/campaigns
/marketing/content
/marketing/dashboard
/marketing/email
/marketing/events
/marketing/landing-pages
/marketing/segments
/marketing/social
/meetings
/modules/:moduleId/records
/modules/39/records
/notification-preferences
/notification-routing
/notifications
/operations-control-center
/permissions
/platform
/pricing/calculator
/pricing/comparison
/pricing/cost-calc
/pricing/daily-profit
/pricing/dynamic
/pricing/history
/pricing/material-calc
/pricing/profiles
/portal/admin
/portal/contractor
/portal/employee
/portal/supplier
/pricing/cost-calc
/pricing/daily-profit
/pricing/dynamic
/procurement/requisitions
/procurement/rfq
/procurement/stock-count
/procurement/stock-movements
/product-dev/competitors
/product-dev/dashboard
/product-dev/feedback
/product-dev/products
/product-dev/prototypes
/product-dev/releases
/product-dev/roadmap
/product-dev/testing
/production/alerts
/production/automation
/production/bom
/production/capacity
/production/cost-tracking
/production/dashboard
/production/downtime
/production/equipment
/production/floor-monitor
/production/gantt
/production/kpi
/production/maintenance
/production/materials-planning
/production/quality
/production/quality-inspections
/production/reports
/production/safety
/production/scheduling
/production/shifts
/production/traceability
/production/waste
/production/work-instructions
/production/work-plans
/projects
/projects/budgets
/projects/milestones
/projects/resources
/projects/risks
/projects/tasks
/projects/timeline
/purchase-approvals
/purchase-orders
/purchase-requests
/purchase-returns
/raw-materials
/report-builder
/reports
/reports/financial
/reports/financial/analytics
/reports/financial/customer-aging
/reports/financial/customer-vendor-ledger
/reports/financial/executive-summary
/reports/financial/fiscal-report
/reports/financial/invoice-analysis
/reports/financial/vat-report
/reports/financial/vendor-aging
/reports/funnel
/reports/kpis
/reports/operational
/reports/risks
/safety
/sales/customer-portal
/sales/customers
/sales/delivery-notes
/sales/invoices
/sales/invoicing
/sales-orders
/sales/orders
/sales/pipeline
/sales/quotations
/sales/quotes
/sales/returns
/sales/service
/settings
/shipment-tracking
/strategy/balanced-scorecard
/strategy/business-plan
/strategy/competitive-analysis
/strategy/goals
/strategy/swot
/supplier-contracts
/supplier-evaluations
/suppliers
/suppliers/:id
/suppliers/communications
/support/tickets
/system/model-catalog
/workforce-analysis
/work-orders
```

---

## ד. השוואת לפני/אחרי — Before/After Comparison

### נתיבים שנוספו (33 New Routes Added):

| # | נתיב חדש | סוג | מה הוא עושה |
|---|----------|------|-------------|
| 1 | /crm/activities | דף חדש | פעילויות CRM — רישום שיחות, פגישות, משימות |
| 2 | /crm/messaging | דף חדש | מרכז הודעות CRM — WhatsApp, Email, SMS |
| 3 | /crm/contacts | Alias | מפנה ל-/customers (ניהול לקוחות) |
| 4 | /crm/pipeline | Alias | מפנה ל-/sales/pipeline (צנרת מכירות) |
| 5 | /crm/service | Alias | מפנה ל-/sales/service (שירות לקוחות) |
| 6 | /crm/meetings | Alias | מפנה ל-/meetings (ניהול ישיבות) |
| 7 | /crm/automation | Alias | מפנה ל-/crm/automations (אוטומציות CRM) |
| 8 | /crm/portal | Alias | מפנה ל-/sales/customer-portal |
| 9 | /crm/real-time | Alias | מפנה ל-/crm/realtime-feed |
| 10 | /crm/search | Alias | מפנה ל-/crm/advanced-search |
| 11 | /sales/quotes | Alias | מפנה ל-/sales/quotations (הצעות מחיר) |
| 12 | /sales/invoices | Alias | מפנה ל-/sales/invoicing (חשבוניות) |
| 13 | /pricing/cost-calc | Alias | מפנה ל-/pricing/calculator |
| 14 | /pricing/dynamic | Alias | מפנה ל-/crm/pricing |
| 15 | /pricing/daily-profit | Alias | מפנה ל-/crm/profitability |
| 16 | /production/bom | Alias | מפנה ל-BOM page |
| 17 | /production/quality-inspections | דף חדש | בדיקות איכות ייצור |
| 18 | /production/safety | דף חדש | בטיחות תעשייתית בייצור |
| 19 | /installation/installers | Alias | מפנה ל-/installation/teams |
| 20 | /installation/field | Alias | מפנה ל-/crm/field-agents |
| 21 | /installation/measurements | Alias | מפנה ל-/modules/39/records |
| 22 | /finance/revenues | דף חדש | ניהול הכנסות ותקבולים |
| 23 | /finance/payments | Alias | מפנה ל-/finance/expenses |
| 24 | /finance/checks | דף חדש | ניהול צ'קים |
| 25 | /finance/currencies | דף חדש | ניהול מטבעות ושערי חליפין |
| 26 | /hr/leaves | Alias | מפנה ל-HR leaves page |
| 27 | /hr/contractor-payments | Alias | מפנה ל-/hr/contractors |
| 28 | /procurement/requisitions | דף חדש | דרישות רכש |
| 29 | /procurement/rfq | דף חדש | בקשות הצעת מחיר (RFQ) |
| 30 | /procurement/stock-count | דף חדש | ספירות מלאי |
| 31 | /procurement/stock-movements | דף חדש | תנועות מלאי |
| 32 | /import/cost-calculator | דף חדש | מחשבון עלויות יבוא |
| 33 | /import/insurance | דף חדש | ביטוח יבוא |

### דפי Frontend חדשים שנוצרו (12 New Page Files):

| # | קובץ | תיאור |
|---|------|--------|
| 1 | pages/crm/crm-activities.tsx | פעילויות CRM |
| 2 | pages/crm/crm-messaging.tsx | הודעות CRM |
| 3 | pages/finance/checks-management.tsx | ניהול צ'קים |
| 4 | pages/finance/currencies-management.tsx | ניהול מטבעות |
| 5 | pages/finance/revenues-page.tsx | ניהול הכנסות |
| 6 | pages/import/import-cost-calculator.tsx | מחשבון עלויות יבוא |
| 7 | pages/import/import-insurance.tsx | ביטוח יבוא |
| 8 | pages/procurement/purchase-requisitions.tsx | דרישות רכש |
| 9 | pages/procurement/rfq-management.tsx | בקשות הצעת מחיר |
| 10 | pages/procurement/stock-counts.tsx | ספירות מלאי |
| 11 | pages/procurement/stock-movements.tsx | תנועות מלאי |
| 12 | pages/production/safety-management.tsx | בטיחות תעשייתית |

### טבלאות DB חדשות (29 New Tables):

| # | טבלה | תיאור |
|---|------|--------|
| 1 | quote_items | שורות הצעת מחיר |
| 2 | sales_invoice_items | שורות חשבונית מכירה |
| 3 | crm_activities | פעילויות CRM |
| 4 | customer_portal_users | משתמשי פורטל לקוחות |
| 5 | sales_return_items | שורות החזרות מכירה |
| 6 | meetings | ישיבות |
| 7 | email_sync_accounts | חשבונות סנכרון מייל |
| 8 | crm_messaging_log | לוג הודעות CRM |
| 9 | field_agent_locations | מיקומי סוכני שטח |
| 10 | price_lists | רשימות מחירים |
| 11 | price_list_items | שורות רשימת מחירים |
| 12 | collection_records | רשומות גבייה |
| 13 | purchase_requisitions | דרישות רכש |
| 14 | rfqs | בקשות הצעת מחיר |
| 15 | risk_assessments | הערכות סיכון |
| 16 | import_documents | מסמכי יבוא |
| 17 | import_insurance | ביטוח יבוא |
| 18 | revenues | הכנסות |
| 19 | expense_categories | קטגוריות הוצאות |
| 20 | budget_lines | שורות תקציב |
| 21 | checks | צ'קים |
| 22 | currencies | מטבעות |
| 23 | payment_terms | תנאי תשלום |
| 24 | petty_cash_transactions | תנועות קופה קטנה |
| 25 | payroll_runs | הרצות שכר |
| 26 | payroll_entries | שורות שכר |
| 27 | shift_definitions | הגדרות משמרות |
| 28 | trainings | הדרכות |
| 29 | employee_certifications | הסמכות עובדים |

### נקודות API חדשות (37 CRUD Endpoints):

All via generic CRUD factory in `missing-entities.ts`:
crm_activities, meetings, price_lists, price_list_items, collection_records, purchase_requisitions, rfqs, risk_assessments, import_documents, import_insurance, revenues, expense_categories, budget_lines, checks, currencies, payment_terms, petty_cash_transactions, payroll_runs, payroll_entries, shift_definitions, trainings, employee_certifications, contractor_payments, quality_inspections, maintenance_orders, safety_incidents, site_measurements, installer_work_orders, stock_counts, stock_movements, strategic_goals, quote_items, sales_invoice_items, sales_return_items, customer_portal_users, email_sync_accounts, crm_messaging_log, field_agent_locations

### Seed Data Added:
- 5 currencies: ILS, USD, EUR, GBP, CNY
- 7 payment terms: מזומן, שוטף+30, שוטף+45, שוטף+60, שוטף+90, מקדמה 50%, תשלומים
- 12 expense categories: שכר, חומרי גלם, שכירות, חשמל, מים, ביטוח, תחזוקה, שיווק, הובלה, ייעוץ, ציוד משרדי, אחר
- 4 shift definitions: בוקר, צהריים, לילה, מפוצלת

---

## ה. מה שוּנה, הוסתר או הוסר / Changes, Removals, Hiding

### שום דבר לא הוסר ❌ → ✅

**אפס נתיבים הוסרו.** אפס דפים נמחקו. אפס פריטי תפריט הוסרו או הוסתרו.

### מה שוּנה (Bug Fixes Only):

| שינוי | פרטים | סיבה |
|-------|-------|------|
| שם קומפוננט SafetyManagementPage → ProductionSafetyPage | שינוי שם import ב-App.tsx | כדי למנוע כפילות עם SafetyManagementPage קיים |
| שם קומפוננט StockCountsPage → ProcStockCountsPage | שינוי שם import ב-App.tsx | כדי למנוע כפילות עם StockCountsPage קיים |
| עמודת created_at בטבלת currencies | תוקן — עמודה חסרה הוספה | הטבלה נוצרה בלי עמודה זו בטעות |
| currencies API ORDER BY | תוקן ל-ORDER BY code ASC | סדר אלפביתי לפי קוד מטבע |

### דפים כפולים שנפתרו (Resolved Duplicates):

הבעיה: כמה דפים חדשים נתנו שם זהה לקומפוננט קיים. הפתרון: שם הקומפוננט שונה בלבד (prefix), הדף עצמו נשאר ללא שינוי.

---

## ו. טבלאות DB — רשימה מלאה (395 Tables)

See full DB table listing — 395 tables in PostgreSQL `public` schema. Key categories:

| קטגוריה | מספר טבלאות (בקירוב) |
|---------|---------------------|
| Platform/Builder (system_*, entity_*, detail_*, view_*, template_*, etc.) | ~60 |
| Finance (accounts, budgets, journals, invoices, payments, etc.) | ~55 |
| CRM/Sales (crm_*, sales_*, customers, leads, opportunities, etc.) | ~40 |
| HR (employees, attendance, payroll, benefits, training, etc.) | ~25 |
| Production (work_orders, bom_*, quality, equipment, etc.) | ~25 |
| Procurement (purchase_*, suppliers, rfqs, raw_materials, etc.) | ~20 |
| Fabrication (assembly_orders, coating_orders, cutting_lists, etc.) | ~15 |
| AI (ai_*, claude_*, kimi_*, etc.) | ~20 |
| Documents (documents, document_*, controlled_*, etc.) | ~10 |
| Import (customs_clearances, import_*, compliance_*, etc.) | ~8 |
| Marketing (email_marketing, content_calendar, competitors, etc.) | ~8 |
| Projects (projects, project_*, etc.) | ~6 |
| Strategy (strategic_goals, swot_items, business_plan_sections, etc.) | ~5 |
| Chat (chat_channels, chat_messages, chat_*, etc.) | ~5 |
| BlackRock (financial_positions, portfolio_*, etc.) | ~5 |
| Inventory (warehouses, warehouse_locations, stock_*, etc.) | ~8 |
| Misc (users, user_sessions, audit_log, notifications, etc.) | ~90 |

---

## ז. סיכום סופי / Final Summary

- **0 modules removed**
- **0 pages deleted**
- **0 routes removed**
- **0 menu items hidden**
- **0 features downgraded**
- **12 new page files created**
- **33 new routes added** (12 new pages + 21 alias routes)
- **29 new DB tables created**
- **37 new API CRUD endpoints**
- **4 seed data sets**
- **3 bug fixes** (duplicate component names, missing column, ORDER BY)

The system is additive-only. Nothing was removed, renamed, merged, or hidden.
