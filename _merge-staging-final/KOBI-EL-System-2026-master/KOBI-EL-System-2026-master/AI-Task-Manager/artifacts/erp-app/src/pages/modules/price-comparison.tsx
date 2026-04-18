import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Search, Scale, Star, Truck, Clock, Package, DollarSign, Award,
  TrendingUp, CheckCircle2, AlertTriangle, BarChart3, ArrowUpRight,
  ThumbsUp, Filter, Hash, ChevronDown, ChevronUp, ArrowLeft, X,
  Zap, Target, Shield
} from "lucide-react";

const API = "/api";

interface Supplier {
  id: number; supplierName: string; supplierNumber: string;
  rating: number | null; leadTimeDays: number | null;
  paymentTerms: string | null; onTimeDeliveryPct: string | null;
}

interface Material {
  id: number; materialNumber: string; materialName: string;
  unit: string; category: string; standardPrice: string | null;
}

interface PriceQuote {
  id: number; quoteNumber: string; supplierId: number;
  status: string; quoteDate: string | null; validityDate: string | null;
  totalAmount: string | null; totalBeforeTax: string | null;
  currency: string | null; paymentTerms: string | null;
  deliveryDays: number | null; isRecommended: boolean;
  comparisonGroup: string | null; notes: string | null;
  items?: PriceQuoteItem[];
}

interface PriceQuoteItem {
  id: number; quoteId: number; materialId: number | null;
  itemCode: string | null; itemDescription: string;
  quantity: string; unit: string; unitPrice: string;
  discountPercent: string | null; taxPercent: string | null;
  totalPrice: string; notes: string | null;
}

interface ComparisonRow {
  materialId: number | null;
  itemDescription: string;
  unit: string;
  entries: ComparisonEntry[];
  bestPrice: number;
  bestSupplierId: number | null;
}

interface ComparisonEntry {
  quoteId: number;
  supplierId: number;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  totalPrice: number;
  deliveryDays: number | null;
  paymentTerms: string | null;
  currency: string;
  supplierRating: number;
  onTimeDelivery: number | null;
  minimumOrder: string | null;
  isRecommended: boolean;
  quoteNumber: string;
  validityDate: string | null;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
      ))}
    </div>
  );
}

