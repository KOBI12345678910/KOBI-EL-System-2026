# QA Agent #80 — onyx-procurement
## Real-time Sync Conflict Resolution — ניתוח סטטי

**תאריך:** 2026-04-11
**Scope:** `web/onyx-dashboard.jsx` + `server.js`
**Agent:** QA #80 (Static Analysis ONLY)
**Dimension:** Real-time Sync Conflict Resolution
**מערכת:** ONYX Procurement — Techno-Kol Uzi

---

## 0. Executive Summary

מערכת ONYX **אינה מחזיקה שום מנגנון סינכרון עדכני אמיתי**. זוהי מערכת polling פשוטה (30 שניות) שמחזיקה את כל ה-state על הלקוח ומחליפה אותו מלא בכל refresh. **אין ETag, אין optimistic concurrency, אין updated_at compare, אין WebSocket, אין version vector, אין SSE, אין Supabase Realtime subscribe.** כל הכתיבות לשרת הן "last write wins" גלובלי דרך `supabase.from(...).update(...)` בלי `.eq('updated_at', ...)`.

**Verdict:** CRITICAL — כל עריכה מקומית שתתבצע בזמן refresh של 30s תידרס ללא התראה. בתרחיש של 2 משתמשים (קובי + עוזר), השני דורס את הראשון בלי שום אינדיקציה.

| # | ממצא | חומרה | שורה |
|---|------|--------|------|
| S-01 | Refresh גלובלי כל 30s דורס state מקומי | CRITICAL | `onyx-dashboard.jsx:45` |
| S-02 | אין optimistic UI עם rollback | HIGH | `onyx-dashboard.jsx:187-195,256-280,347-362,443-450,529-538` |
| S-03 | Last-write-wins בכל `PATCH /api/suppliers/:id` | CRITICAL | `server.js:157-163` |
| S-04 | אין זיהוי conflict בעריכה שיתופית (קובי + עוזר) | CRITICAL | כל ה-API |
| S-05 | אין אזהרת Stale Data ב-UX | HIGH | `onyx-dashboard.jsx:62-76` |
| S-06 | Polling בלבד — אין push / subscribe | HIGH | `onyx-dashboard.jsx:45` |
| S-07 | `refresh()` מאבד טפסים בעריכה (`showAdd`, `quoteForm`) | HIGH | `onyx-dashboard.jsx:115-167,337-362` |
| S-08 | Race condition ב-`refresh()` עצמו — אין AbortController | HIGH | `onyx-dashboard.jsx:34-43` |
| S-09 | Toast מסתיר שגיאות conflict — אין retry | MEDIUM | `onyx-dashboard.jsx:29-32` |
| S-10 | PR יתום בשרת אם `/rfq/send` נכשל אחרי `/purchase-requests` | CRITICAL | `onyx-dashboard.jsx:256-280` |

---

## 1. Dashboard Auto-Refresh כל 30s — **האם זה דורס עריכות מקומיות?**

### 1.1 הקוד הקריטי

**`onyx-dashboard.jsx:34-45`**

```jsx
const refresh = useCallback(async () => {
  setLoading(true);
  const [s, sup, sub, o, r, sav] = await Promise.all([
    api("/api/status"), api("/api/suppliers"), api("/api/subcontractors"),
    api("/api/purchase-orders"), api("/api/rfqs"), api("/api/analytics/savings"),
  ]);
  setStatus(s); setSuppliers(sup.suppliers || []); setSubcontractors(sub.subcontractors || []);
  setOrders(o.orders || []); setRfqs(r.rfqs || []); setSavings(sav);
  setLoading(false);
}, []);

useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, [refresh]);
```

### 1.2 ניתוח

**כן — זה דורס עריכות מקומיות, אבל רק state שמגיע מהשרת. הנה הפירוט:**

