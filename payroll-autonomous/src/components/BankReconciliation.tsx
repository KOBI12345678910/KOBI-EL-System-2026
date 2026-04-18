/**
 * BankReconciliation — פיוס בנקאי
 * 3-step wizard: Upload → Auto-match → Summary
 */

import React, { useState } from 'react';

interface BankTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  matchedId?: string;
  status: 'matched' | 'unmatched' | 'ignored' | 'manual';
}

interface SystemTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'invoice' | 'po' | 'payment';
  matchedId?: string;
}

const BANK_TXS: BankTx[] = [
  { id: 'b1',  date: '2026-04-01', description: 'העברה מלקוח ABC',          amount:  12500,  matchedId: 's1',  status: 'matched'   },
  { id: 'b2',  date: '2026-04-02', description: 'תשלום ספק מהיר',           amount: -8200,   matchedId: 's2',  status: 'matched'   },
  { id: 'b3',  date: '2026-04-03', description: 'העברה — פרויקט ביתא',      amount:  34000,  matchedId: 's3',  status: 'matched'   },
  { id: 'b4',  date: '2026-04-04', description: 'חיוב שכר דירה',            amount: -6500,   matchedId: 's4',  status: 'matched'   },
  { id: 'b5',  date: '2026-04-05', description: 'קבלה מלקוח XYZ',           amount:  19800,  matchedId: 's5',  status: 'matched'   },
  { id: 'b6',  date: '2026-04-07', description: 'תשלום ציוד משרדי',         amount: -1250,   matchedId: 's6',  status: 'matched'   },
  { id: 'b7',  date: '2026-04-08', description: 'העברה — לקוח גמא',         amount:  27300,  matchedId: 's7',  status: 'matched'   },
  { id: 'b8',  date: '2026-04-09', description: 'חיוב חשמל',                amount: -2100,   matchedId: 's8',  status: 'matched'   },
  { id: 'b9',  date: '2026-04-10', description: 'קבלה פרויקט דלתא',         amount:  45600,  matchedId: 's9',  status: 'matched'   },
  { id: 'b10', date: '2026-04-11', description: 'תשלום מנוי תוכנה',         amount: -890,    matchedId: 's10', status: 'matched'   },
  { id: 'b11', date: '2026-04-12', description: 'עמלת בנק',                 amount: -150,                      status: 'unmatched' },
  { id: 'b12', date: '2026-04-13', description: 'העברה לא מזוהה #7721',     amount:  5500,                     status: 'unmatched' },
  { id: 'b13', date: '2026-04-14', description: 'עמלת כרטיס אשראי',        amount: -320,                      status: 'unmatched' },
  { id: 'b14', date: '2026-04-15', description: 'זיכוי ריבית',              amount:  88,                       status: 'unmatched' },
  { id: 'b15', date: '2026-04-16', description: 'החזר הוצאה — קובי',        amount:  400,                      status: 'unmatched' },
];

