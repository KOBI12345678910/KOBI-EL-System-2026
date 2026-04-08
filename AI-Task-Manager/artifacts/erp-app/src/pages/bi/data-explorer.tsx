import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Download, Play, Save, Trash2, ChevronRight, ChevronLeft,
  Database, Table2, Filter, ArrowUpDown, X, RefreshCw, Link2, FileText,
  Columns, BookOpen, MoreHorizontal
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api";

const OPERATORS = [
  { value: "eq", label: "שווה ל" },
  { value: "neq", label: "לא שווה ל" },
  { value: "gt", label: "גדול מ" },
  { value: "gte", label: "גדול מ / שווה" },
  { value: "lt", label: "קטן מ" },
  { value: "lte", label: "קטן מ / שווה" },
  { value: "like", label: "מכיל" },
  { value: "is_null", label: "ריק" },
  { value: "is_not_null", label: "לא ריק" },
];

const JOIN_TYPES = [
  { value: "inner", label: "INNER JOIN" },
  { value: "left", label: "LEFT JOIN" },
  { value: "right", label: "RIGHT JOIN" },
];

function formatValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function DataExplorer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") || "" : "";
  const headers = useMemo(() => ({ Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }), [authToken]);

  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [joins, setJoins] = useState<any[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<{ table: string; column: string; alias?: string }[]>([]);
  const [filters, setFilters] = useState<{ table: string; column: string; operator: string; value: string }[]>([]);
  const [sorts, setSorts] = useState<{ table: string; column: string; direction: string }[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [results, setResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"builder" | "results" | "saved">("builder");
  const [saveDialog, setSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [searchSchema, setSearchSchema] = useState("");

  const { data: schema } = useQuery({
    queryKey: ["bi-adhoc-schema"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/adhoc/schema`, { headers });
      if (!r.ok) return { entities: [], joinHints: [] };
      return r.json();
    },
  });

  const { data: savedQueries = [], refetch: refetchSaved } = useQuery({
    queryKey: ["bi-adhoc-saved"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bi/adhoc/saved`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const deleteSavedMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API_BASE}/bi/adhoc/saved/${id}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => { refetchSaved(); toast({ title: "שאילתה נמחקה" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const entities = (schema?.entities || []) as any[];
  const joinHints = (schema?.joinHints || []) as any[];

  const filteredEntities = useMemo(() => {
    if (!searchSchema) return entities;
    return entities.filter(e => e.label.includes(searchSchema) || e.labelEn?.toLowerCase().includes(searchSchema.toLowerCase()));
  }, [entities, searchSchema]);

  const getEntityColumns = (tableKey: string) => {
    return entities.find(e => e.key === tableKey)?.columns || [];
  };

  const toggleTable = (key: string) => {
    if (selectedTables.includes(key)) {
      setSelectedTables(prev => prev.filter(t => t !== key));
      setJoins(prev => prev.filter(j => j.fromTable !== key && j.toTable !== key));
      setSelectedColumns(prev => prev.filter(c => c.table !== key));
      setFilters(prev => prev.filter(f => f.table !== key));
      setSorts(prev => prev.filter(s => s.table !== key));
    } else {
      const newTables = [...selectedTables, key];
      setSelectedTables(newTables);
      if (newTables.length >= 2) {
        const prevTable = newTables[newTables.length - 2];
        const hint = joinHints.find(h => (h.from === prevTable && h.to === key) || (h.from === key && h.to === prevTable));
        if (hint) {
          const fromTable = hint.from === prevTable ? prevTable : key;
          const toTable = hint.to === key ? key : prevTable;
          setJoins(prev => [...prev, { fromTable, toTable, fromKey: hint.fromKey, toKey: hint.toKey, joinType: "left" }]);
        }
      }
    }
  };

  const addFilter = () => {
    if (selectedTables.length === 0) { toast({ title: "בחר טבלה תחילה" }); return; }
    const cols = getEntityColumns(selectedTables[0]);
    setFilters(prev => [...prev, { table: selectedTables[0], column: cols[0]?.key || "", operator: "eq", value: "" }]);
  };

  const addSort = () => {
    if (selectedTables.length === 0) { toast({ title: "בחר טבלה תחילה" }); return; }
    const cols = getEntityColumns(selectedTables[0]);
    setSorts(prev => [...prev, { table: selectedTables[0], column: cols[0]?.key || "", direction: "asc" }]);
  };

  const toggleColumn = (table: string, column: string) => {
    const exists = selectedColumns.some(c => c.table === table && c.column === column);
    if (exists) {
      setSelectedColumns(prev => prev.filter(c => !(c.table === table && c.column === column)));
    } else {
      setSelectedColumns(prev => [...prev, { table, column }]);
    }
  };

  const runQuery = async (pageOverride?: number) => {
    if (selectedTables.length === 0) { toast({ title: "בחר לפחות טבלה אחת" }); return; }
    setIsRunning(true);
    try {
      const p = pageOverride || page;
      const r = await fetch(`${API_BASE}/bi/adhoc/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tables: selectedTables, joins, columns: selectedColumns, filters, sorts, page: p, pageSize }),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "שגיאה בהרצת השאילתה"); }
      const data = await r.json();
      setResults(data);
      setPage(p);
      setActiveTab("results");
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const saveQuery = async () => {
    if (!saveName.trim()) { toast({ title: "שם חובה" }); return; }
    try {
      const r = await fetch(`${API_BASE}/bi/adhoc/saved`, {
        method: "POST", headers,
        body: JSON.stringify({ name: saveName, description: saveDesc, selectedTables, joins, selectedColumns, filters, sorts }),
      });
      if (!r.ok) throw new Error(await r.text());
      refetchSaved();
      setSaveDialog(false);
      setSaveName(""); setSaveDesc("");
      toast({ title: "שאילתה נשמרה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const loadQuery = (q: any) => {
    setSelectedTables(q.selectedTables || []);
    setJoins(q.joins || []);
    setSelectedColumns(q.selectedColumns || []);
    setFilters(q.filters || []);
    setSorts(q.sorts || []);
    setActiveTab("builder");
    toast({ title: "שאילתה נטענה" });
  };

  const exportResults = () => {
    if (!results?.rows?.length) return;
    const cols = Object.keys(results.rows[0] || {});
    const csv = [cols.join(","), ...results.rows.map((r: any) => cols.map(c => `"${String(r[c] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "query-results.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const resultCols = results?.rows?.length > 0 ? Object.keys(results.rows[0]) : [];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {saveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-96 bg-card border-border shadow-xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">שמירת שאילתה</h2>
                <Button variant="ghost" size="sm" onClick={() => setSaveDialog(false)}><X className="w-4 h-4" /></Button>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">שם *</Label>
                <Input value={saveName} onChange={e => setSaveName(e.target.value)} className="bg-background/50 mt-1" placeholder="שם השאילתה" />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">תיאור</Label>
                <Input value={saveDesc} onChange={e => setSaveDesc(e.target.value)} className="bg-background/50 mt-1" placeholder="תיאור קצר" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-primary" onClick={saveQuery}>שמור</Button>
                <Button variant="outline" onClick={() => setSaveDialog(false)}>ביטול</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">חוקר נתונים</h1>
          <p className="text-sm text-muted-foreground mt-1">בנאי שאילתות אד-הוק ויזואלי</p>
        </div>
        <div className="flex gap-2">
          {results && <Button variant="outline" size="sm" onClick={exportResults}><Download className="w-4 h-4 ml-1" />ייצוא CSV</Button>}
          <Button variant="outline" size="sm" onClick={() => setSaveDialog(true)} disabled={selectedTables.length === 0}><Save className="w-4 h-4 ml-1" />שמור שאילתה</Button>
          <Button size="sm" className="bg-primary" onClick={() => runQuery(1)} disabled={isRunning || selectedTables.length === 0}>
            {isRunning ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Play className="w-4 h-4 ml-1" />}
            הרץ שאילתה
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/50">
        {[
          { key: "builder", label: "בנאי שאילתות", icon: Database },
          { key: "results", label: `תוצאות${results ? ` (${results.total})` : ""}`, icon: Table2 },
          { key: "saved", label: `שמורות (${(savedQueries as any[]).length})`, icon: BookOpen },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "builder" && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-3">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-primary" />ישויות נתונים</h3>
                <div className="relative mb-3">
                  <Search className="absolute right-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="חיפוש..." value={searchSchema} onChange={e => setSearchSchema(e.target.value)} className="pr-8 bg-background/50 h-8 text-xs" />
                </div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {filteredEntities.map((entity: any) => (
                    <button key={entity.key} onClick={() => toggleTable(entity.key)} className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${selectedTables.includes(entity.key) ? "bg-primary/20 border border-primary/50 text-primary" : "hover:bg-card/50 text-foreground border border-transparent"}`}>
                      <span>{entity.label}</span>
                      {selectedTables.includes(entity.key) && <div className="w-2 h-2 bg-primary rounded-full" />}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-9 space-y-4">
            {selectedTables.length === 0 ? (
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-12 text-center text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">בחר ישויות נתונים</p>
                  <p className="text-sm mt-1">בחר ישות מהרשימה משמאל להתחיל</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2"><Columns className="w-4 h-4 text-blue-400" />עמודות שנבחרו</h3>
                    <div className="space-y-3">
                      {selectedTables.map(tableKey => {
                        const entity = entities.find(e => e.key === tableKey);
                        if (!entity) return null;
                        return (
                          <div key={tableKey}>
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                              <Table2 className="w-3.5 h-3.5" />{entity.label}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {entity.columns.map((col: any) => {
                                const isSelected = selectedColumns.some(c => c.table === tableKey && c.column === col.key);
                                return (
                                  <button key={col.key} onClick={() => toggleColumn(tableKey, col.key)} className={`px-2 py-1 rounded text-xs border transition-colors ${isSelected ? "bg-blue-500/20 border-blue-500/50 text-blue-300" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"}`}>
                                    {col.label}
                                  </button>
                                );
                              })}
                              <button onClick={() => { entity.columns.forEach((c: any) => { if (!selectedColumns.some(sc => sc.table === tableKey && sc.column === c.key)) setSelectedColumns(prev => [...prev, { table: tableKey, column: c.key }]); }); }} className="px-2 py-1 rounded text-xs border border-dashed border-border text-muted-foreground hover:text-foreground">+ כל</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {selectedTables.length >= 2 && (
                  <Card className="bg-card/50 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><Link2 className="w-4 h-4 text-purple-400" />חיבורים (Joins)</h3>
                        <Button variant="outline" size="sm" onClick={() => setJoins(prev => [...prev, { fromTable: selectedTables[0], toTable: selectedTables[1], fromKey: "", toKey: "", joinType: "left" }])} className="h-7 text-xs"><Plus className="w-3 h-3 ml-1" />הוסף</Button>
                      </div>
                      {joins.length === 0 ? <p className="text-sm text-muted-foreground">אין חיבורים. לחץ "הוסף" להוסיף</p> : (
                        <div className="space-y-2">
                          {joins.map((join, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 bg-background/30 rounded-lg flex-wrap">
                              <select value={join.joinType} onChange={e => setJoins(prev => prev.map((j, i) => i === idx ? { ...j, joinType: e.target.value } : j))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                                {JOIN_TYPES.map(jt => <option key={jt.value} value={jt.value}>{jt.label}</option>)}
                              </select>
                              <select value={join.fromTable} onChange={e => setJoins(prev => prev.map((j, i) => i === idx ? { ...j, fromTable: e.target.value, fromKey: "" } : j))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                                {selectedTables.map(t => <option key={t} value={t}>{entities.find(e => e.key === t)?.label || t}</option>)}
                              </select>
                              <select value={join.fromKey} onChange={e => setJoins(prev => prev.map((j, i) => i === idx ? { ...j, fromKey: e.target.value } : j))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                                <option value="">-- עמודה --</option>
                                {getEntityColumns(join.fromTable).map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}
                              </select>
                              <span className="text-muted-foreground text-xs">=</span>
                              <select value={join.toTable} onChange={e => setJoins(prev => prev.map((j, i) => i === idx ? { ...j, toTable: e.target.value, toKey: "" } : j))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                                {selectedTables.map(t => <option key={t} value={t}>{entities.find(e => e.key === t)?.label || t}</option>)}
                              </select>
                              <select value={join.toKey} onChange={e => setJoins(prev => prev.map((j, i) => i === idx ? { ...j, toKey: e.target.value } : j))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                                <option value="">-- עמודה --</option>
                                {getEntityColumns(join.toTable).map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}
                              </select>
                              <Button variant="ghost" size="sm" onClick={() => setJoins(prev => prev.filter((_, i) => i !== idx))} className="h-6 w-6 p-0"><X className="w-3.5 h-3.5 text-red-400" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><Filter className="w-4 h-4 text-orange-400" />פילטרים</h3>
                      <Button variant="outline" size="sm" onClick={addFilter} className="h-7 text-xs"><Plus className="w-3 h-3 ml-1" />הוסף</Button>
                    </div>
                    {filters.length === 0 ? <p className="text-sm text-muted-foreground">אין פילטרים. לחץ "הוסף" להוסיף</p> : (
                      <div className="space-y-2">
                        {filters.map((filter, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-background/30 rounded-lg flex-wrap">
                            <select value={filter.table} onChange={e => setFilters(prev => prev.map((f, i) => i === idx ? { ...f, table: e.target.value, column: getEntityColumns(e.target.value)[0]?.key || "" } : f))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                              {selectedTables.map(t => <option key={t} value={t}>{entities.find(e => e.key === t)?.label || t}</option>)}
                            </select>
                            <select value={filter.column} onChange={e => setFilters(prev => prev.map((f, i) => i === idx ? { ...f, column: e.target.value } : f))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                              {getEntityColumns(filter.table).map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                            <select value={filter.operator} onChange={e => setFilters(prev => prev.map((f, i) => i === idx ? { ...f, operator: e.target.value } : f))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                              {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                            </select>
                            {!["is_null", "is_not_null"].includes(filter.operator) && (
                              <Input value={filter.value} onChange={e => setFilters(prev => prev.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))} className="bg-background/50 h-7 text-xs w-32" placeholder="ערך" />
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setFilters(prev => prev.filter((_, i) => i !== idx))} className="h-6 w-6 p-0"><X className="w-3.5 h-3.5 text-red-400" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><ArrowUpDown className="w-4 h-4 text-cyan-400" />מיון</h3>
                      <Button variant="outline" size="sm" onClick={addSort} className="h-7 text-xs"><Plus className="w-3 h-3 ml-1" />הוסף</Button>
                    </div>
                    {sorts.length === 0 ? <p className="text-sm text-muted-foreground">אין מיון. לחץ "הוסף" להוסיף</p> : (
                      <div className="space-y-2">
                        {sorts.map((sort, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-background/30 rounded-lg">
                            <select value={sort.table} onChange={e => setSorts(prev => prev.map((s, i) => i === idx ? { ...s, table: e.target.value, column: getEntityColumns(e.target.value)[0]?.key || "" } : s))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                              {selectedTables.map(t => <option key={t} value={t}>{entities.find(e => e.key === t)?.label || t}</option>)}
                            </select>
                            <select value={sort.column} onChange={e => setSorts(prev => prev.map((s, i) => i === idx ? { ...s, column: e.target.value } : s))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                              {getEntityColumns(sort.table).map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                            <select value={sort.direction} onChange={e => setSorts(prev => prev.map((s, i) => i === idx ? { ...s, direction: e.target.value } : s))} className="bg-background/50 border border-border rounded px-2 py-1 text-xs text-foreground">
                              <option value="asc">עולה</option>
                              <option value="desc">יורד</option>
                            </select>
                            <Button variant="ghost" size="sm" onClick={() => setSorts(prev => prev.filter((_, i) => i !== idx))} className="h-6 w-6 p-0"><X className="w-3.5 h-3.5 text-red-400" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "results" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            {!results ? (
              <div className="text-center py-16 text-muted-foreground">
                <Table2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">אין תוצאות</p>
                <p className="text-sm mt-1">עבור לבנאי השאילתות והרץ שאילתה</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">{results.total} שורות נמצאו, מציג עמוד {results.page} מתוך {results.totalPages}</span>
                  <Button variant="outline" size="sm" onClick={exportResults}><Download className="w-3.5 h-3.5 ml-1" />ייצוא CSV</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border/50">
                        {resultCols.map(col => (
                          <th key={col} className="text-right p-2 text-muted-foreground font-medium whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.rows.map((row: any, idx: number) => (
                        <tr key={idx} className="border-b border-border/30 hover:bg-card/30">
                          {resultCols.map(col => (
                            <td key={col} className="p-2 text-foreground whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">{formatValue(row[col])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={results.page <= 1} onClick={() => runQuery(results.page - 1)}><ChevronRight className="w-4 h-4" /></Button>
                  <span className="text-sm text-muted-foreground px-2">{results.page} / {results.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={results.page >= results.totalPages} onClick={() => runQuery(results.page + 1)}><ChevronLeft className="w-4 h-4" /></Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "saved" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-4">שאילתות שמורות</h3>
            {(savedQueries as any[]).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>אין שאילתות שמורות</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(savedQueries as any[]).map((q: any) => (
                  <div key={q.id} className="p-4 bg-background/30 rounded-lg border border-border/50 hover:border-border/80 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-foreground text-sm">{q.name}</div>
                        {q.description && <div className="text-xs text-muted-foreground mt-0.5">{q.description}</div>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("למחוק?")) deleteSavedMutation.mutate(q.id); }} className="h-6 w-6 p-0 opacity-50 hover:opacity-100"><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(q.selectedTables || []).map((t: string) => <Badge key={t} className="bg-blue-500/20 text-blue-300 text-xs">{entities.find(e => e.key === t)?.label || t}</Badge>)}
                    </div>
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => loadQuery(q)}>טען שאילתה</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