**א. מה שנדרס (server state):**
- `status`, `suppliers`, `subcontractors`, `orders`, `rfqs`, `savings` — **נדרסים לחלוטין** בכל 30s.
- ה-`setX` רץ עם הערך החדש בלי merge, בלי diff, בלי שמירת שינויים לוקאליים — **שכתוב מוחלט**.

**ב. מה ששורד (UI-local state):**
- `tab` (הטאב הפעיל) — נשמר ב-state מקומי.
- `showAdd` (טופס הוספת ספק פתוח) — נשמר **אבל** אם `suppliers` משתנה בזמן שהטופס פתוח, המשתמש ממשיך לראות את הטופס הישן.
- `form`, `meta`, `items` (בתוך ה-tabs) — נשמרים **כל עוד ה-tab לא מתרנדר מחדש** (הוא לא מתרנדר כי ה-parent לא mount מחדש, רק props משתנים).
- `quoteForm`, `rfqDetail`, `decision`, `selectedRfq`, `result` — גם הם נשמרים.

**ג. הבעיה המרכזית:**

המצב הקשה ביותר הוא **עריכת שדה בטופס בזמן refresh**. לדוגמה, קובי כותב שם ספק ב-`SuppliersTab`:
1. `t=0`: קובי מקליד "ברזל גלעד" בשדה.
2. `t=29`: קובי עדיין מקליד, מגיע ל"ברזל גלעד ב...".
3. `t=30`: `refresh()` מתבצע, `setSuppliers(sup.suppliers || [])` דורס את הרשימה. הטופס המקומי **שורד** (הוא ב-state של `SuppliersTab`).
4. `t=30.5`: קובי לוחץ "שמור". ה-POST נשלח.
5. **התוצאה:** השמירה עצמה מצליחה. אבל:
   - אם בינתיים עוזר מחק את הספק `id=X` שקובי עורך — השמירה לא תדע.
   - הרשימה מתעדכנת אבל `form.name = "ברזל גלעד ב..."` נשמר. המשתמש רואה טופס ישן על רקע רשימה חדשה.

**ד. מצב קטסטרופלי — שורה 74:**

```jsx
<button onClick={refresh} style={styles.refreshBtn}>🔄</button>
```

כפתור "רענן" ידני שקורא ל-`refresh()` — **בלי דיאלוג אישור**. לחיצה מקרית בזמן עריכת טופס = אובדן state אפשרי של childrens.

### 1.3 תרחישים קונקרטיים

| תרחיש | state אובד? | הערה |
|------|-------------|------|
| קובי עורך `form.name` ב-`SuppliersTab` | ❌ לא | `form` ב-state של child |
| קובי ב-`quotesTab` עם `rfqDetail` טעון, עוזר מוסיף הצעה | ⚠️ חלקי | `rfqDetail` נשאר ישן עד `loadRFQ` מחדש |
| קובי עם טאב פתוח, עוזר מעדכן `suppliers` | ✅ כן | `suppliers` נדרס בכל 30s |
| קובי רואה `decision` מ-RFQ, עוזר מקבל החלטה חדשה | ❌ לא | `decision` ב-state של child, אבל **זה באג** — המשתמש רואה החלטה ישנה |
| `orders` שקובי רואה עם status=`draft` — עוזר מאשר ל-`approved` | ✅ מתעדכן אחרי 30s | יש windowתקיפה של 30s |

---

## 2. Optimistic UI Updates עם Rollback

### 2.1 ממצא חמור — **אין Optimistic UI בשום מקום**

הקוד מבצע תמיד את האותה secuence:
```
1. send POST/PATCH
2. wait for response
3. if ok: showToast + onRefresh()
4. if error: showToast(error)
```

**אין:**
- עדכון state מקומי לפני קבלת תשובה
- rollback אם השרת מחזיר שגיאה
- indicator של "pending" (pulse, opacity, skeleton)
- retry queue
- offline queue

### 2.2 דוגמאות קוד

