// QR Code Generator — generates QR codes and barcode labels for ERP entities
// Uses qrcode.react library (package.json: "qrcode.react": "^4.0.0")

import React, { useState, useRef, useCallback } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

type EntityType = 'material' | 'work_order' | 'employee' | 'project';

interface QRItem {
  id: string;
  name: string;
  type: EntityType;
}

const MOCK_DATA: Record<EntityType, QRItem[]> = {
  material: [
    { id: 'MAT-001', name: 'פלדה מבנית A36', type: 'material' },
    { id: 'MAT-002', name: 'אלומיניום 6061', type: 'material' },
    { id: 'MAT-003', name: 'חוט ריתוך ER70S-6', type: 'material' },
    { id: 'MAT-004', name: 'צנרת נירוסטה 316', type: 'material' },
    { id: 'MAT-005', name: 'בורג M12x50 קלאס 8.8', type: 'material' },
  ],
  work_order: [
    { id: 'WO-2025-001', name: 'ייצור שלד מנוף #A7', type: 'work_order' },
    { id: 'WO-2025-002', name: 'ריתוך מסגרת ראשית', type: 'work_order' },
    { id: 'WO-2025-003', name: 'עיבוד CNC בלוק מנוע', type: 'work_order' },
    { id: 'WO-2025-004', name: 'הרכבת לוח חשמל', type: 'work_order' },
    { id: 'WO-2025-005', name: 'בדיקת איכות קו 3', type: 'work_order' },
  ],
  employee: [
    { id: 'EMP-101', name: 'יוסי כהן', type: 'employee' },
    { id: 'EMP-102', name: 'מירי לוי', type: 'employee' },
    { id: 'EMP-103', name: 'אבי מזרחי', type: 'employee' },
    { id: 'EMP-104', name: 'רחל פרידמן', type: 'employee' },
    { id: 'EMP-105', name: 'דוד ביטון', type: 'employee' },
  ],
  project: [
    { id: 'PRJ-2025-01', name: 'בניית מפעל חדש - שלב א', type: 'project' },
    { id: 'PRJ-2025-02', name: 'שדרוג קו ייצור #2', type: 'project' },
    { id: 'PRJ-2025-03', name: 'הקמת מחסן אוטומטי', type: 'project' },
    { id: 'PRJ-2025-04', name: 'פיתוח מוצר X-500', type: 'project' },
  ],
};

const TYPE_LABELS: Record<EntityType, string> = {
  material: 'חומר / מלאי',
  work_order: 'הזמנת עבודה',
  employee: 'עובד',
  project: 'פרויקט',
};

const TABS: { key: EntityType; label: string }[] = [
  { key: 'material',   label: 'חומרים/מלאי' },
  { key: 'work_order', label: 'הזמנות עבודה' },
  { key: 'employee',   label: 'עובדים' },
  { key: 'project',    label: 'פרויקטים' },
];

function buildQRData(item: QRItem): string {
  return JSON.stringify({ type: item.type, id: item.id, name: item.name });
}

function buildDeepLink(item: QRItem): string {
  const pathMap: Record<EntityType, string> = {
    material: 'material',
    work_order: 'work-order',
    employee: 'employee',
    project: 'project',
  };
  return `technokolapp://${pathMap[item.type]}/${item.id}`;
}

const printStyles = `
  @media print {
    body * { visibility: hidden !important; }
    #qr-print-area, #qr-print-area * { visibility: visible !important; }
    #qr-print-area {
      position: fixed !important;
      top: 0; left: 0;
      width: 210mm;
      background: white;
    }
    .qr-label-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8mm;
      padding: 10mm;
    }
    .qr-label-cell {
      border: 1px solid #333;
      padding: 6mm;
      text-align: center;
      page-break-inside: avoid;
      background: white;
    }
    .qr-label-name {
      font-size: 11pt;
      font-weight: bold;
      color: black;
      margin-top: 4mm;
    }
    .qr-label-id {
      font-size: 9pt;
      color: #333;
      font-family: monospace;
      margin-top: 2mm;
    }
    .qr-label-type {
      font-size: 8pt;
      color: #555;
      margin-top: 1mm;
    }
  }
`;