function ScoreBar({ value, max = 100, color = "bg-emerald-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full bg-input rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function PriceComparisonPage() {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [searchMaterial, setSearchMaterial] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"price" | "rating" | "delivery" | "score">("price");
  const qc = useQueryClient();

  const { data: quotesRaw = [] } = useQuery({
    queryKey: ["price-quotes-comparison"],
    queryFn: async () => {
      const r = await authFetch(`${API}/price-quotes`);
      return r.json();
    },
  });
  const quotes: PriceQuote[] = Array.isArray(quotesRaw) ? quotesRaw : (quotesRaw?.data || []);

  const { data: suppliersRaw = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || []);

  const { data: materialsRaw = [] } = useQuery({
    queryKey: ["materials-list"],
    queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return r.json(); },
  });
  const materials: Material[] = Array.isArray(materialsRaw) ? materialsRaw : (materialsRaw?.data || []);

  const { data: quoteItemsData = {} } = useQuery({
    queryKey: ["all-quote-items"],
    queryFn: async () => {
      const activeQuotes = quotes.filter(q => !["נדחתה", "פג תוקף"].includes(q.status));
      const results: Record<number, PriceQuoteItem[]> = {};
      await Promise.all(activeQuotes.map(async (q) => {
        const r = await authFetch(`${API}/price-quotes/${q.id}`);
        const data = await r.json();
        results[q.id] = data.items || [];
      }));
      return results;
    },
    enabled: quotes.length > 0,
  });

  const comparisonGroups = [...new Set(quotes.map(q => q.comparisonGroup).filter(Boolean))] as string[];

  const getSupplier = (id: number) => suppliers.find(s => s.id === id);
  const getMaterial = (id: number | null) => id ? materials.find(m => m.id === id) : null;

  const filteredMaterials = materials.filter(m =>
    !searchMaterial ||
    m.materialName.toLowerCase().includes(searchMaterial.toLowerCase()) ||
    m.materialNumber.toLowerCase().includes(searchMaterial.toLowerCase())
  );

  const comparisonData = useMemo((): ComparisonRow[] => {
    if (!selectedMaterialId && !selectedGroup) return [];
    const activeQuotes = quotes.filter(q => !["נדחתה", "פג תוקף"].includes(q.status));
    const itemsByGroup: Record<string, ComparisonEntry[]> = {};

    for (const quote of activeQuotes) {
      if (selectedGroup && quote.comparisonGroup !== selectedGroup) continue;
      const items = (quoteItemsData as Record<number, PriceQuoteItem[]>)[quote.id] || [];
      const supplier = getSupplier(quote.supplierId);

      for (const item of items) {
        if (selectedMaterialId && String(item.materialId) !== selectedMaterialId) continue;
        const key = item.materialId ? String(item.materialId) : item.itemDescription;

        if (!itemsByGroup[key]) itemsByGroup[key] = [];
        const unitPrice = parseFloat(item.unitPrice || "0");
        const qty = parseFloat(item.quantity || "1");
        const disc = parseFloat(item.discountPercent || "0");
        const effectivePrice = unitPrice * (1 - disc / 100);

        itemsByGroup[key].push({
          quoteId: quote.id,
          supplierId: quote.supplierId,
          unitPrice: effectivePrice,
          quantity: qty,
          discountPercent: disc,
          totalPrice: parseFloat(item.totalPrice || "0"),
          deliveryDays: quote.deliveryDays,
          paymentTerms: quote.paymentTerms || supplier?.paymentTerms || null,
          currency: quote.currency || "ILS",
          supplierRating: supplier?.rating || 0,
          onTimeDelivery: supplier?.onTimeDeliveryPct ? parseFloat(supplier.onTimeDeliveryPct) : null,
          minimumOrder: null,
          isRecommended: quote.isRecommended,
          quoteNumber: quote.quoteNumber,
          validityDate: quote.validityDate,
        });
      }
    }

    return Object.entries(itemsByGroup).map(([key, entries]) => {
      const prices = entries.map(e => e.unitPrice).filter(p => p > 0);
      const bestPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const bestEntry = entries.find(e => e.unitPrice === bestPrice);
      const materialId = selectedMaterialId ? parseInt(selectedMaterialId) : (entries[0]?.quoteId ? null : null);
      const mat = getMaterial(materialId);

      return {
        materialId,
        itemDescription: mat?.materialName || key,
        unit: mat?.unit || "יחידה",
        entries,
        bestPrice,
        bestSupplierId: bestEntry?.supplierId || null,
      };
    });
  }, [selectedMaterialId, selectedGroup, quotes, quoteItemsData, suppliers, materials]);

  function calcScore(entry: ComparisonEntry, bestPrice: number): number {
    const priceScore = bestPrice > 0 ? (bestPrice / Math.max(entry.unitPrice, 0.01)) * 40 : 0;
    const ratingScore = (entry.supplierRating / 5) * 30;
    const deliveryScore = entry.deliveryDays ? Math.max(0, (30 - Math.min(entry.deliveryDays, 30)) / 30) * 20 : 10;
    const onTimeScore = entry.onTimeDelivery ? (entry.onTimeDelivery / 100) * 10 : 5;
    return Math.round(priceScore + ratingScore + deliveryScore + onTimeScore);
  }

  function sortEntries(entries: ComparisonEntry[], bestPrice: number): ComparisonEntry[] {
    return [...entries].sort((a, b) => {
      switch (sortBy) {
        case "price": return a.unitPrice - b.unitPrice;
        case "rating": return b.supplierRating - a.supplierRating;
        case "delivery": return (a.deliveryDays || 999) - (b.deliveryDays || 999);
        case "score": return calcScore(b, bestPrice) - calcScore(a, bestPrice);
        default: return 0;
      }
    });
  }

  const recommendMut = useMutation({
    mutationFn: async ({ id, recommend }: { id: number; recommend: boolean }) => {
      const r = await authFetch(`${API}/price-quotes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRecommended: recommend }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-quotes-comparison"] });
      qc.invalidateQueries({ queryKey: ["all-quote-items"] });
    },
  });

  const totalQuotes = quotes.length;
  const activeQuotes = quotes.filter(q => !["נדחתה", "פג תוקף"].includes(q.status));
  const suppliersWithQuotes = new Set(quotes.map(q => q.supplierId)).size;

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
                <Scale className="w-6 h-6 text-foreground" />
              </div>
              השוואת מחירים
            </h1>
            <p className="text-muted-foreground mt-1">השוואת מחירים ספקים זה לצד זה — בחר פריט וראה את הצעות המחיר הטובות ביותר</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "סה״כ הצעות", value: totalQuotes, icon: Scale, color: "text-cyan-400", bg: "bg-cyan-500/10" },
            { label: "הצעות פעילות", value: activeQuotes.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "ספקים מציעים", value: suppliersWithQuotes, icon: Truck, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: "קבוצות השוואה", value: comparisonGroups.length, icon: BarChart3, color: "text-amber-400", bg: "bg-amber-500/10" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className="text-muted-foreground text-[11px]">{s.label}</p>
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-400" />
            בחר פריט להשוואה
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">חיפוש פריט</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={searchMaterial}
                  onChange={e => setSearchMaterial(e.target.value)}
                  placeholder="חפש פריט, חומר גלם..."
                  className="w-full pr-9 pl-4 py-2.5 bg-input border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-cyan-500 focus:outline-none text-sm"
                />
              </div>
              {searchMaterial && filteredMaterials.length > 0 && (
                <div className="absolute z-20 bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto mt-1 w-64">
                  {filteredMaterials.slice(0, 10).map(m => (
                    <button key={m.id} onClick={() => { setSelectedMaterialId(String(m.id)); setSearchMaterial(m.materialName); setSelectedGroup(""); }}
                      className="w-full px-4 py-2 text-right text-sm text-foreground hover:bg-muted border-b border-border/50">
                      <span className="text-cyan-400 font-mono text-xs">{m.materialNumber}</span>
                      <span className="block">{m.materialName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">בחר פריט מהרשימה</label>
              <select
                value={selectedMaterialId}
                onChange={e => { setSelectedMaterialId(e.target.value); setSelectedGroup(""); setSearchMaterial(""); }}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-foreground focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">-- בחר פריט --</option>
                {materials.map(m => (
                  <option key={m.id} value={String(m.id)}>{m.materialName} ({m.materialNumber})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">או בחר קבוצת השוואה</label>
              <select
                value={selectedGroup}
                onChange={e => { setSelectedGroup(e.target.value); setSelectedMaterialId(""); setSearchMaterial(""); }}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-foreground focus:border-cyan-500 focus:outline-none text-sm"
              >
                <option value="">-- בחר קבוצה --</option>
                {comparisonGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">מיין לפי:</span>
            {[
              { key: "price", label: "מחיר", icon: DollarSign },
              { key: "rating", label: "דירוג ספק", icon: Star },
              { key: "delivery", label: "זמן אספקה", icon: Clock },
              { key: "score", label: "ציון כולל", icon: Target },
            ].map(s => (
              <button key={s.key} onClick={() => setSortBy(s.key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortBy === s.key ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-input text-muted-foreground hover:text-foreground"}`}>
                <s.icon className="w-3.5 h-3.5" />{s.label}
              </button>
            ))}
          </div>
        </div>

        {!selectedMaterialId && !selectedGroup ? (
          <div className="text-center py-20">
            <Scale className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-xl text-muted-foreground">בחר פריט או קבוצת השוואה</h3>
            <p className="text-muted-foreground text-sm mt-2">בחר פריט מחומרי הגלם כדי לראות השוואת מחירים מכל הספקים</p>
          </div>
        ) : comparisonData.length === 0 ? (
          <div className="text-center py-20">
            <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl text-muted-foreground">אין הצעות מחיר לפריט זה</h3>
            <p className="text-muted-foreground text-sm mt-2">לא נמצאו הצעות מחיר פעילות עבור הפריט הנבחר</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comparisonData.map((row, rowIdx) => {
              const sortedEntries = sortEntries(row.entries, row.bestPrice);
              const isExpanded = expandedRow === `${rowIdx}`;
              const bestEntry = sortedEntries[0];

              return (
                <div key={rowIdx} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div
                    className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => setExpandedRow(isExpanded ? null : `${rowIdx}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                        <Package className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="text-foreground font-semibold">{row.itemDescription}</h3>
                        <p className="text-muted-foreground text-xs mt-0.5">{row.entries.length} ספקים הגישו הצעה</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">מחיר הטוב ביותר</p>
                        <p className="text-emerald-400 font-bold text-lg">₪{row.bestPrice.toFixed(2)}</p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">הספק המומלץ</p>
                        <p className="text-foreground text-sm font-medium">
                          {getSupplier(row.bestSupplierId || 0)?.supplierName || "—"}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border overflow-hidden">
                        <div className="p-5">
                          <div className="overflow-x-auto">
                            <table className="w-full text-right min-w-[900px]">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">דירוג</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">ספק</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">מחיר יחידה</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">הנחה</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">זמן אספקה</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">תנאי תשלום</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">דירוג ספק</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">אספקה בזמן</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">ציון</th>
                                  <th className="pb-3 text-muted-foreground font-medium text-xs px-3">פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedEntries.map((entry, idx) => {
                                  const supplier = getSupplier(entry.supplierId);
                                  const isBest = entry.unitPrice === row.bestPrice;
                                  const score = calcScore(entry, row.bestPrice);
                                  const priceDiff = row.bestPrice > 0 ? ((entry.unitPrice - row.bestPrice) / row.bestPrice) * 100 : 0;

                                  return (
                                    <tr key={entry.quoteId}
                                      className={`border-b border-border/50 transition-colors ${isBest ? "bg-emerald-500/5" : entry.isRecommended ? "bg-amber-500/5" : "hover:bg-muted"}`}>
                                      <td className="px-3 py-3">
                                        <div className="flex items-center gap-1.5">
                                          {idx === 0 && <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><span className="text-emerald-400 text-xs font-bold">1</span></div>}
                                          {idx === 1 && <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center"><span className="text-amber-400 text-xs font-bold">2</span></div>}
                                          {idx === 2 && <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center"><span className="text-blue-400 text-xs font-bold">3</span></div>}
                                          {idx > 2 && <div className="w-6 h-6 rounded-full bg-muted/10 flex items-center justify-center"><span className="text-muted-foreground text-xs font-bold">{idx + 1}</span></div>}
                                        </div>
                                      </td>
                                      <td className="px-3 py-3">
                                        <div>
                                          <p className="text-foreground font-medium text-sm">{supplier?.supplierName || `ספק ${entry.supplierId}`}</p>
                                          <p className="text-muted-foreground text-xs font-mono">{entry.quoteNumber}</p>
                                          {entry.isRecommended && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 mt-0.5">
                                              <ThumbsUp className="w-2.5 h-2.5" />מומלץ
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-3">
                                        <div>
                                          <p className={`font-bold text-sm ${isBest ? "text-emerald-400" : "text-foreground"}`}>
                                            ₪{entry.unitPrice.toFixed(2)}
                                          </p>
                                          {!isBest && priceDiff > 0 && (
                                            <p className="text-red-400 text-xs">+{priceDiff.toFixed(1)}%</p>
                                          )}
                                          {isBest && (
                                            <p className="text-emerald-400 text-xs flex items-center gap-0.5">
                                              <Award className="w-2.5 h-2.5" />הזול ביותר
                                            </p>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-3">
                                        <span className={`text-sm ${entry.discountPercent > 0 ? "text-emerald-400 font-medium" : "text-muted-foreground"}`}>
                                          {entry.discountPercent > 0 ? `${entry.discountPercent}%` : "—"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3 h-3 text-muted-foreground" />
                                          <span className={`text-sm ${entry.deliveryDays && entry.deliveryDays <= 7 ? "text-emerald-400" : entry.deliveryDays && entry.deliveryDays <= 14 ? "text-amber-400" : "text-foreground"}`}>
                                            {entry.deliveryDays ? `${entry.deliveryDays} ימים` : "—"}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-3 text-gray-300 text-sm">{entry.paymentTerms || "—"}</td>
                                      <td className="px-3 py-3">
                                        <StarRating rating={entry.supplierRating} />
                                      </td>
                                      <td className="px-3 py-3">
                                        {entry.onTimeDelivery !== null ? (
                                          <div className="space-y-1">
                                            <p className={`text-sm font-medium ${entry.onTimeDelivery >= 90 ? "text-emerald-400" : entry.onTimeDelivery >= 70 ? "text-amber-400" : "text-red-400"}`}>
                                              {entry.onTimeDelivery.toFixed(0)}%
                                            </p>
                                            <ScoreBar value={entry.onTimeDelivery} color={entry.onTimeDelivery >= 90 ? "bg-emerald-500" : entry.onTimeDelivery >= 70 ? "bg-amber-500" : "bg-red-500"} />
                                          </div>
                                        ) : <span className="text-muted-foreground text-sm">—</span>}
                                      </td>
                                      <td className="px-3 py-3">
                                        <div className="space-y-1">
                                          <p className={`text-sm font-bold ${score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-foreground"}`}>
                                            {score}/100
                                          </p>
                                          <ScoreBar value={score} color={score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-blue-500"} />
                                        </div>
                                      </td>
                                      <td className="px-3 py-3">
                                        <button
                                          onClick={() => recommendMut.mutate({ id: entry.quoteId, recommend: !entry.isRecommended })}
                                          className={`p-1.5 rounded-lg transition-colors ${entry.isRecommended ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20" : "text-muted-foreground hover:text-emerald-400"}`}
                                          title={entry.isRecommended ? "בטל המלצה" : "סמן כמומלץ"}>
                                          <ThumbsUp className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {sortedEntries.length > 0 && (
                            <div className="mt-5 p-4 bg-input rounded-xl border border-border">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-amber-400" />
                                המלצה אוטומטית
                              </h4>
                              <div className="flex items-start gap-4 flex-wrap">
                                <div className="flex-1 min-w-[200px]">
                                  {(() => {
                                    const topEntry = sortBy === "score"
                                      ? sortedEntries[0]
                                      : [...sortedEntries].sort((a, b) => calcScore(b, row.bestPrice) - calcScore(a, row.bestPrice))[0];
                                    const supplier = getSupplier(topEntry.supplierId);
                                    return (
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                          <Shield className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div>
                                          <p className="text-foreground font-medium">{supplier?.supplierName}</p>
                                          <p className="text-muted-foreground text-xs">
                                            מחיר: ₪{topEntry.unitPrice.toFixed(2)} · ציון: {calcScore(topEntry, row.bestPrice)}/100
                                          </p>
                                          <p className="text-emerald-400 text-xs mt-0.5">
                                            {topEntry.unitPrice === row.bestPrice ? "המחיר הזול ביותר" : `${((topEntry.unitPrice - row.bestPrice) / row.bestPrice * 100).toFixed(1)}% מעל המחיר הזול`}
                                            {topEntry.supplierRating >= 4 ? " · דירוג מצוין" : ""}
                                            {topEntry.deliveryDays && topEntry.deliveryDays <= 7 ? " · אספקה מהירה" : ""}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="grid grid-cols-3 gap-3 flex-1 min-w-[300px]">
                                  <div className="text-center bg-card rounded-xl p-3">
                                    <p className="text-emerald-400 text-lg font-bold">₪{row.bestPrice.toFixed(2)}</p>
                                    <p className="text-muted-foreground text-xs">מחיר מינימום</p>
                                  </div>
                                  <div className="text-center bg-card rounded-xl p-3">
                                    <p className="text-foreground text-lg font-bold">{row.entries.length}</p>
                                    <p className="text-muted-foreground text-xs">ספקים</p>
                                  </div>
                                  <div className="text-center bg-card rounded-xl p-3">
                                    <p className="text-amber-400 text-lg font-bold">
                                      {row.entries.length > 1
                                        ? `${(((Math.max(...row.entries.map(e => e.unitPrice)) - row.bestPrice) / row.bestPrice) * 100).toFixed(0)}%`
                                        : "—"}
                                    </p>
                                    <p className="text-muted-foreground text-xs">פער מחירים</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
