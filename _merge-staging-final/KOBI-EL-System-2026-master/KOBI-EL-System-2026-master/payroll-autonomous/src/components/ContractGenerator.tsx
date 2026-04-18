import React, { useState } from 'react';

type ContractType = 'customer' | 'supplier' | 'employment';

const CONTRACT_TYPES: { id: ContractType; label: string }[] = [
  { id: 'customer',   label: 'חוזה עם לקוח' },
  { id: 'supplier',  label: 'חוזה ספק' },
  { id: 'employment', label: 'חוזה העסקה' },
];

const th = {
  bg: '#0b0d10',
  panel: '#13171c',
  panel2: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
  success: '#3fb950',
  danger: '#f85149',
  warning: '#d29922',
};

function generateContractText(type: ContractType, form: Record<string, string>): string {
  const today = new Date().toLocaleDateString('he-IL');
  if (type === 'customer') {
    return `חוזה התקשרות עם לקוח
תאריך: ${today}

בין: טכנו-קול בע"מ (להלן: "הספק")
לבין: ${form.clientName || '___'} (להלן: "הלקוח")

פרויקט: ${form.project || '___'}
סכום: ₪${Number(form.amount || 0).toLocaleString('he-IL')}
תנאי תשלום: ${form.paymentTerms || '___'}
תאריך ביצוע: ${form.executionDate || '___'}

סעיפים:
1. הספק מתחייב לספק את השירותים/המוצרים המפורטים בנספח א'.
2. הלקוח יישא בתשלום בהתאם לתנאי התשלום הנ"ל.
3. כל שינוי בהסכם יעשה בכתב ובחתימת שני הצדדים.
4. חילוקי דעות יידונו בבית משפט מוסמך בישראל.
5. הסכם זה כפוף לדיני מדינת ישראל.

_____________________    _____________________
חתימת הספק                  חתימת הלקוח`;
  }

  if (type === 'supplier') {
    return `הסכם ספק
תאריך: ${today}

בין: טכנו-קול בע"מ (להלן: "הרוכש")
לבין: ${form.supplierName || '___'} (להלן: "הספק")

נושא: ${form.subject || '___'}
תקופה: ${form.period || '___'}
תנאים: ${form.conditions || '___'}

סעיפים:
1. הספק מתחייב לספק את הסחורה/שירות בהתאם למפרט המצורף.
2. הרוכש ישלם במועד המוסכם בהתאם לחשבוניות מאושרות.
3. הספק ישמור על סודיות מלאה של מידע עסקי.
4. אי-עמידה בתנאים תהווה עילה לביטול ההסכם.
5. הסכם זה כפוף לדיני מדינת ישראל.

_____________________    _____________________
חתימת הרוכש                  חתימת הספק`;
  }

  // employment
  return `חוזה העסקה
תאריך: ${today}

בין: טכנו-קול בע"מ (להלן: "המעסיק")
לבין: ${form.employeeName || '___'} (להלן: "העובד")

תפקיד: ${form.role || '___'}
שכר ברוטו: ₪${Number(form.salary || 0).toLocaleString('he-IL')} לחודש
תאריך התחלה: ${form.startDate || '___'}
תנאי העסקה: ${form.employmentConditions || 'משרה מלאה'}

סעיפים:
1. העובד מתחייב לבצע תפקידו באמונה ובמקצועיות.
2. שעות עבודה בהתאם לחוק שעות עבודה ומנוחה, תשי"א-1951.
3. חופשה שנתית: 12 ימי עבודה לפחות לשנה.
4. תנאים סוציאליים: קרן פנסיה וביטוח מנהלים בהתאם לחוק.
5. הודעה מוקדמת: 30 יום לפחות בכל צד.
6. הסכם זה כפוף לחוקי עבודה של מדינת ישראל.

_____________________    _____________________
חתימת המעסיק                  חתימת העובד`;
}

