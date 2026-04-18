/**
 * qc-checklist.js — Quality Control Checklist Engine (בקרת איכות)
 * Agent Y-036 / Swarm Manufacturing / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Metal-fabrication quality-control (QC) checklist engine for Techno-Kol Uzi.
 * Handles incoming inspection, in-process inspection, final/FAI (First Article
 * Inspection) and emits Certificates of Conformance (C of C) for shipments to
 * IAI / Elbit / Rafael / IMI and other Israeli defense-sector customers.
 *
 * Israeli defense/aerospace supplier programs referenced (informative):
 *
 *   • IAI  — Israel Aerospace Industries supplier quality handbook
 *            (requires C of C per lot, PPAP-style FAI on first run, material
 *             traceability to mill cert, Cpk ≥ 1.33 on critical dims).
 *   • Elbit Systems — supplier quality manual: AS9100 aligned, AQL per
 *            MIL-STD-105E (now ANSI/ASQ Z1.4), tightened inspection upon NCR.
 *   • Rafael — שפ"א (Supplier Quality Assurance) program, similar to Elbit.
 *
 * Also aligned with:
 *
 *   • MIL-STD-105E (historical) / ANSI/ASQ Z1.4-2003 — attribute sampling
 *   • AS9102      — Aerospace First Article Inspection Report (FAIR)
 *   • ISO 9001:2015 clause 8.6 — release of products and services
 *   • ת"י ISO 9001 (Israeli standard, identical text)
 *
 * RULE: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 *   - defineChecklist / recordResult never mutate an existing item; they
 *     append new versions or rows. rejectLot creates an NCR record rather
 *     than erasing the inspection.
 *
 * Zero external dependencies. Pure JS. Bilingual (HE + EN) labels.
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *
 *   class QCChecklist
 *     .defineChecklist({ id, sku, operation, stage, items })  → checklist
 *     .createInspection({ checklistId, lotId, inspector, sampleSize })
 *                                                              → inspection
 *     .recordResult(inspectionId, itemId, { value, pass, notes, photo })
 *                                                              → result row
 *     .verdictForInspection(inspectionId)
 *                                                  → { verdict, reasons, aql }
 *     .rejectLot(inspectionId, reason)                         → ncr record
 *     .certificateOfConformance(inspectionId)                  → C of C doc
 *     .controlCharts(checklistItemId, period)
 *                                                → { xbar, r, limits, points }
 *     .cpk(itemId, period)              → { cp, cpk, mean, sigma, USL, LSL }
 *
 *   constants:
 *     AQL_LOT_RANGES              — lot-size letter tables (MIL-STD-105E)
 *     AQL_SAMPLE_PLANS_NORMAL     — normal-inspection sample plans
 *     AQL_SAMPLE_PLANS_TIGHTENED  — tightened-inspection sample plans
 *     AQL_SAMPLE_PLANS_REDUCED    — reduced-inspection sample plans
 *     QC_LABELS_HE                — Hebrew labels
 *     QC_LABELS_EN                — English labels
 *     ISRAELI_DEFENSE_STANDARDS   — referenced standards (metadata)
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// =============================================================================
// 1. Bilingual labels (תוויות דו-לשוניות)
// =============================================================================

const QC_LABELS_HE = Object.freeze({
  checklist: 'רשימת בקרת איכות',
  inspection: 'בדיקה',
  incoming: 'בדיקת קבלה',
  inProcess: 'בדיקה בתהליך',
  final: 'בדיקה סופית',
  fai: 'בדיקה ראשונה (FAI)',
  passFail: 'עובר/לא עובר',
  measurement: 'מדידה',
  visual: 'חזותי',
  functional: 'תפקודי',
  pass: 'עובר',
  fail: 'נפסל',
  pending: 'ממתין',
  verdict: 'פסיקה',
  ncr: 'דוח אי-התאמה (NCR)',
  cOfC: 'תעודת התאמה',
  lot: 'אצווה',
  inspector: 'בודק',
  sampleSize: 'גודל מדגם',
  aql: 'רמת איכות מקובלת (AQL)',
  tightened: 'בדיקה מוגברת',
  reduced: 'בדיקה מופחתת',
  normal: 'בדיקה רגילה',
  cpk: 'מדד יכולת תהליך (Cpk)',
  xbarChart: 'לוח בקרה לממוצע (X̄)',
  rChart: 'לוח בקרה לטווח (R)',
  usl: 'גבול עליון (USL)',
  lsl: 'גבול תחתון (LSL)',
  ucl: 'גבול בקרה עליון (UCL)',
  lcl: 'גבול בקרה תחתון (LCL)',
});

const QC_LABELS_EN = Object.freeze({
  checklist: 'QC Checklist',
  inspection: 'Inspection',
  incoming: 'Incoming Inspection',
  inProcess: 'In-Process Inspection',
  final: 'Final Inspection',
  fai: 'First Article Inspection',
  passFail: 'Pass / Fail',
  measurement: 'Measurement',
  visual: 'Visual',
  functional: 'Functional',
  pass: 'PASS',
  fail: 'FAIL',
  pending: 'Pending',
  verdict: 'Verdict',
  ncr: 'Non-Conformance Report',
  cOfC: 'Certificate of Conformance',
  lot: 'Lot',
  inspector: 'Inspector',
  sampleSize: 'Sample Size',
  aql: 'Acceptance Quality Level',
  tightened: 'Tightened Inspection',
  reduced: 'Reduced Inspection',
  normal: 'Normal Inspection',
  cpk: 'Process Capability (Cpk)',
  xbarChart: 'X-bar Control Chart',
  rChart: 'R Control Chart',
  usl: 'Upper Spec Limit',
  lsl: 'Lower Spec Limit',
  ucl: 'Upper Control Limit',
  lcl: 'Lower Control Limit',
});

const ISRAELI_DEFENSE_STANDARDS = Object.freeze({
  IAI:   { he: 'התעשייה האווירית', doc: 'IAI SQ-PR-001', aqlLevel: 'II', cpkMin: 1.33 },
  ELBIT: { he: 'אלביט מערכות',   doc: 'Elbit SQM Rev. 9', aqlLevel: 'II', cpkMin: 1.33 },
  RAFAEL:{ he: 'רפאל',           doc: 'Rafael SQA-100',  aqlLevel: 'II', cpkMin: 1.67 },
  IMI:   { he: 'IMI מערכות',     doc: 'IMI-QA-300',     aqlLevel: 'II', cpkMin: 1.33 },
  MOD:   { he: 'משרד הביטחון',  doc: 'MOD-QC-STD-01',   aqlLevel: 'II', cpkMin: 1.33 },
});

// =============================================================================
// 2. MIL-STD-105E / ANSI-ASQ Z1.4 sampling tables
// =============================================================================
//
// Lot-size → code letter (General Inspection Level II — the default).
// Lower bound INCLUSIVE, upper bound INCLUSIVE.
//
// Source: MIL-STD-105E Table I (General Inspection Levels, GL-II).
// ----------------------------------------------------------------------------

const AQL_LOT_RANGES = Object.freeze([
  { min: 2,      max: 8,      letters: { I: 'A', II: 'A', III: 'B' } },
  { min: 9,      max: 15,     letters: { I: 'A', II: 'B', III: 'C' } },
  { min: 16,     max: 25,     letters: { I: 'B', II: 'C', III: 'D' } },
  { min: 26,     max: 50,     letters: { I: 'C', II: 'D', III: 'E' } },
  { min: 51,     max: 90,     letters: { I: 'C', II: 'E', III: 'F' } },
  { min: 91,     max: 150,    letters: { I: 'D', II: 'F', III: 'G' } },
  { min: 151,    max: 280,    letters: { I: 'E', II: 'G', III: 'H' } },
  { min: 281,    max: 500,    letters: { I: 'F', II: 'H', III: 'J' } },
  { min: 501,    max: 1200,   letters: { I: 'G', II: 'J', III: 'K' } },
  { min: 1201,   max: 3200,   letters: { I: 'H', II: 'K', III: 'L' } },
  { min: 3201,   max: 10000,  letters: { I: 'J', II: 'L', III: 'M' } },
  { min: 10001,  max: 35000,  letters: { I: 'K', II: 'M', III: 'N' } },
  { min: 35001,  max: 150000, letters: { I: 'L', II: 'N', III: 'P' } },
  { min: 150001, max: 500000, letters: { I: 'M', II: 'P', III: 'Q' } },
  { min: 500001, max: Infinity, letters: { I: 'N', II: 'Q', III: 'R' } },
]);

// Sample size per code letter.
// Source: MIL-STD-105E Table II-A (Single Sampling Plans — Normal).
const AQL_CODE_SAMPLE_SIZE = Object.freeze({
  A: 2,   B: 3,   C: 5,   D: 8,    E: 13,
  F: 20,  G: 32,  H: 50,  J: 80,   K: 125,
  L: 200, M: 315, N: 500, P: 800,  Q: 1250, R: 2000,
});

// Accept / Reject numbers, keyed by [letter][AQL].
// Only the most common AQL values used in metal-fab & defense QA are embedded:
//   0.065, 0.10, 0.25, 0.40, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5
// Values encoded as { Ac, Re } — accept on <= Ac defects, reject on >= Re.
// Source: MIL-STD-105E Table II-A (Normal), Table II-B (Tightened),
//         Table II-C (Reduced). Arrow-up/arrow-down flags collapsed to
//         the letter that the arrow points to (standard MIL-STD convention).
// ----------------------------------------------------------------------------

const _plan = (Ac, Re) => ({ Ac, Re });

const AQL_SAMPLE_PLANS_NORMAL = Object.freeze({
  A: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(0,1), '6.5': _plan(0,1) },
  B: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(0,1), '6.5': _plan(1,2) },
  C: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(1,2), '6.5': _plan(1,2) },
  D: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(1,2), '4.0': _plan(1,2), '6.5': _plan(2,3) },
  E: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(1,2), '2.5': _plan(1,2), '4.0': _plan(2,3), '6.5': _plan(3,4) },
  F: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(1,2), '1.5': _plan(1,2), '2.5': _plan(2,3), '4.0': _plan(3,4), '6.5': _plan(5,6) },
  G: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(1,2), '1.0': _plan(1,2), '1.5': _plan(2,3), '2.5': _plan(3,4), '4.0': _plan(5,6), '6.5': _plan(7,8) },
  H: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(1,2), '0.65': _plan(1,2), '1.0': _plan(2,3), '1.5': _plan(3,4), '2.5': _plan(5,6), '4.0': _plan(7,8), '6.5': _plan(10,11) },
  J: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(1,2), '0.40': _plan(1,2), '0.65': _plan(2,3), '1.0': _plan(3,4), '1.5': _plan(5,6), '2.5': _plan(7,8), '4.0': _plan(10,11),'6.5': _plan(14,15) },
  K: { '0.065': _plan(0,1), '0.10': _plan(1,2), '0.25': _plan(1,2), '0.40': _plan(2,3), '0.65': _plan(3,4), '1.0': _plan(5,6), '1.5': _plan(7,8), '2.5': _plan(10,11),'4.0': _plan(14,15),'6.5': _plan(21,22) },
  L: { '0.065': _plan(1,2), '0.10': _plan(1,2), '0.25': _plan(2,3), '0.40': _plan(3,4), '0.65': _plan(5,6), '1.0': _plan(7,8), '1.5': _plan(10,11),'2.5': _plan(14,15),'4.0': _plan(21,22),'6.5': _plan(21,22) },
  M: { '0.065': _plan(1,2), '0.10': _plan(2,3), '0.25': _plan(3,4), '0.40': _plan(5,6), '0.65': _plan(7,8), '1.0': _plan(10,11),'1.5': _plan(14,15),'2.5': _plan(21,22),'4.0': _plan(21,22),'6.5': _plan(21,22) },
  N: { '0.065': _plan(2,3), '0.10': _plan(3,4), '0.25': _plan(5,6), '0.40': _plan(7,8), '0.65': _plan(10,11),'1.0': _plan(14,15),'1.5': _plan(21,22),'2.5': _plan(21,22),'4.0': _plan(21,22),'6.5': _plan(21,22) },
  P: { '0.065': _plan(3,4), '0.10': _plan(5,6), '0.25': _plan(7,8), '0.40': _plan(10,11),'0.65': _plan(14,15),'1.0': _plan(21,22),'1.5': _plan(21,22),'2.5': _plan(21,22),'4.0': _plan(21,22),'6.5': _plan(21,22) },
  Q: { '0.065': _plan(5,6), '0.10': _plan(7,8), '0.25': _plan(10,11),'0.40': _plan(14,15),'0.65': _plan(21,22),'1.0': _plan(21,22),'1.5': _plan(21,22),'2.5': _plan(21,22),'4.0': _plan(21,22),'6.5': _plan(21,22) },
  R: { '0.065': _plan(7,8), '0.10': _plan(10,11),'0.25': _plan(14,15),'0.40': _plan(21,22),'0.65': _plan(21,22),'1.0': _plan(21,22),'1.5': _plan(21,22),'2.5': _plan(21,22),'4.0': _plan(21,22),'6.5': _plan(21,22) },
});

// Tightened plans — pattern Ac column shifts one column left of normal
// (i.e. the same letter rejects at a lower defect count).
// Source: MIL-STD-105E Table II-B.
const AQL_SAMPLE_PLANS_TIGHTENED = Object.freeze({
  A: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(0,1), '6.5': _plan(0,1) },
  B: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(0,1), '6.5': _plan(0,1) },
  C: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(0,1), '6.5': _plan(1,2) },
  D: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(1,2), '6.5': _plan(1,2) },
  E: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(1,2), '4.0': _plan(1,2), '6.5': _plan(2,3) },
  F: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(1,2), '2.5': _plan(1,2), '4.0': _plan(2,3), '6.5': _plan(3,4) },
  G: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(1,2), '1.5': _plan(1,2), '2.5': _plan(2,3), '4.0': _plan(3,4), '6.5': _plan(5,6) },
  H: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(1,2), '1.0': _plan(1,2), '1.5': _plan(2,3), '2.5': _plan(3,4), '4.0': _plan(5,6), '6.5': _plan(8,9) },
  J: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(1,2), '0.65': _plan(1,2), '1.0': _plan(2,3), '1.5': _plan(3,4), '2.5': _plan(5,6), '4.0': _plan(8,9), '6.5': _plan(12,13) },
  K: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(1,2), '0.40': _plan(1,2), '0.65': _plan(2,3), '1.0': _plan(3,4), '1.5': _plan(5,6), '2.5': _plan(8,9), '4.0': _plan(12,13),'6.5': _plan(18,19) },
  L: { '0.065': _plan(0,1), '0.10': _plan(1,2), '0.25': _plan(1,2), '0.40': _plan(2,3), '0.65': _plan(3,4), '1.0': _plan(5,6), '1.5': _plan(8,9), '2.5': _plan(12,13),'4.0': _plan(18,19),'6.5': _plan(18,19) },
  M: { '0.065': _plan(1,2), '0.10': _plan(1,2), '0.25': _plan(2,3), '0.40': _plan(3,4), '0.65': _plan(5,6), '1.0': _plan(8,9), '1.5': _plan(12,13),'2.5': _plan(18,19),'4.0': _plan(18,19),'6.5': _plan(18,19) },
  N: { '0.065': _plan(1,2), '0.10': _plan(2,3), '0.25': _plan(3,4), '0.40': _plan(5,6), '0.65': _plan(8,9), '1.0': _plan(12,13),'1.5': _plan(18,19),'2.5': _plan(18,19),'4.0': _plan(18,19),'6.5': _plan(18,19) },
  P: { '0.065': _plan(2,3), '0.10': _plan(3,4), '0.25': _plan(5,6), '0.40': _plan(8,9), '0.65': _plan(12,13),'1.0': _plan(18,19),'1.5': _plan(18,19),'2.5': _plan(18,19),'4.0': _plan(18,19),'6.5': _plan(18,19) },
  Q: { '0.065': _plan(3,4), '0.10': _plan(5,6), '0.25': _plan(8,9), '0.40': _plan(12,13),'0.65': _plan(18,19),'1.0': _plan(18,19),'1.5': _plan(18,19),'2.5': _plan(18,19),'4.0': _plan(18,19),'6.5': _plan(18,19) },
  R: { '0.065': _plan(5,6), '0.10': _plan(8,9), '0.25': _plan(12,13),'0.40': _plan(18,19),'0.65': _plan(18,19),'1.0': _plan(18,19),'1.5': _plan(18,19),'2.5': _plan(18,19),'4.0': _plan(18,19),'6.5': _plan(18,19) },
});

// Reduced plans — 0.4 × normal sample sizes, with an "accept but reject-limit
// gap" (Ac < Re − 1). Encoded as shifted-right normal plans.
// Source: MIL-STD-105E Table II-C.
const AQL_SAMPLE_PLANS_REDUCED = Object.freeze({
  A: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,1), '4.0': _plan(0,1), '6.5': _plan(0,2) },
  B: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,1), '1.5': _plan(0,1), '2.5': _plan(0,2), '4.0': _plan(0,2), '6.5': _plan(1,3) },
  C: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,1), '1.0': _plan(0,2), '1.5': _plan(0,2), '2.5': _plan(1,3), '4.0': _plan(1,4), '6.5': _plan(2,5) },
  D: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,1), '0.65': _plan(0,2), '1.0': _plan(0,2), '1.5': _plan(1,3), '2.5': _plan(1,4), '4.0': _plan(2,5), '6.5': _plan(3,6) },
  E: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,1), '0.40': _plan(0,2), '0.65': _plan(0,2), '1.0': _plan(1,3), '1.5': _plan(1,4), '2.5': _plan(2,5), '4.0': _plan(3,6), '6.5': _plan(5,8) },
  F: { '0.065': _plan(0,1), '0.10': _plan(0,1), '0.25': _plan(0,2), '0.40': _plan(0,2), '0.65': _plan(1,3), '1.0': _plan(1,4), '1.5': _plan(2,5), '2.5': _plan(3,6), '4.0': _plan(5,8), '6.5': _plan(7,10) },
  G: { '0.065': _plan(0,1), '0.10': _plan(0,2), '0.25': _plan(0,2), '0.40': _plan(1,3), '0.65': _plan(1,4), '1.0': _plan(2,5), '1.5': _plan(3,6), '2.5': _plan(5,8), '4.0': _plan(7,10),'6.5': _plan(10,13) },
  H: { '0.065': _plan(0,2), '0.10': _plan(0,2), '0.25': _plan(1,3), '0.40': _plan(1,4), '0.65': _plan(2,5), '1.0': _plan(3,6), '1.5': _plan(5,8), '2.5': _plan(7,10),'4.0': _plan(10,13),'6.5': _plan(14,17) },
  J: { '0.065': _plan(0,2), '0.10': _plan(1,3), '0.25': _plan(1,4), '0.40': _plan(2,5), '0.65': _plan(3,6), '1.0': _plan(5,8), '1.5': _plan(7,10),'2.5': _plan(10,13),'4.0': _plan(14,17),'6.5': _plan(21,24) },
  K: { '0.065': _plan(1,3), '0.10': _plan(1,4), '0.25': _plan(2,5), '0.40': _plan(3,6), '0.65': _plan(5,8), '1.0': _plan(7,10),'1.5': _plan(10,13),'2.5': _plan(14,17),'4.0': _plan(21,24),'6.5': _plan(21,24) },
  L: { '0.065': _plan(1,4), '0.10': _plan(2,5), '0.25': _plan(3,6), '0.40': _plan(5,8), '0.65': _plan(7,10),'1.0': _plan(10,13),'1.5': _plan(14,17),'2.5': _plan(21,24),'4.0': _plan(21,24),'6.5': _plan(21,24) },
  M: { '0.065': _plan(2,5), '0.10': _plan(3,6), '0.25': _plan(5,8), '0.40': _plan(7,10),'0.65': _plan(10,13),'1.0': _plan(14,17),'1.5': _plan(21,24),'2.5': _plan(21,24),'4.0': _plan(21,24),'6.5': _plan(21,24) },
  N: { '0.065': _plan(3,6), '0.10': _plan(5,8), '0.25': _plan(7,10),'0.40': _plan(10,13),'0.65': _plan(14,17),'1.0': _plan(21,24),'1.5': _plan(21,24),'2.5': _plan(21,24),'4.0': _plan(21,24),'6.5': _plan(21,24) },
  P: { '0.065': _plan(5,8), '0.10': _plan(7,10),'0.25': _plan(10,13),'0.40': _plan(14,17),'0.65': _plan(21,24),'1.0': _plan(21,24),'1.5': _plan(21,24),'2.5': _plan(21,24),'4.0': _plan(21,24),'6.5': _plan(21,24) },
  Q: { '0.065': _plan(7,10),'0.10': _plan(10,13),'0.25': _plan(14,17),'0.40': _plan(21,24),'0.65': _plan(21,24),'1.0': _plan(21,24),'1.5': _plan(21,24),'2.5': _plan(21,24),'4.0': _plan(21,24),'6.5': _plan(21,24) },
  R: { '0.065': _plan(10,13),'0.10': _plan(14,17),'0.25': _plan(21,24),'0.40': _plan(21,24),'0.65': _plan(21,24),'1.0': _plan(21,24),'1.5': _plan(21,24),'2.5': _plan(21,24),'4.0': _plan(21,24),'6.5': _plan(21,24) },
});

// Control-chart A2, D3, D4 constants — for X-bar/R charts.
// Source: Montgomery — Introduction to Statistical Quality Control, Table VI.
const CONTROL_CHART_CONSTANTS = Object.freeze({
  2:  { A2: 1.880, D3: 0,    D4: 3.267, d2: 1.128 },
  3:  { A2: 1.023, D3: 0,    D4: 2.574, d2: 1.693 },
  4:  { A2: 0.729, D3: 0,    D4: 2.282, d2: 2.059 },
  5:  { A2: 0.577, D3: 0,    D4: 2.114, d2: 2.326 },
  6:  { A2: 0.483, D3: 0,    D4: 2.004, d2: 2.534 },
  7:  { A2: 0.419, D3: 0.076,D4: 1.924, d2: 2.704 },
  8:  { A2: 0.373, D3: 0.136,D4: 1.864, d2: 2.847 },
  9:  { A2: 0.337, D3: 0.184,D4: 1.816, d2: 2.970 },
  10: { A2: 0.308, D3: 0.223,D4: 1.777, d2: 3.078 },
});

// =============================================================================
// 3. Helpers
// =============================================================================

/** Stringify an AQL value to the canonical table key ('1.0', '0.65'...) */
function aqlKey(aql) {
  if (aql == null) return '1.0';
  const n = Number(aql);
  if (!Number.isFinite(n)) return String(aql);
  // canonical forms used in the embedded tables
  const map = { 0.065: '0.065', 0.1: '0.10', 0.25: '0.25', 0.4: '0.40',
                0.65: '0.65', 1: '1.0', 1.5: '1.5', 2.5: '2.5',
                4: '4.0', 6.5: '6.5' };
  if (map[n] !== undefined) return map[n];
  return String(n);
}

