# QA Agent #68 — PWA / Service Worker / Offline Support

**פרויקט:** `onyx-procurement`
**תאריך:** 2026-04-11
**סוג בדיקה:** Static analysis בלבד (ללא הרצה)
**ממד:** PWA / Service Worker / Offline Support / Background Sync
**בודק:** QA Agent #68 — Onyx Procurement

---

## 0. תקציר מנהלים

`onyx-procurement` היא מערכת **server-first** מבוססת Express + Supabase, עם React SPA יחיד (`web/onyx-dashboard.jsx`) שמבצע `fetch` ישיר ל-`http://localhost:3100`.

**אין בפרויקט שום אלמנט PWA כלשהו — לא manifest, לא Service Worker, לא cache, לא offline, לא push, לא background sync, לא Workbox.**

זה פער **חמור ביותר עבור מקרה-השימוש של קובי**: אתר בנייה בשדה, רשת סלולרית חלשה/נופלת, צורך לשלוח RFQ/הזמנה גם כשאין קליטה. כרגע — אם קובי לוחץ "שלח RFQ" ואין רשת → `Failed to fetch` → הלוגיקה נופלת שקטה, הנתונים מאבדים, אין תור, אין indicator.

| בדיקה | תוצאה | חומרה |
|---|---|---|
| 1. PWA manifest קיים? | **לא** | P0 |
| 2. Service Worker רשום? | **לא** | P0 |
| 3. Offline-first (IndexedDB cache)? | **לא** | P0 |
| 4. Install prompt (`beforeinstallprompt`)? | **לא** | P1 |
| 5. Push notifications? | **לא** | P2 |
| 6. Background sync (queue RFQ)? | **לא** | P0 |
| 7. Workbox? | **לא** | — |

**ציון PWA:** 0/100 (baseline Lighthouse PWA = כישלון מוחלט).

---

## 1. הוכחות (Evidence)

### 1.1 Glob ל-PWA artifacts — 0 תוצאות

```
Glob: onyx-procurement/**/manifest.json         → No files found
Glob: onyx-procurement/**/manifest.webmanifest  → No files found
Glob: onyx-procurement/**/sw.js                 → No files found
Glob: onyx-procurement/**/service-worker.js     → No files found
Glob: onyx-procurement/**/workbox*.js           → No files found
```

### 1.2 Grep ל-APIs של PWA ב-כל הפרויקט (case-insensitive)

חיפשתי:
`serviceWorker | navigator.serviceWorker | workbox | manifest | beforeinstallprompt | PushManager | IndexedDB | indexedDB | offline | SyncManager | caches.open | registerSW`

**ב-קוד ריצה (`.js/.jsx`): 0 תוצאות.** כל ההופעות הן בקבצי `QA-AGENT-*.md` קודמים שתיעדו את אותו פער (ראה §9).

### 1.3 `web/onyx-dashboard.jsx` — ניתוח ישיר

קובץ אחד בלבד ב-`web/`. קריאתו מאשרת:

- **שורות 1-15:** `import { useState, useEffect, useCallback } from "react"`, `const API = "http://localhost:3100"`, ו-`async function api(path,…)` שמבצע `fetch` רגיל. **אין `navigator.serviceWorker.register()`** בשום מקום בקובץ.
- **שורות 12-14:** `try/catch` יחיד:
  ```js
  } catch (e) {
    return { error: e.message };
  }
  ```
  זו כל "טיפול ה-offline" — שגיאה מוחזרת כאובייקט, **בלי queueing, בלי retry, בלי IndexedDB, בלי persistent storage**.
- **שורות 34-45:** `refresh()` משתמש ב-`Promise.all([...])` לטעינת כל ה-state הראשי, ו-`setInterval(refresh, 30000)` כל 30 שניות. אם הרשת נופלת → כל הטאב הופך ריק בלי הודעה.
- **שורות 57-108:** ה-`return` של ה-App. **אין `<link rel="manifest">`, אין meta theme-color, אין `navigator.onLine` check, אין Offline badge.** למעשה אין כאן אפילו `<head>` — זהו JSX טהור שמצופה להיות mount-ed לתוך HTML חיצוני שלא קיים בפרויקט.
- **שורה 101:** `@import url('https://fonts.googleapis.com/css2?family=Rubik…')` — תלות רשת קשיחה; במצב offline הפונט לא ייטען.

