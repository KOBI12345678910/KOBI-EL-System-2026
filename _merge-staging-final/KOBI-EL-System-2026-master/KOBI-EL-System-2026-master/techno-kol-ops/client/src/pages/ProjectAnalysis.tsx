import React, { useState, useEffect, useMemo } from 'react';
import {
  decide,
  processIncomingQuote,
  DecisionStore,
  SubcontractorRegistry,
  loadConfig,
  saveConfig,
  getSavingsReport,
  formatWorkOrderMessage,
  type SubcontractorDecision,
  type WorkType,
  type Subcontractor,
  type DecisionConfig,
  type ProjectMaterialRequirement,
} from '../engines/subcontractorEngine';
import {
  RawMaterialRegistry,
  ProductRegistry,
  ProjectMaterialStore,
  seedDemoData,
  type RawMaterial,
  type Product,
} from '../engines/purchasingEngine';

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT ANALYSIS — autonomous AI decision module
// Every quote/deal flows through here. AI picks the best subcontractor,
// validates raw materials, and issues alerts on margin/quality/timeline.
// ═══════════════════════════════════════════════════════════════════════════

const WORK_TYPES: WorkType[] = [
  'מעקות_ברזל',
  'מעקות_אלומיניום',
  'שערים',
  'גדרות',
  'פרגולות',
  'דלתות',
  'חלונות',
  'ריתוך',
  'צביעה',
  'התקנה',
  'ייצור_מפעל',
  'הובלה_והרכבה',
  'חיפוי_אלומיניום',
  'מסגרות_פלדה',
  'custom',
];