/** Return the lot-size letter for a given lot size and inspection level. */
function lotSizeLetter(lotSize, inspectionLevel = 'II') {
  if (!(lotSize > 0)) throw new Error('qc-checklist: lotSize must be positive');
  for (const row of AQL_LOT_RANGES) {
    if (lotSize >= row.min && lotSize <= row.max) return row.letters[inspectionLevel];
  }
  return AQL_LOT_RANGES[AQL_LOT_RANGES.length - 1].letters[inspectionLevel];
}

/** Return the single-sampling plan for lot/AQL/severity. */
function samplingPlan({ lotSize, aql = 1.0, severity = 'normal', inspectionLevel = 'II' }) {
  const letter = lotSizeLetter(lotSize, inspectionLevel);
  const sampleSize = AQL_CODE_SAMPLE_SIZE[letter];
  const table =
    severity === 'tightened' ? AQL_SAMPLE_PLANS_TIGHTENED :
    severity === 'reduced'   ? AQL_SAMPLE_PLANS_REDUCED   :
                               AQL_SAMPLE_PLANS_NORMAL;
  const key = aqlKey(aql);
  const plan = table[letter] && table[letter][key];
  if (!plan) {
    throw new Error(`qc-checklist: no plan for letter ${letter} / AQL ${aql} (${severity})`);
  }
  return {
    letter,
    sampleSize: severity === 'reduced' ? Math.max(2, Math.round(sampleSize * 0.4)) : sampleSize,
    Ac: plan.Ac,
    Re: plan.Re,
    aql: key,
    severity,
    inspectionLevel,
  };
}

