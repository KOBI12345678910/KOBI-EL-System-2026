import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Globe, Users, TrendingDown, RefreshCw, Search, ChevronRight, ChevronLeft, Activity, Package, Bell, FileText } from "lucide-react";

const API = "/api";

interface RiskSupplier {
  id: number;
  supplierName: string;
  supplierNumber: string;
  category: string;
  country: string | null;
  city: string | null;
  riskScore: number;
  riskLevel: "גבוה" | "בינוני" | "נמוך";
  risks: string[];
  annualSpend: string | null;
  blacklisted: boolean;
  rating: number | null;
}

interface RiskSummary {
  totalSuppliers: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  singleSourceMaterialCount: number;
  highConcentrationCountries: { country: string; count: number }[];
  highDependencySupplierCount: number;
  contractExpiringCount: number;
}

interface ContractAlert {
  id: number;
  contract_number: string;
  title: string;
  supplier_id: number;
  supplier_name: string;
  end_date: string;
  days_until_expiry: number;
  alert_level: string;
  contract_value: string;
  currency: string;
}

const RISK_COLORS: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-300 border-red-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "נמוך": "bg-green-500/20 text-green-300 border-green-500/30",
};

const ALERT_COLORS: Record<string, string> = {
  "פג תוקף": "bg-red-500/20 text-red-300 border-red-500/30",
  "קריטי": "bg-red-500/20 text-red-400 border-red-500/30",
  "אזהרה": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "שים לב": "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? "bg-red-500" : score >= 30 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 ${score >= 60 ? "text-red-400" : score >= 30 ? "text-yellow-400" : "text-green-400"}`}>{score}</span>
    </div>
  );
}

