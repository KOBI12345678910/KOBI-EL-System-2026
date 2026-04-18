# QA Agent #22 — Incident Response Playbook (ניתוח סטטי)

**תאריך:** 2026-04-11
**מימד:** Incident Response Playbook
**שיטה:** ניתוח סטטי של `SETUP-GUIDE-STEP-BY-STEP.md`, `server.js`, וסריקה של כל ה-`*.md` לאיתור "incident/outage/playbook/runbook/rollback/postmortem"
**הקשר תפעולי:** מערכת חד-מפעיל (Kobi בלבד) המריצה Replit + Supabase + WhatsApp Business API

---

## 0. תקציר מנהלים

**קיים Playbook?** לא. אפס. בדיקת Grep עם keywords incident/outage/playbook/runbook/postmortem/escalation על כל ה-repo של onyx-procurement החזירה **0 hits** בתיעוד. המילה היחידה שמופיעה היא `rollback` — ורק בהקשר של באגי UI שנתגלו ב-QA-AGENT-11 (שלא מהוות playbook אלא תיאור באג). המילה `severity` קיימת כ-CHECK constraint ב-`system_events` (`info/warning/error/critical`) — אבל אין שום התייחסות מה עושים כשיש event ב-severity "critical".

**סיכון יסודי:** המערכת נמצאת כרגע במצב של "תקלה = קובי יושב ומתעצבן מול הלוג". אין שום מסמך שאומר:
- מה לעשות כשה-API לא עונה
- מה לעשות כש-PO לא מגיע לספק
- איך לחזור אחורה מקומיט רע ב-Replit
- למי לפנות (יש רק אחד — קובי — וזה הכל)
- מה עושים אם קובי חולה/נסיעה/חתונה (SPOF מוחלט)

**השפעה עסקית:** תקלה במחצית היום ביום עבודה (לדוגמה שליחת PO לספק → ספק לא מקבל → הזמנת ברזל נדחית ב-3 ימים → פרויקט של ריבל מתעכב) — בלי playbook, זמן ה-MTTR יהיה פונקציה של יכולת הדיבאג של קובי באותו רגע. לא סבלני, לא צפוי, לא ניתן לחישוב.

---

## 1. ממצאי חקירה — 10 שאלות

### IR-01 · האם יש Playbook כתוב?
**חומרה:** 🔴 קריטי
**ממצא:** לא קיים. `SETUP-GUIDE-STEP-BY-STEP.md` מכיל רק טבלת "אם משהו לא עובד" בת **6 שורות** (שורות 144–152) שמכסה שגיאות התקנה ראשוניות — לא תקלות ייצור. הטבלה הזאת אינה playbook — היא FAQ התקנה.

הטבלה הזו מסבירה רק:
- שגיאות schema missing
- `.env` לא נטען
- `npm install` כשל
- port תפוס
- דף ריק
- dashboard→server disconnect
- F-02 באג ידוע של "sent" שקרי

**חסר לגמרי:**
- שום הפניה ל-playbook רחב יותר
- שום מסמך נפרד בשם `INCIDENT-PLAYBOOK.md` / `RUNBOOK.md` / `INCIDENT-RESPONSE.md`
- שום התייחסות בקומנטים של `server.js` ל"מה לעשות אם…"

### IR-02 · סיווג חומרה (SEV1/SEV2/SEV3)
**חומרה:** 🔴 קריטי
**ממצא:** **לא קיים**.

היחיד שקיים הוא שדה `severity` בטבלת `system_events` (schema שורה 358):
```sql
severity TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical'))
```
**אבל:** אין שום תיעוד על מה נחשב `warning` vs `error` vs `critical`. אין שום טריגר/alert על `critical`. קובי לא יראה שום push notification אם משהו נכנס ל-`critical`. שורה 890 (`severity: 'info'`) הוא הערך היחיד שהקוד בפועל מגדיר — אפילו באג קריטי נכנס כ-`info`.

**בלי הגדרה ברורה של SEV1/2/3, אי אפשר:**
- לקבוע זמן תגובה
- לקבוע מתי לעצור הכל ומתי להמתין
- להחליט אם מותר לדחות תיקון לאחרי סוף היום

### IR-03 · צעדי תגובה ראשונים ל-"PO לא נמסר"
**חומרה:** 🟠 גבוה
**ממצא:** אין נוהל. יש רק שורה 152 ב-SETUP-GUIDE:

