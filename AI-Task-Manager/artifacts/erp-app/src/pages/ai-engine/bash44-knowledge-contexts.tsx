import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Brain, Database, Search, RefreshCw, Layers, FileText, Mail, Users, Package, FileSignature, Clock, Zap, AlertTriangle, CheckCircle2, BarChart3, Sparkles, GitBranch, Activity, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

type SourceType = "document" | "contract" | "email" | "meeting";
type EntityType = "project" | "customer" | "product" | "contract";
interface KCtx { id: string; entityType: EntityType; entityId: string; entityName: string; sourceType: SourceType; sourceRef: string; chunkPreview: string; freshnessScore: number; createdAt: string; }

const eCfg: Record<EntityType, { label: string; color: string; icon: any }> = {
  project: { label: "פרויקט", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Layers },
  customer: { label: "לקוח", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Users },
  product: { label: "מוצר", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: Package },
  contract: { label: "חוזה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: FileSignature },
};
const sCfg: Record<SourceType, { label: string; icon: any }> = {
  document: { label: "מסמך", icon: FileText }, contract: { label: "חוזה", icon: FileSignature },
  email: { label: "דוא\"ל", icon: Mail }, meeting: { label: "פגישה", icon: Users },
};

const FALLBACK_DATA: KCtx[] = [
  { id: "KC-001", entityType: "project", entityId: "PRJ-101", entityName: "מגדלי הים - חיפה", sourceType: "document", sourceRef: "DOC-2240", chunkPreview: "תכנון מסגרת אלומיניום לקומות 12-18, כולל חישוב עומסי רוח לפי ת\"י 1139...", freshnessScore: 95, createdAt: "2026-04-08" },
  { id: "KC-002", entityType: "customer", entityId: "CUS-032", entityName: "אפריקה ישראל", sourceType: "email", sourceRef: "EML-8841", chunkPreview: "אישור מנהל פרויקט לשינוי מפרט זכוכית מחוסמת לזכוכית למינציה בקומה 3...", freshnessScore: 88, createdAt: "2026-04-07" },
  { id: "KC-003", entityType: "product", entityId: "PRD-055", entityName: "חלון הזזה תרמי SL-90", sourceType: "document", sourceRef: "DOC-2238", chunkPreview: "ערך U-Value של 1.4 W/m²K, עומד בדרישות תקן בידוד תרמי SI-1045 עדכון 2025...", freshnessScore: 92, createdAt: "2026-04-07" },
  { id: "KC-004", entityType: "contract", entityId: "CON-018", entityName: "חוזה מסגרת - שיכון ובינוי", sourceType: "contract", sourceRef: "CON-2026-018", chunkPreview: "סעיף 12.3: קנס איחור בשיעור 0.5% לשבוע, מקסימום 10% מערך ההזמנה...", freshnessScore: 78, createdAt: "2026-04-06" },
  { id: "KC-005", entityType: "project", entityId: "PRJ-104", entityName: "מרכז מסחרי רמת גן", sourceType: "meeting", sourceRef: "MTG-0412", chunkPreview: "סוכם להקדים שלב התקנת חזיתות ל-15/04, הקבלן יספק מנוף נוסף...", freshnessScore: 85, createdAt: "2026-04-06" },
  { id: "KC-006", entityType: "customer", entityId: "CUS-045", entityName: "דניה סיבוס", sourceType: "email", sourceRef: "EML-8856", chunkPreview: "בקשה לקבלת הצעת מחיר מעודכנת לפרויקט מגורים בנתניה - 340 יח\"ד...", freshnessScore: 72, createdAt: "2026-04-05" },
  { id: "KC-007", entityType: "product", entityId: "PRD-061", entityName: "דלת כניסה ממ\"ד DM-40", sourceType: "document", sourceRef: "DOC-2235", chunkPreview: "עמידות בפני לחץ גל הדף 1.0 טון/מ\"ר, אטימות לגז כימי לפי ת\"י 4570...", freshnessScore: 96, createdAt: "2026-04-05" },
  { id: "KC-008", entityType: "contract", entityId: "CON-022", entityName: "הסכם אספקה - אלקואה", sourceType: "contract", sourceRef: "CON-2026-022", chunkPreview: "מחיר אלומיניום 6063-T5 קבוע ל-12 חודשים: $2,840/טון, FOB אשדוד...", freshnessScore: 65, createdAt: "2026-04-04" },
  { id: "KC-009", entityType: "project", entityId: "PRJ-108", entityName: "מלון ים המלח", sourceType: "document", sourceRef: "DOC-2231", chunkPreview: "דרישות מיוחדות לעמידות בקורוזיה - ציפוי אנודייז 25 מיקרון מינימום...", freshnessScore: 58, createdAt: "2026-04-04" },
  { id: "KC-010", entityType: "customer", entityId: "CUS-019", entityName: "קבוצת עזריאלי", sourceType: "meeting", sourceRef: "MTG-0408", chunkPreview: "דרישה לאחריות מורחבת של 15 שנה על חזיתות מבנה, כולל תחזוקה שנתית...", freshnessScore: 81, createdAt: "2026-04-03" },
  { id: "KC-011", entityType: "product", entityId: "PRD-048", entityName: "מערכת חזית CW-120", sourceType: "document", sourceRef: "DOC-2228", chunkPreview: "עומס רוח מקסימלי 2.5 kPa, סטייה מותרת ±2 מ\"מ בחיבורים, אטימות מים דרגה E1200...", freshnessScore: 44, createdAt: "2026-04-03" },
  { id: "KC-012", entityType: "contract", entityId: "CON-015", entityName: "חוזה משנה - התקנות צפון", sourceType: "email", sourceRef: "EML-8802", chunkPreview: "הודעה על עדכון תעריפי התקנה ב-8% החל מ-01/05/2026 בגין עליית שכר מינימום...", freshnessScore: 38, createdAt: "2026-04-02" },
  { id: "KC-013", entityType: "project", entityId: "PRJ-112", entityName: "קניון הנגב - באר שבע", sourceType: "meeting", sourceRef: "MTG-0405", chunkPreview: "אישור סופי לתוכניות עבודה, התחלת ייצור מתוכננת ל-20/04/2026...", freshnessScore: 71, createdAt: "2026-04-02" },
  { id: "KC-014", entityType: "customer", entityId: "CUS-051", entityName: "אלרוב נדל\"ן", sourceType: "document", sourceRef: "DOC-2225", chunkPreview: "מפרט טכני לפרויקט מלונות יוקרה - דרישות אקוסטיות Rw=45dB לחלונות...", freshnessScore: 53, createdAt: "2026-04-01" },
  { id: "KC-015", entityType: "product", entityId: "PRD-072", entityName: "תריס חשמלי RS-50E", sourceType: "contract", sourceRef: "CON-2026-030", chunkPreview: "אחריות מנוע Somfy 5 שנים, כולל שלט RF 16 ערוצים, חיבור לבית חכם...", freshnessScore: 87, createdAt: "2026-04-01" },
];

const embStats = { totalVectors: 48720, dimensions: 1536, indexType: "HNSW", indexHealth: 97, lastReindex: "2026-04-07 02:30", avgLatency: "12ms", storage: "2.4 GB", compression: "3.2x",
  dist: [{ type: "פרויקטים", count: 14200, pct: 29 }, { type: "לקוחות", count: 11680, pct: 24 }, { type: "מוצרים", count: 12900, pct: 26 }, { type: "חוזים", count: 9940, pct: 21 }],
};

const FALLBACK_SEM_RESULTS = [
  { id: "SR-1", ctxId: "KC-001", text: "תכנון מסגרת אלומיניום לקומות 12-18, כולל חישוב עומסי רוח...", sim: 0.96, entity: "מגדלי הים - חיפה", et: "project" as EntityType },
  { id: "SR-2", ctxId: "KC-009", text: "דרישות מיוחדות לעמידות בקורוזיה - ציפוי אנודייז 25 מיקרון...", sim: 0.91, entity: "מלון ים המלח", et: "project" as EntityType },
  { id: "SR-3", ctxId: "KC-011", text: "עומס רוח מקסימלי 2.5 kPa, סטייה מותרת ±2 מ\"מ בחיבורים...", sim: 0.87, entity: "מערכת חזית CW-120", et: "product" as EntityType },
  { id: "SR-4", ctxId: "KC-003", text: "ערך U-Value של 1.4 W/m²K, עומד בדרישות תקן בידוד תרמי...", sim: 0.82, entity: "חלון הזזה תרמי SL-90", et: "product" as EntityType },
  { id: "SR-5", ctxId: "KC-007", text: "עמידות בפני לחץ גל הדף 1.0 טון/מ\"ר, אטימות לגז כימי...", sim: 0.78, entity: "דלת כניסה ממ\"ד DM-40", et: "product" as EntityType },
];

const fColor = (s: number) => s >= 80 ? "text-green-400" : s >= 50 ? "text-yellow-400" : "text-red-400";
const fBg = (s: number) => s >= 80 ? "bg-green-500/20 text-green-400 border-green-500/30" : s >= 50 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";

export default function Bash44KnowledgeContexts() {

  const { data: apiData } = useQuery({
    queryKey: ["bash44_knowledge_contexts"],
    queryFn: () => authFetch("/api/ai/bash44-knowledge-contexts").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const data = apiData?.data ?? FALLBACK_DATA;
  const semResults = apiData?.semResults ?? FALLBACK_SEM_RESULTS;
  const [search, setSearch] = useState("");
  const [semQuery, setSemQuery] = useState("");
  const [semDone, setSemDone] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const avgFresh = Math.round(data.reduce((s, k) => s + k.freshnessScore, 0) / data.length);
  const staleCount = data.filter(k => k.freshnessScore < 50).length;
  const filtered = data.filter(k => !search || k.entityName.includes(search) || k.chunkPreview.includes(search) || k.sourceRef.includes(search) || k.entityId.includes(search));
  const grouped: Record<EntityType, KCtx[]> = { project: [], customer: [], product: [], contract: [] };
  data.forEach(k => grouped[k.entityType].push(k));

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0d1025] to-[#0a0a1a] text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Brain className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-cyan-400 to-blue-400 bg-clip-text text-transparent">בסיס ידע והקשרים - AI</h1>
            <p className="text-sm text-slate-400">ניהול הקשרי ידע, Embeddings וחיפוש סמנטי | טכנו-כל עוזי</p>
          </div>
        </div>
        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs"><Activity className="w-3 h-3 ml-1" />מעודכן: {new Date().toLocaleDateString("he-IL")}</Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "סה\"כ הקשרים", value: data.length, icon: Database, color: "from-cyan-500 to-blue-600", sub: "רשומות ידע" },
          { label: "סוגי ישויות", value: 4, icon: Layers, color: "from-purple-500 to-violet-600", sub: "פרויקט/לקוח/מוצר/חוזה" },
          { label: "Embeddings", value: embStats.totalVectors.toLocaleString(), icon: GitBranch, color: "from-emerald-500 to-green-600", sub: `${embStats.dimensions} ממדים` },
          { label: "ציון רעננות ממוצע", value: `${avgFresh}%`, icon: Sparkles, color: "from-amber-500 to-orange-600", sub: avgFresh >= 70 ? "תקין" : "דורש עדכון" },
          { label: "הקשרים מיושנים", value: staleCount, icon: AlertTriangle, color: "from-red-500 to-rose-600", sub: "ציון < 50" },
        ].map((k, i) => (
          <Card key={i} className="bg-[#111827]/80 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">{k.label}</span>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${k.color} flex items-center justify-center`}><k.icon className="w-4 h-4 text-white" /></div>
              </div>
              <div className="text-2xl font-bold text-white">{k.value}</div>
              <span className="text-[11px] text-slate-500">{k.sub}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="contexts" className="space-y-4">
        <TabsList className="bg-[#111827]/80 border border-slate-700/50">
          <TabsTrigger value="contexts" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"><Database className="w-4 h-4 ml-1" />הקשרי ידע</TabsTrigger>
          <TabsTrigger value="by-entity" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"><Layers className="w-4 h-4 ml-1" />לפי ישות</TabsTrigger>
          <TabsTrigger value="embeddings" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"><GitBranch className="w-4 h-4 ml-1" />Embeddings</TabsTrigger>
          <TabsTrigger value="semantic-search" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400"><Search className="w-4 h-4 ml-1" />חיפוש סמנטי</TabsTrigger>
        </TabsList>

        {/* Tab 1: Contexts */}
        <TabsContent value="contexts" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="חיפוש לפי שם ישות, תוכן, מזהה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10 bg-[#111827]/80 border-slate-700/50 text-white placeholder:text-slate-500" />
            </div>
            <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50">{filtered.length} תוצאות</Badge>
          </div>
          <Card className="bg-[#111827]/80 border-slate-700/50">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400 text-xs">
                    <th className="p-3 text-right">מזהה</th><th className="p-3 text-right">סוג ישות</th><th className="p-3 text-right">שם ישות</th>
                    <th className="p-3 text-right">סוג מקור</th><th className="p-3 text-right">הפניה</th><th className="p-3 text-right">תצוגה מקדימה</th>
                    <th className="p-3 text-center">רעננות</th><th className="p-3 text-right">תאריך</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ctx => {
                    const ec = eCfg[ctx.entityType], sc = sCfg[ctx.sourceType];
                    return (
                      <tr key={ctx.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-slate-400">{ctx.id}</td>
                        <td className="p-3"><Badge className={`${ec.color} text-[11px]`}><ec.icon className="w-3 h-3 ml-1" />{ec.label}</Badge></td>
                        <td className="p-3 text-white font-medium text-xs">{ctx.entityName}</td>
                        <td className="p-3"><span className="flex items-center gap-1 text-xs text-slate-300"><sc.icon className="w-3 h-3" />{sc.label}</span></td>
                        <td className="p-3 font-mono text-xs text-cyan-400">{ctx.sourceRef}</td>
                        <td className="p-3 text-xs text-slate-400 max-w-[260px] truncate">{ctx.chunkPreview}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs font-bold ${fColor(ctx.freshnessScore)}`}>{ctx.freshnessScore}%</span>
                          <Progress value={ctx.freshnessScore} className="h-1.5 w-16 mt-1 mx-auto" />
                        </td>
                        <td className="p-3 text-xs text-slate-400">{ctx.createdAt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: By Entity */}
        <TabsContent value="by-entity" className="space-y-4">
          {(["project", "customer", "product", "contract"] as EntityType[]).map(type => {
            const cfg = eCfg[type], items = grouped[type];
            return (
              <Card key={type} className="bg-[#111827]/80 border-slate-700/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <div className={`w-8 h-8 rounded-lg ${cfg.color} flex items-center justify-center`}><cfg.icon className="w-4 h-4" /></div>
                      {cfg.label}ים
                    </CardTitle>
                    <Badge className={`${cfg.color} text-xs`}>{items.length} הקשרים</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {items.map(ctx => {
                    const sc = sCfg[ctx.sourceType];
                    return (
                      <div key={ctx.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">{ctx.entityName}</span>
                            <span className="font-mono text-[10px] text-slate-500">{ctx.entityId}</span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{ctx.chunkPreview}</p>
                        </div>
                        <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-[10px]"><sc.icon className="w-3 h-3 ml-1" />{sc.label}</Badge>
                        <Badge className={`${fBg(ctx.freshnessScore)} text-[10px]`}>{ctx.freshnessScore}%</Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Tab 3: Embeddings */}
        <TabsContent value="embeddings" className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "סה\"כ וקטורים", value: embStats.totalVectors.toLocaleString(), icon: Database },
              { label: "ממדים", value: embStats.dimensions.toLocaleString(), icon: GitBranch },
              { label: "זמן שאילתה ממוצע", value: embStats.avgLatency, icon: Zap },
              { label: "נפח אחסון", value: embStats.storage, icon: BarChart3 },
            ].map((s, i) => (
              <Card key={i} className="bg-[#111827]/80 border-slate-700/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center"><s.icon className="w-5 h-5 text-emerald-400" /></div>
                  <div><div className="text-lg font-bold text-white">{s.value}</div><div className="text-xs text-slate-400">{s.label}</div></div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-[#111827]/80 border-slate-700/50">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" />בריאות אינדקס</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">סוג אינדקס</span><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{embStats.indexType}</Badge></div>
                <div>
                  <div className="flex items-center justify-between mb-1"><span className="text-sm text-slate-300">בריאות כללית</span><span className="text-sm font-bold text-emerald-400">{embStats.indexHealth}%</span></div>
                  <Progress value={embStats.indexHealth} className="h-2" />
                </div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">יחס דחיסה</span><span className="text-sm font-medium text-white">{embStats.compression}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">אינדוקס אחרון</span><span className="text-xs text-slate-400">{embStats.lastReindex}</span></div>
                <Button onClick={() => { setReindexing(true); setTimeout(() => setReindexing(false), 3000); }} disabled={reindexing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  <RefreshCw className={`w-4 h-4 ml-2 ${reindexing ? "animate-spin" : ""}`} />{reindexing ? "מאנדקס מחדש..." : "אנדקס מחדש"}
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-[#111827]/80 border-slate-700/50">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-purple-400" />התפלגות לפי ישות</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {embStats.dist.map((ed, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1"><span className="text-sm text-slate-300">{ed.type}</span><span className="text-xs text-slate-400">{ed.count.toLocaleString()} ({ed.pct}%)</span></div>
                    <Progress value={ed.pct} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Quality Metrics */}
          <Card className="bg-[#111827]/80 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                מדדי איכות Embedding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-slate-800/30 text-center">
                  <div className="text-lg font-bold text-green-400">99.2%</div>
                  <div className="text-xs text-slate-400">דיוק חיפוש (Recall@10)</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/30 text-center">
                  <div className="text-lg font-bold text-cyan-400">0.89</div>
                  <div className="text-xs text-slate-400">ציון MRR ממוצע</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/30 text-center">
                  <div className="text-lg font-bold text-amber-400">4.2M</div>
                  <div className="text-xs text-slate-400">שאילתות החודש</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Semantic Search */}
        <TabsContent value="semantic-search" className="space-y-4">
          <Card className="bg-[#111827]/80 border-slate-700/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4 text-amber-400" />חיפוש סמנטי בבסיס הידע</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                  <Input placeholder="הקלד שאילתה בשפה חופשית... לדוגמה: עמידות לרוח בפרויקטים גבוהים" value={semQuery}
                    onChange={e => { setSemQuery(e.target.value); setSemDone(false); }} onKeyDown={e => e.key === "Enter" && semQuery.trim() && setSemDone(true)}
                    className="pr-10 bg-slate-800/50 border-slate-700/50 text-white placeholder:text-slate-500" />
                </div>
                <Button onClick={() => semQuery.trim() && setSemDone(true)} className="bg-amber-600 hover:bg-amber-700 text-white"><Search className="w-4 h-4 ml-2" />חפש</Button>
              </div>
              {!semDone && (
                <div className="text-center py-8 text-slate-500">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">הקלד שאילתה וה-LLM ימצא את ההקשרים הרלוונטיים ביותר</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-3">
                    {["עמידות לרוח בפרויקטים", "חוזים עם קנסות", "מפרט זכוכית", "תעריפי אלומיניום"].map(q => (
                      <Button key={q} variant="outline" size="sm" className="text-xs border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/50"
                        onClick={() => { setSemQuery(q); setSemDone(true); }}>{q}</Button>
                    ))}
                  </div>
                </div>
              )}
              {semDone && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 inline ml-1 text-green-400" />נמצאו {semResults.length} תוצאות עבור: <span className="text-amber-400 font-medium">"{semQuery}"</span></span>
                    <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50 text-xs"><Clock className="w-3 h-3 ml-1" />14ms</Badge>
                  </div>
                  {semResults.map((r, i) => {
                    const rc = eCfg[r.et];
                    return (
                      <div key={r.id} className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:border-amber-500/30 transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                            <span className="text-sm font-medium text-white">{r.entity}</span>
                            <Badge className={`${rc.color} text-[10px]`}>{rc.label}</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-500">דמיון:</span>
                            <Badge className={`text-xs font-mono ${r.sim >= 0.9 ? "bg-green-500/20 text-green-400 border-green-500/30" : r.sim >= 0.8 ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" : "bg-slate-600/30 text-slate-300 border-slate-600/40"}`}>{(r.sim * 100).toFixed(1)}%</Badge>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mr-8">{r.text}</p>
                        <div className="flex items-center gap-2 mt-2 mr-8">
                          <span className="font-mono text-[10px] text-slate-600">{r.ctxId}</span>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 px-2"><Eye className="w-3 h-3 ml-1" />צפה בהקשר מלא</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