export default function QRCodeGenerator() {
  const [activeTab, setActiveTab] = useState<EntityType>('material');
  const [selectedId, setSelectedId] = useState<string>(MOCK_DATA.material[0].id);
  const canvasRef = useRef<HTMLDivElement>(null);

  const items = MOCK_DATA[activeTab];
  const selectedItem = items.find(i => i.id === selectedId) ?? items[0];
  const qrData = buildQRData(selectedItem);

  const handleTabChange = useCallback((tab: EntityType) => {
    setActiveTab(tab);
    setSelectedId(MOCK_DATA[tab][0].id);
  }, []);

  const handleDownloadPNG = useCallback(() => {
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `qr-${selectedItem.id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [selectedItem]);

  const handlePrintLabel = useCallback(() => {
    window.print();
  }, []);

  const styles = {
    container: {
      direction: 'rtl' as const,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      background: '#0f1923',
      minHeight: '100%',
      padding: '24px',
      color: '#e2e8f0',
    },
    title: {
      fontSize: 22,
      fontWeight: 700,
      marginBottom: 20,
      color: '#7dd3fc',
    },
    tabs: {
      display: 'flex',
      gap: 8,
      marginBottom: 24,
      borderBottom: '2px solid #1e3a5f',
      paddingBottom: 0,
    },
    tab: (active: boolean) => ({
      padding: '8px 20px',
      cursor: 'pointer',
      borderRadius: '6px 6px 0 0',
      background: active ? '#1e3a5f' : 'transparent',
      color: active ? '#7dd3fc' : '#94a3b8',
      border: 'none',
      fontWeight: active ? 700 : 400,
      fontSize: 14,
      transition: 'all 0.15s',
    }),
    card: {
      background: '#152030',
      borderRadius: 12,
      padding: 28,
      maxWidth: 480,
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    },
    label: {
      display: 'block',
      marginBottom: 8,
      fontSize: 13,
      color: '#94a3b8',
    },
    select: {
      width: '100%',
      padding: '10px 14px',
      background: '#1e2d3d',
      border: '1px solid #2d4a6a',
      borderRadius: 8,
      color: '#e2e8f0',
      fontSize: 15,
      marginBottom: 24,
      direction: 'rtl' as const,
    },
    qrBox: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      background: 'white',
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
    },
    itemName: {
      marginTop: 12,
      fontWeight: 700,
      color: '#1a1a2e',
      fontSize: 15,
      textAlign: 'center' as const,
    },
    itemId: {
      color: '#555',
      fontSize: 13,
      fontFamily: 'monospace',
      marginTop: 4,
      textAlign: 'center' as const,
    },
    itemType: {
      color: '#888',
      fontSize: 12,
      marginTop: 2,
      textAlign: 'center' as const,
    },
    btnRow: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap' as const,
    },
    btn: (color: string) => ({
      flex: 1,
      padding: '10px 16px',
      background: color,
      border: 'none',
      borderRadius: 8,
      color: 'white',
      fontWeight: 700,
      fontSize: 14,
      cursor: 'pointer',
      minWidth: 130,
    }),
  };

  // Build 6-label grid for printing
  const printLabels = Array(6).fill(selectedItem);

  return (
    <div style={styles.container}>
      <style>{printStyles}</style>
      <div style={styles.title}>📲 מחולל QR ותוויות ברקוד</div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {TABS.map(t => (
          <button key={t.key} style={styles.tab(activeTab === t.key)} onClick={() => handleTabChange(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={styles.card}>
        {/* Dropdown */}
        <label style={styles.label}>בחר פריט:</label>
        <select
          style={styles.select}
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          {items.map(item => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.id})
            </option>
          ))}
        </select>

        {/* QR Code display */}
        <div style={styles.qrBox}>
          <QRCodeCanvas
            id="qr-canvas"
            value={buildDeepLink(selectedItem)}
            size={200}
            level="H"
            includeMargin={true}
          />
          <div style={styles.itemName}>{selectedItem.name}</div>
          <div style={styles.itemId}>{selectedItem.id}</div>
          <div style={styles.itemType}>{TYPE_LABELS[selectedItem.type]}</div>
        </div>

        {/* Action buttons */}
        <div style={styles.btnRow}>
          <button style={styles.btn('#1d6fa8')} onClick={handlePrintLabel}>
            🖨️ הדפס תווית
          </button>
          <button style={styles.btn('#0e6655')} onClick={handleDownloadPNG}>
            📥 הורד PNG
          </button>
          <button style={styles.btn('#7b2d8b')} onClick={handlePrintLabel}>
            🖨️ הדפס 6 תוויות
          </button>
        </div>
      </div>

      {/* Hidden print area — 6 labels on A4 (2 col × 3 row) */}
      <div id="qr-print-area" style={{ display: 'none' }}>
        <div className="qr-label-grid">
          {printLabels.map((item, idx) => (
            <div key={idx} className="qr-label-cell">
              <QRCodeSVG
                value={buildDeepLink(item)}
                size={140}
                level="H"
                includeMargin={true}
              />
              <div className="qr-label-name">{item.name}</div>
              <div className="qr-label-id">{item.id}</div>
              <div className="qr-label-type">{TYPE_LABELS[item.type]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