> "שליחת WhatsApp 'נכשלה' אבל PO מסומן 'sent' — באג ידוע F-02 — עד לתיקון, בדוק ב-audit log אם באמת נשלח"

זה לא נוהל. זה הערת שוליים. אין:
1. איך לבדוק audit log (איזה query, איזה URL)
2. מה לעשות כשמתגלה שלא נשלח
3. איך לשלוח ידנית מחדש בלי לייצר PO כפול
4. למי להודיע (לקובי? לספק?)
5. מה רושמים כדי שהפעם הבאה תזוהה מהר יותר

**שחזור הנוהל שחסר (מה שקובי יעשה בפועל אם יקרה היום):**
1. יפתח WhatsApp Business ויבדוק ב-outgoing אם ההודעה יצאה
2. אם לא — יצלצל לספק
3. יעתיק ידנית את נוסח ההזמנה מה-dashboard
4. ישלח ב-WhatsApp רגיל מהטלפון שלו
5. יצטרך לשנות ידנית `status` של ה-PO ב-Supabase
6. לא ירשום כלום ב-audit log (כי אין UI לזה)

**זה 6 צעדים שאף אחד מהם לא מתועד.**

### IR-04 · נוהל Rollback ב-Replit
**חומרה:** 🔴 קריטי
**ממצא:** לא קיים. `SETUP-GUIDE` לא מזכיר git כלל. Replit שומר history אוטומטית (version history מובנה) אבל:
- אין תיעוד כיצד להשתמש ב-`git checkout` מה-Replit shell
- אין חסימת deploy לקומיטים שבורים
- אין `main` vs `dev` branch strategy
- אין "זמן המתנה" לפני deploy
- אין tag לקומיט "stable"

**מה יקרה כשקובי יעשה push של באג:**
- Replit ירוץ מחדש אוטומטית
- השרת ימות (או גרוע — יעלה עם שגיאה שקטה)
- Dashboard יראה status error
- קובי יצטרך להבין לבד: `git log`, `git checkout HEAD~1`, `npm start`
- אם קובי לא יודע את זה בעל-פה — המערכת תישאר down

**המלצה:** חובה לתעד "rollback ב-3 צעדים" בדף ה-playbook.

### IR-05 · תבנית תקשורת (לספקים/PMs)
**חומרה:** 🟡 בינוני
**ממצא:** אין. אם PO לא הגיע, קובי לא יודע מה לכתוב בעברית לספק ("אני מתנצל" / "הייתה בעיה טכנית" / "נא לאשר קבלה"). אין draft שאפשר להעתיק. אין רשימה של "אל תרשמו את זה" (למשל: אל תכתב "באג" — כתוב "עיכוב טכני").

**המלצה:** 3 templates בעברית של 2–3 שורות כל אחד:
- "PO לא הגיע — אישור ידני"
- "RFQ נשלח בטעות — בקשת ביטול"
- "המערכת זמנית לא זמינה — חזרה משוערת"

### IR-06 · תבנית Postmortem
**חומרה:** 🟡 בינוני
**ממצא:** לא קיים. אין תבנית "מה קרה / למה / איך נמנע בעתיד". אין תיקייה `incidents/` או `postmortems/`. אין לוגיקה של "אחרי תקלה — להקדיש 15 דק' לכתיבה". במצב חד-מפעיל, זה הכרחי **כפליים** — כי אין צוות שיזכור, יש רק קובי של היום.

**בלי postmortem כתוב, קובי יעבור את אותה תקלה 3 פעמים לפני שיבין שיש pattern.**

תרבות "blameless review" לא רלוונטית (אין צוות להאשים) — אבל "learning review" כן רלוונטית ביותר לחד-מפעיל.

### IR-07 · SPOF של קובי — מה אם הוא לא זמין?
**חומרה:** 🔴 קריטי (Business continuity)
**ממצא:** אין שום buddy, אין backup operator, אין "knowledge handoff" לאף אחד. קובי הוא **Single Point of Failure מוחלט**:

- סיסמאות ב-Replit → רק לקובי
- מפתח Supabase → רק ב-`.env` אצל קובי
- WhatsApp Business verify token → בראש של קובי
- הבנה של ה-schema → רק קובי ראה אותו
- DBA → קובי
- DevOps → קובי
- Support → קובי

