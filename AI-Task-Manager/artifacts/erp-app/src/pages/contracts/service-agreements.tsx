import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Handshake, Clock, AlertTriangle, CheckCircle2,
  Search, Plus, Download, Eye, Edit2, Trash2, RefreshCw,
  Calendar, Shield, TrendingUp
} from "lucide-react";

const agreements = [
  { id: "SA-001", name: "תחזוקת מכונות CNC", vendor: "סרביס-טק בע\"מ", type: "תחזוקה", sla: "99.5%", slaActual: 99.2, value: "185,000", start: "2025-07-01", expiry: "2026-07-01", renewal: "אוטומטי", status: "פעיל", terms: "תגובה תוך 4 שעות" },
  { id: "SA-002", name: "שירותי IT ותקשורת", vendor: "נט-סולושנס", type: "IT", sla: "99.9%", slaActual: 99.8, value: "120,000", start: "2025-01-01", expiry: "2026-12-31", renewal: "אוטומטי", status: "פעיל", terms: "תמיכה 24/7" },
  { id: "SA-003", name: "תחזוקת מערכת כיבוי אש", vendor: "בטחון ובטיחות בע\"מ", type: "בטיחות", sla: "100%", slaActual: 100, value: "45,000", start: "2025-03-15", expiry: "2026-03-15", renewal: "ידני", status: "פעיל", terms: "בדיקה רבעונית" },
  { id: "SA-004", name: "ניקיון תעשייתי", vendor: "קלין-פרו שירותים", type: "ניקיון", sla: "95%", slaActual: 93.5, value: "96,000", start: "2025-06-01", expiry: "2026-06-01", renewal: "ידני", status: "בחידוש", terms: "ניקיון יומי + חודשי עמוק" },
  { id: "SA-005", name: "הסעות עובדים", vendor: "טרנספורט גליל", type: "לוגיסטיקה", sla: "98%", slaActual: 97.1, value: "210,000", start: "2024-09-01", expiry: "2026-08-31", renewal: "אוטומטי", status: "פעיל", terms: "3 קווים, בוקר וערב" },
  { id: "SA-006", name: "אספקת גז תעשייתי", vendor: "גז-טכני ישראל", type: "אספקה", sla: "99%", slaActual: 99.5, value: "78,000", start: "2025-04-01", expiry: "2026-04-01", renewal: "אוטומטי", status: "ממתין לחתימה", terms: "אספקה שבועית" },
  { id: "SA-007", name: "ייעוץ בטיחות תעסוקתית", vendor: "סייף-וורק", type: "בטיחות", sla: "100%", slaActual: 100, value: "36,000", start: "2024-12-01", expiry: "2025-11-30", renewal: "ידני", status: "פג תוקף", terms: "ביקור חודשי + דוחות" },
  { id: "SA-008", name: "תחזוקת מעליות", vendor: "אלביט מעליות", type: "תחזוקה", sla: "99%", slaActual: 98.8, value: "28,000", start: "2026-01-01", expiry: "2026-12-31", renewal: "אוטומטי", status: "פעיל", terms: "בדיקה חודשית" },
  { id: "SA-009", name: "שירותי אבטחה", vendor: "מאבטחים פלוס", type: "אבטחה", sla: "99.9%", slaActual: 99.9, value: "340,000", start: "2025-01-01", expiry: "2026-12-31", renewal: "ידני", status: "פעיל", terms: "אבטחה 24/7 + מצלמות" },
  { id: "SA-010", name: "כיול מכשירי מדידה", vendor: "מדיד-טק מעבדות", type: "כיול", sla: "100%", slaActual: 100, value: "22,000", start: "2025-10-01", expiry: "2026-09-30", renewal: "אוטומטי", status: "פעיל", terms: "כיול שנתי + תעודות" },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "בחידוש": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "ממתין לחתימה": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "פג תוקף": "bg-red-500/20 text-red-300 border-red-500/30",
  "מבוטל": "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

export default function ServiceAgreements() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  const filtered = useMemo(() => {
    return agreements.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.name.toLowerCase().includes(s) || r.vendor.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, statusFilter]);

  const kpis = useMemo(() => {
    const active = agreements.filter(r => r.status === "פעיל");
    const totalValue = agreements.reduce((sum, a) => sum + parseInt(a.value.replace(/,/g, "")), 0);
    const avgSla = active.length > 0 ? (active.reduce((sum, a) => sum + a.slaActual, 0) / active.length).toFixed(1) : "0";
    return {
      total: agreements.length,
      active: active.length,
      renewing: agreements.filter(r => r.status === "בחידוש" || r.status === "ממתין לחתימה").length,
      expired: agreements.filter(r => r.status === "פג תוקף").length,
      totalValue: totalValue.toLocaleString(),
      avgSla,
    };
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Handshake className="h-7 w-7 text-emerald-400" />
            הסכמי שירות - SLA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חוזי שירות ותחזוקה | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 ml-1" />הסכם חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ הסכמים</p>
                <p className="text-2xl font-bold text-white">{kpis.total}</p>
              </div>
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">פעילים</p>
                <p className="text-2xl font-bold text-green-300">{kpis.active}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={(kpis.active / kpis.total) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">בתהליך חידוש</p>
                <p className="text-2xl font-bold text-blue-300">{kpis.renewing}</p>
              </div>
              <RefreshCw className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/50 to-purple-950 border-purple-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400">ערך שנתי כולל</p>
                <p className="text-xl font-bold text-purple-300">{kpis.totalValue} &#8362;</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-900/50 to-cyan-950 border-cyan-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-cyan-400">SLA ממוצע</p>
                <p className="text-2xl font-bold text-cyan-300">{kpis.avgSla}%</p>
              </div>
              <Shield className="h-8 w-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="all">הכל</TabsTrigger>
            <TabsTrigger value="active">פעילים</TabsTrigger>
            <TabsTrigger value="renewal">לחידוש</TabsTrigger>
            <TabsTrigger value="expired">פגי תוקף</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש הסכם / ספק..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              <option value="פעיל">פעיל</option>
              <option value="בחידוש">בחידוש</option>
              <option value="ממתין לחתימה">ממתין לחתימה</option>
              <option value="פג תוקף">פג תוקף</option>
            </select>
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם ההסכם</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">SLA יעד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">SLA בפועל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ערך שנתי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוקף עד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חידוש</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-28">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .filter(r => {
                        if (activeTab === "active") return r.status === "פעיל";
                        if (activeTab === "renewal") return r.status === "בחידוש" || r.status === "ממתין לחתימה";
                        if (activeTab === "expired") return r.status === "פג תוקף";
                        return true;
                      })
                      .map((row) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-foreground font-mono text-xs">{row.id}</td>
                        <td className="p-3 text-foreground font-medium">{row.name}</td>
                        <td className="p-3 text-muted-foreground">{row.vendor}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{row.type}</Badge></td>
                        <td className="p-3 text-foreground">{row.sla}</td>
                        <td className="p-3">
                          <span className={row.slaActual >= parseFloat(row.sla) ? "text-green-400" : "text-red-400"}>
                            {row.slaActual}%
                          </span>
                        </td>
                        <td className="p-3 text-foreground">{row.value} &#8362;</td>
                        <td className="p-3 text-muted-foreground">{row.expiry}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={row.renewal === "אוטומטי" ? "text-green-300 border-green-600" : "text-amber-300 border-amber-600"}>
                            {row.renewal}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className={statusColors[row.status] || "bg-gray-500/20 text-gray-300"}>{row.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" title="צפייה"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="עריכה"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="מחיקה" className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* SLA Performance Summary */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            סיכום ביצועי SLA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agreements.filter(r => r.status === "פעיל").slice(0, 6).map(a => (
              <div key={a.id} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">{a.name}</p>
                  <span className={`text-xs font-bold ${a.slaActual >= parseFloat(a.sla) ? "text-green-400" : "text-red-400"}`}>
                    {a.slaActual}%
                  </span>
                </div>
                <Progress value={a.slaActual} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">יעד: {a.sla} | {a.terms}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
