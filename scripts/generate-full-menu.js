#!/usr/bin/env node
/**
 * Full menu generator — reads every feature file from onyx-procurement/src
 * and emits SQL to seed the app_menu table.
 *
 * Output: supabase/migrations/00035_app_menu_FULL.sql
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '..', 'onyx-procurement', 'src');
const OUT  = path.join(__dirname, '..', 'supabase', 'migrations', '00035_app_menu_FULL.sql');

// ─────────────────────────────────────────────────────────────
// 12 top-level categories, each grouping several src/ folders
// ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 1,  label: 'דשבורד',           route: '/dashboard',    icon: '📊',
    folders: [] /* manual control rooms added below */ },

  { id: 2,  label: 'מכירות ולקוחות',   route: '/sales-crm',    icon: '💼',
    folders: ['sales', 'customer', 'crm', 'customer-portal'] },

  { id: 3,  label: 'רכש וספקים',       route: '/procurement',  icon: '🛒',
    folders: ['rfq', 'po', 'approvals', 'supplier-portal'] },

  { id: 4,  label: 'פרויקטים וייצור',  route: '/projects',     icon: '🏭',
    folders: ['projects', 'manufacturing', 'quality', 'engineering', 'construction', 'logistics', 'returns', 'warranty', 'pipeline'] },

  { id: 5,  label: 'מלאי ומחסנים',     route: '/inventory',    icon: '📦',
    folders: ['inventory', 'warehouse', 'assets'] },

  { id: 6,  label: 'כספים',             route: '/finance',      icon: '💰',
    folders: ['finance', 'bank', 'bank-files', 'payments', 'invoices', 'receipts', 'collections', 'expenses', 'budget', 'cash', 'gl', 'costing', 'fx', 'intercompany', 'consolidation'] },

  { id: 7,  label: 'מיסוי',             route: '/tax',          icon: '🧾',
    folders: ['tax', 'vat', 'tax-exports'] },

  { id: 8,  label: 'כח אדם ושכר',      route: '/workforce',    icon: '👥',
    folders: ['hr', 'payroll', 'pension', 'time'] },

  { id: 9,  label: 'נדל"ן',             route: '/realestate',   icon: '🏗️',
    folders: ['realestate'] },

  { id: 10, label: 'תקשורת והודעות',   route: '/comms',        icon: '📱',
    folders: ['comms', 'emails', 'sms', 'whatsapp', 'notifications', 'chatbot'] },

  { id: 11, label: 'מסמכים',           route: '/documents',    icon: '📑',
    folders: ['documents', 'docs', 'contracts', 'ocr', 'printing', 'scanners'] },

  { id: 12, label: 'AI וניתוחים',      route: '/intelligence', icon: '🤖',
    folders: ['ai', 'ml', 'analytics', 'reporting', 'reports', 'forecasting', 'search', 'kb', 'experiments', 'pricing'] },

  { id: 13, label: 'Compliance',       route: '/compliance',   icon: '🛡️',
    folders: ['compliance', 'privacy', 'auth', 'security'] },

  { id: 14, label: 'תשתיות ותפעול',    route: '/ops',          icon: '⚙️',
    folders: ['ops', 'devops', 'resilience', 'dr', 'backup', 'jobs', 'queue', 'webhooks', 'realtime'] },

  { id: 15, label: 'אינטגרציות',       route: '/integrations', icon: '🔌',
    folders: ['integrations', 'imports', 'exports', 'graphql', 'features', 'flags', 'enterprise'] },

  { id: 16, label: 'מערכת',             route: '/system',       icon: '🔧',
    folders: ['validators', 'middleware', 'config', 'cli', 'deploy', 'wiring', 'workflow', 'dedup', 'support', 'utils', 'bl'] },
];

