import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  AlertCircle, CheckCircle2, Clock, X, Save, FileCheck,
  FileSearch, AlertTriangle, Award, ArrowUpDown, Printer, Shield,
  FlaskConical, Building2,
} from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { authFetch } from "@/lib/utils";

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

/* ── MTC / Material Cert types & helpers (Task #236) ── */
const STATUS_COLORS: Record<string, string> = {
  valid: "bg-green-500/20 text-green-300",
  expired: "bg-red-500/20 text-red-300",
  pending: "bg-yellow-500/20 text-yellow-300",
  revoked: "bg-gray-500/20 text-gray-300",
};
const STATUS_LABELS: Record<string, string> = {
  valid: "תקף",
  expired: "פג תוקף",
  pending: "ממתין",
  revoked: "מבוטל",
};
const CERT_TYPES = ["MTC", "CoA", "CoC", "3.1", "3.2", "EN10204"];

interface MaterialCert {
  id: number;
  certificate_number: string;
  cert_type: string;
  material_name: string;
  batch_reference: string;
  supplier_name: string;
  issue_date: string;
  expiry_date: string;
  grade: string;
  standard: string;
  heat_number: string;
  mill_name: string;
  status: string;
  notes: string;
}

const emptyMtcForm = {
  certificateNumber: "", certType: "MTC", materialName: "",
  batchReference: "", supplierName: "", issueDate: "",
  expiryDate: "", grade: "", standard: "",
  heatNumber: "", millName: "", status: "valid", notes: ""
};

function isExpiringSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

