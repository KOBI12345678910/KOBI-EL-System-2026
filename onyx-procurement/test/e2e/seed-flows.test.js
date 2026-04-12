/**
 * AG-X86 — Seed E2E flows / זרימות E2E מובנות
 * ============================================================
 * Techno-Kol Uzi mega-ERP — 2026-04-11
 *
 * Ten bilingual end-to-end flows exercising the E2E harness
 * (`src/e2e/e2e-harness.js`). Each flow launches a throw-away mock
 * static server, drives the page via the harness, and asserts on
 * content.
 *
 * These tests run on CI with zero dependencies. They work in both
 * modes:
 *
 *   - CDP mode: if a Chromium is available on :9222 the harness
 *     connects to it automatically and clicks real DOM nodes.
 *   - HTTP mode (default on CI): the harness fetches the mock
 *     server's HTML and matches selectors against the returned
 *     markup with a tiny regex-based querySelector.
 *
 * Flows covered (required by Kobi's spec):
 *   1. login                                  / התחברות
 *   2. dashboard load                         / טעינת לוח מחוונים
 *   3. create supplier                        / יצירת ספק
 *   4. create invoice                         / יצירת חשבונית
 *   5. upload PDF                             / העלאת PDF
 *   6. run payroll preview                    / תצוגה מקדימה של שכר
 *   7. view VAT report                        / צפייה בדוח מע״מ
 *   8. create PO                              / יצירת הזמנת רכש
 *   9. approve PO                             / אישור הזמנת רכש
 *  10. logout                                 / התנתקות
 *
 * Rule compliance: לא מוחקים, רק משדרגים ומגדלים.
 *  - this file is additive. It does not replace or remove any of the
 *    qa-04-*.test.js files already in this folder.
 *  - it uses only the built-in `node:test` runner plus the harness,
 *    matching the convention in the other test files here.
 * ============================================================
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  E2E,
  E2ERunner,
  expect,
  createMockServer,
} = require('../../src/e2e/e2e-harness.js');

// ────────────────────────────────────────────────────────────
// Mock HTML pages — a minimal procurement ERP surface
// ────────────────────────────────────────────────────────────
//
// Every page has `dir="rtl" lang="he"`, a bilingual title, and the
// specific hooks each test looks for. Pages form a linked mini-site:
// /login → /dashboard → /suppliers/new → /invoices/new → /upload …
// Each <a href="…"> is a real link that the harness can follow via
// `page.click()` in HTTP mode.

const PAGES = {
  '/login.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>התחברות / Login</title></head>
<body>
  <h1 id="title">ברוכים הבאים / Welcome</h1>
  <form id="login-form" action="/dashboard.html" method="get">
    <label for="email">אימייל / Email</label>
    <input type="email" id="email" name="email" required>
    <label for="password">סיסמה / Password</label>
    <input type="password" id="password" name="password" required>
    <a id="login-btn" class="btn-primary" href="/dashboard.html">כניסה / Sign in</a>
  </form>
</body></html>`,

  '/dashboard.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>לוח מחוונים / Dashboard</title></head>
<body>
  <div id="dashboard-root" class="dashboard" data-role="user">
    <h1>לוח מחוונים / Dashboard</h1>
    <nav>
      <a href="/suppliers/new.html" id="nav-suppliers">ספקים / Suppliers</a>
      <a href="/invoices/new.html" id="nav-invoices">חשבוניות / Invoices</a>
      <a href="/po/new.html" id="nav-po">הזמנות רכש / Purchase Orders</a>
      <a href="/vat/report.html" id="nav-vat">דוח מע״מ / VAT Report</a>
      <a href="/payroll/preview.html" id="nav-payroll">תלושי שכר / Payroll</a>
      <a href="/upload.html" id="nav-upload">העלאת מסמכים / Upload</a>
      <a href="/logout.html" id="nav-logout">התנתקות / Logout</a>
    </nav>
    <div class="kpi">
      <span data-kpi="suppliers">13</span>
      <span data-kpi="invoices-month">42</span>
      <span data-kpi="po-open">7</span>
    </div>
  </div>
</body></html>`,

  '/suppliers/new.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>ספק חדש / New Supplier</title></head>
<body>
  <h1 id="supplier-title">ספק חדש / New Supplier</h1>
  <form id="supplier-form" action="/suppliers/created.html" method="get">
    <input id="supplier-name" name="name">
    <input id="supplier-tax-id" name="taxId">
    <input id="supplier-iban" name="iban">
    <a id="save-supplier" class="btn-save" href="/suppliers/created.html">שמור / Save</a>
  </form>
</body></html>`,

  '/suppliers/created.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>ספק נוצר / Supplier Created</title></head>
<body>
  <div id="success-banner" class="toast success">ספק נוצר בהצלחה / Supplier created successfully</div>
  <a href="/dashboard.html" id="back-dash">חזרה ללוח מחוונים</a>
</body></html>`,

  '/invoices/new.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>חשבונית חדשה / New Invoice</title></head>
<body>
  <h1 id="invoice-title">חשבונית חדשה / New Invoice</h1>
  <form id="invoice-form" action="/invoices/created.html" method="get">
    <select id="invoice-supplier"><option>ספק 1</option></select>
    <input id="invoice-number" name="number">
    <input id="invoice-amount" name="amount" type="number">
    <input id="invoice-vat" name="vat" type="number" value="17">
    <a id="submit-invoice" class="btn-submit" href="/invoices/created.html">שמור חשבונית / Save Invoice</a>
  </form>
</body></html>`,

  '/invoices/created.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>חשבונית נוצרה / Invoice Created</title></head>
<body>
  <div id="success-banner" class="toast success">חשבונית נוצרה / Invoice created</div>
  <div id="invoice-total" data-total="1170">₪1,170.00</div>
</body></html>`,

  '/upload.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>העלאת קובץ / File Upload</title></head>
<body>
  <h1 id="upload-title">העלאת PDF / Upload PDF</h1>
  <form id="upload-form" action="/upload/done.html" method="get" enctype="multipart/form-data">
    <input id="file-input" type="file" accept="application/pdf">
    <a id="upload-btn" class="btn-upload" href="/upload/done.html">העלה / Upload</a>
  </form>
</body></html>`,

  '/upload/done.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>הועלה / Uploaded</title></head>
<body>
  <div id="upload-result" class="toast success">
    הקובץ הועלה בהצלחה — invoice-2026-0042.pdf / File uploaded successfully
  </div>
  <div data-parsed-total="1170">מע״מ 17%: ₪170.00</div>
</body></html>`,

  '/payroll/preview.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>תצוגה מקדימה שכר / Payroll Preview</title></head>
<body>
  <h1 id="payroll-title">תצוגה מקדימה שכר מרץ 2026 / Payroll Preview Mar 2026</h1>
  <div id="payroll-root" class="payroll">
    <table id="payroll-table">
      <tr data-emp="001"><td>אובזי כהן</td><td class="gross">12,500</td><td class="net">9,840</td></tr>
      <tr data-emp="002"><td>רחל לוי</td><td class="gross">15,200</td><td class="net">11,230</td></tr>
    </table>
    <button id="payroll-approve" class="btn-primary">אישור תלושים / Approve Slips</button>
  </div>
</body></html>`,

  '/vat/report.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>דוח מע״מ / VAT Report</title></head>
<body>
  <h1 id="vat-title">דוח מע״מ Q1 2026 / VAT Report Q1 2026</h1>
  <div id="vat-root" class="vat">
    <div data-vat-field="sales">₪125,000</div>
    <div data-vat-field="purchases">₪41,200</div>
    <div data-vat-field="net" id="vat-net">₪14,246</div>
    <a id="export-pcn" class="btn-export" href="/vat/exported.html">ייצוא PCN836 / Export PCN836</a>
  </div>
</body></html>`,

  '/vat/exported.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>יוצא PCN836 / PCN836 Exported</title></head>
<body>
  <div id="export-result" class="toast success">PCN836 יוצא בהצלחה / PCN836 exported successfully</div>
</body></html>`,

  '/po/new.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>הזמנת רכש חדשה / New PO</title></head>
<body>
  <h1 id="po-title">הזמנת רכש חדשה / New Purchase Order</h1>
  <form id="po-form" action="/po/pending.html" method="get">
    <select id="po-supplier"><option>ספק הגג והצבע</option></select>
    <input id="po-amount" type="number" value="4200">
    <input id="po-project" value="P-2026-012">
    <a id="submit-po" class="btn-submit" href="/po/pending.html">שמור / Save</a>
  </form>
</body></html>`,

  '/po/pending.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>ממתין לאישור / Pending Approval</title></head>
<body>
  <h1 id="po-status">ממתין לאישור / Pending Approval</h1>
  <div class="po-card" data-po="PO-2026-0099" data-status="pending">
    <span>ספק הגג והצבע</span><span>₪4,200</span>
  </div>
  <a id="approve-po" class="btn-approve" href="/po/approved.html">אשר הזמנה / Approve PO</a>
</body></html>`,

  '/po/approved.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>אושר / Approved</title></head>
<body>
  <div id="approval-banner" class="toast success">
    הזמנה אושרה ונשלחה לספק / PO approved and sent to supplier
  </div>
  <div class="po-card" data-po="PO-2026-0099" data-status="approved"></div>
</body></html>`,

  '/logout.html': /* html */ `
<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>התנתקות / Logout</title></head>
<body>
  <h1 id="logout-title">להתראות / Goodbye</h1>
  <div id="logout-msg">התנתקת בהצלחה / You have been logged out</div>
  <a id="login-again" href="/login.html">התחבר שוב / Sign in again</a>
</body></html>`,

  '/*404': '<!doctype html><html><body><h1>404</h1></body></html>',
};