**תרחיש:** קובי נכנס לבית חולים ל-3 ימים. הספק גליל מתכת מתקשר "איפה התשלום על PO-12?". אין מי שיענה. אין מי שיוכל לראות את ה-PO. אין מי שיוכל להודיע לספק שיחכה.

**המלצה מינימלית:**
- תיקייה/מסמך "אצלי בכספת" (פיזית) עם: SUPABASE_URL, SUPABASE_ANON_KEY, WA_TOKEN, סיסמת Replit, הפניה ל-playbook
- פתק למישהו קרוב (רעיה/בן משפחה) שיודע איך לפתוח את הכספת ולקרוא למי (`contact list: ספקים פעילים`)
- אפילו לא buddy טכני — **emergency read-only access**: מישהו שיכול לפתוח את dashboard ולראות "יש 3 PO פתוחים, להגיד לספקים שיחכו שבוע"

### IR-08 · עץ Escalation
**חומרה:** 🔴 קריטי
**ממצא:** לא קיים. אין עץ בכלל.

בארגון רגיל יש: Level 1 → Level 2 → On-call → Manager → VP.

אצל קובי יש: **קובי.**

אין:
- מספר חירום של מישהו ב-Supabase (יש support — אבל קובי לא מכיר)
- מספר חירום של Meta/WhatsApp Business (API support)
- מספר חירום של Replit Pro (יש! חלק מהחבילה Pro)
- רשימת ספקים "תתקשר במקרה של תקלה" (מי הספק החלופי הכי קרוב?)

**המלצה:** טבלה של 5 שורות ב-playbook:
| בעיה | למי לפנות | איך | שעות |
|------|-----------|-----|------|
| Supabase down | Supabase status page | https://status.supabase.com | 24/7 |
| Replit down | Replit Pro support | chat in replit.com | 24/7 |
| WhatsApp API broken | Meta Business support | business.facebook.com | business hours |
| ספק לא קיבל PO | ספק חלופי (גליל מתכת) | 054-XXX-XXXX | ימים א-ה 7-17 |
| קובי לא זמין | אין (SPOF — ראה IR-07) | — | — |

### IR-09 · פרוטוקול After-hours
**חומרה:** 🟠 גבוה
**ממצא:** לא קיים. המערכת רצה 24/7 (Replit Pro), אבל קובי לא זמין 24/7. אם משהו נופל בלילה:
- אין alerting (אין push, אין SMS, אין email)
- אין monitoring (אין ping/uptime check)
- אין טיפול אוטומטי (אין health-check endpoint שמחזיר שירות)

קובי יגלה את התקלה **רק כשהוא יפתח את הדשבורד בבוקר** — לפעמים 12 שעות אחרי שהמערכת מתה.

**Impact במקרה קצה:** ספק שמנסה לשלוח WhatsApp תגובה להצעת מחיר בלילה — ההודעה תיכנס ל-webhook, webhook ייכשל (אם השרת מת), ההודעה **תאבד** (WhatsApp מוחק אחרי 24 שעות של 5xx). קובי מפסיד הצעה.

**המלצת מינימום:**
- UptimeRobot חינם ל-`/api/status` כל 5 דקות
- Slack/SMS notification אם down > 10 דקות
- Protocol קצר: "אם אני ער ורואה — אני מתקן / אם לא — מוסר לבוקר"

### IR-10 · Runbooks ספציפיים לבאגים ידועים
**חומרה:** 🟠 גבוה
**ממצא:** אין. יש שני באגים ידועים וחמורים, שניהם מופיעים ב-QA-WAVE1-DIRECT-FINDINGS, אבל אין להם runbook כלל:

**F-02 — "PO status=sent גם כשנכשלה שליחה" (`server.js:661-671`):**
מה שחסר:
- SQL query לזיהוי PO-ים שהם 'sent' אבל WhatsApp לא באמת יצא
  ```sql
  SELECT po.id, po.supplier_name, po.total, po.sent_at
  FROM purchase_orders po
  LEFT JOIN system_events e
    ON e.source='whatsapp' AND e.data->>'po_id' = po.id::text
  WHERE po.status='sent'
    AND po.sent_at > now() - interval '24 hours'
    AND e.id IS NULL;
  ```
- נוהל שיקוף עם WhatsApp Business inbox (לבדוק ידנית)
- נוהל התקשרות לספק ("שלום, רק לוודא שקיבלת את ההזמנה")
- נוהל re-send (לא ליצור PO חדש! לשלוח שוב את אותו PO)