// Hebrew labels for well-known files (prefer Hebrew where natural)
const LABEL_MAP = {
  // finance
  'aging-reports':          'דוחות גיול חובות',
  'aging':                  'גיול חובות',
  'bad-debt-provision':     'הפרשה לחובות מסופקים',
  'capital-projects':       'פרויקטי הון',
  'cashflow-forecast':      'תחזית תזרים מזומנים',
  'check-register':         'ספר צ׳קים',
  'credit-limits':          'מסגרות אשראי',
  'debt-collection':        'גביית חובות',
  'deferred-revenue':       'הכנסות נדחות',
  'fixed-assets':           'רכוש קבוע',
  'fx-hedging':             'גידור מט״ח',
  'ic-loans':               'הלוואות בין-חברתיות',
  'signatory-workflow':     'זרימת אישורי חתימה',
  'treasury':               'אוצר וניהול מזומנים',
  'wire-approval':          'אישור העברות בנקאיות',
  'wire-transfer':          'העברות בנקאיות',
  'working-capital':        'הון חוזר',
  // tax
  'annual-tax-routes':      'דיווח שנתי',
  'betterment-tax':         'מס שבח',
  'capital-gains':          'רווחי הון',
  'dividend-withholding':   'ניכוי דיבידנד',
  'form-102':               'טופס 102 (משכורות)',
  'form-126':               'טופס 126 (ריכוז)',
  'form-1301':              'טופס 1301 (שנתי)',
  'form-30a':               'טופס 30A (שכירים)',
  'form-6111':              'טופס 6111',
  'form-857':               'טופס 857 (ניכויים)',
  'form-builders':          'בניית טפסים',
  'purchase-tax':           'מס קנייה',
  'transfer-pricing':       'מחירי העברה',
  'vat-refund':             'החזר מע״מ',
  // bank
  'bank-routes':            'ממשקי בנק',
  'matcher':                'התאמת תנועות',
  'multi-format-parser':    'ניתוח פורמטים',
  'parsers':                'מנתחי קבצי בנק',
  'reconciliation':         'התאמת בנק',
  'smart-categorizer':      'סיווג חכם',
  // hr
  '360-feedback':           'משוב 360',
  'ats':                    'ניהול מועמדים',
  'bonus-calc':             'חישוב בונוסים',
  'cert-tracker':           'מעקב תעודות',
  'comp-planner':           'תכנון תגמול',
  'feedback-collection':    'איסוף משוב',
  'grievance':              'תלונות עובדים',
  'handbook':               'ספר נהלים',
  'interview-scheduling':   'תיאום ראיונות',
  'offboarding':            'סיום עבודה',
  'okr-tracker':            'מעקב OKRs',
  'onboarding':             'קליטת עובדים',
  'options-vesting':        'אופציות והבשלה',
  'performance-review':     'שיחות הערכה',
  'skills-matrix':          'מטריצת כישורים',
  'training-catalog':       'קטלוג הדרכות',
  // customer
  'advocacy':               'קהילת שגרירים',
  'churn-prevention':       'מניעת נטישה',
  'csat':                   'שביעות רצון',
  'health-score':           'ציון בריאות לקוח',
  'journey-map':            'מפת מסע לקוח',
  'loyalty':                'תוכנית נאמנות',
  'meeting-scheduler':      'תיאום פגישות',
  'nps':                    'NPS',
  'qbr-generator':          'דוחות רבעוניים',
  'referral':               'תוכנית הפניות',
  'segmentation':           'סגמנטציה',
  'success-plan':           'תוכנית הצלחה',
  'voc':                    'קול הלקוח',
  // sales
  'account-assignment':     'שיוך לקוחות',
  'commission':             'עמלות',
  'competitor-tracker':     'מעקב מתחרים',
  'lead-scoring':           'ניקוד לידים',
  'leaderboard':            'לוח מובילים',
  'opportunity-stages':     'שלבי הזדמנות',
  'playbook-engine':        'ספר משחקים',
  'quote-builder':          'בונה הצעות מחיר',
  'sales-forecast':         'תחזית מכירות',
  'target-tracker':         'מעקב יעדים',
  'territory-manager':      'ניהול אזורים',
  'upsell':                 'אפסיילינג',
  'win-loss':               'ניתוח זכייה/הפסד',
  // manufacturing
  'bom-manager':            'ניהול BOM',
  'capacity-planning':      'תכנון קיבולת',
  'drawing-vc':             'בקרת שרטוטים',
  'heat-treat-log':         'יומן טיפול תרמי',
  'material-cert':          'תעודות חומר',
  'oee-tracker':            'OEE ציוד',
  'qc-checklist':           'רשימת בקרת איכות',
  'routing-manager':        'ניהול ראוטינג',
  'scrap-tracker':          'מעקב פסולת',
  'tool-tracker':           'מעקב כלים',
  'welder-certs':           'הסמכות רתכים',
  'wo-scheduler':           'תזמון הזמנות עבודה',
  // realestate
  'arnona-tracker':         'ארנונה',
  'broker-fees':            'דמי תיווך',
  'building-permit':        'היתרי בנייה',
  'inspection':             'בדיקות נכס',
  'lease-tracker':          'חוזי שכירות',
  'maintenance':            'תחזוקה',
  'mortgage-calc':          'חישוב משכנתא',
  'portfolio-dashboard':    'דשבורד תיק נכסים',
  'property-manager':       'ניהול נכסים',
  'rent-collection':        'גביית שכ״ד',
  'roi-calculator':         'חישוב תשואה',
  'tenant-portal':          'פורטל דיירים',
  'vacancy-tracker':        'מעקב נכסים פנויים',
  'valuation':              'הערכת שווי',
  // comms
  'broadcast':              'שידור הודעות',
  'bulletin-board':         'לוח מודעות',
  'call-log':               'יומן שיחות',
  'call-recording':         'הקלטת שיחות',
  'email-templates':        'תבניות אימייל',
  'followup-engine':        'מעקב פולואפים',
  'internal-chat':          'צ׳אט פנימי',
  'internal-wiki':          'ויקי ארגוני',
  'life-events':            'אירועי חיים',
  'meeting-notes':          'סיכומי פגישות',
  'polls':                  'סקרים פנימיים',
  'reminders':              'תזכורות',
  'sms-gateway':            'SMS Gateway',
  'whatsapp-business':      'WhatsApp Business',
  'whatsapp':               'WhatsApp',
  // documents
  'clause-library':         'ספריית סעיפים',
  'doc-diff':               'השוואת מסמכים',
  'doc-search':             'חיפוש במסמכים',
  'doc-version-control':    'בקרת גרסאות',
  'esign':                  'חתימה דיגיטלית',
  'expiry-alerts':          'התראות פקיעה',
  'legal-hold':             'השהיה משפטית',
  'metadata-manager':       'ניהול מטה-דאטה',
  'ocr-pipeline':           'OCR',
  'pdf-form-filler':        'מילוי טפסי PDF',
  'redaction':              'השחרת מסמכים',
  'retention-policy':       'מדיניות שמירה',
  'templates':              'תבניות מסמכים',
  'watermark':              'סימן מים',
  // reporting
  'attribution':            'אטריבוציה',
  'balance-sheet':          'מאזן',
  'benchmark':              'בנצ׳מרק',
  'board-deck':             'מצגת דירקטוריון',
  'budget-actual':          'תקציב מול ביצוע',
  'cac-dashboard':          'CAC Dashboard',
  'cashflow-waterfall':     'מפל תזרים',
  'cohort-analysis':        'ניתוח קוהורטות',
  'executive-dashboard':    'דשבורד מנכ״ל',
  'funnel':                 'משפך המרה',
  'kpi-scorecard':          'כרטיס KPI',
  'ltv-calculator':         'חישוב LTV',
  'pnl-drilldown':          'רווח והפסד מפורט',
  'revenue-waterfall':      'מפל הכנסות',
  'variance-analyzer':      'ניתוח סטיות',
  // compliance
  'aml-screener':           'סינון AML',
  'conflict-of-interest':   'ניגוד עניינים',
  'consumer-complaints':    'תלונות צרכנים',
  'gift-register':          'רישום מתנות',
  'pep-screener':           'סינון PEP',
  'retention-engine':       'מנוע שימור',
  'sanctions-screener':     'סינון סנקציות',
  'whistleblower':          'מלשינון',
  // privacy
  'consent-mgmt':           'ניהול הסכמות',
  'cookie-banner':          'באנר עוגיות',
  'dsr-handler':            'בקשות נושא מידע',
  'policy-generator':       'בונה מדיניות',
  'retention-enforcer':     'אכיפת שמירה',
  'tos-tracker':            'מעקב תנאי שימוש',
  // ops
  'alert-manager':          'ניהול התראות',
  'apm':                    'APM',
  'dep-health':             'בריאות תלויות',
  'error-tracker':          'מעקב שגיאות',
  'health-check':           'בדיקת בריאות',
  'incident-mgmt':          'ניהול אירועים',
  'log-store':              'אחסון לוגים',
  'master-dashboard':       'דשבורד ראשי תפעולי',
  'metrics':                'מטריקות',
  'prom-metrics':           'Prometheus',
  'resource-tracker':       'מעקב משאבים',
  'slo-tracker':            'מעקב SLO',
  'status-page':            'דף סטטוס',
  'synthetic-monitor':      'ניטור סינתטי',
  'tracer':                 'Tracer',
  'uptime-monitor':         'ניטור זמינות',
  // devops
  'ab-router':              'A/B Router',
  'autoscaler':             'Autoscaler',
  'blue-green':             'Blue-Green',
  'chaos-engine':           'Chaos Engineering',
  'ci-generator':           'CI Generator',
  'flag-distributor':       'Feature Flags',
  'health-orchestrator':    'Health Orchestrator',
  'iac-generator':          'IaC',
  'incident-runbook':       'Runbook',
  'rollback-engine':        'Rollback',
  'rollout-strategies':     'אסטרטגיות Rollout',
  'secret-rotator':         'Secret Rotation',
  'service-mesh':           'Service Mesh',
  'traffic-shadow':         'Traffic Shadowing',
  'vault-client':           'Vault Client',
};