function isExpired(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

/* ── Quality Certificate types & helpers (Task #234) ── */
interface QualityCertificate {
  id: number;
  cert_number: string;
  cert_type: string;
  inspection_id?: number;
  batch_reference?: string;
  product_name?: string;
  material_name?: string;
  supplier_name?: string;
  inspector_name?: string;
  test_results?: TestResult[] | string;
  overall_result: string;
  remarks?: string;
  cert_status: string;
  issued_at: string;
  expiry_date?: string;
}

interface TestResult {
  parameterName: string;
  measuredValue?: number;
  minValue?: number;
  maxValue?: number;
  unit?: string;
  result: string;
  notes?: string;
}

const certTypeColors: Record<string, string> = {
  CoC: "bg-blue-500/20 text-blue-400",
  CoQ: "bg-purple-500/20 text-purple-400",
  MTC: "bg-cyan-500/20 text-cyan-400",
};

const resultMap: Record<string, { label: string; color: string }> = {
  pass: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  fail: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
};

const qcStatusMap: Record<string, { label: string; color: string }> = {
  issued: { label: "תקף", color: "bg-green-500/20 text-green-400" },
  revoked: { label: "מבוטל", color: "bg-red-500/20 text-red-400" },
  expired: { label: "פג תוקף", color: "bg-muted/20 text-muted-foreground" },
};

/* ── CertificatePrint component (Task #234) ── */
function CertificatePrint({ cert }: { cert: QualityCertificate }) {
  const testResults: TestResult[] = Array.isArray(cert.test_results)
    ? cert.test_results
    : typeof cert.test_results === "string"
    ? (() => { try { return JSON.parse(cert.test_results as string); } catch { return []; } })()
    : [];

  return (
    <div id="cert-print" className="bg-white text-black p-8 min-h-[700px] font-sans" dir="rtl"
      style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13 }}>
      <div style={{ borderBottom: "3px solid #1a5276", paddingBottom: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a5276", marginBottom: 4 }}>
              {cert.cert_type === "CoC" ? "Certificate of Conformance" :
               cert.cert_type === "CoQ" ? "Certificate of Quality" :
               "Mill Test Certificate"}
            </h1>
            <h2 style={{ fontSize: 16, color: "#555", fontWeight: 400 }}>
              {cert.cert_type === "CoC" ? "תעודת התאמה" :
               cert.cert_type === "CoQ" ? "תעודת איכות" :
               "תעודת בדיקת מפעל"}
            </h2>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a5276" }}>{cert.cert_number}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              הונפקה: {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString("he-IL") : "—"}
            </div>
            {cert.expiry_date && <div style={{ fontSize: 11, color: "#888" }}>תפוגה: {cert.expiry_date}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {[
          { label: "מוצר / חומר", value: cert.product_name || cert.material_name },
          { label: "ספק", value: cert.supplier_name },
          { label: "אצווה / LOT", value: cert.batch_reference },
          { label: "בודק מאשר", value: cert.inspector_name },
        ].map((item, i) => (
          <div key={i} style={{ borderBottom: "1px solid #eee", paddingBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{item.value || "—"}</div>
          </div>
        ))}
      </div>

      {testResults.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a5276", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>תוצאות בדיקה</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f0f4f8" }}>
                {["פרמטר", "ערך מדוד", "מינימום", "מקסימום", "יחידה", "תוצאה"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, borderBottom: "2px solid #1a5276" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {testResults.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eee" }}>{r.parameterName}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eee", fontWeight: 600 }}>{r.measuredValue ?? "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eee" }}>{r.minValue ?? "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eee" }}>{r.maxValue ?? "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eee" }}>{r.unit || "—"}</td>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid #eee", color: r.result === "pass" ? "#16a34a" : r.result === "fail" ? "#dc2626" : "#ca8a04", fontWeight: 700 }}>
                    {r.result === "pass" ? "✓ עבר" : r.result === "fail" ? "✗ נכשל" : "ממתין"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: "12px 16px", background: cert.overall_result === "pass" ? "#f0fdf4" : "#fef2f2", border: `1px solid ${cert.overall_result === "pass" ? "#16a34a" : "#dc2626"}`, borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>תוצאה כוללת</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: cert.overall_result === "pass" ? "#16a34a" : "#dc2626" }}>
            {cert.overall_result === "pass" ? "✓ עומד בדרישות" : "✗ אינו עומד בדרישות"}
          </div>
        </div>
        {cert.overall_result === "pass" && (
          <div style={{ fontSize: 32, color: "#16a34a" }}>✓</div>
        )}
      </div>

      {cert.remarks && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "#1a5276", textTransform: "uppercase", marginBottom: 4 }}>הערות</h3>
          <p style={{ color: "#555", fontSize: 12 }}>{cert.remarks}</p>
        </div>
      )}

      <div style={{ borderTop: "2px solid #eee", paddingTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 40 }}>
        <div>
          <div style={{ borderTop: "1px solid #333", paddingTop: 6, fontSize: 11, color: "#888" }}>חתימת הבודק</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{cert.inspector_name || "___________________"}</div>
        </div>
        <div>
          <div style={{ borderTop: "1px solid #333", paddingTop: 6, fontSize: 11, color: "#888" }}>חתימת מנהל האיכות</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>___________________</div>
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 9, color: "#aaa", textAlign: "center" }}>
        מסמך זה הונפק ממערכת ניהול האיכות · {cert.cert_number} · {cert.issued_at ? new Date(cert.issued_at).toLocaleString("he-IL") : ""}
      </div>
    </div>
  );
}