**B-04 — "WhatsApp Webhook ללא אימות חתימה" (`server.js:876-901`):**
מה שחסר:
- איך לזהות זיוף: לסמן ב-`system_events.data` את כל ההודעות ולסנן לפי pattern
  ```sql
  SELECT * FROM system_events
  WHERE type='whatsapp_incoming'
  AND (data->>'from' NOT LIKE '972%')
  AND created_at > now() - interval '7 days';
  ```
- נוהל ניקוי: `DELETE FROM system_events WHERE id IN (…)`
- נוהל revoke: shutdown webhook URL עד לתיקון חתימה
- נוהל rotation של `WHATSAPP_VERIFY_TOKEN`

**שום אחד משני ה-runbooks לא קיים.**

---

## 2. מה כן קיים (נקודות זכות)

- `audit_log` בטבלה (schema שורה 377) — תומך ב-postmortem אם מישהו יחפש.
- `system_events` עם `severity` — תשתית קיימת לסיווג חומרה.
- SETUP-GUIDE מודע ל-F-02 (שורה 152) — לפחות יש הכרה שהבעיה קיימת.
- `.env.example` קיים (לפי QA-WAVE1) — מאפשר שחזור תצורה.
- Replit version history מובנה — גם אם לא מתועד, ניתן לגישה.

---

## 3. המלצה — Playbook מינימלי של עמוד אחד

**קובץ חדש:** `INCIDENT-PLAYBOOK.md` (עברית, RTL, אחד)

```markdown
# 🚨 Playbook — תקלות במערכת ONYX

## 1. סיווג חומרה (30 שניות להחליט)
| רמה | דוגמה | זמן תגובה | מי מטפל |
|-----|-------|-----------|---------|
| SEV1 — עוצר עסק | Supabase down / שרת לא עולה / PO לא נשלחים לאף ספק | מיידי | קובי — הכל נעצר |
| SEV2 — באג חלקי | PO בודד לא נשלח / ספק אחד לא מקבל / חישוב מחיר שגוי | <2 שעות | קובי — ימשיך שוטף |
| SEV3 — קוסמטי | צבע לא נכון / טקסט חסר / גרף לא טעון | <יום עבודה | לרשום ולהמשיך |

## 2. תגובה ראשונה (2 דקות)
1. פתח `/api/status` — האם חי? אם לא → SEV1
2. פתח `audit_log` — מה השינוי האחרון?
3. פתח `system_events` לפי `severity=error` 24 שעות אחרונות
4. **הערה:** אם SEV1 — שלח לספקים פעילים WhatsApp template #1 ("עיכוב טכני, עד השעה X")

## 3. Rollback ב-Replit (3 צעדים)
```bash
# ב-Shell של Replit
git log --oneline -10        # מצא את הקומיט האחרון הטוב
git checkout <SHA>            # חזור אליו
npm start                     # הפעל מחדש
```
**אזהרה:** אל תעשה `git reset --hard` — אתה עובד לבד, אין מי שייתן לך גיבוי.

## 4. Runbooks לבאגים ידועים

### F-02 — PO 'sent' שקרי
```sql
SELECT id, supplier_name, sent_at FROM purchase_orders
WHERE status='sent' AND sent_at > now() - interval '1 day';
```
לכל PO — פתח WhatsApp Business → בדוק אם ההודעה יצאה. אם לא: `UPDATE purchase_orders SET status='approved' WHERE id=?;` ושלח ידנית.

### B-04 — Webhook WhatsApp מזויף
```sql
DELETE FROM system_events
WHERE type='whatsapp_incoming'
  AND data->>'from' NOT LIKE '972%'
  AND created_at > now() - interval '7 days';