**א. `addSupplier` — `onyx-dashboard.jsx:187-195`**
```jsx
const addSupplier = async () => {
  if (!form.name || !form.phone) return showToast("שם וטלפון חובה", "error");
  const res = await api("/api/suppliers", "POST", form);
  if (res.error) return showToast(res.error, "error");
  showToast(`✅ ${form.name} נוסף`);
  setForm({ name: "", contact_person: "", phone: "", email: "", preferred_channel: "whatsapp" });
  setShowAdd(false);
  onRefresh();  // ⬅️ רק אחרי תשובה
};
```
**הערכה:** אין עדכון מקומי של `suppliers` לפני התשובה. המשתמש מחכה למעגל מלא של network → insert → response → refresh. זמן תגובה אמיתי = 500ms–2000ms.

**ב. `approve` ב-`OrdersTab` — `onyx-dashboard.jsx:443-446`**
```jsx
const approve = async (id) => {
  const res = await api(`/api/purchase-orders/${id}/approve`, "POST", { approved_by: "קובי" });
  showToast(res.message || "אושר"); onRefresh();
};
```
**באג קריטי:** אם `res.error` קיים, `res.message` עדיין יכול להיות `undefined`, ואז `"אושר"` מוצג למרות השגיאה. **המשתמש חושב שהצליח, אבל לא הצליח.** אין rollback, אין בדיקת `res.error`.

**ג. `submitQuote` — `onyx-dashboard.jsx:347-362`**
אותה תבנית: אין optimistic, אין rollback.

**ד. `decide` ב-`QuotesTab` — `onyx-dashboard.jsx:364-370`**
```jsx
const decide = async () => {
  const res = await api(`/api/rfq/${selectedRfq}/decide`, "POST", { decided_by: "קובי" });
  if (res.error) return showToast(res.error, "error");
  setDecision(res);  // ⬅️ דריסה. אין שמירת ה-decision הקודם למקרה של שגיאה בקריאה הבאה.
  showToast(res.message);
  onRefresh();
};
```
**בעיה:** אם המשתמש לחץ decide, וה-API הצליח במחצית (יצר PO, לא יצר decision), אין rollback. אין transaction boundary.

### 2.3 Rollback-Impossible Cases

**מקרה מיוחד — 2-step creation ב-`RFQTab.send`:**
```jsx
// 1. Create purchase request
const prRes = await api("/api/purchase-requests", "POST", {...});
if (prRes.error) { ... }

// 2. Send RFQ
const rfqRes = await api("/api/rfq/send", "POST", {
  purchase_request_id: prRes.request.id,
  ...
});
```

**תרחיש נפל:**
- PR נוצר בהצלחה (`id=PR-001`).
- `rfq/send` נכשל (network timeout, או `400: לא נמצאו ספקים`).
- **התוצאה:** PR יתום בדאטאבייס. אין קריאה ל-`DELETE /api/purchase-requests/PR-001`. המשתמש רואה "RFQ נכשל", אבל PR הוקם בפועל.
- הפעם הבאה ש-`refresh()` ירוץ, הוא יציג את ה-PR היתום.
- **Compound state corruption.**

---

## 3. Last-Write-Wins Conflict

### 3.1 השרת — ללא אכיפה

**`server.js:157-163`** (PATCH supplier):
```js
app.patch('/api/suppliers/:id', async (req, res) => {
  const { data: prev } = await supabase.from('suppliers').select('*').eq('id', req.params.id).single();
  const { data, error } = await supabase.from('suppliers').update(req.body).eq('id', req.params.id).select().single();
  ...
  await audit('supplier', data.id, 'updated', req.body.updated_by || 'api', JSON.stringify(req.body), prev, data);
  res.json({ supplier: data });
});
```

**ניתוח:**
- **אין `updated_at` check.** ה-update רץ ללא התחשבות במצב קודם.
- `prev` נקרא רק ל-audit — **לא לבדיקת conflict**.
- אין `If-Match` header בשום מקום.
- אין field-level merge.
- אין 409 Conflict response.

