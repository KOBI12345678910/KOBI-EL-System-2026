import React, { useEffect, useState } from 'react';
import { useApi, api } from '../hooks/useApi';
import { formatDate } from '../utils/format';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:    { label: 'טיוטה',          color: '#5C7080' },
  sent:     { label: 'נשלח',           color: '#48AFF0' },
  viewed:   { label: 'נצפה',           color: '#FFB366' },
  signed:   { label: 'נחתם ✓',         color: '#3DCC91' },
  rejected: { label: 'נדחה ✗',         color: '#FC8585' },
  expired:  { label: 'פג תוקף',        color: '#5C7080' }
};

const TYPE_LABELS: Record<string, string> = {
  contract_client:   'חוזה לקוח',
  contract_employee: 'חוזה עובד',
  quote:             'הצעת מחיר',
  invoice_advance:   'חשבונית מקדמה',
  invoice_final:     'חשבונית סופית',
  nda:               'הסכם סודיות'
};

export function Documents() {
  const { data: docs, fetch } = useApi<any[]>('/api/signatures/documents');
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetch(); }, []);

  const loadDetail = async (id: string) => {
    const res = await api.get(`/api/signatures/documents/${id}`);
    setDetail(res.data);
    setSelected(res.data.document);
  };

  const sendDoc = async (id: string) => {
    await api.post(`/api/signatures/documents/${id}/send`, {});
    fetch();
    if (detail?.document?.id === id) loadDetail(id);
  };

  const remind = async (id: string) => {
    await api.post(`/api/signatures/documents/${id}/remind`, {});
    alert('תזכורת נשלחה');
  };

  const viewSigned = async (id: string) => {
    const res = await api.get(`/api/signatures/documents/${id}/signed`);
    const w = window.open('', '_blank');
    w?.document.write(res.data);
  };

  const filtered = (docs || []).filter(d => filter === 'all' || d.status === filter);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>מסמכים וחתימות</h1>
          <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginTop: 2 }}>
            DOCUMENTS & DIGITAL SIGNATURES
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setNewType('contract_client'); setShowNew(true); }}
            style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
            + חוזה לקוח
          </button>
          <button onClick={() => { setNewType('contract_employee'); setShowNew(true); }}
            style={{ background: 'rgba(72,175,240,0.1)', border: '1px solid #48AFF0', color: '#48AFF0', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
            + חוזה עובד
          </button>
          <button onClick={() => { setNewType('nda'); setShowNew(true); }}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#ABB3BF', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
            + NDA
          </button>
        </div>
      </div>

      {/* FILTER TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
        {['all', 'draft', 'sent', 'viewed', 'signed', 'rejected'].map(f => (
          <div key={f} onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px', cursor: 'pointer', fontSize: 12,
              color: filter === f ? '#FFA500' : '#5C7080',
              borderBottom: filter === f ? '2px solid #FFA500' : '2px solid transparent',
              marginBottom: -1
            }}>
            {f === 'all' ? 'הכל' : STATUS_CONFIG[f]?.label}
            <span style={{ marginRight: 6, fontSize: 10, color: '#3D4F6A' }}>
              ({(docs || []).filter(d => f === 'all' || d.status === f).length})
            </span>
          </div>
        ))}
      </div>

      {/* MAIN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 420px' : '1fr', gap: 12 }}>
        {/* LIST */}
        <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#383E47' }}>
                {['כותרת', 'סוג', 'נמענים', 'נחתמו', 'נוצר', 'סטטוס', ''].map(h => (
                  <th key={h} style={{ padding: '7px 14px', textAlign: 'right', fontSize: 10, color: '#5C7080', fontWeight: 400, letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc: any) => {
                const status = STATUS_CONFIG[doc.status] || { label: doc.status, color: '#5C7080' };
                const isSelected = selected?.id === doc.id;
                return (
                  <tr key={doc.id}
                    onClick={() => loadDetail(doc.id)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(255,165,0,0.06)' : 'transparent'
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#383E47'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = isSelected ? 'rgba(255,165,0,0.06)' : 'transparent'}
                  >
                    <td style={{ padding: '10px 14px', color: '#F6F7F9', fontWeight: 500 }}>{doc.title}</td>
                    <td style={{ padding: '10px 14px', color: '#ABB3BF', fontSize: 10 }}>
                      {TYPE_LABELS[doc.type] || doc.type}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#ABB3BF', textAlign: 'center' }}>
                      {doc.recipients_count}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ color: parseInt(doc.signatures_count) > 0 ? '#3DCC91' : '#5C7080' }}>
                        {doc.signatures_count}/{doc.recipients_count}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#5C7080', fontSize: 11 }}>
                      {formatDate(doc.created_at)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: status.color, border: `1px solid ${status.color}40`, padding: '2px 7px', fontSize: 10 }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        {doc.status === 'draft' && (
                          <button onClick={() => sendDoc(doc.id)}
                            style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>
                            שלח
                          </button>
                        )}
                        {['sent', 'viewed'].includes(doc.status) && (
                          <button onClick={() => remind(doc.id)}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ABB3BF', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>
                            תזכורת
                          </button>
                        )}
                        {doc.status === 'signed' && (
                          <button onClick={() => viewSigned(doc.id)}
                            style={{ background: 'rgba(61,204,145,0.1)', border: '1px solid #3DCC91', color: '#3DCC91', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>
                            הורד
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#5C7080' }}>
                    אין מסמכים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* DETAIL PANEL */}
        {detail && (
          <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#383E47', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#FFA500', fontFamily: 'monospace', fontSize: 12 }}>
                {TYPE_LABELS[detail.document?.type] || detail.document?.type}
              </span>
              <button onClick={() => { setSelected(null); setDetail(null); }}
                style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#F6F7F9', marginBottom: 16 }}>
                {detail.document?.title}
              </div>

              {/* RECIPIENTS */}
              <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.1em', marginBottom: 8 }}>נמענים</div>
              {detail.recipients?.map((r: any) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', marginBottom: 6,
                  background: '#383E47', border: `1px solid ${
                    r.status === 'signed' ? 'rgba(61,204,145,0.3)' :
                    r.status === 'rejected' ? 'rgba(252,133,133,0.3)' :
                    'rgba(255,255,255,0.06)'
                  }`
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 2,
                    background: r.status === 'signed' ? 'rgba(61,204,145,0.2)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                    color: r.status === 'signed' ? '#3DCC91' : '#5C7080'
                  }}>
                    {r.status === 'signed' ? '✓' : r.status === 'rejected' ? '✗' : r.signing_order}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 500 }}>{r.recipient_name}</div>
                    <div style={{ fontSize: 10, color: '#5C7080' }}>
                      {r.recipient_type === 'client' ? 'לקוח' : r.recipient_type === 'manager' ? 'הנהלה' : 'עובד'}
                      {r.recipient_phone && ` | ${r.recipient_phone}`}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, padding: '2px 6px',
                    border: `1px solid ${STATUS_CONFIG[r.status]?.color || '#5C7080'}40`,
                    color: STATUS_CONFIG[r.status]?.color || '#5C7080'
                  }}>
                    {STATUS_CONFIG[r.status]?.label || r.status}
                  </span>
                </div>
              ))}

              {/* SIGNATURES */}
              {detail.signatures?.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.1em', margin: '16px 0 8px' }}>חתימות</div>
                  {detail.signatures.map((sig: any) => (
                    <div key={sig.id} style={{ background: '#383E47', padding: 12, marginBottom: 8, border: '1px solid rgba(61,204,145,0.2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: '#3DCC91', fontWeight: 600 }}>{sig.recipient_name}</span>
                        <span style={{ fontSize: 10, color: '#5C7080' }}>
                          {new Date(sig.signed_at).toLocaleString('he-IL')}
                        </span>
                      </div>
                      <img src={sig.signature_data} alt="חתימה"
                        style={{ height: 60, background: '#fff', padding: 4, display: 'block', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <div style={{ fontSize: 10, color: '#3D4F6A', marginTop: 6 }}>
                        חתם: {sig.signed_name} | IP: {sig.ip_address || '—'}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* AUDIT LOG */}
              {detail.audit_log?.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.1em', margin: '16px 0 8px' }}>היסטוריה</div>
                  {detail.audit_log.slice(0, 8).map((log: any) => (
                    <div key={log.id} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>
                      <span style={{ color: '#3D4F6A', minWidth: 100 }}>
                        {new Date(log.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ color: '#ABB3BF' }}>{log.metadata?.description || log.action}</span>
                    </div>
                  ))}
                </>
              )}

              {/* ACTIONS */}
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.document?.status === 'draft' && (
                  <button onClick={() => sendDoc(detail.document.id)}
                    style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    📤 שלח לחתימה
                  </button>
                )}
                {['sent', 'viewed'].includes(detail.document?.status) && (
                  <button onClick={() => remind(detail.document.id)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#ABB3BF', padding: '10px', cursor: 'pointer', fontSize: 13 }}>
                    🔔 שלח תזכורת
                  </button>
                )}
                {detail.document?.status === 'signed' && (
                  <button onClick={() => viewSigned(detail.document.id)}
                    style={{ background: 'rgba(61,204,145,0.1)', border: '1px solid #3DCC91', color: '#3DCC91', padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    📄 הורד מסמך חתום
                  </button>
                )}
                <a href={`/api/signatures/verify/${detail.document?.id}`} target="_blank" rel="noreferrer"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#5C7080', padding: '8px', textAlign: 'center', textDecoration: 'none', fontSize: 11 }}>
                  🔍 אמת מסמך
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* NEW DOCUMENT MODAL */}
      {showNew && (
        <NewDocumentModal
          type={newType}
          onClose={() => { setShowNew(false); fetch(); }}
        />
      )}
    </div>
  );
}

// ── NEW DOCUMENT MODAL
function NewDocumentModal({ type, onClose }: { type: string; onClose: () => void }) {
  const [form, setForm] = useState<any>({ advancePct: 50, warrantyMonths: 24, employmentType: 'full', sendImmediately: true });
  const { data: clients } = useApi<any[]>('/api/clients');
  const { data: employees } = useApi<any[]>('/api/employees');
  const { data: projects } = useApi<any[]>('/api/pipeline');
  const [loading, setLoading] = useState(false);

  // Auto-fill from project
  useEffect(() => {
    if ((clients as any)?.fetch) (clients as any).fetch();
    if ((employees as any)?.fetch) (employees as any).fetch();
    if ((projects as any)?.fetch) (projects as any).fetch();
  }, []);

  const f = (field: string) => (e: any) =>
    setForm((p: any) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const endpoint = type === 'contract_client' ? '/api/signatures/documents/client-contract'
        : type === 'contract_employee' ? '/api/signatures/documents/employee-contract'
        : '/api/signatures/documents';
      await api.post(endpoint, form);
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', background: '#383E47',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#F6F7F9', padding: '7px 10px',
    fontSize: 12, outline: 'none',
    boxSizing: 'border-box' as const
  };

  const labelStyle = {
    fontSize: 10, color: '#5C7080',
    display: 'block', marginBottom: 4,
    letterSpacing: '0.1em'
  };

  const g2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.15)', width: 600, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#383E47' }}>
          <span style={{ color: '#FFA500', fontFamily: 'monospace', fontSize: 12 }}>
            // {type === 'contract_client' ? 'חוזה לקוח חדש' : type === 'contract_employee' ? 'חוזה עובד חדש' : 'מסמך חדש'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: 20 }}>

          {/* CLIENT CONTRACT */}
          {type === 'contract_client' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>פרוייקט</label>
                <select onChange={e => {
                  const p = (projects as any[])?.find((x: any) => x.id === e.target.value);
                  if (p) setForm((prev: any) => ({
                    ...prev, projectId: p.id, projectTitle: p.title,
                    projectAddress: p.address, totalPrice: p.total_price,
                    clientId: p.client_id, clientName: p.client_name,
                    clientPhone: p.client_phone
                  }));
                }} style={inputStyle}>
                  <option value="">בחר פרוייקט (אופציונלי)</option>
                  {((projects as any[]) || []).map((p: any) => <option key={p.id} value={p.id}>{p.project_number} — {p.title}</option>)}
                </select>
              </div>
              <div style={g2}>
                <div><label style={labelStyle}>שם לקוח</label><input value={form.clientName || ''} onChange={f('clientName')} style={inputStyle} /></div>
                <div><label style={labelStyle}>טלפון לקוח</label><input value={form.clientPhone || ''} onChange={f('clientPhone')} style={inputStyle} dir="ltr" /></div>
              </div>
              <div><label style={labelStyle}>כתובת לקוח</label><input value={form.clientAddress || ''} onChange={f('clientAddress')} style={inputStyle} /></div>
              <div><label style={labelStyle}>כותרת הפרוייקט</label><input value={form.projectTitle || ''} onChange={f('projectTitle')} style={inputStyle} /></div>
              <div><label style={labelStyle}>כתובת הפרוייקט</label><input value={form.projectAddress || ''} onChange={f('projectAddress')} style={inputStyle} /></div>
              <div style={g2}>
                <div><label style={labelStyle}>מחיר כולל ₪ (לפני מע"מ)</label><input type="number" value={form.totalPrice || ''} onChange={f('totalPrice')} style={inputStyle} /></div>
                <div><label style={labelStyle}>מקדמה %</label><input type="number" min="0" max="100" value={form.advancePct || 50} onChange={f('advancePct')} style={inputStyle} /></div>
              </div>
              <div style={g2}>
                <div><label style={labelStyle}>תאריך אספקה</label><input type="date" value={form.deliveryDate || ''} onChange={f('deliveryDate')} style={inputStyle} /></div>
                <div><label style={labelStyle}>אחריות (חודשים)</label><input type="number" value={form.warrantyMonths || 24} onChange={f('warrantyMonths')} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>תיאור נוסף</label><textarea value={form.description || ''} onChange={f('description')} rows={2} style={{ ...inputStyle, resize: 'none' }} /></div>
            </div>
          )}

          {/* EMPLOYEE CONTRACT */}
          {type === 'contract_employee' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>עובד</label>
                <select onChange={e => {
                  const emp = ((employees as any[]) || []).find((x: any) => x.id === e.target.value);
                  if (emp) setForm((prev: any) => ({
                    ...prev, employeeId: emp.id, employeeName: emp.name,
                    employeePhone: emp.phone, role: emp.role,
                    department: emp.department, salary: emp.salary
                  }));
                }} style={inputStyle}>
                  <option value="">בחר עובד (אופציונלי)</option>
                  {((employees as any[]) || []).map((e: any) => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
                </select>
              </div>
              <div style={g2}>
                <div><label style={labelStyle}>שם עובד</label><input value={form.employeeName || ''} onChange={f('employeeName')} style={inputStyle} /></div>
                <div><label style={labelStyle}>טלפון</label><input value={form.employeePhone || ''} onChange={f('employeePhone')} style={inputStyle} dir="ltr" /></div>
              </div>
              <div style={g2}>
                <div><label style={labelStyle}>תפקיד</label><input value={form.role || ''} onChange={f('role')} style={inputStyle} /></div>
                <div><label style={labelStyle}>מחלקה</label><input value={form.department || ''} onChange={f('department')} style={inputStyle} /></div>
              </div>
              <div style={g2}>
                <div><label style={labelStyle}>שכר ברוטו ₪</label><input type="number" value={form.salary || ''} onChange={f('salary')} style={inputStyle} /></div>
                <div><label style={labelStyle}>תאריך תחילה</label><input type="date" value={form.startDate || ''} onChange={f('startDate')} style={inputStyle} /></div>
              </div>
              <div>
                <label style={labelStyle}>סוג העסקה</label>
                <select value={form.employmentType || 'full'} onChange={f('employmentType')} style={inputStyle}>
                  <option value="full">משרה מלאה</option>
                  <option value="part">משרה חלקית</option>
                  <option value="subcontractor">קבלן משנה</option>
                </select>
              </div>
            </div>
          )}

          {/* NDA */}
          {type === 'nda' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>שם הצד השני</label>
                <input value={form.partyName || ''} onChange={f('partyName')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>סוג</label>
                <select value={form.partyType || 'client'} onChange={f('partyType')} style={inputStyle}>
                  <option value="client">לקוח</option>
                  <option value="supplier">ספק</option>
                  <option value="employee">עובד</option>
                  <option value="partner">שותף עסקי</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>טלפון</label>
                <input value={form.phone || ''} onChange={f('phone')} style={inputStyle} dir="ltr" />
              </div>
            </div>
          )}

          {/* SEND IMMEDIATELY */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="sendNow"
              checked={form.sendImmediately !== false}
              onChange={e => setForm((p: any) => ({ ...p, sendImmediately: e.target.checked }))}
              style={{ cursor: 'pointer' }} />
            <label htmlFor="sendNow" style={{ fontSize: 12, color: '#ABB3BF', cursor: 'pointer' }}>
              שלח מיד לחתימה לאחר יצירה
            </label>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          <button onClick={handleSubmit} disabled={loading}
            style={{ background: loading ? 'rgba(255,255,255,0.05)' : 'rgba(255,165,0,0.15)', border: '1px solid #FFA500', color: '#FFA500', padding: '10px 24px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
            {loading ? 'יוצר...' : form.sendImmediately !== false ? '✓ צור ושלח' : '✓ צור טיוטה'}
          </button>
          <button onClick={onClose}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ABB3BF', padding: '10px 16px', cursor: 'pointer', fontSize: 12 }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