```

## 5. Templates תקשורת לספקים (העתק)
**#1 — עיכוב טכני:**
> שלום, מתנצל — יש לנו עיכוב טכני קצר. ההזמנה תישלח מחדש עד השעה [X]. תודה על הסבלנות — קובי, טכנו כל עוזי.

**#2 — בקשת ביטול RFQ בטעות:**
> שלום, RFQ שנשלח היום [תאריך/שעה] נשלח בטעות. אין צורך להשיב. מתנצל — קובי.

**#3 — אישור ידני:**
> שלום, רציתי רק לוודא שקיבלת את הזמנת רכש מס' [PO#]. אם לא — אנא עדכן.

## 6. Postmortem Template (15 דק' אחרי תקלה)
- **מה קרה:** (משפט אחד)
- **מתי:** (YYYY-MM-DD HH:MM)
- **איך גילינו:** (דשבורד / ספק התקשר / ...)
- **ההשפעה:** (כמה PO / כמה ספקים / כמה ₪)
- **הסיבה:** (root cause — לא symptom)
- **תיקון מיידי:** (מה עשיתי)
- **תיקון קבוע:** (מה צריך לעשות ב-commit)
- **מה ללמוד:** (ומה להוסיף ל-playbook הזה)

שמור ב: `incidents/YYYY-MM-DD-שם-תקלה.md`

## 7. עץ Escalation
| בעיה | למי | איך |
|------|-----|-----|
| Supabase down | https://status.supabase.com | web |
| Replit down | Replit Pro chat | replit.com |
| WhatsApp API | Meta Business Support | business.facebook.com |
| ספק לא קיבל | ספק חלופי (ראה רשימה) | WhatsApp |
| קובי לא זמין | [contact buddy] | טלפון בכספת |

## 8. After-hours
- UptimeRobot → אם down > 10 דק' → SMS לקובי
- אם קובי ישן → טיפול בבוקר (SEV1 בלבד שלעצור)
- WhatsApp webhook down בלילה = הודעות אבודות — להתקשר בבוקר לספקים שחסרו

## 9. SPOF — חירום ללא קובי
בכספת הפיזית:
- סיסמת Replit
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- `WHATSAPP_TOKEN` + `WHATSAPP_VERIFY_TOKEN`
- רשימת 5 ספקים פעילים + טלפון
- הוראות read-only ל-buddy: "איך לפתוח dashboard, איך לראות PO פתוחים, מה לומר לספק"
```

**עמוד אחד. 9 סעיפים. כל סעיף אחד במקום אחד. קובי יכול להדפיס ולתלות ליד המסך.**

---

## 4. סיכום — טבלת ממצאים

| ID | תיאור | חומרה | המלצה |
|----|-------|-------|--------|
| IR-01 | אין Playbook כתוב | 🔴 קריטי | ליצור `INCIDENT-PLAYBOOK.md` |
| IR-02 | אין סיווג SEV1/2/3 | 🔴 קריטי | סעיף 1 בעמוד הנ"ל |
| IR-03 | אין נוהל "PO לא נמסר" | 🟠 גבוה | סעיף 4 — F-02 runbook |
| IR-04 | אין נוהל rollback ב-Replit | 🔴 קריטי | סעיף 3 — 3 שורות bash |
| IR-05 | אין templates לספקים | 🟡 בינוני | סעיף 5 — 3 templates |
| IR-06 | אין tempalte postmortem | 🟡 בינוני | סעיף 6 + תיקיית `incidents/` |
| IR-07 | SPOF מוחלט של קובי | 🔴 קריטי | סעיף 9 — כספת פיזית |
| IR-08 | אין עץ escalation | 🔴 קריטי | סעיף 7 — 5 שורות |
| IR-09 | אין פרוטוקול after-hours | 🟠 גבוה | סעיף 8 + UptimeRobot |
| IR-10 | אין runbooks ל-F-02/B-04 | 🟠 גבוה | סעיף 4 — SQL queries מוכנים |

**סה"כ:** 10 ממצאים — 4 קריטיים, 3 גבוהים, 2 בינוניים.

**אף אחד מאלה לא מצריך שינוי קוד — רק יצירת קובץ מסמך אחד.**
ROI של כתיבת playbook חד-פעמי לעומת זמן תקלה הוא סדרי גודל.

---

## 5. עלות יחסית — למה Playbook הוא הבחירה הנכונה

מערכת חד-מפעיל עם 13 ספקים + ~100 מוצרים + חיבור WhatsApp בייצור **תפעולית בפועל** (לא prototype). כל שעת downtime = שעה של קובי לא יכול לעבוד. בלי playbook, 15 תקלות בשנה × שעתיים MTTR כל אחת = 30 שעות עבודה אבודות. **עם playbook של עמוד אחד**, אותן תקלות = 15 תקלות × 20 דקות MTTR = 5 שעות. **חיסכון: 25 שעות בשנה** מקובץ markdown אחד.

Playbook הוא לא bureaucracy — זה ה-ROI הגבוה ביותר לפעולת Ops שאפשר לעשות במערכת כזו, וזה היחיד שחסר לגמרי.

---

**סוף דוח QA Agent #22**
