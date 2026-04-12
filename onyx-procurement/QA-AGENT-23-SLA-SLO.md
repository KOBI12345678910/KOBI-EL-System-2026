# QA Agent #23 — SLA / SLO / Error Budget

**תחום:** הגדרת יעדי זמינות, ביצועים, ותקציב שגיאות
**פרויקט:** onyx-procurement (בית מלאכה לעיבוד מתכת של קובי — משתמש יחיד)
**תאריך:** 2026-04-11
**סוג:** Static analysis בלבד
**מצב נוכחי:** אין הגדרות SLO/SLA כלל במערכת — נדרש להקים מאפס

---

## תקציר מנהלים

הקובץ `server.js` מטפל בשרשרת קריטית RFQ → Quote → Decide → PO → Send, והקובץ `SETUP-GUIDE-STEP-BY-STEP.md` מניח שהמערכת רצה על Replit Pro + Supabase (free/pro tier) + WhatsApp Cloud API. **אין שום מדד זמינות, ביצועים או טיפול בשגיאות מוגדר** — אין `/api/health` מעבר ל-`/api/status`, אין latency tracking, אין retry/backoff, אין dashboard של SLO. עבור בית מלאכה עם משתמש יחיד זה מקובל בהתחלה, אבל כשכל החלטת רכש מתבצעת דרך המערכת, **חייב להיות יעד מדיד של "מתי המערכת שבורה מספיק כדי להתקשר לקובי"**.

**המלצה מרכזית:** דף SLO אחד על A4, מבוסס על 4 מדדים בלבד, עם תקציב שגיאות חודשי ברור.

---

## 1. Uptime SLO — זמינות ריאלית על Replit Pro

### מציאות טכנית
- **Replit Pro:** מצהיר על "Always On" אבל בפועל יש cold-starts, rolling restarts, ותחזוקה של Replit עצמה. תצפיות קהילה: **~99.0%–99.3%** ריאליסטי.
- **Supabase Free:** SLA רשמי **אין**, תצפית ~99.5%. **Pro tier:** 99.9% SLA רשמי ($25/חודש).
- **Meta WhatsApp Cloud API:** 99.9% declared, בפועל 99.5%–99.9%.
- **תלות משולבת (multiplicative):** 0.993 × 0.995 × 0.995 = **~98.3%** uptime נומינלי לסוף-קצה.

### יעדי SLO מומלצים לבית מלאכה של איש אחד
| שכבה | SLO מומלץ | תקציב שגיאות/חודש | הערה |
|---|---|---|---|
| **API /api/status** | **99.0%** | ~7.2 שעות | ניתן להשגה, לא לחוץ |
| **API עסקי (RFQ/PO)** | **98.5%** | ~10.8 שעות | מחמיר מדי לא טוב — עדיף אמת שתשקף מציאות |
| **End-to-end (UI→WA)** | **97.0%** | ~21.6 שעות | ריאלי כי תלויה ב-Meta |

**אזהרה:** לא לקבוע **99.9%** — זה יחייב multi-region, fail-over, ותשלום ~$200-500/חודש. לא מתאים לבית מלאכה.

**פעולה:** Replit Pro מספיק כל עוד ה-SLO ≤99%. אם קובי רוצה 99.5%+, חובה Supabase Pro tier ($25/חודש).

---

## 2. Latency SLO — השהיית RFQ

### נתונים מהקוד
- `POST /api/rfq/send` (server.js:226) — פעולה כבדה: SELECT בקשה, SELECT ספקים, INSERT rfq, לולאה של ~5–15 שליחות WhatsApp (sequential!), INSERT recipients, UPDATE request, INSERT event, INSERT audit.
- כל `sendWhatsApp` (server.js:36) הוא HTTPS request חיצוני ל-graph.facebook.com — תלוי ברשת.
- **סריאליזציה קריטית:** הלולאה `for (const supplier of suppliers)` עם `await` בתוכה — כל קריאת WhatsApp חוסמת את הבאה.