// ────────────────────────────────────────────────────────────
// Shared fixture — single mock server + single browser for the
// whole suite. Cheap in HTTP mode, matches Playwright conventions.
// ────────────────────────────────────────────────────────────

let MOCK = null;
let BROWSER = null;

async function getBrowser() {
  if (!MOCK) MOCK = await createMockServer({ pages: PAGES });
  if (!BROWSER) {
    BROWSER = await E2E.launch({
      headless: true,
      viewport: { width: 1280, height: 800 },
      // HTTP fallback kicks in automatically if Chromium is not on :9222.
    });
  }
  return { browser: BROWSER, base: MOCK.url };
}

async function closeAll() {
  try { if (BROWSER) await BROWSER.close(); } catch (_) {}
  try { if (MOCK) await MOCK.close(); } catch (_) {}
  BROWSER = null;
  MOCK = null;
}

// Also expose a Runner-based execution for anyone that wants to call
// `node seed-flows.test.js` directly outside of node:test.
const localRunner = new E2ERunner();

// ────────────────────────────────────────────────────────────
// 1. login / התחברות
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 1 — login / התחברות', async (t) => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/login.html`);
  await page.fill('#email', 'kobi@technokol.co.il');
  await page.fill('#password', 'SuperSecret!1');
  await page.click('#login-btn');
  await page.waitFor('#dashboard-root', { timeout: 5000 });
  expect(page.url()).toContain('/dashboard.html');
  expect(await page.content()).toContain('לוח מחוונים');
  await page.close();
});

