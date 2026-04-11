import React, { useEffect, useState } from 'react';
import { useApi, api } from '../hooks/useApi';

const STAGES = [
  { key: 'deal_closed',          label: 'עסקה נסגרה',        icon: '🤝', color: '#48AFF0' },
  { key: 'measurement_scheduled',label: 'מדידה תואמה',        icon: '📅', color: '#9D4EDD' },
  { key: 'measurement_done',     label: 'מדידה בוצעה',        icon: '📐', color: '#9D4EDD' },
  { key: 'contract_sent',        label: 'חוזה נשלח',          icon: '📄', color: '#FFB366' },
  { key: 'contract_signed',      label: 'חוזה נחתם',          icon: '✍️', color: '#FFB366' },
  { key: 'materials_ordered',    label: 'חומר הוזמן',         icon: '📦', color: '#FFA500' },
  { key: 'materials_arrived',    label: 'חומר הגיע',          icon: '✅', color: '#FFA500' },
  { key: 'production_assigned',  label: 'הוקצה לקבלן',        icon: '👷', color: '#48AFF0' },
  { key: 'production_started',   label: 'ייצור התחיל',        icon: '⚙️', color: '#48AFF0' },
  { key: 'production_done',      label: 'ייצור הסתיים',       icon: '🏗️', color: '#3DCC91' },
  { key: 'sent_to_paint',        label: 'נשלח לצביעה',        icon: '🚚', color: '#FC8585' },
  { key: 'returned_from_paint',  label: 'חזר מצביעה',         icon: '🎨', color: '#3DCC91' },
  { key: 'installation_scheduled',label:'התקנה תואמה',        icon: '📅', color: '#9D4EDD' },
  { key: 'installation_started', label: 'יצאה להתקנה',        icon: '🔧', color: '#48AFF0' },
  { key: 'installation_done',    label: 'התקנה הסתיימה',      icon: '✅', color: '#3DCC91' },
  { key: 'survey_sent',          label: 'סקר נשלח',           icon: '⭐', color: '#FFB366' },
  { key: 'payment_requested',    label: 'בקשת תשלום',         icon: '💳', color: '#FC8585' },
  { key: 'payment_received',     label: 'תשלום התקבל',        icon: '💰', color: '#3DCC91' },
  { key: 'project_closed',       label: 'פרוייקט נסגר',       icon: '🏆', color: '#5C7080' },
];