### חישוב ריאליסטי
- Supabase query ~80-150ms (EU→Ireland region)
- WhatsApp API round-trip ~300-800ms לבקשה
- עם 10 ספקים סריאלית: **~3-8 שניות** (סביר)
- עם 15 ספקים ביום עומס: **עד 15 שניות**

### SLO מומלץ
| פעולה | p50 | p95 | p99 | הערה |
|---|---|---|---|---|
| `GET /api/status` | <200ms | <500ms | <1s | מדד בריאות |
| `GET /api/suppliers` | <300ms | <800ms | <2s | view query |
| `POST /api/rfq/send` (10 ספקים) | **<5s** | **<10s** | <20s | תלוי ברשת |
| `POST /api/quotes` | <400ms | <1s | <2s | ללא external |
| `POST /api/rfq/:id/decide` | <600ms | <1.5s | <3s | חישוב local |
| `POST /api/purchase-orders/:id/send` | <1s | <3s | <6s | WhatsApp יחיד |

**פעולה מומלצת:** הוסף middleware של `response-time` או timing hooks ב-server.js ולוג ל-`system_events` כשבקשה עוברת 2× מה-p95 target (early warning).

---

## 3. WhatsApp Delivery SLO

### ליקוי קריטי בקוד (server.js:310)
```javascript
await supabase.from('rfq_recipients').insert({
  delivered: sendResult.success,
  status: sendResult.success ? 'delivered' : 'sent',
});
```
**הבעיה:** `success: res.statusCode === 200` בלבד — זה מסמן רק **ACK של ה-API**, לא delivery אמיתי למכשיר הספק. WhatsApp מחזיר delivered/read דרך webhook נפרד של `statuses`. הקוד **לא מטפל בזה** (ראה webhook ב-server.js:876 — תופס רק `messages`, לא `statuses`).

### SLO מומלץ (אחרי תיקון)
| מדד | יעד | הגדרה |
|---|---|---|
| **PO accepted by WhatsApp API** | **99.5%** | HTTP 200 מ-Meta |
| **PO delivered to device (30s)** | **97.0%** | webhook status=delivered תוך 30 שניות |
| **PO read (24h)** | **80%** | webhook status=read |
| **RFQ broadcast success rate** | **95%** | לפחות 95% מהספקים ברשימה קיבלו |

**פעולה מומלצת:** הרחב את ה-webhook הקיים ב-server.js:876 כדי לתפוס `changes?.value?.statuses` ולעדכן את `rfq_recipients.delivered_at` / `read_at`. בלי זה, ה-SLO הוא "fictional".

---

## 4. Data Freshness SLO

### מצב נוכחי
- `setupguide` מזכיר ש"Dashboard auto-refresh" — בהנחה 30 שניות (לא נראה ב-server.js, כנראה ב-client JSX).
- `procurement_dashboard` view נקרא ב-`/api/status` (server.js:112) — כל בקשה = SELECT חי, אין caching.

### SLO מומלץ
| מדד | יעד | הערה |
|---|---|---|
| **Dashboard lag** (PO נוצרה → מופיעה בדשבורד) | **<60 שניות** | auto-refresh 30s + safety |
| **Quote → Decision availability** | **<5 שניות** | real-time של Supabase כבר ערב זאת |
| **Audit log lag** | **<2 שניות** | INSERT סינכרוני |
| **Analytics (/api/analytics/savings)** | **עד 5 דקות stale** | יכול להיות cached |

**פעולה:** אם קובי צריך "real-time true" (למשל על ה-TV במפעל), שקול להחליף polling ב-Supabase Realtime subscriptions. עבור desktop זה לא הכרחי.

---

## 5. Error Budget Concept

### עיקרון
אם SLO = 98.5% → **1.5% מותר לשגיאה** = בחודש של 30 יום × 24h = 720h → **10.8 שעות downtime מותרות**.

