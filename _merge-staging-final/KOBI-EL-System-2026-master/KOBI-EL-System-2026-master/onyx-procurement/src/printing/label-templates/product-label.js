/**
 * Product Label Template (תווית מוצר)
 * ────────────────────────────────────
 * Standalone example demonstrating how to compose a product label
 * with the zpl-printer low-level API rather than the templates object.
 *
 * Size: 400 x 300 dots (~50mm x 37mm @ 203 dpi)
 *
 * Usage:
 *   const buildProductLabel = require('./label-templates/product-label');
 *   const zplString = buildProductLabel({
 *     nameHebrew: 'מברג חשמלי 12V',
 *     nameEnglish: 'Electric Screwdriver 12V',
 *     price: 299.90,
 *     sku: 'TK-SCR-001',
 *     barcode: '7290001234567',
 *     barcodeType: 'ean13',
 *     currency: 'NIS',
 *   });
 */

'use strict';

const { label } = require('../zpl-printer');

/**
 * @param {object} data
 * @param {string} [data.nameHebrew]
 * @param {string} [data.nameEnglish]
 * @param {number} [data.price=0]
 * @param {string} [data.sku]
 * @param {string} [data.barcode]
 * @param {('code128'|'ean13'|'code39')} [data.barcodeType='code128']
 * @param {string} [data.currency='NIS']
 * @param {number} [data.quantity=1]
 * @returns {string} ZPL label source
 */
function buildProductLabel(data = {}) {
  const {
    nameHebrew = '',
    nameEnglish = '',
    price = 0,
    sku = '',
    barcode: bc = '',
    barcodeType = 'code128',
    currency = 'NIS',
    quantity = 1,
    showQR = true,
  } = data;

  const lbl = label(400, 300).unicode().quantityOf(quantity);

  // Outer border
  lbl.box(5, 5, 390, 290, 2);

  // Hebrew name (larger, top-right area for RTL feel)
  if (nameHebrew) {
    lbl.text(20, 20, nameHebrew, { size: 32, bold: true });
  }
  // English name
  if (nameEnglish) {
    lbl.text(20, 60, nameEnglish, { size: 22 });
  }

  // Horizontal divider
  lbl.line(20, 95, 360, 1);

  // SKU
  if (sku) {
    lbl.text(20, 105, `SKU / מק"ט: ${sku}`, { size: 18 });
  }

  // Price — big & bold
  lbl.text(20, 135, `${currency} ${Number(price).toFixed(2)}`, {
    size: 38,
    bold: true,
  });

  // Barcode
  if (bc) {
    lbl.barcode(20, 195, bc, { type: barcodeType, height: 70 });
  }

  // Optional QR (right side)
  if (showQR && (sku || bc)) {
    const payload = JSON.stringify({ sku, price, bc, name: nameEnglish });
    lbl.barcode(300, 195, payload, { type: 'qr', magnification: 3 });
  }

  return lbl.build();
}

module.exports = buildProductLabel;
