/**
 * SmartBuild Pilot 2.0 — Master Flow Pipeline
 *
 * 14 stages from land acquisition to closure. computePipelineStatus
 * derives each stage's live progress from the entities in the store.
 */

'use strict';

const { STAGE_IDS, TODAY } = require('./contracts');

const STAGES = [
  { id: 'land', seq: 1, label: 'קרקע', icon: '🌍', description: 'איתור, בדיקת נאותות ורכישת קרקע', entryCriteria: ['הזדמנות מאותרת'], exitCriteria: ['עסקת קרקע הושלמה', 'מימון קרקע סגור'], gates: ['אישור ועדת השקעות'], ownedEntities: ['project', 'loan'] },
  { id: 'feasibility', seq: 2, label: 'היתכנות', icon: '🧮', description: 'דוח אפס ראשוני, תמהיל דירות, מרווח יעד', entryCriteria: ['קרקע בבעלות'], exitCriteria: ['דוח אפס מאושר', 'מרווח יזמי מעל יעד'], gates: ['שער היתכנות'], ownedEntities: ['budget_item', 'decision_gate'] },
  { id: 'planning', seq: 3, label: 'תכנון', icon: '📐', description: 'אדריכלות, יועצים, תב"ע', entryCriteria: ['היתכנות אושרה'], exitCriteria: ['תכנון מאושר', 'תב"ע בתוקף'], gates: [], ownedEntities: ['permit', 'milestone'] },
  { id: 'permits', seq: 4, label: 'היתרים', icon: '📄', description: 'היתר בנייה ואגרות', entryCriteria: ['תכנון הוגש'], exitCriteria: ['היתר בנייה בתוקף'], gates: [], ownedEntities: ['permit'] },
  { id: 'financing', seq: 5, label: 'מימון', icon: '🏦', description: 'ליווי בנקאי, קובננטים, הון עצמי', entryCriteria: ['היתר בתוקף'], exitCriteria: ['הסכם ליווי חתום'], gates: ['אישור אשראי'], ownedEntities: ['loan', 'covenant'] },
  { id: 'tendering', seq: 6, label: 'מכרזים', icon: '📢', description: 'מכרזי קבלנים ראשיים', entryCriteria: ['תקציב מאושר'], exitCriteria: ['זוכים הוכרזו לסעיפים המרכזיים'], gates: [], ownedEntities: ['tender', 'bid'] },
  { id: 'contracting', seq: 7, label: 'התקשרות', icon: '📜', description: 'חתימת חוזים ויצירת התחייבויות', entryCriteria: ['זוכה נבחר'], exitCriteria: ['חוזי מפתח חתומים'], gates: [], ownedEntities: ['contract'] },
  { id: 'sales', seq: 8, label: 'מכירות', icon: '🏷️', description: 'השקת מכירות ועמידה ביעד presales', entryCriteria: ['היתר + מחירון מאושר'], exitCriteria: ['יעד מכירות מוקדמות הושג'], gates: ['אישור מחירון'], ownedEntities: ['apartment', 'sale', 'buyer'] },
  { id: 'execution', seq: 9, label: 'ביצוע', icon: '🏗️', description: 'בנייה בפועל — אבני דרך ובקרה', entryCriteria: ['צו התחלת עבודה'], exitCriteria: ['גמר שלד וגמרים'], gates: ['שער תחילת ביצוע'], ownedEntities: ['milestone', 'payment_request', 'change_order'] },
  { id: 'payment_control', seq: 10, label: 'בקרת תשלומים', icon: '🧾', description: 'חשבונות קבלן, עכבונות, בקרה תקציבית', entryCriteria: ['ביצוע פעיל'], exitCriteria: ['חשבונות סופיים סגורים'], gates: [], ownedEntities: ['payment_request', 'budget_item'] },
  { id: 'delivery', seq: 11, label: 'מסירות', icon: '🔑', description: 'טופס 4, פרוטוקולים ומסירת דירות', entryCriteria: ['טופס 4 התקבל'], exitCriteria: ['כל הדירות נמסרו'], gates: [], ownedEntities: ['delivery', 'permit'] },
  { id: 'registration', seq: 12, label: 'רישום', icon: '🏛️', description: 'רישום בית משותף וזכויות רוכשים', entryCriteria: ['מסירות הושלמו'], exitCriteria: ['רישום הושלם'], gates: [], ownedEntities: ['project'] },
  { id: 'warranty', seq: 13, label: 'בדק', icon: '🔧', description: 'שנת בדק וטיפול בליקויים', entryCriteria: ['מסירה ראשונה'], exitCriteria: ['תום שנת בדק ותביעות סגורות'], gates: [], ownedEntities: ['warranty_claim'] },
  { id: 'closure', seq: 14, label: 'סגירה', icon: '🏁', description: 'סגירה פיננסית, פירעון ליווי, דוח סופי', entryCriteria: ['בדק הסתיים'], exitCriteria: ['דוח סגירה מאושר', 'הלוואות נפרעו'], gates: ['שער סגירה'], ownedEntities: ['project', 'loan'] },
];

