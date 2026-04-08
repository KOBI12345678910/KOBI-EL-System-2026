import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScanBarcode, Wifi, Tag, Search, Plus, Download, Eye, Edit2,
  CheckCircle2, AlertTriangle, MapPin, Clock, Printer, Radio,
  Package, Activity
} from "lucide-react";

const FALLBACK_LABELS = [
  { id: "BC-10001", code: "7290001234501", type: "ברקוד", item: "פרופיל אלומיניום T-60", location: "מחסן A-12", lastScan: "2026-04-08 09:15", scanCount: 47, status: "פעיל" },
  { id: "BC-10002", code: "7290001234502", type: "ברקוד", item: "זכוכית מחוסמת 10מ\"מ", location: "מחסן B-03", lastScan: "2026-04-08 08:42", scanCount: 32, status: "פעיל" },
  { id: "RF-20001", code: "RFID-A7F3E2D1", type: "RFID", item: "לוח פלדה 2x1 מ׳", location: "אזור ייצור 1", lastScan: "2026-04-08 10:05", scanCount: 128, status: "פעיל" },
  { id: "RF-20002", code: "RFID-B8C4F1E0", type: "RFID", item: "משטח אלומיניום 3x1.5", location: "רציף טעינה 2", lastScan: "2026-04-08 07:30", scanCount: 85, status: "פעיל" },
  { id: "BC-10003", code: "7290001234503", type: "ברקוד", item: "פרופיל PVC חלון", location: "מחסן A-08", lastScan: "2026-04-07 16:20", scanCount: 23, status: "פעיל" },
  { id: "RF-20003", code: "RFID-C2D5A3B7", type: "RFID", item: "מנוע חשמלי 5HP", location: "תחזוקה", lastScan: "2026-04-06 11:00", scanCount: 15, status: "לא מוקצה" },
  { id: "BC-10004", code: "7290001234504", type: "ברקוד", item: "חומר איטום סיליקון", location: "מחסן C-01", lastScan: "2026-04-08 09:50", scanCount: 61, status: "פעיל" },
  { id: "RF-20004", code: "RFID-D9E6B4C8", type: "RFID", item: "ארגז כלים מקצועי", location: "לא ידוע", lastScan: "2026-03-28 14:15", scanCount: 8, status: "פגום" },
  { id: "BC-10005", code: "7290001234505", type: "ברקוד", item: "ברגים נירוסטה M8", location: "מחסן A-22", lastScan: "2026-04-08 08:10", scanCount: 94, status: "פעיל" },
  { id: "RF-20005", code: "RFID-E1F7C5D9", type: "RFID", item: "עגלת הובלה תעשייתית", location: "אזור ייצור 2", lastScan: "2026-04-08 10:30", scanCount: 203, status: "פעיל" },
];