/* ── Quality Certificates Section (Task #234 — inspection-based) ── */
function QualityCertSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState("issued_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewCert, setViewCert] = useState<QualityCertificate | null>(null);
  const pagination = useSmartPagination(25);

  const { data: certs = [], isLoading: loading, error: queryError } = useQuery<QualityCertificate[]>({
    queryKey: ["quality-certificates"],
    queryFn: async () => {
      const res = await authFetch(`${API}/quality-certificates`);
      if (!res.ok) return [];
      return safeArray(await res.json());
    },
    staleTime: 60_000,
  });

  const error = queryError ? (queryError as Error).message : null;

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = certs.filter(c =>
      (filterStatus === "all" || c.cert_status === filterStatus) &&
      (filterType === "all" || c.cert_type === filterType) &&
      (!search || [c.cert_number, c.product_name, c.material_name, c.batch_reference, c.supplier_name, c.inspector_name]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [certs, search, filterStatus, filterType, sortField, sortDir]);

  const printCert = () => {
    const printContent = document.getElementById("cert-print");
    if (!printContent) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>תעודת איכות</title>
          <style>body{margin:0;padding:0;font-family:"Segoe UI",Arial,sans-serif;}@media print{body{margin:0;}}</style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  const kpis = [
    { label: "סה\"כ תעודות", value: certs.length, icon: Award, color: "text-yellow-400" },
    { label: "CoC", value: certs.filter(c => c.cert_type === "CoC").length, icon: Shield, color: "text-blue-400" },
    { label: "CoQ", value: certs.filter(c => c.cert_type === "CoQ").length, icon: FlaskConical, color: "text-purple-400" },
    { label: "MTC", value: certs.filter(c => c.cert_type === "MTC").length, icon: Building2, color: "text-cyan-400" },
    { label: "תעודות תקפות", value: certs.filter(c => c.cert_status === "issued").length, icon: CheckCircle2, color: "text-green-400" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground">Certificate of Conformance · Certificate of Quality · Mill Test Certificates</p>
        <ExportDropdown data={filtered}
          headers={{ cert_number: "מספר", cert_type: "סוג", product_name: "מוצר", batch_reference: "אצווה", overall_result: "תוצאה", cert_status: "סטטוס", issued_at: "הונפקה" }}
          filename="quality_certificates" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, מוצר, ספק..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          <option value="CoC">CoC</option>
          <option value="CoQ">CoQ</option>
          <option value="MTC">MTC</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(qcStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="animate-pulse"><div className="h-12 bg-muted/20" />{Array.from({length:5}).map((_,i)=><div key={i} className="h-14 border-t border-border/20 bg-muted/10" />)}</div>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין תעודות איכות</p>
          <p className="text-sm mt-1">תעודות מונפקות מתוך בדיקות סופיות במעבדת הבדיקות</p>
        </div>
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    {[
                      { key: "cert_number", label: "מספר תעודה" },
                      { key: "cert_type", label: "סוג" },
                      { key: "product_name", label: "מוצר / חומר" },
                      { key: "batch_reference", label: "אצווה" },
                      { key: "supplier_name", label: "ספק" },
                      { key: "inspector_name", label: "בודק" },
                      { key: "overall_result", label: "תוצאה" },
                      { key: "cert_status", label: "סטטוס" },
                      { key: "issued_at", label: "הונפקה" },
                    ].map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                        <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginate(filtered).map(c => (
                    <tr key={c.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-yellow-400 font-bold">{c.cert_number}</td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${certTypeColors[c.cert_type] || "bg-muted/20 text-muted-foreground"}`}>{c.cert_type}</Badge></td>
                      <td className="px-4 py-3 text-foreground text-xs max-w-[140px] truncate">{c.product_name || c.material_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{c.batch_reference || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[100px] truncate">{c.supplier_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.inspector_name || "—"}</td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${resultMap[c.overall_result]?.color || "bg-muted/20 text-muted-foreground"}`}>{resultMap[c.overall_result]?.label || c.overall_result}</Badge></td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${qcStatusMap[c.cert_status]?.color || "bg-muted/20 text-muted-foreground"}`}>{qcStatusMap[c.cert_status]?.label || c.cert_status}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{c.issued_at ? new Date(c.issued_at).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setViewCert(c)} className="p-1.5 hover:bg-muted rounded-lg" title="צפייה ודפוס">
                            <Eye className="w-3.5 h-3.5 text-yellow-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      <AnimatePresence>
        {viewCert && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewCert(null)}>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b px-5 py-3 flex justify-between items-center z-10" dir="rtl">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-500" />
                  <span className="font-bold text-gray-800">{viewCert.cert_number}</span>
                  <Badge className={`text-[10px] ${certTypeColors[viewCert.cert_type] || "bg-gray-100 text-gray-600"}`}>{viewCert.cert_type}</Badge>
                </div>
                <div className="flex gap-2">
                  <button onClick={printCert}
                    className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">
                    <Printer className="w-3.5 h-3.5" /> הדפס
                  </button>
                  <button onClick={() => setViewCert(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <CertificatePrint cert={viewCert} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Material Test Certificates Section (Task #236 — MTC document management) ── */
function MaterialCertSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyMtcForm });
  const [saving, setSaving] = useState(false);

  const [traceSearch, setTraceSearch] = useState("");
  const [traceResult, setTraceResult] = useState<any>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "trace" | "alerts">("list");

  const { data: certs = [], isLoading: loading } = useQuery<MaterialCert[]>({
    queryKey: ["material-certificates"],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/material-certificates`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    return certs.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.certificate_number?.toLowerCase().includes(q) ||
          c.material_name?.toLowerCase().includes(q) ||
          c.batch_reference?.toLowerCase().includes(q) ||
          c.supplier_name?.toLowerCase().includes(q) ||
          c.heat_number?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [certs, search, statusFilter]);

  const pageData = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const expiringList = certs.filter(c => isExpiringSoon(c.expiry_date) && c.status === "valid");
  const expiredList = certs.filter(c => isExpired(c.expiry_date) && c.status === "valid");

  const statCounts = {
    valid: certs.filter(c => c.status === "valid").length,
    expired: certs.filter(c => c.status === "expired").length,
    pending: certs.filter(c => c.status === "pending").length,
    expiringSoon: expiringList.length,
  };

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId ? `${BASE}/material-certificates/${editId}` : `${BASE}/material-certificates`;
      const method = editId ? "PUT" : "POST";
      await authFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setShowForm(false);
      setEditId(null);
      setForm({ ...emptyMtcForm });
      queryClient.invalidateQueries({ queryKey: ["material-certificates"] });
    } catch { } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק תעודה זו?")) return;
    await authFetch(`${BASE}/material-certificates/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["material-certificates"] });
  }

  async function handleTrace() {
    if (!traceSearch.trim()) return;
    setTraceLoading(true);
    try {
      const res = await authFetch(`${BASE}/material-certificates/traceability/batch/${encodeURIComponent(traceSearch)}`);
      const data = await res.json();
      setTraceResult({ type: "batch", data });
    } catch { } finally { setTraceLoading(false); }
  }

  function openEdit(c: MaterialCert) {
    setEditId(c.id);
    setForm({
      certificateNumber: c.certificate_number || "", certType: c.cert_type || "MTC",
      materialName: c.material_name || "", batchReference: c.batch_reference || "",
      supplierName: c.supplier_name || "", issueDate: c.issue_date?.split("T")[0] || "",
      expiryDate: c.expiry_date?.split("T")[0] || "", grade: c.grade || "",
      standard: c.standard || "", heatNumber: c.heat_number || "",
      millName: c.mill_name || "", status: c.status || "valid", notes: c.notes || ""
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Mill Test Certificates, CoA, CoC ועקיבות חומרים</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab(t => t === "trace" ? "list" : "trace")}>
            <FileSearch className="w-4 h-4 ml-1" />עקיבות
          </Button>
          <Button variant="outline" size="sm" onClick={() => setActiveTab(t => t === "alerts" ? "list" : "alerts")}>
            <AlertTriangle className="w-4 h-4 ml-1" />אזהרות {expiringList.length + expiredList.length > 0 && `(${expiringList.length + expiredList.length})`}
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ ...emptyMtcForm }); }}>
            <Plus className="w-4 h-4 ml-1" />הוספת תעודה
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "valid", icon: CheckCircle2, color: "text-green-400", label: "תקפות" },
          { key: "expiringSoon", icon: Clock, color: "text-yellow-400", label: "פג בקרוב" },
          { key: "expired", icon: AlertCircle, color: "text-red-400", label: "פגות תוקף" },
          { key: "pending", icon: FileCheck, color: "text-blue-400", label: "ממתינות" },
        ].map(({ key, icon: Icon, color, label }) => (
          <Card key={key} className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <div className="text-2xl font-bold text-foreground">{statCounts[key as keyof typeof statCounts]}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Traceability tab */}
      {activeTab === "trace" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader><CardTitle className="text-foreground text-base">חיפוש עקיבות</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חפש לפי אסמכתת אצווה, מספר חום..." value={traceSearch}
                  onChange={e => setTraceSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleTrace()}
                  className="pr-9 bg-background/50" />
              </div>
              <Button onClick={handleTrace} disabled={traceLoading}>חפש</Button>
            </div>
            {traceResult && (
              <div>
                <h3 className="font-medium text-foreground mb-3">תוצאות עקיבות לאצווה: {traceSearch}</h3>
                {traceResult.data.length === 0 ? (
                  <p className="text-muted-foreground">לא נמצאו תעודות עבור אסמכתה זו</p>
                ) : (
                  <div className="space-y-2">
                    {traceResult.data.map((c: MaterialCert) => (
                      <div key={c.id} className="p-3 bg-background/30 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="font-medium text-foreground">{c.certificate_number}</span>
                          <span className="text-sm text-muted-foreground mr-2">— {c.material_name} — {c.cert_type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.supplier_name && <span className="text-xs text-muted-foreground">{c.supplier_name}</span>}
                          <Badge className={STATUS_COLORS[c.status] || ""}>{STATUS_LABELS[c.status] || c.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alerts tab */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          {expiredList.length > 0 && (
            <Card className="bg-red-900/20 border-red-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-300 text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />תעודות פגות תוקף ({expiredList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {expiredList.map(c => (
                    <div key={c.id} className="flex justify-between p-2 bg-red-900/20 rounded-lg">
                      <span className="text-foreground">{c.certificate_number} — {c.material_name}</span>
                      <span className="text-sm text-red-300">{c.expiry_date ? new Date(c.expiry_date).toLocaleDateString("he-IL") : "—"}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {expiringList.length > 0 && (
            <Card className="bg-yellow-900/20 border-yellow-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-yellow-300 text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />פוגות תוקף בקרוב ({expiringList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {expiringList.map(c => (
                    <div key={c.id} className="flex justify-between p-2 bg-yellow-900/20 rounded-lg">
                      <span className="text-foreground">{c.certificate_number} — {c.material_name}</span>
                      <span className="text-sm text-yellow-300">{c.expiry_date ? new Date(c.expiry_date).toLocaleDateString("he-IL") : "—"}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {expiringList.length === 0 && expiredList.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400 opacity-70" />
              <p className="text-lg font-medium">כל התעודות תקפות</p>
            </div>
          )}
        </div>
      )}

      {/* Main list */}
      {activeTab === "list" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חיפוש לפי מספר תעודה, חומר, אצווה..." value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="all">כל הסטטוסים</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="text-center py-16 text-muted-foreground">טוען...</div>
            ) : pageData.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">אין תעודות להצגה</p>
                <p className="text-sm mt-1">לחץ על "הוספת תעודה" כדי להתחיל</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["מספר תעודה", "סוג", "חומר", "אסמכתת אצווה", "ספק", "מספר חום", "הנפקה", "תוקף", "סטטוס", "פעולות"].map(h => (
                        <th key={h} className="text-right p-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map(c => (
                      <tr key={c.id} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${isExpired(c.expiry_date) && c.status === "valid" ? "bg-red-900/10" : isExpiringSoon(c.expiry_date) && c.status === "valid" ? "bg-yellow-900/10" : ""}`}>
                        <td className="p-3 font-medium text-foreground">{c.certificate_number}</td>
                        <td className="p-3 text-muted-foreground">{c.cert_type}</td>
                        <td className="p-3 text-foreground">{c.material_name}</td>
                        <td className="p-3 text-muted-foreground">{c.batch_reference || "—"}</td>
                        <td className="p-3 text-muted-foreground">{c.supplier_name || "—"}</td>
                        <td className="p-3 text-muted-foreground">{c.heat_number || "—"}</td>
                        <td className="p-3 text-muted-foreground">{c.issue_date ? new Date(c.issue_date).toLocaleDateString("he-IL") : "—"}</td>
                        <td className={`p-3 ${isExpired(c.expiry_date) ? "text-red-300" : isExpiringSoon(c.expiry_date) ? "text-yellow-300" : "text-muted-foreground"}`}>
                          {c.expiry_date ? new Date(c.expiry_date).toLocaleDateString("he-IL") : "—"}
                        </td>
                        <td className="p-3"><Badge className={STATUS_COLORS[c.status] || "bg-gray-500/20"}>{STATUS_LABELS[c.status] || c.status}</Badge></td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>{filtered.length} תעודות</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
                <span className="px-3 py-1">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-card border-border max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-foreground">{editId ? "עריכת תעודה" : "הוספת תעודה חדשה"}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}><X className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>מספר תעודה *</Label><Input value={form.certificateNumber} onChange={e => setForm(f => ({ ...f, certificateNumber: e.target.value }))} className="bg-background/50" /></div>
                <div>
                  <Label>סוג תעודה</Label>
                  <select value={form.certType} onChange={e => setForm(f => ({ ...f, certType: e.target.value }))}
                    className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><Label>שם חומר *</Label><Input value={form.materialName} onChange={e => setForm(f => ({ ...f, materialName: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>אסמכתת אצווה</Label><Input value={form.batchReference} onChange={e => setForm(f => ({ ...f, batchReference: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>ספק</Label><Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>מפעל / מיל</Label><Input value={form.millName} onChange={e => setForm(f => ({ ...f, millName: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>מספר חום (Heat)</Label><Input value={form.heatNumber} onChange={e => setForm(f => ({ ...f, heatNumber: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>תקן</Label><Input value={form.standard} onChange={e => setForm(f => ({ ...f, standard: e.target.value }))} placeholder="EN 10025, ASTM A36..." className="bg-background/50" /></div>
                <div><Label>ציון / Grade</Label><Input value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} className="bg-background/50" /></div>
                <div>
                  <Label>סטטוס</Label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><Label>תאריך הנפקה</Label><Input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} className="bg-background/50" /></div>
                <div><Label>תאריך תפוגה</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} className="bg-background/50" /></div>
              </div>
              <div className="mt-4">
                <Label>הערות</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground h-16 resize-none" />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>ביטול</Button>
                <Button onClick={handleSave} disabled={saving || !form.certificateNumber || !form.materialName}>
                  <Save className="w-4 h-4 ml-1" />{saving ? "שומר..." : "שמור"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ── Main export with top-level tab switcher ── */
export default function TestCertificates() {
  const [mainTab, setMainTab] = useState<"quality" | "material">("quality");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Award className="text-yellow-400 w-6 h-6" /> תעודות ובדיקות איכות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תעודות איכות ותעודות חומר</p>
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          <button
            onClick={() => setMainTab("quality")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mainTab === "quality" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            תעודות איכות (CoC/CoQ/MTC)
          </button>
          <button
            onClick={() => setMainTab("material")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mainTab === "material" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            תעודות חומר MTC
          </button>
        </div>
      </div>

      {mainTab === "quality" ? <QualityCertSection /> : <MaterialCertSection />}
    </div>
  );
}
