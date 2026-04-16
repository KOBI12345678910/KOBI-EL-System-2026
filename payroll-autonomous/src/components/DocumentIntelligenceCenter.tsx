import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type DocRow = { id: number; document_number: string; filename: string; document_type?: string | null; classification_status?: string | null; ocr_status?: string | null; created_at: string };
type OCRRunRow = { id: number; run_number: string; document_id: number; engine_name: string; state: string; started_at?: string | null; finished_at?: string | null };
type ClassificationRunRow = { id: number; run_number: string; document_id: number; predicted_class?: string | null; confidence_score?: number | null; state: string };
type ExtractionRunRow = { id: number; run_number: string; document_id: number; extractor_name: string; state: string };
type KnowledgeCardRow = { id: number; card_number: string; document_id?: number | null; title: string; summary_text?: string | null; classification?: string | null; confidence_score?: number | null; published: boolean };

type DocumentIntelligencePayload = { documents: DocRow[]; ocr_runs: OCRRunRow[]; classification_runs: ClassificationRunRow[]; extraction_runs: ExtractionRunRow[]; knowledge_cards: KnowledgeCardRow[] };

function formatDateTime(value?: string | null): string { if (!value) return "\u2014"; try { return new Date(value).toLocaleString("he-IL"); } catch { return value; } }

function badgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["completed", "classified", "published", "success"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["failed", "error", "rejected"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["queued", "running", "pending", "processing"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function Badge({ value }: { value?: string | null }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "\u2014"}</span>; }

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">{title}</div><div className="p-5">{children}</div></div>);
}

type Tab = "documents" | "ocr" | "classification" | "extraction" | "cards";

async function fetchDocumentIntelligenceCenter(): Promise<DocumentIntelligencePayload> {
  const res = await fetch("/api/documents/intelligence-center", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch document intelligence center: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const documentIntelligenceCenterQueryKey = () => ["documentIntelligenceCenter"] as const;

export default function DocumentIntelligenceCenter() {
  const [tab, setTab] = useState<Tab>("documents");
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: documentIntelligenceCenterQueryKey(), queryFn: fetchDocumentIntelligenceCenter, refetchInterval: 45_000 });

  if (query.isLoading) return <div className="p-6 text-white">Loading document intelligence center...</div>;
  if (query.isError) return (<div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Document Intelligence Center</div></div>);

  const documents = query.data?.documents ?? [];
  const ocrRuns = query.data?.ocr_runs ?? [];
  const classificationRuns = query.data?.classification_runs ?? [];
  const extractionRuns = query.data?.extraction_runs ?? [];
  const cards = query.data?.knowledge_cards ?? [];

  const searchFilter = (text: string) => text.toLowerCase().includes(search.toLowerCase());
  const filteredDocs = useMemo(() => documents.filter((d) => searchFilter(`${d.document_number} ${d.filename} ${d.document_type || ""}`)), [documents, search]);
  const filteredCards = useMemo(() => cards.filter((c) => searchFilter(`${c.card_number} ${c.title} ${c.summary_text || ""}`)), [cards, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Document Intelligence Center</h1>
              <div className="mt-2 text-sm text-slate-600">OCR, classification, extraction, relation mapping, chunks, knowledge cards, document AI pipeline.</div>
            </div>
            <div className="flex gap-2">
              <input className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9..." />
              <button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">\u05E8\u05E2\u05E0\u05DF</button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["documents", "ocr", "classification", "extraction", "cards"] as Tab[]).map((t) => {
            const counts: Record<Tab, number> = { documents: documents.length, ocr: ocrRuns.length, classification: classificationRuns.length, extraction: extractionRuns.length, cards: cards.length };
            return <button key={t} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === t ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"}`} onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})</button>;
          })}
        </div>

        {tab === "documents" && (<Panel title="Documents"><div className="space-y-3">{filteredDocs.map((d) => (<div key={d.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><div className="font-bold text-slate-900">{d.filename}</div><div className="mt-2 text-sm text-slate-600">{d.document_number} &bull; Type: {d.document_type || "\u2014"} &bull; Created: {formatDateTime(d.created_at)}</div></div><div className="flex flex-wrap gap-2"><Badge value={d.classification_status} /><Badge value={d.ocr_status} /></div></div></div>))}</div></Panel>)}

        {tab === "ocr" && (<Panel title="OCR Runs"><div className="space-y-3">{ocrRuns.map((r) => (<div key={r.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{r.run_number}</div><div className="mt-2 text-sm text-slate-600">Document #{r.document_id} &bull; Engine: {r.engine_name}</div><div className="mt-1 text-sm text-slate-600">Started: {formatDateTime(r.started_at)} &bull; Finished: {formatDateTime(r.finished_at)}</div></div><Badge value={r.state} /></div></div>))}</div></Panel>)}

        {tab === "classification" && (<Panel title="Classification Runs"><div className="space-y-3">{classificationRuns.map((r) => (<div key={r.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{r.run_number}</div><div className="mt-2 text-sm text-slate-600">Document #{r.document_id} &bull; Class: {r.predicted_class || "\u2014"} &bull; Confidence: {r.confidence_score ?? "\u2014"}</div></div><Badge value={r.state} /></div></div>))}</div></Panel>)}

        {tab === "extraction" && (<Panel title="Extraction Runs"><div className="space-y-3">{extractionRuns.map((r) => (<div key={r.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{r.run_number}</div><div className="mt-2 text-sm text-slate-600">Document #{r.document_id} &bull; Extractor: {r.extractor_name}</div></div><Badge value={r.state} /></div></div>))}</div></Panel>)}

        {tab === "cards" && (<Panel title="Knowledge Cards"><div className="space-y-3">{filteredCards.map((c) => (<div key={c.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="font-bold text-slate-900">{c.title}</div><div className="mt-2 text-sm text-slate-600">{c.card_number} &bull; Document #{c.document_id || "\u2014"} &bull; Class: {c.classification || "\u2014"} &bull; Confidence: {c.confidence_score ?? "\u2014"}</div><div className="mt-2 text-sm text-slate-700">{c.summary_text || "\u2014"}</div></div><Badge value={c.published ? "published" : "draft"} /></div></div>))}</div></Panel>)}
      </div>
    </div>
  );
}
