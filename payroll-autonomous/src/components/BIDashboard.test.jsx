/**
 * BIDashboard — smoke test (render + basic interactions)
 * Agent 99 / Techno-Kol mega-ERP 2026
 *
 * Designed to run under Vitest or Jest + @testing-library/react.
 * If the project does not yet have those deps, the file also includes a
 * tiny no-framework fallback at the bottom that just renders the component
 * with ReactDOMServer — so `node src/components/BIDashboard.test.jsx` will
 * at minimum catch syntax/render errors.
 */

import React from 'react';
import BIDashboard, {
  RevenueTrendChart,
  RevenueExpensesChart,
  TopClientsChart,
  CashFlowWaterfall,
  EmployeeCostsDonut,
  ARAgingChart,
  EmptyState,
  ChartSkeleton,
  niceTicks,
  fmtILS,
  fmtILSCompact,
  BI_THEME,
} from './BIDashboard.jsx';

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */
export const mockBIData = {
  revenue_trend: [
    { label: 'מאי',    value:  820000 },
    { label: 'יוני',    value:  910000 },
    { label: 'יולי',    value:  875000 },
    { label: 'אוגוסט',  value:  940000 },
    { label: 'ספטמבר',  value: 1010000 },
    { label: 'אוקטובר', value: 1125000 },
    { label: 'נובמבר',  value: 1080000 },
    { label: 'דצמבר',   value: 1340000 },
    { label: 'ינואר',   value:  970000 },
    { label: 'פברואר',  value: 1050000 },
    { label: 'מרץ',     value: 1180000 },
    { label: 'אפריל',   value: 1260000 },
  ],
  revenue_expenses: [
    { label: 'Q1 25', revenue: 2700000, expenses: 2100000 },
    { label: 'Q2 25', revenue: 3100000, expenses: 2300000 },
    { label: 'Q3 25', revenue: 3300000, expenses: 2500000 },
    { label: 'Q4 25', revenue: 3600000, expenses: 2650000 },
  ],
  top_clients: [
    { name: 'בנק הפועלים',        value: 640000 },
    { name: 'שופרסל בע"מ',        value: 580000 },
    { name: 'תנובה מרכז שיווק',    value: 490000 },
    { name: 'אלקטרה מערכות',       value: 430000 },
    { name: 'חברת חשמל לישראל',    value: 395000 },
    { name: 'בנק דיסקונט',        value: 340000 },
    { name: 'סופר־פארם',          value: 310000 },
    { name: 'רמי לוי',            value: 280000 },
    { name: 'אל על',              value: 245000 },
    { name: 'Intel Israel',      value: 205000 },
  ],
  cash_flow: [
    { label: 'פתיחה',     value: 450000,  type: 'start' },
    { label: 'הכנסות',    value: 1260000, type: 'in' },
    { label: 'משכורות',   value: -620000, type: 'out' },
    { label: 'ספקים',     value: -310000, type: 'out' },
    { label: 'מיסים',     value: -180000, type: 'out' },
    { label: 'השקעות',    value: 75000,   type: 'in' },
    { label: 'סגירה',     value: 675000,  type: 'end' },
  ],
  employee_costs: [
    { label: 'שכר יסוד',          value: 380000 },
    { label: 'סוציאליות',         value: 115000 },
    { label: 'פנסיה וקרן השתלמות', value:  82000 },
    { label: 'בונוסים',            value:  45000 },
    { label: 'הטבות ורווחה',       value:  28000 },
    { label: 'ביטוח לאומי מעסיק', value:  34000 },
  ],
  ar_aging: [
    { label: 'ינואר',   current: 420000, d30: 110000, d60: 40000, d90: 12000 },
    { label: 'פברואר',  current: 380000, d30: 150000, d60: 60000, d90: 18000 },
    { label: 'מרץ',     current: 460000, d30: 120000, d60: 30000, d90: 22000 },
    { label: 'אפריל',   current: 500000, d30: 140000, d60: 50000, d90: 25000 },
  ],
};

/* ------------------------------------------------------------------ */
/* Unit tests (Vitest / Jest compatible)                               */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line no-undef
const _describe = typeof describe === 'function' ? describe : null;
// eslint-disable-next-line no-undef
const _test = typeof test === 'function' ? test : (typeof it === 'function' ? it : null);
// eslint-disable-next-line no-undef
const _expect = typeof expect === 'function' ? expect : null;