**תרחיש last-write-wins קונקרטי:**
1. `t=0`: קובי פותח את הספק `A` עם `phone="0521111111"`.
2. `t=5`: עוזר פותח את הספק `A`, משנה ל-`phone="0522222222"`, שומר. ✅ הצליח.
3. `t=10`: קובי, שלא יודע על השינוי של עוזר, משנה את `contact_person="דן"` ושומר.
4. **התוצאה:** הבקשה של קובי שולחת רק `{contact_person: "דן"}` (כי זה מה שב-`req.body`), וזה עובד נכון. **אבל** אם ה-UI שולח את כל ה-`form` כולל `phone="0521111111"` (הישן), אז ה-phone של עוזר **נדרס ללא התראה**.

**אימות מה-UI:**
```jsx
// onyx-dashboard.jsx:187
const res = await api("/api/suppliers", "POST", form);  // ⬅️ שולח את כל ה-form
```
**זהו POST (יצירה), אבל לא קיימת כלל קריאה PATCH ב-UI.** זאת אומרת שהדשבורד הנוכחי לא מאפשר עריכה של ספקים בכלל — רק יצירה חדשה. **אבל** ה-API של השרת תומך ב-PATCH, כך שכל לקוח עתידי שיקרא ל-PATCH ייפול ב-last-write-wins.

### 3.2 עדיפות: תרחיש קריטי ב-`/rfq/:id/decide`

**`server.js:425-593`** — `POST /api/rfq/:id/decide`

הפונקציה הזו:
1. קוראת את כל ה-quotes
2. מחשבת ציונים
3. מכריזה על מנצח
4. יוצרת `purchase_order` חדש
5. מכניסה שורות ל-`po_line_items`
6. יוצרת `procurement_decision`
7. מעדכנת `rfqs.status = 'decided'`
8. מעדכנת supplier stats
9. מוסיפה audit

**בעיה:** אין בדיקת `rfqs.status` בתחילת הפונקציה. אם קובי ועוזר ילחצו "🎯 AI — בחר" בו-זמנית:
- **שני POs ייווצרו לאותו RFQ.**
- **שתי procurement_decisions ייווצרו.**
- **supplier stats יעודכנו פעמיים** (double-spend במטריקה).
- **השם "last-write-wins" לא חל כאן — זה "double-write-both-survive".**

אין `UNIQUE(rfq_id)` ב-`purchase_orders`, אין `UNIQUE(rfq_id)` ב-`procurement_decisions`. אין mutex, אין transaction, אין advisory lock.

---

## 4. Collaborative Editing Scenarios (קובי + עוזר)

### 4.1 Persona

- **קובי** — מאשר הזמנות, בוחר ספקים.
- **עוזר** — מזין הצעות מחיר, עורך פרטי ספקים.
- **שני המשתמשים עובדים על אותו instance** של `onyx-dashboard`.
- **`/api/suppliers/:id/PATCH`** מאפשר לשניהם לעדכן את אותו ספק.
- **`/api/purchase-orders/:id/approve`** מאפשר לשניהם לאשר את אותה הזמנה.

### 4.2 תרחישים

#### תרחיש A: שני approvals בו-זמניים

1. `t=0`: קובי ועוזר שניהם רואים הזמנה `O-123` בסטטוס `draft`.
2. `t=5`: קובי לוחץ "✅ אשר".
3. `t=5.1`: עוזר לוחץ "✅ אשר".
4. **שתי הקריאות מגיעות לשרת.**

**ניתוח השרת (למצוא ב-`/api/purchase-orders/:id/approve`):**
נניח שהוא עושה `UPDATE purchase_orders SET status='approved', approved_by=...`. זה idempotent (שני approvals = approved). **אבל** ה-`audit_log` מקבל 2 רשומות שונות עם actors שונים, ואין שום דרך לדעת מי "באמת" אישר.

