# QA Agent #44 — Email Deliverability (SPF / DKIM / DMARC) — Forward Looking

**פרויקט:** onyx-procurement (Techno Kol Uzi)
**תאריך הניתוח:** 2026-04-11
**סוג הסוכן:** ניתוח סטטי בלבד (Static Analysis)
**ממד הבדיקה:** יכולת שליחת אימייל ו-Deliverability — מבט צופה פני עתיד
**היקף:** מצב נוכחי (אין אימייל) + תכנון מינימלי להוספה עתידית

> **הקשר:** המערכת כרגע משתמשת ב-WhatsApp Cloud API כערוץ יחיד. ייתכן שיידרש אימייל כ-fallback (כשל WhatsApp) או עבור ספקים בינלאומיים (Foshan / סין) שלא משתמשים ב-WhatsApp Business.

---

## 1. מצב קיים — האם יש שליחת אימייל?

### 1.1 package.json (4 תלויות בלבד)

```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

**ממצא:** **אפס תלויות שקשורות לשליחת אימייל.** אין `nodemailer`, אין `@sendgrid/mail`, אין `mailgun-js`, אין `aws-sdk` / `@aws-sdk/client-ses`, אין `postmark`, אין `resend`.

### 1.2 server.js (934 שורות) — grep ל-nodemailer/sendgrid/mailgun/ses/postmark/smtp

**תוצאה:** **0 התאמות.** אין שום מודול ייבוא של שירות אימייל, אין `transporter.sendMail(...)`, אין `sgMail.send(...)`.

### 1.3 ההתייחסות היחידה לאימייל ב-server.js

**שורה 241:**
```js
.select('supplier_id, suppliers(id, name, phone, whatsapp, email, preferred_channel, active)')
```

העמודה `suppliers.email` **נקראת** אל זיכרון (SELECT) — אבל לעולם **אינה בשימוש** לשליחה. זה שדה metadata פסיבי בלבד. אין בקוד שום ענף שמטפל ב-`channel === 'email'` (שורות 295–298 מטפלות רק ב-`whatsapp` ו-`sms`).

**מסקנה:** onyx-procurement היום לא שולח אימייל כלל. יש כוונה ארכיטקטונית (העמודה קיימת, `preferred_channel` קיים) אך אין מימוש.

### 1.4 התייחסות עקיפה ב-QA-AGENT-19 (DR Plan)

שורה 121: `WhatsApp fail → SMS (Twilio) → Email (SendGrid) → log to audit + alert`

→ אימייל כבר **מתוכנן ככלי fallback בשרשרת DR**, אבל לא מיושם. כלומר Agent 44 עוסק בדיוק בפער הזה: לכשיחליטו ליישם, מה חובה לעשות כדי שההודעה **תגיע** ולא תיפול ל-spam.

---

## 2. סקירת ספקי אימייל מומלצים (2026, השוואה לעלות Agent 24)

### 2.1 טבלת השוואה — 3 הספקים שמתאימים ל-volume של onyx-procurement

נפח צפוי (לפי Agent 24): **~270 הודעות utility/חודש** כ-fallback + ~20 הודעות bounce/adminstrative → **~300 אימיילים/חודש** בשיא.

| ספק | מחיר נקודת כניסה | התאמה | יתרונות עיקריים | חסרונות |
|---|---|---|---|---|
| **SendGrid (Essentials)** | $19.95/חודש — עד 50,000 emails | **over-provisioned** לנפח שלנו | מותג אמין, SPF/DKIM אוטומטיים, REST API פשוט, תיעוד נרחב, שמור ב-QA-19 | יקר יחסית, מינימום $19.95 |
| **SendGrid (Free)** | 100 emails/day חינם (3,000/חודש) | **מושלם** ל-300/חודש | **$0/חודש**, SPF/DKIM מלאים, IP משותף | IP משותף → reputation תלוי בשולחים אחרים, מוגבל ל-100/יום (סיכון ב-burst) |
| **Postmark** | $15/חודש — 10,000 emails | מתאים | **הכי טוב ל-transactional deliverability** (99%+ inbox rate), לוגים מפורטים, ממשק מצוין | יקר יחסית לנפח |
| **Amazon SES** | $0.10 לכל 1,000 emails | **הכי זול** — ~$0.03/חודש! | עלות זניחה, מתכוון לנפח | צריך verification של דומיין, DKIM ידני, `aws-sdk` משקל ~3 MB, בתחילה sandbox mode |
| **Resend** | 3,000 emails/חודש חינם; $20 אחרי | מתאים ומודרני | API נקי, React email templates, dashboard מודרני | חדש יחסית (2023), reputation פחות מוכח ל-IL |
| **Mailgun (Flex)** | $15/חודש — 10,000 emails + $0.80/1000 | מתאים | deliverability טוב, EU region אופציונלי | ממשק פחות ידידותי |

### 2.2 המלצה לספק

**עדיפות ראשונה: SendGrid Free (3,000/חודש)**
- **עלות: $0/חודש** — התאמה מושלמת לנפח 300/חודש עם כרית גדולה
- תואם לתכנית DR שכבר הוזכרה ב-QA-19
- SPF/DKIM ניתנים קדימה ע"י SendGrid — קל להגדיר
- אם/כאשר הנפח יעלה — upgrade ל-Essentials ב-$19.95

**עדיפות שנייה (אם נדרשת שליטה מלאה או reputation עצמאי): Amazon SES**
- $0.03–$0.10 למאה אימיילים
- דורש יותר עבודת הגדרה (יציאה מ-sandbox, verification)
- מומלץ רק אם הנפח חוצה 3,000/חודש

**חשוב:** **אל תקנה Postmark / Mailgun** בנפחים הנוכחיים — הם ב-over-provision וגם ה-deliverability של SendGrid Free מספיק לספקים עסקיים (Foshan, Techno Kol).

### 2.3 עדכון תקציב מול Agent 24

Agent 24 חישב $32.15/חודש סה"כ. הוספת אימייל כ-fallback:

| רכיב | תוספת חודשית |
|---|---|
| SendGrid Free | **$0.00** |
| SPF/DKIM/DMARC DNS records | $0 (חלק מהדומיין הקיים) |
| Reverse DNS (PTR) | $0 בהוסטינג מנוהל |
| **סה"כ תוספת:** | **$0.00** |

**השפעה על תקציב כולל:** אפסית. נכנס תחת "0.10/חודש" של רכיבים זניחים בטבלת Agent 24.

---

## 3. SPF — Sender Policy Framework

### 3.1 מה זה ולמה חיוני

SPF מונע זיוף של כתובת `From`. בלי SPF רשומה תקינה, רוב ה-mail servers המודרניים (Gmail, Outlook, ProtonMail — וחשוב ב-**חיוניות** — Gmail של ספקים חיצוניים) יזרקו את ההודעה ל-spam או ידחו אותה לחלוטין.

### 3.2 הדרישה ל-onyx-procurement

נניח ש-Kobi מחזיק דומיין `technokol.co.il` (או דומיין עסקי אחר שייבחר). הרשומה הנדרשת:

```dns
Type:  TXT
Host:  @  (או השאר ריק לדומיין שורש)
TTL:   3600
Value: v=spf1 include:sendgrid.net ~all
```

**הסבר:**
- `v=spf1` — גרסת SPF
- `include:sendgrid.net` — מאשר ל-SendGrid לשלוח בשם הדומיין שלנו
- `~all` — Soft Fail (מומלץ להתחיל בזה, אחר כך `-all` hard fail)

**אם עוברים ל-SES:**
```dns
v=spf1 include:amazonses.com ~all
```

**אם רוצים גם WhatsApp Meta לשלוח אימייל (לא רלוונטי היום):**
```dns
v=spf1 include:sendgrid.net include:_spf.meta.com ~all
```

### 3.3 מגבלות חשובות

- **SPF מגביל ל-10 include לוקאפים בלבד.** עם 2 ספקי אימייל בלבד — בטוח.
- **רק רשומת SPF אחת בדומיין** — אם יש כבר רשומה קיימת (Microsoft 365, Google Workspace), יש לאחד אותן.
- **SPF לא מגן על subdomain-ים אחרים** — אם Kobi משתמש ב-`mail.technokol.co.il`, צריך רשומה נפרדת.

### 3.4 בדיקה

לאחר הגדרה: `dig +short TXT technokol.co.il` — אמור להחזיר את הרשומה. אתרי בדיקה:
- https://mxtoolbox.com/spf.aspx
- https://mail-tester.com (נותן ציון 0–10)

---

## 4. DKIM — DomainKeys Identified Mail

### 4.1 מה זה

חתימה דיגיטלית על ההודעה. ה-mail server של המקבל מוודא שההודעה לא השתנתה ושאכן נשלחה מהמוסד הנטען. **SPF + DKIM ביחד** נחוצים ל-DMARC.

### 4.2 תהליך הגדרה ב-SendGrid

1. בממשק SendGrid → **Settings → Sender Authentication → Authenticate Your Domain**
2. להזין: `technokol.co.il`, לבחור "No" ל-branding-link (אלא אם רוצים links טבעיים)
3. SendGrid מחולל **3 רשומות CNAME**:

```dns
CNAME   s1._domainkey.technokol.co.il   →   s1.domainkey.u<userid>.wl.sendgrid.net
CNAME   s2._domainkey.technokol.co.il   →   s2.domainkey.u<userid>.wl.sendgrid.net
CNAME   em<id>.technokol.co.il          →   u<userid>.wl.sendgrid.net
```

4. להוסיף ב-DNS (בספק הדומיין: GoDaddy / Cloudflare / Namecheap)
5. ב-SendGrid ללחוץ **Verify** — אימות תוך 5–60 דקות
6. **2048-bit keys** — ברירת המחדל של SendGrid (חזק)

**חשוב:** אל תיצור DKIM keys באופן ידני כשמשתמשים ב-SendGrid — אין צורך. הספק מנהל את הרוטציה.

### 4.3 אם עוברים ל-SES

```bash
aws ses verify-domain-dkim --domain technokol.co.il
```

יחזיר 3 רשומות CNAME שצריך להכניס ל-DNS.

### 4.4 רוטציה

SendGrid מחליף keys אוטומטית ללא צורך בהתערבות. SES דורש רוטציה ידנית כל 12–24 חודשים (הוסף ל-runbook של Agent 22).

---

## 5. DMARC — Domain-based Message Authentication

### 5.1 תפקיד

DMARC אומר ל-mail server של המקבל: "אם SPF **או** DKIM נכשלו — מה לעשות?" ומוסיף report-back mechanism (`rua`) לניטור.

### 5.2 מסלול הטמעה מומלץ (stage progression)

#### שלב 1 — `p=none` (monitoring בלבד, שבוע 1)

```dns
Type:  TXT
Host:  _dmarc
TTL:   3600
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@technokol.co.il; pct=100; fo=1
```

- **אל תדחה כלום** — רק תקבל דוחות
- ה-`rua` צריך כתובת פעילה — אפשר להשתמש ב-`kobi@technokol.co.il`
- המטרה: וידוא שכל הזרמים (SendGrid, ManuelMail, Office 365 של Kobi, Google Workspace) מיושרים

#### שלב 2 — `p=quarantine` (אחרי ~2 שבועות של דוחות ללא failures)

```
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@technokol.co.il; pct=25; fo=1
```

- **pct=25** — מחיל על 25% מההודעות בלבד. עולה בהדרגה ל-100%.

#### שלב 3 — `p=reject` (יעד סופי, אחרי חודש)

```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@technokol.co.il; fo=1; adkim=s; aspf=s
```

- `adkim=s`, `aspf=s` — strict alignment (הדומיין ב-From חייב להתאים בדיוק)
- **זה המצב היעיל ביותר מול זיוף.**

### 5.3 הערה חשובה לגבי ספקים בינלאומיים (Foshan)

חלק מה-mail servers בסין לא מכבדים DMARC באותה מידה כמו Gmail/Outlook. **אל תסמוך על DMARC בלבד** — עדיין חיוני לשלוח מ-IP שעבר הגדרות SPF/DKIM + reverse DNS, כי QQ-Mail / NetEase 163 מסתכלים גם על ה-reputation הבסיסי.

### 5.4 כלי ניתוח דוחות DMARC חינמיים

- **dmarcian.com** — free tier ל-domain אחד
- **postmark.com/dmarc** — חינם לחלוטין, שולח סיכומים שבועיים
- **valimail.com** — free monitoring

**המלצה:** השתמש ב-**postmark-dmarc** (בחינם) כדי לקבל דוחות שבועיים מובנים לכתובת של Kobi, ללא צורך לנתח XML ידנית.

---

## 6. Reverse DNS / PTR

### 6.1 דרישה

אם שולחים מ-**IP עצמאי** (Amazon SES במצב dedicated IP, Mailgun dedicated) — חייב רשומת PTR שמצביעה מה-IP אל `mail.technokol.co.il`. אחרת Gmail מוריד 2–3 נקודות ב-spam score ו-Yahoo/AOL דוחים לגמרי.

### 6.2 ב-SendGrid Free

- **שיתוף IP** — SendGrid מנהל את ה-PTR records בעצמו. **אין פעולה נדרשת מ-Kobi.**
- זה גם ה-trade-off של IP משותף: אין שליטה על reputation אבל גם אין עבודה.

### 6.3 ב-SES

- Sandbox mode: אין PTR בעיה, מוגבל למי שהקלטת.
- Production mode + shared IP: בסדר, AWS מנהל.
- Dedicated IP ($24.95/חודש): צריך לבקש PTR דרך AWS Support.

**המלצה:** שמור על shared IP — זה מתאים לנפח של 300/חודש ולא צריך PTR ידני.

---

## 7. Hebrew Encoding — RFC 2047 בכותרות אימייל

### 7.1 בעיה מיידית

כותרות email (Subject, From name, Reply-To) חייבות להיות ASCII בלבד לפי RFC 5322. טקסט עברי כמו "הצעת מחיר — RFQ-ABC123" יישבר או יוצג כ-`???` בלקוחות ישנים.

### 7.2 פתרון RFC 2047 — Encoded-Word

**פורמט:** `=?charset?encoding?encoded-text?=`

**דוגמה עברית:**
```
Subject: =?UTF-8?B?16TXqNeZIOmvqiDXnNeb15Qg16fXjtee16o=?=
```

פירוש:
- `=?UTF-8?` — charset
- `B?` — Base64 encoding (עדיף על Q לעברית בגלל צפיפות התווים)
- `...?=` — הטקסט המקודד

**בקוד Node.js:**
```js
function encodeHebrewSubject(subject) {
  const b64 = Buffer.from(subject, 'utf-8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}
```

### 7.3 בדיוק איך SendGrid מטפל

**חדשות טובות:** SendGrid API מקבל Subject ב-UTF-8 raw ומקודד אוטומטית. אין צורך לבצע ידנית encoding אם משתמשים ב-REST API:

```js
// SendGrid v3 API — Hebrew subject works natively
{
  "personalizations": [{
    "to": [{"email": "supplier@foshan.cn"}]
  }],
  "from": {"email": "procurement@technokol.co.il", "name": "טכנו קול עוזי"},
  "subject": "הצעת מחיר — RFQ-ABC123",   // raw UTF-8 OK
  "content": [{"type": "text/plain", "value": "..."}]
}
```

### 7.4 From Name עברי

לפי RFC 2047 גם `From: "טכנו קול עוזי" <procurement@technokol.co.il>` חייב encoding:

```
From: =?UTF-8?B?15jXm9eg15Ug16fXldec15Ug16LXldeW15k=?= <procurement@technokol.co.il>
```

SendGrid מקודד את שדה ה-`from.name` אוטומטית אם מעבירים אותו ב-JSON. **עם זאת בדוק בפועל** בגמייל שהשם מופיע כ-"טכנו קול עוזי" ולא כ-`=?UTF-8?...?=` גולמי.

### 7.5 Body של אימייל

ה-body עצמו דורש header:
```
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: base64
```

או עבור HTML:
```
Content-Type: text/html; charset=UTF-8
```

SendGrid/SES מטפלים בזה אוטומטית כשהמחרוזת מועברת כ-JSON בתקן UTF-8.

### 7.6 סכנות ספציפיות לעברית

- **LRM/RLM marks** — אם הטקסט מכיל תווי כיוון (U+200E, U+200F) הם נשמרים רק אם ה-charset הוא UTF-8.
- **כתובת אימייל עברית** — RFC 6531 (SMTPUTF8) תומך `משתמש@דומיין.ישראל`, אבל **אל תסמוך על זה** — רוב השרתים עדיין לא תומכים. השתמש בכתובות ASCII עבור `@` בלבד; Display Name יכול להיות עברי.

---

## 8. HTML Email vs Plain Text

### 8.1 לטובת onyx-procurement (transactional RFQ)

| קריטריון | Plain Text | HTML |
|---|---|---|
| Deliverability | **גבוה יותר** (פחות ספאם flags) | תלוי ב-quality |
| תצוגה בגמייל ו-Outlook | אחידה | תלוי ב-renderer |
| RTL עברית | עובד בכל לקוח | דורש `dir="rtl"` |
| משקל הודעה | ~2 KB | 5–30 KB |
| קריאות לקוחות מובייל | מצוין | תלוי responsive |

### 8.2 המלצה: **multipart/alternative**

שלח **גם Plain וגם HTML** באותה ההודעה (multipart/alternative):
- לקוחות מודרניים מציגים HTML
- לקוחות ישנים (Huawei Mail, QQ-Mail ב-text mode) מציגים Plain
- Gmail/Outlook מציינים שההודעה "looks real" — shipped-by ציונים טובים יותר

**ב-SendGrid API:**
```json
"content": [
  {"type": "text/plain", "value": "שלום רב,\nזוהי הצעת מחיר..."},
  {"type": "text/html", "value": "<!DOCTYPE html><html dir=\"rtl\" lang=\"he\"><body>...</body></html>"}
]
```

**שים לב:** SendGrid דורש ש-`text/plain` יופיע לפני `text/html` במערך.

### 8.3 HTML template מינימלי עם RTL

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>בקשת הצעת מחיר</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; text-align: right; background: #f5f5f5; margin: 0; padding: 20px;">
  <table width="600" cellpadding="20" cellspacing="0" style="background: white; margin: auto; border: 1px solid #ddd;">
    <tr><td>
      <h2>הצעת מחיר — {{RFQ_ID}}</h2>
      <p>שלום {{SUPPLIER_NAME}},</p>
      <p>מצורפת בקשה לקבלת הצעת מחיר עבור הפריטים הבאים:</p>
      <ul>{{ITEMS_LIST}}</ul>
      <p><a href="{{REPLY_URL}}" style="background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">הזן הצעה</a></p>
      <hr>
      <p style="font-size: 12px; color: #888;">
        {{UNSUBSCRIBE_LINK}} |
        טכנו קול עוזי בע"מ | ח.פ. XXXXXX | טלפון: XXX
      </p>
    </td></tr>
  </table>
</body>
</html>
```

**חיוני:** שימוש ב-**table-based layout** ולא CSS Grid/Flex — Outlook 2016+ ו-Gmail מובייל לא תומכים ב-modern CSS.

---

## 9. Unsubscribe — CAN-SPAM + חוק הספאם הישראלי

### 9.1 חוק התקשורת (בזק ושידורים) סעיף 30א — חוק הספאם הישראלי

**דרישות חוק חובה:**
1. **הסכמה מפורשת** של הנמען לקבל פרסום. **חריג (סעיף 30א(ג)):** אם קיים קשר עסקי קיים (ספק-לקוח פעיל), ניתן לשלוח "דבר פרסומת" לתחומים דומים **ללא הסכמה מראש**, אבל חובה לאפשר הסרה.
2. **זיהוי של השולח** — שם, פרטי התקשרות, דרך להסרה — חובה בכל אימייל פרסומי/שיווקי.
3. **הסרה בקלות** — קישור/כתובת שמאפשרת הסרה בצורה פשוטה.
4. **הצעות מחיר לספקים — זה לא "דבר פרסומת"** תחת סעיף 30א — זה תקשורת עסקית לגיטימית. **אבל:** אם יומר לשיווק/newsletter, נכנס תחת החוק.

### 9.2 CAN-SPAM Act (ארה"ב) — רלוונטי לספקים בינלאומיים

- כתובת פיזית בכל אימייל
- קישור Unsubscribe (לא יותר מ-3 לחיצות)
- עיבוד unsubscribe תוך 10 ימי עסקים
- אסור להטעות ב-Subject/From

### 9.3 מימוש טכני ב-SendGrid

**Unsubscribe link אוטומטי:**

ב-SendGrid יש מנגנון built-in של **Suppression Lists + Unsubscribe Groups**:

```js
// SendGrid API request
{
  "asm": {
    "group_id": 12345,   // "RFQ notifications"
    "groups_to_display": [12345]
  },
  "content": [...]
}
```

- SendGrid אוטומטית מוסיף `<%asm_group_unsubscribe_raw_url%>` שניתן להטמיע ב-HTML
- לחיצה → SendGrid מוסיף ל-suppression list → לא ישלח שוב

**בגוף ה-HTML:**
```html
<p style="font-size: 11px; color: #888;">
  לא מעוניין לקבל בקשות RFQ נוספות?
  <a href="<%asm_group_unsubscribe_raw_url%>">הסר אותי מהרשימה</a>
</p>
```

**בגוף ה-Plain:**
```
להסרה מרשימת התפוצה: <%asm_group_unsubscribe_raw_url%>
```

### 9.4 List-Unsubscribe header (RFC 8058)

SendGrid מוסיף אוטומטית:
```
List-Unsubscribe: <https://u.sendgrid.net/wf/...>, <mailto:unsubscribe@sendgrid.net>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

זה חיוני — **Gmail דורש** את זה ל-senders מעל 5,000 emails/יום מאז פברואר 2024, ומעודד את זה בכל הנפחים.

### 9.5 חובת הכותרת העסקית

**חובה ב-footer של כל אימייל (עברית):**
```
טכנו קול עוזי בע"מ
ח.פ. XXXXXXXX
כתובת: [רחוב], [עיר], ישראל
טלפון: XX-XXXXXXX | אימייל: info@technokol.co.il
[הסרה מהרשימה]
```

---

## 10. Bounce Handling & Suppression Lists

### 10.1 סוגי bounce

| סוג | קוד SMTP | משמעות | טיפול |
|---|---|---|---|
| **Hard bounce** | 550, 551, 553 | כתובת לא קיימת | הסר מיידית מ-DB |
| **Soft bounce** | 4xx, 450 | תיבה מלאה / זמני | נסה 3 פעמים, אחר כך הסר |
| **Block** | 554, 571 | IP blacklisted | התרעה מיידית ל-Kobi |
| **Spam complaint** | FBL header | מקבל לחץ "דווח ספאם" | הסר מיידית, חקור |

### 10.2 SendGrid Event Webhook

SendGrid יכול לשלוח webhook לכל event (delivered, bounce, open, click, spam_report). יש להוסיף endpoint חדש ל-server.js:

```js
// server.js — suggested addition
app.post('/webhook/sendgrid', async (req, res) => {
  const events = req.body; // SendGrid sends array
  for (const event of events) {
    if (['bounce', 'dropped', 'spam_report'].includes(event.event)) {
      // Update suppliers table: set suppliers.email_status = 'bounced'
      await supabase.from('suppliers')
        .update({ email_status: event.event, email_status_reason: event.reason })
        .eq('email', event.email);
      
      await audit('supplier_email', event.email, event.event, 'sendgrid', 
                  `Email ${event.event}: ${event.reason || ''}`);
    }
  }
  res.sendStatus(200);
});
```

**הערה:** צריכה להיות עמודה חדשה `suppliers.email_status` ב-Supabase schema.

### 10.3 אבטחת webhook

**SendGrid תומך ב-Signed Event Webhook:**
- ה-webhook חותם ב-ECDSA על ה-payload
- האפליקציה מאמתת עם PUBLIC KEY
- מונע fake events ששולח תוקף

```js
const crypto = require('crypto');
function verifySendGridSignature(publicKey, payload, signature, timestamp) {
  const timestampedPayload = timestamp + payload;
  const decodedSignature = Buffer.from(signature, 'base64');
  const verify = crypto.createVerify('SHA256');
  verify.update(timestampedPayload);
  return verify.verify(publicKey, decodedSignature);
}
```

**חיוני להפעיל.** בלי verification, ה-webhook פתוח ל-denial-of-service וזיוף.

### 10.4 Suppression List מקומית

**שמור table חדש ב-Supabase:**
```sql
CREATE TABLE email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL,          -- 'bounce', 'spam_report', 'unsubscribe'
  first_seen timestamp DEFAULT now(),
  bounce_count int DEFAULT 1,
  notes text
);
```

**לפני כל שליחה:**
```js
async function canSendTo(email) {
  const { data } = await supabase.from('email_suppressions')
    .select('email').eq('email', email).single();
  return !data;
}
```

זה מגן גם במקרה ש-SendGrid כשל או reset של ה-suppression list.

---

## 11. Reply Tracking — מענה של ספקים

### 11.1 אתגר

בניגוד ל-WhatsApp שמשתמש ב-webhook לקבלת תשובות (`/webhook/whatsapp` בשורה 876 של server.js), אימייל דורש mechanism שונה:

| גישה | יתרונות | חסרונות |
|---|---|---|
| **SendGrid Inbound Parse** | מובנה, מנתח לפורמט JSON | דורש MX record על subdomain ייעודי |
| **IMAP pull** | פשוט יחסית | polling, latency, אחסון credentials |
| **Reply-To dedicated** | נקי | דורש unique address per RFQ |

### 11.2 SendGrid Inbound Parse — מומלץ

1. הוסף MX record:
```dns
MX 10  inbound.technokol.co.il   →   mx.sendgrid.net
```

2. ב-SendGrid → Settings → Inbound Parse → Add Host & URL:
   - Host: `inbound.technokol.co.il`
   - URL: `https://onyx-procurement.replit.app/webhook/email-inbound`

3. **Plus Addressing trick** — כדי לקשר תשובה ל-RFQ:
```
Reply-To: rfq-RFQ-ABC123@inbound.technokol.co.il
```

SendGrid מפרסר ומקבל את `rfq-RFQ-ABC123` כ-`envelope.to`, וב-server.js:
```js
app.post('/webhook/email-inbound', async (req, res) => {
  const rfqId = req.body.to.match(/rfq-([A-Z0-9-]+)@/)?.[1];
  const text = req.body.text;
  const from = req.body.from;
  
  if (rfqId) {
    await supabase.from('rfq_replies').insert({
      rfq_id: rfqId,
      supplier_email: from,
      raw_text: text,
      received_at: new Date(),
      source: 'email'
    });
    await audit('rfq_reply', rfqId, 'received', from, `Email reply from ${from}`);
  }
  res.sendStatus(200);
});
```

### 11.3 החלופה: IMAP pull (לא מומלץ)

דורש בכל ~60 שניות שאילתה מול IMAP server, אחסון `IMAP_PASSWORD` ב-env, טיפול ב-reconnects. **יותר שביר**. השתמש רק אם אי אפשר SendGrid Inbound Parse.

---

## 12. Attachments — מגבלות גודל

### 12.1 מגבלות של providers

| ספק | מגבלה |
|---|---|
| SendGrid (total) | 30 MB לכל הודעה |
| SES | 40 MB (raw), 10 MB Base64 encoded |
| Gmail קבלת | 25 MB |
| Outlook קבלת | 20 MB (חלק מהמקרים 10 MB) |
| Chinese providers (QQ) | **10 MB מקסימום** — חשוב ל-Foshan! |

### 12.2 המלצה ל-onyx-procurement

**אל תצרף קבצים גדולים מ-10 MB** — הגבל ל-5 MB לכל attachment כדי להבטיח שגם Foshan יקבל. אם צריך PDF גדול יותר (קטלוג):

**חלופה:** העלה ל-Supabase Storage → שלח **קישור חתום** (signed URL עם expiration):
```js
const { data } = await supabase.storage
  .from('rfq-attachments')
  .createSignedUrl('rfq-ABC123.pdf', 604800); // 7 days
```

הטמע את `data.signedUrl` בגוף ה-email. **גם חוסך bandwidth וגם עובד סביב מגבלות גודל.**

### 12.3 סוגי קבצים אסורים

**חסום מראש שליחת:**
- `.exe`, `.bat`, `.cmd`, `.scr`, `.vbs` — Gmail/Outlook דוחים
- `.zip` מוצפן — flagged כ-suspicious
- `.doc` (DOC ישן) — מושך macro warnings

**מותר ומומלץ:**
- PDF, PNG, JPG, WEBP, XLSX, DOCX

---

## 13. From-Name & Reply-To — תצוגה בעברית

### 13.1 המלצה סופית ל-onyx-procurement

```js
from: {
  email: "procurement@technokol.co.il",
  name: "טכנו קול עוזי — רכש"
},
reply_to: {
  email: "rfq-{{RFQ_ID}}@inbound.technokol.co.il",
  name: "רכש טכנו קול"
}
```

**הערה חשובה:**
- השם בעברית יוצג ב-inbox כ-"טכנו קול עוזי — רכש" ב-Gmail, Outlook, Apple Mail (אם encoding נכון)
- **ב-Chinese mail clients** (QQ, 163.com) — הצגה מותנית בתמיכת UTF-8 — **ייתכן שהשם יופיע כ-???**. לכן חשוב שגם כתובת ה-email תהיה תיאורית: `procurement@`, לא `no-reply@`.
- **למען Foshan — הוסף שם אנגלי כ-fallback:** `"Techno Kol Uzi Procurement / טכנו קול עוזי - רכש"` — שם מעורב מבטיח זיהוי משני הכיוונים.

### 13.2 שדה `reply-to` ייחודי לכל RFQ

לפי סעיף 11.2 (Inbound Parse), ה-`Reply-To` דינמי:
```
rfq-RFQ-XYZ789@inbound.technokol.co.il
```

זה מאפשר auto-routing של תשובות חזרה ל-RFQ הספציפית ב-DB. אל תשתמש ב-`support@` גנרי.

### 13.3 Avoid `no-reply@` אם אפשר

Gmail 2024+ מוריד reputation מעט ל-`no-reply@*` (זיהוי dark pattern). העדף `procurement@` שבאמת עונה (ע"י Kobi או ע"י inbound webhook).

---

## 14. המלצה מינימלית לפריסה (אם/כאשר Email יידרש)

### 14.1 Setup של 2 שעות עבודה

**שלב 1 — דומיין (15 דק)**

- רכוש `technokol.co.il` ב-go.co.il / Namecheap (~$15/שנה)
- אם הדומיין כבר קיים → דלג

**שלב 2 — SendGrid Free account (10 דק)**

1. הרשמה ב-sendgrid.com
2. אמת את ה-sender email (Kobi's personal)
3. Domain Authentication → הכנס את 3 ה-CNAME records לדומיין
4. המתן ~10 דקות לאימות

**שלב 3 — DNS records (15 דק)**

בספק הדומיין, הוסף:
```dns
TXT  @         "v=spf1 include:sendgrid.net ~all"
CNAME s1._domainkey    s1.domainkey.u<uid>.wl.sendgrid.net
CNAME s2._domainkey    s2.domainkey.u<uid>.wl.sendgrid.net
CNAME em<id>           u<uid>.wl.sendgrid.net
TXT  _dmarc    "v=DMARC1; p=none; rua=mailto:kobi@technokol.co.il; pct=100"
```

**שלב 4 — Dependency + helper ב-server.js (30 דק)**

הוסף ל-package.json:
```json
"@sendgrid/mail": "^8.1.4"
```

הוסף ל-server.js (מיקום: אחרי `sendSMS` בערך שורה 95):
```js
// ═══ EMAIL SENDER (SendGrid) ═══
const sgMail = require('@sendgrid/mail');
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function sendEmail(to, subject, plainText, htmlContent = null, rfqId = null) {
  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, reason: 'SendGrid not configured' };
  }
  
  // Check suppression list
  const { data: suppressed } = await supabase
    .from('email_suppressions')
    .select('email').eq('email', to).single();
  if (suppressed) return { success: false, reason: 'suppressed' };
  
  const msg = {
    to,
    from: { 
      email: 'procurement@technokol.co.il', 
      name: 'טכנו קול עוזי — רכש / Techno Kol Uzi Procurement' 
    },
    replyTo: rfqId 
      ? `rfq-${rfqId}@inbound.technokol.co.il` 
      : 'procurement@technokol.co.il',
    subject,   // SendGrid handles UTF-8 automatically
    text: plainText,
    html: htmlContent || undefined,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
      subscriptionTracking: { enable: true }
    },
    asm: process.env.SENDGRID_ASM_GROUP_ID 
      ? { groupId: parseInt(process.env.SENDGRID_ASM_GROUP_ID) } 
      : undefined
  };
  
  try {
    const [response] = await sgMail.send(msg);
    return { success: true, messageId: response.headers['x-message-id'] };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}
```

**שלב 5 — שילוב בשרשרת fallback (15 דק)**

בלולאה של שורות 295–298 ב-server.js:
```js
// existing: whatsapp → sms → (new) email
} else if (channel === 'email' || 
           (WA_TOKEN && !sendResult?.success)) {
  if (supplier.email) {
    sendResult = await sendEmail(
      supplier.email, 
      `בקשת הצעת מחיר — ${rfqId}`, 
      messageText,
      buildHtmlRfq(messageText, rfqId, unsubUrl),
      rfqId
    );
  }
}
```

**שלב 6 — webhook + suppression (30 דק)**

הוסף endpoint `/webhook/sendgrid` (ראה סעיף 10.2) + טבלת `email_suppressions` ב-Supabase.

**שלב 7 — בדיקה (15 דק)**

- שלח אימייל בדיקה לעצמך
- הרץ ב-mail-tester.com, צריך ציון 9+/10
- בדוק spam folder ב-Gmail, Outlook

### 14.2 DoD (Definition of Done) לפריסת email

- [ ] SPF, DKIM, DMARC=p=none מוגדרים ומאומתים ב-mxtoolbox
- [ ] ציון 9+/10 ב-mail-tester.com
- [ ] `sendEmail` function עובר בדיקה ידנית
- [ ] Webhook של SendGrid מקושר ומאמת signature
- [ ] `email_suppressions` table קיימת ב-Supabase
- [ ] Unsubscribe link פעיל ונבדק
- [ ] Inbound Parse מחובר ל-`rfq_replies` table
- [ ] Hebrew encoding נבדק ידנית ב-Gmail + Outlook
- [ ] DMARC report monitoring פעיל (postmark-dmarc free)
- [ ] Rate limiting על `sendEmail` (לא יותר מ-100/שעה)
- [ ] עד חודש: מעבר ל-`p=quarantine`; עד חודשיים: `p=reject`

### 14.3 מה אסור לעשות

- **אל תשלח מ-Gmail SMTP** (`smtp.gmail.com`) — מוגבל ל-500/יום, ללא DKIM למיילים ייחודיים, אין deliverability reputation ל-business
- **אל תריץ mail server עצמאי** (Postfix/Exim) על Replit — Replit חוסם פורט 25 outbound, וגם אם לא — ה-IP יסווג ב-blacklist תוך שעות
- **אל תשלח אימיילים המוניים ללא DMARC** — בזמן שהטמעה בלי DMARC תעבוד בהתחלה, גוגל מ-2024 מחייב את זה מעל 5,000/יום ומתרגם לפגיעה ב-reputation גם בנפחים נמוכים

---

## 15. סיכונים וסכנות שזוהו (Risk Register)

| # | סיכון | חומרה | סבירות | המלצה |
|---|---|---|---|---|
| 1 | ללא SPF/DKIM/DMARC, אימיילים נופלים ב-spam ב-Gmail/Outlook | **גבוהה** | גבוהה (אם מפעילים) | סעיפים 3–5 — חובה לפני שליחה ראשונה |
| 2 | Foshan / QQ-Mail דוחים HTML-heavy emails | בינונית | בינונית | multipart/alternative, גבולות על attachment 5 MB |
| 3 | Hebrew From-name מוצג כ-garbage אצל ספקים בינלאומיים | בינונית | בינונית | From name מעורב עברית+אנגלית |
| 4 | SendGrid webhook מזויף מזרים false events | גבוהה | נמוכה | חובה verify signature (סעיף 10.3) |
| 5 | Variable email cost runaway (כמו ב-Agent 24 WhatsApp) | נמוכה (Free tier) | נמוכה | SendGrid Free תחום קשיח ל-3,000/חודש |
| 6 | אי-ציות לחוק הספאם הישראלי ב-RFQ ללא unsubscribe | בינונית | נמוכה (עסקי) | סעיף 9 — Footer + Unsubscribe link |
| 7 | Reply tracking נכשל, RFQ responses אובדות | **גבוהה** | בינונית | SendGrid Inbound Parse + plus-addressing |
| 8 | DKIM private key דולף | גבוהה | נמוכה | SendGrid מנהל מפתחות — אי-חשיפה |
| 9 | Email suppression list סותרת התנהגות WhatsApp | נמוכה | בינונית | unsubscribe של email לא משפיע על WhatsApp — הפרד |
| 10 | Rate limiting חסר (כמו ב-Agent 14) פותח ל-enumeration | בינונית | בינונית | הוסף rate limit על `/api/rfqs` לפני הפעלת email |

---

## 16. תרגומים וטרמינולוגיה

| English | עברית |
|---|---|
| Sender Policy Framework | מסגרת מדיניות שולח |
| DomainKeys Identified Mail | זיהוי אימייל מבוסס מפתחות דומיין |
| Domain-based Message Authentication | אימות הודעות מבוסס דומיין |
| Reverse DNS / PTR record | רשומת DNS הפוכה |
| Encoded-Word (RFC 2047) | מילה מקודדת |
| Bounce | הקפצה (כישלון מסירה) |
| Soft bounce | הקפצה רכה (זמנית) |
| Hard bounce | הקפצה קשה (קבועה) |
| Spam complaint | תלונת דואר זבל |
| Suppression list | רשימת הדחה |
| Inbox placement | מיקום ב-תיבת הדואר הנכנס |
| Reply tracking | מעקב תשובות |
| Unsubscribe link | קישור הסרה |
| Feedback loop (FBL) | לולאת משוב |

---

## 17. מה Agent 44 **לא** כיסה (Out of Scope)

- **GDPR / פרטיות** — כוסה ב-QA-26
- **Dependencies CVE** — כוסה ב-QA-31; אם יתווסף `@sendgrid/mail`, תצטרך ביקורת CVE
- **Supply Chain** — כוסה ב-QA-32
- **Cost analysis** — כוסה ב-QA-24 (Agent 44 הוסיף $0/חודש מעליו)
- **DR plan** — כוסה ב-QA-19 (Agent 44 משלים את השלב השלישי של שרשרת ה-fallback)
- **Monitoring** — כוסה ב-QA-21; יש להוסיף ניטור של delivery rate
- **Actual email content/copywriting** — עסקי, לא טכני
- **i18n של HTML templates** — מחוץ ל-deliverability, שייך ל-UX
- **הערכת ספק פלוני מול ספק אלמוני בעומק** — נעשה ברמה עקרונית בלבד

---

## 18. סיכום מספרי

| מדד | ערך |
|---|---|
| **תלויות email בקוד היום** | 0 (אפס) |
| **קוד שליחת email ב-server.js** | 0 שורות |
| **שליחות email לחודש (צפי fallback)** | ~300 |
| **עלות SendGrid Free tier** | $0.00 / חודש |
| **עלות תוספתית מול Agent 24** | $0.00 / חודש |
| **זמן פריסה מוערך** | ~2 שעות |
| **DNS records נדרשים** | 5 (SPF, 3× DKIM CNAME, DMARC) |
| **Deliverability target (mail-tester)** | 9+/10 |
| **יעד סופי DMARC policy** | `p=reject` (תוך ~30 ימים מההפעלה) |
| **Dependencies לאתחול** | `@sendgrid/mail` (1 חבילה, ~200 KB) |
| **קוד חדש ב-server.js (מוערך)** | ~100 שורות |
| **טבלאות Supabase חדשות** | 2 (`email_suppressions`, `rfq_replies`) |
| **פעולות חובה לפני שליחה ראשונה** | 7 (ראה סעיף 14.2 DoD) |

---

## 19. פסק דין סופי

**מצב נוכחי:** onyx-procurement **אינו שולח אימייל**, אינו תלוי בהגדרות DNS של email, ואין risk exposure כרגע למצבי deliverability. Agent 44 הוא **ניתוח צופה-פני-עתיד** בלבד.

**האם חיוני להוסיף email היום?** **לא חיוני לליבת התפעול** (13 ספקים מקומיים משתמשים ב-WhatsApp). **חיוני אסטרטגית ל-2 scenarios:**
1. **DR fallback** (כבר רשום ב-QA-19) — חסרונו סיכון של 0 channels כשכל שאר הערוצים נפגעו.
2. **Foshan / ספקים בינלאומיים** — WhatsApp פחות מוצב בסין; email הוא התקן הבינלאומי.

**המלצה לקבוע:** אם Kobi שוקל הרחבה למעל 5 ספקים בינלאומיים או מחפש שכבת אמינות נוספת ב-DR — הקצה ~2 שעות לפריסה המינימלית בסעיף 14. אחרת — הניח את זה במצב "תכנון מתועד, לא מיושם".

**עלות פריסה:** $0/חודש (SendGrid Free) + ~2 שעות עבודה.

**השפעה על תקציב Agent 24:** אפסית ($32.15 נשאר).

**ציון deliverability readiness נוכחי:** N/A (אין email). ציון readiness של **התכנון** המוצע כאן: **9/10** — כל הדרישות הטכניות מכוסות, חסר רק אימות של הדומיין בפועל שטרם נרכש.

---

**QA Agent #44 — סטטוס:** ניתוח סטטי הושלם
**קישורים:** לא בוצעו פעולות רשת; לא נוספו תלויות; לא הוצג קוד פעיל.
**חפיפה עם QA-WAVE1-DIRECT-FINDINGS.md:** אפסית — ממד ייחודי.