const FALLBACK_SCANNER_STATIONS = [
  { id: "SCN-01", name: "כניסה ראשית - מחסן", type: "ברקוד + RFID", status: "מקוון", scansToday: 234, lastActivity: "10:32" },
  { id: "SCN-02", name: "רציף טעינה 1", type: "RFID", status: "מקוון", scansToday: 156, lastActivity: "10:28" },
  { id: "SCN-03", name: "רציף טעינה 2", type: "RFID", status: "מקוון", scansToday: 98, lastActivity: "10:05" },
  { id: "SCN-04", name: "כניסת ייצור", type: "ברקוד", status: "מקוון", scansToday: 312, lastActivity: "10:35" },
  { id: "SCN-05", name: "יציאת מוצר מוגמר", type: "ברקוד + RFID", status: "לא מקוון", scansToday: 0, lastActivity: "08:15" },
  { id: "SCN-06", name: "מחסן חומרי גלם", type: "ברקוד", status: "מקוון", scansToday: 187, lastActivity: "10:31" },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "לא מוקצה": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "פגום": "bg-red-500/20 text-red-300 border-red-500/30",
  "מבוטל": "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

export default function BarcodeRfid() {
  const { data: labels = FALLBACK_LABELS } = useQuery({
    queryKey: ["logistics-labels"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/barcode-rfid/labels");
      if (!res.ok) return FALLBACK_LABELS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_LABELS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: scannerStations = FALLBACK_SCANNER_STATIONS } = useQuery({
    queryKey: ["logistics-scanner-stations"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/barcode-rfid/scanner-stations");
      if (!res.ok) return FALLBACK_SCANNER_STATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SCANNER_STATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("labels");

  const filtered = useMemo(() => {
    return labels.filter(r => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.item.toLowerCase().includes(s) || r.code.toLowerCase().includes(s) || r.id.toLowerCase().includes(s) || r.location.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, typeFilter]);

  const kpis = useMemo(() => ({
    totalLabels: labels.length,
    activeLabels: labels.filter(l => l.status === "פעיל").length,
    scansToday: scannerStations.reduce((s, st) => s + st.scansToday, 0),
    onlineScanners: scannerStations.filter(s => s.status === "מקוון").length,
    faultyLabels: labels.filter(l => l.status === "פגום").length,
  }), []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScanBarcode className="h-7 w-7 text-violet-400" />
            ניהול ברקודים / RFID
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב תגים, סורקים ולוג סריקות | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Printer className="w-4 h-4 ml-1" />הדפסת תוויות</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700"><Plus className="w-4 h-4 ml-1" />תווית חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ תוויות</p>
                <p className="text-2xl font-bold text-white">{kpis.totalLabels}</p>
              </div>
              <Tag className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">תוויות פעילות</p>
                <p className="text-2xl font-bold text-green-300">{kpis.activeLabels}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={(kpis.activeLabels / kpis.totalLabels) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-900/50 to-violet-950 border-violet-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-violet-400">סריקות היום</p>
                <p className="text-2xl font-bold text-violet-300">{kpis.scansToday}</p>
              </div>
              <Activity className="h-8 w-8 text-violet-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-900/50 to-cyan-950 border-cyan-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-cyan-400">סורקים מקוונים</p>
                <p className="text-2xl font-bold text-cyan-300">{kpis.onlineScanners}/{scannerStations.length}</p>
              </div>
              <Radio className="h-8 w-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">תוויות פגומות</p>
                <p className="text-2xl font-bold text-red-300">{kpis.faultyLabels}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="labels">תוויות ותגים</TabsTrigger>
            <TabsTrigger value="scanners">תחנות סריקה</TabsTrigger>
            <TabsTrigger value="logs">לוג סריקות</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש קוד / פריט..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסוגים</option>
              <option value="ברקוד">ברקוד</option>
              <option value="RFID">RFID</option>
            </select>
          </div>
        </div>

        {/* Labels Tab */}
        <TabsContent value="labels" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קוד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פריט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מיקום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סריקה אחרונה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סריקות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-foreground font-mono text-xs">{row.id}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{row.code}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={row.type === "RFID" ? "text-violet-300 border-violet-500" : "text-cyan-300 border-cyan-500"}>
                            {row.type === "RFID" ? <Wifi className="w-3 h-3 ml-1" /> : <ScanBarcode className="w-3 h-3 ml-1" />}
                            {row.type}
                          </Badge>
                        </td>
                        <td className="p-3 text-foreground font-medium">
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-muted-foreground" />
                            {row.item}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {row.location}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{row.lastScan}</td>
                        <td className="p-3 text-foreground">{row.scanCount}</td>
                        <td className="p-3">
                          <Badge className={statusColors[row.status] || "bg-gray-500/20 text-gray-300"}>{row.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm"><Edit2 className="w-3.5 h-3.5" /></Button>
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

        {/* Scanner Stations Tab */}
        <TabsContent value="scanners" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scannerStations.map(st => (
              <Card key={st.id} className={`border ${st.status === "מקוון" ? "border-green-800/50 bg-green-950/20" : "border-red-800/50 bg-red-950/20"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-foreground">{st.name}</h3>
                    <Badge className={st.status === "מקוון" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}>
                      {st.status}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>מזהה:</span><span className="font-mono">{st.id}</span></div>
                    <div className="flex justify-between"><span>סוג:</span><span>{st.type}</span></div>
                    <div className="flex justify-between"><span>סריקות היום:</span><span className="font-bold text-foreground">{st.scansToday}</span></div>
                    <div className="flex justify-between"><span>פעילות אחרונה:</span><span>{st.lastActivity}</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Scan Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                סריקות אחרונות (היום)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { time: "10:35", station: "כניסת ייצור", item: "פרופיל אלומיניום T-60", action: "כניסה", user: "מוחמד ח." },
                  { time: "10:32", station: "כניסה ראשית", item: "חומר איטום סיליקון", action: "קבלה", user: "יוסי מ." },
                  { time: "10:31", station: "מחסן חומרי גלם", item: "ברגים נירוסטה M8", action: "ניפוק", user: "בני ג." },
                  { time: "10:30", station: "אזור ייצור 2", item: "עגלת הובלה תעשייתית", action: "מעבר", user: "עמית ב." },
                  { time: "10:05", station: "אזור ייצור 1", item: "לוח פלדה 2x1 מ׳", action: "שימוש", user: "אלי ש." },
                  { time: "09:50", station: "כניסה ראשית", item: "חומר איטום סיליקון", action: "קבלה", user: "דוד כ." },
                  { time: "09:15", station: "כניסה ראשית", item: "פרופיל אלומיניום T-60", action: "קבלה", user: "דוד כ." },
                  { time: "08:42", station: "מחסן חומרי גלם", item: "זכוכית מחוסמת 10מ\"מ", action: "ניפוק", user: "רונית ל." },
                ].map((log, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/20 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-12">{log.time}</span>
                      <Badge variant="outline" className="text-xs">{log.action}</Badge>
                      <span className="text-foreground">{log.item}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{log.station}</span>
                      <span className="text-foreground">{log.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