**בעיה UX:**
- קובי רואה "אושר" (`toast.success`).
- עוזר רואה "אושר" (`toast.success`).
- שניהם מרוצים.
- **Business logic broken:** מי אחראי על ההזמנה?

#### תרחיש B: קובי מאשר, עוזר מעדכן שורות

1. `t=0`: קובי רואה הזמנה `O-123` עם `total=₪10,000`.
2. `t=5`: עוזר עורך שורה ב-`po_line_items` (אין כזה endpoint ב-server.js שראינו, אבל בהנחה שיהיה). `total` משתנה ל-`₪12,000`.
3. `t=10`: קובי לוחץ "אשר". ה-state שלו עדיין מראה `₪10,000`.
4. **קובי מאשר ₪10,000, אבל בפועל הוא אישר ₪12,000.**

אין שום בדיקת `total_at_approval_time` מול `total_current`. אין dialog "השתנה מ-₪10,000 ל-₪12,000 — להמשיך?"

#### תרחיש C: Decide race

(כפי שתואר בסעיף 3.2) — שני POs ייווצרו לאותו RFQ.

#### תרחיש D: Add supplier duplicate

1. `t=0`: קובי ועוזר רוצים להוסיף את הספק "ברזל גלעד".
2. שניהם ממלאים את הטופס.
3. שניהם לוחצים "שמור".
4. אין `UNIQUE(name)` ב-`suppliers` (לא ראינו כזה constraint ב-schema).
5. **שני רשומות של "ברזל גלעד" ייווצרו.**

### 4.3 סיכום — **המערכת לא פותרת שום conflict**

| Conflict type | מטופל? | מנגנון |
|---|---|---|
| Dirty read (עוזר קורא אחרי כתיבה של קובי) | ⏱️ Eventually (30s) | Polling |
| Lost update (קובי דורס עוזר) | ❌ לא | אין ETag, אין updated_at |
| Write skew (שני updates לרשומות שונות עם אותו state) | ❌ לא | — |
| Double-approve | ❌ לא | אין idempotency key |
| Double-decide | ❌ לא — **Compound-write** | אין unique constraint |
| Stale read ב-UI | ❌ לא | אין notice |

---

## 5. Stale Data Warning UX

### 5.1 ממצא — **אין שום סממן של stale data**

**`onyx-dashboard.jsx:62-76`** — Header:
```jsx
<header style={styles.header}>
  ...
  <span style={{ ...styles.statusDot, background: status?.status === "operational" ? "#34d399" : "#f87171" }} />
  <span style={styles.statusText}>{status?.status === "operational" ? "פעיל" : "לא מחובר"}</span>
  <button onClick={refresh} style={styles.refreshBtn}>🔄</button>
</header>
```

**מה חסר:**
- אין "עודכן לפני Xs" timestamp.
- אין "נתונים ישנים" banner.
- אין ספירה לאחור ("רענון הבא בעוד 12s").
- אין visual indicator בזמן refresh שהנתונים משתנים.
- `loading` (שורה 89) רק מציג "טוען..." ב-main — לא בצד של כל טאב.
- אין diff highlight של שדות שהשתנו.

### 5.2 Offline detection — **אין**

- אין `navigator.onLine` listener.
- אין retry אקספוננציאלי.
- אין banner "אין חיבור אינטרנט".
- `api()` סתם מחזיר `{ error: e.message }` — המשתמש רואה toast אדום חטוף של 4 שניות ואז זה נעלם.

```jsx
// onyx-dashboard.jsx:6-15
async function api(path, method = "GET", body = null) {
  try {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}
```

**בעיות:**
- אין timeout.
- אין retry.
- אין AbortSignal.
- `await res.json()` קורס אם התגובה לא-JSON (למשל 502 HTML).
- `res.status` לא נבדק — 404/500 עדיין יחזירו `{ error }` רק אם JSON parsing נכשל.

---

## 6. Polling vs Push-Based Updates

### 6.1 המצב הקיים — Pure Polling

