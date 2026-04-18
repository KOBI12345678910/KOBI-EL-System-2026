import React, { useState, useEffect, useMemo } from 'react';
import {
  RawMaterialRegistry,
  ProductRegistry,
  seedDemoData,
  type RawMaterial,
  type Product,
  type MaterialCategory,
  type MaterialUnit,
  type ProductCategory,
  type BOMLine,
} from '../engines/purchasingEngine';

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASING — רכש
// Two linked registries: Raw Materials + Products (with BOM)
// Every product requires raw materials — mandatory BOM.
// ═══════════════════════════════════════════════════════════════════════════

const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'ברזל',
  'פלדה',
  'אלומיניום',
  'נירוסטה',
  'צבע',
  'חומרי_ריתוך',
  'אמלר',
  'ברגים_ומסמרים',
  'אבזרים',
  'בטיחות',
  'אריזה',
  'כלי_עבודה',
  'חשמל',
  'אחר',
];

const MATERIAL_UNITS: MaterialUnit[] = [
  'ק"ג',
  'מטר',
  'מטר מרובע',
  'מטר קובי',
  'יחידה',
  'ליטר',
  'גרם',
  'שעה',
  'צרור',
  'גליל',
];

const PRODUCT_CATEGORIES: ProductCategory[] = [
  'מעקות',
  'שערים',
  'גדרות',
  'פרגולות',
  'חיפויים',
  'דלתות',
  'חלונות',
  'מסגרות',
  'אחר',
];

