import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Network, Users, Building2, User, Briefcase, Link2,
  Crown, Eye, Star, Shield, Zap, Search, ChevronRight,
  ArrowRight, UserCheck, Phone, Mail
} from "lucide-react";

// ============================================================
// RELATIONSHIP DATA
// ============================================================
const nodes = [
  // Customers
  { id: "c1", type: "customer", name: "קבוצת אלון", score: 88, value: 2850000 },
  { id: "c2", type: "customer", name: "שיכון ובינוי", score: 62, value: 4200000 },
  { id: "c3", type: "customer", name: "אמות השקעות", score: 95, value: 1800000 },
  { id: "c4", type: "customer", name: "BIG מרכזי קניות", score: 55, value: 0 },
  // Contacts
  { id: "p1", type: "contact", name: "אבי כהן", role: "מנהל רכש", company: "קבוצת אלון", isDecisionMaker: true },
  { id: "p2", type: "contact", name: "רונית לוי", role: "מנהלת פרויקטים", company: "שיכון ובינוי", isDecisionMaker: false },
  { id: "p3", type: "contact", name: "דוד שמיר", role: "CEO", company: "אמות השקעות", isDecisionMaker: true },
  { id: "p4", type: "contact", name: "יעל גולדן", role: "VP Operations", company: "BIG", isDecisionMaker: true },
  { id: "p5", type: "contact", name: "משה כהן", role: "CFO", company: "קבוצת אלון", isDecisionMaker: true },
  { id: "p6", type: "contact", name: "נעמי בר", role: "מנהלת רכש", company: "שיכון ובינוי", isDecisionMaker: false },
  // Agents
  { id: "a1", type: "agent", name: "דני כהן", role: "Senior Sales" },
  { id: "a2", type: "agent", name: "מיכל לוי", role: "Sales" },
  // Deals
  { id: "d1", type: "deal", name: "מגדל A שלב ב'", value: 850000 },
  { id: "d2", type: "deal", name: "חיפוי רמת גן", value: 620000 },
  { id: "d3", type: "deal", name: "משרדי הרצליה", value: 480000 },
];

const edges = [
  // Customer-Contact
  { source: "c1", target: "p1", type: "works_with", strength: 95 },
  { source: "c1", target: "p5", type: "works_with", strength: 85 },
  { source: "c2", target: "p2", type: "works_with", strength: 72 },
  { source: "c2", target: "p6", type: "works_with", strength: 60 },
  { source: "c3", target: "p3", type: "works_with", strength: 90 },
  { source: "c4", target: "p4", type: "works_with", strength: 55 },
  // Decision makers
  { source: "p1", target: "d1", type: "decides", strength: 90 },
  { source: "p5", target: "d1", type: "influences", strength: 75 },
  { source: "p3", target: "d3", type: "decides", strength: 95 },
  { source: "p2", target: "d2", type: "influences", strength: 65 },
  { source: "p6", target: "d2", type: "decides", strength: 80 },
  // Agent-Deal
  { source: "a1", target: "d1", type: "connected_to", strength: 100 },
  { source: "a1", target: "d3", type: "connected_to", strength: 100 },
  { source: "a2", target: "d2", type: "connected_to", strength: 100 },
  // Cross-company influence
  { source: "p1", target: "p4", type: "influences", strength: 45, note: "חברים - אבי המליץ עלינו ל-BIG" },
  { source: "p3", target: "p1", type: "connected_to", strength: 55, note: "ישבו יחד בדירקטוריון" },
  // Referral paths
  { source: "c1", target: "c4", type: "referred_by", strength: 40, note: "הפניה מאבי כהן" },
];

const hiddenInfluencers = [
  { person: "משה כהן (CFO, קבוצת אלון)", influence: "מאשר סופית כל עסקה מעל ₪500K", discovered: "AI - ניתוח מיילים", strength: 85 },
  { person: "נעמי בר (רכש, שיכון ובינוי)", influence: "מכינה את ה-shortlist - בפועל מחליטה", discovered: "AI - ניתוח שיחות", strength: 80 },
  { person: "יעל גולדן (VP Ops, BIG)", influence: "הגיעה דרך הפניה מאבי כהן - רקע אישי חזק", discovered: "AI - relationship mining", strength: 70 },
];

