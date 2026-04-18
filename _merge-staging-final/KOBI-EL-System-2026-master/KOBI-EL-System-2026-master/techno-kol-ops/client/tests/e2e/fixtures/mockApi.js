// @ts-check
/**
 * Centralized API mocking for techno-kol-ops E2E tests.
 *
 * The client talks to the backend via:
 *   - POST /api/auth/login           (plain fetch in App.tsx)
 *   - GET  /api/ontology/snapshot    (Dashboard)
 *   - GET  /api/financials/monthly   (Dashboard, Finance)
 *   - GET  /api/financials/by-category
 *   - GET  /api/reports/weekly       (Dashboard)
 *   - GET  /api/alerts               (Dashboard, AlertCenter)
 *   - PUT  /api/alerts/:id/resolve   (AlertCenter)
 *   - GET  /api/work-orders          (WorkOrders, ProductionFloor)
 *   - POST /api/work-orders          (new order)
 *   - PUT  /api/work-orders/:id      (update)
 *   - PUT  /api/work-orders/:id/progress
 *   - GET  /api/clients              (Clients, WorkOrders modal)
 *
 * Base URL: the axios client uses VITE_API_URL || http://localhost:5000,
 * but Vite dev server proxies /api to :5000 so same-origin /api/* also hits
 * the backend. We intercept BOTH /api/** and http://localhost:5000/api/** to
 * be safe.
 */

const AUTH_TOKEN = 'e2e-token';
const USER = { id: 1, username: 'e2e', role: 'admin' };

const now = Date.now();
const iso = (offsetDays = 0) =>
  new Date(now + offsetDays * 86_400_000).toISOString();

/** Baseline fake dataset. Tests may override individual endpoints. */
const DEFAULT_DATA = {
  workOrders: [
    {
      id: 'TK-1001',
      client_id: 1,
      client_name: 'מפעל הפלדה המרכזי',
      product: 'מעקות נירוסטה לקומה 3',
      material_primary: 'stainless',
      category: 'railings',
      price: 45000,
      advance_paid: 15000,
      status: 'production',
      progress: 40,
      priority: 'high',
      delivery_date: iso(7),
      open_date: iso(-14),
      assigned_employees: ['יוסי', 'דנה'],
    },
    {
      id: 'TK-1002',
      client_id: 2,
      client_name: 'אלומיניום הצפון בעמ',
      product: 'שערי פנדולום כפולים',
      material_primary: 'aluminum',
      category: 'gates',
      price: 28000,
      advance_paid: 0,
      status: 'pending',
      progress: 0,
      priority: 'normal',
      delivery_date: iso(14),
      open_date: iso(-2),
      assigned_employees: [],
    },
    {
      id: 'TK-1003',
      client_id: 3,
      client_name: 'ברזל ירושלים',
      product: 'גדרות עיצוביות',
      material_primary: 'iron',
      category: 'fences',
      price: 62000,
      advance_paid: 30000,
      status: 'ready',
      progress: 100,
      priority: 'normal',
      delivery_date: iso(-1),
      open_date: iso(-30),
      assigned_employees: ['אבי'],
    },
  ],

  clients: [
    {
      id: 1,
      name: 'מפעל הפלדה המרכזי',
      type: 'תעשייה',
      total_orders: 12,
      total_revenue: 540000,
      last_order_date: iso(-3),
      credit_limit: 100000,
      balance_due: 15000,
    },
    {
      id: 2,
      name: 'אלומיניום הצפון בעמ',
      type: 'קמעונאי',
      total_orders: 5,
      total_revenue: 180000,
      last_order_date: iso(-10),
      credit_limit: 50000,
      balance_due: 0,
    },
    {
      id: 3,
      name: 'ברזל ירושלים',
      type: 'קבלן',
      total_orders: 8,
      total_revenue: 420000,
      last_order_date: iso(-1),
      credit_limit: 80000,
      balance_due: 32000,
    },
  ],

  alerts: [
    {
      id: 'AL-1',
      type: 'stock',
      severity: 'warning',
      title: 'מלאי נירוסטה נמוך',
      message: 'נותרו 120 ק"ג מתוך מינימום 200',
      entity_type: 'material',
      entity_id: 'MAT-STAINLESS',
      is_resolved: false,
      created_at: iso(0),
    },
    {
      id: 'AL-2',
      type: 'delivery',
      severity: 'danger',
      title: 'איחור במשלוח TK-1003',
      message: 'חריגה של יום אחד מתאריך יעד',
      entity_type: 'order',
      entity_id: 'TK-1003',
      is_resolved: false,
      created_at: iso(-0.2),
    },
  ],

  snapshot() {
    return {
      activeOrders: this.workOrders.filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled'
      ),
      attendance: { factory: 18, field: 6, absent: 3, total: 27 },
      materialAlerts: 1,
      openAlerts: this.alerts,
      monthlyRevenue: 1_250_000,
      monthlyCosts: 780_000,
      utilizationPct: 82,
      recentEvents: [],
    };
  },

  monthlyFinancials: [
    { month: '2025-11', revenue: 980_000, costs: 620_000 },
    { month: '2025-12', revenue: 1_050_000, costs: 680_000 },
    { month: '2026-01', revenue: 1_120_000, costs: 710_000 },
    { month: '2026-02', revenue: 1_180_000, costs: 740_000 },
    { month: '2026-03', revenue: 1_250_000, costs: 770_000 },
    { month: '2026-04', revenue: 1_310_000, costs: 800_000 },
  ],

  byCategory: [
    { category: 'stainless', revenue: '420000' },
    { category: 'iron', revenue: '310000' },
    { category: 'aluminum', revenue: '280000' },
    { category: 'glass', revenue: '140000' },
  ],

  weekly: [
    { day: 'א', units: 34 },
    { day: 'ב', units: 41 },
    { day: 'ג', units: 38 },
    { day: 'ד', units: 52 },
    { day: 'ה', units: 47 },
    { day: 'ו', units: 22 },
    { day: 'ש', units: 0 },
  ],
};