### חלוקה מעשית לבית מלאכה
| SLO | Budget חודשי | מה זה אומר למעשה |
|---|---|---|
| **99%** | 7.2 שעות | אירוע אחד של חצי יום = דגל צהוב |
| **98.5%** | 10.8 שעות | אירוע אחד של יום = מצב תקין-עוד |
| **97%** | ~21 שעות | יומיים downtime = מאוד עליז |

### RFQ Failure Budget (המדד החשוב ביותר)
מספר RFQ חודשי מוערך במפעל של קובי: **~20-40 RFQ/חודש** (בהנחה של 1-2 ביום).

**יעד מומלץ:**
- **≤ 2 RFQ כושלים לחלוטין/חודש** (0 מסרים יצאו)
- **≤ 5 RFQ חלקיים/חודש** (≥50% מהספקים קיבלו, פחות ממלוא הרשימה)
- **0 PO sends כושלים בלי התראה** (כל כישלון PO חייב להגיע ל-system_events עם severity=error)

**פעולה:** הוסף counter ב-`system_events` מסוג `rfq_failure` ו-`po_send_failure`, וצור query שבועי שמראה כמה נשרף מהתקציב.

---

## 6. Recovery Time SLO (RTO — משלים ל-Agent 19)

### מציאות טכנית
- **Replit restart:** ~30-90 שניות
- **Supabase restore מ-backup:** 15-60 דקות (Free tier אין point-in-time recovery!)
- **Redeploy מקוד (git → Replit):** ~5 דקות
- **WhatsApp token refresh:** ידני ~15 דקות

### SLO מומלץ
| תרחיש | RTO יעד | RPO יעד |
|---|---|---|
| **Server crash (Replit)** | **≤5 דקות** | 0 (DB ב-Supabase) |
| **Code bug → rollback** | **≤15 דקות** | 0 |
| **Supabase outage (Free)** | **עד 4 שעות** | עד 24h ✗ |
| **Supabase outage (Pro)** | **≤1 שעה** | ≤5 דקות |
| **WhatsApp token expired** | **≤30 דקות** | 0 |

**המלצה נחרצת:** אם SLO של 98.5%+ נדרש — Supabase Pro חובה (PITR = Point-in-Time Recovery).

---

## 7. Customer-Impacting Metrics — RFQ-to-PO Cycle Time

זהו ה-**metric העסקי האמיתי** — לא technical uptime אלא "כמה זמן עובר מרגע שקובי מבקש חומר עד שיש לו PO חתום".

### נתונים מהקוד
- הקוד כבר מודד `response_window_hours` (ברירת מחדל 24h) ב-RFQ
- `purchase_orders.expected_delivery` מחושב מ-`delivery_days`

### SLO עסקי מומלץ
| שלב | יעד | נוכחי (מוערך) |
|---|---|---|
| **RFQ sent → first quote received** | <6h (p75) | לא נמדד |
| **RFQ sent → decision made** | <24h (p90) | לא נמדד |
| **Decision → PO approved** | <2h | לא נמדד |
| **PO approved → PO sent to supplier** | <10 דקות | לא נמדד |
| **End-to-end (request → PO sent)** | **<48 שעות (p90)** | לא נמדד |

**פעולה:** כל החלטה ב-`procurement_decisions` כבר שומרת `decided_at` — הוסף view בשם `rfq_cycle_time_report` שמחשב את הפער בין `rfqs.sent_at` ל-`procurement_decisions.decided_at` לכל רשומה.

---

## 8. SLA vs SLO — הבחנה קריטית

| מושג | משמעות | במקרה של קובי |
|---|---|---|
| **SLO** (Objective) | יעד פנימי, מדיד, ניתן לשינוי | "99% uptime" — מה אני מנסה להשיג |
| **SLA** (Agreement) | חוזה עם קונסקוונס (קנסות, החזרים) | **אין** — המערכת פנימית, אין לקוח חיצוני |
| **SLI** (Indicator) | המדידה עצמה | % uptime, p95 latency, etc. |

