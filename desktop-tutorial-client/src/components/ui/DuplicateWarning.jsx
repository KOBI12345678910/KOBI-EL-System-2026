export default function DuplicateWarning({ duplicates, onForce, onCancel }) {
  if (!duplicates || duplicates.length === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1">
          <h4 className="font-bold text-yellow-800 mb-1">חשבונית כפולה אפשרית!</h4>
          <p className="text-sm text-yellow-700 mb-3">נמצאו חשבוניות דומות במערכת:</p>
          <div className="space-y-2 mb-3">
            {duplicates.map(d => (
              <div key={d.id} className="bg-yellow-100 rounded-lg p-2 text-sm">
                <span className="font-medium">{d.supplier_name}</span>
                {d.invoice_number && <span className="text-yellow-700 mr-2">#{d.invoice_number}</span>}
                <span className="text-yellow-700 mr-2">₪{d.amount?.toLocaleString()}</span>
                <span className="text-yellow-600 mr-2">{d.invoice_date}</span>
                <span className="text-xs bg-yellow-200 px-1.5 py-0.5 rounded">
                  {d.match_type === 'exact_number' ? 'מספר זהה' : 'סכום ותאריך דומים'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onForce} className="px-4 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm">
              צור בכל זאת
            </button>
            <button onClick={onCancel} className="px-4 py-1.5 bg-white text-yellow-700 border border-yellow-300 rounded-lg hover:bg-yellow-50 text-sm">
              בטל
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