function humanize(name) {
  if (LABEL_MAP[name]) return LABEL_MAP[name];
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function folderItems(folder) {
  const full = path.join(SRC, folder);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map(f => f.replace(/\.js$/, ''))
    .sort();
}

// ─────────────────────────────────────────────────────────────
// Build SQL
// ─────────────────────────────────────────────────────────────
const lines = [];
lines.push('-- ============================================================');
lines.push('-- FILE: supabase/migrations/00035_app_menu_FULL.sql');
lines.push('-- Full menu — every feature file from onyx-procurement/src');
lines.push('-- Auto-generated by scripts/generate-full-menu.js');
lines.push('-- ============================================================');
lines.push('');
lines.push('-- Clear existing menu');
lines.push('delete from public.app_menu;');
lines.push('alter sequence app_menu_id_seq restart with 1;');
lines.push('');
lines.push('-- ─── TIER 1: Top-level categories ───');
lines.push('insert into public.app_menu (id, label, route, icon, order_index) values');

const tier1Rows = CATEGORIES.map(c =>
  `  (${c.id}, '${c.label}', '${c.route}', '${c.icon}', ${c.id})`
);
lines.push(tier1Rows.join(',\n') + ';');
lines.push('');

// Tier 2 — children
let totalChildren = 0;
for (const cat of CATEGORIES) {
  const children = [];

  // Dashboard gets manual control rooms
  if (cat.id === 1) {
    children.push(
      ['Executive Control Tower', '/executive', '👔'],
      ['Operations Control Room', '/operations', '⚙️'],
      ['Procurement Control Room', '/procurement-room', '📦'],
      ['Workforce Control Room', '/workforce-room', '👥'],
      ['AI Control Room', '/ai-room', '🤖'],
      ['Command Center', '/command-center', '🎯'],
      ['Treasury Control Room', '/treasury-room', '🏛️'],
      ['Quality Control Room', '/quality-room', '🔬'],
      ['Service Control Room', '/service-room', '🛎️'],
      ['Maintenance Control Room', '/maintenance-room', '🔧'],
      ['Planning Control Room', '/planning-room', '📅'],
      ['CRM Control Room', '/crm-room', '🎯'],
      ['Finance Control Room', '/finance-room', '💰'],
      ['KPI Engine', '/kpi', '📈'],
      ['Universal Inbox', '/inbox', '📬'],
    );
  }

  // System category gets manual system pages
  if (cat.id === 16) {
    children.push(
      ['משתמשים', '/users', '👥'],
      ['תפקידים והרשאות', '/roles', '🔐'],
      ['Feature Flags', '/feature-flags', '🚩'],
      ['Audit Trail', '/audit', '🔎'],
      ['לוג אירועים', '/events', '📜'],
      ['Cron Jobs', '/cron', '⏲️'],
      ['הגדרות', '/settings', '⚙️'],
      ['Feedback', '/feedback', '💬'],
    );
  }

  // Add folder-driven items
  for (const folder of cat.folders) {
    const items = folderItems(folder);
    for (const item of items) {
      const label = humanize(item);
      const route = `/${folder}/${item}`;
      children.push([label, route, '•']);
    }
  }

  if (children.length === 0) continue;

  lines.push(`-- ─── ${cat.label} (${children.length} items) ───`);
  lines.push('insert into public.app_menu (label, route, icon, parent_id, order_index) values');
  const rows = children.map(([label, route, icon], idx) => {
    const safeLabel = label.replace(/'/g, "''");
    return `  ('${safeLabel}', '${route}', '${icon}', ${cat.id}, ${idx + 1})`;
  });
  lines.push(rows.join(',\n') + ';');
  lines.push('');

  totalChildren += children.length;
}

lines.push(`-- Total: ${CATEGORIES.length} top categories + ${totalChildren} child items = ${CATEGORIES.length + totalChildren} menu items`);
lines.push('select setval(\'app_menu_id_seq\', (select max(id) from public.app_menu));');
lines.push('');
lines.push(`comment on table public.app_menu is `);
lines.push(`  '${CATEGORIES.length} top-level categories + ${totalChildren} child routes = ${CATEGORIES.length + totalChildren} menu items total. '`);
lines.push(`  'Auto-generated from scripts/generate-full-menu.js — re-run when adding new feature files.';`);

fs.writeFileSync(OUT, lines.join('\n'));

console.log(`✅ Generated ${OUT}`);
console.log(`   ${CATEGORIES.length} top categories + ${totalChildren} children = ${CATEGORIES.length + totalChildren} total items`);
