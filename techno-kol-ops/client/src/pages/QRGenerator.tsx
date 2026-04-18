// QR Generator page for techno-kol-ops
// Uses api.qrserver.com for QR image generation (no npm dependency needed)

import React, { useState } from 'react';

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
  ],
  employee: [
    { id: 'EMP-101', name: 'יוסי כהן', type: 'employee' },
    { id: 'EMP-102', name: 'מירי לוי', type: 'employee' },
    { id: 'EMP-103', name: 'אבי מזרחי', type: 'employee' },
  ],
  project: [
    { id: 'PRJ-2025-01', name: 'בניית מפעל חדש - שלב א', type: 'project' },
    { id: 'PRJ-2025-02', name: 'שדרוג קו ייצור #2', type: 'project' },
    { id: 'PRJ-2025-03', name: 'הקמת מחסן אוטומטי', type: 'project' },
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

function buildDeepLink(item: QRItem): string {
  const pathMap: Record<EntityType, string> = {
    material: 'material',
    work_order: 'work-order',
    employee: 'employee',
    project: 'project',
  };
  return `technokolapp://${pathMap[item.type]}/${item.id}`;
}

function getQRImageUrl(data: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=10`;
}

export function QRGenerator() {
  const [activeTab, setActiveTab] = useState<EntityType>('material');
  const [selectedId, setSelectedId] = useState<string>(MOCK_DATA.material[0].id);

  const items = MOCK_DATA[activeTab];
  const selectedItem = items.find(i => i.id === selectedId) ?? items[0];
  const deepLink = buildDeepLink(selectedItem);
  const qrUrl = getQRImageUrl(deepLink, 200);

  const handleTabChange = (tab: EntityType) => {
    setActiveTab(tab);
    setSelectedId(MOCK_DATA[tab][0].id);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = getQRImageUrl(deepLink, 400);
    link.download = `qr-${selectedItem.id}.png`;
    link.target = '_blank';
    link.click();
  };

  return (
    <div className="p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-6 text-blue-300">📲 מחולל QR ותוויות</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700 pb-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-blue-900 text-blue-200 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-800 rounded-xl p-6 max-w-md shadow-lg">
        {/* Select */}
        <label className="block text-sm text-gray-400 mb-2">בחר פריט:</label>
        <select
          className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-gray-100 mb-6"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          dir="rtl"
        >
          {items.map(item => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.id})
            </option>
          ))}
        </select>

        {/* QR Image from CDN */}
        <div className="flex flex-col items-center bg-white rounded-lg p-4 mb-4">
          <img
            src={qrUrl}
            alt={`QR for ${selectedItem.id}`}
            width={200}
            height={200}
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="font-bold text-gray-800 mt-2 text-center">{selectedItem.name}</p>
          <p className="text-gray-500 text-sm font-mono mt-1">{selectedItem.id}</p>
          <p className="text-gray-400 text-xs mt-1">{TYPE_LABELS[selectedItem.type]}</p>
        </div>

        {/* Deep link display */}
        <div className="bg-gray-700 rounded p-2 mb-4 text-xs font-mono text-green-300 break-all">
          {deepLink}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium text-sm transition-colors"
          >
            🖨️ הדפס תווית
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-medium text-sm transition-colors"
          >
            📥 הורד PNG
          </button>
        </div>
      </div>
    </div>
  );
}