if (_describe && _test && _expect) {
  // Lazy imports so the file can still be imported outside a test env
  const { render, screen, fireEvent } = require('@testing-library/react');

  _describe('BIDashboard — smoke', () => {
    _test('renders dashboard header and topbar', () => {
      render(
        <BIDashboard
          data={mockBIData}
          period="month"
          onPeriodChange={() => {}}
          onDateRangeChange={() => {}}
          onDrillDown={() => {}}
          onExportPDF={() => {}}
        />
      );
      _expect(screen.getByText(/דשבורד BI/)).toBeTruthy();
      _expect(screen.getByText(/Business Intelligence Dashboard/)).toBeTruthy();
      _expect(screen.getByText('חודש')).toBeTruthy();
      _expect(screen.getByText('רבעון')).toBeTruthy();
      _expect(screen.getByText('מתחילת השנה')).toBeTruthy();
      _expect(screen.getByLabelText('ייצוא דשבורד ל-PDF')).toBeTruthy();
    });

    _test('renders all 6 chart cards with mock data', () => {
      const { container } = render(<BIDashboard data={mockBIData} />);
      _expect(screen.getByText('מגמת הכנסות')).toBeTruthy();
      _expect(screen.getByText('הכנסות מול הוצאות')).toBeTruthy();
      _expect(screen.getByText('10 לקוחות מובילים')).toBeTruthy();
      _expect(screen.getByText('תזרים מזומנים')).toBeTruthy();
      _expect(screen.getByText('עלויות עובדים')).toBeTruthy();
      _expect(screen.getByText('גיול חובות (AR Aging)')).toBeTruthy();
      // 6 SVG charts at least
      const svgs = container.querySelectorAll('svg');
      _expect(svgs.length).toBeGreaterThanOrEqual(6);
    });

    _test('shows empty state when no data', () => {
      render(<BIDashboard data={{}} />);
      _expect(screen.getByText(/אין נתונים להצגה/)).toBeTruthy();
    });

    _test('shows skeleton when loading', () => {
      const { container } = render(<BIDashboard data={mockBIData} loading={true} />);
      const skeletons = container.querySelectorAll('.bi-skeleton');
      _expect(skeletons.length).toBeGreaterThan(0);
    });

    _test('period selector calls onPeriodChange', () => {
      const spy = [];
      render(
        <BIDashboard
          data={mockBIData}
          period="month"
          onPeriodChange={(p) => spy.push(p)}
        />
      );
      fireEvent.click(screen.getByText('רבעון'));
      _expect(spy).toContain('quarter');
    });

    _test('export PDF button triggers callback', () => {
      let called = false;
      render(<BIDashboard data={mockBIData} onExportPDF={() => { called = true; }} />);
      fireEvent.click(screen.getByLabelText('ייצוא דשבורד ל-PDF'));
      _expect(called).toBe(true);
    });

    _test('uses RTL direction', () => {
      const { container } = render(<BIDashboard data={mockBIData} />);
      _expect(container.querySelector('[data-testid="bi-dashboard"]').getAttribute('dir')).toBe('rtl');
    });

    _test('fmtILS formats with he-IL locale and shekel sign', () => {
      const s = fmtILS(1234567);
      _expect(s.includes('₪')).toBe(true);
    });

    _test('fmtILSCompact produces M/K short form', () => {
      _expect(fmtILSCompact(1_500_000).toLowerCase()).toContain('m');
      _expect(fmtILSCompact(3500).toLowerCase()).toContain('k');
    });

    _test('niceTicks returns monotonically increasing array', () => {
      const t = niceTicks(0, 1234567, 5);
      _expect(Array.isArray(t)).toBe(true);
      for (let i = 1; i < t.length; i++) _expect(t[i] > t[i - 1]).toBe(true);
    });

    _test('BI_THEME exposes Palantir colors', () => {
      _expect(BI_THEME.bg).toBe('#0b0d10');
      _expect(BI_THEME.panel).toBe('#13171c');
      _expect(BI_THEME.accent).toBe('#4a9eff');
    });

    _test('individual charts render empty state on no data', () => {
      const { container: c1 } = render(<RevenueTrendChart data={[]} />);
      _expect(c1.textContent).toMatch(/אין נתוני/);
      const { container: c2 } = render(<RevenueExpensesChart data={[]} />);
      _expect(c2.textContent).toMatch(/אין נתוני/);
      const { container: c3 } = render(<TopClientsChart data={[]} />);
      _expect(c3.textContent).toMatch(/אין נתוני/);
      const { container: c4 } = render(<CashFlowWaterfall data={[]} />);
      _expect(c4.textContent).toMatch(/אין נתוני/);
      const { container: c5 } = render(<EmployeeCostsDonut data={[]} />);
      _expect(c5.textContent).toMatch(/אין נתוני/);
      const { container: c6 } = render(<ARAgingChart data={[]} />);
      _expect(c6.textContent).toMatch(/אין נתוני/);
    });

    _test('EmptyState and ChartSkeleton render without errors', () => {
      render(<EmptyState label="אין" />);
      render(<ChartSkeleton height={100} />);
      _expect(true).toBe(true);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Fallback: node-level render check (no test framework required)     */
/* ------------------------------------------------------------------ */
if (!_describe || !_test) {
  // Run only when invoked directly: `node BIDashboard.test.jsx`
  // (ignored in ESM import contexts where meta.url differs)
  try {
    // eslint-disable-next-line global-require
    const ReactDOMServer = require('react-dom/server');
    const out = ReactDOMServer.renderToStaticMarkup(
      React.createElement(BIDashboard, {
        data: mockBIData,
        period: 'month',
        onDrillDown: () => {},
        onExportPDF: () => {},
      })
    );
    if (!out || typeof out !== 'string' || out.length < 200) {
      throw new Error('BIDashboard static render produced no output');
    }
    // Minimal assertions
    const mustInclude = [
      'דשבורד BI',
      'Business Intelligence Dashboard',
      'מגמת הכנסות',
      'הכנסות מול הוצאות',
      '10 לקוחות מובילים',
      'תזרים מזומנים',
      'עלויות עובדים',
      'גיול חובות',
    ];
    for (const str of mustInclude) {
      if (!out.includes(str)) throw new Error('Missing render output for: ' + str);
    }
    // eslint-disable-next-line no-console
    console.log('[BIDashboard.test] OK — rendered', out.length, 'chars; all sections present.');
  } catch (e) {
    // If we are simply being imported (not executed as main) there is no
    // problem — don't throw from import-time. Only warn.
    if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('BIDashboard.test')) {
      // eslint-disable-next-line no-console
      console.error('[BIDashboard.test] render check failed:', e && e.message);
      if (typeof process.exit === 'function') process.exit(1);
    }
  }
}
