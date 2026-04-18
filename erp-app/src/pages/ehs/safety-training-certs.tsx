import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/utils";
import {
  GraduationCap, Plus, Search, X, Save, Eye, Edit2, Trash2,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, CheckCircle2,
  Clock, Bell, Users, Award, MoreHorizontal, BookOpen
} from "lucide-react";

const API = "/api";

const CERT_TYPES = [
  "מלגזן",
  "עגורנאי",
  "חשמלאי",
  "עבודה בגובה",
  "כניסה למרחבים מוגבלים",
  "עבודה עם חומרים מסוכנים",
  "ריתוך",
  "עזרה ראשונה",
  "כיבוי אש",
  "בטיחות כללית",
  "נהיגה",
  "אחר"
];

const STATUS_COLORS: Record<string, string> = {
  "current": "bg-green-500/20 text-green-300",
  "expiring_soon": "bg-yellow-500/20 text-yellow-300",
  "expired": "bg-red-500/20 text-red-300",
  "not_trained": "bg-gray-500/20 text-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  "current": "בתוקף",
  "expiring_soon": "פג בקרוב",
  "expired": "פג תוקף",
  "not_trained": "לא הוכשר",
};

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const expiry = new Date(dateStr);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatus(record: any): string {
  if (!record.expiry_date) return record.status || "current";
  const days = daysUntilExpiry(record.expiry_date);
  if (days === null) return record.status || "current";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "current";
}

