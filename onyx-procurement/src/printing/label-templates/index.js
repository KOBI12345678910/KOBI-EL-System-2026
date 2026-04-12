/**
 * Label Templates Index
 * ─────────────────────
 * Re-exports all standalone template builders so consumers can do:
 *   const { buildProductLabel, buildShippingLabel } =
 *     require('./printing/label-templates');
 *
 * Note: The main `zpl-printer.js` module also exposes a `templates`
 * object with equivalent (slightly simpler) variants. Use whichever
 * style fits best — the standalone files are more customizable.
 */

'use strict';

module.exports = {
  buildProductLabel:   require('./product-label'),
  buildShippingLabel:  require('./shipping-label'),
  buildInventoryLabel: require('./inventory-label'),
  buildAssetTag:       require('./asset-tag'),
  buildEmployeeId:     require('./employee-id'),
};