/**
 * Install standard mocks on a page. Returns the mutable `db` so tests can
 * tweak data before navigation or inspect it after.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Partial<typeof DEFAULT_DATA>} [overrides]
 */
async function installMocks(page, overrides = {}) {
  // deep clone so each test has its own mutable state
  const db = JSON.parse(JSON.stringify(DEFAULT_DATA));
  // functions don't survive JSON — re-attach
  db.snapshot = DEFAULT_DATA.snapshot.bind(db);
  Object.assign(db, overrides);

  // Seed auth so App.tsx skips the login screen.
  await page.addInitScript(
    ({ token, user }) => {
      try {
        localStorage.setItem('tk_token', token);
        localStorage.setItem('tk_user', JSON.stringify(user));
      } catch (_) {}
    },
    { token: AUTH_TOKEN, user: USER }
  );

  // Block websockets (the client uses ws://localhost:5000/ws). Returning a
  // 404-ish rejection is fine — useWebSocket just retries silently.
  await page.route('**/ws**', (route) => route.abort());

  const match = (url, path) => url.pathname === path || url.pathname.endsWith(path);

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^.*(\/api\/.*)$/, '$1');

    // ---- auth ----
    if (method === 'POST' && path === '/api/auth/login') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: AUTH_TOKEN, user: USER }),
      });
    }

    // ---- ontology snapshot ----
    if (method === 'GET' && path === '/api/ontology/snapshot') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.snapshot()),
      });
    }

    // ---- financials ----
    if (method === 'GET' && path === '/api/financials/monthly') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.monthlyFinancials),
      });
    }
    if (method === 'GET' && path === '/api/financials/by-category') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.byCategory),
      });
    }
    if (method === 'GET' && path === '/api/financials/summary') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          revenue: 1_250_000,
          costs: 770_000,
          profit: 480_000,
        }),
      });
    }
    if (method === 'GET' && path === '/api/financials') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    // ---- reports ----
    if (method === 'GET' && path === '/api/reports/weekly') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.weekly),
      });
    }

    // ---- alerts ----
    if (method === 'GET' && path === '/api/alerts') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.alerts),
      });
    }
    const alertResolve = path.match(/^\/api\/alerts\/([^/]+)\/resolve$/);
    if (method === 'PUT' && alertResolve) {
      const id = alertResolve[1];
      const a = db.alerts.find((x) => x.id === id);
      if (a) a.is_resolved = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id }),
      });
    }

    // ---- work orders ----
    if (method === 'GET' && path === '/api/work-orders') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.workOrders),
      });
    }
    if (method === 'POST' && path === '/api/work-orders') {
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch (_) {}
      const id = body.id || `TK-${Date.now().toString().slice(-4)}`;
      const newOrder = {
        id,
        client_id: body.client_id || 1,
        client_name:
          db.clients.find((c) => String(c.id) === String(body.client_id))
            ?.name || 'לקוח חדש',
        product: body.product || 'מוצר חדש',
        material_primary: body.material_primary || 'iron',
        category: body.category || 'railings',
        price: Number(body.price) || 0,
        advance_paid: Number(body.advance_paid) || 0,
        status: 'pending',
        progress: 0,
        priority: body.priority || 'normal',
        delivery_date: body.delivery_date || iso(30),
        open_date: iso(0),
        assigned_employees: [],
      };
      db.workOrders.unshift(newOrder);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newOrder),
      });
    }
    const woProgress = path.match(/^\/api\/work-orders\/([^/]+)\/progress$/);
    if (method === 'PUT' && woProgress) {
      const id = woProgress[1];
      const o = db.workOrders.find((x) => x.id === id);
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch (_) {}
      if (o) o.progress = Number(body.progress) || 0;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(o || { ok: true }),
      });
    }
    const woUpdate = path.match(/^\/api\/work-orders\/([^/]+)$/);
    if ((method === 'PUT' || method === 'PATCH') && woUpdate) {
      const id = woUpdate[1];
      const o = db.workOrders.find((x) => x.id === id);
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch (_) {}
      if (o) Object.assign(o, body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(o || { ok: true }),
      });
    }
    if (method === 'GET' && woUpdate) {
      const id = woUpdate[1];
      const o = db.workOrders.find((x) => x.id === id);
      return route.fulfill({
        status: o ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(o || { error: 'not found' }),
      });
    }

    // ---- clients ----
    if (method === 'GET' && path === '/api/clients') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(db.clients),
      });
    }

    // ---- unknown: return empty array so pages don't explode ----
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  return db;
}

module.exports = {
  installMocks,
  AUTH_TOKEN,
  USER,
  iso,
};
