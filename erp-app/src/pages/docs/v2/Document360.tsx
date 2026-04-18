import { useRoute, Link } from "wouter";
import { useState } from "react";
import { useDetail, useList, StatusBadge, Loading, ErrorBox, formatDate } from "./_shared";

const TABS = [
  { id: "versions", label: "גרסאות" },
  { id: "attachments", label: "קבצים מצורפים" },
  { id: "ocr", label: "OCR" },
  { id: "extraction", label: "חילוץ שדות" },
  { id: "classification", label: "סיווג" },
  { id: "signatures", label: "חתימות" },
  { id: "relations", label: "קשרים" },
] as const;

export default function Document360() {
  const [, params] = useRoute<{ id: string }>("/documents/:id");
  const id = params?.id;
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("versions");
  const { data: doc, isLoading, error } = useDetail<any>(["docs", "document", id], `/documents/${id}`, !!id);
  const { data: versions } = useList<any>(["docs", "versions", id], "/document-versions", { document_id: id });
  const { data: atts } = useList<any>(["docs", "atts", id], "/attachments", { document_id: id });
  const { data: ocr } = useList<any>(["docs", "ocr", id], "/ocr-runs", { document_id: id });
  const { data: extr } = useList<any>(["docs", "extr", id], "/extraction-runs", { document_id: id });
  const { data: cls } = useList<any>(["docs", "cls", id], "/classification-runs", { document_id: id });
  const { data: sigs } = useList<any>(["docs", "sigs", id], "/signature-requests", { document_id: id });
  const { data: rels } = useList<any>(["docs", "rels", id], "/document-relations", { from_document_id: id });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!doc) return null;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">מסמך #{doc.document_number}</div>
          <h1 className="text-3xl font-semibold">{doc.filename}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <StatusBadge state={doc.status} />
            {doc.document_type && <span className="rounded bg-indigo-100 text-indigo-900 px-2 py-0.5 text-xs">{doc.document_type}</span>}
            {doc.ocr_status && <span className="rounded bg-blue-100 text-blue-900 px-2 py-0.5 text-xs">OCR: {doc.ocr_status}</span>}
            {doc.signature_status && <span className="rounded bg-emerald-100 text-emerald-900 px-2 py-0.5 text-xs">חתימה: {doc.signature_status}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/documents/${doc.id}/versions`} className="rounded border px-3 py-1.5 text-sm">גרסאות</Link>
          <Link href={`/signature-requests?document_id=${doc.id}`} className="rounded border px-3 py-1.5 text-sm">חתימה</Link>
          <Link href={`/ocr-center?document_id=${doc.id}`} className="rounded border px-3 py-1.5 text-sm">OCR</Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="גרסאות" value={versions?.rows?.length?.toString() ?? "—"} />
        <Kpi label="קבצים מצורפים" value={atts?.rows?.length?.toString() ?? "—"} />
        <Kpi label="ריצות OCR" value={ocr?.rows?.length?.toString() ?? "—"} />
        <Kpi label="בקשות חתימה" value={sigs?.rows?.length?.toString() ?? "—"} />
      </section>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm ${tab === t.id ? "border-b-2 border-indigo-600 text-indigo-700 font-semibold" : "text-gray-600"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === "versions" && (
          <MiniTable cols={["גרסה", "שם קובץ", "נוכחי", "הערות", "נוצר"]}
            rows={(versions?.rows ?? []).map((v: any) => [v.version_number, v.filename, v.is_current ? "✓" : "", v.change_summary ?? "—", formatDate(v.created_at)])} />
        )}
        {tab === "attachments" && (
          <MiniTable cols={["מזהה", "ישות", "מזהה ישות", "נוצר"]}
            rows={(atts?.rows ?? []).map((a: any) => [a.id, a.entity_type, a.entity_id, formatDate(a.attached_at ?? a.created_at)])} />
        )}
        {tab === "ocr" && (
          <MiniTable cols={["מזהה", "ספק", "סטטוס", "דפים", "ביטחון", "הסתיים"]}
            rows={(ocr?.rows ?? []).map((r: any) => [r.id, r.provider ?? "—", r.status, r.pages_processed ?? "—", r.confidence_avg ?? "—", formatDate(r.completed_at)])} />
        )}
        {tab === "extraction" && (
          <MiniTable cols={["מזהה", "מחלץ", "סטטוס", "ביטחון", "הסתיים"]}
            rows={(extr?.rows ?? []).map((r: any) => [r.id, r.extractor_name ?? "—", r.status, r.confidence_avg ?? "—", formatDate(r.completed_at)])} />
        )}
        {tab === "classification" && (
          <MiniTable cols={["מזהה", "מסווג", "קטגוריה", "ביטחון", "סטטוס", "הסתיים"]}
            rows={(cls?.rows ?? []).map((r: any) => [r.id, r.classifier_name ?? "—", r.predicted_category ?? "—", r.confidence ?? "—", r.status, formatDate(r.completed_at)])} />
        )}
        {tab === "signatures" && (
          <MiniTable cols={["מזהה בקשה", "ספק", "סטטוס", "חתמו", "מתוך", "נשלח"]}
            rows={(sigs?.rows ?? []).map((r: any) => [r.request_number, r.provider ?? "—", r.status, r.signed_count, r.total_signers, formatDate(r.sent_at)])} />
        )}
        {tab === "relations" && (
          <MiniTable cols={["יעד", "סוג קשר", "הערות", "נוצר"]}
            rows={(rels?.rows ?? []).map((r: any) => [r.to_document_id, r.relation_type, r.notes ?? "—", formatDate(r.created_at)])} />
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded border bg-white p-4">{children}</div>;
}
function MiniTable({ cols, rows }: { cols: string[]; rows: (string | number | null | undefined)[][] }) {
  if (!rows || rows.length === 0) return <div className="text-sm text-gray-400">—</div>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          {cols.map((c) => <th key={c} className="p-2 text-right text-xs font-semibold text-gray-600">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-b-0">{r.map((v, j) => <td key={j} className="p-2">{v ?? "—"}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