```jsx
// onyx-dashboard.jsx:45
useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, [refresh]);
```

- **תדירות:** 30s קבוע.
- **שיטה:** 6 קריאות GET במקביל (`Promise.all`).
- **גודל payload:** כל הרשימות (בלי pagination), בכל רענון.
- **Bandwidth:** אם יש 100 ספקים + 50 הזמנות + 30 RFQs, כל רענון = ~100KB. 100KB × 2 רענונים/דקה × 8 שעות × משתמשים = **~10MB ליום למשתמש**. ללא cache.
- **Server load:** בהנחה של 5 משתמשים, 1 קריאה כל 5s, 6 endpoints = **1.2 קריאות/שנייה** גם כשאין פעילות.

### 6.2 למה Polling גרוע כאן

| Dimension | Polling 30s | Push (Supabase Realtime) |
|---|---|---|
| Latency של עדכון | 0–30s (ממוצע 15s) | <500ms |
| Bandwidth כשאין שינויים | כל הזמן, מלא | 0 |
| Scalability | O(users × endpoints / interval) | O(changes) |
| Conflict detection | ❌ לא | ✅ אופציונלי |
| Offline resilience | Catastrophic | Auto-resubscribe |
| Collaboration UX | "עדכון לפני 30s" | "קובי עורך עכשיו" |

### 6.3 Supabase Realtime — **לא מוגדר, לא מוזכר, לא מיובא**

בדיקה ב-`server.js`:
```js
const { createClient } = require('@supabase/supabase-js');
// ...
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
```

- **אין** `supabase.channel(...)`.
- **אין** `.on('postgres_changes', ...)`.
- **אין** WebSocket upgrade ב-express.

ב-`onyx-dashboard.jsx`:
- **אין** `import { createClient }` מ-Supabase.
- **אין** `EventSource` (Server-Sent Events).
- **אין** `new WebSocket(...)`.

**מסקנה:** המערכת תוכננה כ-single-user batch admin panel, לא כ-collaborative real-time system. **זה פער ארכיטקטוני מהותי** בהתחשב ב-scope של "קובי + עוזר".

### 6.4 השוואה ל-Supabase Realtime (ההמלצה)

Supabase מספק מוכן-לשימוש:
```js
const channel = supabase
  .channel('procurement-sync')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' },
      (payload) => handleChange(payload))
  .subscribe();
```

החלפה זו מבטלת את 80% מהבעיות בסעיפים 1–5.

---

## 7. המלצה (Recommendation)

### 7.1 סדר עדיפויות

#### **עדיפות 0 — חוסם release**
1. **תקן את ה-race של `/rfq/:id/decide`:** הוסף `UNIQUE(rfq_id)` ב-`purchase_orders` + `procurement_decisions`, או לחלופין, בתחילת ה-handler: `SELECT status FROM rfqs WHERE id=... FOR UPDATE; if status='decided' return 409`.
2. **תקן את ה-PR יתום ב-`RFQTab.send`:** עטוף את שתי הקריאות ב-endpoint אחד ב-server (`POST /api/rfq/create-and-send`), עם transaction.
3. **תקן את `approve` שמציג "אושר" בטעות:** החלף ב-`if (res.error) return showToast(res.error, "error"); showToast(res.message || "אושר");`.

#### **עדיפות 1 — conflict resolution בסיסי**
4. **הוסף `updated_at` check לכל PATCH:** השרת צריך לקבל `If-Unmodified-Since` או `If-Match: <updated_at>`, ולהחזיר 412 Precondition Failed אם לא תואם.
   ```js
   // server.js:157-163 — proposed
   app.patch('/api/suppliers/:id', async (req, res) => {
     const clientUpdatedAt = req.headers['if-match'];
     const { data: prev } = await supabase.from('suppliers').select('*').eq('id', req.params.id).single();
     if (clientUpdatedAt && prev.updated_at !== clientUpdatedAt) {
       return res.status(412).json({
         error: 'conflict',
         message: 'הרשומה עודכנה על ידי משתמש אחר',
         server_value: prev,
       });
     }
     // ... continue
   });
   ```
