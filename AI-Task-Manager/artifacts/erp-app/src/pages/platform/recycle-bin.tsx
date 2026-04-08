import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, RotateCcw, Search, RefreshCw, AlertTriangle, Loader2,
  Database, Filter, X, ShieldAlert, ChevronRight, ChevronLeft,
} from "lucide-react";

interface DeletedRecord {
  id: number;
  table: string;
  tableLabel: string;
  display: string;
  deletedAt: string;
  raw: Record<string, any>;
}

interface TableInfo {
  table: string;
  label: string;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export default function RecycleBin() {
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeletedRecord | null>(null);
  const [isSuperAdmin] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return user?.is_super_admin === true || user?.role === "super_admin";
    } catch { return false; }
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, tabRes] = await Promise.all([
        authFetch("/api/recycle-bin"),
        authFetch("/api/recycle-bin/tables"),
      ]);
      if (recRes.ok) {
        const j = await recRes.json();
        setRecords(j.data || []);
      }
      if (tabRes.ok) {
        const t = await tabRes.json();
        setTables(t || []);
      }
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת סל המיחזור");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let d = [...records];
    if (tableFilter !== "all") d = d.filter(r => r.table === tableFilter);
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(r =>
        r.display.toLowerCase().includes(s) ||
        r.tableLabel.toLowerCase().includes(s) ||
        String(r.id).includes(s)
      );
    }
    return d;
  }, [records, tableFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const handleRestore = async (record: DeletedRecord) => {
    const key = `${record.table}:${record.id}`;
    setRestoring(key);
    setError(null);
    try {
      const res = await authFetch(`/api/recycle-bin/${record.table}/${record.id}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "שגיאה בשחזור");
      }
      setRecords(prev => prev.filter(r => !(r.table === record.table && r.id === record.id)));
    } catch (e: any) {
      setError(e.message);
    }
    setRestoring(null);
  };

  const handlePermanentDelete = async (record: DeletedRecord) => {
    const key = `${record.table}:${record.id}`;
    setDeleting(key);
    setError(null);
    setConfirmDelete(null);
    try {
      const res = await authFetch(`/api/recycle-bin/${record.table}/${record.id}/permanent`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "שגיאה במחיקה קבועה");
      }
      setRecords(prev => prev.filter(r => !(r.table === record.table && r.id === record.id)));
    } catch (e: any) {
      setError(e.message);
    }
    setDeleting(null);
  };

  const byTable = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach(r => { counts[r.table] = (counts[r.table] || 0) + 1; });
    return counts;
  }, [records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-orange-400" />
            סל מיחזור
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            רשומות שנמחקו — ניתן לשחזר או למחוק לצמיתות
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1">
          <RefreshCw className="h-4 w-4" />רענן
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground">סה"כ רשומות</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">{records.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground">טבלאות מושפעות</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{Object.keys(byTable).length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground">הכי עתיר מחיקות</p>
            <p className="text-sm font-bold text-teal-400 mt-1">
              {Object.entries(byTable).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, " ") || "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-yellow-400" />
              <p className="text-[11px] text-muted-foreground">מחיקה קבועה</p>
            </div>
            <p className="text-xs text-yellow-400 mt-1">
              {isSuperAdmin ? "מורשה" : "SUPER_ADMIN בלבד"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="חיפוש..."
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={tableFilter}
                onChange={e => { setTableFilter(e.target.value); setPage(1); }}
                className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="all">כל הטבלאות</option>
                {tables.map(t => (
                  <option key={t.table} value={t.table}>
                    {t.label} {byTable[t.table] ? `(${byTable[t.table]})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {(tableFilter !== "all" || search) && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setTableFilter("all"); setSearch(""); setPage(1); }}
                className="text-red-400 hover:text-red-300 gap-1"
              >
                <X className="h-3 w-3" />נקה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="p-3 text-right text-muted-foreground font-medium">#</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">טבלה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תיאור</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">נמחק</th>
                  <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Database className="h-10 w-10 opacity-30" />
                        <p>סל המיחזור ריק</p>
                      </div>
                    </td>
                  </tr>
                )}
                {pageData.map(record => {
                  const key = `${record.table}:${record.id}`;
                  const isRestoring = restoring === key;
                  const isDeleting = deleting === key;
                  return (
                    <tr key={key} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-blue-400">#{record.id}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs border-border text-gray-300">
                          {record.tableLabel}
                        </Badge>
                      </td>
                      <td className="p-3 text-foreground">{record.display}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        <span title={new Date(record.deletedAt).toLocaleString("he-IL")}>
                          {timeAgo(record.deletedAt)}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRestoring || isDeleting}
                            onClick={() => handleRestore(record)}
                            className="border-teal-500/50 text-teal-400 hover:text-teal-300 hover:border-teal-400 gap-1"
                          >
                            {isRestoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            שחזר
                          </Button>
                          {isSuperAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isRestoring || isDeleting}
                              onClick={() => setConfirmDelete(record)}
                              className="border-red-500/50 text-red-400 hover:text-red-300 hover:border-red-400 gap-1"
                            >
                              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              מחק לצמיתות
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              מציג {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p > totalPages || p < 1) return null;
                return (
                  <Button
                    key={p} variant={p === page ? "default" : "ghost"} size="sm"
                    onClick={() => setPage(p)}
                    className={`h-8 w-8 p-0 ${p === page ? "bg-orange-600 hover:bg-orange-700" : ""}`}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-card border border-red-500/30 rounded-xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-6 w-6 flex-shrink-0" />
              <h2 className="text-lg font-bold">אישור מחיקה קבועה</h2>
            </div>
            <p className="text-gray-300 text-sm">
              פעולה זו תמחק לצמיתות את הרשומה:
            </p>
            <div className="bg-input rounded-lg p-3">
              <p className="text-foreground font-medium">{confirmDelete.display}</p>
              <p className="text-muted-foreground text-xs mt-1">{confirmDelete.tableLabel} — #{confirmDelete.id}</p>
            </div>
            <p className="text-red-400 text-xs font-medium">
              ⚠ לא ניתן לשחזר לאחר מחיקה קבועה!
            </p>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="border-border">
                ביטול
              </Button>
              <Button
                onClick={() => handlePermanentDelete(confirmDelete)}
                className="bg-red-600 hover:bg-red-700 gap-2"
              >
                <Trash2 className="h-4 w-4" />
                מחק לצמיתות
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
