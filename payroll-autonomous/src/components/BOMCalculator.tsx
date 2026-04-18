/**
 * BOM Calculator — מחשבון חומרי גלם
 * Full interactive Bill of Materials for metal/fabrication projects.
 */
import React, { useState, useMemo } from 'react';

// B-D031: date-aware Israeli VAT rate (0.18 from 2026-01-01, 0.17 prior)
const VAT_RATE = new Date() >= new Date('2026-01-01T00:00:00Z') ? 0.18 : 0.17;

// ── Types ──────────────────────────────────────────────────────────────────
interface BOMLine {
  material: string;
  qty: number;
  unit: string;
  pricePerUnit: number;
}

interface ProductConfig {
  label: string;
  profiles: string[];
  colors: string[];
  defaultProfile: string;
  calcBOM: (length: number, height: number, qty: number, waste: number) => BOMLine[];
}

// ── Price constants (₪) ──────────────────────────────────────────────────
const PRICES: Record<string, number> = {
  'פרופיל 40×40': 18,
  'פרופיל 50×50': 22,
  'פרופיל 60×60': 28,
  'פרופיל אלומיניום 40×40': 35,
  'פרופיל אלומיניום 60×30': 30,
  'פח מילוי 1.5mm': 85,
  'פח מילוי 2mm': 110,
  'זכוכית מחוסמת 8mm': 320,
  'ברגים M8': 2.5,
  'ברגים M6': 1.8,
  'ריבטים אלומיניום': 0.6,
  'אבקה לצביעה': 28,
  'צבע תרסיס': 45,
  'ציר כבד': 85,
  'מנעול': 220,
  'ידית': 65,
  'פרזול זכוכית': 95,
};

function price(name: string): number {
  return PRICES[name] ?? 20;
}