export default function SupplyChainRisk() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "suppliers" | "contracts" | "geographic">("overview");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data: riskData, isLoading, refetch } = useQuery({
    queryKey: ["supplier-risk-monitoring"],
    queryFn: async () => {
      const r = await authFetch(`${API}/supplier-risk-monitoring`);
      return r.json();
    },
  });

  const { data: contractAlerts } = useQuery({
    queryKey: ["supplier-contract-alerts"],
    queryFn: async () => {
      const r = await authFetch(`${API}/supplier-contract-alerts`);
      return r.json();
    },
  });

  const suppliers: RiskSupplier[] = riskData?.suppliers || [];
  const summary: RiskSummary = riskData?.summary || { totalSuppliers: 0, highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0, singleSourceMaterialCount: 0, highConcentrationCountries: [], highDependencySupplierCount: 0, contractExpiringCount: 0 };
  const geoDistribution: { country: string; count: number }[] = riskData?.geographicDistribution || [];
  const alerts: ContractAlert[] = Array.isArray(contractAlerts) ? contractAlerts : [];

  const filtered = useMemo(() => {
    return suppliers.filter(s => {
      if (riskFilter !== "all" && s.riskLevel !== riskFilter) return false;
      if (search && !s.supplierName.includes(search) && !s.supplierNumber.includes(search) && !(s.country || "").includes(search)) return false;
      return true;
    });
  }, [suppliers, search, riskFilter]);

  const pageData = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const topGeo = useMemo(() => {
    return [...geoDistribution].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [geoDistribution]);

  const maxGeoCount = topGeo[0]?.count || 1;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">מנתח סיכוני שרשרת אספקה...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניטור סיכוני שרשרת אספקה</h1>
          <p className="text-sm text-muted-foreground mt-1">Supply Chain Risk Monitoring • {summary.totalSuppliers} ספקים פעילים</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 ml-1" />רענן ניתוח
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "סיכון גבוה", value: summary.highRiskCount, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { label: "סיכון בינוני", value: summary.mediumRiskCount, icon: Activity, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
          { label: "סיכון נמוך", value: summary.lowRiskCount, icon: Shield, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
          { label: "ספק יחיד", value: summary.singleSourceMaterialCount, icon: Package, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { label: "ריכוז גיאוגרפי", value: summary.highConcentrationCountries?.length || 0, icon: Globe, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
          { label: "תלות גבוהה", value: summary.highDependencySupplierCount, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "חוזים בסיכון", value: summary.contractExpiringCount, icon: Bell, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
          { label: "סה\"כ ספקים", value: summary.totalSuppliers, icon: TrendingDown, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
        ].map((k, i) => (
          <div key={i} className={`${k.bg} border rounded-xl p-3 text-center`}>
            <k.icon className={`${k.color} mx-auto mb-1`} size={20} />
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {(summary.highRiskCount > 0 || summary.singleSourceMaterialCount > 0) && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400 font-semibold mb-3">
              <AlertTriangle className="w-5 h-5" />
              התראות פעילות
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {summary.highRiskCount > 0 && (
                <div className="bg-background/60 rounded-lg p-3 border border-red-500/20">
                  <div className="text-sm font-medium text-red-300">{summary.highRiskCount} ספקים בסיכון גבוה</div>
                  <div className="text-xs text-muted-foreground mt-1">דורשים בחינה מיידית</div>
                </div>
              )}
              {summary.singleSourceMaterialCount > 0 && (
                <div className="bg-background/60 rounded-lg p-3 border border-orange-500/20">
                  <div className="text-sm font-medium text-orange-300">{summary.singleSourceMaterialCount} חומרים מספק יחיד</div>
                  <div className="text-xs text-muted-foreground mt-1">סיכון להפסקת אספקה</div>
                </div>
              )}
              {summary.contractExpiringCount > 0 && (
                <div className="bg-background/60 rounded-lg p-3 border border-amber-500/20">
                  <div className="text-sm font-medium text-amber-300">{summary.contractExpiringCount} חוזים פגים ב-90 יום</div>
                  <div className="text-xs text-muted-foreground mt-1">יש לחדש או לנהל מחדש</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border/50 w-fit">
        {(["overview", "suppliers", "contracts", "geographic"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? "bg-red-600 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
            {tab === "overview" ? "סקירה" : tab === "suppliers" ? "ספקים" : tab === "contracts" ? "חוזים" : "גיאוגרפיה"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground"><AlertTriangle className="text-red-400" size={20} />ספקים בסיכון גבוה</h3>
              {suppliers.filter(s => s.riskLevel === "גבוה").slice(0, 8).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-2 text-green-400" />
                  <p className="font-medium text-green-400">אין ספקים בסיכון גבוה</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suppliers.filter(s => s.riskLevel === "גבוה").slice(0, 8).map(s => (
                    <div key={s.id} className="bg-background/50 rounded-lg p-3 border border-red-500/20">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-medium text-foreground text-sm">{s.supplierName}</div>
                          <div className="text-xs text-muted-foreground">{s.category} • {s.country || "לא ידוע"}</div>
                        </div>
                        <RiskBar score={s.riskScore} />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.risks.map((r, i) => (
                          <span key={i} className="text-[10px] bg-red-500/10 text-red-300 border border-red-500/20 px-1.5 py-0.5 rounded">{r}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground"><FileText className="text-amber-400" size={20} />חוזים פגים בקרוב</h3>
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-2 text-green-400" />
                  <p className="font-medium text-green-400">אין חוזים פגים ב-90 הימים הקרובים</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 8).map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-background/50 rounded-lg p-3 border border-amber-500/20">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground text-sm truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.supplier_name} • {a.end_date}</div>
                      </div>
                      <Badge className={`${ALERT_COLORS[a.alert_level] || "bg-gray-500/20 text-gray-300"} border text-xs shrink-0 mr-2`}>
                        {a.days_until_expiry < 0 ? "פג" : `${a.days_until_expiry}י'`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "suppliers" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חיפוש ספק..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
              </div>
              <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="all">כל הסיכונים</option>
                <option value="גבוה">גבוה</option>
                <option value="בינוני">בינוני</option>
                <option value="נמוך">נמוך</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מדינה</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">ציון סיכון</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">גורמי סיכון</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">רמת סיכון</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(s => (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <div className="font-medium text-foreground">{s.supplierName}</div>
                        <div className="text-xs text-muted-foreground">{s.supplierNumber} • {s.category}</div>
                      </td>
                      <td className="p-3 text-muted-foreground">{s.country || "—"}</td>
                      <td className="p-3 min-w-[120px]"><RiskBar score={s.riskScore} /></td>
                      <td className="p-3 max-w-[250px]">
                        <div className="flex flex-wrap gap-1">
                          {s.risks.slice(0, 3).map((r, i) => (
                            <span key={i} className="text-[10px] bg-red-500/10 text-red-300 border border-red-500/20 px-1.5 py-0.5 rounded">{r}</span>
                          ))}
                          {s.risks.length > 3 && <span className="text-[10px] text-muted-foreground">+{s.risks.length - 3}</span>}
                          {s.risks.length === 0 && <span className="text-xs text-green-400">אין סיכונים</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={`${RISK_COLORS[s.riskLevel]} border text-xs`}>{s.riskLevel}</Badge>
                      </td>
                    </tr>
                  ))}
                  {pageData.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">אין ספקים המתאימים לסינון</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>מציג {Math.min(filtered.length, (page-1)*perPage+1)}-{Math.min(filtered.length, page*perPage)} מתוך {filtered.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
                <span className="px-3 py-1">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "contracts" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <h3 className="text-lg font-bold mb-4 text-foreground">חוזים פגים ב-90 הימים הקרובים ({alerts.length})</h3>
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="text-green-400 font-medium">אין חוזים הדורשים חידוש בקרוב</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מספר חוזה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">כותרת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">תאריך סיום</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">ימים שנותרו</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שווי</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">רמת התראה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(a => (
                      <tr key={a.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-blue-400 text-xs">{a.contract_number}</td>
                        <td className="p-3 text-foreground font-medium max-w-[200px] truncate">{a.title}</td>
                        <td className="p-3 text-muted-foreground">{a.supplier_name}</td>
                        <td className="p-3 text-center text-muted-foreground">{a.end_date}</td>
                        <td className="p-3 text-center">
                          <span className={`font-bold ${a.days_until_expiry < 0 ? "text-red-400" : a.days_until_expiry <= 30 ? "text-red-400" : a.days_until_expiry <= 60 ? "text-yellow-400" : "text-blue-400"}`}>
                            {a.days_until_expiry < 0 ? `פג לפני ${Math.abs(a.days_until_expiry)} ימים` : `${a.days_until_expiry} ימים`}
                          </span>
                        </td>
                        <td className="p-3 text-blue-400">₪{Number(a.contract_value || 0).toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <Badge className={`${ALERT_COLORS[a.alert_level] || "bg-gray-500/20 text-gray-300"} border text-xs`}>{a.alert_level}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "geographic" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground"><Globe className="text-purple-400" size={20} />פיזור גיאוגרפי</h3>
              <div className="space-y-3">
                {topGeo.map(({ country, count }) => {
                  const pct = (count / maxGeoCount) * 100;
                  const isHighConc = summary.highConcentrationCountries?.some(c => c.country === country);
                  return (
                    <div key={country} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`font-medium ${isHighConc ? "text-red-300" : "text-foreground"}`}>
                          {country} {isHighConc && "⚠️"}
                        </span>
                        <span className="text-muted-foreground">{count} ספקים</span>
                      </div>
                      <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isHighConc ? "bg-red-500" : "bg-purple-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {topGeo.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">אין נתוני מיקום ספקים</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground"><AlertTriangle className="text-orange-400" size={20} />המלצות להפחתת סיכון</h3>
              <div className="space-y-3">
                {summary.singleSourceMaterialCount > 0 && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                    <div className="text-sm font-medium text-orange-300 mb-1">ספקים יחידים</div>
                    <div className="text-xs text-muted-foreground">
                      יש {summary.singleSourceMaterialCount} חומרים עם ספק יחיד. מומלץ לאתר ספקים חלופיים ולגוון את מקורות האספקה.
                    </div>
                  </div>
                )}
                {summary.highConcentrationCountries?.length > 0 && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <div className="text-sm font-medium text-purple-300 mb-1">ריכוז גיאוגרפי</div>
                    <div className="text-xs text-muted-foreground">
                      ריכוז גבוה של ספקים ב: {summary.highConcentrationCountries.map(c => c.country).join(", ")}. שקול לגוון את בסיס הספקים גיאוגרפית.
                    </div>
                  </div>
                )}
                {summary.contractExpiringCount > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <div className="text-sm font-medium text-amber-300 mb-1">חידוש חוזים</div>
                    <div className="text-xs text-muted-foreground">
                      {summary.contractExpiringCount} חוזים פגים ב-90 הימים הקרובים. יש לפעול מיידית לחידוש או לחידוש תנאים.
                    </div>
                  </div>
                )}
                {summary.highDependencySupplierCount > 0 && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <div className="text-sm font-medium text-blue-300 mb-1">תלות בספקים</div>
                    <div className="text-xs text-muted-foreground">
                      {summary.highDependencySupplierCount} ספקים מהווים למעלה מ-30% מהרכש. מומלץ להגביל תלות לא יותר מ-20% לספק.
                    </div>
                  </div>
                )}
                {summary.highRiskCount === 0 && summary.singleSourceMaterialCount === 0 && summary.highConcentrationCountries?.length === 0 && (
                  <div className="text-center py-8">
                    <Shield className="w-10 h-10 mx-auto mb-2 text-green-400" />
                    <p className="text-green-400 font-medium">מצב שרשרת האספקה תקין</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