const networkMetrics = {
  totalNodes: nodes.length,
  totalEdges: edges.length,
  avgStrength: Math.round(edges.reduce((s, e) => s + e.strength, 0) / edges.length),
  decisionMakers: nodes.filter((n: any) => n.isDecisionMaker).length,
  hiddenInfluencers: hiddenInfluencers.length,
  referralPaths: edges.filter(e => e.type === "referred_by").length,
  crossCompanyLinks: edges.filter(e => {
    const sNode = nodes.find(n => n.id === e.source);
    const tNode = nodes.find(n => n.id === e.target);
    return sNode && tNode && (sNode as any).company !== (tNode as any).company;
  }).length,
};

const edgeTypeConfig: Record<string, { label: string; color: string }> = {
  works_with: { label: "עובד עם", color: "text-blue-600" },
  decides: { label: "מחליט", color: "text-red-600" },
  influences: { label: "משפיע", color: "text-purple-600" },
  connected_to: { label: "מחובר", color: "text-gray-600" },
  referred_by: { label: "הפנה", color: "text-emerald-600" },
};

const nodeTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  customer: { label: "לקוח", icon: Building2, color: "bg-blue-500" },
  contact: { label: "איש קשר", icon: User, color: "bg-purple-500" },
  agent: { label: "סוכן", icon: UserCheck, color: "bg-emerald-500" },
  deal: { label: "עסקה", icon: Briefcase, color: "bg-amber-500" },
};