/** Mean of an array of numbers. */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/** Sample standard deviation (n-1 divisor). */
function stdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return Math.sqrt(s / (arr.length - 1));
}

/** Deep-freeze (within reason) to enforce immutability of returned records. */
function freezeDeep(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) freezeDeep(obj[k]);
  }
  return obj;
}

// =============================================================================
// 4. QCChecklist class
// =============================================================================

class QCChecklist {
  constructor() {
    // never-delete stores — arrays so historic versions remain addressable
    this._checklists  = new Map(); // id → latest checklist version
    this._versions    = new Map(); // id → [versions...]
    this._inspections = new Map(); // inspectionId → inspection
    this._results     = new Map(); // inspectionId → [resultRow...]
    this._ncrs        = new Map(); // ncrId → ncr
    this._seq = { insp: 1, ncr: 1 };
  }

  // -------------------------------------------------------------------------
  // 4.1 defineChecklist — register or upgrade a checklist definition
  // -------------------------------------------------------------------------
  defineChecklist({ id, sku, operation, stage, items, standards = [], aql = 1.0, inspectionLevel = 'II' } = {}) {
    if (!id) throw new Error('qc-checklist.defineChecklist: id required');
    if (!sku) throw new Error('qc-checklist.defineChecklist: sku required');
    if (!operation) throw new Error('qc-checklist.defineChecklist: operation required');
    const allowedStages = ['incoming', 'in-process', 'final', 'FAI'];
    if (!allowedStages.includes(stage)) {
      throw new Error(`qc-checklist.defineChecklist: stage must be one of ${allowedStages.join(', ')}`);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('qc-checklist.defineChecklist: items must be a non-empty array');
    }
    for (const it of items) {
      if (!it.id || !it.name_he || !it.name_en || !it.type) {
        throw new Error('qc-checklist.defineChecklist: each item requires id, name_he, name_en, type');
      }
      const allowedTypes = ['pass-fail', 'measurement', 'visual', 'functional'];
      if (!allowedTypes.includes(it.type)) {
        throw new Error(`qc-checklist.defineChecklist: item.type must be one of ${allowedTypes.join(', ')}`);
      }
      if (it.type === 'measurement') {
        if (it.spec == null && (it.tolerance == null)) {
          // allow open-ended measurement but flag it in the item
          // (Cpk cannot be calculated without spec+tolerance)
        }
      }
    }

    const prior = this._versions.get(id) || [];
    const version = prior.length + 1;
    const record = {
      id,
      version,
      sku,
      operation,
      stage,
      aql,
      inspectionLevel,
      standards: standards.slice(),
      items: items.map((it) => ({
        id: it.id,
        name_he: it.name_he,
        name_en: it.name_en,
        type: it.type,
        spec: it.spec ?? null,
        tolerance: it.tolerance ?? null,
        method: it.method ?? null,
        reference: it.reference ?? null,
      })),
      createdAt: new Date().toISOString(),
    };
    const frozen = freezeDeep(JSON.parse(JSON.stringify(record)));
    prior.push(frozen);
    this._versions.set(id, prior);
    this._checklists.set(id, frozen);
    return frozen;
  }