// ── BOM Formulas per product ──────────────────────────────────────────────
const PRODUCTS: Record<string, ProductConfig> = {
  'מעקה ברזל': {
    label: 'מעקה ברזל',
    profiles: ['פרופיל 40×40', 'פרופיל 50×50', 'פרופיל 60×60'],
    colors: ['שחור מט', 'שחור מבריק', 'חום', 'אנתרציט', 'אפור'],
    defaultProfile: 'פרופיל 40×40',
    calcBOM: (len, _h, qty, waste) => {
      const w = 1 + waste / 100;
      return [
        { material: 'פרופיל 40×40', qty: +(len * 1.2 * w * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל 40×40') },
        { material: 'פח מילוי 1.5mm', qty: +(len * 0.3 * w * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('פח מילוי 1.5mm') },
        { material: 'ברגים M8', qty: Math.ceil(len * 4 * qty), unit: "יח'", pricePerUnit: price('ברגים M8') },
        { material: 'אבקה לצביעה', qty: +(len * 0.15 * w * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('אבקה לצביעה') },
      ];
    },
  },
  'מעקה אלומיניום': {
    label: 'מעקה אלומיניום',
    profiles: ['פרופיל אלומיניום 40×40', 'פרופיל אלומיניום 60×30'],
    colors: ['כסף', 'שחמט', 'לבן', 'אנודייז טבעי'],
    defaultProfile: 'פרופיל אלומיניום 40×40',
    calcBOM: (len, _h, qty, waste) => {
      const w = 1 + waste / 100;
      return [
        { material: 'פרופיל אלומיניום 40×40', qty: +(len * 0.9 * w * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל אלומיניום 40×40') },
        { material: 'פח מילוי 1.5mm', qty: +(len * 0.2 * w * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('פח מילוי 1.5mm') },
        { material: 'ריבטים אלומיניום', qty: Math.ceil(len * 6 * qty), unit: "יח'", pricePerUnit: price('ריבטים אלומיניום') },
        { material: 'צבע תרסיס', qty: +(len * 0.08 * w * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('צבע תרסיס') },
      ];
    },
  },
  'שער כניסה': {
    label: 'שער כניסה',
    profiles: ['פרופיל 50×50', 'פרופיל 60×60'],
    colors: ['שחור מט', 'חום כהה', 'ירוק יער', 'אנתרציט'],
    defaultProfile: 'פרופיל 50×50',
    calcBOM: (w, h, qty, waste) => {
      const wf = 1 + waste / 100;
      const perim = 2 * (w + h);
      return [
        { material: 'פרופיל 50×50', qty: +(perim * 1.8 * wf * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל 50×50') },
        { material: 'פח מילוי 2mm', qty: +(w * h * 1.1 * wf * qty).toFixed(2), unit: 'מ"ר', pricePerUnit: price('פח מילוי 2mm') },
        { material: 'ציר כבד', qty: 2 * qty, unit: "יח'", pricePerUnit: price('ציר כבד') },
        { material: 'מנעול', qty: qty, unit: "יח'", pricePerUnit: price('מנעול') },
        { material: 'ידית', qty: qty, unit: "יח'", pricePerUnit: price('ידית') },
        { material: 'אבקה לצביעה', qty: +(perim * 0.2 * wf * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('אבקה לצביעה') },
      ];
    },
  },
  'גדר ביטחון': {
    label: 'גדר ביטחון',
    profiles: ['פרופיל 40×40', 'פרופיל 50×50'],
    colors: ['שחור מט', 'גלוון', 'ירוק'],
    defaultProfile: 'פרופיל 40×40',
    calcBOM: (len, h, qty, waste) => {
      const wf = 1 + waste / 100;
      return [
        { material: 'פרופיל 40×40', qty: +(len * h * 2.5 * wf * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל 40×40') },
        { material: 'פח מילוי 2mm', qty: +(len * h * 1.05 * wf * qty).toFixed(2), unit: 'מ"ר', pricePerUnit: price('פח מילוי 2mm') },
        { material: 'ברגים M8', qty: Math.ceil(len * 8 * qty), unit: "יח'", pricePerUnit: price('ברגים M8') },
        { material: 'אבקה לצביעה', qty: +(len * h * 0.35 * wf * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('אבקה לצביעה') },
      ];
    },
  },
  'פרגולה': {
    label: 'פרגולה',
    profiles: ['פרופיל 60×60', 'פרופיל 50×50'],
    colors: ['אנתרציט', 'שחור מט', 'לבן', 'חום'],
    defaultProfile: 'פרופיל 60×60',
    calcBOM: (len, h, qty, waste) => {
      const wf = 1 + waste / 100;
      const area = len * h;
      return [
        { material: 'פרופיל 60×60', qty: +((len * 2 + h * 4) * wf * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל 60×60') },
        { material: 'פח מילוי 1.5mm', qty: +(area * 0.4 * wf * qty).toFixed(2), unit: 'מ"ר', pricePerUnit: price('פח מילוי 1.5mm') },
        { material: 'ברגים M8', qty: Math.ceil(len * 6 * qty), unit: "יח'", pricePerUnit: price('ברגים M8') },
        { material: 'אבקה לצביעה', qty: +(area * 0.3 * wf * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('אבקה לצביעה') },
      ];
    },
  },
  'דלת כניסה': {
    label: 'דלת כניסה',
    profiles: ['פרופיל 50×50', 'פרופיל 60×60'],
    colors: ['שחור מט', 'אנתרציט', 'לבן', 'חום עץ'],
    defaultProfile: 'פרופיל 50×50',
    calcBOM: (w, h, qty, waste) => {
      const wf = 1 + waste / 100;
      const perim = 2 * (w + h);
      return [
        { material: 'פרופיל 50×50', qty: +(perim * 1.5 * wf * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל 50×50') },
        { material: 'פח מילוי 2mm', qty: +(w * h * 0.6 * wf * qty).toFixed(2), unit: 'מ"ר', pricePerUnit: price('פח מילוי 2mm') },
        { material: 'ציר כבד', qty: 3 * qty, unit: "יח'", pricePerUnit: price('ציר כבד') },
        { material: 'מנעול', qty: qty, unit: "יח'", pricePerUnit: price('מנעול') },
        { material: 'ידית', qty: 2 * qty, unit: "יח'", pricePerUnit: price('ידית') },
        { material: 'אבקה לצביעה', qty: +(perim * 0.18 * wf * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('אבקה לצביעה') },
      ];
    },
  },
  'סורגים': {
    label: 'סורגים',
    profiles: ['פרופיל 40×40', 'פרופיל 50×50'],
    colors: ['שחור מט', 'שחור מבריק', 'לבן', 'גלוון'],
    defaultProfile: 'פרופיל 40×40',
    calcBOM: (len, h, qty, waste) => {
      const wf = 1 + waste / 100;
      return [
        { material: 'פרופיל 40×40', qty: +((len * 2 + h * Math.ceil(len / 0.12)) * wf * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל 40×40') },
        { material: 'ברגים M6', qty: Math.ceil((len + h) * 6 * qty), unit: "יח'", pricePerUnit: price('ברגים M6') },
        { material: 'אבקה לצביעה', qty: +(len * h * 0.25 * wf * qty).toFixed(2), unit: 'ק"ג', pricePerUnit: price('אבקה לצביעה') },
      ];
    },
  },
  'מעקה זכוכית': {
    label: 'מעקה זכוכית',
    profiles: ['פרופיל אלומיניום 40×40', 'פרופיל אלומיניום 60×30'],
    colors: ['כרום', 'שחמט', 'זהב'],
    defaultProfile: 'פרופיל אלומיניום 40×40',
    calcBOM: (len, h, qty, waste) => {
      const wf = 1 + waste / 100;
      return [
        { material: 'פרופיל אלומיניום 40×40', qty: +(len * 1.1 * wf * qty).toFixed(2), unit: "מ'", pricePerUnit: price('פרופיל אלומיניום 40×40') },
        { material: 'זכוכית מחוסמת 8mm', qty: +(len * h * wf * qty).toFixed(2), unit: 'מ"ר', pricePerUnit: price('זכוכית מחוסמת 8mm') },
        { material: 'פרזול זכוכית', qty: Math.ceil(len * 2 * qty), unit: "יח'", pricePerUnit: price('פרזול זכוכית') },
        { material: 'ריבטים אלומיניום', qty: Math.ceil(len * 4 * qty), unit: "יח'", pricePerUnit: price('ריבטים אלומיניום') },
      ];
    },
  },
};

const PRODUCT_KEYS = Object.keys(PRODUCTS);

// ── Styles ────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  wrap: { direction: 'rtl', padding: 24, fontFamily: 'Segoe UI, Arial, sans-serif', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#58a6ff' },
  card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 20, marginBottom: 20 },
  row: { display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 12 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label: { fontSize: 13, color: '#8b96a5', marginBottom: 2 },
  input: { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '6px 10px', color: '#e6edf3', fontSize: 14, minWidth: 120 },
  select: { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '6px 10px', color: '#e6edf3', fontSize: 14, minWidth: 160 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { background: '#21262d', padding: '8px 12px', textAlign: 'right' as const, color: '#8b96a5', fontWeight: 600, borderBottom: '1px solid #30363d' },
  td: { padding: '8px 12px', borderBottom: '1px solid #21262d', textAlign: 'right' as const },
  totalRow: { fontWeight: 700, color: '#58a6ff', background: '#21262d' },
  summaryBox: { background: '#21262d', borderRadius: 8, padding: 16, marginTop: 20 },
  summaryLine: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #30363d', fontSize: 15 },
  grandTotal: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 18, fontWeight: 700, color: '#3fb950' },
  btnRow: { display: 'flex', gap: 12, marginTop: 16 },
  btn: { padding: '9px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnPrimary: { background: '#238636', color: '#fff' },
  btnSecondary: { background: '#30363d', color: '#e6edf3' },
};

// ── Component ─────────────────────────────────────────────────────────────
export default function BOMCalculator() {
  const [productType, setProductType] = useState(PRODUCT_KEYS[0]);
  const [length, setLength] = useState(3);
  const [height, setHeight] = useState(1.2);
  const [qty, setQty] = useState(1);
  const [waste, setWaste] = useState(10);
  const [_profile, setProfile] = useState(PRODUCTS[PRODUCT_KEYS[0]].defaultProfile);
  const [color, setColor] = useState(PRODUCTS[PRODUCT_KEYS[0]].colors[0]);

  const product = PRODUCTS[productType];

  // When product changes, reset profile & color
  const handleProductChange = (pt: string) => {
    setProductType(pt);
    setProfile(PRODUCTS[pt].defaultProfile);
    setColor(PRODUCTS[pt].colors[0]);
  };

  const bom: BOMLine[] = useMemo(() => {
    if (!product) return [];
    return product.calcBOM(length, height, qty, waste);
  }, [product, length, height, qty, waste]);

  const totalMaterials = useMemo(() => bom.reduce((s, l) => s + l.qty * l.pricePerUnit, 0), [bom]);
  const laborCost = totalMaterials * 0.5;
  const subtotal = totalMaterials + laborCost;
  const vat = subtotal * VAT_RATE;
  const grandTotal = subtotal + vat;

  const fmt = (n: number) => `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleExport = () => {
    const rows = bom.map(l => `${l.material},${l.qty},${l.unit},${l.pricePerUnit},${(l.qty * l.pricePerUnit).toFixed(0)}`).join('\n');
    const csv = `חומר,כמות,יחידה,מחיר ל',סה"כ\n${rows}\n\nסה"כ חומרים,,,,"${fmt(totalMaterials)}"\nעלות עבודה,,,,"${fmt(laborCost)}"\nמע"מ 18%,,,,"${fmt(vat)}"\nסה"כ הצעת מחיר,,,,"${fmt(grandTotal)}"`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM_${productType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <div style={s.wrap}>
      <div style={s.title}>📐 מחשבון BOM — חומרי גלם</div>

      {/* Inputs */}
      <div style={s.card}>
        <div style={s.row}>
          <div style={s.field}>
            <span style={s.label}>סוג מוצר</span>
            <select style={s.select} value={productType} onChange={e => handleProductChange(e.target.value)}>
              {PRODUCT_KEYS.map(k => <option key={k} value={k}>{PRODUCTS[k].label}</option>)}
            </select>
          </div>
          <div style={s.field}>
            <span style={s.label}>סוג פרופיל</span>
            <select style={s.select} value={_profile} onChange={e => setProfile(e.target.value)}>
              {product.profiles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={s.field}>
            <span style={s.label}>צבע / גמר</span>
            <select style={s.select} value={color} onChange={e => setColor(e.target.value)}>
              {product.colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={s.row}>
          <div style={s.field}>
            <span style={s.label}>אורך (מ')</span>
            <input style={s.input} type="number" min={0.1} step={0.1} value={length}
              onChange={e => setLength(+e.target.value || 0)} />
          </div>
          <div style={s.field}>
            <span style={s.label}>גובה (מ')</span>
            <input style={s.input} type="number" min={0.1} step={0.1} value={height}
              onChange={e => setHeight(+e.target.value || 0)} />
          </div>
          <div style={s.field}>
            <span style={s.label}>כמות יחידות</span>
            <input style={s.input} type="number" min={1} step={1} value={qty}
              onChange={e => setQty(Math.max(1, +e.target.value || 1))} />
          </div>
          <div style={s.field}>
            <span style={s.label}>אחוז בזבוז (%)</span>
            <input style={s.input} type="number" min={0} max={50} step={1} value={waste}
              onChange={e => setWaste(+e.target.value || 0)} />
          </div>
        </div>
      </div>

      {/* BOM Table */}
      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>חומר</th>
              <th style={s.th}>כמות</th>
              <th style={s.th}>יחידה</th>
              <th style={s.th}>מחיר ל'</th>
              <th style={s.th}>סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {bom.map((line, i) => (
              <tr key={i}>
                <td style={s.td}>{line.material}</td>
                <td style={s.td}>{line.qty}</td>
                <td style={s.td}>{line.unit}</td>
                <td style={s.td}>{fmt(line.pricePerUnit)}</td>
                <td style={s.td}>{fmt(line.qty * line.pricePerUnit)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ ...s.td, ...s.totalRow }}>סה"כ חומרים</td>
              <td style={{ ...s.td, ...s.totalRow }}>{fmt(totalMaterials)}</td>
            </tr>
          </tbody>
        </table>

        {/* Summary */}
        <div style={s.summaryBox}>
          <div style={s.summaryLine}>
            <span style={{ color: '#8b96a5' }}>סה"כ חומרים</span>
            <span>{fmt(totalMaterials)}</span>
          </div>
          <div style={s.summaryLine}>
            <span style={{ color: '#8b96a5' }}>עלות עבודה מוערכת (50% מחומרים)</span>
            <span>{fmt(laborCost)}</span>
          </div>
          <div style={s.summaryLine}>
            <span style={{ color: '#8b96a5' }}>מע"מ 18%</span>
            <span>{fmt(vat)}</span>
          </div>
          <div style={s.grandTotal}>
            <span>סה"כ הצעת מחיר</span>
            <span>{fmt(grandTotal)}</span>
          </div>
        </div>

        <div style={s.btnRow}>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleExport}>📋 ייצא להצעת מחיר</button>
          <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handlePrint}>🖨️ הדפס</button>
        </div>
      </div>
    </div>
  );
}
