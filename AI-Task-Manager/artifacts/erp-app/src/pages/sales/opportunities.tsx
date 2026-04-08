import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus, Search, Filter, Download, Target, BarChart3, Users,
  Calendar, DollarSign, TrendingUp, ChevronRight, Eye, Edit2,
  MoreHorizontal, ArrowLeftRight, FileText, Phone
} from "lucide-react";
import { useLocation } from "wouter";

const STAGES = [
  { value: "new", label: "ליד חדש", color: "bg-gray-400", probability: 10 },
  { value: "qualification", label: "בדיקת התאמה", color: "bg-blue-400", probability: 20 },
  { value: "proposal", label: "הצעת מחיר", color: "bg-indigo-400", probability: 40 },
  { value: "negotiation", label: "משא ומתן", color: "bg-purple-400", probability: 60 },
  { value: "closing", label: "סגירה", color: "bg-amber-400", probability: 80 },
  { value: "closed_won", label: "נסגר ✓", color: "bg-emerald-500", probability: 100 },
  { value: "closed_lost", label: "אבד ✗", color: "bg-red-500", probability: 0 },
];

const opportunities = [
  { id: 1, name: "פרויקט מגדל A - שלב ב'", customer: "קבוצת אלון", contact: "אבי כהן", value: 850000, stage: "negotiation", probability: 65, expectedClose: "2026-05-15", owner: "דני כהן", source: "referral", created: "2026-02-10", lastActivity: "2026-04-07", nextAction: "פגישת סיכום מחירים" },
  { id: 2, name: "חיפוי מגורים רמת גן", customer: "שיכון ובינוי", contact: "רונית לוי", value: 620000, stage: "proposal", probability: 40, expectedClose: "2026-06-01", owner: "מיכל לוי", source: "website", created: "2026-03-01", lastActivity: "2026-04-05", nextAction: "שליחת הצעה מעודכנת" },
  { id: 3, name: "משרדי hi-tech הרצליה", customer: "אמות השקעות", contact: "דוד שמיר", value: 480000, stage: "closing", probability: 85, expectedClose: "2026-04-20", owner: "דני כהן", source: "cold_call", created: "2026-01-15", lastActivity: "2026-04-08", nextAction: "חתימת חוזה" },
  { id: 4, name: "בית ספר חולון - שיפוץ", customer: "עיריית חולון", contact: "שרה אברהם", value: 320000, stage: "qualification", probability: 25, expectedClose: "2026-07-01", owner: "יוסי אברהם", source: "tender", created: "2026-03-15", lastActivity: "2026-04-02", nextAction: "סיור באתר" },
  { id: 5, name: "מפעל אור יהודה", customer: "תעשיות ORT", contact: "משה דן", value: 290000, stage: "proposal", probability: 50, expectedClose: "2026-05-30", owner: "מיכל לוי", source: "event", created: "2026-02-20", lastActivity: "2026-04-06", nextAction: "הצגת דגמים" },
  { id: 6, name: "מרכז מסחרי באר שבע", customer: "BIG מרכזי קניות", contact: "יעל גולדן", value: 1200000, stage: "new", probability: 10, expectedClose: "2026-08-01", owner: "דני כהן", source: "referral", created: "2026-04-01", lastActivity: "2026-04-08", nextAction: "פגישת היכרות" },
  { id: 7, name: "בניין משרדים ת\"א", customer: 'נדל"ן פלוס', contact: "אורי רז", value: 380000, stage: "closed_won", probability: 100, expectedClose: "2026-03-30", owner: "יוסי אברהם", source: "website", created: "2025-12-10", lastActivity: "2026-03-30", nextAction: "—" },
  { id: 8, name: "מלון אילת - חידוש", customer: "רשת פתאל", contact: "נעמי בר", value: 550000, stage: "closed_lost", probability: 0, expectedClose: "2026-04-01", owner: "מיכל לוי", source: "cold_call", created: "2026-01-20", lastActivity: "2026-03-28", nextAction: "—" },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : `₪${(v / 1000).toFixed(0)}K`;

export default function Opportunities() {
  const [, navigate] = useLocation();
  const [viewMode, setViewMode] = useState<"table" | "kanban">("kanban");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() =>
    opportunities.filter(o => {
      if (stageFilter !== "all" && o.stage !== stageFilter) return false;
      if (ownerFilter !== "all" && o.owner !== ownerFilter) return false;
      if (search && !o.name.includes(search) && !o.customer.includes(search)) return false;
      return true;
    }),
    [stageFilter, ownerFilter, search]
  );

  const activeStages = STAGES.filter(s => s.value !== "closed_won" && s.value !== "closed_lost");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-7 w-7 text-primary" /> הזדמנויות מכירה
          </h1>
          <p className="text-sm text-muted-foreground">{opportunities.filter(o => o.stage !== "closed_won" && o.stage !== "closed_lost").length} פעילות | Pipeline: {fmt(opportunities.filter(o => o.stage !== "closed_won" && o.stage !== "closed_lost").reduce((s, o) => s + o.value, 0))}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-md">
            <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" className="rounded-l-none" onClick={() => setViewMode("kanban")}>Kanban</Button>
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" className="rounded-r-none" onClick={() => setViewMode("table")}>טבלה</Button>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-1" /> הזדמנות חדשה</Button></DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle>הזדמנות חדשה</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">שם ההזדמנות</Label><Input /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">לקוח</Label><Input /></div>
                  <div><Label className="text-xs">איש קשר</Label><Input /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">ערך משוער</Label><Input type="number" /></div>
                  <div><Label className="text-xs">תאריך סגירה צפוי</Label><Input type="date" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">מקור</Label>
                    <Select><SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="referral">הפניה</SelectItem>
                        <SelectItem value="website">אתר</SelectItem>
                        <SelectItem value="cold_call">שיחה קרה</SelectItem>
                        <SelectItem value="event">אירוע</SelectItem>
                        <SelectItem value="tender">מכרז</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">אחראי</Label>
                    <Select><SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="דני כהן">דני כהן</SelectItem>
                        <SelectItem value="מיכל לוי">מיכל לוי</SelectItem>
                        <SelectItem value="יוסי אברהם">יוסי אברהם</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">הערות</Label><Textarea /></div>
                <Button className="w-full" onClick={() => setShowCreate(false)}>צור הזדמנות</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="חפש הזדמנות / לקוח..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pr-8" />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="שלב" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל השלבים</SelectItem>
                {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="אחראי" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כולם</SelectItem>
                <SelectItem value="דני כהן">דני כהן</SelectItem>
                <SelectItem value="מיכל לוי">מיכל לוי</SelectItem>
                <SelectItem value="יוסי אברהם">יוסי אברהם</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8"><Download className="h-3.5 w-3.5" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Kanban View */}
      {viewMode === "kanban" ? (
        <div className="grid grid-cols-5 gap-3">
          {activeStages.map(stage => {
            const stageOpps = filtered.filter(o => o.stage === stage.value);
            const stageValue = stageOpps.reduce((s, o) => s + o.value, 0);
            return (
              <div key={stage.value} className="space-y-2">
                <div className={`p-2 rounded-t-lg ${stage.color} text-white text-xs font-bold flex justify-between`}>
                  <span>{stage.label}</span>
                  <span>{stageOpps.length} | {fmt(stageValue)}</span>
                </div>
                <div className="space-y-2 min-h-[200px]">
                  {stageOpps.map(opp => (
                    <Card key={opp.id} className="cursor-pointer hover:shadow-md transition-shadow border-r-4" style={{ borderRightColor: stage.color.replace("bg-", "") }}>
                      <CardContent className="pt-3 pb-2 space-y-1.5">
                        <p className="text-xs font-bold truncate">{opp.name}</p>
                        <p className="text-[10px] text-muted-foreground">{opp.customer}</p>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold">{fmt(opp.value)}</span>
                          <Badge variant="outline" className="text-[9px]">{opp.probability}%</Badge>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{opp.owner}</span>
                          <span>{opp.expectedClose}</span>
                        </div>
                        <p className="text-[10px] text-primary truncate">{opp.nextAction}</p>
                      </CardContent>
                    </Card>
                  ))}
                  {stageOpps.length === 0 && (
                    <div className="text-center text-[10px] text-muted-foreground py-8">אין הזדמנויות</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">הזדמנות</TableHead>
                    <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ערך</TableHead>
                    <TableHead className="text-right text-xs font-semibold">שלב</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סיכוי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סגירה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אחראי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פעולה הבאה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(opp => {
                    const stageCfg = STAGES.find(s => s.value === opp.stage);
                    return (
                      <TableRow key={opp.id} className="hover:bg-muted/10 cursor-pointer">
                        <TableCell>
                          <div>
                            <p className="text-xs font-medium">{opp.name}</p>
                            <p className="text-[10px] text-muted-foreground">{opp.source}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{opp.customer}</TableCell>
                        <TableCell className="font-mono text-xs font-bold">{fmt(opp.value)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] text-white ${stageCfg?.color}`}>{stageCfg?.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Progress value={opp.probability} className="h-1.5 w-10" />
                            <span className="text-[10px] font-mono">{opp.probability}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">{opp.expectedClose}</TableCell>
                        <TableCell className="text-xs">{opp.owner}</TableCell>
                        <TableCell className="text-[10px] text-primary max-w-[150px] truncate">{opp.nextAction}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