export default function RelationshipGraph() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");

  const filteredNodes = filterType === "all" ? nodes : nodes.filter(n => n.type === filterType);
  const selectedEdges = selectedNode ? edges.filter(e => e.source === selectedNode || e.target === selectedNode) : [];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-7 w-7 text-primary" /> Relationship Graph
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            מיפוי קשרים | מקבלי החלטות | משפיענים נסתרים | נתיבי הפניה | Network Strength
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-7 gap-2">
        {[
          { label: "Nodes", value: networkMetrics.totalNodes, icon: Users },
          { label: "Edges", value: networkMetrics.totalEdges, icon: Link2 },
          { label: "Avg Strength", value: `${networkMetrics.avgStrength}%`, icon: Zap },
          { label: "Decision Makers", value: networkMetrics.decisionMakers, icon: Crown },
          { label: "Hidden Influencers", value: networkMetrics.hiddenInfluencers, icon: Eye },
          { label: "Referral Paths", value: networkMetrics.referralPaths, icon: ArrowRight },
          { label: "Cross-Company", value: networkMetrics.crossCompanyLinks, icon: Network },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="pt-2 pb-1.5 text-center px-2">
                <Icon className="h-3.5 w-3.5 mx-auto text-primary mb-0.5" />
                <p className="text-[8px] text-muted-foreground">{m.label}</p>
                <p className="text-sm font-bold font-mono">{m.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="graph">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="graph" className="text-xs gap-1"><Network className="h-3.5 w-3.5" /> גרף</TabsTrigger>
          <TabsTrigger value="hidden" className="text-xs gap-1"><Eye className="h-3.5 w-3.5" /> משפיענים נסתרים</TabsTrigger>
          <TabsTrigger value="paths" className="text-xs gap-1"><ArrowRight className="h-3.5 w-3.5" /> נתיבי הפניה</TabsTrigger>
        </TabsList>

        {/* Visual Graph */}
        <TabsContent value="graph" className="space-y-4">
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="customer">לקוחות</SelectItem>
                <SelectItem value="contact">אנשי קשר</SelectItem>
                <SelectItem value="agent">סוכנים</SelectItem>
                <SelectItem value="deal">עסקאות</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Graph Visualization */}
          <Card>
            <CardContent className="pt-4">
              <div className="relative h-80 bg-muted/10 rounded-lg overflow-hidden">
                {/* Nodes positioned in a force-layout approximation */}
                {filteredNodes.map((node, i) => {
                  const ntc = nodeTypeConfig[node.type];
                  const Icon = ntc.icon;
                  const positions = [
                    { x: 20, y: 25 }, { x: 50, y: 15 }, { x: 80, y: 30 }, { x: 65, y: 60 },
                    { x: 15, y: 55 }, { x: 35, y: 45 }, { x: 55, y: 40 }, { x: 75, y: 50 },
                    { x: 25, y: 75 }, { x: 45, y: 70 }, { x: 10, y: 40 }, { x: 90, y: 45 },
                    { x: 40, y: 85 }, { x: 60, y: 80 }, { x: 30, y: 20 },
                  ];
                  const pos = positions[i % positions.length];
                  const isSelected = selectedNode === node.id;
                  const isConnected = selectedNode && selectedEdges.some(e => e.source === node.id || e.target === node.id);

                  return (
                    <div
                      key={node.id}
                      className={`absolute cursor-pointer transition-all duration-300 ${
                        isSelected ? "scale-125 z-20" : isConnected ? "scale-110 z-10" : selectedNode ? "opacity-30" : ""
                      }`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
                      onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                    >
                      <div className={`${ntc.color} rounded-full p-2 shadow-lg ${isSelected ? "ring-4 ring-primary/50" : ""}`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <p className="text-[8px] text-center mt-0.5 font-medium whitespace-nowrap">{node.name}</p>
                      {(node as any).isDecisionMaker && <Crown className="h-3 w-3 text-amber-500 absolute -top-1 -right-1" />}
                    </div>
                  );
                })}

                {/* Edge lines (simplified) */}
                {selectedNode && selectedEdges.map((edge, i) => {
                  const etc = edgeTypeConfig[edge.type];
                  return (
                    <div key={i} className="absolute bottom-2 right-2 text-[8px] bg-background/90 p-1 rounded border">
                      <span className={etc.color}>{etc.label}</span>: {nodes.find(n => n.id === (edge.source === selectedNode ? edge.target : edge.source))?.name} ({edge.strength}%)
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-4 mt-3 text-[9px]">
                {Object.entries(nodeTypeConfig).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <span key={key} className="flex items-center gap-1">
                      <div className={`w-3 h-3 rounded-full ${cfg.color}`} />{cfg.label}
                    </span>
                  );
                })}
                <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-amber-500" />Decision Maker</span>
              </div>
            </CardContent>
          </Card>

          {/* Selected Node Details */}
          {selectedNode && (
            <Card className="border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">קשרים של: {nodes.find(n => n.id === selectedNode)?.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-right text-[10px]">מחובר ל</TableHead>
                      <TableHead className="text-right text-[10px]">סוג קשר</TableHead>
                      <TableHead className="text-right text-[10px]">חוזק</TableHead>
                      <TableHead className="text-right text-[10px]">הערה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedEdges.map((edge, i) => {
                      const otherNode = nodes.find(n => n.id === (edge.source === selectedNode ? edge.target : edge.source));
                      const etc = edgeTypeConfig[edge.type];
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{otherNode?.name}</TableCell>
                          <TableCell><Badge className={`text-[8px] ${etc.color}`}>{etc.label}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${edge.strength}%` }} />
                              </div>
                              <span className="text-[9px] font-mono">{edge.strength}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[9px] text-muted-foreground">{(edge as any).note || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Hidden Influencers */}
        <TabsContent value="hidden">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-purple-500" /> Hidden Decision Makers — AI Detection</CardTitle>
              <CardDescription>אנשים שלא מופיעים כמקבלי החלטות רשמיים אבל משפיעים על התוצאה</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {hiddenInfluencers.map((hi, i) => (
                  <div key={i} className="p-4 rounded-lg border border-purple-200 bg-purple-50/20">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-purple-100">
                        <Eye className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold">{hi.person}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{hi.influence}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="outline" className="text-[8px]">🔍 {hi.discovered}</Badge>
                          <Badge className="bg-purple-100 text-purple-700 text-[8px]">Influence: {hi.strength}%</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referral Paths */}
        <TabsContent value="paths">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ArrowRight className="h-4 w-4 text-emerald-500" /> נתיבי הפניה</CardTitle>
            </CardHeader>
            <CardContent>
              {edges.filter(e => e.type === "referred_by" || e.type === "influences").map((edge, i) => {
                const source = nodes.find(n => n.id === edge.source);
                const target = nodes.find(n => n.id === edge.target);
                return (
                  <div key={i} className="flex items-center gap-3 py-3 border-b last:border-0">
                    <Badge variant="outline" className="text-[9px]">{source?.name}</Badge>
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <Badge variant="outline" className="text-[9px]">{target?.name}</Badge>
                    <Badge className={`text-[8px] ${edgeTypeConfig[edge.type].color}`}>{edgeTypeConfig[edge.type].label}</Badge>
                    <span className="text-[9px] text-muted-foreground mr-auto">{(edge as any).note || ""}</span>
                    <span className="text-[9px] font-mono">Strength: {edge.strength}%</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
