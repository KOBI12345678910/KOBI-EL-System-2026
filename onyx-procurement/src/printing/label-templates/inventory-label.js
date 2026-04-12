/**
 * Inventory Label Template (תווית מלאי)
 * ──────────────────────────────────────
 * Small warehouse sticker — item code, description, location, qty.
 * Size: 400 x 250 dots (~50mm x 31mm @ 203 dpi)
 *
 *   ┌──────────────────────────┐
 *   │ INVENTORY / מלאי         │
 *   ├──────────────────────────┤
 *   │ Item: TK-BLT-M8          │
 *   │ בורג M8 x 50mm           │
 *   │ Location: A-12-03        │
 *   │ Qty: 250                 │
 *   │ ||||||| |||||| ||||||    │
 *   └──────────────────────────┘
 */

'use strict';

const { label } = require('../zpl-printer');

/**
 * @param {object} data
 * @param {string} [data.itemCode]
 * @param {string} [data.description]
 * @param {string} [data.location]
 * @param {number} [data.qty=0]
 * @param {string} [data.uom='pcs'] - unit of measure
 * @param {string} [data.warehouse]
 * @param {string|Date} [data.stockDate]
 * @param {number} [data.quantity=1]
 * @returns {string}
 */
function buildInventoryLabel(data = {}) {
  const {
    itemCode = '',
    description = '',
    location = '',
    qty = 0,
    uom = 'pcs',
    warehouse = '',
    stockDate,
    quantity = 1,
  } = data;

  const dateStr = stockDate instanceof Date
    ? stockDate.toISOString().slice(0, 10)
    : (stockDate || new Date().toISOString().slice(0, 10));

  const lbl = label(400, 280).unicode().quantityOf(quantity);

  lbl.box(5, 5, 390, 270, 2);

  // Title bar
  lbl.text(15, 12, 'INVENTORY / מלאי', { size: 22, bold: true });
  lbl.line(15, 42, 370, 1);

  // Item code (large)
  lbl.text(15, 52, itemCode, { size: 30, bold: true });

  // Description — up to 2 lines via ^FB
  if (description) {
    lbl.text(15, 92, description, {
      size: 20,
      blockWidth: 370,
      maxLines: 2,
    });
  }

  // Location + warehouse
  const locLine = warehouse
    ? `WH: ${warehouse}  Loc: ${location}`
    : `Location: ${location}`;
  lbl.text(15, 150, locLine, { size: 20 });

  // Qty — prominent
  lbl.text(15, 180, `Qty: ${qty} ${uom}`, { size: 28, bold: true });

  // Date (small, right)
  lbl.text(240, 180, dateStr, { size: 16 });

  // Barcode of item code for scanning back in
  if (itemCode) {
    lbl.barcode(15, 225, itemCode, { type: 'code128', height: 40 });
  }

  return lbl.build();
}

module.exports = buildInventoryLabel;
