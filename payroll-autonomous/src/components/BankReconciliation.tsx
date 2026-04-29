/**
 * BankReconciliation — פיוס בנקאי
 * 3-step wizard: Upload -> Auto-match -> Summary
 *
 * Agent 227 wiring: hits the engine-backed
 *   POST /api/finance/reconciliation/start
 *   POST /api/finance/reconciliation/:id/import
 *   POST /api/finance/reconciliation/:id/auto-match
 *   GET  /api/finance/reconciliation/:id
 *   POST /api/finance/reconciliation/:id/manual-match
 *   POST /api/finance/reconciliation/:id/adjustment
 *   POST /api/finance/reconciliation/:id/complete
 * No more BANK_TXS / SYSTEM_TXS hardcoded constants.
 */

import React, { useEffect, useState } from 'react';

interface BankEntry {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  reference?: string;
  _matched?: boolean;
  _match_id?: string | null;
}

interface GLEntry {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  counterparty_name?: string;
  _matched?: boolean;
  _match_id?: string | null;
}

interface ReconStatus {
  matched_count: number;
  unmatched_count: number;
  unmatched_bank_count: number;
  unmatched_gl_count: number;
  suspicious_count: number;
  adjustments_count: number;
  difference: number;
  is_balanced: boolean;
  reconciled_balance: number;
  statement_closing_balance: number;
}

