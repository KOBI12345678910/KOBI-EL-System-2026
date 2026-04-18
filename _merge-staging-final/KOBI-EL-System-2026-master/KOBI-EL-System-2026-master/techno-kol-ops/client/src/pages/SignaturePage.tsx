import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../hooks/useApi';

// ════════════════════════════════════════════
// דף חתימה ציבורי — ללא לוגין
// נגיש דרך לינק ייחודי
// ════════════════════════════════════════════

type SignStep = 'loading' | 'view' | 'sign' | 'done' | 'rejected' | 'error' | 'expired';

export function SignaturePage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<SignStep>('loading');
  const [doc, setDoc] = useState<any>(null);
  const [signedName, setSignedName] = useState('');
  const [signatureType, setSignatureType] = useState<'drawn' | 'typed'>('drawn');
  const [typedSig, setTypedSig] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!token) return;
    api.get(`/api/signatures/sign/${token}`)
      .then(r => {
        setDoc(r.data);
        setSignedName(r.data.recipient_name || '');
        setStep(r.data.can_sign ? 'view' : 'done');
      })
      .catch(err => {
        if (err.response?.status === 404) setStep('expired');
        else setStep('error');
      });
  }, [token]);

  // ── Canvas drawing
  const startDraw = (e: any) => {
    isDrawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
  };

  const draw = (e: any) => {
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => { isDrawing.current = false; };

  const getPos = (e: any) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  };

  const isCanvasEmpty = (): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return !data.some(v => v !== 0);
  };

  // ── שלח חתימה
  const handleSign = async () => {
    if (!signedName.trim()) return alert('יש להזין שם לחתימה');

    let signatureData = '';

    if (signatureType === 'drawn') {
      if (isCanvasEmpty()) return alert('יש לחתום על הכנס');
      signatureData = canvasRef.current!.toDataURL('image/png');
    } else {
      if (!typedSig.trim()) return alert('יש להקליד שם לחתימה');
      // צור חתימה מטקסט
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 400, 100);
      ctx.font = 'italic 48px Georgia, serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedSig, 200, 55);
      signatureData = canvas.toDataURL('image/png');
    }

    setSubmitting(true);
    try {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await api.post(`/api/signatures/sign/${token}`, {
          signature_data: signatureData,
          signature_type: signatureType,
          signed_name: signedName,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        setStep('done');
      }, async () => {
        await api.post(`/api/signatures/sign/${token}`, {
          signature_data: signatureData,
          signature_type: signatureType,
          signed_name: signedName
        });
        setStep('done');
      });
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה — נסה שוב');
      setSubmitting(false);
    }
  };

  // ── דחה
  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/api/signatures/sign/${token}/reject`, { reason: rejectReason });
      setStep('rejected');
    } catch {
      alert('שגיאה');
    } finally {
      setSubmitting(false);
    }
  };

  const S = {
    page: {
      background: '#f5f5f0',
      minHeight: '100vh',
      direction: 'rtl' as const,
      fontFamily: 'Arial, sans-serif'
    },
    header: {
      background: '#1a1a1a',
      color: '#fff',
      padding: '16px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    logo: { fontSize: 20, fontWeight: 900, letterSpacing: '0.1em' },
    container: { maxWidth: 800, margin: '0 auto', padding: 24 },
    card: { background: '#fff', border: '1px solid #ddd', marginBottom: 16 },
    cardHeader: { background: '#f9f9f9', padding: '12px 20px', borderBottom: '1px solid #ddd' },
    cardBody: { padding: 20 },
    btn: (color: string, bg: string) => ({
      background: bg, color, border: `1px solid ${color}`,
      padding: '12px 24px', cursor: 'pointer',
      fontSize: 14, fontWeight: 700, borderRadius: 2
    }),
    input: {
      width: '100%', border: '1px solid #ccc',
      padding: '10px 14px', fontSize: 14,
      outline: 'none', boxSizing: 'border-box' as const
    }
  };

  // ── LOADING
  if (step === 'loading') {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>טוען מסמך...</div>
        </div>
      </div>
    );
  }

  // ── EXPIRED
  if (step === 'expired') {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <div style={S.logo}>TECHNO-KOL</div>
        </div>
        <div style={S.container}>
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>הקישור פג תוקף</div>
            <div style={{ color: '#666' }}>לקישור חדש פנה ל-052-XXXXXXX</div>
          </div>
        </div>
      </div>
    );
  }

  // ── DONE
  if (step === 'done') {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <div style={S.logo}>TECHNO-KOL</div>
          <div style={{ color: '#4ade80', fontSize: 13 }}>✓ מאומת</div>
        </div>
        <div style={S.container}>
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid #ddd' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 8, color: '#2d9a4e' }}>
              החתימה התקבלה!
            </div>
            <div style={{ color: '#666', fontSize: 15, marginBottom: 24 }}>
              המסמך נחתם בהצלחה ונשמר במערכת.
            </div>
            <div style={{ background: '#f0fff4', border: '1px solid #2d9a4e', padding: '12px 20px', display: 'inline-block', fontSize: 13, color: '#2d9a4e' }}>
              תקבל עותק חתום בוואטסאפ תוך מספר דקות
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── REJECTED
  if (step === 'rejected') {
    return (
      <div style={S.page}>
        <div style={S.header}><div style={S.logo}>TECHNO-KOL</div></div>
        <div style={S.container}>
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid #ddd' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>המסמך נדחה</div>
            <div style={{ color: '#666' }}>הצוות שלנו יצור איתך קשר בקרוב.</div>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW + SIGN
  return (
    <div style={S.page}>
      {/* HEADER */}
      <div style={S.header}>
        <div style={S.logo}>TECHNO-KOL</div>
        <div style={{ fontSize: 12, color: '#aaa' }}>
          מסמך לחתימה דיגיטלית
        </div>
      </div>

      <div style={S.container}>

        {/* STATUS BAR */}
        <div style={{ background: '#fffbf0', border: '1px solid #f59e0b', padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>📄 {doc?.title}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              ממתין לחתימתך — {doc?.recipient_name}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>
            ✍️ נדרשת חתימה
          </div>
        </div>

        {/* RECIPIENTS STATUS */}
        {doc?.all_recipients?.length > 1 && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>מצב חתימות</div>
            </div>
            <div style={S.cardBody}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {doc.all_recipients.map((r: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px',
                    background: r.status === 'signed' ? '#f0fff4' : r.status === 'rejected' ? '#fff5f5' : '#fffbf0',
                    border: `1px solid ${r.status === 'signed' ? '#2d9a4e' : r.status === 'rejected' ? '#e53e3e' : '#f59e0b'}`,
                    fontSize: 12
                  }}>
                    <span>{r.status === 'signed' ? '✓' : r.status === 'rejected' ? '✗' : '⏳'}</span>
                    <span>{r.recipient_name}</span>
                    <span style={{ color: '#888', fontSize: 10 }}>
                      ({r.recipient_type === 'client' ? 'לקוח' : r.recipient_type === 'manager' ? 'הנהלה' : 'עובד'})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT PREVIEW */}
        {step === 'view' && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>📄 תוכן המסמך</div>
                <button
                  onClick={() => setStep('sign')}
                  style={{ ...S.btn('#fff', '#1a1a1a'), padding: '8px 18px', fontSize: 13 }}
                >
                  קרא וחתום ↓
                </button>
              </div>
            </div>
            <div style={{ padding: 0, maxHeight: 500, overflowY: 'auto' }}>
              <div dangerouslySetInnerHTML={{ __html: doc?.content || '' }}
                style={{ pointerEvents: 'none', userSelect: 'none' }} />
            </div>
            <div style={{ padding: '12px 20px', background: '#f9f9f9', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('sign')}
                style={{ ...S.btn('#fff', '#1a1a1a') }}>
                ✍️ המשך לחתימה
              </button>
            </div>
          </div>
        )}

        {/* SIGNATURE FORM */}
        {step === 'sign' && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>✍️ חתימה דיגיטלית</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                החתימה תאומת עם שמך ותתועד עם חותמת זמן ו-IP
              </div>
            </div>
            <div style={S.cardBody}>

              {/* שם לחתימה */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  שם מלא לחתימה *
                </label>
                <input
                  value={signedName}
                  onChange={e => setSignedName(e.target.value)}
                  style={S.input}
                  placeholder="הקלד שמך המלא"
                />
              </div>

              {/* בחר סוג חתימה */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>סוג חתימה:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'drawn', label: '🖊️ ציור ידני' },
                    { key: 'typed', label: '⌨️ הקלדה' }
                  ].map(opt => (
                    <button key={opt.key}
                      onClick={() => setSignatureType(opt.key as any)}
                      style={{
                        padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                        background: signatureType === opt.key ? '#1a1a1a' : '#fff',
                        color: signatureType === opt.key ? '#fff' : '#1a1a1a',
                        border: '1px solid #1a1a1a'
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* DRAWN */}
              {signatureType === 'drawn' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                    חתום בתוך המסגרת:
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={700} height={160}
                    style={{
                      border: '2px solid #1a1a1a',
                      background: '#fff',
                      cursor: 'crosshair',
                      touchAction: 'none',
                      width: '100%', maxWidth: 700,
                      display: 'block'
                    }}
                    onMouseDown={startDraw} onMouseMove={draw}
                    onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                  />
                  <button onClick={clearCanvas}
                    style={{ marginTop: 6, background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12 }}>
                    נקה ✕
                  </button>
                </div>
              )}

              {/* TYPED */}
              {signatureType === 'typed' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>הקלד שמך לחתימה:</div>
                  <input
                    value={typedSig}
                    onChange={e => setTypedSig(e.target.value)}
                    style={{ ...S.input, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 28, height: 70, color: '#1a1a1a' }}
                    placeholder="שמך בכתב"
                  />
                  {typedSig && (
                    <div style={{ marginTop: 8, padding: 12, border: '1px solid #ddd', background: '#f9f9f9', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 32, color: '#1a1a1a', minHeight: 60 }}>
                      {typedSig}
                    </div>
                  )}
                </div>
              )}

              {/* LEGAL TEXT */}
              <div style={{ background: '#f9f9f9', border: '1px solid #ddd', padding: 12, marginBottom: 20, fontSize: 11, color: '#666', lineHeight: 1.7 }}>
                ✓ על ידי לחיצה על "חתום", אני מאשר/ת כי קראתי את המסמך, הבנתי את תוכנו, ומסכים/ה לכל תנאיו. חתימה זו מחייבת משפטית כחתימה על מסמך פיזי.
              </div>

              {/* BUTTONS */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleSign}
                  disabled={submitting}
                  style={{
                    flex: 2,
                    background: submitting ? '#ccc' : '#1a1a1a',
                    color: '#fff', border: 'none',
                    padding: '14px', cursor: submitting ? 'not-allowed' : 'pointer',
                    fontSize: 16, fontWeight: 900
                  }}>
                  {submitting ? 'שולח...' : '✍️ חתום על המסמך'}
                </button>
                <button
                  onClick={() => setRejecting(true)}
                  style={{ flex: 1, background: '#fff', color: '#e53e3e', border: '1px solid #e53e3e', padding: '14px', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  ✕ דחה
                </button>
              </div>

              {/* REJECT MODAL */}
              {rejecting && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }}>
                  <div style={{ background: '#fff', padding: 24, maxWidth: 400, width: '100%' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>סיבת הדחייה</div>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      rows={4}
                      style={{ ...S.input, resize: 'none', marginBottom: 12 }}
                      placeholder="פרט את הסיבה לדחיית המסמך..."
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleReject} disabled={!rejectReason.trim() || submitting}
                        style={{ flex: 1, background: '#e53e3e', color: '#fff', border: 'none', padding: '10px', cursor: 'pointer', fontWeight: 700 }}>
                        דחה מסמך
                      </button>
                      <button onClick={() => setRejecting(false)}
                        style={{ flex: 1, background: '#fff', border: '1px solid #ddd', padding: '10px', cursor: 'pointer' }}>
                        ביטול
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BACK TO VIEW */}
        {step === 'sign' && (
          <button onClick={() => setStep('view')} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
            ← חזור לקריאת המסמך
          </button>
        )}

        {/* FOOTER */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', padding: '16px 0' }}>
          חתימה דיגיטלית מאובטחת | טכנו-קול עוזי בע"מ | 052-XXXXXXX
        </div>
      </div>
    </div>
  );
}