export function Pipeline() {
  const { data: projects, fetch } = useApi<any[]>('/api/pipeline');
  const [detail, setDetail] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => { fetch(); }, []);

  const loadDetail = async (id: string) => {
    const res = await api.get(`/api/pipeline/${id}`);
    setDetail(res.data);
  };

  const handleAdvance = async (stage: string) => {
    if (!detail) return;
    setAdvancing(true);
    try {
      await api.put(`/api/pipeline/${detail.id}/advance`, { stage });
      await loadDetail(detail.id);
      fetch();
    } finally {
      setAdvancing(false);
    }
  };

  const byStage = STAGES.reduce((acc, s) => {
    acc[s.key] = (projects || []).filter(p => p.current_stage === s.key);
    return acc;
  }, {} as Record<string, any[]>);

  const activeStages = STAGES.filter(s => byStage[s.key]?.length > 0);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>שרשרת אספקה</h1>
        <span style={{ fontSize: 11, color: '#5C7080' }}>SUPPLY CHAIN PIPELINE</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowNew(true)}
          style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500', padding: '6px 16px', cursor: 'pointer', fontSize: 12 }}
        >
          + פרוייקט חדש
        </button>
      </div>

      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {STAGES.map((s, i) => {
            const count = byStage[s.key]?.length || 0;
            const h = Math.max(20, count * 24 + 20);
            return (
              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 36 }}>
                <span style={{ fontSize: 9, color: '#5C7080', textAlign: 'center', lineHeight: 1.2 }}>
                  {count > 0 && <span style={{ color: s.color, fontWeight: 700, fontSize: 12, display: 'block' }}>{count}</span>}
                </span>
                <div
                  style={{
                    width: '100%', height: h,
                    background: count > 0 ? `${s.color}30` : 'rgba(255,255,255,0.03)',
                    borderTop: `2px solid ${count > 0 ? s.color : 'rgba(255,255,255,0.05)'}`,
                    cursor: count > 0 ? 'pointer' : 'default',
                    transition: 'height 0.3s',
                  }}
                  title={s.label}
                />
                <span style={{ fontSize: 8, color: '#3D4F6A', textAlign: 'center', lineHeight: 1.2, maxWidth: 40 }}>
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {STAGES.map(s => (
            <div key={s.key} style={{ flex: 1, fontSize: 7, color: '#3D4F6A', textAlign: 'center', lineHeight: 1.3, minWidth: 36 }}>
              {s.icon}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 480px' : '1fr', gap: 12 }}>
        <div>
          {activeStages.map(stage => (
            <div key={stage.key} style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                padding: '6px 0',
                borderBottom: `1px solid ${stage.color}40`
              }}>
                <span style={{ fontSize: 14 }}>{stage.icon}</span>
                <span style={{ fontSize: 11, color: stage.color, fontWeight: 600, letterSpacing: '0.08em' }}>
                  {stage.label}
                </span>
                <span style={{ fontSize: 10, color: '#5C7080', background: '#383E47', padding: '1px 7px', marginRight: 4 }}>
                  {byStage[stage.key]?.length}
                </span>
              </div>

              {byStage[stage.key]?.map((p: any) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  isSelected={detail?.id === p.id}
                  onClick={() => loadDetail(p.id)}
                />
              ))}
            </div>
          ))}

          {(projects || []).length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#5C7080' }}>
              אין פרוייקטים פעילים
            </div>
          )}
        </div>

        {detail && (
          <div style={{ position: 'sticky', top: 64 }}>
            <ProjectDetail
              project={detail}
              onClose={() => setDetail(null)}
              onAdvance={handleAdvance}
              advancing={advancing}
            />
          </div>
        )}
      </div>

      {showNew && <NewProjectModal onClose={() => { setShowNew(false); fetch(); }} />}
    </div>
  );
}

