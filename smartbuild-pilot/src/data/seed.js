/**
 * SmartBuild Pilot 2.0 — Demo Seed: פרויקט "מגדלי אלמוגים", נתניה
 *
 * Fully deterministic (no randomness). All cross-entity sums are kept
 * consistent: contracts feed budget committed_amount, paid payment
 * requests feed paid_amount, loan drawdowns sum to drawn_amount, and
 * every payment schedule sums to exactly 100% of the contract price.
 */

'use strict';

const { TODAY } = require('../core/contracts');

// ── date helpers ─────────────────────────────────────────────
function monthAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function maxDate(a, b) { return a > b ? a : b; }
function monthOf(dateStr) { return dateStr.slice(0, 7); }

function seed(store) {
  // ── פרויקט ────────────────────────────────────────────────
  store.create('project', {
    id: 'proj-1',
    name: 'מגדלי אלמוגים',
    city: 'נתניה',
    address: 'שדרות האלמוגים 12-14, נתניה',
    status: 'execution',
    current_stage: 'execution',
    total_land_sqm: 4200,
    total_sellable_sqm: 5030,
    units_planned: 48,
    start_date: '2024-06-01',
    expected_end_date: '2027-06-30',
    equity_committed: 28000000,
    discount_rate_annual: 0.09,
    required_presales_pct: 30,
    description: 'שני מגדלי בוטיק בני 8 קומות, 48 יח"ד, כולל דירות גן ופנטהאוזים, בליווי בנקאי מלא',
  });

  // ── מדדים: cpi 100→106.8, תשומות בנייה 100→109.4 (2024-01..2026-07) ──
  const INDEX_MONTHS = 31;
  const cpiAt = {};
  for (let i = 0; i < INDEX_MONTHS; i++) {
    const month = monthAdd('2024-01', i);
    const cpi = Math.round((100 + (6.8 * i) / (INDEX_MONTHS - 1)) * 100) / 100;
    const ci = Math.round((100 + (9.4 * i) / (INDEX_MONTHS - 1)) * 100) / 100;
    cpiAt[month] = cpi;
    store.create('index_rate', { index_type: 'cpi', month, value: cpi });
    store.create('index_rate', { index_type: 'construction_inputs', month, value: ci });
  }
  const cpiFor = (dateStr) => cpiAt[monthOf(dateStr)] || cpiAt[monthAdd('2024-01', INDEX_MONTHS - 1)];

  // ── 48 דירות: 2 בניינים × 8 קומות × 3 דירות ─────────────────
  const ROOMS_CYCLE = [3, 4, 5];
  const AREA_BY_ROOMS = { 3: 78, 4: 98, 5: 118 };
  let aptSeq = 0;
  for (const building of ['A', 'B']) {
    for (let floor = 1; floor <= 8; floor++) {
      for (let pos = 0; pos < 3; pos++) {
        aptSeq += 1;
        const isGarden = floor === 1 && pos < 2;               // 4 דירות גן
        const isPenthouse = floor === 8 && pos === 0;          // 2 פנטהאוזים
        const rooms = isPenthouse ? 6 : ROOMS_CYCLE[pos];
        const area = isPenthouse ? 160 : AREA_BY_ROOMS[rooms];
        const pricePerSqm = isPenthouse ? 58000 : 45000; // קו ראשון לים — מחירי יוקרה
        let price = area * pricePerSqm * (1 + (floor - 1) * 0.005);
        if (isGarden) price *= 1.08;
        price = Math.round(price / 10000) * 10000;
        store.create('apartment', {
          id: `apt-${aptSeq}`,
          project_id: 'proj-1',
          unit_number: `${building}-${floor}0${pos + 1}`,
          building,
          floor,
          rooms,
          area_sqm: area,
          balcony_sqm: isGarden ? 55 : isPenthouse ? 40 : 12,
          direction: pos === 0 ? 'דרום-מערב' : pos === 1 ? 'צפון-מזרח' : 'דרום-מזרח',
          list_price: price,
          current_price: price,
          status: 'available',
          apartment_type: isPenthouse ? 'penthouse' : isGarden ? 'garden' : 'standard',
        });
      }
    }
  }

  // ── רוכשים ────────────────────────────────────────────────
  const FIRST = ['יוסי', 'מיכל', 'דוד', 'רונית', 'אבי', 'תמר', 'אלון', 'נועה', 'עמית', 'שירה',
    'גיל', 'דנה', 'אורי', 'הילה', 'רועי', 'ליאת', 'ניר', 'מאיה', 'איתי', 'קרן', 'עופר'];
  const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'פרידמן', 'שפירא', 'חדד', 'עמר',
    'גבאי', 'דיין', 'אזולאי', 'ברק', 'שרון', 'אלבז', 'רוזן', 'הרוש', 'נחום', 'סבן', 'טל'];
  for (let i = 1; i <= 21; i++) {
    store.create('buyer', {
      id: `buyer-${i}`,
      name: `${FIRST[i - 1]} ${LAST[i - 1]}`,
      id_number: String(200000000 + i * 4271),
      phone: `050-${String(7000000 + i * 13579).slice(0, 7)}`,
      email: `buyer${i}@example.com`,
      status: i <= 18 ? 'signed' : i <= 20 ? 'negotiation' : 'lead',
    });
  }

  // ── מכירות: 18 חתומות (חודשיות 2025-01..2026-06), 2 שמורות, 1 מבוטלת ──
  const MILESTONE_DATES = ['2025-06-15', '2025-12-15', '2026-05-15', '2026-11-15'];
  const DELIVERY_DATE = '2027-06-30';

  for (let i = 1; i <= 21; i++) {
    const apt = store.get('apartment', `apt-${i}`);
    const isSigned = i <= 18;
    const isReserved = i === 19 || i === 20;
    const signMonth = isSigned ? monthAdd('2025-01', i - 1) : '2026-06';
    const signDate = `${signMonth}-10`;
    const contractPrice = apt.list_price;
    const status = isSigned ? 'signed' : isReserved ? 'reserved' : 'cancelled';

    const sale = store.create('sale', {
      id: `sale-${i}`,
      project_id: 'proj-1',
      apartment_id: apt.id,
      buyer_id: `buyer-${i}`,
      contract_price: contractPrice,
      sign_date: signDate,
      base_index_value: cpiFor(signDate),
      status,
      broker_fee_pct: i % 3 === 0 ? 2 : 0,
      notes: status === 'cancelled' ? 'בוטל — הרוכש לא עמד בתשלום שני' : '',
    });

    store.update('apartment', apt.id, {
      status: isSigned ? 'sold' : isReserved ? 'reserved' : 'available',
    });
    if (!isSigned) continue;

    // לוח תשלומים לפי חוק המכר: 7% / 13% / 4×15% / 20% = 100%
    const rows = [
      { pct: 7, due: signDate, label: 'חתימת חוזה' },
      { pct: 13, due: addDays(signDate, 45), label: 'תשלום שני (45 יום)' },
      { pct: 15, due: maxDate(MILESTONE_DATES[0], addDays(signDate, 60)), label: 'גמר שלד קומה 2' },
      { pct: 15, due: maxDate(MILESTONE_DATES[1], addDays(signDate, 60)), label: 'גמר שלד קומה 6' },
      { pct: 15, due: maxDate(MILESTONE_DATES[2], addDays(signDate, 60)), label: 'גמר שלד מלא' },
      { pct: 15, due: maxDate(MILESTONE_DATES[3], addDays(signDate, 60)), label: 'טיח וריצוף' },
      { pct: 20, due: DELIVERY_DATE, label: 'מסירה' },
    ];
    let allocated = 0;
    let cumulativePaidBase = 0;
    rows.forEach((row, idx) => {
      const isLast = idx === rows.length - 1;
      const amountBase = isLast ? contractPrice - allocated : Math.round((contractPrice * row.pct) / 100);
      allocated += amountBase;

      // רוכש 7 מדלג על שני תשלומים → פיגור (סיפור גבייה לדמו)
      const skipped = i === 7 && (idx === 3 || idx === 4);
      const dueBeforeToday = row.due < TODAY;
      const willPay = dueBeforeToday && !skipped;

      const item = store.create('payment_schedule_item', {
        sale_id: sale.id,
        seq: idx + 1,
        due_date: row.due,
        amount_base: amountBase,
        pct_of_price: row.pct,
        milestone_label: row.label,
        status: willPay ? 'paid' : dueBeforeToday ? 'overdue' : 'pending',
      });

      if (willPay) {
        // חוק המכר: החלק בתוך 20% הראשונים — ללא הצמדה; היתרה צמודה ב-50% משינוי המדד
        const threshold = contractPrice * 0.2;
        const unlinkedPart = Math.max(0, Math.min(amountBase, threshold - cumulativePaidBase));
        const linkedPart = amountBase - unlinkedPart;
        const idxAtPay = cpiFor(row.due);
        const linkage = Math.round(linkedPart * Math.max(0, idxAtPay / sale.base_index_value - 1) * 0.5);
        store.create('buyer_payment', {
          sale_id: sale.id,
          schedule_item_id: item.id,
          pay_date: row.due,
          amount_paid: amountBase + linkage,
          index_value_at_payment: idxAtPay,
          linkage_amount: linkage,
          receipt_number: `RCP-${i}-${idx + 1}`,
        });
      }
      cumulativePaidBase += amountBase;
    });
  }

  // ── עץ תקציב: 8 שורשי קטגוריה + 20 עלים, ~185.2M ────────────
  const CATEGORY_ROOTS = [
    ['land', 'קרקע'], ['hard_costs', 'עלויות בנייה'], ['soft_costs', 'עלויות רכות'],
    ['financing', 'מימון'], ['marketing', 'שיווק'], ['permits_tax', 'אגרות והיטלים'],
    ['guarantees', 'ערבויות'], ['contingency', 'בצ"מ'],
  ];
  const rootIds = {};
  CATEGORY_ROOTS.forEach(([cat, name], idx) => {
    const root = store.create('budget_item', {
      id: `bl-root-${cat}`,
      project_id: 'proj-1',
      parent_id: null,
      budget_code: `R${idx + 1}00`,
      budget_name: name,
      category: cat,
      original_budget: 0, approved_budget: 0, transferred_in: 0, transferred_out: 0,
      approved_change_orders: 0, contingency_used: 0, committed_amount: 0,
      invoiced_amount: 0, paid_amount: 0, estimated_remaining_cost: 0,
      price_change_impact: 0, spend_start_month: '2024-06', spend_months: 1,
    });
    rootIds[cat] = root.id;
  });

  // [id, code, name, category, original, committed, invoiced, paid, estRemaining, priceImpact, startMonth, months, extras]
  const LEAVES = [
    ['bl-land', '1100', 'רכישת קרקע', 'land', 52000000, 52000000, 52000000, 52000000, 0, 0, '2024-06', 1],
    ['bl-land-tax', '1200', 'מס רכישה', 'land', 3100000, 3100000, 3100000, 3100000, 0, 0, '2024-07', 1],
    ['bl-shell', '2100', 'עבודות שלד', 'hard_costs', 38000000, 36000000, 18900000, 16600000, 18400000, 800000, '2025-04', 20, { transferred_in: 400000 }],
    ['bl-systems', '2200', 'מערכות (חשמל/אינסטלציה/מיזוג)', 'hard_costs', 16000000, 15200000, 7800000, 3900000, 8200000, 400000, '2025-11', 16],
    ['bl-finishes', '2300', 'עבודות גמר', 'hard_costs', 22000000, 0, 0, 0, 22800000, 1100000, '2026-08', 12],
    ['bl-development', '2400', 'פיתוח סביבתי', 'hard_costs', 6500000, 5800000, 2600000, 1400000, 3900000, 0, '2025-08', 18],
    ['bl-elevators', '2500', 'מעליות', 'hard_costs', 3200000, 3000000, 0, 0, 3200000, 0, '2026-03', 10],
    ['bl-parking', '2600', 'חניון תת-קרקעי', 'hard_costs', 8500000, 0, 0, 0, 10100000, 400000, '2025-06', 14, { transferred_in: 750000 }],
    ['bl-planning', '3100', 'תכנון ואדריכלות', 'soft_costs', 4200000, 4200000, 3400000, 3200000, 800000, 0, '2024-06', 30],
    ['bl-consultants', '3200', 'יועצים', 'soft_costs', 2100000, 1600000, 1100000, 1000000, 900000, 0, '2024-06', 36],
    ['bl-pm', '3300', 'ניהול פרויקט', 'soft_costs', 3600000, 3600000, 1900000, 1800000, 1700000, 0, '2025-01', 30],
    ['bl-legal', '3400', 'ליווי משפטי', 'soft_costs', 1400000, 1100000, 700000, 700000, 600000, 0, '2024-06', 36],
    ['bl-interest', '4100', 'ריבית ליווי בנקאי', 'financing', 7800000, 2900000, 2900000, 2900000, 4900000, 0, '2025-04', 26],
    ['bl-bank-fees', '4200', 'עמלות בנק וערבויות מימון', 'financing', 1200000, 900000, 900000, 900000, 300000, 0, '2025-04', 26],
    ['bl-marketing', '5100', 'שיווק ופרסום', 'marketing', 3800000, 2400000, 1700000, 1600000, 1900000, 0, '2025-01', 30],
    ['bl-sales-office', '5200', 'משרד מכירות ודיגום', 'marketing', 900000, 700000, 700000, 700000, 200000, 0, '2025-01', 12],
    ['bl-betterment', '6100', 'היטל השבחה', 'permits_tax', 4500000, 4500000, 4500000, 4500000, 0, 0, '2024-09', 3],
    ['bl-fees', '6200', 'אגרות בנייה', 'permits_tax', 1800000, 1700000, 1700000, 1700000, 100000, 0, '2025-02', 2],
    ['bl-guarantees', '7100', 'ערבויות חוק המכר', 'guarantees', 1600000, 800000, 800000, 800000, 800000, 0, '2025-04', 26],
    ['bl-contingency', '8100', 'בצ"מ (בלתי צפוי מראש)', 'contingency', 3000000, 0, 0, 0, 1850000, 0, '2026-08', 10, { transferred_out: 1150000 }],
  ];
  for (const leaf of LEAVES) {
    const [id, code, name, category, original, committed, invoiced, paid, estRem, priceImpact, startMonth, months, extras] = leaf;
    store.create('budget_item', Object.assign({
      id, project_id: 'proj-1', parent_id: rootIds[category],
      budget_code: code, budget_name: name, category,
      original_budget: original, approved_budget: original,
      transferred_in: 0, transferred_out: 0, approved_change_orders: 0, contingency_used: 0,
      committed_amount: committed, invoiced_amount: invoiced, paid_amount: paid,
      estimated_remaining_cost: estRem, price_change_impact: priceImpact,
      spend_start_month: startMonth, spend_months: months,
    }, extras || {}));
  }

  // העברת בצ"מ מאושרת (מסבירה את transferred_in/out לעיל)
  store.create('budget_transfer', {
    project_id: 'proj-1', from_budget_item_id: 'bl-contingency', to_budget_item_id: 'bl-parking',
    amount: 750000, reason: 'התייקרות דיפון וחפירה בחניון', status: 'approved',
    requested_by: 'מנהל פרויקט', decided_at: '2026-03-12',
  });
  store.create('budget_transfer', {
    project_id: 'proj-1', from_budget_item_id: 'bl-contingency', to_budget_item_id: 'bl-shell',
    amount: 400000, reason: 'תוספת זיון בעקבות דוח קונסטרוקטור', status: 'approved',
    requested_by: 'מנהל פרויקט', decided_at: '2026-05-04',
  });
  store.create('budget_transfer', {
    project_id: 'proj-1', from_budget_item_id: 'bl-consultants', to_budget_item_id: 'bl-finishes',
    amount: 300000, reason: 'תגבור תקציב גמרים לקראת מכרז', status: 'pending',
    requested_by: 'סמנכ"ל כספים', decided_at: null,
  });

  // ── הוראות שינוי ─────────────────────────────────────────
  store.create('change_order', {
    project_id: 'proj-1', budget_item_id: 'bl-shell', contract_id: 'contract-1',
    change_type: 'quantity', old_value: 36000000, new_value: 36800000, difference: 800000,
    reason: 'עיבוי קורות מרתף לפי דרישת מכון התקנים', approval_status: 'pending', approval_level: 'cfo',
  });
  store.create('change_order', {
    project_id: 'proj-1', budget_item_id: 'bl-systems', contract_id: 'contract-2',
    change_type: 'scope', old_value: 15200000, new_value: 15450000, difference: 250000,
    reason: 'שדרוג מערכת מיזוג לפנטהאוזים', approval_status: 'approved', approval_level: 'pm_finance',
  });

  // ── קבלנים ────────────────────────────────────────────────
  const CONTRACTORS = [
    ['c-1', 'שלד הצפון בע"מ', 'shell', 4.5, 'רוני אשכנזי'],
    ['c-2', 'מערכות אלקטרה יזמות', 'systems', 4.2, 'סימה ברוך'],
    ['c-3', 'גן ונוף פיתוח', 'development', 3.9, 'משה סויסה'],
    ['c-4', 'מעליות שינדלר ישראל', 'systems', 4.7, 'אנה ליברמן'],
    ['c-5', 'קבוצת בנייה כחול-לבן', 'general', 3.6, 'יעקב אוחיון'],
    ['c-6', 'גמר מושלם בע"מ', 'finishes', 3.2, 'חיים דהן'],
  ];
  CONTRACTORS.forEach(([id, name, trade, rating, contact], i) => {
    store.create('contractor', {
      id, name, company_id: String(510000000 + i * 111111), trade, rating,
      status: 'active', contact_name: contact, phone: `03-55500${i + 10}`,
    });
  });

  // ── מכרזים והצעות ─────────────────────────────────────────
  store.create('tender', {
    id: 'tender-1', project_id: 'proj-1', title: 'מכרז עבודות שלד', trade: 'shell',
    scope_summary: 'שלד מלא לשני מגדלים כולל מרתף חניה', budget_item_id: 'bl-shell',
    estimate_amount: 37000000, published_date: '2025-01-15', closing_date: '2025-03-01',
    status: 'awarded', awarded_bid_id: 'bid-1',
  });
  store.create('tender', {
    id: 'tender-2', project_id: 'proj-1', title: 'מכרז עבודות גמר', trade: 'finishes',
    scope_summary: 'גמר מלא 48 יח"ד + שטחים ציבוריים', budget_item_id: 'bl-finishes',
    estimate_amount: 22000000, published_date: '2026-06-01', closing_date: '2026-08-01',
    status: 'bidding', awarded_bid_id: null,
  });
  store.create('tender', {
    id: 'tender-3', project_id: 'proj-1', title: 'מכרז השלמת חניון', trade: 'development',
    scope_summary: 'ריצוף, איטום ומערכות חניון תת-קרקעי', budget_item_id: 'bl-parking',
    estimate_amount: 8500000, published_date: null, closing_date: null,
    status: 'draft', awarded_bid_id: null,
  });
  const BIDS = [
    ['bid-1', 'tender-1', 'c-1', 36000000, 540, 88, 'won'],
    ['bid-2', 'tender-1', 'c-5', 38500000, 600, 74, 'lost'],
    ['bid-3', 'tender-1', 'c-6', 35900000, 620, 55, 'lost'],
    ['bid-4', 'tender-2', 'c-5', 21400000, 360, 78, 'submitted'],
    ['bid-5', 'tender-2', 'c-6', 17800000, 300, 62, 'submitted'],   // חשוד: ~19% מתחת לאומדן
    ['bid-6', 'tender-2', 'c-2', 23100000, 380, 85, 'submitted'],
    ['bid-7', 'tender-2', 'c-4', 22600000, 400, 81, 'submitted'],
  ];
  for (const [id, tenderId, contractorId, amount, days, quality, status] of BIDS) {
    store.create('bid', {
      id, tender_id: tenderId, contractor_id: contractorId,
      amount, days_to_complete: days, score_quality: quality, status,
    });
  }

  // ── חוזים ─────────────────────────────────────────────────
  const CONTRACTS = [
    ['contract-1', 'c-1', 'tender-1', 'חוזה שלד ראשי', 36000000, '2025-04-01', 'bl-shell'],
    ['contract-2', 'c-2', null, 'חוזה מערכות', 15200000, '2025-11-01', 'bl-systems'],
    ['contract-3', 'c-3', null, 'חוזה פיתוח סביבתי', 5800000, '2025-08-15', 'bl-development'],
    ['contract-4', 'c-4', null, 'חוזה אספקת מעליות', 3000000, '2026-02-01', 'bl-elevators'],
  ];
  for (const [id, contractorId, tenderId, title, sum, signedDate, budgetItemId] of CONTRACTS) {
    store.create('contract', {
      id, project_id: 'proj-1', contractor_id: contractorId, tender_id: tenderId,
      title, contract_sum: sum, signed_date: signedDate, retention_pct: 5,
      index_linked: true, budget_item_id: budgetItemId, status: 'active',
    });
  }

  // ── חשבונות קבלן (14) — הסכומים מסתכמים בדיוק ל-paid/invoiced של הסעיפים ──
  // contract-1 (שלד): 7 שולמו = 16.6M, 1 בבדיקת מפקח = 2.3M → invoiced 18.9M
  const SHELL_PAID = [2200000, 2400000, 2500000, 2300000, 2600000, 2400000, 2200000];
  SHELL_PAID.forEach((amount, i) => {
    const period = monthAdd('2025-10', i);
    store.create('payment_request', {
      project_id: 'proj-1', contract_id: 'contract-1', contractor_id: 'c-1',
      seq: i + 1, period, amount_requested: Math.round(amount * 1.04),
      amount_approved: amount, retention_held: Math.round(amount * 0.05),
      status: 'paid', submitted_date: `${period}-25`, paid_date: `${monthAdd(period, 1)}-10`,
    });
  });
  store.create('payment_request', {
    project_id: 'proj-1', contract_id: 'contract-1', contractor_id: 'c-1',
    seq: 8, period: '2026-06', amount_requested: 2450000, amount_approved: 2300000,
    retention_held: 115000, status: 'supervisor_review', submitted_date: '2026-06-25', paid_date: null,
  });
  // contract-2 (מערכות): 2 שולמו = 3.9M, 1 מאושר 1.9M, 1 הוגש 2.0M → invoiced 7.8M
  const SYSTEMS_REQS = [
    [1, '2026-03', 1800000, 'paid', '2026-04-10'],
    [2, '2026-04', 2100000, 'paid', '2026-05-10'],
    [3, '2026-05', 1900000, 'approved', null],
    [4, '2026-06', 2000000, 'submitted', null],
  ];
  for (const [seqN, period, amount, status, paidDate] of SYSTEMS_REQS) {
    store.create('payment_request', {
      project_id: 'proj-1', contract_id: 'contract-2', contractor_id: 'c-2',
      seq: seqN, period, amount_requested: Math.round(amount * 1.03), amount_approved: amount,
      retention_held: Math.round(amount * 0.05), status,
      submitted_date: `${period}-25`, paid_date: paidDate,
    });
  }
  // contract-3 (פיתוח): 1 שולם 1.4M, 1 מאושר 1.2M → invoiced 2.6M
  store.create('payment_request', {
    project_id: 'proj-1', contract_id: 'contract-3', contractor_id: 'c-3',
    seq: 1, period: '2026-02', amount_requested: 1500000, amount_approved: 1400000,
    retention_held: 70000, status: 'paid', submitted_date: '2026-02-25', paid_date: '2026-03-10',
  });
  store.create('payment_request', {
    project_id: 'proj-1', contract_id: 'contract-3', contractor_id: 'c-3',
    seq: 2, period: '2026-05', amount_requested: 1250000, amount_approved: 1200000,
    retention_held: 60000, status: 'approved', submitted_date: '2026-05-25', paid_date: null,
  });

  // ── הלוואות וליווי בנקאי ──────────────────────────────────
  store.create('loan', {
    id: 'loan-1', project_id: 'proj-1', lender: 'בנק הפועלים — ליווי סגור',
    facility_type: 'construction_loan', facility_amount: 95000000, drawn_amount: 41000000,
    interest_rate_annual: 0.062, status: 'active', start_date: '2025-04-01', maturity_date: '2027-12-31',
  });
  store.create('loan', {
    id: 'loan-2', project_id: 'proj-1', lender: 'בנק לאומי — הלוואת קרקע',
    facility_type: 'land_loan', facility_amount: 30000000, drawn_amount: 30000000,
    interest_rate_annual: 0.055, status: 'active', start_date: '2024-06-01', maturity_date: '2027-06-30',
  });
  const DRAWDOWNS_L1 = [
    ['2025-05-05', 5000000], ['2025-07-05', 4000000], ['2025-09-05', 5000000], ['2025-11-05', 6000000],
    ['2026-01-05', 5000000], ['2026-03-05', 6000000], ['2026-05-05', 5000000], ['2026-06-20', 5000000],
  ];
  for (const [date, amount] of DRAWDOWNS_L1) {
    store.create('loan_transaction', { loan_id: 'loan-1', tx_type: 'drawdown', tx_date: date, amount });
  }
  const INTEREST_L1 = [
    ['2025-07-31', 310000], ['2025-10-31', 520000], ['2026-01-31', 620000], ['2026-04-30', 710000],
  ];
  for (const [date, amount] of INTEREST_L1) {
    store.create('loan_transaction', { loan_id: 'loan-1', tx_type: 'interest', tx_date: date, amount });
  }
  store.create('loan_transaction', { loan_id: 'loan-2', tx_type: 'drawdown', tx_date: '2024-06-15', amount: 30000000 });

  // ── קובננטים ──────────────────────────────────────────────
  store.create('covenant', { id: 'cov-1', loan_id: 'loan-1', name: 'יחס חוב לשווי (LTV)', metric: 'ltv', operator: '<=', threshold: 0.65, status: 'ok' });
  store.create('covenant', { id: 'cov-2', loan_id: 'loan-1', name: 'יחס חוב לעלות (LTC)', metric: 'ltc', operator: '<=', threshold: 0.75, status: 'ok' });
  store.create('covenant', { id: 'cov-3', loan_id: 'loan-1', name: 'כיסוי מכירות מוקדמות', metric: 'presales_coverage', operator: '>=', threshold: 60, status: 'warning' });
  store.create('covenant', { id: 'cov-4', loan_id: 'loan-1', name: 'הזרמת הון עצמי מינימלית', metric: 'equity_injection', operator: '>=', threshold: 25000000, status: 'ok' });

  // ── אבני דרך (12): 5 הושלמו, 1 באיחור ─────────────────────
  const MILESTONES = [
    ['רכישת קרקע והשלמת עסקה', 'land', '2024-06-15', '2024-06-15', 5, 'completed'],
    ['אישור תב"ע נקודתית', 'planning', '2024-11-30', '2024-11-30', 5, 'completed'],
    ['קבלת היתר בנייה', 'permits', '2025-02-10', '2025-02-10', 10, 'completed'],
    ['סגירת ליווי בנקאי', 'financing', '2025-04-05', '2025-04-05', 10, 'completed'],
    ['תחילת עבודות באתר', 'execution', '2025-04-20', '2025-04-20', 5, 'completed'],
    ['גמר שלד בניין A', 'execution', '2026-06-01', null, 15, 'delayed'],
    ['גמר שלד בניין B', 'execution', '2026-10-01', null, 15, 'in_progress'],
    ['תחילת עבודות גמר', 'execution', '2026-09-01', null, 10, 'planned'],
    ['קבלת טופס 4', 'delivery', '2027-04-15', null, 10, 'planned'],
    ['תחילת מסירות', 'delivery', '2027-05-01', null, 5, 'planned'],
    ['רישום בית משותף', 'registration', '2027-12-01', null, 5, 'planned'],
    ['סיום שנת בדק', 'warranty', '2028-06-30', null, 5, 'planned'],
  ];
  MILESTONES.forEach(([name, stage, planned, actual, weight, status], i) => {
    store.create('milestone', {
      id: `ms-${i + 1}`, project_id: 'proj-1', name, stage,
      planned_date: planned, actual_date: actual, weight_pct: weight, status,
    });
  });

  // ── היתרים ────────────────────────────────────────────────
  store.create('permit', { id: 'permit-1', project_id: 'proj-1', permit_type: 'zoning', authority: 'ועדה מקומית נתניה', submitted_date: '2024-07-01', granted_date: '2024-11-30', expiry_date: null, status: 'granted' });
  store.create('permit', { id: 'permit-2', project_id: 'proj-1', permit_type: 'building_permit', authority: 'ועדה מקומית נתניה', submitted_date: '2024-12-05', granted_date: '2025-02-10', expiry_date: '2028-02-10', status: 'granted' });
  store.create('permit', { id: 'permit-3', project_id: 'proj-1', permit_type: 'form4', authority: 'עיריית נתניה', submitted_date: '2026-06-20', granted_date: null, expiry_date: null, status: 'submitted' });
  store.create('permit', { id: 'permit-4', project_id: 'proj-1', permit_type: 'occupancy', authority: 'עיריית נתניה', submitted_date: null, granted_date: null, expiry_date: null, status: 'preparing' });

  // ── סיכונים (8) ───────────────────────────────────────────
  const RISKS = [
    ['עליית מדד תשומות הבנייה מעבר לתחזית', 'market', 4, 5, 'הקדמת מכרז גמרים ונעילת מחירים', 'סמנכ"ל כספים', 'mitigating'],
    ['האטה בקצב המכירות', 'market', 3, 4, 'קמפיין שיווקי ממוקד + הטבות מימון לרוכשים', 'סמנכ"ל שיווק', 'open'],
    ['עיכוב בגמר שלד בניין A', 'execution', 4, 3, 'תגבור צוותים + עבודה במשמרות', 'מנהל פרויקט', 'mitigating'],
    ['חריגת עלויות בחניון התת-קרקעי', 'execution', 4, 4, 'העברת בצ"מ + בקרת כמויות שבועית', 'מנהל פרויקט', 'open'],
    ['אי-עמידה בקובננט מכירות מוקדמות', 'financing', 3, 5, 'האצת מכירות + משא ומתן עם הבנק', 'סמנכ"ל כספים', 'open'],
    ['עיכוב בקבלת טופס 4', 'regulatory', 2, 4, 'ליווי צמוד מול העירייה', 'יועץ רישוי', 'open'],
    ['תביעת ליקויי בנייה מרוכשים', 'legal', 2, 3, 'בקרת איכות מוגברת + פרוטוקול מסירה מפורט', 'יועץ משפטי', 'open'],
    ['קשיים פיננסיים של קבלן הגמר הזוכה', 'counterparty', 3, 4, 'בדיקת איתנות פיננסית לפני חתימה + ערבויות ביצוע', 'סמנכ"ל כספים', 'open'],
  ];
  RISKS.forEach(([title, category, probability, impact, mitigation, owner, status], i) => {
    store.create('risk', {
      id: `risk-${i + 1}`, project_id: 'proj-1', title, category,
      probability, impact, score: probability * impact, mitigation, owner, status,
    });
  });

  // ── מסירות ותביעות בדק ────────────────────────────────────
  store.create('delivery', { id: 'delivery-1', project_id: 'proj-1', apartment_id: 'apt-1', sale_id: 'sale-1', scheduled_date: '2027-05-10', actual_date: null, protocol_signed: false, defects_count: 0, status: 'scheduled' });
  store.create('delivery', { id: 'delivery-2', project_id: 'proj-1', apartment_id: 'apt-2', sale_id: 'sale-2', scheduled_date: '2027-05-12', actual_date: null, protocol_signed: false, defects_count: 0, status: 'scheduled' });
  store.create('delivery', { id: 'delivery-3', project_id: 'proj-1', apartment_id: 'apt-3', sale_id: 'sale-3', scheduled_date: '2027-05-17', actual_date: null, protocol_signed: false, defects_count: 0, status: 'scheduled' });
  store.create('warranty_claim', { id: 'wc-1', project_id: 'proj-1', apartment_id: 'apt-1', description: 'רטיבות במרפסת דירת דיגום', reported_date: '2026-05-02', severity: 'minor', status: 'in_repair' });
  store.create('warranty_claim', { id: 'wc-2', project_id: 'proj-1', apartment_id: 'apt-2', description: 'סדק נימי בקיר ממ"ד בדירת דיגום', reported_date: '2026-06-15', severity: 'minor', status: 'open' });

  // ── שערי החלטה ────────────────────────────────────────────
  store.create('decision_gate', {
    id: 'gate-1', project_id: 'proj-1', gate_name: 'אישור ועדת השקעות', stage: 'feasibility',
    criteria: ['מרווח יזמי מעל 15%', 'IRR מעל 12%', 'הון עצמי זמין'], status: 'approved',
    decided_by: 'ועדת השקעות', decided_at: '2024-05-20',
  });
  store.create('decision_gate', {
    id: 'gate-2', project_id: 'proj-1', gate_name: 'אישור תחילת ביצוע', stage: 'execution',
    criteria: ['היתר בנייה בתוקף', 'ליווי בנקאי חתום', 'קבלן שלד נבחר'], status: 'approved',
    decided_by: 'דירקטוריון', decided_at: '2025-04-10',
  });
  store.create('decision_gate', {
    id: 'gate-3', project_id: 'proj-1', gate_name: 'אישור מחירון שלב ב', stage: 'sales',
    criteria: ['ניתוח שוק עדכני', '40% מכירות שלב א', 'אישור סמנכ"ל כספים'], status: 'pending',
    decided_by: null, decided_at: null,
  });
}

module.exports = { seed };
