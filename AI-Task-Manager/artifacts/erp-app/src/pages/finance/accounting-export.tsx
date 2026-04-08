import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const EXPORT_TYPES = [
  { id: "all", label: "ייצוא מאוחד (חשבשבת)", description: "כל הנתונים בקובץ אחד — מומלץ", icon: "📦", filename: "all.csv" },
  { id: "invoices", label: "חשבוניות לקוחות", description: "חשבוניות מכירה בלבד", icon: "🧾", filename: "invoices.csv" },
  { id: "payments", label: "תשלומים שהתקבלו", description: "תשלומי לקוחות בלבד", icon: "💳", filename: "payments.csv" },
  { id: "expenses", label: "הוצאות ספקים", description: "חשבוניות קניה בלבד", icon: "📋", filename: "expenses.csv" },
];

interface ExportSummary {
  period: { month: number; year: number; startDate: string; endDate: string };
  counts: { customer_invoices: number; customer_payments: number; supplier_invoices: number };
  warnings: string[];
  ready: boolean;
}

export default function AccountingExportPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [exportType, setExportType] = useState("all");
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/accounting-export/summary?month=${month}&year=${year}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "שגיאה בטעינת הנתונים" }));
        setError(err.error || "שגיאה בטעינת הנתונים");
        setSummary(null);
      } else {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      setError("שגיאת רשת — בדוק חיבור לשרת");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [month, year]);

  const handleDownload = async () => {
    const selected = EXPORT_TYPES.find(e => e.id === exportType);
    if (!selected) return;

    setDownloading(true);
    try {
      const url = `/api/accounting-export/${selected.filename}?month=${month}&year=${year}`;
      const res = await authFetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "שגיאה בייצוא" }));
        setError(err.error || "שגיאה בייצוא");
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const heName = `${selected.label}_${String(month).padStart(2, "0")}_${year}.csv`;
      link.download = heName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("שגיאה בהורדת הקובץ");
    } finally {
      setDownloading(false);
    }
  };

  const totalRecords = summary
    ? summary.counts.customer_invoices + summary.counts.customer_payments + summary.counts.supplier_invoices
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span>📤</span>
          ייצוא חשבונאי לחשבשבת / פריורטי
        </h1>
        <p className="text-muted-foreground mt-1">
          ייצוא נתונים פיננסיים חודשיים בפורמט CSV לייבוא בתוכנת הנהלת חשבונות ישראלית
        </p>
      </div>

      {/* Period Selector */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <h2 className="text-base font-semibold mb-4 text-foreground">בחר תקופה</h2>
        <div className="flex gap-4 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-muted-foreground">חודש</label>
            <select
              className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={month}
              onChange={(e) => setMonth(Number((e.target as HTMLSelectElement).value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-muted-foreground">שנה</label>
            <select
              className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={year}
              onChange={(e) => setYear(Number((e.target as HTMLSelectElement).value))}
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchSummary}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? "טוען..." : "רענן"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-4 mb-5 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{summary.counts.customer_invoices}</div>
              <div className="text-xs text-muted-foreground mt-1">🧾 חשבוניות לקוחות</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{summary.counts.customer_payments}</div>
              <div className="text-xs text-muted-foreground mt-1">💳 תשלומים שהתקבלו</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{summary.counts.supplier_invoices}</div>
              <div className="text-xs text-muted-foreground mt-1">📋 חשבוניות ספקים</div>
            </div>
          </div>

          {/* Warnings */}
          {summary.warnings.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-5">
              <h3 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-2">⚠️ אזהרות לפני ייצוא</h3>
              <ul className="space-y-1">
                {summary.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300 flex gap-2">
                    <span>•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                מומלץ לתקן את הנתונים החסרים לפני הייצוא לצורך תאימות מלאה עם רשות המיסים
              </p>
            </div>
          )}

          {summary.warnings.length === 0 && totalRecords > 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-5 flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">הנתונים מוכנים לייצוא</p>
                <p className="text-xs text-muted-foreground">סה"כ {totalRecords} רשומות ל-{MONTHS[month - 1]} {year}</p>
              </div>
            </div>
          )}

          {totalRecords === 0 && (
            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-5 text-center text-muted-foreground text-sm">
              אין נתונים לתקופה הנבחרת — {MONTHS[month - 1]} {year}
            </div>
          )}
        </>
      )}

      {/* Export Type Selector */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <h2 className="text-base font-semibold mb-4 text-foreground">סוג הייצוא</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXPORT_TYPES.map(et => (
            <button
              key={et.id}
              onClick={() => setExportType(et.id)}
              className={`text-right p-4 rounded-lg border-2 transition ${
                exportType === et.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 bg-background"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{et.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm text-foreground">{et.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{et.description}</div>
                </div>
                {exportType === et.id && (
                  <span className="text-primary text-sm">✓</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Download Button */}
      <div className="flex gap-3 items-center justify-between flex-wrap">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">פורמט:</span> CSV עם BOM (UTF-8) — תואם Excel וחשבשבת
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading || loading || totalRecords === 0}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition ${
            totalRecords === 0 || downloading
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          }`}
        >
          {downloading ? (
            <>
              <span className="animate-spin">⏳</span>
              מוריד...
            </>
          ) : (
            <>
              <span>⬇️</span>
              הורד קובץ CSV
            </>
          )}
        </button>
      </div>

      {/* Info Section */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">מידע לגבי הייצוא</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="font-medium text-foreground">עמודות לדרישות רשות המיסים</p>
            <p>• מספר חשבונית / מסמך</p>
            <p>• תאריך מסמך</p>
            <p>• מספר עוסק מורשה / ח.פ.</p>
            <p>• סכום לפני מע"מ</p>
            <p>• סכום מע"מ (17%)</p>
            <p>• סה"כ כולל מע"מ</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">הוראות ייבוא בחשבשבת</p>
            <p>• פתח חשבשבת ← ייבוא ← ייבוא CSV</p>
            <p>• בחר את הקובץ שהורד</p>
            <p>• התאם עמודות לפי שמות הכותרות</p>
            <p>• לייבוא מפורט: ראה המדריך הטכני</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
          💡 <strong>טיפ:</strong> לייצוא מלא מומלץ לבחור "ייצוא מאוחד" הכולל את כל סוגי המסמכים בקובץ אחד.
          המדריך המלא לייבוא בחשבשבת נמצא ב: <code className="bg-muted px-1 rounded">DOCUMENTS/ACCOUNTING_INTEGRATION.md</code>
        </div>
      </div>
    </div>
  );
}
