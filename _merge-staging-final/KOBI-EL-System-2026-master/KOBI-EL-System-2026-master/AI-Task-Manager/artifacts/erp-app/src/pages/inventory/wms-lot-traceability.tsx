import { useState, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, AlertCircle, X, Loader2, ArrowRight, ArrowLeft, Package, Truck, Users, MapPin, Clock, ChevronDown, ChevronUp } from "lucide-react";

type TraceDirection = "forward" | "backward";

export default function WmsLotTraceabilityPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [traceDirection, setTraceDirection] = useState<TraceDirection>("backward");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedEvents, setExpandedEvents] = useState(false);

  const search = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    setTraceResult(null);
    try {
      const res = await authFetch(`/api/wms/lot-trace/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("שגיאה בחיפוש");
      const j = await res.json();
      setSearchResults(j.data || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [searchQuery]);

  const trace = useCallback(async (lotNumber: string, direction: TraceDirection) => {
    setLoading(true);
    setError("");
    setTraceDirection(direction);
    setExpandedEvents(false);
    try {
      const endpoint = direction === "forward"
        ? `/api/wms/lot-trace/forward/${encodeURIComponent(lotNumber)}`
        : `/api/wms/lot-trace/backward/${encodeURIComponent(lotNumber)}`;
      const res = await authFetch(endpoint);
      if (!res.ok) throw new Error("שגיאה בעקיבה");
      const j = await res.json();
      setTraceResult({ ...j.data, lot_number: lotNumber, direction });
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  const EVENT_ICONS: Record<string, any> = {
    receipt: Truck,
    production: Package,
    transfer: ArrowRight,
    shipment: Truck,
    sale: Users,
    delivery: Truck,
  };

  const EVENT_COLORS: Record<string, string> = {
    receipt: "bg-green-500/20 text-green-300",
    production: "bg-blue-500/20 text-blue-300",
    transfer: "bg-yellow-500/20 text-yellow-300",
    shipment: "bg-orange-500/20 text-orange-300",
    sale: "bg-purple-500/20 text-purple-300",
    delivery: "bg-cyan-500/20 text-cyan-300",
  };

  const EVENT_LABELS: Record<string, string> = {
    receipt: "קבלה מספק",
    production: "ייצור",
    transfer: "העברה",
    shipment: "משלוח",
    sale: "מכירה",
    delivery: "אספקה",
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Search className="h-6 w-6 text-violet-400" />
            עקיבות לוטים — Lot Traceability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב קדימה ואחורה: מאיזה ספק הגיע הלוט ולאיזה לקוח יצא</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span>
          <button onClick={() => setError("")} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card className="bg-card/80 border-border">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                placeholder="חיפוש לפי מספר לוט, מנה או קוד פריט..."
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <Button onClick={search} disabled={loading || !searchQuery.trim()} className="bg-violet-600 hover:bg-violet-700 gap-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              חפש
            </Button>
          </div>
        </CardContent>
      </Card>

      {searchResults.length > 0 && !traceResult && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-0">
            <div className="p-3 border-b border-border">
              <p className="text-sm text-muted-foreground">{searchResults.length} תוצאות</p>
            </div>
            <div className="divide-y divide-[#2a2a3e]">
              {searchResults.map((r, i) => (
                <div key={i} className="p-4 hover:bg-muted/30 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-blue-400">{r.lot_number || r.batch_number}</span>
                      {r.expiry_date && <Badge className="border-0 text-[10px] bg-orange-500/20 text-orange-300">תפוגה: {new Date(r.expiry_date).toLocaleDateString("he-IL")}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Package className="h-3 w-3" />{r.item_code} — {r.item_name}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.event_count} אירועים</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-violet-500/30 text-violet-300 gap-1" onClick={() => trace(r.lot_number || r.batch_number, "backward")}>
                      <ArrowRight className="h-3.5 w-3.5" />עקיבה אחורה
                    </Button>
                    <Button size="sm" variant="outline" className="border-cyan-500/30 text-cyan-300 gap-1" onClick={() => trace(r.lot_number || r.batch_number, "forward")}>
                      עקיבה קדימה<ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {traceResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setTraceResult(null)} className="text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              {traceDirection === "backward" ? (
                <><ArrowRight className="h-5 w-5 text-violet-400" />עקיבה אחורה: לוט {traceResult.lot_number}</>
              ) : (
                <><ArrowLeft className="h-5 w-5 text-cyan-400" />עקיבה קדימה: לוט {traceResult.lot_number}</>
              )}
            </h2>
            <div className="flex gap-2 mr-auto">
              <Button size="sm" variant="outline" className="border-violet-500/30 text-violet-300 gap-1" onClick={() => trace(traceResult.lot_number, "backward")}>
                <ArrowRight className="h-3.5 w-3.5" />עקיבה אחורה
              </Button>
              <Button size="sm" variant="outline" className="border-cyan-500/30 text-cyan-300 gap-1" onClick={() => trace(traceResult.lot_number, "forward")}>
                עקיבה קדימה<ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {traceDirection === "backward" ? (
              <>
                <Card className="bg-card/80 border-border"><CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">ספקים</p>
                  <p className="text-xl font-bold text-violet-400">{traceResult.suppliers?.length || 0}</p>
                </CardContent></Card>
                <Card className="bg-card/80 border-border"><CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">הזמנות רכש</p>
                  <p className="text-xl font-bold text-blue-400">{traceResult.source_pos?.length || 0}</p>
                </CardContent></Card>
                <Card className="bg-card/80 border-border"><CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">פריט</p>
                  <p className="text-sm font-bold text-foreground truncate">{traceResult.item_info?.item_code || "לא ידוע"}</p>
                </CardContent></Card>
              </>
            ) : (
              <>
                <Card className="bg-card/80 border-border"><CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">לקוחות שקיבלו</p>
                  <p className="text-xl font-bold text-cyan-400">{traceResult.customers_affected?.length || 0}</p>
                </CardContent></Card>
                <Card className="bg-card/80 border-border"><CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">כמות שסופקה</p>
                  <p className="text-xl font-bold text-emerald-400">{traceResult.total_quantity_distributed || 0}</p>
                </CardContent></Card>
                <Card className="bg-card/80 border-border"><CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground">מחסנים</p>
                  <p className="text-sm font-bold text-foreground">{traceResult.warehouses?.join(", ") || "-"}</p>
                </CardContent></Card>
              </>
            )}
            <Card className="bg-card/80 border-border"><CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground">אירועים</p>
              <p className="text-xl font-bold text-orange-400">{traceResult.events?.length || 0}</p>
            </CardContent></Card>
          </div>

          {traceDirection === "backward" && traceResult.suppliers?.length > 0 && (
            <Card className="bg-card/80 border-border">
              <CardContent className="p-0">
                <div className="p-3 border-b border-border">
                  <p className="text-sm font-semibold text-violet-400 flex items-center gap-2"><Truck className="h-4 w-4" />מקורות — ספקים</p>
                </div>
                <div className="divide-y divide-[#2a2a3e]">
                  {traceResult.suppliers.map((s: any, i: number) => (
                    <div key={i} className="p-3 flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <Truck className="h-4 w-4 text-violet-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{s.supplier_name || `ספק #${s.supplier_id}`}</p>
                        <p className="text-xs text-muted-foreground">
                          הזמנת רכש: {s.purchase_order_id || "-"} | אסמכתא: {s.reference || "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-foreground">{s.quantity} יח'</p>
                        <p className="text-xs text-muted-foreground">{s.event_date ? new Date(s.event_date).toLocaleDateString("he-IL") : "-"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {traceDirection === "forward" && traceResult.customers_affected?.length > 0 && (
            <Card className="bg-card/80 border-border">
              <CardContent className="p-0">
                <div className="p-3 border-b border-border">
                  <p className="text-sm font-semibold text-cyan-400 flex items-center gap-2"><Users className="h-4 w-4" />יעד — לקוחות שקיבלו</p>
                </div>
                <div className="divide-y divide-[#2a2a3e]">
                  {traceResult.customers_affected.map((c: any, i: number) => (
                    <div key={i} className="p-3 flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <Users className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{c.customer_name || `לקוח #${c.customer_id}`}</p>
                        <p className="text-xs text-muted-foreground">אסמכתא: {c.reference || "-"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-foreground">{c.quantity} יח'</p>
                        <p className="text-xs text-muted-foreground">{c.event_date ? new Date(c.event_date).toLocaleDateString("he-IL") : "-"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {traceResult.events?.length > 0 && (
            <Card className="bg-card/80 border-border">
              <CardContent className="p-0">
                <button className="w-full p-3 border-b border-border flex items-center justify-between" onClick={() => setExpandedEvents(!expandedEvents)}>
                  <p className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Clock className="h-4 w-4" />ציר זמן אירועים ({traceResult.events.length})
                  </p>
                  {expandedEvents ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {expandedEvents && (
                  <div className="divide-y divide-[#2a2a3e]/50 max-h-64 overflow-y-auto">
                    {traceResult.events.map((ev: any, i: number) => {
                      const Icon = EVENT_ICONS[ev.event_type] || Package;
                      return (
                        <div key={i} className="p-3 flex items-center gap-3">
                          <div className={`flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${EVENT_COLORS[ev.event_type] || "bg-gray-500/20 text-gray-300"}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge className={`border-0 text-[10px] ${EVENT_COLORS[ev.event_type] || "bg-gray-500/20 text-gray-300"}`}>
                                {EVENT_LABELS[ev.event_type] || ev.event_type}
                              </Badge>
                              {ev.location_code && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location_code}</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ev.source_reference || ev.destination_reference || ev.notes || "-"}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-mono text-foreground">{parseFloat(ev.quantity || 0)} יח'</p>
                            <p className="text-[10px] text-muted-foreground">{ev.event_date ? new Date(ev.event_date).toLocaleString("he-IL") : "-"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {traceResult.events?.length === 0 && (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">לא נמצאו אירועים עבור לוט זה</p>
              <p className="text-xs text-muted-foreground/60 mt-1">הוסף אירועים לטבלת lot_traceability</p>
            </div>
          )}
        </div>
      )}

      {searchResults.length === 0 && !traceResult && !loading && (
        <div className="text-center py-16">
          <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">חפש מספר לוט, מנה או קוד פריט</p>
          <p className="text-sm text-muted-foreground/60 mt-1">לאחר מכן בחר עקיבה קדימה (ללקוחות) או אחורה (לספקים)</p>
        </div>
      )}
    </div>
  );
}