const SYSTEM_TXS: SystemTx[] = [
  { id: 's1',  date: '2026-04-01', description: 'חשבונית #1041 — ABC',      amount:  12500,  type: 'invoice', matchedId: 'b1'  },
  { id: 's2',  date: '2026-04-02', description: 'הזמנת רכש #PO-220',        amount: -8200,   type: 'po',      matchedId: 'b2'  },
  { id: 's3',  date: '2026-04-03', description: 'חשבונית #1042 — ביתא',     amount:  34000,  type: 'invoice', matchedId: 'b3'  },
  { id: 's4',  date: '2026-04-04', description: 'שכר דירה מרץ',             amount: -6500,   type: 'po',      matchedId: 'b4'  },
  { id: 's5',  date: '2026-04-05', description: 'חשבונית #1043 — XYZ',      amount:  19800,  type: 'invoice', matchedId: 'b5'  },
  { id: 's6',  date: '2026-04-07', description: 'חשבונית ספק ציוד',         amount: -1250,   type: 'po',      matchedId: 'b6'  },
  { id: 's7',  date: '2026-04-08', description: 'חשבונית #1044 — גמא',      amount:  27300,  type: 'invoice', matchedId: 'b7'  },
  { id: 's8',  date: '2026-04-09', description: 'חשבונית חשמל Q1',          amount: -2100,   type: 'po',      matchedId: 'b8'  },
  { id: 's9',  date: '2026-04-10', description: 'חשבונית #1045 — דלתא',     amount:  45600,  type: 'invoice', matchedId: 'b9'  },
  { id: 's10', date: '2026-04-11', description: 'מנוי תוכנה אפריל',         amount: -890,    type: 'po',      matchedId: 'b10' },
  { id: 's11', date: '2026-04-14', description: 'חשבונית #1046 — עמית בע"מ', amount: 5500,   type: 'invoice' },
  { id: 's12', date: '2026-04-15', description: 'הוצאה כללית Q1',           amount: -320,    type: 'po'       },
];