### לספקים (supplier-facing)
הקוד שולח RFQ ו-PO לספקים דרך WhatsApp. האם יש כאן התחייבות? **לא פורמלית.** אבל יש ציפייה עסקית:
- "אם קובי שולח RFQ בשעה 10:00 בבוקר — הספק מקבל אותו תוך 5 דקות"
- "אם קובי מאשר PO — הספק מקבל אישור תוך 10 דקות"

**המלצה:** להגדיר **"Supplier Communication SLO"** פנימי (לא SLA, כי אין חוזה), ולתת אותו לספקים כצ'ופר: "אנחנו מתחייבים שכל הודעה תגיע תוך X דקות". זה בונה אמון.

---

## 9. Dependency SLOs

| תלות | SLA רשמי | הערה | פעולה |
|---|---|---|---|
| **Supabase Free** | אין | community best-effort | **שדרג ל-Pro בעת שהעסק יגדל** |
| **Supabase Pro** | **99.9%** | $25/חודש | כדאי אם SLO ≥99.5% |
| **WhatsApp Cloud API** | **99.9%** (declared) | בפועל 99.5%-99.9% | אין מה לעשות — זה Meta |
| **Replit Pro** | **"Always On"** (לא SLA) | ~99.0% ריאלי | אין יכולת שדרוג רציני |
| **Twilio (SMS fallback)** | **99.95%** | רק אם מוגדר (לא חובה) | **טוב שיש fallback בקוד!** |

**תובנה:** הקוד (server.js:71) כבר מכיל `sendSMS` כ-fallback ל-Twilio. **זה נכס תפעולי!** אם WhatsApp down, ניתן להעביר RFQ ל-SMS. **הוספה נדרשת:** לוגיקה של "if WhatsApp fails → auto-fallback to SMS" (כרגע רק `preferred_channel` קובע — אין escalation).

---

## 10. Reporting Cadence — סקירת הפרות SLO

### תדירות מומלצת לבית מלאכה בודד
| תדירות | מה | איך |
|---|---|---|
| **Realtime (אוטומטי)** | חריגה של p95 latency × 2 | system_events → WhatsApp לקובי |
| **יומי (בוקר)** | כמה RFQ נכשלו אתמול | view → אימייל/WhatsApp בבוקר |
| **שבועי (יום ראשון)** | סיכום error budget + SLO | דף A4 מודפס |
| **חודשי** | Cycle time + Trend | דשבורד Supabase |
| **רבעוני** | סקירה אסטרטגית — האם ה-SLO ריאלי? | החלטה על שדרוג תשתית |

**פעולה טכנית:**
```sql
CREATE VIEW slo_weekly_summary AS
SELECT
  date_trunc('week', created_at) AS week,
  COUNT(*) FILTER (WHERE type='rfq_failure') AS rfq_failures,
  COUNT(*) FILTER (WHERE type='po_send_failure') AS po_failures,
  AVG(CASE WHEN data->>'duration_ms' IS NOT NULL
           THEN (data->>'duration_ms')::int END) AS avg_latency_ms
FROM system_events
WHERE created_at > now() - interval '4 weeks'
GROUP BY 1;
```

---

## דף ה-SLO של קובי (One-Pager)