function ProjectCard({ project, isSelected, onClick }: any) {
  const stage = STAGES.find(s => s.key === project.current_stage);
  const daysOpen = Math.floor((Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? '#383E47' : '#2F343C',
        border: `1px solid ${isSelected ? stage?.color || 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
        borderRight: `3px solid ${stage?.color || '#5C7080'}`,
        padding: '12px 14px',
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 9, color: '#5C7080', fontFamily: 'monospace' }}>{project.project_number}</span>
          <div style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 600, marginTop: 2 }}>{project.title}</div>
          <div style={{ fontSize: 11, color: '#ABB3BF' }}>{project.client_name}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 14, color: '#3DCC91', fontWeight: 700 }}>
            ₪{Number(project.total_price).toLocaleString('he-IL')}
          </div>
          <div style={{ fontSize: 9, color: '#5C7080' }}>{daysOpen} ימים</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: '#1C2127' }}>
          <div style={{
            width: `${project.progress}%`,
            height: '100%',
            background: stage?.color || '#5C7080',
            transition: 'width 0.5s'
          }} />
        </div>
        <span style={{ fontSize: 10, color: '#5C7080', minWidth: 30 }}>{project.progress}%</span>
      </div>

      <div style={{ marginTop: 6 }}>
        <span style={{
          fontSize: 9, color: stage?.color,
          border: `1px solid ${stage?.color}40`,
          padding: '2px 7px'
        }}>
          {stage?.icon} {stage?.label}
        </span>
      </div>
    </div>
  );
}

function ProjectDetail({ project, onClose, onAdvance, advancing }: any) {
  const stage = STAGES.find(s => s.key === project.current_stage);
  const nextStageIdx = STAGES.findIndex(s => s.key === project.current_stage) + 1;
  const nextStage = STAGES[nextStageIdx];
  const [notes, setNotes] = useState('');

  return (
    <div style={{
      background: '#2F343C',
      border: '1px solid rgba(255,255,255,0.1)',
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto'
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#383E47', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 9, color: '#5C7080', fontFamily: 'monospace' }}>{project.project_number}</div>
          <div style={{ fontSize: 13, color: '#FFA500', fontWeight: 600 }}>{project.title}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: `${stage?.color}10` }}>
        <div style={{ fontSize: 10, color: '#5C7080', marginBottom: 6, letterSpacing: '0.1em' }}>שלב נוכחי</div>
        <div style={{ fontSize: 16, color: stage?.color, fontWeight: 700 }}>
          {stage?.icon} {stage?.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, height: 6, background: '#1C2127' }}>
            <div style={{ width: `${project.progress}%`, height: '100%', background: stage?.color }} />
          </div>
          <span style={{ fontSize: 11, color: '#5C7080' }}>{project.progress}%</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          ['לקוח', project.client_name],
          ['טלפון', project.client_phone],
          ['כתובת', project.address],
          ['שווי', `₪${Number(project.total_price).toLocaleString('he-IL')}`],
          ['מקדמה', `₪${Number(project.advance_paid).toLocaleString('he-IL')}`],
          ['יתרה', `₪${Number(project.balance_due || 0).toLocaleString('he-IL')}`],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: '#5C7080', marginBottom: 2, letterSpacing: '0.1em' }}>{k}</div>
            <div style={{ fontSize: 12, color: '#F6F7F9' }}>{v}</div>
          </div>
        ))}
      </div>

      {nextStage && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, color: '#5C7080', marginBottom: 8, letterSpacing: '0.1em' }}>פעולה נדרשת</div>
          <div style={{ fontSize: 11, color: '#ABB3BF', marginBottom: 8 }}>
            {stage?.icon} {stage?.label} → {nextStage?.icon} {nextStage?.label}
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="הערות (אופציונלי)..."
            rows={2}
            style={{
              width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)',
              color: '#F6F7F9', padding: '8px', fontSize: 11, outline: 'none',
              marginBottom: 8, boxSizing: 'border-box', resize: 'none'
            }}
          />
          <button
            onClick={() => onAdvance(project.current_stage)}
            disabled={advancing}
            style={{
              width: '100%',
              background: advancing ? 'rgba(255,255,255,0.05)' : `${nextStage.color}20`,
              border: `1px solid ${nextStage.color}`,
              color: advancing ? '#5C7080' : nextStage.color,
              padding: '10px',
              cursor: advancing ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600
            }}
          >
            {advancing ? 'מעדכן...' : `✓ אשר — ${nextStage.label}`}
          </button>
        </div>
      )}

      {project.pendingApproval && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,179,102,0.05)' }}>
          <div style={{ fontSize: 10, color: '#FFB366', letterSpacing: '0.1em', marginBottom: 4 }}>⏳ ממתין לאישור</div>
          <div style={{ fontSize: 11, color: '#ABB3BF' }}>{project.pendingApproval.title}</div>
          <div style={{ fontSize: 10, color: '#5C7080' }}>נדרש מ: {project.pendingApproval.required_from}</div>
        </div>
      )}

      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.1em', marginBottom: 10 }}>ציר זמן</div>
        {(project.timeline || []).map((t: any) => {
          const stageInfo = STAGES.find(s => s.key === t.stage);
          return (
            <div key={t.stage} style={{
              display: 'flex', gap: 10, marginBottom: 8,
              opacity: t.status === 'pending' ? 0.4 : 1
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: t.status === 'done' ? stageInfo?.color :
                    t.status === 'current' ? stageInfo?.color : '#383E47',
                  border: t.status === 'current' ? `2px solid ${stageInfo?.color}` : 'none',
                  boxShadow: t.status === 'current' ? `0 0 8px ${stageInfo?.color}` : 'none'
                }} />
                {t.stage !== 'project_closed' && (
                  <div style={{ width: 1, flex: 1, background: t.status === 'done' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', marginTop: 2 }} />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 8 }}>
                <div style={{ fontSize: 11, color: t.status === 'current' ? stageInfo?.color : '#ABB3BF', fontWeight: t.status === 'current' ? 600 : 400 }}>
                  {stageInfo?.icon} {t.label}
                </div>
                {t.completedAt && (
                  <div style={{ fontSize: 9, color: '#3D4F6A', marginTop: 2 }}>
                    {new Date(t.completedAt).toLocaleDateString('he-IL')} · {t.performedBy || 'מערכת'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<any>({});
  const { data: clients, fetch: fetchClients } = useApi<any[]>('/api/clients');
  const { data: employees, fetch: fetchEmployees } = useApi<any[]>('/api/employees');

  useEffect(() => { fetchClients(); fetchEmployees(); }, []);

  const f = (field: string) => (e: any) => setForm((p: any) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async () => {
    try {
      await api.post('/api/pipeline', form);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const inputStyle = {
    width: '100%', background: '#383E47',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#F6F7F9', padding: '7px 10px',
    fontSize: 12, outline: 'none', boxSizing: 'border-box' as const
  };

  const labelStyle = {
    fontSize: 10, color: '#5C7080',
    display: 'block', marginBottom: 4,
    letterSpacing: '0.1em'
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.15)', width: 580, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#383E47' }}>
          <div>
            <div style={{ color: '#FFA500', fontFamily: 'monospace', fontSize: 12 }}>// פרוייקט חדש — שרשרת אספקה</div>
            <div style={{ fontSize: 9, color: '#5C7080', marginTop: 2 }}>המערכת תתאם מדידה אוטומטית לאחר השמירה</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5C7080', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>לקוח</label>
            <select onChange={f('client_id')} style={inputStyle}>
              <option value="">בחר לקוח</option>
              {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>כותרת הפרוייקט</label>
            <input onChange={f('title')} style={inputStyle} placeholder="מעקות נירוסטה, שערים פנדולום..." />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>כתובת הפרוייקט</label>
            <input onChange={f('address')} style={inputStyle} placeholder="רחוב, עיר" />
          </div>

          <div>
            <label style={labelStyle}>מחיר כולל ₪</label>
            <input type="number" onChange={f('total_price')} style={inputStyle} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>מקדמה שהתקבלה ₪</label>
            <input type="number" onChange={f('advance_paid')} style={inputStyle} placeholder="0" />
          </div>

          <div>
            <label style={labelStyle}>מנהלת פרויקטים</label>
            <select onChange={f('project_manager_id')} style={inputStyle}>
              <option value="">בחר</option>
              {(employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>קבלן ייצור</label>
            <select onChange={f('contractor_id')} style={inputStyle}>
              <option value="">בחר</option>
              {(employees || []).filter((e: any) => e.department === 'production').map((e: any) =>
                <option key={e.id} value={e.id}>{e.name}</option>
              )}
            </select>
          </div>

          <div>
            <label style={labelStyle}>מתקין</label>
            <select onChange={f('installer_id')} style={inputStyle}>
              <option value="">בחר</option>
              {(employees || []).filter((e: any) => e.department === 'installation').map((e: any) =>
                <option key={e.id} value={e.id}>{e.name}</option>
              )}
            </select>
          </div>

          <div>
            <label style={labelStyle}>נהג</label>
            <select onChange={f('driver_id')} style={inputStyle}>
              <option value="">בחר</option>
              {(employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>תיאור ופירוט</label>
            <textarea onChange={f('description')} rows={3} style={{ ...inputStyle, resize: 'none' }} placeholder="פירוט טכני, מידות, הערות..." />
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          <button onClick={handleSubmit} style={{ background: 'rgba(255,165,0,0.15)', border: '1px solid #FFA500', color: '#FFA500', padding: '10px 24px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ✓ פתח פרוייקט — הפעל שרשרת
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ABB3BF', padding: '10px 16px', cursor: 'pointer', fontSize: 12 }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