export default function SafetyTrainingCerts() {
  const [records, setRecords] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [certFilter, setCertFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"records" | "certifications">("records");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [showForm, setShowForm] = useState(false);
  const [showCertForm, setShowCertForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editCertId, setEditCertId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [certForm, setCertForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, certsRes] = await Promise.all([
        authFetch(`${API}/hse-training-records?limit=500`),
        authFetch(`${API}/hse-safety-certifications?limit=200`),
      ]);
      if (recRes.ok) {
        const j = await recRes.json();
        setRecords(Array.isArray(j) ? j : j.data || []);
      }
      if (certsRes.ok) {
        const j = await certsRes.json();
        setCerts(Array.isArray(j) ? j : j.data || []);
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const computedRecords = useMemo(() => records.map(r => ({ ...r, _status: getStatus(r) })), [records]);

  const filtered = useMemo(() => {
    let d = [...computedRecords];
    if (search) d = d.filter(r => [r.employee_name, r.certification_name, r.department, r.trainer].some(f => f?.toLowerCase().includes(search.toLowerCase())));
    if (statusFilter !== "all") d = d.filter(r => r._status === statusFilter);
    if (certFilter !== "all") d = d.filter(r => r.certification_name === certFilter);
    return d;
  }, [computedRecords, search, statusFilter, certFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => ({
    total: computedRecords.length,
    current: computedRecords.filter(r => r._status === "current").length,
    expiring: computedRecords.filter(r => r._status === "expiring_soon").length,
    expired: computedRecords.filter(r => r._status === "expired").length,
    certifications: certs.length,
    compliance: computedRecords.length > 0 ? Math.round((computedRecords.filter(r => r._status === "current").length / computedRecords.length) * 100) : 0,
  }), [computedRecords, certs]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = editId ? `${API}/hse-training-records/${editId}` : `${API}/hse-training-records`;
      const res = await authFetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowForm(false); setEditId(null); setForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const del = async (id: number) => {
    await authFetch(`${API}/hse-training-records/${id}`, { method: "DELETE" });
    await load();
  };

  const saveCert = async () => {
    setSaving(true);
    try {
      const url = editCertId ? `${API}/hse-safety-certifications/${editCertId}` : `${API}/hse-safety-certifications`;
      const res = await authFetch(url, { method: editCertId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(certForm) });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setShowCertForm(false); setEditCertId(null); setCertForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const delCert = async (id: number) => {
    await authFetch(`${API}/hse-safety-certifications/${id}`, { method: "DELETE" });
    await load();
  };

  const uniqueCerts = useMemo(() => [...new Set(records.map(r => r.certification_name).filter(Boolean))], [records]);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-green-400" />
            הדרכות בטיחות ותעודות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב הסמכות, תעודות ועמידה בדרישות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowCertForm(true); setEditCertId(null); setCertForm({ validity_months: 12, is_mandatory: true, is_active: true }); }} className="border-border text-gray-300 gap-1">
            <Plus className="h-4 w-4" />הסמכה חדשה
          </Button>
          <Button onClick={() => { setForm({ training_date: new Date().toISOString().slice(0,10), pass_fail: "pass" }); setEditId(null); setShowForm(true); }} className="bg-green-600 hover:bg-green-700 gap-2">
            <Plus className="h-4 w-4" />רישום הדרכה
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { l: "רשומות", v: stats.total, c: "text-blue-400", icon: BookOpen },
          { l: "בתוקף", v: stats.current, c: "text-green-400", icon: CheckCircle2 },
          { l: "פגים בקרוב", v: stats.expiring, c: "text-yellow-400", icon: Bell },
          { l: "פגי תוקף", v: stats.expired, c: "text-red-400", icon: AlertTriangle },
          { l: "הסמכות", v: stats.certifications, c: "text-purple-400", icon: Award },
          { l: "עמידה", v: `${stats.compliance}%`, c: stats.compliance >= 90 ? "text-green-400" : stats.compliance >= 70 ? "text-yellow-400" : "text-red-400", icon: Users },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <k.icon className={`h-4 w-4 ${k.c} mb-2`} />
              <p className={`text-xl font-bold font-mono ${k.c}`}>{loading ? "—" : k.v}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.l}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.expiring > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-3">
          <Bell className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-300">התראת תפוגה</p>
            <p className="text-xs text-muted-foreground mt-1">
              {computedRecords.filter(r => r._status === "expiring_soon").map(r => {
                const days = daysUntilExpiry(r.expiry_date);
                return `${r.employee_name} — ${r.certification_name} (עוד ${days} ימים)`;
              }).slice(0, 5).join(" | ")}
              {stats.expiring > 5 && ` ועוד ${stats.expiring - 5}...`}
            </p>
          </div>
        </div>
      )}

      {stats.expired > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">תעודות שפגו תוקפן</p>
            <p className="text-xs text-muted-foreground mt-1">
              {computedRecords.filter(r => r._status === "expired").map(r => `${r.employee_name} — ${r.certification_name}`).slice(0, 5).join(" | ")}
              {stats.expired > 5 && ` ועוד ${stats.expired - 5}...`}
            </p>
          </div>
        </div>
      )}

      <div className="flex border-b border-border gap-0">
        {[{ key: "records", label: "רשומות הדרכה" }, { key: "certifications", label: "סוגי הסמכות" }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-green-400 text-green-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "records" && (
        <>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={certFilter} onChange={e => { setCertFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל ההסמכות</option>
                  {uniqueCerts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">עובד</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מחלקה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">הסמכה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תאריך הדרכה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תפוגה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">ימים לפקיעה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מדריך</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תעודה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({length: 5}).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td colSpan={10} className="p-3">
                            <div className="flex gap-4 animate-pulse">{Array.from({length:6}).map((_,j)=><div key={j} className="h-4 bg-muted rounded flex-1" />)}</div>
                          </td>
                        </tr>
                      ))
                    ) : pageData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-16 text-center">
                          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">אין רשומות הדרכה</p>
                          <Button onClick={() => { setForm({ training_date: new Date().toISOString().slice(0,10), pass_fail: "pass" }); setEditId(null); setShowForm(true); }} className="mt-3 bg-green-600 hover:bg-green-700 gap-2">
                            <Plus className="h-4 w-4" />רישום הדרכה ראשונה
                          </Button>
                        </td>
                      </tr>
                    ) : pageData.map(row => {
                      const days = daysUntilExpiry(row.expiry_date);
                      const st = row._status;
                      return (
                        <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-foreground font-medium">{row.employee_name}</td>
                          <td className="p-3 text-muted-foreground">{row.department || "—"}</td>
                          <td className="p-3 text-foreground">{row.certification_name || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.training_date?.slice(0,10) || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.expiry_date?.slice(0,10) || "—"}</td>
                          <td className="p-3 text-center">
                            {days !== null ? (
                              <span className={`font-mono text-sm ${days < 0 ? "text-red-400" : days <= 30 ? "text-yellow-400" : "text-green-400"}`}>
                                {days < 0 ? `פג לפני ${Math.abs(days)} ימים` : `${days}`}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-3 text-muted-foreground">{row.trainer || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.certificate_number || "—"}</td>
                          <td className="p-3">
                            <Badge className={STATUS_COLORS[st] || "bg-gray-500/20 text-gray-300"}>
                              {STATUS_LABELS[st] || st}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setForm({...row}); setEditId(row.id); setShowForm(true); }}>
                                <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => del(row.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-3 border-t border-border">
                <span className="text-sm text-muted-foreground">מציג {Math.min(filtered.length,(page-1)*perPage+1)}-{Math.min(filtered.length,page*perPage)} מתוך {filtered.length}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
                  <span className="px-2 py-1 text-sm text-muted-foreground">{page}/{totalPages}</span>
                  <Button variant="ghost" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "certifications" && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4">
            {certs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>אין סוגי הסמכות מוגדרים</p>
                <Button onClick={() => { setShowCertForm(true); setEditCertId(null); setCertForm({ validity_months: 12, is_mandatory: true, is_active: true }); }} className="mt-3 bg-green-600 hover:bg-green-700 gap-2">
                  <Plus className="h-4 w-4" />הוסף הסמכה
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {certs.map(cert => {
                  const trainedCount = records.filter(r => r.certification_name === cert.certification_name).length;
                  return (
                    <div key={cert.id} className="bg-input rounded-lg p-4 border border-border">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-foreground font-medium">{cert.certification_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{cert.certification_type || "—"}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setCertForm({...cert}); setEditCertId(cert.id); setShowCertForm(true); }}>
                            <Edit2 className="h-3 w-3 text-blue-400" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => delCert(cert.id)}>
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <p className="text-muted-foreground">תוקף</p>
                          <p className="text-foreground font-medium">{cert.validity_months} חו׳</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">מוכשרים</p>
                          <p className="text-green-400 font-medium">{trainedCount}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">חובה</p>
                          <p className={cert.is_mandatory ? "text-red-400 font-medium" : "text-muted-foreground"}>{cert.is_mandatory ? "כן" : "לא"}</p>
                        </div>
                      </div>
                      {cert.required_for_roles && (
                        <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">תפקידים: {cert.required_for_roles}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowForm(false); setEditId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editId ? "עריכת רשומת הדרכה" : "רישום הדרכה חדשה"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">שם עובד *</Label>
                  <Input value={form.employee_name || ""} onChange={e => setForm({...form, employee_name: e.target.value})} placeholder="שם מלא" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מחלקה</Label>
                  <Input value={form.department || ""} onChange={e => setForm({...form, department: e.target.value})} placeholder="מחלקה" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תפקיד</Label>
                  <Input value={form.job_title || ""} onChange={e => setForm({...form, job_title: e.target.value})} placeholder="תפקיד" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">שם ההסמכה *</Label>
                  <select value={form.certification_name || ""} onChange={e => setForm({...form, certification_name: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר הסמכה...</option>
                    {certs.map(c => <option key={c.id} value={c.certification_name}>{c.certification_name}</option>)}
                    {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך הדרכה *</Label>
                  <Input type="date" value={form.training_date || ""} onChange={e => setForm({...form, training_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך תפוגה</Label>
                  <Input type="date" value={form.expiry_date || ""} onChange={e => setForm({...form, expiry_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מדריך / מנחה</Label>
                  <Input value={form.trainer || ""} onChange={e => setForm({...form, trainer: e.target.value})} placeholder="שם המדריך" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ספק הדרכה</Label>
                  <Input value={form.training_provider || ""} onChange={e => setForm({...form, training_provider: e.target.value})} placeholder="גורם מכשיר" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מספר תעודה</Label>
                  <Input value={form.certificate_number || ""} onChange={e => setForm({...form, certificate_number: e.target.value})} placeholder="מספר תעודה" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ציון</Label>
                  <Input type="number" value={form.score || ""} onChange={e => setForm({...form, score: e.target.value})} placeholder="0-100" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תוצאה</Label>
                  <select value={form.pass_fail || "pass"} onChange={e => setForm({...form, pass_fail: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="pass">עבר</option>
                    <option value="fail">נכשל</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">הערות</Label>
                  <textarea value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." />
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }} className="border-border">ביטול</Button>
              <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCertForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCertForm(false); setEditCertId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editCertId ? "עריכת הסמכה" : "הסמכה חדשה"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowCertForm(false); setEditCertId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">שם ההסמכה *</Label>
                  <select value={certForm.certification_name || ""} onChange={e => setCertForm({...certForm, certification_name: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר או הקלד...</option>
                    {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input value={certForm.certification_name || ""} onChange={e => setCertForm({...certForm, certification_name: e.target.value})} placeholder="או הקלד שם חדש..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סוג</Label>
                  <Input value={certForm.certification_type || ""} onChange={e => setCertForm({...certForm, certification_type: e.target.value})} placeholder="סוג הסמכה" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תקופת תוקף (חודשים)</Label>
                  <Input type="number" value={certForm.validity_months || 12} onChange={e => setCertForm({...certForm, validity_months: parseInt(e.target.value)})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ספק / מכשיר</Label>
                  <Input value={certForm.provider || ""} onChange={e => setCertForm({...certForm, provider: e.target.value})} placeholder="גורם מכשיר" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">נדרש לתפקידים</Label>
                  <Input value={certForm.required_for_roles || ""} onChange={e => setCertForm({...certForm, required_for_roles: e.target.value})} placeholder="מנהל, מפעיל, ריתוך..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">נדרש למחלקות</Label>
                  <Input value={certForm.required_for_departments || ""} onChange={e => setCertForm({...certForm, required_for_departments: e.target.value})} placeholder="ייצור, תחזוקה..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={certForm.is_mandatory ?? true} onChange={e => setCertForm({...certForm, is_mandatory: e.target.checked})} className="rounded" />
                  <Label className="text-sm text-foreground">חובה</Label>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={certForm.is_active ?? true} onChange={e => setCertForm({...certForm, is_active: e.target.checked})} className="rounded" />
                  <Label className="text-sm text-foreground">פעיל</Label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowCertForm(false); setEditCertId(null); }} className="border-border">ביטול</Button>
              <Button onClick={saveCert} disabled={saving} className="bg-green-600 hover:bg-green-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editCertId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