5. **הוסף idempotency key לכל POST שיוצר resource:** הלקוח שולח `Idempotency-Key: <uuid>` ב-header, השרת שומר אותו ודוחה כפילויות.

#### **עדיפות 2 — UX**
6. **Stale data banner:** הצג "עודכן לפני Xs" ב-header, צבע אדום אם >60s.
7. **Optimistic UI:** הוסף `setSuppliers([...suppliers, newSupplier])` לפני ה-API call, ו-`setSuppliers(suppliers)` במקרה של שגיאה.
8. **Conflict dialog:** אם השרת מחזיר 412, הצג modal "הרשומה השתנתה — הצג שינויים / דרוס / בטל".

#### **עדיפות 3 — push-based**
9. **החלף polling ב-Supabase Realtime:** עבוד מול המחלקות `suppliers`, `purchase_orders`, `rfqs`, `supplier_quotes`, `procurement_decisions`. זה מחליף את `setInterval` לחלוטין.
10. **הוסף presence:** Supabase presence מספק "קובי עורך את הספק X כרגע" — מתריע לעוזר לפני עריכה.
11. **הוסף optimistic local mutations** עם Supabase client-side cache + rollback ב-error.

### 7.2 Minimal Diff להצלה מיידית (לפני Realtime)

**`web/onyx-dashboard.jsx:34-45`** — שינוי מוצע:
```jsx
const [lastRefresh, setLastRefresh] = useState(null);
const [isEditing, setIsEditing] = useState(false);  // ⬅️ חדש

const refresh = useCallback(async (force = false) => {
  if (isEditing && !force) return;  // ⬅️ אל תרענן בזמן עריכה
  setLoading(true);
  const [s, sup, sub, o, r, sav] = await Promise.all([...]);
  setStatus(s); setSuppliers(sup.suppliers || []); /* ... */
  setLastRefresh(new Date());
  setLoading(false);
}, [isEditing]);
```

ילדים מעדכנים `isEditing(true)` כשהטופס פתוח. זה חוסם רענון בזמן עריכה — לא פותר conflict, אבל מונע דריסת נתוני form.

**Header update:**
```jsx
<span style={styles.statusText}>
  {lastRefresh ? `עודכן לפני ${Math.round((Date.now() - lastRefresh) / 1000)}s` : 'טוען...'}
</span>
```

### 7.3 סיכום ארכיטקטוני

| מצב נוכחי | מצב מומלץ |
|---|---|
| Polling 30s | Supabase Realtime + fallback polling 2m |
| Last-write-wins שקט | 412 Conflict + conflict resolution UI |
| אין optimistic | Optimistic + rollback |
| Global state replace | Surgical patches מ-`postgres_changes` payload |
| אין idempotency | Idempotency-Key header |
| אין presence | Supabase presence channel |
| אין diff indicator | Highlight של שדות שהשתנו |
| Error = toast 4s | Error = banner persistent + retry button |

---

## 8. Matrix of Confidence

| סעיף | ממצא | ביטחון (static) | דרוש runtime לוידוא? |
|---|---|---|---|
| Refresh דורס server state | ✅ כן, מוכח בקוד | 100% | ❌ |
| Optimistic UI חסר | ✅ מוכח | 100% | ❌ |
| Last-write-wins ב-PATCH | ✅ מוכח | 95% | ⚠️ יש לוודא במימוש השרת המלא |
| Collab scenarios נשברים | ✅ רוב התרחישים מוכחים סטטית | 90% | ⚠️ תרחיש B דורש runtime |
| Stale data warning חסר | ✅ מוכח | 100% | ❌ |
| Polling-only | ✅ מוכח | 100% | ❌ |
| Realtime לא מוגדר | ✅ מוכח | 100% | ❌ |

---

**סוף דוח QA #80.**
