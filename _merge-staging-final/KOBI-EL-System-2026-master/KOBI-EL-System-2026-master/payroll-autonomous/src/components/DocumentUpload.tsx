import React, { useCallback, useRef, useState } from 'react';

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};

const CATEGORIES = [
  'חוזה לקוח',
  'חוזה ספק',
  'הצעת מחיר',
  'חשבונית',
  'תלוש שכר',
  'רישיון',
  'תעודת ביטוח',
  'אחר',
];

const ENTITY_TYPES = ['לקוח', 'ספק', 'פרויקט', 'עובד'];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type UploadedFile = {
  name: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  errorMsg?: string;
};

export default function DocumentUpload() {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadFile = useCallback(async (file: File) => {
    // Validate type
    if (!ALLOWED_TYPES[file.type]) {
      setUploads(prev => [...prev, { name: file.name, status: 'error', progress: 0, errorMsg: '❌ סוג קובץ לא נתמך' }]);
      return;
    }
    // Validate size
    if (file.size > MAX_SIZE) {
      setUploads(prev => [...prev, { name: file.name, status: 'error', progress: 0, errorMsg: '❌ הקובץ גדול מדי' }]);
      return;
    }

    setUploads(prev => [...prev, { name: file.name, status: 'uploading', progress: 10 }]);

    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);
    if (tags) formData.append('tags', tags);
    if (entityType) formData.append('entity_type', entityType);
    if (entityId) formData.append('entity_id', entityId);

    try {
      // Simulate progress
      setUploads(prev => prev.map(u => u.name === file.name ? { ...u, progress: 40 } : u));

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setUploads(prev => prev.map(u => u.name === file.name ? { ...u, progress: 90 } : u));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'done', progress: 100 } : u));
    } catch {
      setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'error', progress: 0, errorMsg: '❌ שגיאה בהעלאה' } : u));
    }
  }, [category, tags, entityType, entityId]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  }, [uploadFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

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

  return (
    <div dir="rtl" style={{ color: th.text, fontFamily: '-apple-system, "Segoe UI", Heebo, Arial, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: th.text, fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>📁 העלאת מסמכים</h2>
        <div style={{ fontSize: 11, color: th.textDim, letterSpacing: '0.1em' }}>DOCUMENT UPLOAD</div>
      </div>

      {/* FORM FIELDS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>קטגוריה</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            <option value="">בחר קטגוריה...</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>תגיות (חופשי)</label>
          <input
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="תגית1, תגית2..."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>ישות קשורה</label>
          <select value={entityType} onChange={e => setEntityType(e.target.value)} style={inputStyle}>
            <option value="">בחר סוג...</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>מזהה ישות</label>
          <input
            type="text"
            value={entityId}
            onChange={e => setEntityId(e.target.value)}
            placeholder="ID..."
            style={{ ...inputStyle, direction: 'ltr' }}
          />
        </div>
      </div>

      {/* DROP ZONE */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? th.accent : th.border}`,
          borderRadius: 8,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? `rgba(74,158,255,0.06)` : th.panel,
          transition: 'all 0.2s',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
        <div style={{ color: dragging ? th.accent : th.text, fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
          גרור קבצים לכאן או לחץ לבחירה
        </div>
        <div style={{ color: th.textDim, fontSize: 12 }}>
          PDF, DOC, DOCX, XLS, XLSX, JPG, PNG — עד 10MB
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* UPLOAD LIST */}
      {uploads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {uploads.map((u, i) => (
            <div key={i} style={{
              background: th.panel,
              border: `1px solid ${u.status === 'error' ? th.danger : u.status === 'done' ? th.success : th.border}`,
              borderRadius: 6,
              padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: u.status === 'uploading' ? 8 : 0 }}>
                <span style={{ color: th.text, fontSize: 13, fontWeight: 500 }}>
                  📄 {u.name}
                </span>
                <span style={{ fontSize: 13 }}>
                  {u.status === 'done' && <span style={{ color: th.success }}>✅ הועלה</span>}
                  {u.status === 'error' && <span style={{ color: th.danger }}>{u.errorMsg}</span>}
                  {u.status === 'uploading' && <span style={{ color: th.textDim, fontSize: 11 }}>מעלה...</span>}
                </span>
              </div>
              {u.status === 'uploading' && (
                <div style={{ height: 4, background: th.panel2, borderRadius: 2 }}>
                  <div style={{
                    height: '100%',
                    width: `${u.progress}%`,
                    background: th.accent,
                    borderRadius: 2,
                    transition: 'width 0.3s',
                  }} />
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => setUploads([])}
            style={{
              background: 'transparent',
              border: `1px solid ${th.border}`,
              color: th.textDim,
              padding: '6px 14px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              alignSelf: 'flex-start',
              marginTop: 4,
            }}
          >
            נקה רשימה
          </button>
        </div>
      )}
    </div>
  );
}