localRunner.addTest('flow 1 — login / התחברות', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/login.html`);
  await p.click('#login-btn');
  expect(p.url()).toContain('dashboard');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 2. dashboard load / טעינת לוח מחוונים
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 2 — dashboard load / טעינת לוח מחוונים', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/dashboard.html`);
  await page.waitFor('#dashboard-root', { timeout: 2000 });
  const html = await page.content();
  expect(html).toContain('לוח מחוונים');
  expect(html).toMatch(/data-kpi="suppliers"/);
  expect(html).toMatch(/data-kpi="invoices-month"/);
  expect(html).toContain('13'); // seeded supplier count
  await page.close();
});

localRunner.addTest('flow 2 — dashboard load / טעינת לוח מחוונים', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/dashboard.html`);
  expect(await p.content()).toContain('KPI'.toLowerCase() === 'kpi' ? 'data-kpi' : 'nav');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 3. create supplier / יצירת ספק
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 3 — create supplier / יצירת ספק', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/suppliers/new.html`);
  await page.fill('#supplier-name', 'אבן דרך בע״מ');
  await page.fill('#supplier-tax-id', '514231679');
  await page.fill('#supplier-iban', 'IL620108000000099999999');
  await page.click('#save-supplier');
  await page.waitFor('#success-banner', { timeout: 3000 });
  const html = await page.content();
  expect(html).toContain('ספק נוצר בהצלחה');
  expect(html).toMatch(/success/);
  await page.close();
});