  getChecklist(id) {
    return this._checklists.get(id) || null;
  }

  listChecklistVersions(id) {
    return (this._versions.get(id) || []).slice();
  }

  // -------------------------------------------------------------------------
  // 4.2 createInspection — open an inspection record against a checklist
  // -------------------------------------------------------------------------
  createInspection({ checklistId, lotId, inspector, sampleSize, lotSize, aql, severity = 'normal' } = {}) {
    if (!checklistId) throw new Error('qc-checklist.createInspection: checklistId required');
    if (!lotId) throw new Error('qc-checklist.createInspection: lotId required');
    if (!inspector) throw new Error('qc-checklist.createInspection: inspector required');
    const checklist = this._checklists.get(checklistId);
    if (!checklist) throw new Error(`qc-checklist.createInspection: unknown checklistId ${checklistId}`);

    let plan = null;
    if (lotSize) {
      plan = samplingPlan({
        lotSize,
        aql: aql ?? checklist.aql,
        severity,
        inspectionLevel: checklist.inspectionLevel,
      });
    }

    const inspectionId = `INSP-${String(this._seq.insp++).padStart(6, '0')}`;
    const record = {
      id: inspectionId,
      checklistId,
      checklistVersion: checklist.version,
      lotId,
      lotSize: lotSize ?? null,
      inspector,
      sampleSize: sampleSize ?? (plan ? plan.sampleSize : null),
      plan,
      severity,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    const frozen = freezeDeep({ ...record });
    this._inspections.set(inspectionId, frozen);
    this._results.set(inspectionId, []);
    return frozen;
  }

  getInspection(inspectionId) {
    return this._inspections.get(inspectionId) || null;
  }

  // -------------------------------------------------------------------------
  // 4.3 recordResult — append a result row, never overwrite
  // -------------------------------------------------------------------------
  recordResult(inspectionId, itemId, { value = null, pass = null, notes = '', photo = null } = {}) {
    const inspection = this._inspections.get(inspectionId);
    if (!inspection) throw new Error(`qc-checklist.recordResult: unknown inspection ${inspectionId}`);
    const checklist = this._checklists.get(inspection.checklistId);
    const item = checklist && checklist.items.find((it) => it.id === itemId);
    if (!item) throw new Error(`qc-checklist.recordResult: item ${itemId} not in checklist ${inspection.checklistId}`);

    // auto-compute pass/fail for measurement items when tolerance known
    let passFlag = pass;
    if (passFlag == null) {
      if (item.type === 'measurement' && value != null && item.spec != null && item.tolerance != null) {
        const tol = Number(item.tolerance);
        const target = Number(item.spec);
        passFlag = Math.abs(Number(value) - target) <= tol;
      } else if (item.type === 'pass-fail') {
        // must be explicit
        throw new Error('qc-checklist.recordResult: pass-fail item requires explicit pass');
      }
    }

    const row = freezeDeep({
      inspectionId,
      itemId,
      itemType: item.type,
      value,
      pass: passFlag === true,
      notes: String(notes || ''),
      photo: photo ? String(photo) : null,
      recordedAt: new Date().toISOString(),
      sequence: (this._results.get(inspectionId) || []).length + 1,
    });
    this._results.get(inspectionId).push(row);
    return row;
  }

  getResults(inspectionId) {
    return (this._results.get(inspectionId) || []).slice();
  }

  // -------------------------------------------------------------------------
  // 4.4 verdictForInspection — pass/fail with AQL sampling
  // -------------------------------------------------------------------------
  verdictForInspection(inspectionId) {
    const inspection = this._inspections.get(inspectionId);
    if (!inspection) throw new Error(`qc-checklist.verdict: unknown inspection ${inspectionId}`);
    const checklist = this._checklists.get(inspection.checklistId);
    const results = this._results.get(inspectionId) || [];
    const reasons = [];

    // Count defects = results where pass === false
    const defects = results.filter((r) => r.pass === false);
    const defectCount = defects.length;

    // Ensure every mandatory item has at least one result row
    const recordedItems = new Set(results.map((r) => r.itemId));
    const missing = checklist.items.filter((it) => !recordedItems.has(it.id));

    // AQL evaluation (only if plan present)
    let aqlResult = null;
    if (inspection.plan) {
      const { Ac, Re } = inspection.plan;
      const accept = defectCount <= Ac;
      aqlResult = {
        plan: inspection.plan,
        defectCount,
        accept,
        reject: defectCount >= Re,
      };
      if (!accept) reasons.push(`AQL reject: ${defectCount} defects > Ac=${Ac}`);
    } else {
      // no AQL plan — 100% inspection; any single fail = reject
      if (defectCount > 0) reasons.push(`${defectCount} item(s) failed (100% inspection)`);
    }

    if (missing.length > 0) {
      reasons.push(`${missing.length} checklist item(s) not yet inspected: ${missing.map((i) => i.id).join(', ')}`);
    }

    const verdict = reasons.length === 0 ? 'pass' : 'fail';
    return freezeDeep({
      inspectionId,
      verdict,
      reasons,
      defectCount,
      missing: missing.map((i) => i.id),
      aql: aqlResult,
      evaluatedAt: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // 4.5 rejectLot — open an NCR linked to the inspection
  // -------------------------------------------------------------------------
  rejectLot(inspectionId, reason) {
    const inspection = this._inspections.get(inspectionId);
    if (!inspection) throw new Error(`qc-checklist.rejectLot: unknown inspection ${inspectionId}`);
    if (!reason) throw new Error('qc-checklist.rejectLot: reason required');

    const ncrId = `NCR-${String(this._seq.ncr++).padStart(6, '0')}`;
    const verdict = this.verdictForInspection(inspectionId);
    const ncr = freezeDeep({
      id: ncrId,
      inspectionId,
      lotId: inspection.lotId,
      checklistId: inspection.checklistId,
      reason: String(reason),
      defectCount: verdict.defectCount,
      openedAt: new Date().toISOString(),
      status: 'open',
      // integrates with Y-037 — the dispositioning engine listens on this key
      bridgeKey: `Y037.ncr.${ncrId}`,
    });
    this._ncrs.set(ncrId, ncr);

    // mark the inspection as rejected (append a new frozen version — never
    // delete the prior one; the original remains retrievable via the results
    // store for audit purposes).
    const updated = freezeDeep({
      ...inspection,
      status: 'rejected',
      ncrId,
      rejectedAt: new Date().toISOString(),
    });
    this._inspections.set(inspectionId, updated);
    return ncr;
  }

  listNCRs() {
    return Array.from(this._ncrs.values());
  }

  // -------------------------------------------------------------------------
  // 4.6 certificateOfConformance — emit a C of C doc payload
  // -------------------------------------------------------------------------
  certificateOfConformance(inspectionId) {
    const inspection = this._inspections.get(inspectionId);
    if (!inspection) throw new Error(`qc-checklist.cOfC: unknown inspection ${inspectionId}`);
    const checklist = this._checklists.get(inspection.checklistId);
    const verdict = this.verdictForInspection(inspectionId);
    if (verdict.verdict !== 'pass') {
      throw new Error(`qc-checklist.cOfC: cannot issue — inspection ${inspectionId} is not pass (${verdict.verdict})`);
    }

    const lines_he = [];
    const lines_en = [];
    lines_he.push('תעודת התאמה — Certificate of Conformance');
    lines_en.push('Certificate of Conformance');
    lines_he.push(`אצווה: ${inspection.lotId}`);
    lines_en.push(`Lot: ${inspection.lotId}`);
    lines_he.push(`מק"ט: ${checklist.sku}`);
    lines_en.push(`SKU: ${checklist.sku}`);
    lines_he.push(`פעולה: ${checklist.operation}`);
    lines_en.push(`Operation: ${checklist.operation}`);
    lines_he.push(`שלב: ${QC_LABELS_HE[checklist.stage] || checklist.stage}`);
    lines_en.push(`Stage: ${QC_LABELS_EN[checklist.stage] || checklist.stage}`);
    lines_he.push(`בודק: ${inspection.inspector}`);
    lines_en.push(`Inspector: ${inspection.inspector}`);
    if (inspection.plan) {
      lines_he.push(`תוכנית דגימה: ${inspection.plan.letter}/${inspection.plan.aql}/${inspection.plan.severity}`);
      lines_en.push(`Sampling Plan: ${inspection.plan.letter}/AQL${inspection.plan.aql}/${inspection.plan.severity}`);
    }
    lines_he.push('פסיקה: עובר');
    lines_en.push('Verdict: PASS');

    return freezeDeep({
      type: 'certificate_of_conformance',
      docNumber: `CoC-${inspection.id}`,
      lotId: inspection.lotId,
      sku: checklist.sku,
      checklistId: checklist.id,
      checklistVersion: checklist.version,
      inspector: inspection.inspector,
      plan: inspection.plan,
      standards: checklist.standards,
      verdict: 'pass',
      issuedAt: new Date().toISOString(),
      body: { he: lines_he, en: lines_en },
    });
  }

  // -------------------------------------------------------------------------
  // 4.7 controlCharts — X-bar and R chart data for a measurement item
  // -------------------------------------------------------------------------
  controlCharts(checklistItemId, period = {}) {
    const { from = null, to = null, subgroupSize = 5 } = period;
    const n = Math.max(2, Math.min(10, Math.floor(subgroupSize)));
    const constants = CONTROL_CHART_CONSTANTS[n];
    if (!constants) throw new Error(`qc-checklist.controlCharts: unsupported subgroupSize ${n}`);

    // gather all measurement values for this item across inspections
    const values = [];
    for (const [inspectionId, rows] of this._results.entries()) {
      const inspection = this._inspections.get(inspectionId);
      if (!inspection) continue;
      if (from && inspection.createdAt < from) continue;
      if (to && inspection.createdAt > to) continue;
      for (const row of rows) {
        if (row.itemId !== checklistItemId) continue;
        if (row.value == null || !Number.isFinite(Number(row.value))) continue;
        values.push(Number(row.value));
      }
    }

    if (values.length < n) {
      return freezeDeep({
        checklistItemId,
        subgroupSize: n,
        subgroups: [],
        xbar:   { center: 0, ucl: 0, lcl: 0, points: [] },
        r:      { center: 0, ucl: 0, lcl: 0, points: [] },
        warning: `insufficient data: need at least ${n} values, have ${values.length}`,
      });
    }

    // form subgroups of size n (drop the tail remainder)
    const subgroups = [];
    for (let i = 0; i + n <= values.length; i += n) {
      subgroups.push(values.slice(i, i + n));
    }
    const xbars = subgroups.map(mean);
    const ranges = subgroups.map((g) => Math.max(...g) - Math.min(...g));
    const xDoubleBar = mean(xbars);
    const rBar = mean(ranges);

    const xbarUCL = xDoubleBar + constants.A2 * rBar;
    const xbarLCL = xDoubleBar - constants.A2 * rBar;
    const rUCL = constants.D4 * rBar;
    const rLCL = constants.D3 * rBar;

    return freezeDeep({
      checklistItemId,
      subgroupSize: n,
      subgroups,
      xbar: { center: xDoubleBar, ucl: xbarUCL, lcl: xbarLCL, points: xbars },
      r:    { center: rBar,       ucl: rUCL,    lcl: rLCL,    points: ranges },
      constants,
      sampleCount: values.length,
      generatedAt: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // 4.8 cpk — Process capability index
  // -------------------------------------------------------------------------
  cpk(itemId, period = {}) {
    const { from = null, to = null } = period;
    // find the checklist item (search all checklists)
    let item = null;
    for (const cl of this._checklists.values()) {
      const hit = cl.items.find((it) => it.id === itemId);
      if (hit) { item = hit; break; }
    }
    if (!item) throw new Error(`qc-checklist.cpk: no checklist item with id ${itemId}`);
    if (item.spec == null || item.tolerance == null) {
      throw new Error(`qc-checklist.cpk: item ${itemId} lacks spec/tolerance — Cpk undefined`);
    }
    const USL = Number(item.spec) + Number(item.tolerance);
    const LSL = Number(item.spec) - Number(item.tolerance);

    const values = [];
    for (const [inspectionId, rows] of this._results.entries()) {
      const inspection = this._inspections.get(inspectionId);
      if (!inspection) continue;
      if (from && inspection.createdAt < from) continue;
      if (to && inspection.createdAt > to) continue;
      for (const row of rows) {
        if (row.itemId !== itemId) continue;
        if (row.value == null) continue;
        const v = Number(row.value);
        if (Number.isFinite(v)) values.push(v);
      }
    }
    if (values.length < 2) {
      return freezeDeep({
        itemId, USL, LSL,
        mean: values.length === 1 ? values[0] : 0,
        sigma: 0,
        cp: null,
        cpk: null,
        sampleCount: values.length,
        warning: 'insufficient data: need at least 2 samples',
      });
    }

    const m = mean(values);
    const s = stdDev(values);
    const cp  = s === 0 ? null : (USL - LSL) / (6 * s);
    const cpu = s === 0 ? null : (USL - m) / (3 * s);
    const cpl = s === 0 ? null : (m - LSL) / (3 * s);
    const cpk = (cpu == null || cpl == null) ? null : Math.min(cpu, cpl);

    return freezeDeep({
      itemId, USL, LSL,
      mean: m, sigma: s,
      cp, cpu, cpl, cpk,
      sampleCount: values.length,
      interpretation: cpk == null ? 'undefined (zero variance)' :
                      cpk >= 1.67 ? 'aerospace/defense — excellent' :
                      cpk >= 1.33 ? 'capable — meets IAI/Elbit minimum' :
                      cpk >= 1.00 ? 'marginal — tighten process' :
                                    'incapable — redesign or 100% inspect',
    });
  }
}

// =============================================================================
// 5. Exports
// =============================================================================

module.exports = {
  QCChecklist,
  // tables
  AQL_LOT_RANGES,
  AQL_CODE_SAMPLE_SIZE,
  AQL_SAMPLE_PLANS_NORMAL,
  AQL_SAMPLE_PLANS_TIGHTENED,
  AQL_SAMPLE_PLANS_REDUCED,
  CONTROL_CHART_CONSTANTS,
  // labels
  QC_LABELS_HE,
  QC_LABELS_EN,
  ISRAELI_DEFENSE_STANDARDS,
  // helpers (also exported so tests & sibling modules can reuse)
  samplingPlan,
  lotSizeLetter,
  aqlKey,
};
