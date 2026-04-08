import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, Clock, Shield, RefreshCw } from "lucide-react";

const API = "/api";

interface ComplianceCert {
  id: number;
  certNumber: string;
  certName: string;
  certType: string;
  status: string;
  linkedSupplier?: string | null;
  supplierCountry?: string | null;
  productName?: string | null;
  issuingAuthority?: string | null;
  issuingCountry?: string | null;
  expiryDate?: string | null;
  issueDate?: string | null;
  fileUrl?: string | null;
  verificationStatus?: string | null;
  isMandatory?: boolean;
  notes?: string | null;
  createdAt: string;
}

interface SupplierDocCert {
  id: number;
  supplierId: number;
  documentName: string;
  documentType: string;
  fileUrl: string | null;
  notes: string | null;
  expiryDate: string | null;
  createdAt: string;
  supplierName?: string;
}

type UnifiedCert = {
  id: string;
  name: string;
  type: string;
  supplierName: string;
  expiryDate: string | null;
  fileUrl: string | null;
  notes: string | null;
  source: "compliance" | "supplier_doc";
  rawStatus?: string;
};

const STATUS_COLORS: Record<string, string> = {
  "בתוקף": "bg-green-500/20 text-green-300 border-green-500/30",
  "עומד לפוג": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "פג תוקף": "bg-red-500/20 text-red-300 border-red-500/30",
  "ממתין": "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

function getExpiryStatus(expiryDate: string | null | undefined): string {
  if (!expiryDate) return "ממתין";
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return "פג תוקף";
  if (days <= 30) return "עומד לפוג";
  return "בתוקף";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL");
}

export default function VendorCompliance() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const { data: complianceCerts, isLoading: loadingCC, refetch: refetchCC } = useQuery({
    queryKey: ["compliance-certificates"],
    queryFn: async () => {
      const r = await authFetch(`${API}/compliance-certificates`);
      return (await r.json()) as ComplianceCert[];
    },
  });

  const { data: supplierDocs, isLoading: loadingDocs, refetch: refetchDocs } = useQuery({
    queryKey: ["supplier-cert-docs"],
    queryFn: async () => {
      const r = await authFetch(`${API}/supplier-documents?documentType=certificate&limit=200`);
      const data = await r.json();
      return Array.isArray(data) ? (data as SupplierDocCert[]) : [];
    },
  });

  const allCerts: UnifiedCert[] = useMemo(() => {
    const fromCC: UnifiedCert[] = (Array.isArray(complianceCerts) ? complianceCerts : []).map((c) => ({
      id: `cc-${c.id}`,
      name: c.certName || c.certNumber,
      type: c.certType,
      supplierName: c.linkedSupplier || "—",
      expiryDate: c.expiryDate || null,
      fileUrl: c.fileUrl || null,
      notes: c.notes || null,
      source: "compliance" as const,
      rawStatus: c.status,
    }));

    const fromDocs: UnifiedCert[] = (Array.isArray(supplierDocs) ? supplierDocs : []).map((d) => ({
      id: `doc-${d.id}`,
      name: d.documentName,
      type: "certificate",
      supplierName: d.supplierName || `ספק #${d.supplierId}`,
      expiryDate: d.expiryDate || null,
      fileUrl: d.fileUrl || null,
      notes: d.notes || null,
      source: "supplier_doc" as const,
    }));

    return [...fromCC, ...fromDocs];
  }, [complianceCerts, supplierDocs]);

  const filtered = useMemo(() => {
    return allCerts.filter((r) => {
      const status = getExpiryStatus(r.expiryDate);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        const matchName = (r.name || "").toLowerCase().includes(term);
        const matchSupplier = (r.supplierName || "").toLowerCase().includes(term);
        const matchType = (r.type || "").toLowerCase().includes(term);
        if (!matchName && !matchSupplier && !matchType) return false;
      }
      return true;
    });
  }, [allCerts, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = { "בתוקף": 0, "עומד לפוג": 0, "פג תוקף": 0, "ממתין": 0 };
    allCerts.forEach((r) => {
      const s = getExpiryStatus(r.expiryDate);
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    return byStatus;
  }, [allCerts]);

  function downloadCSV() {
    const header = ["ספק", "תעודה", "סוג", "סטטוס", "תאריך פקיעה", "הערות"];
    const rows = filtered.map((r) => [
      r.supplierName,
      r.name,
      r.type,
      getExpiryStatus(r.expiryDate),
      formatDate(r.expiryDate),
      r.notes || "",
    ]);
    const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendor-compliance.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function refetch() {
    refetchCC();
    refetchDocs();
  }

  const isLoading = loadingCC || loadingDocs;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">תאימות ספקים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ניהול תעודות ותקנים • {allCerts.length} תעודות
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4 ml-1" />
            רענן
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCSV}>
            <Download className="w-4 h-4 ml-1" />
            ייצוא
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["בתוקף", "עומד לפוג", "פג תוקף", "ממתין"] as const).map((s) => {
          const icons = {
            "בתוקף": <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />,
            "עומד לפוג": <Clock className="w-8 h-8 text-yellow-400 shrink-0" />,
            "פג תוקף": <AlertCircle className="w-8 h-8 text-red-400 shrink-0" />,
            "ממתין": <Shield className="w-8 h-8 text-blue-400 shrink-0" />,
          };
          return (
            <Card
              key={s}
              className="bg-card/50 border-border/50 cursor-pointer hover:border-border transition"
              onClick={() => { setStatusFilter(statusFilter === s ? "all" : s); setPage(1); }}
            >
              <CardContent className="p-4 flex items-center gap-3">
                {icons[s]}
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats[s] || 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {s === "עומד לפוג" ? "עומד לפוג (30 יום)" : s}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(stats["עומד לפוג"] > 0 || stats["פג תוקף"] > 0) && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
              <AlertCircle className="w-5 h-5" />
              תעודות הדורשות תשומת לב
            </div>
            <div className="space-y-1">
              {allCerts
                .filter((r) => ["עומד לפוג", "פג תוקף"].includes(getExpiryStatus(r.expiryDate)))
                .slice(0, 5)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span>
                      {r.supplierName} — {r.name}
                    </span>
                    <Badge className={`${STATUS_COLORS[getExpiryStatus(r.expiryDate)]} border text-xs`}>
                      {getExpiryStatus(r.expiryDate)} • {formatDate(r.expiryDate)}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Input
                placeholder="חיפוש ספק, תעודה או סוג..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pr-3 bg-background/50"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל הסטטוסים</option>
              {["בתוקף", "עומד לפוג", "פג תוקף", "ממתין"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground">טוען תעודות...</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין תעודות להצגה</p>
              <p className="text-sm mt-1">תעודות ותקנים שיועלו יופיעו כאן</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תעודה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">תאריך פקיעה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">הערות</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">קובץ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((row) => {
                    const status = getExpiryStatus(row.expiryDate);
                    return (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3">
                          <div className="font-medium text-foreground">{row.supplierName}</div>
                        </td>
                        <td className="p-3 text-foreground">{row.name}</td>
                        <td className="p-3 text-muted-foreground">{row.type}</td>
                        <td className="p-3 text-foreground">{formatDate(row.expiryDate)}</td>
                        <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">
                          {row.notes || "—"}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            className={`${STATUS_COLORS[status] || "bg-gray-500/20 text-gray-300"} border text-xs`}
                          >
                            {status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {row.fileUrl ? (
                            <a
                              href={row.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline"
                            >
                              הורד
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>
              מציג {Math.min(filtered.length, (page - 1) * perPage + 1)}–{Math.min(filtered.length, page * perPage)} מתוך {filtered.length}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