interface BankAccount {
  id: number;
  account_name: string;
  bank_name: string;
  account_number: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthAgoISO = () => new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);

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
  input: { background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340', borderRadius: 4, padding: '6px 10px', fontSize: 13 },
  stat: { background: '#1a2028', borderRadius: 6, padding: '14px 20px', border: '1px solid #2a3340', textAlign: 'center' as const },
  statLabel: { fontSize: 11, color: '#8b96a5', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: 700 },
  err: { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149', padding: '10px 14px', borderRadius: 4, marginBottom: 12, fontSize: 13 },
};

export default function BankReconciliation() {
  const [step, setStep] = useState(1);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState<number | ''>('');
  const [periodFrom, setPeriodFrom] = useState<string>(monthAgoISO());
  const [periodTo, setPeriodTo] = useState<string>(todayISO());

  const [reconId, setReconId] = useState<string | null>(null);
  const [bankTxs, setBankTxs] = useState<BankEntry[]>([]);
  const [systemTxs, setSystemTxs] = useState<GLEntry[]>([]);
  const [stats, setStats] = useState<ReconStatus | null>(null);

  const [manualMatch, setManualMatch] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load bank account list at mount
  useEffect(() => {
    let alive = true;
    fetch('/api/bank/accounts')
      .then(r => r.json())
      .then(d => { if (alive) setAccounts(d.accounts || []); })
      .catch(() => { /* leave empty */ });
    return () => { alive = false; };
  }, []);

  const refreshSnapshot = async (id: string) => {
    const snap = await fetch(`/api/finance/reconciliation/${id}`).then(r => r.json());
    setBankTxs(snap.bank_entries || []);
    setSystemTxs(snap.gl_entries || []);
    if (snap.status) setStats(snap.status);
  };

  // Step 1 -> 2: open session, optionally import a file
  const startSession = async (file?: File | null) => {
    if (!accountId) { setErr('בחר חשבון בנק תחילה'); return; }
    setErr(null); setBusy(true);
    try {
      const startR = await fetch('/api/finance/reconciliation/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_account_id: accountId, period: { from: periodFrom, to: periodTo } }),
      });
      const startBody = await startR.json();
      if (!startR.ok) throw new Error(startBody.error || 'failed to start session');

      const id: string = startBody.recon_id;
      setReconId(id);

      if (file) {
        const text = await file.text();
        const impR = await fetch(`/api/finance/reconciliation/${id}/import`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text, format: 'auto' }),
        });
        if (!impR.ok) {
          const b = await impR.json().catch(() => ({}));
          throw new Error(b.error || 'import failed');
        }
      }
      setStep(2);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  // Step 2 effect: run auto-match the first time we land here, then load snapshot
  useEffect(() => {
    if (step !== 2 || !reconId) return;
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const ar = await fetch(`/api/finance/reconciliation/${reconId}/auto-match`, { method: 'POST' });
        const ab = await ar.json();
        if (!alive) return;
        if (!ar.ok) throw new Error(ab.error || 'auto-match failed');
        if (ab.status) setStats(ab.status);
        await refreshSnapshot(reconId);
      } catch (e: any) {
        if (alive) setErr(e.message || String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [step, reconId]);

  const handleManualMatch = async (bankId: string, glId: string) => {
    if (!reconId || !glId) return;
    try {
      const r = await fetch(`/api/finance/reconciliation/${reconId}/manual-match`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankEntryId: bankId, glEntryId: glId }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'manual match failed');
      setManualMatch(prev => ({ ...prev, [bankId]: glId }));
      if (b.status) setStats(b.status);
      await refreshSnapshot(reconId);
    } catch (e: any) { setErr(e.message || String(e)); }
  };

  const handleAdjustment = async (bankId: string, kind: string) => {
    if (!reconId) return;
    const be = bankTxs.find(b => b.id === bankId);
    if (!be) return;
    try {
      const r = await fetch(`/api/finance/reconciliation/${reconId}/adjustment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, amount: be.amount, date: be.transaction_date,
          description: be.description, bank_entry_id: be.id,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'adjustment failed');
      if (b.status) setStats(b.status);
      await refreshSnapshot(reconId);
    } catch (e: any) { setErr(e.message || String(e)); }
  };

  const handleClose = async () => {
    if (!reconId) return;
    setClosing(true);
    try {
      const r = await fetch(`/api/finance/reconciliation/${reconId}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: (window as any).__currentUserId || 'ui' }),
      });
      const b = await r.json();
      if (r.ok) setClosed(true);
      else setErr(b.error || 'complete failed');
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setClosing(false);
    }
  };

  const matchedCount = stats ? stats.matched_count : 0;
  const manualCount = Object.keys(manualMatch).length;
  const unmatchedCount = stats ? stats.unmatched_count : 0;

  if (closed) {
    return (
      <div style={S.wrap}>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#3fb950', marginTop: 16 }}>הפיוס הבנקאי נסגר בהצלחה!</div>
          {stats && (
            <div style={{ color: '#8b96a5', marginTop: 8 }}>
              יתרה לאחר פיוס: ₪{stats.reconciled_balance.toLocaleString('he-IL')}
            </div>
          )}
          <button style={{ ...S.btnPrimary, marginTop: 24 }} onClick={() => {
            setClosed(false); setStep(1); setReconId(null); setBankTxs([]); setSystemTxs([]);
            setStats(null); setManualMatch({});
          }}>פיוס חדש</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>🏦 פיוס בנקאי</div>

      {err && <div style={S.err}>{err}</div>}

      {/* Steps bar */}
      <div style={S.steps}>
        {[
          { n: 1, label: 'שלב 1: העלה דף חשבון' },
          { n: 2, label: 'שלב 2: השוואה אוטומטית' },
          { n: 3, label: 'שלב 3: סיכום פיוס' },
        ].map(s => (
          <div key={s.n} style={S.step(step === s.n, step > s.n)} onClick={() => reconId && setStep(s.n)}>
            {step > s.n ? '✅ ' : ''}{s.label}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div>
          <div style={S.panel}>
            <div style={S.colHeader}>בחר חשבון ותקופה</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#8b96a5', marginBottom: 4 }}>חשבון בנק</div>
                <select style={{ ...S.select, width: '100%' }}
                        value={accountId}
                        onChange={e => setAccountId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— בחר —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.account_name} · {a.bank_name} · {a.account_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8b96a5', marginBottom: 4 }}>מתאריך</div>
                <input type="date" style={{ ...S.input, width: '100%' }}
                       value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8b96a5', marginBottom: 4 }}>עד תאריך</div>
                <input type="date" style={{ ...S.input, width: '100%' }}
                       value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
              </div>
            </div>
          </div>

          <div style={S.panel}>
            <div style={S.colHeader}>העלה דף חשבון בנק</div>
            <div style={{ ...S.row, flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
              <label style={{ border: '2px dashed #2a3340', borderRadius: 8, padding: '32px 40px', textAlign: 'center', width: '100%', cursor: 'pointer', display: 'block' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ color: '#8b96a5', fontSize: 14 }}>גרור ושחרר קובץ CSV / Excel / OFX</div>
                <div style={{ color: '#4a9eff', fontSize: 13, marginTop: 8 }}>או לחץ לבחירת קובץ</div>
                <input type="file" accept=".csv,.xlsx,.ofx,.xml,.qif" style={{ display: 'none' }}
                       onChange={e => {
                         const f = e.target.files && e.target.files[0];
                         if (f) startSession(f);
                       }} />
              </label>
              <div style={{ color: '#8b96a5', fontSize: 13, alignSelf: 'center' }}>— או —</div>
              <button style={S.btnSecondary} disabled={busy || !accountId}
                      onClick={() => startSession(null)}>
                התחל ללא קובץ (טען מתנועות קיימות)
              </button>
            </div>
          </div>

          {reconId && (
            <button style={S.btnPrimary} onClick={() => setStep(2)} disabled={busy}>
              המשך להשוואה →
            </button>
          )}
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          {busy && <div style={{ color: '#8b96a5', fontSize: 13, marginBottom: 12 }}>טוען נתונים...</div>}
          <div style={S.col2}>
            {/* Bank column */}
            <div style={S.panel}>
              <div style={S.colHeader}>עסקאות בנק ({bankTxs.length})</div>
              {bankTxs.map(tx => {
                const isMatched = !!tx._matched || !!manualMatch[tx.id];
                const status = isMatched ? 'matched' : 'unmatched';
                const unmatchedSys = systemTxs.filter(s => !s._matched && !Object.values(manualMatch).includes(s.id));
                return (
                  <div key={tx.id} style={S.txRow(status)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{tx.description}</div>
                      <div style={{ color: '#8b96a5', fontSize: 11 }}>{tx.transaction_date}</div>
                    </div>
                    <div style={{ color: tx.amount > 0 ? '#3fb950' : '#f85149', fontWeight: 700, minWidth: 80, textAlign: 'start' as const }}>
                      {tx.amount > 0 ? '+' : ''}₪{Math.abs(tx.amount).toLocaleString('he-IL')}
                    </div>
                    {isMatched && <span style={S.badge('#3fb950')}>✅</span>}
                    {!isMatched && (
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, alignItems: 'flex-end' }}>
                        <span style={S.badge('#d29922')}>⚠️</span>
                        <select style={S.select} value={manualMatch[tx.id] || ''}
                                onChange={e => handleManualMatch(tx.id, e.target.value)}>
                          <option value="">התאם ידנית...</option>
                          {unmatchedSys.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.description} — ₪{Math.abs(s.amount).toLocaleString('he-IL')}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ ...S.btnSecondary, fontSize: 11, padding: '3px 8px' }}
                                  onClick={() => handleAdjustment(tx.id, 'BANK_FEE')}>עמלה</button>
                          <button style={{ ...S.btnSecondary, fontSize: 11, padding: '3px 8px' }}
                                  onClick={() => handleAdjustment(tx.id, 'INTEREST')}>ריבית</button>
                          <button style={{ ...S.btnSecondary, fontSize: 11, padding: '3px 8px' }}
                                  onClick={() => handleAdjustment(tx.id, 'OTHER')}>אחר</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {bankTxs.length === 0 && !busy && (
                <div style={{ color: '#8b96a5', fontSize: 13, padding: '16px 8px' }}>אין עסקאות לתצוגה</div>
              )}
            </div>

            {/* System column */}
            <div style={S.panel}>
              <div style={S.colHeader}>עסקאות מערכת ({systemTxs.length})</div>
              {systemTxs.map(tx => {
                const isMatched = !!tx._matched || Object.values(manualMatch).includes(tx.id);
                return (
                  <div key={tx.id} style={S.txRow(isMatched ? 'matched' : 'unmatched')}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{tx.description}</div>
                      <div style={{ color: '#8b96a5', fontSize: 11 }}>{tx.transaction_date}{tx.counterparty_name ? ' · ' + tx.counterparty_name : ''}</div>
                    </div>
                    <div style={{ color: tx.amount > 0 ? '#3fb950' : '#f85149', fontWeight: 700, minWidth: 80, textAlign: 'start' as const }}>
                      {tx.amount > 0 ? '+' : ''}₪{Math.abs(tx.amount).toLocaleString('he-IL')}
                    </div>
                    {isMatched ? <span style={S.badge('#3fb950')}>✅</span> : <span style={S.badge('#d29922')}>⚠️</span>}
                  </div>
                );
              })}
              {systemTxs.length === 0 && !busy && (
                <div style={{ color: '#8b96a5', fontSize: 13, padding: '16px 8px' }}>אין עסקאות לתצוגה</div>
              )}
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
              <div style={S.statLabel}>הותאמו</div>
              <div style={{ ...S.statValue, color: '#3fb950' }}>{matchedCount}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>עסקאות</div>
            </div>
            <div style={S.stat}>
              <div style={S.statLabel}>ידנית</div>
              <div style={{ ...S.statValue, color: '#4a9eff' }}>{manualCount}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>עסקאות</div>
            </div>
            <div style={S.stat}>
              <div style={S.statLabel}>חשודות</div>
              <div style={{ ...S.statValue, color: '#d29922' }}>{stats ? stats.suspicious_count : 0}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>התאמות</div>
            </div>
          </div>

          <div style={{ ...S.panel, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#8b96a5', marginBottom: 8 }}>יתרת פיוס</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: stats && stats.is_balanced ? '#3fb950' : '#d29922' }}>
              ₪{stats ? stats.reconciled_balance.toLocaleString('he-IL') : '—'}
            </div>
            {stats && (
              <div style={{ fontSize: 12, color: '#8b96a5', marginTop: 8 }}>
                יתרה בדף חשבון: ₪{stats.statement_closing_balance.toLocaleString('he-IL')} ·
                הפרש: ₪{stats.difference.toLocaleString('he-IL')} ·
                {stats.is_balanced ? ' מאוזן ✓' : ' לא מאוזן ✗'}
              </div>
            )}
          </div>

          {unmatchedCount > 0 && (
            <div style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.4)', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#d29922' }}>
              ⚠️ קיימות {unmatchedCount} עסקאות שטרם טופלו. סיים אותן בשלב 2 לפני הסגירה.
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button style={S.btnSecondary} onClick={() => setStep(2)}>← חזור להשוואה</button>
            <button style={S.btnSuccess} onClick={handleClose}
                    disabled={closing || !stats || !stats.is_balanced || unmatchedCount > 0}>
              {closing ? 'שומר...' : '✅ אשר וסגור פיוס'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
