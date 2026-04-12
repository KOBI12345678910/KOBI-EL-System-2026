/**
 * Employee ID Badge Template (תג עובד)
 * ─────────────────────────────────────
 * CR80-style employee badge with photo placeholder, name, ID,
 * department, and optional QR/barcode for access control.
 *
 * Size: 400 x 600 dots (roughly credit-card aspect ratio, portrait)
 *
 *   ┌──────────────────────┐
 *   │   COMPANY NAME       │  ← filled header
 *   │   ID BADGE           │
 *   ├──────────────────────┤
 *   │                      │
 *   │    ┌─────────┐       │
 *   │    │  PHOTO  │       │  ← 150x150 placeholder
 *   │    │         │       │
 *   │    └─────────┘       │
 *   │                      │
 *   │  John Doe            │  ← name (big)
 *   │  Senior Engineer     │  ← title
 *   │                      │
 *   │  Dept: R&D           │
 *   │  ID: EMP-0042        │
 *   │  Issued: 2026-01-01  │
 *   │                      │
 *   │  |||||||| | ||||| QR │
 *   └──────────────────────┘
 */

'use strict';

const { label } = require('../zpl-printer');

/**
 * @param {object} data
 * @param {string} [data.name]
 * @param {string} [data.employeeId]
 * @param {string} [data.department]
 * @param {string} [data.jobTitle]
 * @param {string|Date} [data.issueDate]
 * @param {string|Date} [data.expires]
 * @param {string} [data.companyName='Techno Kol']
 * @param {string} [data.nameHebrew]
 * @param {object} [data.photo] - {raster, width, height} for real image
 * @param {number} [data.quantity=1]
 * @returns {string}
 */
function buildEmployeeId(data = {}) {
  const {
    name = '',
    nameHebrew = '',
    employeeId: eid = '',
    department = '',
    jobTitle = '',
    issueDate = '',
    expires = '',
    companyName = 'Techno Kol',
    photo = null,
    quantity = 1,
  } = data;

  const fmtDate = (d) => {
    if (!d) return '';
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d);
  };

  const lbl = label(400, 600).unicode().quantityOf(quantity);

  // Outer border
  lbl.box(5, 5, 390, 590, 3);

  // ─── HEADER (reversed) ───
  lbl.box(5, 5, 390, 70, 70); // solid black
  lbl.text(20, 18, companyName, {
    size: 26,
    bold: true,
    reverse: true,
  });
  lbl.text(240, 35, 'ID BADGE', { size: 20, reverse: true });

  // ─── PHOTO ───
  if (photo && typeof photo === 'object') {
    // Image at (125, 90) — 150x150
    lbl.image(125, 90, photo);
  } else {
    lbl.box(125, 90, 150, 150, 2);
    lbl.text(160, 150, 'PHOTO', { size: 18 });
    lbl.text(165, 180, '150x150', { size: 12 });
  }

  // ─── NAME BLOCK ───
  lbl.text(20, 260, name, { size: 30, bold: true });
  if (nameHebrew) {
    lbl.text(20, 298, nameHebrew, { size: 24, bold: true });
  }
  if (jobTitle) {
    lbl.text(20, 330, jobTitle, { size: 18 });
  }

  // Divider
  lbl.line(20, 360, 360, 1);

  // ─── DETAILS ───
  lbl.text(20, 370, `Dept / מחלקה: ${department}`, { size: 18 });
  lbl.text(20, 395, `ID / מזהה: ${eid}`, { size: 20, bold: true });

  if (issueDate) {
    lbl.text(20, 425, `Issued: ${fmtDate(issueDate)}`, { size: 14 });
  }
  if (expires) {
    lbl.text(200, 425, `Expires: ${fmtDate(expires)}`, { size: 14 });
  }

  // ─── BARCODES ───
  // Employee ID as Code 128 (for access gates)
  lbl.barcode(20, 460, eid, { type: 'code128', height: 55 });

  // QR with full employee info (for mobile scanners)
  const qrPayload = JSON.stringify({
    id: eid,
    n: name,
    d: department,
    t: jobTitle,
  });
  lbl.barcode(290, 460, qrPayload, { type: 'qr', magnification: 3 });

  // Footer text
  lbl.text(20, 560, 'If found, please return', { size: 10 });

  return lbl.build();
}

module.exports = buildEmployeeId;