### 1.4 `package.json` — אין תלויות PWA

```json
"dependencies": {
  "express": "^4.21.0",
  "@supabase/supabase-js": "^2.45.0",
  "dotenv": "^16.4.5",
  "cors": "^2.8.5"
}
```

**אין:** `workbox-*`, `vite-plugin-pwa`, `next-pwa`, `@vite-pwa/*`, `idb`, `idb-keyval`, `dexie`, `localforage`. אפילו אין `react` או bundler — הקובץ `.jsx` הוא standalone שלא משולב בשום build pipeline שניתן לראות בפרויקט.

### 1.5 הערה ארכיטקטונית מכרעת

בפרויקט **אין `index.html`, אין `public/`, אין bundler (Vite/Webpack/Next/CRA), אין build output, אין `dist/`**. `onyx-dashboard.jsx` יושב כקובץ בודד בתיקיית `web/`. זה אומר שאפילו אם היינו רוצים להוסיף Service Worker — **אין לאן לרשום אותו** כי אין root HTML. זו בעיה שקודמת אפילו ל-PWA: אין "אפליקציית ווב" להפוך ל-PWA.

---

## 2. בדיקה #1 — PWA Manifest

**תוצאה:** **לא קיים.** (Glob: 0 תוצאות).

**מה חסר:**
- `manifest.json` / `manifest.webmanifest` עם: `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `icons[]` (192×192 + 512×512 maskable).
- `<link rel="manifest" href="/manifest.webmanifest">` בתוך `<head>`.
- Meta tags: `<meta name="theme-color" content="#0c0f1a">` (התאמה ל-`body{background:#0c0f1a}` שראיתי בשורה 103), `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-capable" content="yes">` לתמיכה ב-iOS.
- Icons: לפחות PNG בגדלים 192, 512, ו-maskable 512.

**השפעה על קובי:** לא יכול להתקין את ONYX כ-"אפליקציה" על המסך הראשי של הטלפון. חייב לפתוח browser כל פעם. Context-switching יקר באתר בנייה.

---

## 3. בדיקה #2 — Service Worker רשום?

**תוצאה:** **לא רשום.**

- Grep ל-`navigator.serviceWorker` ב-`onyx-dashboard.jsx`: 0 תוצאות.
- Grep ל-`register(` / `registerSW(` ב-`.jsx`: 0 תוצאות.
- אין קובץ `sw.js` / `service-worker.js`.

**מה שנדרש (מינימום):**

```js
// ב-entry point של ה-SPA (שלא קיים כרגע):
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(reg => console.log("[SW] registered:", reg.scope))
      .catch(err => console.error("[SW] failed:", err));
  });
}
```

**השפעה:** ללא SW — אין שום אפשרות ל-offline, cache, background sync, או push. SW הוא ה-gateway לכל PWA features.

---

## 4. בדיקה #3 — Offline-first capability (IndexedDB cache)

**תוצאה:** **לא קיים — ואפילו אין memory-level resilience.**

- אין `indexedDB.open(...)`, אין `caches.open(...)`, אין localforage/idb/dexie.
- ה-state של React (`suppliers`, `orders`, `rfqs`…) יושב רק ב-`useState` — **ברענון דף הכל נעלם**.
- `setInterval(refresh, 30000)` (שורה 45) overwrites את ה-state כל 30 שניות ללא merge-and-reconcile — כל החלפת טאב בזמן תקלת רשת → מסך ריק.

**מה נדרש:**

1. **IDB via `idb` (wrapper רזה של Jake Archibald):**
   ```js
   import { openDB } from "idb";
   const db = await openDB("onyx", 1, {
     upgrade(db) {
       db.createObjectStore("suppliers", { keyPath: "id" });
       db.createObjectStore("orders", { keyPath: "id" });
       db.createObjectStore("rfqs", { keyPath: "id" });
       db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
     }
   });
   ```
2. **Cache-then-network pattern:** SW מחזיר קודם את ה-cache, ואז מעדכן ברקע (stale-while-revalidate).
3. **Workbox Strategies:**
   - `/api/suppliers`, `/api/subcontractors` → **StaleWhileRevalidate** (משתנים לאט)
   - `/api/status`, `/api/analytics/savings` → **NetworkFirst** (דורש עדכנות, fallback ל-cache)
   - `/api/purchase-orders`, `/api/rfqs` → **NetworkFirst** + **BackgroundSyncPlugin** ל-POSTs

**השפעה על קובי:** כרגע ללא רשת ה-dashboard לחלוטין שבור. לא רואה רשימת ספקים, לא רואה הזמנות פתוחות. זה בלתי-קביל לאתר בנייה.

---

## 5. בדיקה #4 — Install prompt

**תוצאה:** **לא קיים.**

- אין listener על `beforeinstallprompt`.
- אין כפתור "התקן" ב-UI (ב-`DashboardTab` / Header אין שום CTA כזה).
- אין `deferredPrompt.prompt()`.

**מה נדרש:**
```js
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  setShowInstallBanner(true);  // RTL banner: "הוסף את ONYX למסך הבית"
});
```

**השפעה:** חוויית install ידנית דרך Chrome menu → רוב המשתמשים לא ימצאו. קובי צריך כפתור חד-משמעי: **"התקן כאפליקציה"**.

**חשוב:** `beforeinstallprompt` דורש שה-PWA יעמוד בתנאי התקנה (manifest תקין + SW שמרשום + `start_url` נגיש) — כרגע אף אחד מהשלושה לא מתקיים.

---

## 6. בדיקה #5 — Push notifications

**תוצאה:** **לא קיים.**

- אין `PushManager`, אין `Notification.requestPermission()`, אין VAPID keys.
- בצד השרת (`server.js`) אין endpoint `/api/push/subscribe` או `/api/push/send`. כבר ב-QA-AGENT-52-NOTIFY-ROUTING אין web-push.

**Use case עבור קובי (גבוה):**
- **"הצעת מחיר חדשה ל-RFQ-1247"** — ברגע שהצעה מגיעה מספק ב-WhatsApp והמערכת מנרמלת אותה.
- **"הזמנה HZ-882 סומנה כ-delivered"** — מהקבלן.
- **"חריגה תקציבית ב-Job-14"** — התראה חכמה.

**מה נדרש:**
1. Generate VAPID keys.
2. `const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUB })`.
3. POST `sub` ל-`/api/push/subscribe`, שמירה ב-Supabase.
4. שרת ישתמש ב-`web-push` npm package לשליחה.
5. `sw.js` יטפל ב-`self.addEventListener("push", …)` + `self.registration.showNotification(...)`.
6. **ב-iOS דורש iOS 16.4+ ו-PWA מותקן ל-Home Screen** — תנאי שוב תלוי manifest+SW.

---

## 7. בדיקה #6 — Background sync (queue RFQ when offline) — **הקריטי ביותר**

**תוצאה:** **לא קיים. זו הפער הכי כואב לקובי.**

**התרחיש:**
> קובי עומד באתר בתל אביב, רשת 3G חלשה. הוא ממלא טופס RFQ, לוחץ "שלח". הטלפון מאבד רשת באמצע. כרגע → `api("/api/rfqs", "POST", ...)` זורק `catch` → `{ error: "Failed to fetch" }` → `showToast(error)` → **הנתונים מאבדים לחלוטין**, קובי חושב שהוא שלח ולא יודע שזה נכשל.

**מה נדרש (Workbox BackgroundSyncPlugin):**

```js
// sw.js
import { BackgroundSyncPlugin } from "workbox-background-sync";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

const bgSyncPlugin = new BackgroundSyncPlugin("onyx-outbox", {
  maxRetentionTime: 24 * 60,  // 24 שעות
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
      } catch (err) {
        await queue.unshiftRequest(entry);
        throw err;
      }
    }
    // התראה אחרי שהתור התרוקן:
    self.registration.showNotification("ONYX", {
      body: "כל ה-RFQs מ-offline נשלחו בהצלחה",
      icon: "/icons/192.png",
    });
  }
});

registerRoute(
  ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "POST",
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  "POST"
);
```

**ב-client (`onyx-dashboard.jsx`) — חובה גם fallback ל-idempotency:**
- הוספת `client_request_id` (UUID) לכל POST, כך שהשרת יזהה כפילויות אם ה-background sync שולח פעמיים.
- UI indicator: "⏳ RFQ בתור (3)" כשיש פריטים ב-outbox.
- גישור ל-`navigator.onLine` + `window.addEventListener("online"/"offline", …)`.

**BackgroundSyncPlugin תלוי ב-SyncManager API** — זמין ב-Chrome/Edge/Samsung Internet אבל **לא ב-Safari/iOS**. עבור iOS צריך fallback ידני: בדיקת `navigator.onLine` ב-foreground + retry loop מ-IDB outbox.

---

## 8. בדיקה #7 — המלצה: Workbox לשימוש של קובי באתר בנייה

### 8.1 למה Workbox ולא SW ידני?

| יכולת | SW ידני | **Workbox** |
|---|---|---|
| זמן פיתוח למערכת בסדר גודל הזה | 3-5 ימים | **4-6 שעות** |
| Cache invalidation נכון | קשה; rollbacks נוטים להישאר cached | אוטומטי (revision-based) |
| Strategies (SWR, NetworkFirst, …) | כותבים ידנית עם caches API | מוכן כקוד של שורה אחת |
| Background Sync | לכתוב queue ב-IDB + logic + retry | `new BackgroundSyncPlugin()` |
| Navigation preload | ידני | flag אחד |
| תמיכה ב-TypeScript & debugging | גולמי | מובנה |
| גודל runtime | מינימלי | ~15KB gzipped |
| תחזוקה ארוכת-טווח | דוחה ליקוי טכני עתידי | Google-maintained |

**המלצה מוחלטת: Workbox.** זה standard התעשייה ב-2026, מתוחזק על-ידי Google Chrome team, ומבוסס-production ברוב ה-PWAs הגדולים (Twitter, Pinterest, Starbucks).

### 8.2 החבילות הספציפיות המומלצות

```json
{
  "devDependencies": {
    "workbox-cli": "^7.1.0",
    "vite-plugin-pwa": "^0.20.5"
  },
  "dependencies": {
    "idb": "^8.0.0"
  }
}
```

**למה `vite-plugin-pwa` ולא CLI טהור?**
- בפרויקט אין כרגע שום bundler → ממילא חובה להוסיף Vite. `vite-plugin-pwa` נותן:
  1. Auto-generation של `sw.js` עם Workbox precaching מלא לכל ה-build output.
  2. `registerType: "autoUpdate"` — SW מתעדכן אוטומטית ברקע ללא פעולת משתמש.
  3. `injectRegister: "auto"` — רישום SW מוכנס ל-HTML אוטומטית.
  4. אינטגרציה עם React dev server ל-debugging.

### 8.3 Strategies מומלצות לפי endpoint של ONYX

| Route | Strategy | סיבה |
|---|---|---|
| `GET /api/status` | NetworkFirst (timeout 3s → cache) | קובי רוצה לראות "פעיל" real-time, אבל אם אין רשת — cache עדיף על ריק |
| `GET /api/suppliers` | StaleWhileRevalidate | רשימת ספקים משתנה לאט; מציגים מיד מה-cache ומעדכנים ברקע |
| `GET /api/subcontractors` | StaleWhileRevalidate | אותו היגיון |
| `GET /api/purchase-orders` | NetworkFirst | דורש עדכנות |
| `GET /api/rfqs` | NetworkFirst | דורש עדכנות |
| `GET /api/analytics/savings` | CacheFirst (TTL 1h) | כבד, לא משתנה הרבה |
| `POST /api/rfqs` | NetworkOnly + BackgroundSyncPlugin | **קריטי** — חייב להיות מוקלט ב-outbox בזמן offline |
| `POST /api/purchase-orders` | NetworkOnly + BackgroundSyncPlugin | **קריטי** — כנ"ל |
| `POST /api/suppliers` | NetworkOnly + BackgroundSyncPlugin | fallback |
| `https://fonts.googleapis.com/*` | CacheFirst (TTL 365d) | font Rubik שמיובא בשורה 101 ב-`onyx-dashboard.jsx` |
| static assets (JS/CSS/icons) | precacheAndRoute (Workbox default) | build output |

### 8.4 התאמה ל-use case של קובי — 7 "must"s קונקרטיים

1. **Outbox visibility:** badge על Header עם מספר הפריטים הממתינים בתור (`📤 3 בתור`). חייב שיהיה ברור לקובי שמשהו מחכה לרשת.
2. **Offline banner:** כל מסך → banner עליון אדום RTL: "⚠️ אין חיבור — הנתונים נשמרים מקומית". יופיע ב-`window.addEventListener("offline", …)`.
3. **Retry button ידני:** ליד כל פריט באאוטבוקס — "נסה שוב עכשיו".
4. **Idempotency מהצד הלקוח:** כל POST מקבל `client_request_id` (crypto.randomUUID()) → השרת מזהה כפילויות גם אם ה-BG sync שלח פעמיים.
5. **IDB mirror של הטבלאות המרכזיות:** `suppliers`, `subcontractors`, `rfqs`, `purchase-orders` → ב-`onyx` DB (store per entity). טעינה ראשונה → טוענים מ-IDB מיד, ואז מעדכנים מהרשת.
6. **Periodic background sync ל-status:** במובייל Android, `periodicSync` של 15 דקות לעדכן `/api/status` אפילו כשהאפליקציה סגורה — ככה קובי רואה עדכון גם בלי פתיחה.
7. **iOS graceful degradation:** ב-Safari אין `SyncManager`; fallback ל-`navigator.onLine` listener + retry loop פשוט מ-IDB outbox. תיעוד מפורש בקוד שה-Path הזה פחות אמין ולהמליץ לקובי להשתמש במכשיר Android.

---

## 9. הקשר קודם (QA-AGENT-36 MOBILE)

ב-`QA-AGENT-36-MOBILE.md` שורה 240, 267, 275, 277, 328, 330, 347 — הפער הזה **כבר תועד**:

> **Glob ל-`manifest.json` בכל `onyx-procurement`:** 0 תוצאות.
> **Offline Support — אין**
> **Offline queue ל-POSTs — אם קובי לוחץ "שלח RFQ" בלי רשת, צריך לשמור ב-IndexedDB ולשלוח כשחוזרת רשת**
> **No offline indicator — אין שום נראות למשתמש אם אין רשת.**
> **Gap לייצור-מוכן-למובייל: גדול.**

**QA-68 מחזק ומאשר:** זה לא התקדם. שום דבר מאז QA-36 לא שונה בנוגע ל-PWA. מדובר באותו פער בדיוק, עם פירוט עמוק יותר למתווה התיקון.

**צומת החלטה ניהולית:** PWA הוא דרישה קריטית של use-case קובי (שדה → מובייל → offline). אי-מימוש זה אומר שהמערכת לא באמת שמישה באתר בנייה אמיתי. כל השאר (WhatsApp templates, RFQ engine, savings analytics) לא שווה כלום אם קובי לא יכול לגעת במערכת באמצע יום עבודה ברשת חלשה.

---

## 10. Roadmap מומלץ לתיקון (בסדר עדיפויות)

### שלב 0 — תשתית בסיסית (ללא בניית PWA, בלי זה א"א להתחיל) — **1-2 ימים**
- [ ] להוסיף `index.html` + Vite kit (`npm create vite@latest web -- --template react`).
- [ ] להעביר את `onyx-dashboard.jsx` כקומפוננטה ראשית תחת `src/App.jsx`.
- [ ] לוודא שה-build יוצר `dist/` תקין.
- [ ] לעבור מ-CSS inline (object style בקובץ) ל-tailwind / CSS modules — כי אין `<head>` היום, ה-JSX לא שימושי בלי root HTML.

### שלב 1 — PWA baseline — **4-6 שעות**
- [ ] `npm i -D vite-plugin-pwa` + `npm i idb`.
- [ ] להוסיף `vite-plugin-pwa` ל-`vite.config.js` עם `registerType: "autoUpdate"`, `manifest: {...}`, `workbox: {...}`.
- [ ] ליצור icons 192/512/maskable-512 (אפשר generator אונליין).
- [ ] לאמת ב-Chrome DevTools → Application → Manifest → Installable ✅.
- [ ] Lighthouse PWA audit → לפחות 90.

### שלב 2 — Offline reads — **1-2 ימים**
- [ ] להגדיר runtime caching בכל GET endpoint כמו בטבלת §8.3.
- [ ] Mirror ל-IDB של `suppliers`, `subcontractors`, `rfqs`, `orders` עם מפתחות (`id`).
- [ ] UI: טעינה ראשונה → מ-IDB; אחר כך → refresh מ-API.

### שלב 3 — Background sync ל-POSTs (**קריטי**) — **2-3 ימים**
- [ ] BackgroundSyncPlugin על כל `/api/*` POST.
- [ ] Client-side `client_request_id` (UUID) לכל בקשה.
- [ ] Server-side idempotency check ב-`server.js` (אם עדיין לא קיים — QA-AGENT-40-CONCURRENCY בוודאי דיבר על זה).
- [ ] Outbox UI: badge ב-Header, רשימת pending, retry button.
- [ ] iOS fallback: `online`/`offline` listeners + ידני.

### שלב 4 — Push notifications — **2-3 ימים**
- [ ] Generate VAPID keys, שמירה ב-`.env`.
- [ ] `web-push` ב-server.js.
- [ ] Endpoint `POST /api/push/subscribe` → Supabase `push_subscriptions` table.
- [ ] Trigger push ב-"new quote arrived" / "order status changed" / "budget exceeded".
- [ ] `sw.js` handler ל-`push` event + `notificationclick` → deep link לטאב הנכון.

### שלב 5 — Install prompt UX — **0.5 יום**
- [ ] `beforeinstallprompt` listener + כפתור "התקן" ב-Header.
- [ ] A/B test ה-copy: "הוסף את ONYX למסך הבית" vs "התקן כאפליקציה".
- [ ] Tracking של install rate.

**סה"כ:** ~7-11 ימי פיתוח למערכת PWA מלאה ויצירתית. אפשר לפצל לפיצ'רים — שלבים 0+1+2+3 הם הכרחיים; 4+5 הם nice-to-have.

---

## 11. ציונים ומסקנות

| קטגוריה | ציון | הערה |
|---|---|---|
| PWA Manifest | 0/10 | לא קיים כלל |
| Service Worker | 0/10 | לא קיים כלל |
| Offline reads | 0/10 | לא קיים, אין אפילו cache בזיכרון |
| Offline writes / BG sync | 0/10 | **קריטי לקובי, לא קיים** |
| Install prompt | 0/10 | לא קיים |
| Push notifications | 0/10 | לא קיים |
| Workbox integration | 0/10 | לא קיים |
| **Overall PWA Readiness** | **0/100** | Greenfield — תיקון דורש תשתית חדשה |

**חומרה כוללת:** **P0 — Blocker עבור use-case אתר בנייה.**

**Action Item מיידי:** לפני כל fichaje נוסף על המערכת, לעצור ולהחליט: **האם ONYX מיועדת לשימוש שדה (מובייל + offline)?** אם כן — PWA חובה עכשיו, לא דחייה. אם לא — המערכת כולה שגויה ב-positioning שלה ל-"טכנו כל עוזי" שמתארת את עצמה כמערכת רכש לאתר בנייה.

---

*נכתב על-ידי QA Agent #68 — Static analysis בלבד. אין הרצת runtime, אין Lighthouse בפועל, אין Chrome DevTools — רק ניתוח קוד מ-glob/grep/read של מבנה הפרויקט כפי שהוא כרגע ב-2026-04-11.*