export function ProjectAnalysis() {
  const [decisions, setDecisions] = useState<SubcontractorDecision[]>([]);
  const [contractors, setContractors] = useState<Subcontractor[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<DecisionConfig>(loadConfig());
  const [tab, setTab] = useState<'dash' | 'new' | 'decisions' | 'contractors' | 'config'>('dash');
  const [selected, setSelected] = useState<SubcontractorDecision | null>(null);

  // refresh all state
  const refresh = () => {
    seedDemoData();
    setDecisions(DecisionStore.getAll());
    setContractors(SubcontractorRegistry.getAll());
    setRawMaterials(RawMaterialRegistry.getAll());
    setProducts(ProductRegistry.getAll());
  };

  useEffect(() => {
    refresh();
  }, []);

  // Savings report
  const report = useMemo(() => getSavingsReport(), [decisions]);

  const alerts = useMemo(() => {
    return decisions.filter(d => d.alertLevel === 'critical').slice(0, 5);
  }, [decisions]);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>
            🎯 ניתוח פרויקטים — AI Decision Engine
          </h1>
          <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginTop: 2 }}>
            AUTONOMOUS · SUBCONTRACTOR SELECTION · COST OPTIMIZATION · ALERTS
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DCC91' }} />
          <span style={{ fontSize: 10, color: '#3DCC91' }}>LIVE · פועל אוטומטית</span>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {[
          { k: 'dash', label: 'סקירה כללית', icon: '📊' },
          { k: 'new', label: 'ניתוח חדש', icon: '➕' },
          { k: 'decisions', label: `החלטות (${decisions.length})`, icon: '📋' },
          { k: 'contractors', label: `קבלנים (${contractors.length})`, icon: '👷' },
          { k: 'config', label: 'הגדרות', icon: '⚙️' },
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

      {/* DASHBOARD TAB */}
      {tab === 'dash' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <KPI label="סה״כ החלטות AI" value={report.totalDecisions} sub="כל הזמנים" color="#48AFF0" />
            <KPI
              label="חיסכון מצטבר"
              value={`₪${report.totalSavings.toLocaleString()}`}
              sub={`חיסכון ממוצע ${report.avgSavingsPercent}%`}
              color="#3DCC91"
            />
            <KPI
              label="קבלנים במערכת"
              value={contractors.length}
              sub={`${contractors.filter(c => c.available).length} זמינים`}
              color="#FFA500"
            />
            <KPI
              label="התראות קריטיות"
              value={alerts.length}
              sub="עסקאות ברווח נמוך"
              color={alerts.length > 0 ? '#FC8585' : '#3DCC91'}
            />
          </div>

          {/* Critical alerts */}
          {alerts.length > 0 && (
            <Panel title="🚨 התראות קריטיות — עסקאות ברווח נמוך" tag="ALERT">
              <div>
                {alerts.map(a => (
                  <div
                    key={a.id}
                    onClick={() => setSelected(a)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: 'rgba(252,133,133,0.06)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 500 }}>{a.projectName}</span>
                      <span style={{ fontSize: 10, color: '#5C7080' }}>
                        {new Date(a.timestamp).toLocaleString('he-IL')}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#FC8585' }}>{a.alertMessage}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Latest decisions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <Panel title="החלטות אחרונות" tag="RECENT">
              <div>
                {decisions.slice(0, 10).map(d => (
                  <div
                    key={d.id}
                    onClick={() => setSelected(d)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      background:
                        d.alertLevel === 'critical'
                          ? 'rgba(252,133,133,0.04)'
                          : d.alertLevel === 'warning'
                            ? 'rgba(255,179,102,0.04)'
                            : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#F6F7F9', fontWeight: 500 }}>{d.projectName}</span>
                      <span
                        style={{
                          fontSize: 10,
                          color:
                            d.alertLevel === 'critical'
                              ? '#FC8585'
                              : d.alertLevel === 'warning'
                                ? '#FFB366'
                                : '#3DCC91',
                        }}
                      >
                        {d.alertLevel === 'critical' ? '🚨' : d.alertLevel === 'warning' ? '⚠️' : '✅'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#5C7080' }}>
                      {d.analysis.selectedContractorName} · ₪{d.analysis.selectedCost.toLocaleString()} ·
                      חיסכון ₪{d.analysis.savingsAmount.toLocaleString()}
                    </div>
                  </div>
                ))}
                {decisions.length === 0 && (
                  <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
                    אין החלטות עדיין. צור ניתוח חדש בטאב "ניתוח חדש"
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="חיסכון לפי סוג עבודה" tag="ANALYTICS">
              <div style={{ padding: '8px 0' }}>
                {Object.entries(report.byWorkType).map(([type, data]) => (
                  <div
                    key={type}
                    style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: '#F6F7F9' }}>{type}</span>
                      <span style={{ fontSize: 11, color: '#3DCC91', fontWeight: 600 }}>
                        ₪{data.savings.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: '#5C7080', marginTop: 2 }}>{data.count} פרויקטים</div>
                  </div>
                ))}
                {Object.keys(report.byWorkType).length === 0 && (
                  <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
                    אין נתונים עדיין
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* NEW DECISION TAB */}
      {tab === 'new' && (
        <NewDecisionForm
          contractors={contractors}
          rawMaterials={rawMaterials}
          products={products}
          onCreated={(d) => {
            refresh();
            setSelected(d);
            setTab('decisions');
          }}
        />
      )}

      {/* DECISIONS TAB */}
      {tab === 'decisions' && (
        <DecisionsTable decisions={decisions} onSelect={setSelected} />
      )}

      {/* CONTRACTORS TAB */}
      {tab === 'contractors' && (
        <ContractorsTab contractors={contractors} onChange={refresh} />
      )}

      {/* CONFIG TAB */}
      {tab === 'config' && (
        <ConfigPanel
          config={config}
          onSave={(cfg) => {
            saveConfig(cfg);
            setConfig(cfg);
          }}
        />
      )}

      {/* DETAIL MODAL */}
      {selected && <DecisionDetail decision={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW DECISION FORM
// ═══════════════════════════════════════════════════════════════════════════

function NewDecisionForm({
  contractors,
  rawMaterials,
  products,
  onCreated,
}: {
  contractors: Subcontractor[];
  rawMaterials: RawMaterial[];
  products: Product[];
  onCreated: (d: SubcontractorDecision) => void;
}) {
  const [form, setForm] = useState({
    projectName: '',
    client: '',
    address: '',
    workType: 'מעקות_ברזל' as WorkType,
    totalProjectValue: 0,
    areaSqm: 0,
    startDate: new Date().toISOString().slice(0, 10),
    deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    requirements: '',
  });

  const [materials, setMaterials] = useState<ProjectMaterialRequirement[]>([]);
  const [selectedRawMaterial, setSelectedRawMaterial] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [materialQty, setMaterialQty] = useState(0);
  const [error, setError] = useState('');

  const addRawMaterial = () => {
    if (!selectedRawMaterial || materialQty <= 0) return;
    const m = rawMaterials.find(x => x.id === selectedRawMaterial);
    if (!m) return;
    setMaterials(prev => [
      ...prev,
      {
        rawMaterialId: m.id,
        rawMaterialName: m.name,
        quantity: materialQty,
        unit: m.unit,
        unitCost: m.costPerUnit,
        totalCost: Math.round(m.costPerUnit * materialQty * 100) / 100,
      },
    ]);
    setSelectedRawMaterial('');
    setMaterialQty(0);
  };

  const addProduct = () => {
    if (!selectedProduct || materialQty <= 0) return;
    const p = products.find(x => x.id === selectedProduct);
    if (!p) return;
    setMaterials(prev => [
      ...prev,
      {
        rawMaterialId: p.id,
        rawMaterialName: `${p.name} (מוצר מורכב)`,
        quantity: materialQty,
        unit: p.unit,
        unitCost: p.computedCost,
        totalCost: Math.round(p.computedCost * materialQty * 100) / 100,
      },
    ]);
    setSelectedProduct('');
    setMaterialQty(0);
  };

  const removeMaterial = (idx: number) => {
    setMaterials(prev => prev.filter((_, i) => i !== idx));
  };

  const totalMaterialsCost = materials.reduce((sum, m) => sum + m.totalCost, 0);

  const submit = () => {
    setError('');
    if (!form.projectName || !form.client || form.totalProjectValue <= 0 || form.areaSqm <= 0) {
      setError('חובה למלא שם פרויקט, לקוח, סכום ושטח');
      return;
    }
    if (materials.length === 0) {
      setError('חובה להגדיר לפחות חומר גלם / מוצר אחד לפרויקט — זה חובה!');
      return;
    }
    try {
      const decision = decide({
        projectName: form.projectName,
        client: form.client,
        address: form.address,
        workType: form.workType,
        totalProjectValue: form.totalProjectValue,
        areaSqm: form.areaSqm,
        startDate: form.startDate,
        deadline: form.deadline,
        requirements: form.requirements,
        rawMaterialsRequired: materials,
      });
      onCreated(decision);
    } catch (e: any) {
      setError(e.message || 'שגיאה בעת ניתוח');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Panel title="פרטי פרויקט" tag="STEP 1">
        <div style={{ padding: 14 }}>
          <FormField label="שם פרויקט *" value={form.projectName} onChange={v => setForm(p => ({ ...p, projectName: v }))} />
          <FormField label="לקוח *" value={form.client} onChange={v => setForm(p => ({ ...p, client: v }))} />
          <FormField label="כתובת" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} />

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>
              סוג עבודה *
            </label>
            <select
              value={form.workType}
              onChange={e => setForm(p => ({ ...p, workType: e.target.value as WorkType }))}
              style={inputStyle}
            >
              {WORK_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FormField
              label="סכום פרויקט ₪ *"
              type="number"
              value={form.totalProjectValue.toString()}
              onChange={v => setForm(p => ({ ...p, totalProjectValue: Number(v) }))}
            />
            <FormField
              label='שטח (מ"ר) *'
              type="number"
              value={form.areaSqm.toString()}
              onChange={v => setForm(p => ({ ...p, areaSqm: Number(v) }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FormField
              label="תחילת עבודה *"
              type="date"
              value={form.startDate}
              onChange={v => setForm(p => ({ ...p, startDate: v }))}
            />
            <FormField
              label="דד-ליין *"
              type="date"
              value={form.deadline}
              onChange={v => setForm(p => ({ ...p, deadline: v }))}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>
              דרישות מיוחדות
            </label>
            <textarea
              value={form.requirements}
              onChange={e => setForm(p => ({ ...p, requirements: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>
      </Panel>

      <Panel title="חומרי גלם / מוצרים (חובה!)" tag="STEP 2">
        <div style={{ padding: 14 }}>
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
            ⚠️ חובה להגדיר לפחות חומר גלם או מוצר אחד לפרויקט לפני הניתוח
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>
              חומר גלם
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6 }}>
              <select
                value={selectedRawMaterial}
                onChange={e => setSelectedRawMaterial(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- בחר --</option>
                {rawMaterials
                  .filter(m => m.active)
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.code} · {m.name} (₪{m.costPerUnit}/{m.unit})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                value={selectedRawMaterial ? materialQty : ''}
                onChange={e => setMaterialQty(Number(e.target.value))}
                placeholder="כמות"
                style={inputStyle}
              />
              <button onClick={addRawMaterial} style={btnStyle('#48AFF0')}>
                הוסף
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 4, letterSpacing: '0.1em' }}>
              מוצר מורכב (BOM)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6 }}>
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- בחר --</option>
                {products
                  .filter(p => p.active)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name} (₪{p.computedCost}/{p.unit})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                value={selectedProduct ? materialQty : ''}
                onChange={e => setMaterialQty(Number(e.target.value))}
                placeholder="כמות"
                style={inputStyle}
              />
              <button onClick={addProduct} style={btnStyle('#9D4EDD')}>
                הוסף
              </button>
            </div>
          </div>

          {/* Materials list */}
          <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 10 }}>
            {materials.map((m, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 11,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#F6F7F9' }}>{m.rawMaterialName}</div>
                  <div style={{ color: '#5C7080', fontSize: 9 }}>
                    {m.quantity} {m.unit} × ₪{m.unitCost}
                  </div>
                </div>
                <div style={{ color: '#3DCC91', marginLeft: 10 }}>₪{m.totalCost.toLocaleString()}</div>
                <button
                  onClick={() => removeMaterial(idx)}
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
            ))}
            {materials.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
                לא נוספו חומרי גלם / מוצרים
              </div>
            )}
          </div>

          <div
            style={{
              padding: '10px 12px',
              background: '#383E47',
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 11, color: '#5C7080' }}>סה"כ עלות חומרי גלם</span>
            <span style={{ fontSize: 13, color: '#3DCC91', fontWeight: 700 }}>
              ₪{totalMaterialsCost.toLocaleString()}
            </span>
          </div>

          {error && (
            <div
              style={{
                padding: 10,
                background: 'rgba(252,133,133,0.08)',
                border: '1px solid #FC8585',
                color: '#FC8585',
                fontSize: 11,
                marginBottom: 10,
              }}
            >
              {error}
            </div>
          )}

          <button onClick={submit} style={{ ...btnStyle('#FFA500'), width: '100%', padding: 12, fontSize: 13 }}>
            🎯 הפעל AI Decision
          </button>
        </div>
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISIONS TABLE
// ═══════════════════════════════════════════════════════════════════════════

function DecisionsTable({
  decisions,
  onSelect,
}: {
  decisions: SubcontractorDecision[];
  onSelect: (d: SubcontractorDecision) => void;
}) {
  return (
    <Panel title="כל ההחלטות" tag="HISTORY">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#383E47' }}>
            {['תאריך', 'פרויקט', 'קבלן נבחר', 'שיטה', 'עלות', 'חיסכון', 'התראה', 'סטטוס'].map(h => (
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
          {decisions.map(d => (
            <tr
              key={d.id}
              onClick={() => onSelect(d)}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                cursor: 'pointer',
              }}
            >
              <td style={{ padding: '8px 10px', color: '#5C7080', fontSize: 10 }}>
                {new Date(d.timestamp).toLocaleString('he-IL')}
              </td>
              <td style={{ padding: '8px 10px', color: '#F6F7F9', fontWeight: 500 }}>{d.projectName}</td>
              <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>{d.analysis.selectedContractorName}</td>
              <td style={{ padding: '8px 10px', color: '#48AFF0' }}>
                {d.analysis.selectedPricingMethod === 'percentage' ? 'אחוזים' : 'מ"ר'}
              </td>
              <td style={{ padding: '8px 10px', color: '#F6F7F9' }}>
                ₪{d.analysis.selectedCost.toLocaleString()}
              </td>
              <td style={{ padding: '8px 10px', color: '#3DCC91' }}>
                ₪{d.analysis.savingsAmount.toLocaleString()} ({d.analysis.savingsPercent}%)
              </td>
              <td style={{ padding: '8px 10px' }}>
                <AlertBadge level={d.alertLevel} />
              </td>
              <td style={{ padding: '8px 10px' }}>
                {d.sentToContractor ? (
                  <span style={{ color: '#3DCC91', fontSize: 9 }}>נשלח ({d.sentVia})</span>
                ) : (
                  <span style={{ color: '#FFB366', fontSize: 9 }}>ממתין</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {decisions.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
          אין החלטות עדיין
        </div>
      )}
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACTORS TAB
// ═══════════════════════════════════════════════════════════════════════════

function ContractorsTab({
  contractors,
  onChange,
}: {
  contractors: Subcontractor[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Subcontractor | null>(null);
  const [addingPrice, setAddingPrice] = useState(false);

  const [newC, setNewC] = useState({
    name: '',
    phone: '',
    email: '',
    quality: 7,
    reliability: 7,
    notes: '',
  });

  const [newPrice, setNewPrice] = useState({
    workType: 'מעקות_ברזל' as WorkType,
    percentageRate: 0,
    pricePerSqm: 0,
    minimumPrice: 0,
  });

  const save = () => {
    if (!newC.name || !newC.phone) return;
    SubcontractorRegistry.add({
      name: newC.name,
      phone: newC.phone,
      email: newC.email,
      specialties: ['custom'],
      qualityRating: newC.quality,
      reliabilityRating: newC.reliability,
      notes: newC.notes,
    });
    setNewC({ name: '', phone: '', email: '', quality: 7, reliability: 7, notes: '' });
    setAdding(false);
    onChange();
  };

  const savePrice = () => {
    if (!selected || !newPrice.workType || newPrice.percentageRate <= 0) return;
    SubcontractorRegistry.setPricing(selected.id, {
      workType: newPrice.workType,
      percentageRate: newPrice.percentageRate,
      pricePerSqm: newPrice.pricePerSqm,
      minimumPrice: newPrice.minimumPrice || undefined,
    });
    setNewPrice({ workType: 'מעקות_ברזל', percentageRate: 0, pricePerSqm: 0, minimumPrice: 0 });
    setAddingPrice(false);
    onChange();
    setSelected(SubcontractorRegistry.get(selected.id) || null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Panel title="קבלני משנה" tag={`${contractors.length} קבלנים`}>
        <div style={{ padding: 10 }}>
          <button onClick={() => setAdding(!adding)} style={{ ...btnStyle('#FFA500'), width: '100%', marginBottom: 10 }}>
            {adding ? '✕ ביטול' : '➕ הוסף קבלן חדש'}
          </button>

          {adding && (
            <div style={{ padding: 10, background: '#383E47', marginBottom: 10 }}>
              <FormField label="שם קבלן *" value={newC.name} onChange={v => setNewC(p => ({ ...p, name: v }))} />
              <FormField label="טלפון *" value={newC.phone} onChange={v => setNewC(p => ({ ...p, phone: v }))} />
              <FormField label="אימייל" value={newC.email} onChange={v => setNewC(p => ({ ...p, email: v }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <FormField
                  label="איכות (1-10)"
                  type="number"
                  value={newC.quality.toString()}
                  onChange={v => setNewC(p => ({ ...p, quality: Number(v) }))}
                />
                <FormField
                  label="אמינות (1-10)"
                  type="number"
                  value={newC.reliability.toString()}
                  onChange={v => setNewC(p => ({ ...p, reliability: Number(v) }))}
                />
              </div>
              <button onClick={save} style={{ ...btnStyle('#3DCC91'), width: '100%' }}>
                💾 שמור
              </button>
            </div>
          )}

          {contractors.map(c => (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                cursor: 'pointer',
                background: selected?.id === c.id ? 'rgba(255,165,0,0.05)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 9, color: c.available ? '#3DCC91' : '#FC8585' }}>
                  {c.available ? 'זמין' : 'לא זמין'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#5C7080' }}>
                {c.phone} · ⭐ {c.qualityRating}/10 · {c.pricing.length} סוגי עבודה
              </div>
            </div>
          ))}

          {contractors.length === 0 && !adding && (
            <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
              אין קבלנים במערכת
            </div>
          )}
        </div>
      </Panel>

      <Panel title={selected ? `מחירון: ${selected.name}` : 'בחר קבלן'} tag={selected ? 'PRICING' : ''}>
        {selected ? (
          <div style={{ padding: 10 }}>
            <button
              onClick={() => setAddingPrice(!addingPrice)}
              style={{ ...btnStyle('#48AFF0'), width: '100%', marginBottom: 10 }}
            >
              {addingPrice ? '✕ ביטול' : '➕ הוסף מחיר'}
            </button>

            {addingPrice && (
              <div style={{ padding: 10, background: '#383E47', marginBottom: 10 }}>
                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      fontSize: 10,
                      color: '#5C7080',
                      display: 'block',
                      marginBottom: 4,
                      letterSpacing: '0.1em',
                    }}
                  >
                    סוג עבודה *
                  </label>
                  <select
                    value={newPrice.workType}
                    onChange={e => setNewPrice(p => ({ ...p, workType: e.target.value as WorkType }))}
                    style={inputStyle}
                  >
                    {WORK_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <FormField
                  label="אחוז מהפרויקט (%)"
                  type="number"
                  value={newPrice.percentageRate.toString()}
                  onChange={v => setNewPrice(p => ({ ...p, percentageRate: Number(v) }))}
                />
                <FormField
                  label='מחיר למ"ר (₪)'
                  type="number"
                  value={newPrice.pricePerSqm.toString()}
                  onChange={v => setNewPrice(p => ({ ...p, pricePerSqm: Number(v) }))}
                />
                <FormField
                  label="מחיר מינימום (₪)"
                  type="number"
                  value={newPrice.minimumPrice.toString()}
                  onChange={v => setNewPrice(p => ({ ...p, minimumPrice: Number(v) }))}
                />
                <button onClick={savePrice} style={{ ...btnStyle('#3DCC91'), width: '100%' }}>
                  💾 שמור מחיר
                </button>
              </div>
            )}

            <table style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#383E47' }}>
                  {['סוג עבודה', 'אחוז', 'מ"ר', 'מינימום'].map(h => (
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
                {selected.pricing.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '8px 10px', color: '#F6F7F9' }}>{p.workType}</td>
                    <td style={{ padding: '8px 10px', color: '#48AFF0' }}>{p.percentageRate}%</td>
                    <td style={{ padding: '8px 10px', color: '#FFA500' }}>₪{p.pricePerSqm}</td>
                    <td style={{ padding: '8px 10px', color: '#ABB3BF' }}>
                      {p.minimumPrice ? `₪${p.minimumPrice}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selected.pricing.length === 0 && !addingPrice && (
              <div style={{ padding: 20, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
                אין מחירים. הוסף מחיר כדי שהקבלן יוכל להשתתף בהחלטות.
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: '#5C7080', fontSize: 11 }}>
            בחר קבלן מהרשימה מימין כדי לראות / לערוך את המחירון שלו
          </div>
        )}
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG PANEL
// ═══════════════════════════════════════════════════════════════════════════

function ConfigPanel({ config, onSave }: { config: DecisionConfig; onSave: (c: DecisionConfig) => void }) {
  const [form, setForm] = useState(config);

  return (
    <Panel title="הגדרות מנוע החלטה" tag="CONFIG">
      <div style={{ padding: 14, maxWidth: 500 }}>
        <h4 style={{ color: '#F6F7F9', fontSize: 12, marginBottom: 10 }}>משקולות ציון (חייב לסכם ל-1.0)</h4>

        <SliderField
          label={`משקל מחיר: ${form.priceWeight}`}
          value={form.priceWeight}
          onChange={v => setForm(p => ({ ...p, priceWeight: v }))}
        />
        <SliderField
          label={`משקל איכות: ${form.qualityWeight}`}
          value={form.qualityWeight}
          onChange={v => setForm(p => ({ ...p, qualityWeight: v }))}
        />
        <SliderField
          label={`משקל אמינות: ${form.reliabilityWeight}`}
          value={form.reliabilityWeight}
          onChange={v => setForm(p => ({ ...p, reliabilityWeight: v }))}
        />

        <h4 style={{ color: '#F6F7F9', fontSize: 12, marginBottom: 10, marginTop: 16 }}>ספי התראה (רווח גולמי %)</h4>
        <FormField
          label="סף עסקה טובה (מעל ___%)"
          type="number"
          value={form.goodMarginThreshold.toString()}
          onChange={v => setForm(p => ({ ...p, goodMarginThreshold: Number(v) }))}
        />
        <FormField
          label="סף עסקה גרועה (מתחת ___%)"
          type="number"
          value={form.badMarginThreshold.toString()}
          onChange={v => setForm(p => ({ ...p, badMarginThreshold: Number(v) }))}
        />

        <h4 style={{ color: '#F6F7F9', fontSize: 12, marginBottom: 10, marginTop: 16 }}>תנאי ברירת מחדל</h4>
        <FormField
          label="תנאי תשלום"
          value={form.defaultPaymentTerms}
          onChange={v => setForm(p => ({ ...p, defaultPaymentTerms: v }))}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ABB3BF', fontSize: 11, marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={form.includeVat}
            onChange={e => setForm(p => ({ ...p, includeVat: e.target.checked }))}
          />
          כלול מע"מ בהזמנת עבודה
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ABB3BF', fontSize: 11, marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={form.autoSendToContractor}
            onChange={e => setForm(p => ({ ...p, autoSendToContractor: e.target.checked }))}
          />
          שלח אוטומטית לקבלן לאחר החלטה
        </label>

        <button onClick={() => onSave(form)} style={{ ...btnStyle('#3DCC91'), width: '100%' }}>
          💾 שמור הגדרות
        </button>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════════

function DecisionDetail({ decision, onClose }: { decision: SubcontractorDecision; onClose: () => void }) {
  const [msg, setMsg] = useState(formatWorkOrderMessage(decision));

  const sendVia = (via: 'whatsapp' | 'email' | 'sms') => {
    DecisionStore.markAsSent(decision.id, via);
    alert(`סומן כנשלח דרך ${via}`);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#2F343C',
          border: '1px solid rgba(255,255,255,0.1)',
          width: '90%',
          maxWidth: 900,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#F6F7F9', fontSize: 14, fontWeight: 600 }}>
            {decision.projectName}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#5C7080', fontSize: 18, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <AlertBanner level={decision.alertLevel} message={decision.alertMessage} />

          <h4 style={{ color: '#F6F7F9', fontSize: 12, marginTop: 12, marginBottom: 8 }}>🧠 הנמקת AI</h4>
          <pre
            style={{
              background: '#1C2127',
              color: '#ABB3BF',
              padding: 12,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}
          >
            {decision.reasoning.join('\n')}
          </pre>

          <h4 style={{ color: '#F6F7F9', fontSize: 12, marginTop: 16, marginBottom: 8 }}>📄 הזמנת עבודה</h4>
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            rows={18}
            style={{
              width: '100%',
              background: '#1C2127',
              color: '#F6F7F9',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: 12,
              fontSize: 11,
              fontFamily: 'monospace',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => sendVia('whatsapp')} style={{ ...btnStyle('#25D366'), flex: 1 }}>
              📱 שלח ב-WhatsApp
            </button>
            <button onClick={() => sendVia('email')} style={{ ...btnStyle('#48AFF0'), flex: 1 }}>
              📧 שלח באימייל
            </button>
            <button onClick={() => sendVia('sms')} style={{ ...btnStyle('#9D4EDD'), flex: 1 }}>
              📧 SMS
            </button>
          </div>
        </div>
      </div>
    </div>
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

function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 10, color: '#ABB3BF', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
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

function AlertBadge({ level }: { level: 'info' | 'warning' | 'critical' }) {
  const cfg = {
    info: { color: '#3DCC91', label: 'טוב' },
    warning: { color: '#FFB366', label: 'בינוני' },
    critical: { color: '#FC8585', label: 'קריטי' },
  }[level];
  return (
    <span
      style={{
        color: cfg.color,
        border: `1px solid ${cfg.color}40`,
        padding: '2px 7px',
        fontSize: 9,
        letterSpacing: '0.08em',
      }}
    >
      {cfg.label}
    </span>
  );
}

function AlertBanner({ level, message }: { level: 'info' | 'warning' | 'critical'; message: string }) {
  const cfg = {
    info: { bg: 'rgba(61,204,145,0.08)', border: '#3DCC91' },
    warning: { bg: 'rgba(255,179,102,0.08)', border: '#FFB366' },
    critical: { bg: 'rgba(252,133,133,0.08)', border: '#FC8585' },
  }[level];
  return (
    <div
      style={{
        padding: 12,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.border,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {message}
    </div>
  );
}