localRunner.addTest('flow 3 — create supplier / יצירת ספק', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/suppliers/new.html`);
  await p.click('#save-supplier');
  expect(await p.content()).toContain('בהצלחה');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 4. create invoice / יצירת חשבונית
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 4 — create invoice / יצירת חשבונית', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/invoices/new.html`);
  await page.fill('#invoice-number', '2026-0042');
  await page.fill('#invoice-amount', '1000');
  await page.click('#submit-invoice');
  await page.waitFor('#success-banner', { timeout: 3000 });
  const html = await page.content();
  expect(html).toContain('חשבונית נוצרה');
  expect(html).toMatch(/data-total="1170"/);
  await page.close();
});

localRunner.addTest('flow 4 — create invoice / יצירת חשבונית', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/invoices/new.html`);
  await p.click('#submit-invoice');
  expect(await p.content()).toContain('₪1,170');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 5. upload PDF / העלאת PDF
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 5 — upload PDF / העלאת PDF', async (t) => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/upload.html`);
  // We can't push real file bytes over HTTP mode, so we assert the UI
  // and then click the upload button. The mock /upload/done.html page
  // is the "server acked the upload" response.
  expect(await page.content()).toContain('העלאת PDF');
  await page.click('#upload-btn');
  await page.waitFor('#upload-result', { timeout: 3000 });
  const html = await page.content();
  expect(html).toContain('הועלה בהצלחה');
  expect(html).toMatch(/invoice-2026-0042\.pdf/);

  // Screenshot to a tmp path — exercises the file-write fallback.
  const shotPath = path.join(
    __dirname,
    '..',
    '..',
    'tmp-e2e-screenshots',
    'upload-pdf.png',
  );
  const shot = await page.screenshot(shotPath);
  assert.ok(fs.existsSync(shot.path), 'screenshot file exists');
  await page.close();
});

localRunner.addTest('flow 5 — upload PDF / העלאת PDF', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/upload.html`);
  await p.click('#upload-btn');
  expect(await p.content()).toContain('הועלה בהצלחה');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 6. run payroll preview / תצוגה מקדימה של שכר
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 6 — run payroll preview / תצוגה מקדימה של שכר', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/payroll/preview.html`);
  await page.waitFor('#payroll-root', { timeout: 2000 });
  const html = await page.content();
  expect(html).toContain('תצוגה מקדימה');
  expect(html).toMatch(/data-emp="001"/);
  expect(html).toMatch(/class="gross"/);
  expect(html).toMatch(/class="net"/);
  // Evaluate with the HTTP-mode shim so we exercise `page.evaluate`.
  const empCount = await page.evaluate((ctx) => {
    const matches = ctx.html.match(/data-emp="\d+"/g) || [];
    return matches.length;
  });
  expect(empCount).toBe(2);
  await page.close();
});

