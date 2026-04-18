/**
 * Asset Tag Template (תג רכוש)
 * ────────────────────────────
 * Small asset identification sticker — asset ID, department, date.
 * Size: 400 x 200 dots (~50mm x 25mm @ 203 dpi)
 *
 *   ┌─────────────────────────────┐
 *   │ Techno Kol                  │
 *   │ PROPERTY OF / רכוש          │
 *   ├─────────────────────────────┤
 *   │ TK-LAP-0042          ██ QR  │
 *   │ Dept: Engineering    ██     │
 *   │ Date: 2026-04-11     ██     │
 *   │ Owner: Kobi E.              │
 *   └─────────────────────────────┘
 */

'use strict';

const { label } = require('../zpl-printer');

/**
 * @param {object} data
 * @param {string} [data.assetId]
 * @param {string} [data.department]
 * @param {string|Date} [data.date]
 * @param {string} [data.owner]
 * @param {string} [data.companyName='Techno Kol']
 * @param {string} [data.category]    - e.g. 'Laptop', 'Printer', 'Vehicle'
 * @param {string} [data.serialNumber]
 * @param {number} [data.quantity=1]
 * @returns {string}
 */
function buildAssetTag(data = {}) {
  const {
    assetId = '',
    department = '',
    date = new Date(),
    owner = '',
    companyName = 'Techno Kol',
    category = '',
    serialNumber = '',
    quantity = 1,
  } = data;

  const dateStr = date instanceof Date
    ? date.toISOString().slice(0, 10)
    : String(date);

  const lbl = label(400, 210).unicode().quantityOf(quantity);
  lbl.box(3, 3, 394, 204, 3);

  // Header
  lbl.text(10, 8, companyName, { size: 20, bold: true });
  lbl.text(10, 32, 'PROPERTY OF / רכוש של', { size: 14 });
  lbl.line(10, 52, 380, 1);

  // Asset ID (prominent)
  lbl.text(10, 60, assetId, { size: 32, bold: true });

  // Category + serial (optional line)
  if (category || serialNumber) {
    const metaLine = [category, serialNumber].filter(Boolean).join(' - ');
    lbl.text(10, 100, metaLine, { size: 14 });
  }

  // Dept / Date / Owner
  lbl.text(10, 120, `Dept / מחלקה: ${department}`, { size: 15 });
  lbl.text(10, 140, `Date / תאריך: ${dateStr}`, { size: 15 });
  if (owner) lbl.text(10, 160, `Owner / בעלים: ${owner}`, { size: 15 });

  // Warning footer
  lbl.text(10, 185, 'Do not remove / אין להסיר', { size: 11 });

  // QR to scan back into inventory system
  const qrPayload = JSON.stringify({
    id: assetId,
    d: department,
    dt: dateStr,
    c: category,
  });
  lbl.barcode(295, 55, qrPayload, { type: 'qr', magnification: 4 });

  return lbl.build();
}

module.exports = buildAssetTag;