```
══════════════════════════════════════════════════
  ONYX PROCUREMENT — SLO SHEET (A4, v1.0)
  טכנו כל עוזי בע"מ | בית מלאכה לעיבוד מתכת
══════════════════════════════════════════════════

4 SLO בלבד:

┌─────────────────────────────────────────────┐
│ SLO 1: זמינות API עסקי                     │
│ יעד: 98.5%/חודש                            │
│ תקציב: 10.8 שעות downtime/חודש            │
│ מדידה: GET /api/status מ-2 מקומות         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ SLO 2: שליחת RFQ מוצלחת                   │
│ יעד: ≥95% מהספקים קיבלו הודעה            │
│ תקציב: 2 RFQ כושלים מלאים/חודש           │
│ מדידה: rfq_recipients.delivered = true    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ SLO 3: מהירות סיבוב עסקית                 │
│ יעד: End-to-end Request→PO sent < 48h     │
│     ב-90% מהמקרים                          │
│ מדידה: procurement_decisions.decided_at    │
│         - purchase_requests.created_at     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ SLO 4: הגעת PO לספק                       │
│ יעד: 97% של PO מגיעים תוך 30 שניות       │
│ תקציב: 3 PO כושלים/חודש                   │
│ מדידה: WhatsApp webhook status='delivered'│
│         (חובה: לתקן את webhook handler!)  │
└─────────────────────────────────────────────┘

═══════ אסקלציה (מי לפנות אליו) ═══════
• חריגה 1×: רשומה ב-system_events
• חריגה 2× ברצף: WhatsApp לקובי
• תקציב נשרף >50%: סקירה שבועית חובה
• תקציב נגמר: עצור deploys חדשים עד
  שיהיה post-mortem

═══════ עלות SLO מחמיר יותר ═══════
אם תרצה 99.5%+: Supabase Pro ($25/חודש)
אם תרצה 99.9%+: multi-region (~$500/חודש)
    — לא מומלץ לבית מלאכה יחיד
══════════════════════════════════════════════════
```

---

## פערים פתוחים (Gap Analysis)

| # | פער | חומרה | פעולה מומלצת |
|---|---|---|---|
| G1 | אין measurement של latency — אין p50/p95 | **גבוהה** | הוסף middleware timing → system_events |
| G2 | אין real-time monitoring של WhatsApp delivery status | **קריטית** | הרחב webhook ב-server.js:876 ל-statuses |
| G3 | אין `/health` endpoint נפרד (רק `/status` שמכיל DB query) | **בינונית** | הוסף `/api/health` רזה בלי DB |
| G4 | אין retry/backoff ב-sendWhatsApp | **גבוהה** | wrapping ב-p-retry או exponential backoff ידני |
| G5 | `sendWhatsApp` סריאלי בלולאה — הופך את p95 לעשרות שניות | **גבוהה** | `Promise.all` עם concurrency limit (3-5) |
| G6 | אין alerting על כישלון PO send | **קריטית** | `system_events` עם severity=error + WhatsApp self-notify |
| G7 | אין auto-fallback WhatsApp→SMS | **בינונית** | הוסף בתוך הלולאה ב-server.js:294 |
| G8 | `procurement_dashboard` view נקרא על כל `/api/status` (server.js:112) | **נמוכה** | cache של 15 שניות |
| G9 | אין SLO של Supabase לצד השרת — אם ה-DB איטי, לא תדע | **בינונית** | מדידת query duration → metrics |
| G10 | `/api/rfq/:id/decide` לא מטפל במצב של 0 quotes (מחזיר 400, אבל ללא event) | **נמוכה** | log ל-system_events למעקב cycle time |

---

## סיכום

המערכת של קובי **פונקציונלית** אבל **עיוורת operationally** — אין אף מדד של בריאות מעבר ל-"האם הפורט פתוח?". עבור בית מלאכה יחיד זה עובד כל עוד הכל תקין, אבל ברגע שיש אירוע, אין דרך לדעת:
1. האם זה WhatsApp, Supabase, או הקוד
2. כמה זמן המערכת שבורה
3. כמה RFQ פוספסו השבוע

**ההמלצה העיקרית:** להטמיע את דף ה-SLO החד-עמודי למעלה, להוסיף **4 view-ים ב-Supabase** ו-**2 counters במערכת אירועים**, ולהסתפק בכך. לא לנסות לחקות Google SRE — זה overkill לבית מלאכה.

**Priority 1:** תיקון WhatsApp delivery tracking (G2) — בלי זה, SLO #4 הוא שקר.
**Priority 2:** Latency middleware (G1) — בלי זה, אין דרך למדוד p95.
**Priority 3:** Alerting על PO send failure (G6) — בלי זה, הודעות נעלמות בשקט.

---
**Agent #23 | Static Analysis Only | לא בוצעה בדיקת runtime**