export function Purchasing() {
  const [tab, setTab] = useState<'materials' | 'products' | 'dashboard'>('dashboard');
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const refresh = () => {
    seedDemoData();
    setMaterials(RawMaterialRegistry.getAll());
    setProducts(ProductRegistry.getAll());
  };

  useEffect(() => {
    refresh();
  }, []);

  const inventoryValue = useMemo(() => RawMaterialRegistry.getInventoryValue(), [materials]);
  const lowStock = useMemo(() => RawMaterialRegistry.getLowStock(), [materials]);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>
            📦 רכש — Raw Materials &amp; Products
          </h1>
          <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginTop: 2 }}>
            RAW MATERIALS · PRODUCTS · BOM · INVENTORY · AUTO-COST-CALCULATION
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DCC91' }} />
          <span style={{ fontSize: 10, color: '#3DCC91' }}>LIVE</span>
        </div>
      </div>

      {/* TABS */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          marginBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {[
          { k: 'dashboard', label: 'סקירה', icon: '📊' },
          { k: 'materials', label: `חומרי גלם (${materials.length})`, icon: '🧱' },
          { k: 'products', label: `מוצרים (${products.length})`, icon: '📦' },
        ].map(t => {
          const active = tab === t.k;
          return (
            <div
              key={t.k}
              onClick={() => setTab(t.k as any)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                color: active ? '#FFA500' : '#ABB3BF',
                borderBottom: active ? '2px solid #FFA500' : '2px solid transparent',
                fontSize: 12,
                fontWeight: 500,
                userSelect: 'none',
              }}
            >
              <span style={{ marginLeft: 6 }}>{t.icon}</span>
              {t.label}
            </div>
          );
        })}
      </div>

      {/* DASHBOARD */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <KPI label="סה״כ חומרי גלם" value={materials.length} sub="פריטים במאגר" color="#48AFF0" />
            <KPI
              label="שווי מלאי"
              value={`₪${inventoryValue.toLocaleString()}`}
              sub="הון מושקע"
              color="#3DCC91"
            />
            <KPI label="מוצרים" value={products.length} sub="במוצרי קטלוג" color="#FFA500" />
            <KPI
              label="מלאי נמוך"
              value={lowStock.length}
              sub={lowStock.length > 0 ? 'צריכים הזמנה' : 'OK'}
              color={lowStock.length > 0 ? '#FC8585' : '#3DCC91'}
            />
          </div>

          {lowStock.length > 0 && (
            <Panel title="🚨 חומרי גלם במלאי נמוך — דרוש הזמנה" tag="RESTOCK">
              <table style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#383E47' }}>
                    {['קוד', 'שם', 'קטגוריה', 'מלאי נוכחי', 'סף הזמנה', 'כמות מומלצת', 'ספק'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '7px 10px',
                          textAlign: 'right',
                          fontSize: 9,
                          color: '#5C7080',
                          fontWeight: 400,
                          letterSpacing: '0.1em',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{m.code}</td>
                      <td style={{ padding: '8px 10px', color: '#F6F7F9', fontWeight: 500 }}>{m.name}</td>
                      <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{m.category}</td>
                      <td style={{ padding: '8px 10px', color: '#FC8585', fontWeight: 600 }}>
                        {m.stockQty} {m.unit}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#FFB366' }}>{m.reorderLevel}</td>
                      <td style={{ padding: '8px 10px', color: '#48AFF0' }}>{m.reorderQty}</td>
                      <td style={{ padding: '8px 10px', color: '#5C7080', fontSize: 10 }}>{m.supplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <Panel title="חומרי גלם לפי קטגוריה" tag="BREAKDOWN">
              <div style={{ padding: 10 }}>
                {MATERIAL_CATEGORIES.map(cat => {
                  const items = materials.filter(m => m.category === cat);
                  if (items.length === 0) return null;
                  const value = items.reduce((s, m) => s + m.stockQty * m.costPerUnit, 0);
                  return (
                    <div
                      key={cat}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#F6F7F9' }}>{cat}</span>
                      <span style={{ fontSize: 11, color: '#3DCC91' }}>
                        {items.length} פריטים · ₪{value.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="מוצרים לפי קטגוריה" tag="CATALOG">
              <div style={{ padding: 10 }}>
                {PRODUCT_CATEGORIES.map(cat => {
                  const items = products.filter(p => p.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <div
                      key={cat}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}
                    >
                      <span style={{ fontSize: 11, color: '#F6F7F9' }}>{cat}</span>
                      <span style={{ fontSize: 11, color: '#48AFF0' }}>{items.length} מוצרים</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* MATERIALS */}
      {tab === 'materials' && <MaterialsTab materials={materials} onChange={refresh} />}

      {/* PRODUCTS */}
      {tab === 'products' && <ProductsTab products={products} materials={materials} onChange={refresh} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIALS TAB
// ═══════════════════════════════════════════════════════════════════════════

function MaterialsTab({ materials, onChange }: { materials: RawMaterial[]; onChange: () => void }) {
  const [filter, setFilter] = useState<MaterialCategory | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = materials.filter(m => {
    if (filter && m.category !== filter) return false;
    if (search && !m.name.includes(search) && !m.code.includes(search)) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          placeholder="🔍 חיפוש קוד או שם..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ ...inputStyle, width: 180 }}>
          <option value="">כל הקטגוריות</option>
          {MATERIAL_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button onClick={() => { setAdding(true); setEditing(null); }} style={btnStyle('#FFA500')}>
          ➕ חומר גלם חדש
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
        <Panel title="רשימת חומרי גלם" tag={`${filtered.length} פריטים`}>
          <table style={{ width: '100%', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['תמונה', 'קוד', 'שם', 'קטגוריה', 'מלאי', 'עלות', 'ספק'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '7px 10px',
                      textAlign: 'right',
                      fontSize: 9,
                      color: '#5C7080',
                      fontWeight: 400,
                      letterSpacing: '0.1em',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const isLow = m.stockQty <= m.reorderLevel;
                return (
                  <tr
                    key={m.id}
                    onClick={() => { setEditing(m); setAdding(false); }}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      background: editing?.id === m.id ? 'rgba(255,165,0,0.05)' : isLow ? 'rgba(252,133,133,0.03)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '6px 10px' }}>
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.name} style={{ width: 32, height: 32, objectFit: 'cover' }} />
                      ) : (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            background: '#383E47',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#5C7080',
                            fontSize: 14,
                          }}
                        >
                          📦
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#ABB3BF', fontSize: 10 }}>{m.code}</td>
                    <td style={{ padding: '6px 10px', color: '#F6F7F9', fontWeight: 500 }}>{m.name}</td>
                    <td style={{ padding: '6px 10px', color: '#5C7080', fontSize: 10 }}>{m.category}</td>
                    <td
                      style={{
                        padding: '6px 10px',
                        color: isLow ? '#FC8585' : '#3DCC91',
                        fontWeight: 600,
                      }}
                    >
                      {m.stockQty} {m.unit}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#FFA500' }}>
                      ₪{m.costPerUnit.toLocaleString()}/{m.unit}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#5C7080', fontSize: 10 }}>{m.supplier}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
              אין חומרי גלם
            </div>
          )}
        </Panel>

        <Panel title={adding ? 'חומר גלם חדש' : editing ? `עריכה: ${editing.name}` : 'בחר חומר גלם'} tag={adding || editing ? 'FORM' : ''}>
          {(adding || editing) ? (
            <MaterialForm
              initial={editing}
              onSave={(data) => {
                if (editing) {
                  RawMaterialRegistry.update(editing.id, data);
                } else {
                  RawMaterialRegistry.add(data);
                }
                setAdding(false);
                setEditing(null);
                onChange();
              }}
              onDelete={editing ? () => {
                if (confirm(`למחוק את ${editing.name}?`)) {
                  RawMaterialRegistry.remove(editing.id);
                  setEditing(null);
                  onChange();
                }
              } : undefined}
              onCancel={() => {
                setAdding(false);
                setEditing(null);
              }}
            />
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
              לחץ על חומר גלם לעריכה, או הוסף חדש
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL FORM
// ═══════════════════════════════════════════════════════════════════════════

function MaterialForm({
  initial,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: RawMaterial | null;
  onSave: (data: any) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    category: (initial?.category ?? 'ברזל') as MaterialCategory,
    description: initial?.description ?? '',
    unit: (initial?.unit ?? 'יחידה') as MaterialUnit,
    costPerUnit: initial?.costPerUnit ?? 0,
    salePrice: initial?.salePrice ?? 0,
    supplier: initial?.supplier ?? '',
    supplierPhone: initial?.supplierPhone ?? '',
    stockQty: initial?.stockQty ?? 0,
    reorderLevel: initial?.reorderLevel ?? 10,
    reorderQty: initial?.reorderQty ?? 20,
    leadTimeDays: initial?.leadTimeDays ?? 3,
    imageUrl: initial?.imageUrl ?? '',
    specs: initial?.specs ?? '',
    location: initial?.location ?? '',
    notes: initial?.notes ?? '',
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm(p => ({ ...p, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: 14, maxHeight: 600, overflowY: 'auto' }}>
      {/* Image */}
      <div style={{ marginBottom: 10, textAlign: 'center' }}>
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt=""
            style={{ width: 140, height: 140, objectFit: 'cover', marginBottom: 6, border: '1px solid rgba(255,255,255,0.1)' }}
          />
        ) : (
          <div
            style={{
              width: 140,
              height: 140,
              background: '#383E47',
              margin: '0 auto 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5C7080',
              fontSize: 28,
              border: '1px dashed rgba(255,255,255,0.1)',
            }}
          >
            📦
          </div>
        )}
        <label style={{ cursor: 'pointer', color: '#48AFF0', fontSize: 10 }}>
          📷 העלה תמונה
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <FormField label="קוד *" value={form.code} onChange={v => setForm(p => ({ ...p, code: v }))} />
        <FormField label="שם *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4 }}>קטגוריה</label>
        <select
          value={form.category}
          onChange={e => setForm(p => ({ ...p, category: e.target.value as MaterialCategory }))}
          style={inputStyle}
        >
          {MATERIAL_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <FormField
        label="תיאור"
        value={form.description}
        onChange={v => setForm(p => ({ ...p, description: v }))}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4 }}>יחידה</label>
          <select
            value={form.unit}
            onChange={e => setForm(p => ({ ...p, unit: e.target.value as MaterialUnit }))}
            style={inputStyle}
          >
            {MATERIAL_UNITS.map(u => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <FormField
          label="עלות ליחידה ₪ *"
          type="number"
          value={form.costPerUnit.toString()}
          onChange={v => setForm(p => ({ ...p, costPerUnit: Number(v) }))}
        />
      </div>

      <FormField
        label="מחיר מכירה (אופציונלי)"
        type="number"
        value={form.salePrice.toString()}
        onChange={v => setForm(p => ({ ...p, salePrice: Number(v) }))}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <FormField label="ספק" value={form.supplier} onChange={v => setForm(p => ({ ...p, supplier: v }))} />
        <FormField label="טלפון ספק" value={form.supplierPhone} onChange={v => setForm(p => ({ ...p, supplierPhone: v }))} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <FormField
          label="מלאי נוכחי"
          type="number"
          value={form.stockQty.toString()}
          onChange={v => setForm(p => ({ ...p, stockQty: Number(v) }))}
        />
        <FormField
          label="סף הזמנה"
          type="number"
          value={form.reorderLevel.toString()}
          onChange={v => setForm(p => ({ ...p, reorderLevel: Number(v) }))}
        />
        <FormField
          label="כמות הזמנה"
          type="number"
          value={form.reorderQty.toString()}
          onChange={v => setForm(p => ({ ...p, reorderQty: Number(v) }))}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <FormField
          label="זמן אספקה (ימים)"
          type="number"
          value={form.leadTimeDays.toString()}
          onChange={v => setForm(p => ({ ...p, leadTimeDays: Number(v) }))}
        />
        <FormField label="מיקום במחסן" value={form.location} onChange={v => setForm(p => ({ ...p, location: v }))} />
      </div>

      <FormField label="מפרט טכני" value={form.specs} onChange={v => setForm(p => ({ ...p, specs: v }))} />
      <FormField label="הערות" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} />

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={() => onSave(form)} style={{ ...btnStyle('#3DCC91'), flex: 1 }}>
          💾 שמור
        </button>
        {onDelete && (
          <button onClick={onDelete} style={btnStyle('#FC8585')}>
            🗑️ מחק
          </button>
        )}
        <button onClick={onCancel} style={btnStyle('#5C7080')}>
          ביטול
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function ProductsTab({ products, materials, onChange }: { products: Product[]; materials: RawMaterial[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<ProductCategory | ''>('');

  const filtered = products.filter(p => !filter || p.category === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ ...inputStyle, width: 200 }}>
          <option value="">כל הקטגוריות</option>
          {PRODUCT_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setAdding(true); setEditing(null); }} style={btnStyle('#FFA500')}>
          ➕ מוצר חדש
        </button>
      </div>

      {!adding && !editing && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {filtered.map(p => (
            <div
              key={p.id}
              onClick={() => setEditing(p)}
              style={{
                background: '#2F343C',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: 150, objectFit: 'cover' }} />
              ) : (
                <div
                  style={{
                    height: 150,
                    background: '#383E47',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#5C7080',
                    fontSize: 40,
                  }}
                >
                  📦
                </div>
              )}
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 10, color: '#5C7080' }}>{p.code}</div>
                <div style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 500, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 9, color: '#9D4EDD', marginBottom: 6 }}>{p.category}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#5C7080' }}>עלות:</span>
                  <span style={{ color: '#FFA500', fontWeight: 600 }}>
                    ₪{p.computedCost.toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#5C7080' }}>מכירה:</span>
                  <span style={{ color: '#3DCC91', fontWeight: 600 }}>
                    ₪{p.salePrice.toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: '#5C7080', marginTop: 4 }}>
                  🧱 {p.bom.length} חומרי גלם
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
              אין מוצרים
            </div>
          )}
        </div>
      )}

      {(adding || editing) && (
        <ProductForm
          initial={editing}
          materials={materials}
          onSave={(data) => {
            if (editing) {
              ProductRegistry.update(editing.id, data);
            } else {
              ProductRegistry.add(data);
            }
            setAdding(false);
            setEditing(null);
            onChange();
          }}
          onDelete={editing ? () => {
            if (confirm(`למחוק את ${editing.name}?`)) {
              ProductRegistry.remove(editing.id);
              setEditing(null);
              onChange();
            }
          } : undefined}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT FORM (with BOM builder)
// ═══════════════════════════════════════════════════════════════════════════

function ProductForm({
  initial,
  materials,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: Product | null;
  materials: RawMaterial[];
  onSave: (data: any) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    category: (initial?.category ?? 'מעקות') as ProductCategory,
    description: initial?.description ?? '',
    imageUrl: initial?.imageUrl ?? '',
    additionalImages: initial?.additionalImages ?? [],
    specifications: initial?.specifications ?? '',
    unit: (initial?.unit ?? 'יחידה') as 'יחידה' | 'מטר' | 'מטר מרובע' | 'סט',
    salePrice: initial?.salePrice ?? 0,
    bom: initial?.bom ?? ([] as BOMLine[]),
    marginPercent: initial?.marginPercent ?? 45,
    productionHours: initial?.productionHours ?? 1,
  });

  const [selMat, setSelMat] = useState('');
  const [qty, setQty] = useState(0);
  const [waste, setWaste] = useState(5);
  const [critical, setCritical] = useState(true);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm(p => ({ ...p, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const addBomLine = () => {
    if (!selMat || qty <= 0) return;
    setForm(p => ({
      ...p,
      bom: [
        ...p.bom,
        {
          rawMaterialId: selMat,
          quantityPerUnit: qty,
          wastePercent: waste,
          critical,
        },
      ],
    }));
    setSelMat('');
    setQty(0);
    setWaste(5);
  };

  const removeBomLine = (idx: number) => {
    setForm(p => ({ ...p, bom: p.bom.filter((_, i) => i !== idx) }));
  };

  // Compute cost live
  const computedCost = useMemo(() => {
    return form.bom.reduce((sum, line) => {
      const m = materials.find(x => x.id === line.rawMaterialId);
      if (!m) return sum;
      const effectiveQty = line.quantityPerUnit * (1 + line.wastePercent / 100);
      return sum + effectiveQty * m.costPerUnit;
    }, 0);
  }, [form.bom, materials]);

  const profit = form.salePrice - computedCost;
  const actualMargin = form.salePrice > 0 ? Math.round((profit / form.salePrice) * 100 * 10) / 10 : 0;

  return (
    <Panel title={initial ? `עריכה: ${initial.name}` : 'מוצר חדש'} tag="PRODUCT FORM">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 12, padding: 14 }}>
        {/* Left: basic info + image */}
        <div>
          <div style={{ marginBottom: 10, textAlign: 'center' }}>
            {form.imageUrl ? (
              <img
                src={form.imageUrl}
                alt=""
                style={{
                  width: '100%',
                  maxWidth: 260,
                  height: 200,
                  objectFit: 'cover',
                  marginBottom: 6,
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  maxWidth: 260,
                  height: 200,
                  margin: '0 auto 6px',
                  background: '#383E47',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#5C7080',
                  fontSize: 40,
                  border: '1px dashed rgba(255,255,255,0.1)',
                }}
              >
                📦
              </div>
            )}
            <label style={{ cursor: 'pointer', color: '#48AFF0', fontSize: 10 }}>
              📷 העלה תמונת מוצר
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <FormField label="קוד *" value={form.code} onChange={v => setForm(p => ({ ...p, code: v }))} />
            <FormField label="שם *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4 }}>קטגוריה</label>
            <select
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value as ProductCategory }))}
              style={inputStyle}
            >
              {PRODUCT_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="תיאור"
            value={form.description}
            onChange={v => setForm(p => ({ ...p, description: v }))}
          />

          <FormField
            label="מפרט טכני"
            value={form.specifications}
            onChange={v => setForm(p => ({ ...p, specifications: v }))}
          />

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4 }}>יחידה</label>
            <select
              value={form.unit}
              onChange={e => setForm(p => ({ ...p, unit: e.target.value as any }))}
              style={inputStyle}
            >
              {(['יחידה', 'מטר', 'מטר מרובע', 'סט'] as const).map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <FormField
              label="מחיר מכירה ₪ *"
              type="number"
              value={form.salePrice.toString()}
              onChange={v => setForm(p => ({ ...p, salePrice: Number(v) }))}
            />
            <FormField
              label="זמן ייצור (שעות)"
              type="number"
              value={form.productionHours.toString()}
              onChange={v => setForm(p => ({ ...p, productionHours: Number(v) }))}
            />
          </div>
        </div>

        {/* Right: BOM builder */}
        <div>
          <div
            style={{
              background: 'rgba(255,165,0,0.06)',
              border: '1px solid rgba(255,165,0,0.25)',
              padding: 10,
              marginBottom: 12,
              fontSize: 10,
              color: '#FFA500',
            }}
          >
            ⚠️ חובה להגדיר חומרי גלם ל-BOM — זה חובה לכל מוצר
          </div>

          <h4 style={{ color: '#F6F7F9', fontSize: 12, marginBottom: 8 }}>🧱 הוסף חומר גלם ל-BOM</h4>

          <div style={{ marginBottom: 8 }}>
            <select value={selMat} onChange={e => setSelMat(e.target.value)} style={inputStyle}>
              <option value="">-- בחר חומר גלם --</option>
              {materials
                .filter(m => m.active)
                .map(m => (
                  <option key={m.id} value={m.id}>
                    {m.code} · {m.name} (₪{m.costPerUnit}/{m.unit})
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <FormField label="כמות ליחידת מוצר" type="number" value={qty.toString()} onChange={v => setQty(Number(v))} />
            <FormField label="פחת %" type="number" value={waste.toString()} onChange={v => setWaste(Number(v))} />
            <div>
              <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4 }}>קריטי?</label>
              <select
                value={critical ? 'yes' : 'no'}
                onChange={e => setCritical(e.target.value === 'yes')}
                style={inputStyle}
              >
                <option value="yes">כן</option>
                <option value="no">לא</option>
              </select>
            </div>
          </div>

          <button onClick={addBomLine} style={{ ...btnStyle('#48AFF0'), width: '100%', marginBottom: 12 }}>
            ➕ הוסף ל-BOM
          </button>

          {/* BOM list */}
          <div style={{ background: '#1C2127', padding: 10, maxHeight: 260, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, color: '#5C7080', marginBottom: 6 }}>
              רשימת חומרי גלם ({form.bom.length})
            </div>
            {form.bom.map((line, idx) => {
              const m = materials.find(x => x.id === line.rawMaterialId);
              if (!m) return null;
              const effectiveQty = line.quantityPerUnit * (1 + line.wastePercent / 100);
              const cost = effectiveQty * m.costPerUnit;
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#F6F7F9' }}>
                      {line.critical && <span style={{ color: '#FC8585' }}>* </span>}
                      {m.name}
                    </div>
                    <div style={{ color: '#5C7080', fontSize: 9 }}>
                      {line.quantityPerUnit} {m.unit} + פחת {line.wastePercent}% = {effectiveQty.toFixed(2)} {m.unit}
                    </div>
                  </div>
                  <div style={{ color: '#FFA500', marginLeft: 8 }}>₪{cost.toFixed(2)}</div>
                  <button
                    onClick={() => removeBomLine(idx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#FC8585',
                      cursor: 'pointer',
                      marginRight: 6,
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {form.bom.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: '#5C7080', fontSize: 10 }}>
                אין חומרי גלם ב-BOM
              </div>
            )}
          </div>

          {/* Cost summary */}
          <div style={{ marginTop: 12, padding: 10, background: '#383E47' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#5C7080' }}>עלות מחושבת אוטומטית</span>
              <span style={{ fontSize: 13, color: '#FFA500', fontWeight: 700 }}>
                ₪{computedCost.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#5C7080' }}>מחיר מכירה</span>
              <span style={{ fontSize: 13, color: '#3DCC91', fontWeight: 700 }}>
                ₪{form.salePrice.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#5C7080' }}>רווח</span>
              <span style={{ fontSize: 13, color: profit > 0 ? '#3DCC91' : '#FC8585', fontWeight: 700 }}>
                ₪{profit.toFixed(0)} ({actualMargin}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 14px 14px', display: 'flex', gap: 6 }}>
        <button
          onClick={() => {
            if (form.bom.length === 0) {
              alert('חובה להגדיר לפחות חומר גלם אחד ב-BOM!');
              return;
            }
            onSave(form);
          }}
          style={{ ...btnStyle('#3DCC91'), flex: 1 }}
        >
          💾 שמור מוצר
        </button>
        {onDelete && (
          <button onClick={onDelete} style={btnStyle('#FC8585')}>
            🗑️ מחק
          </button>
        )}
        <button onClick={onCancel} style={btnStyle('#5C7080')}>
          ביטול
        </button>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#383E47',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#F6F7F9',
  padding: '8px 10px',
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box',
};

function btnStyle(color: string): React.CSSProperties {
  return {
    background: `${color}20`,
    border: `1px solid ${color}`,
    color,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  };
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>
        {label}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

function KPI({ label, value, sub, color }: any) {
  return (
    <div
      style={{
        background: '#2F343C',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTop: `2px solid ${color}`,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#5C7080' }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, tag, children }: any) {
  return (
    <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#383E47',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {title}
        </span>
        {tag && (
          <span style={{ fontSize: 9, color: '#9D4EDD', border: '1px solid rgba(157,78,221,0.3)', padding: '1px 7px' }}>
            {tag}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
