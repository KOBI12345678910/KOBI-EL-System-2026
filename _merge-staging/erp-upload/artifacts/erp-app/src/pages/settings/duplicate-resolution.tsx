import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, X, Loader2, AlertCircle, Copy, Merge, Eye, XCircle, CheckCircle2, ScanLine, Users, ArrowLeftRight, ThumbsDown } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-yellow-500/20 text-yellow-300" },
  resolved: { label: "מוזג", color: "bg-green-500/20 text-green-300" },
  false_positive: { label: "לא כפילות", color: "bg-gray-500/20 text-gray-300" },
};

export default function DuplicateResolutionPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showScan, setShowScan] = useState(false);
  const [scanForm, setScanForm] = useState({ entityType: "", field: "name", threshold: "0.8" });
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [groupsRes, dashRes] = await Promise.all([
        authFetch("/api/duplicates/groups"),
        authFetch("/api/duplicates/dashboard")
      ]);
      if (groupsRes.ok) { const j = await groupsRes.json(); setGroups(j.data || []); }
      if (dashRes.ok) { const j = await dashRes.json(); setDashboard(j); }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...groups];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.entity_type?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    return d;
  }, [groups, search, statusFilter]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await authFetch(`/api/duplicates/scan/${scanForm.entityType}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: scanForm.field, threshold: parseFloat(scanForm.threshold) })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בסריקה"); }
      const j = await res.json();
      setScanResult(j);
      await load();
    } catch (e: any) { setError(e.message); }
    setScanning(false);
  };

  const handleMerge = async (groupId: number, survivorId: number) => {
    setActionLoading(groupId);
    try {
      const res = await authFetch(`/api/duplicates/${groupId}/merge`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivor_id: survivorId })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה במיזוג"); }
      setShowDetail(null);
      await load();
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  const handleFalsePositive = async (groupId: number) => {
    setActionLoading(groupId);
    try {
      await authFetch(`/api/duplicates/${groupId}/false-positive`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
      });
      setShowDetail(null);
      await load();
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-[#0a0a1a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Copy className="h-6 w-6 text-orange-400" />מרכז איחוד כפילויות</h1>
          <p className="text-gray-400 text-sm mt-1">זיהוי, השוואה ומיזוג רשומות כפולות</p>
        </div>
        <Button onClick={() => setShowScan(true)} className="bg-orange-600 hover:bg-orange-700">
          <ScanLine className="h-4 w-4 ml-2" />סריקת כפילויות
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}<X className="h-4 w-4 mr-auto cursor-pointer" onClick={() => setError(null)} /></div>}

      {/* Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-5 gap-4">
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-400">{dashboard.total_groups}</div><div className="text-gray-400 text-sm">קבוצות</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-yellow-400">{dashboard.open}</div><div className="text-gray-400 text-sm">פתוחות</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-green-400">{dashboard.resolved}</div><div className="text-gray-400 text-sm">מוזגו</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-gray-400">{dashboard.false_positive}</div><div className="text-gray-400 text-sm">לא כפילות</div></CardContent></Card>
          <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-purple-400">{dashboard.total_candidates}</div><div className="text-gray-400 text-sm">מועמדים</div></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי סוג ישות..." className="pr-10 bg-[#12122a] border-gray-700 text-white" /></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-[#12122a] border border-gray-700 rounded-md px-3 text-white text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Groups List */}
      <div className="space-y-3">
        {filtered.map(group => {
          const st = STATUS_MAP[group.status] || { label: group.status, color: "bg-gray-500/20 text-gray-300" };
          return (
            <Card key={group.id} className="bg-[#12122a] border-gray-800 hover:border-gray-600 transition-colors cursor-pointer" onClick={() => setShowDetail(group)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-orange-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">קבוצה #{group.id}</span>
                      <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                      <Badge variant="outline" className="text-xs border-gray-700 text-gray-400">{group.entity_type}</Badge>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>{group.candidate_count || 0} מועמדים</span>
                      <span>{new Date(group.created_at).toLocaleDateString("he-IL")}</span>
                      {group.resolved_by && <span>טופל ע"י: {group.resolved_by}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {group.status === "open" && <>
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); handleFalsePositive(group.id); }} disabled={actionLoading === group.id}><ThumbsDown className="h-4 w-4 text-gray-400" /></Button>
                  </>}
                  <Eye className="h-4 w-4 text-gray-500" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12 text-gray-500">לא נמצאו קבוצות כפילויות</div>}
      </div>

      {/* Scan Dialog */}
      {showScan && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowScan(false)}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold">סריקת כפילויות</h2>
            <div><Label className="text-gray-300">סוג ישות (slug)</Label><Input value={scanForm.entityType} onChange={e => setScanForm({ ...scanForm, entityType: e.target.value })} placeholder="contacts / customers" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">שדה להשוואה</Label><Input value={scanForm.field} onChange={e => setScanForm({ ...scanForm, field: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
              <div><Label className="text-gray-300">סף דמיון (0-1)</Label><Input value={scanForm.threshold} onChange={e => setScanForm({ ...scanForm, threshold: e.target.value })} className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            {scanResult && (
              <div className="bg-[#0a0a1a] border border-gray-800 rounded-lg p-3 text-sm">
                <p className="text-green-400">נמצאו {scanResult.groups_created} קבוצות, {scanResult.candidates_found} מועמדים</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowScan(false)} className="border-gray-700 text-gray-300">סגירה</Button>
              <Button onClick={handleScan} disabled={scanning} className="bg-orange-600 hover:bg-orange-700">{scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4 ml-2" />}סריקה</Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail/Compare Dialog */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowDetail(null)}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-orange-400" />השוואת כפילויות - קבוצה #{showDetail.id}</h2>
              <Button size="sm" variant="ghost" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <p className="text-gray-400 text-sm">סוג: {showDetail.entity_type} | סטטוס: {STATUS_MAP[showDetail.status]?.label || showDetail.status}</p>

            <div className="text-center text-gray-500 text-sm py-8">
              בחר רשומה שורדת מרשימת המועמדים בקבוצה זו. לחץ "מזג" כדי לשמור את הרשומה שנבחרה ולסמן את האחרות כמוזגות.
            </div>

            {showDetail.status === "open" && (
              <div className="flex gap-2 justify-center">
                <Button onClick={() => handleMerge(showDetail.id, showDetail.survivor_id || 0)} disabled={actionLoading === showDetail.id} className="bg-green-600 hover:bg-green-700">
                  {actionLoading === showDetail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 ml-2" />}מזג
                </Button>
                <Button onClick={() => handleFalsePositive(showDetail.id)} disabled={actionLoading === showDetail.id} variant="outline" className="border-gray-700 text-gray-300">
                  <XCircle className="h-4 w-4 ml-2" />לא כפילות
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