const S = {
  wrap: { padding: 24, fontFamily: '-apple-system,"Segoe UI",Heebo,sans-serif', direction: 'rtl' as const, color: '#e6edf3', background: '#0b0d10', minHeight: '100vh' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#fff' },
  steps: { display: 'flex', gap: 0, marginBottom: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid #2a3340' },
  step: (active: boolean, done: boolean) => ({
    flex: 1, padding: '10px 16px', textAlign: 'center' as const, fontSize: 13,
    background: active ? '#4a9eff' : done ? '#1a3a1a' : '#13171c',
    color: active ? '#fff' : done ? '#3fb950' : '#8b96a5',
    fontWeight: active ? 700 : 400, cursor: 'pointer',
    borderLeft: '1px solid #2a3340',
  }),
  panel: { background: '#13171c', border: '1px solid #2a3340', borderRadius: 6, padding: 20, marginBottom: 16 },
  row: { display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' },
  col2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  colHeader: { fontSize: 12, fontWeight: 700, color: '#8b96a5', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 },
  txRow: (status: string) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
    borderRadius: 4, marginBottom: 6,
    background: status === 'matched' ? 'rgba(63,185,80,0.08)' : status === 'unmatched' ? 'rgba(248,81,73,0.08)' : '#1a2028',
    border: `1px solid ${status === 'matched' ? 'rgba(63,185,80,0.3)' : status === 'unmatched' ? 'rgba(248,81,73,0.3)' : '#2a3340'}`,
    fontSize: 13,
  }),
  badge: (color: string) => ({ background: color, borderRadius: 3, padding: '2px 7px', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }),
  btnPrimary: { background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  btnSecondary: { background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340', borderRadius: 4, padding: '8px 14px', cursor: 'pointer', fontSize: 13 },
  btnSuccess: { background: '#1a7f37', color: '#fff', border: 'none', borderRadius: 4, padding: '12px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 700 },
  select: { background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340', borderRadius: 4, padding: '6px 10px', fontSize: 13 },
  stat: { background: '#1a2028', borderRadius: 6, padding: '14px 20px', border: '1px solid #2a3340', textAlign: 'center' as const },
  statLabel: { fontSize: 11, color: '#8b96a5', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: 700 },
};

export default function BankReconciliation() {
  const [step, setStep] = useState(1);
  const [bankTxs, setBankTxs] = useState<BankTx[]>(BANK_TXS);
  const [manualMatch, setManualMatch] = useState<Record<string, string>>({});
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const matched = bankTxs.filter(t => t.status === 'matched').length;
  const manualMatched = Object.keys(manualMatch).length;
  const unmatched = bankTxs.filter(t => t.status === 'unmatched' && !manualMatch[t.id] && !ignored.has(t.id)).length;

  const balanceAfter = bankTxs.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0);

  const handleManualMatch = (bankId: string, sysId: string) => {
    setManualMatch(prev => ({ ...prev, [bankId]: sysId }));
  };

  const handleIgnore = (bankId: string) => {
    setIgnored(prev => new Set([...prev, bankId]));
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await fetch('/api/finance/reconciliation/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matched, manualMatched, unmatched, balanceAfter }),
      }).catch(() => null);
      setClosed(true);
    } finally {
      setClosing(false);
    }
  };

  if (closed) {
    return (
      <div style={S.wrap}>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#3fb950', marginTop: 16 }}>הפיוס הבנקאי נסגר בהצלחה!</div>
          <div style={{ color: '#8b96a5', marginTop: 8 }}>יתרה לאחר פיוס: ₪{balanceAfter.toLocaleString('he-IL')}</div>
          <button style={{ ...S.btnPrimary, marginTop: 24 }} onClick={() => { setClosed(false); setStep(1); }}>פיוס חדש</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>🏦 פיוס בנקאי</div>

      {/* Steps bar */}
      <div style={S.steps}>
        {[
          { n: 1, label: 'שלב 1: העלה דף חשבון' },
          { n: 2, label: 'שלב 2: השוואה אוטומטית' },
          { n: 3, label: 'שלב 3: סיכום פיוס' },
        ].map(s => (
          <div key={s.n} style={S.step(step === s.n, step > s.n)} onClick={() => setStep(s.n)}>
            {step > s.n ? '✅ ' : ''}{s.label}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div>
          <div style={S.panel}>
            <div style={S.colHeader}>העלה דף חשבון בנק</div>
            <div style={{ ...S.row, flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ border: '2px dashed #2a3340', borderRadius: 8, padding: '32px 40px', textAlign: 'center', width: '100%', cursor: 'pointer' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ color: '#8b96a5', fontSize: 14 }}>גרור ושחרר קובץ CSV / Excel / OFX</div>
                <div style={{ color: '#4a9eff', fontSize: 13, marginTop: 8 }}>או לחץ לבחירת קובץ</div>
                <input type="file" accept=".csv,.xlsx,.ofx" style={{ display: 'none' }} />
              </div>
              <div style={{ color: '#8b96a5', fontSize: 13, alignSelf: 'center' }}>— או הזן ידנית —</div>
            </div>
          </div>

          <div style={S.panel}>
            <div style={S.colHeader}>פרטי חשבון (מדגם)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { label: 'מספר חשבון', value: '123-456-789' },
                { label: 'תקופה', value: 'אפריל 2026' },
                { label: 'יתרת פתיחה', value: '₪182,450' },
                { label: 'יתרת סגירה', value: '₪307,828' },
              ].map(f => (
                <div key={f.label} style={S.stat}>
                  <div style={S.statLabel}>{f.label}</div>
                  <div style={{ ...S.statValue, fontSize: 16, color: '#4a9eff' }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>

          <button style={S.btnPrimary} onClick={() => setStep(2)}>המשך להשוואה →</button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <div style={S.col2}>
            {/* Bank column */}
            <div style={S.panel}>
              <div style={S.colHeader}>עסקאות בנק ({bankTxs.length})</div>
              {bankTxs.map(tx => {
                const isManual = !!manualMatch[tx.id];
                const isIgnored = ignored.has(tx.id);
                const status = tx.status === 'matched' ? 'matched' : isManual ? 'matched' : isIgnored ? 'ignored' : 'unmatched';
                const unmatchedSys = SYSTEM_TXS.filter(s => !s.matchedId && !Object.values(manualMatch).includes(s.id));
                return (
                  <div key={tx.id} style={S.txRow(status)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{tx.description}</div>
                      <div style={{ color: '#8b96a5', fontSize: 11 }}>{tx.date}</div>
                    </div>
                    <div style={{ color: tx.amount > 0 ? '#3fb950' : '#f85149', fontWeight: 700, minWidth: 80, textAlign: 'left' as const }}>
                      {tx.amount > 0 ? '+' : ''}₪{Math.abs(tx.amount).toLocaleString('he-IL')}
                    </div>
                    {status === 'matched' && <span style={S.badge('#3fb950')}>✅</span>}
                    {status === 'unmatched' && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, alignItems: 'flex-end' }}>
                        <span style={S.badge('#d29922')}>⚠️</span>
                        <select style={S.select} value={manualMatch[tx.id] || ''} onChange={e => handleManualMatch(tx.id, e.target.value)}>
                          <option value="">התאם ידנית...</option>
                          {unmatchedSys.map(s => <option key={s.id} value={s.id}>{s.description} — ₪{Math.abs(s.amount).toLocaleString('he-IL')}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ ...S.btnSecondary, fontSize: 11, padding: '3px 8px' }} onClick={() => handleIgnore(tx.id)}>התעלם</button>
                          <button style={{ ...S.btnSecondary, fontSize: 11, padding: '3px 8px' }}>+ צור עסקה</button>
                        </div>
                      </div>
                    )}
                    {status === 'ignored' && <span style={S.badge('#5c7080')}>דלג</span>}
                  </div>
                );
              })}
            </div>

            {/* System column */}
            <div style={S.panel}>
              <div style={S.colHeader}>עסקאות מערכת ({SYSTEM_TXS.length})</div>
              {SYSTEM_TXS.map(tx => {
                const isMatched = !!tx.matchedId || Object.values(manualMatch).includes(tx.id);
                return (
                  <div key={tx.id} style={S.txRow(isMatched ? 'matched' : 'unmatched')}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{tx.description}</div>
                      <div style={{ color: '#8b96a5', fontSize: 11 }}>{tx.date} · {tx.type === 'invoice' ? 'חשבונית' : 'הזמנת רכש'}</div>
                    </div>
                    <div style={{ color: tx.amount > 0 ? '#3fb950' : '#f85149', fontWeight: 700, minWidth: 80, textAlign: 'left' as const }}>
                      {tx.amount > 0 ? '+' : ''}₪{Math.abs(tx.amount).toLocaleString('he-IL')}
                    </div>
                    {isMatched ? <span style={S.badge('#3fb950')}>✅</span> : <span style={S.badge('#d29922')}>⚠️</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button style={S.btnSecondary} onClick={() => setStep(1)}>← חזור</button>
            <button style={S.btnPrimary} onClick={() => setStep(3)}>המשך לסיכום →</button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
            <div style={S.stat}>
              <div style={S.statLabel}>הותאמו אוטומטית</div>
              <div style={{ ...S.statValue, color: '#3fb950' }}>{matched}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>עסקאות</div>
            </div>
            <div style={S.stat}>
              <div style={S.statLabel}>הותאמו ידנית</div>
              <div style={{ ...S.statValue, color: '#4a9eff' }}>{manualMatched}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>עסקאות</div>
            </div>
            <div style={S.stat}>
              <div style={S.statLabel}>ממתינות לבירור</div>
              <div style={{ ...S.statValue, color: '#d29922' }}>{unmatched}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>עסקאות</div>
            </div>
          </div>

          <div style={{ ...S.panel, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#8b96a5', marginBottom: 8 }}>יתרה לאחר פיוס</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#3fb950' }}>₪{balanceAfter.toLocaleString('he-IL')}</div>
          </div>

          {unmatched > 0 && (
            <div style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.4)', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#d29922' }}>
              ⚠️ קיימות {unmatched} עסקאות שטרם טופלו. ניתן לאשר ולטפל בהן מאוחר יותר.
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button style={S.btnSecondary} onClick={() => setStep(2)}>← חזור להשוואה</button>
            <button style={S.btnSuccess} onClick={handleClose} disabled={closing}>
              {closing ? 'שומר...' : '✅ אשר וסגור פיוס'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
