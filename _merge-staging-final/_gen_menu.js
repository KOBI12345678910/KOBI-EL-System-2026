const fs = require('fs');
// Derive new pages from the merge actions manifest
const jsonl = fs.readFileSync('C:/Users/kobi/Projects/techno-kol-uzi-2026/_master-registry/final_merge_actions.jsonl', 'utf8');
const lines = jsonl.split('\n').filter(Boolean)
  .map(l => JSON.parse(l))
  .filter(a => a.classification === 'NEW' && /erp-app\/src\/pages\//.test(a.destRel) && a.destRel.endsWith('.tsx'))
  .map(a => a.destRel.split('erp-app/src/pages/')[1].replace(/\.tsx$/, ''));

const labels = {
  'agent-orchestration': 'תזמור סוכני AI', 'ai-agents-dashboard': 'לוח בקרת סוכני AI',
  'digital-twin': 'תאום דיגיטלי', 'document-intelligence': 'אינטליגנציית מסמכים',
  'knowledge-graph': 'גרף ידע', 'optimization-lab': 'מעבדת אופטימיזציה', 'process-mining': 'כריית תהליכים',
  'agent-performance': 'ביצועי סוכנים', 'call-analysis': 'ניתוח שיחות', 'contract-intelligence': 'אינטליגנציית חוזים',
  'customer-experience': 'חוויית לקוח', 'whatsapp-hub': 'מרכז WhatsApp',
  'document-templates': 'תבניות מסמכים',
  'daily-profit-monitor': 'מוניטור רווח יומי', 'fraud-detection': 'זיהוי הונאות', 'risk-management': 'ניהול סיכונים',
  'ap-ar-control': 'בקרת חייבים/זכאים', 'cashflow-management': 'ניהול תזרים מזומנים', 'financial-statements': 'דוחות כספיים',
  'intercompany': 'בין-חברתי', 'project-cost-calculator': 'מחשבון עלויות פרויקט', 'revenue-recognition': 'הכרת הכנסה',
  'three-way-match': 'התאמה משולשת',
  'employee-value-analysis': 'ניתוח ערך עובד', 'performance-okr': 'ביצועים OKR', 'shift-scheduling': 'תזמון משמרות',
  'smart-payroll': 'שכר חכם',
  'import-management': 'ניהול יבוא',
  'installation-scheduler': 'תזמון התקנות',
  'raw-material-catalog': 'קטלוג חומרי גלם', 'remnant-management': 'ניהול שאריות',
  'social-marketing': 'שיווק ברשתות חברתיות',
  'field-operations': 'פעולות שדה',
  'customer-portal': 'פורטל לקוחות', 'supplier-portal-new': 'פורטל ספקים (חדש)',
  'vmi-consignment': 'VMI / קונסיגנציה',
  'bom-builder': 'בונה עץ מוצר', 'cpq-configurator': 'קונפיגורטור CPQ', 'cut-nesting': 'חיתוך וקינון',
  'dispatch-planning': 'תכנון שילוח', 'engineering-change': 'שינויים הנדסיים', 'iot-sensor-hub': 'מרכז חיישנים IoT',
  'measurement-comparison': 'השוואת מדידות', 'safety-incidents': 'אירועי בטיחות', 'scrap-tracker': 'מעקב גרוטאות',
  'supply-chain-traceability': 'עקיבות שרשרת אספקה', 'supply-chain-workflow': 'זרימת שרשרת אספקה',
  'tool-equipment': 'כלים וציוד',
  'variation-orders': 'הוראות שינוי',
  'esg-sustainability': 'ESG וקיימות', 'metric-dictionary': 'מילון מדדים',
  'department-manager': 'ניהול מחלקות', 'duplicate-resolution': 'פתרון כפילויות', 'feature-flags': 'דגלי פיצ׳רים',
  'import-staging': 'staging יבוא', 'intelligent-notifications': 'התראות חכמות', 'multi-site': 'ריבוי אתרים',
  'realtime-collaboration': 'שיתוף פעולה בזמן אמת', 'sla-management': 'ניהול SLA',
  'competitor-intelligence': 'אינטליגנציית מתחרים',
  'warranty-management': 'ניהול אחריות',
};

const catMap = {
  'ai-engine': 11, 'crm': 2, 'documents': 10, 'executive': 1,
  'finance': 6, 'hr': 8, 'import': 15, 'installations': 4,
  'inventory': 5, 'marketing': 2, 'mobile': 9, 'portal': 14,
  'procurement': 3, 'production': 4, 'projects': 4, 'reports': 1,
  'settings': 15, 'strategy': 11, 'support': 9,
};

const emoji = { 1: '📊', 2: '💼', 3: '🛒', 4: '🏗️', 5: '📦', 6: '💰', 7: '🧾', 8: '👥', 9: '💬', 10: '📄', 11: '🤖', 12: '⚖️', 13: '🧰', 14: '🔗', 15: '⚙️' };

const rows = [];
for (const p of lines) {
  const parts = p.split('/');
  const folder = parts[0];
  const route = '/' + p;
  const cat = catMap[folder] || 15;
  const bname = parts[parts.length - 1];
  const label = labels[bname] || bname.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  rows.push({ route, cat, label, emoji: emoji[cat] || '🧩' });
}

const byCat = {};
for (const r of rows) { (byCat[r.cat] = byCat[r.cat] || []).push(r); }

const Q = "'";
function esc(s) { return String(s).split(Q).join(Q + Q); }

let sql = '';
sql += '-- ============================================================\n';
sql += '-- FILE: supabase/migrations/00039_final_merge_menu_additions.sql\n';
sql += '-- Purpose:\n';
sql += '--   Add menu entries for pages discovered in the FINAL merge from\n';
sql += '--   technokoluzi-erp-main (1).zip and KOBI-EL-System-2026-master.zip.\n';
sql += '--\n';
sql += '--   Guarded against collisions with 00034/00035/00036/00037/00038.\n';
sql += '-- Categories 1..15 (post-real-estate scheme):\n';
sql += '--   1 Executive | 2 Sales/CRM | 3 Procurement | 4 Projects | 5 Inventory\n';
sql += '--   6 Finance | 7 Tax | 8 HR | 9 Communications | 10 Documents\n';
sql += '--   11 AI | 12 Compliance | 13 Infra | 14 Integrations | 15 System\n';
sql += '-- ============================================================\n\n';

let order = 900;
const catOrder = Object.keys(byCat).map(Number).sort((a, b) => a - b);
for (const cat of catOrder) {
  const list = byCat[cat];
  sql += `-- category ${cat} — ${list.length} new route(s)\n`;
  sql += 'delete from public.app_menu where route in (\n';
  sql += list.map(r => '  ' + Q + r.route + Q).join(',\n') + '\n);\n\n';
  sql += 'insert into public.app_menu (label, route, icon, parent_id, order_index) values\n';
  const vals = list.map((r, i) =>
    '  (' + Q + esc(r.label) + Q + ', ' + Q + r.route + Q + ', ' + Q + r.emoji + Q + ', ' + r.cat + ', ' + (order + i) + ')'
  );
  order += list.length + 5;
  sql += vals.join(',\n') + ';\n\n';
}

const out = 'C:/Users/kobi/Projects/techno-kol-uzi-2026/supabase/migrations/00039_final_merge_menu_additions.sql';
fs.writeFileSync(out, sql);
console.log('Wrote ' + out);
console.log('Rows: ' + rows.length + ', categories: ' + catOrder.length);