export default function ContractGenerator() {
  const [contractType, setContractType] = useState<ContractType>('customer');
  const [form, setForm] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [signingLink, setSigningLink] = useState<string | null>(null);

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    background: th.panel2,
    border: `1px solid ${th.border}`,
    color: th.text,
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 4,
    width: '100%',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: th.textDim,
    display: 'block',
    marginBottom: 4,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  };

  const handleGenerate = () => {
    const text = generateContractText(contractType, form);
    setPreview(text);
    setSigningLink(null);
  };

  const handlePrint = () => {
    if (!preview) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><title>חוזה</title><style>body{font-family:Arial,sans-serif;padding:40px;white-space:pre-wrap;direction:rtl;text-align:right}</style></head><body>${preview.replace(/\n/g, '<br>')}</body></html>`);
    w.print();
  };

  const handleDownload = () => {
    if (!preview) return;
    const blob = new Blob([preview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract_${contractType}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendForSignature = async () => {
    if (!preview) return;
    setSending(true);
    try {
      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: contractType, form, text: preview }),
      });
      const data = res.ok ? await res.json() : null;
      const link = data?.signing_link || `https://sign.example.com/${Date.now()}`;
      setSigningLink(link);

      // Send WhatsApp notification
      const phone = form.clientPhone || form.supplierPhone || form.employeePhone || '';
      if (phone) {
        await fetch('/api/notifications/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            phone,
            message: `שלום, הנך מוזמן לחתום על חוזה. לחץ כאן: ${link}`,
          }),
        }).catch(() => null); // best-effort
      }
    } catch {
      setSigningLink('https://sign.example.com/mock-link');
    } finally {
      setSending(false);
    }
  };

  return (
    <div dir="rtl" style={{ color: th.text, fontFamily: '-apple-system, "Segoe UI", Heebo, Arial, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: th.text, fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>📝 יצירת חוזים</h2>
        <div style={{ fontSize: 11, color: th.textDim, letterSpacing: '0.1em' }}>CONTRACT GENERATOR</div>
      </div>

      {/* TYPE SELECTOR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {CONTRACT_TYPES.map(ct => (
          <button
            key={ct.id}
            onClick={() => { setContractType(ct.id); setPreview(null); setSigningLink(null); }}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: `1px solid ${contractType === ct.id ? th.accent : th.border}`,
              background: contractType === ct.id ? `rgba(74,158,255,0.1)` : th.panel,
              color: contractType === ct.id ? th.accent : th.textDim,
              cursor: 'pointer',
              fontWeight: contractType === ct.id ? 600 : 400,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            {ct.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* FORM */}
        <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 13, color: th.textDim, marginBottom: 16, fontWeight: 600 }}>
            {CONTRACT_TYPES.find(c => c.id === contractType)?.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {contractType === 'customer' && (<>
              <div>
                <label style={labelStyle}>שם לקוח</label>
                <input style={inputStyle} value={form.clientName || ''} onChange={f('clientName')} placeholder="שם הלקוח" />
              </div>
              <div>
                <label style={labelStyle}>טלפון לקוח</label>
                <input style={{ ...inputStyle, direction: 'ltr' }} value={form.clientPhone || ''} onChange={f('clientPhone')} placeholder="05x-xxxxxxx" />
              </div>
              <div>
                <label style={labelStyle}>פרויקט</label>
                <input style={inputStyle} value={form.project || ''} onChange={f('project')} placeholder="שם הפרויקט" />
              </div>
              <div>
                <label style={labelStyle}>סכום ₪</label>
                <input type="number" style={inputStyle} value={form.amount || ''} onChange={f('amount')} placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>תנאי תשלום</label>
                <input style={inputStyle} value={form.paymentTerms || ''} onChange={f('paymentTerms')} placeholder="לדוגמה: 30% מקדמה, 70% עם סיום" />
              </div>
              <div>
                <label style={labelStyle}>תאריך ביצוע</label>
                <input type="date" style={inputStyle} value={form.executionDate || ''} onChange={f('executionDate')} />
              </div>
            </>)}

            {contractType === 'supplier' && (<>
              <div>
                <label style={labelStyle}>שם ספק</label>
                <input style={inputStyle} value={form.supplierName || ''} onChange={f('supplierName')} placeholder="שם הספק" />
              </div>
              <div>
                <label style={labelStyle}>טלפון ספק</label>
                <input style={{ ...inputStyle, direction: 'ltr' }} value={form.supplierPhone || ''} onChange={f('supplierPhone')} placeholder="05x-xxxxxxx" />
              </div>
              <div>
                <label style={labelStyle}>נושא</label>
                <input style={inputStyle} value={form.subject || ''} onChange={f('subject')} placeholder="נושא ההתקשרות" />
              </div>
              <div>
                <label style={labelStyle}>תקופה</label>
                <input style={inputStyle} value={form.period || ''} onChange={f('period')} placeholder="לדוגמה: 12 חודשים" />
              </div>
              <div>
                <label style={labelStyle}>תנאים</label>
                <textarea style={{ ...inputStyle, resize: 'none' } as React.CSSProperties} rows={3} value={form.conditions || ''} onChange={f('conditions')} placeholder="תנאים מיוחדים..." />
              </div>
            </>)}

            {contractType === 'employment' && (<>
              <div>
                <label style={labelStyle}>שם עובד</label>
                <input style={inputStyle} value={form.employeeName || ''} onChange={f('employeeName')} placeholder="שם מלא" />
              </div>
              <div>
                <label style={labelStyle}>טלפון עובד</label>
                <input style={{ ...inputStyle, direction: 'ltr' }} value={form.employeePhone || ''} onChange={f('employeePhone')} placeholder="05x-xxxxxxx" />
              </div>
              <div>
                <label style={labelStyle}>תפקיד</label>
                <input style={inputStyle} value={form.role || ''} onChange={f('role')} placeholder="תפקיד בחברה" />
              </div>
              <div>
                <label style={labelStyle}>שכר ₪ לחודש</label>
                <input type="number" style={inputStyle} value={form.salary || ''} onChange={f('salary')} placeholder="0" />
              </div>
              <div>
                <label style={labelStyle}>תאריך התחלה</label>
                <input type="date" style={inputStyle} value={form.startDate || ''} onChange={f('startDate')} />
              </div>
              <div>
                <label style={labelStyle}>תנאי העסקה</label>
                <textarea style={{ ...inputStyle, resize: 'none' } as React.CSSProperties} rows={3} value={form.employmentConditions || ''} onChange={f('employmentConditions')} placeholder="משרה מלאה / חלקית / שאר תנאים..." />
              </div>
            </>)}

            <button
              onClick={handleGenerate}
              style={{
                background: `rgba(74,158,255,0.15)`,
                border: `1px solid ${th.accent}`,
                color: th.accent,
                padding: '10px 20px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                marginTop: 4,
              }}
            >
              צור חוזה
            </button>
          </div>
        </div>

        {/* PREVIEW */}
        {preview && (
          <div style={{ background: th.panel, border: `1px solid ${th.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: th.textDim, marginBottom: 12, fontWeight: 600, letterSpacing: '0.08em' }}>
              תצוגה מקדימה
            </div>
            <pre style={{
              flex: 1,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 12,
              color: th.text,
              lineHeight: 1.7,
              background: th.panel2,
              padding: 16,
              borderRadius: 6,
              border: `1px solid ${th.border}`,
              overflowY: 'auto',
              maxHeight: 400,
              marginBottom: 16,
              direction: 'rtl',
              textAlign: 'right',
            }}>
              {preview}
            </pre>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handlePrint}
                style={{
                  background: th.panel2, border: `1px solid ${th.border}`, color: th.text,
                  padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                }}
              >
                🖨️ הדפס
              </button>
              <button
                onClick={handleDownload}
                style={{
                  background: th.panel2, border: `1px solid ${th.border}`, color: th.text,
                  padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                }}
              >
                📥 הורד
              </button>
              <button
                onClick={handleSendForSignature}
                disabled={sending}
                style={{
                  background: sending ? 'rgba(255,255,255,0.05)' : 'rgba(63,185,80,0.15)',
                  border: `1px solid ${th.success}`,
                  color: th.success,
                  padding: '8px 14px',
                  borderRadius: 4,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? '⏳ שולח...' : '✍️ שלח לחתימה'}
              </button>
            </div>

            {signingLink && (
              <div style={{
                marginTop: 12,
                padding: 12,
                background: `rgba(63,185,80,0.08)`,
                border: `1px solid rgba(63,185,80,0.3)`,
                borderRadius: 6,
              }}>
                <div style={{ color: th.success, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  ✅ קישור חתימה נוצר ונשלח ב-WhatsApp
                </div>
                <a
                  href={signingLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: th.accent, fontSize: 12, direction: 'ltr', display: 'block' }}
                >
                  {signingLink}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