localRunner.addTest('flow 6 — payroll preview / תצוגה מקדימה של שכר', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/payroll/preview.html`);
  expect(await p.content()).toContain('תצוגה מקדימה');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 7. view VAT report / צפייה בדוח מע״מ
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 7 — view VAT report / צפייה בדוח מע״מ', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/vat/report.html`);
  await page.waitFor('#vat-root', { timeout: 2000 });
  expect(await page.content()).toMatch(/דוח מע/);
  await page.click('#export-pcn');
  await page.waitFor('#export-result', { timeout: 3000 });
  expect(await page.content()).toContain('PCN836');
  await page.close();
});

localRunner.addTest('flow 7 — VAT report / דוח מע״מ', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/vat/report.html`);
  expect(await p.content()).toContain('PCN836');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 8. create PO / יצירת הזמנת רכש
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 8 — create PO / יצירת הזמנת רכש', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/po/new.html`);
  await page.fill('#po-amount', '4200');
  await page.fill('#po-project', 'P-2026-012');
  await page.click('#submit-po');
  await page.waitFor('#po-status', { timeout: 3000 });
  const html = await page.content();
  expect(html).toContain('ממתין לאישור');
  expect(html).toMatch(/data-po="PO-2026-0099"/);
  await page.close();
});

localRunner.addTest('flow 8 — create PO / יצירת הזמנת רכש', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/po/new.html`);
  await p.click('#submit-po');
  expect(await p.content()).toContain('ממתין');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 9. approve PO / אישור הזמנת רכש
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 9 — approve PO / אישור הזמנת רכש', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/po/pending.html`);
  expect(await page.content()).toContain('ממתין');
  await page.click('#approve-po');
  await page.waitFor('#approval-banner', { timeout: 3000 });
  const html = await page.content();
  expect(html).toContain('אושרה ונשלחה');
  expect(html).toMatch(/data-status="approved"/);
  await page.close();
});

localRunner.addTest('flow 9 — approve PO / אישור הזמנת רכש', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/po/pending.html`);
  await p.click('#approve-po');
  expect(await p.content()).toContain('אושרה');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// 10. logout / התנתקות
// ────────────────────────────────────────────────────────────
test('AG-X86 flow 10 — logout / התנתקות', async () => {
  const { browser, base } = await getBrowser();
  const page = await browser.newPage();
  await page.goto(`${base}/dashboard.html`);
  await page.click('#nav-logout');
  await page.waitFor('#logout-msg', { timeout: 3000 });
  const html = await page.content();
  expect(html).toContain('להתראות');
  expect(html).toContain('התנתקת בהצלחה');
  expect(page.url()).toContain('/logout.html');
  await page.close();

  // Final teardown — close the shared browser/server. Runs last
  // because node:test executes in file order by default.
  await closeAll();
});

localRunner.addTest('flow 10 — logout / התנתקות', async () => {
  const { browser, base } = await getBrowser();
  const p = await browser.newPage();
  await p.goto(`${base}/logout.html`);
  expect(await p.content()).toContain('להתראות');
  await p.close();
});

// ────────────────────────────────────────────────────────────
// Runner wrapper — exercises Runner.addTest / Runner.run /
// junit-xml / retries / parallel. Exported as its own node:test
// case so it runs inside the same `npm test` invocation.
// ────────────────────────────────────────────────────────────
test('AG-X86 runner — retries + parallel + junit / ריצה מקבילה', async () => {
  const junitPath = path.join(
    __dirname,
    '..',
    '..',
    'tmp-e2e-reports',
    'junit-seed-flows.xml',
  );
  const report = await localRunner.run({
    parallel: 2,
    retries: 1,
    reporter: 'junit',
    junitOut: junitPath,
  });
  assert.ok(report.total >= 10, 'runner has ≥10 tests');
  assert.ok(report.passed >= 1, 'runner passed at least one test');
  assert.ok(fs.existsSync(junitPath), 'junit xml was written');
  assert.match(report.xml, /<testsuite /);
  assert.match(report.xml, /<testcase /);
});
