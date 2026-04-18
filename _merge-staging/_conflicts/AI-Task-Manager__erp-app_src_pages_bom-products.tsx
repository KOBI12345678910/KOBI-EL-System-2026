import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import ImportButton from "@/components/import-button";
import {
  Package, Layers, Calculator, TrendingUp, TrendingDown, Plus,
  Edit, Search, BarChart3, ArrowLeftRight, Ruler, Percent,
  ChevronDown, ChevronUp, RefreshCw, DollarSign, Factory, Copy, Trash2,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

const API = "/api/bom-products";
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const CATEGORY_COLORS: Record<string, string> = {
  pergola: "bg-green-500/20 text-green-400 border-green-500/30",
  fence: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  gate: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  railing: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  carport: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  custom: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

interface Product {
  id: number;
  name: string;
  name_he: string;
  sku: string;
  category: string;
  description: string;
  cost_per_sqm: number;
  suggested_price_per_sqm: number;
  margin_pct: number;
  min_width: number;
  max_width: number;
  min_height: number;
  max_height: number;
  is_active: boolean;
  image_url: string | null;
}

interface BOMItem {
  id: number;
  product_id: number;
  material_name: string;
  material_category: string;
  quantity_per_sqm: number;
  unit: string;
  unit_cost: number;
  total_cost_per_sqm: number;
  waste_factor_pct: number;
}

interface CostBreakdown {
  materials: number;
  labor: number;
  painting: number;
  transport: number;
  overhead: number;
  total: number;
}

interface QuoteResult {
  product_name: string;
  width: number;
  height: number;
  area_sqm: number;
  cost_breakdown: CostBreakdown;
  total_cost: number;
  suggested_price: number;
  margin_pct: number;
}

interface SensitivityResult {
  material: string;
  change_pct: number;
  original_cost: number;
  new_cost: number;
  cost_impact: number;
  new_margin_pct: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(url, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(amount);
}

export default function BOMProductsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("products");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [bomOpen, setBomOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");

  // Quote calculator state
  const [quoteProductId, setQuoteProductId] = useState("");
  const [quoteWidth, setQuoteWidth] = useState("");
  const [quoteHeight, setQuoteHeight] = useState("");

  // Sensitivity state
  const [sensitivityProductId, setSensitivityProductId] = useState("");
  const [sensitivityMaterial, setSensitivityMaterial] = useState("");
  const [sensitivityChangePct, setSensitivityChangePct] = useState("10");

  // Comparison state
  const [compareIds, setCompareIds] = useState<number[]>([]);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["bom-products", filterCategory],
    queryFn: () => {
      const params = filterCategory !== "all" ? `?category=${filterCategory}` : "";
      return apiFetch(`${API}/products${params}`);
    },
  });

  const { data: bomItems = [] } = useQuery<BOMItem[]>({
    queryKey: ["bom-items", selectedProduct?.id],
    queryFn: () => apiFetch(`${API}/products/${selectedProduct!.id}/bom`),
    enabled: !!selectedProduct,
  });

  const { data: costBreakdown } = useQuery<CostBreakdown>({
    queryKey: ["bom-cost-breakdown", selectedProduct?.id],
    queryFn: () => apiFetch(`${API}/products/${selectedProduct!.id}/cost-breakdown`),
    enabled: !!selectedProduct,
  });

  const quoteMutation = useMutation({
    mutationFn: (payload: { product_id: number; width: number; height: number }) =>
      apiFetch<QuoteResult>(`${API}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
  });

  const sensitivityMutation = useMutation({
    mutationFn: (payload: { product_id: number; material: string; change_pct: number }) =>
      apiFetch<SensitivityResult>(`${API}/sensitivity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
  });

  const saveProductMutation = useMutation({
    mutationFn: (product: Partial<Product>) => {
      const method = product.id ? "PUT" : "POST";
      const url = product.id ? `${API}/products/${product.id}` : `${API}/products`;
      return apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-products"] });
      setProductDialogOpen(false);
      setEditProduct(null);
    },
  });

  const { data: compareProducts = [] } = useQuery<Product[]>({
    queryKey: ["bom-compare", compareIds],
    queryFn: () => apiFetch(`${API}/compare?ids=${compareIds.join(",")}`),
    enabled: compareIds.length >= 2,
  });

  const filteredProducts = products.filter((p) =>
    !searchQuery ||
    p.name_he?.includes(searchQuery) ||
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku?.includes(searchQuery)
  );

  const costPieData = costBreakdown
    ? [
        { name: "חומרי גלם", value: costBreakdown.materials },
        { name: "עבודה", value: costBreakdown.labor },
        { name: "צביעה", value: costBreakdown.painting },
        { name: "הובלה", value: costBreakdown.transport },
        { name: "תקורה", value: costBreakdown.overhead },
      ]
    : [];

  const toggleCompare = (id: number) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-4)
    );
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-7 w-7 text-blue-400" />
            עץ מוצר וקטלוג
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מוצרים, חומרי גלם, עלויות ותמחור</p>
        </div>
        <div className="flex gap-2">
          <ImportButton apiRoute="/api/bom-products" onSuccess={() => queryClient.invalidateQueries({ queryKey: ["bom-products"] })} />
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => { setEditProduct({}); setProductDialogOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            מוצר חדש
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="products">מוצרים</TabsTrigger>
          <TabsTrigger value="quote">מחשבון הצעת מחיר</TabsTrigger>
          <TabsTrigger value="sensitivity">ניתוח רגישות מחיר</TabsTrigger>
          <TabsTrigger value="compare">השוואת מוצרים</TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="חיפוש לפי שם מוצר, SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className=""
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקטגוריות</SelectItem>
                <SelectItem value="pergola">פרגולה</SelectItem>
                <SelectItem value="fence">גדר</SelectItem>
                <SelectItem value="gate">שער</SelectItem>
                <SelectItem value="railing">מעקה</SelectItem>
                <SelectItem value="carport">סככה</SelectItem>
                <SelectItem value="custom">מותאם אישית</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button variant={viewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setViewMode("table")}>
                טבלה
              </Button>
              <Button variant={viewMode === "grid" ? "default" : "outline"} size="sm" onClick={() => setViewMode("grid")}>
                כרטיסים
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">טוען מוצרים...</div>
          ) : viewMode === "table" ? (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-border">
                    <TableHead className="text-right text-muted-foreground">שם מוצר</TableHead>
                    <TableHead className="text-center text-muted-foreground">קטגוריה</TableHead>
                    <TableHead className="text-center text-muted-foreground">עלות למ״ר</TableHead>
                    <TableHead className="text-center text-muted-foreground">מחיר מומלץ</TableHead>
                    <TableHead className="text-center text-muted-foreground">מרווח %</TableHead>
                    <TableHead className="text-center text-muted-foreground">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="border-border/50 hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{product.name_he}</p>
                          <p className="text-xs text-muted-foreground">{product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={CATEGORY_COLORS[product.category] || "bg-muted text-muted-foreground"}>
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground font-mono">{formatCurrency(product.cost_per_sqm)}</TableCell>
                      <TableCell className="text-center text-green-400 font-mono">{formatCurrency(product.suggested_price_per_sqm)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          product.margin_pct >= 30
                            ? "bg-green-500/20 text-green-400"
                            : product.margin_pct >= 15
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-red-500/20 text-red-400"
                        }>
                          {product.margin_pct?.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedProduct(product); setBomOpen(true); }}
                          >
                            <Layers className="h-3 w-3 ml-1" />
                            עץ מוצר
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setEditProduct(product); setProductDialogOpen(true); }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            title="שכפול"
                            onClick={async () => { const res = await duplicateRecord(API, product.id); if (res.ok) { queryClient.invalidateQueries({ queryKey: ["bom-products"] }); } else { alert("שגיאה בשכפול: " + res.error); } }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            variant={compareIds.includes(product.id) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleCompare(product.id)}
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">לא נמצאו מוצרים</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="bg-muted/50 border-border/50 hover:border-border transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={CATEGORY_COLORS[product.category] || "bg-muted text-muted-foreground"}>
                        {product.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{product.sku}</span>
                    </div>
                    <CardTitle className="text-base text-foreground mt-2">{product.name_he}</CardTitle>
                    <p className="text-xs text-muted-foreground">{product.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">עלות למ״ר</p>
                        <p className="font-mono text-muted-foreground">{formatCurrency(product.cost_per_sqm)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">מחיר מומלץ</p>
                        <p className="font-mono text-green-400">{formatCurrency(product.suggested_price_per_sqm)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">מרווח</p>
                        <p className={`font-mono font-bold ${product.margin_pct >= 30 ? "text-green-400" : product.margin_pct >= 15 ? "text-yellow-400" : "text-red-400"}`}>
                          {product.margin_pct?.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => { setSelectedProduct(product); setBomOpen(true); }}
                      >
                        <Layers className="h-3 w-3 ml-1" />
                        עץ מוצר
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditProduct(product); setProductDialogOpen(true); }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="שכפול"
                        onClick={async () => { const res = await duplicateRecord(API, product.id); if (res.ok) { queryClient.invalidateQueries({ queryKey: ["bom-products"] }); } else { alert("שגיאה בשכפול: " + res.error); } }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* BOM Detail Dialog */}
          <Dialog open={bomOpen} onOpenChange={setBomOpen}>
            <DialogContent dir="rtl" className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-400" />
                  עץ מוצר - {selectedProduct?.name_he}
                </DialogTitle>
              </DialogHeader>
              {selectedProduct && (
                <div className="space-y-6 mt-4">
                  {/* BOM Table */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 border-border">
                          <TableHead className="text-right text-muted-foreground">חומר</TableHead>
                          <TableHead className="text-center text-muted-foreground">קטגוריה</TableHead>
                          <TableHead className="text-center text-muted-foreground">כמות למ״ר</TableHead>
                          <TableHead className="text-center text-muted-foreground">יחידה</TableHead>
                          <TableHead className="text-center text-muted-foreground">עלות ליחידה</TableHead>
                          <TableHead className="text-center text-muted-foreground">פחת %</TableHead>
                          <TableHead className="text-center text-muted-foreground">עלות למ״ר</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bomItems.map((item) => (
                          <TableRow key={item.id} className="border-border/50">
                            <TableCell className="font-medium text-foreground">{item.material_name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs">{item.material_category}</Badge>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground font-mono">{item.quantity_per_sqm}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                            <TableCell className="text-center text-muted-foreground font-mono">{formatCurrency(item.unit_cost)}</TableCell>
                            <TableCell className="text-center text-orange-400">{item.waste_factor_pct}%</TableCell>
                            <TableCell className="text-center text-green-400 font-mono font-medium">{formatCurrency(item.total_cost_per_sqm)}</TableCell>
                          </TableRow>
                        ))}
                        {bomItems.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">אין חומרים מוגדרים</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Cost Breakdown Pie */}
                  {costPieData.length > 0 && costBreakdown && (
                    <Card className="bg-muted/50 border-border/50">
                      <CardHeader>
                        <CardTitle className="text-sm text-muted-foreground">פירוט עלויות למ״ר</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={costPieData}
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={90}
                                  dataKey="value"
                                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                  {costPieData.map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }}
                                  formatter={(value: number) => formatCurrency(value)}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-2 flex flex-col justify-center">
                            {costPieData.map((item, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                                  <span className="text-muted-foreground">{item.name}</span>
                                </div>
                                <span className="font-mono text-foreground">{formatCurrency(item.value)}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between text-sm border-t border-border pt-2 mt-2">
                              <span className="font-medium text-foreground">סה״כ עלות למ״ר</span>
                              <span className="font-mono font-bold text-green-400">{formatCurrency(costBreakdown.total)}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Add/Edit Product Dialog */}
          <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
            <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editProduct?.id ? "עריכת מוצר" : "מוצר חדש"}</DialogTitle>
              </DialogHeader>
              {editProduct && (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">שם מוצר (עברית)</label>
                      <Input
                        value={editProduct.name_he || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, name_he: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">שם מוצר (אנגלית)</label>
                      <Input
                        value={editProduct.name || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">SKU</label>
                      <Input
                        value={editProduct.sku || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, sku: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">קטגוריה</label>
                      <Select
                        value={editProduct.category || "custom"}
                        onValueChange={(v) => setEditProduct({ ...editProduct, category: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pergola">פרגולה</SelectItem>
                          <SelectItem value="fence">גדר</SelectItem>
                          <SelectItem value="gate">שער</SelectItem>
                          <SelectItem value="railing">מעקה</SelectItem>
                          <SelectItem value="carport">סככה</SelectItem>
                          <SelectItem value="custom">מותאם אישית</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">תיאור</label>
                    <textarea
                      className="w-full h-20 rounded-lg border border-border bg-input px-3 py-2 text-foreground text-sm"
                      value={editProduct.description || ""}
                      onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">עלות למ״ר</label>
                      <Input
                        type="number"
                        value={editProduct.cost_per_sqm || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, cost_per_sqm: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">מחיר מומלץ למ״ר</label>
                      <Input
                        type="number"
                        value={editProduct.suggested_price_per_sqm || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, suggested_price_per_sqm: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">רוחב מינימלי (מ׳)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editProduct.min_width || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, min_width: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">רוחב מקסימלי (מ׳)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={editProduct.max_width || ""}
                        onChange={(e) => setEditProduct({ ...editProduct, max_width: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  {!editProduct?.name_he && !editProduct?.name && (
                    <p className="text-xs text-red-400 mb-2">⚠ יש להזין שם מוצר לפחות באחת השפות</p>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!editProduct?.name_he && !editProduct?.name) return;
                      saveProductMutation.mutate(editProduct as Partial<Product>);
                    }}
                    disabled={saveProductMutation.isPending}
                  >
                    {saveProductMutation.isPending ? "שומר..." : "שמור"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Quote Calculator Tab */}
        <TabsContent value="quote" className="space-y-6">
          <Card className="bg-muted/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <Calculator className="h-5 w-5 text-green-400" />
                מחשבון הצעת מחיר
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">מוצר</label>
                  <Select value={quoteProductId} onValueChange={setQuoteProductId}>
                    <SelectTrigger><SelectValue placeholder="בחר מוצר" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name_he}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">רוחב (מטר)</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="3.0"
                    value={quoteWidth}
                    onChange={(e) => setQuoteWidth(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">גובה (מטר)</label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="2.5"
                    value={quoteHeight}
                    onChange={(e) => setQuoteHeight(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      if (quoteProductId && quoteWidth && quoteHeight) {
                        quoteMutation.mutate({
                          product_id: Number(quoteProductId),
                          width: Number(quoteWidth),
                          height: Number(quoteHeight),
                        });
                      }
                    }}
                    disabled={quoteMutation.isPending}
                  >
                    {quoteMutation.isPending ? "מחשב..." : "חשב הצעה"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {quoteMutation.data && (
            <Card className="bg-muted/50 border-border/50 border-green-500/30">
              <CardHeader>
                <CardTitle className="text-base text-foreground">תוצאת חישוב - {quoteMutation.data.product_name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">מידות</p>
                    <p className="text-lg font-mono text-foreground">
                      {quoteMutation.data.width}m x {quoteMutation.data.height}m
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">שטח</p>
                    <p className="text-lg font-mono text-foreground">{quoteMutation.data.area_sqm.toFixed(2)} מ״ר</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">עלות כוללת</p>
                    <p className="text-lg font-mono text-orange-400">{formatCurrency(quoteMutation.data.total_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">מחיר מומלץ</p>
                    <p className="text-2xl font-mono font-bold text-green-400">{formatCurrency(quoteMutation.data.suggested_price)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">מרווח</p>
                    <p className="text-lg font-mono text-blue-400">{quoteMutation.data.margin_pct.toFixed(1)}%</p>
                  </div>
                </div>

                {quoteMutation.data.cost_breakdown && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <p className="text-sm text-muted-foreground mb-2">פירוט עלויות:</p>
                    <div className="grid grid-cols-5 gap-2 text-sm text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">חומרי גלם</p>
                        <p className="font-mono text-muted-foreground">{formatCurrency(quoteMutation.data.cost_breakdown.materials)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">עבודה</p>
                        <p className="font-mono text-muted-foreground">{formatCurrency(quoteMutation.data.cost_breakdown.labor)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">צביעה</p>
                        <p className="font-mono text-muted-foreground">{formatCurrency(quoteMutation.data.cost_breakdown.painting)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">הובלה</p>
                        <p className="font-mono text-muted-foreground">{formatCurrency(quoteMutation.data.cost_breakdown.transport)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">תקורה</p>
                        <p className="font-mono text-muted-foreground">{formatCurrency(quoteMutation.data.cost_breakdown.overhead)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Sensitivity Analysis Tab */}
        <TabsContent value="sensitivity" className="space-y-6">
          <Card className="bg-muted/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-orange-400" />
                ניתוח רגישות מחיר
              </CardTitle>
              <p className="text-xs text-muted-foreground">מה קורה אם מחיר ברזל/אלומיניום עולה ב-X%?</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">מוצר</label>
                  <Select value={sensitivityProductId} onValueChange={setSensitivityProductId}>
                    <SelectTrigger><SelectValue placeholder="בחר מוצר" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name_he}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">חומר גלם</label>
                  <Select value={sensitivityMaterial} onValueChange={setSensitivityMaterial}>
                    <SelectTrigger><SelectValue placeholder="בחר חומר" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iron">ברזל</SelectItem>
                      <SelectItem value="aluminum">אלומיניום</SelectItem>
                      <SelectItem value="wood">עץ</SelectItem>
                      <SelectItem value="glass">זכוכית</SelectItem>
                      <SelectItem value="paint">צבע</SelectItem>
                      <SelectItem value="concrete">בטון</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">שינוי מחיר (%)</label>
                  <Input
                    type="number"
                    value={sensitivityChangePct}
                    onChange={(e) => setSensitivityChangePct(e.target.value)}
                    placeholder="10"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full bg-orange-600 hover:bg-orange-700"
                    onClick={() => {
                      if (sensitivityProductId && sensitivityMaterial && sensitivityChangePct) {
                        sensitivityMutation.mutate({
                          product_id: Number(sensitivityProductId),
                          material: sensitivityMaterial,
                          change_pct: Number(sensitivityChangePct),
                        });
                      }
                    }}
                    disabled={sensitivityMutation.isPending}
                  >
                    {sensitivityMutation.isPending ? "מנתח..." : "נתח רגישות"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {sensitivityMutation.data && (
            <Card className="bg-muted/50 border-border/50 border-orange-500/30">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">חומר</p>
                    <p className="text-lg text-foreground">{sensitivityMutation.data.material}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">שינוי</p>
                    <p className={`text-lg font-mono ${sensitivityMutation.data.change_pct >= 0 ? "text-red-400" : "text-green-400"}`}>
                      {sensitivityMutation.data.change_pct >= 0 ? "+" : ""}{sensitivityMutation.data.change_pct}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">עלות מקורית</p>
                    <p className="text-lg font-mono text-muted-foreground">{formatCurrency(sensitivityMutation.data.original_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">עלות חדשה</p>
                    <p className="text-lg font-mono text-orange-400">{formatCurrency(sensitivityMutation.data.new_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">מרווח חדש</p>
                    <p className={`text-lg font-mono font-bold ${sensitivityMutation.data.new_margin_pct >= 20 ? "text-green-400" : sensitivityMutation.data.new_margin_pct >= 10 ? "text-yellow-400" : "text-red-400"}`}>
                      {sensitivityMutation.data.new_margin_pct.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-muted/30 text-sm text-center">
                  <span className="text-muted-foreground">השפעה על העלות: </span>
                  <span className={`font-mono font-bold ${sensitivityMutation.data.cost_impact >= 0 ? "text-red-400" : "text-green-400"}`}>
                    {sensitivityMutation.data.cost_impact >= 0 ? "+" : ""}{formatCurrency(sensitivityMutation.data.cost_impact)}
                  </span>
                  <span className="text-muted-foreground"> למ״ר</span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Products Comparison Tab */}
        <TabsContent value="compare" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">השוואת מוצרים</h2>
            <p className="text-sm text-muted-foreground">
              {compareIds.length < 2
                ? `בחר לפחות 2 מוצרים מטאב המוצרים (${compareIds.length}/4)`
                : `${compareIds.length} מוצרים נבחרו`}
            </p>
          </div>

          {compareIds.length < 2 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p>סמן לפחות 2 מוצרים מטאב ״מוצרים״ בעזרת כפתור ההשוואה</p>
            </div>
          ) : compareProducts.length > 0 ? (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-border">
                    <TableHead className="text-right text-muted-foreground">מאפיין</TableHead>
                    {compareProducts.map((p) => (
                      <TableHead key={p.id} className="text-center text-muted-foreground">{p.name_he}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-border/50">
                    <TableCell className="font-medium text-muted-foreground">קטגוריה</TableCell>
                    {compareProducts.map((p) => (
                      <TableCell key={p.id} className="text-center">
                        <Badge variant="outline" className={CATEGORY_COLORS[p.category]}>{p.category}</Badge>
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="font-medium text-muted-foreground">עלות למ״ר</TableCell>
                    {compareProducts.map((p) => (
                      <TableCell key={p.id} className="text-center font-mono text-foreground">{formatCurrency(p.cost_per_sqm)}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="font-medium text-muted-foreground">מחיר מומלץ למ״ר</TableCell>
                    {compareProducts.map((p) => (
                      <TableCell key={p.id} className="text-center font-mono text-green-400">{formatCurrency(p.suggested_price_per_sqm)}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="font-medium text-muted-foreground">מרווח %</TableCell>
                    {compareProducts.map((p) => (
                      <TableCell key={p.id} className="text-center">
                        <Badge className={p.margin_pct >= 30 ? "bg-green-500/20 text-green-400" : p.margin_pct >= 15 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                          {p.margin_pct?.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="font-medium text-muted-foreground">רוחב (מינ׳ - מקס׳)</TableCell>
                    {compareProducts.map((p) => (
                      <TableCell key={p.id} className="text-center text-muted-foreground">{p.min_width}m - {p.max_width}m</TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="font-medium text-muted-foreground">גובה (מינ׳ - מקס׳)</TableCell>
                    {compareProducts.map((p) => (
                      <TableCell key={p.id} className="text-center text-muted-foreground">{p.min_height}m - {p.max_height}m</TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">טוען השוואה...</div>
          )}

          {compareIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setCompareIds([])}>
              נקה השוואה
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
