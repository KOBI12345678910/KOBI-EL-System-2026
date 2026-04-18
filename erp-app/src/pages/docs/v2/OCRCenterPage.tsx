import { Link } from "wouter";
import { useList, Loading, ErrorBox, StatusBadge, formatDate } from "./_shared";

export default function OCRCenterPage() {
  const { data: queued, isLoading: l1, error: e1 } = useList<any>(["docs", "ocr", "queued"], "/ocr-runs", { status: "queued", limit: 20 });
  const { data: running, isLoading: l2, error: e2 } = useList<any>(["docs", "ocr", "running"], "/ocr-runs", { status: "running", limit: 20 });
  const { data: failed, isLoading: l3, error: e3 } = useList<any>(["docs", "ocr", "failed"], "/ocr-runs", { status: "failed", limit: 20 });
  const { data: complete, isLoading: l4, error: e4 } = useList<any>(["docs", "ocr", "complete"], "/ocr-runs", { status: "complete", limit: 20 });

  const err = e1 || e2 || e3 || e4;
  const loading = l1 || l2 || l3 || l4;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">מרכז OCR</h1>
        <Link href="/ocr-runs" className="text-indigo-600 text-sm">לכל הריצות</Link>
      </div>
      {loading && <Loading />}
      {err && <ErrorBox err={err} />}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="בתור" value={queued?.total?.toString() ?? queued?.rows?.length?.toString() ?? "—"} tone="gray" />
        <Kpi label="רצות" value={running?.total?.toString() ?? running?.rows?.length?.toString() ?? "—"} tone="blue" />
        <Kpi label="הושלמו" value={complete?.total?.toString() ?? complete?.rows?.length?.toString() ?? "—"} tone="emerald" />
        <Kpi label="נכשלו" value={failed?.total?.toString() ?? failed?.rows?.length?.toString() ?? "—"} tone="red" />
      </section>
      <Section title="כשלים אחרונים" rows={failed?.rows} />
      <Section title="ריצות רצות" rows={running?.rows} />
      <Section title="הושלמו לאחרונה" rows={complete?.rows} />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "gray" | "blue" | "emerald" | "red" }) {
  const bg = {
    gray: "bg-gray-50",
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    red: "bg-red-50",
  }[tone];
  return (
    <div className={`rounded border p-4 ${bg}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows?: any[] }) {
  return (
    <div className="rounded border bg-white">
      <div className="border-b bg-gray-50 px-4 py-2 font-semibold">{title}</div>
      <div className="p-4">
        {!rows || rows.length === 0 ? <div className="text-sm text-gray-400">אין רשומות</div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="p-2 text-right">מזהה</th><th className="p-2 text-right">מסמך</th><th className="p-2 text-right">ספק</th><th className="p-2 text-right">סטטוס</th><th className="p-2 text-right">דפים</th><th className="p-2 text-right">הסתיים</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">{r.document_id}</td>
                  <td className="p-2">{r.provider ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.pages_processed ?? "—"}</td>
                  <td className="p-2">{formatDate(r.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
