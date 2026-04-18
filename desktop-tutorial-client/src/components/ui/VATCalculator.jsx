const VAT_RATE = 0.18; // Israeli VAT — 18% from 2026-01-01 (was 17%)

export default function VATCalculator({ amount, amountBeforeVat, onChange }) {
  function onTotalChange(val) {
    const total = parseFloat(val) || 0;
    const before = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
    const vat = Math.round((total - before) * 100) / 100;
    onChange({ amount: val, amount_before_vat: before.toString(), vat_amount: vat });
  }

  function onBeforeVatChange(val) {
    const before = parseFloat(val) || 0;
    const vat = Math.round(before * VAT_RATE * 100) / 100;
    const total = Math.round((before + vat) * 100) / 100;
    onChange({ amount: total.toString(), amount_before_vat: val, vat_amount: vat });
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <label className="block text-xs text-gray-500 mb-1">סכום כולל מע״מ *</label>
        <input type="number" step="0.01" required value={amount} onChange={e => onTotalChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">לפני מע״מ</label>
        <input type="number" step="0.01" value={amountBeforeVat} onChange={e => onBeforeVatChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50" placeholder="אוטומטי" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">מע״מ (18%)</label>
        <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-500">
          ₪{amount ? (Math.round((parseFloat(amount) - (parseFloat(amountBeforeVat) || parseFloat(amount) / 1.18)) * 100) / 100).toLocaleString() : '0'}
        </div>
      </div>
    </div>
  );
}