function getStage(id) {
  return STAGES.find((s) => s.id === id) || null;
}

// היוריסטיקות התקדמות לכל שלב, מחושבות מהישויות בזמן אמת
function stageProgress(store, projectId, stageId, project, asOf) {
  const pctDone = (arr, isDone) => (arr.length ? Math.round((arr.filter(isDone).length / arr.length) * 100) : 0);
  switch (stageId) {
    case 'land':
      return project.start_date ? 100 : 0;
    case 'feasibility': {
      const gates = store.find('decision_gate', (g) => g.project_id === projectId && g.stage === 'feasibility');
      return gates.length ? pctDone(gates, (g) => g.status === 'approved') : (project.start_date ? 100 : 0);
    }
    case 'planning': {
      const zoning = store.find('permit', (p) => p.project_id === projectId && p.permit_type === 'zoning');
      return zoning.length ? pctDone(zoning, (p) => p.status === 'granted') : 0;
    }
    case 'permits': {
      const permits = store.find('permit', (p) => p.project_id === projectId && p.permit_type === 'building_permit');
      return permits.length ? pctDone(permits, (p) => p.status === 'granted') : 0;
    }
    case 'financing': {
      const loans = store.find('loan', (l) => l.project_id === projectId);
      return loans.length ? pctDone(loans, (l) => l.status === 'active' || l.status === 'repaid') : 0;
    }
    case 'tendering': {
      const tenders = store.find('tender', (t) => t.project_id === projectId);
      return tenders.length ? pctDone(tenders, (t) => t.status === 'awarded') : 0;
    }
    case 'contracting': {
      const contracts = store.find('contract', (c) => c.project_id === projectId);
      return contracts.length ? pctDone(contracts, (c) => c.status === 'active' || c.status === 'completed') : 0;
    }
    case 'sales': {
      const apartments = store.find('apartment', (a) => a.project_id === projectId);
      const sold = apartments.filter((a) => a.status === 'sold' || a.status === 'delivered').length;
      return apartments.length ? Math.round((sold / apartments.length) * 100) : 0;
    }
    case 'execution': {
      const ms = store.find('milestone', (m) => m.project_id === projectId && m.stage === 'execution');
      if (!ms.length) return 0;
      const totalWeight = ms.reduce((a, m) => a + (m.weight_pct || 0), 0) || 1;
      const doneWeight = ms.filter((m) => m.status === 'completed').reduce((a, m) => a + (m.weight_pct || 0), 0);
      return Math.round((doneWeight / totalWeight) * 100);
    }
    case 'payment_control': {
      const prs = store.find('payment_request', (pr) => pr.project_id === projectId);
      return prs.length ? pctDone(prs, (pr) => pr.status === 'paid') : 0;
    }
    case 'delivery': {
      const dels = store.find('delivery', (d) => d.project_id === projectId);
      return dels.length ? pctDone(dels, (d) => d.status === 'completed') : 0;
    }
    case 'registration':
      return project.current_stage === 'registration' ? 50 : ['warranty', 'closure'].includes(project.current_stage) ? 100 : 0;
    case 'warranty': {
      const claims = store.find('warranty_claim', (w) => w.project_id === projectId);
      return claims.length ? pctDone(claims, (w) => w.status === 'closed') : 0;
    }
    case 'closure':
      return project.current_stage === 'closure' ? 50 : 0;
    default:
      return 0;
  }
}

function computePipelineStatus(store, projectId, asOf = TODAY) {
  const project = store.get('project', projectId);
  if (!project) return null;
  const currentIdx = STAGE_IDS.indexOf(project.current_stage);
  const stages = STAGES.map((stage) => {
    const idx = STAGE_IDS.indexOf(stage.id);
    const state = idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'upcoming';
    return Object.assign({}, stage, {
      state,
      progress_pct: state === 'completed' ? 100 : stageProgress(store, projectId, stage.id, project, asOf),
    });
  });
  return { currentStage: project.current_stage, stages };
}

module.exports = { STAGES, getStage, computePipelineStatus };
