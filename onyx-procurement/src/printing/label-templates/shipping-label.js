/**
 * Shipping Label Template (תווית משלוח)
 * ─────────────────────────────────────
 * Standard 4x6" thermal shipping label (812 x 1218 dots @ 203 dpi).
 * Suitable for Israel Post, UPS, FedEx, DHL-style layouts.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │  SERVICE (reverse header)    │
 *   ├──────────────────────────────┤
 *   │  FROM                        │
 *   │  sender name / address       │
 *   ├──────────────────────────────┤
 *   │  TO  (large bold)            │
 *   │  recipient name              │
 *   │  recipient address           │
 *   │  recipient city / zip        │
 *   │  recipient phone             │
 *   ├──────────────────────────────┤
 *   │  Tracking #: ABC123          │
 *   │  Weight: 2.5 kg              │
 *   │  [Code128 barcode]           │
 *   │  [QR code]                   │
 *   └──────────────────────────────┘
 */

'use strict';

const { label } = require('../zpl-printer');

/**
 * @param {object} data
 * @param {object} [data.from] - {name, address, city, zip, phone}
 * @param {object} [data.to]   - {name, address, city, zip, phone}
 * @param {string} [data.trackingNumber]
 * @param {string} [data.service='Standard']
 * @param {number} [data.weight] - kg
 * @param {string} [data.reference] - PO / order number
 * @param {number} [data.quantity=1]
 * @returns {string}
 */
function buildShippingLabel(data = {}) {
  const {
    from = {},
    to = {},
    trackingNumber = '',
    service = 'Standard',
    weight,
    reference = '',
    quantity = 1,
  } = data;

  const lbl = label(812, 1218).unicode().quantityOf(quantity);

  // Outer border
  lbl.box(10, 10, 792, 1198, 4);

  // ─── HEADER BAR (reversed) ───
  lbl.box(10, 10, 792, 90, 90); // solid black rectangle
  lbl.text(30, 30, service.toUpperCase(), {
    size: 48,
    bold: true,
    reverse: true,
  });
  if (reference) {
    lbl.text(500, 45, `Ref: ${reference}`, { size: 24, reverse: true });
  }

  // ─── FROM BLOCK ───
  lbl.text(30, 120, 'FROM / מאת', { size: 22, bold: true });
  lbl.text(30, 155, from.name || '', { size: 26 });
  lbl.text(30, 190, from.address || '', { size: 20 });
  lbl.text(30, 220, `${from.city || ''} ${from.zip || ''}`.trim(), { size: 20 });
  if (from.phone) lbl.text(30, 250, `Tel: ${from.phone}`, { size: 18 });

  lbl.line(30, 300, 752, 3);

  // ─── TO BLOCK (largest) ───
  lbl.text(30, 320, 'SHIP TO / שלח אל', { size: 28, bold: true });

  // Recipient name — extra large for visibility
  lbl.text(30, 380, to.name || '', { size: 48, bold: true });

  // Address block — wrap long lines using ^FB
  lbl.text(30, 450, to.address || '', {
    size: 34,
    blockWidth: 752,
    maxLines: 2,
  });
  lbl.text(30, 540, `${to.city || ''} ${to.zip || ''}`.trim(), {
    size: 36,
    bold: true,
  });
  if (to.phone) lbl.text(30, 590, `Tel: ${to.phone}`, { size: 26 });

  lbl.line(30, 650, 752, 3);

  // ─── TRACKING BLOCK ───
  lbl.text(30, 670, 'TRACKING #', { size: 24, bold: true });
  lbl.text(30, 710, trackingNumber, { size: 34 });

  if (weight != null) {
    lbl.text(500, 670, `Weight: ${weight} kg`, { size: 24 });
  }

  // Tracking barcode (Code 128 — large)
  if (trackingNumber) {
    lbl.barcode(30, 770, trackingNumber, {
      type: 'code128',
      height: 200,
    });
  }

  // QR with full shipment JSON for scanner apps
  const qrPayload = JSON.stringify({
    t: trackingNumber,
    to: to.name,
    c: to.city,
    s: service,
  });
  lbl.barcode(550, 1000, qrPayload, {
    type: 'qr',
    magnification: 7,
  });

  return lbl.build();
}

module.exports = buildShippingLabel;
