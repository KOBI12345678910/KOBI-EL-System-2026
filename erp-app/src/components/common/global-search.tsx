import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Save, Loader2, Users, ShoppingCart, Package, Factory, Receipt, Wrench, FileText, Briefcase, CalendarDays, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createPageUrl } from "@/lib/route-map";
import { useLocation } from "wouter";
import { entityList } from "@/lib/entity-api";

interface EntityConfig {
  value: string;
  label: string;
  icon: LucideIcon;
  page?: string;
  apiEntity?: string;
}

interface SearchResult extends Record<string, unknown> {
  _entityType: string;
  _entityConfig: EntityConfig;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const entities: EntityConfig[] = [
  { value: "all", label: "הכל", icon: Search },
  { value: "Lead", label: "לידים", icon: Users, page: "LeadDetail", apiEntity: "leads" },
  { value: "Customer", label: "לקוחות", icon: Users, page: "Customer360", apiEntity: "customers" },
  { value: "SalesOrder", label: "הזמנות", icon: ShoppingCart, page: "SalesOrders", apiEntity: "sales-orders" },
  { value: "Product", label: "מוצרים", icon: Package, page: "Products", apiEntity: "products" },
  { value: "ProductionOrder", label: "ייצור", icon: Factory, page: "ProductionOrders", apiEntity: "production-orders" },
  { value: "Invoice", label: "חשבוניות", icon: Receipt, page: "Invoices", apiEntity: "invoices" },
  { value: "Task", label: "משימות", icon: CalendarDays, page: "Tasks", apiEntity: "tasks" },
  { value: "Deal", label: "עסקאות", icon: Briefcase, page: "Deals", apiEntity: "deals" },
  { value: "Quote", label: "הצעות", icon: FileText, page: "Quotes", apiEntity: "quotes" },
  { value: "Installation", label: "התקנות", icon: Wrench, page: "Installations", apiEntity: "installations" },
];

function getItemTitle(item: Record<string, unknown>, entityType: string): string {
  switch (entityType) {
    case "Lead": return (item.first_name || item.company_name || "ללא שם") as string;
    case "Customer": return (item.name || item.company_name || "ללא שם") as string;
    case "SalesOrder": return `הזמנה #${item.order_number || item.id}`;
    case "Product": return (item.name || "מוצר") as string;
    case "ProductionOrder": return `ייצור #${item.order_number || item.id}`;
    case "Invoice": return `חשבונית #${item.invoice_number || item.id}`;
    case "Task": return (item.title || "משימה") as string;
    case "Deal": return (item.name || "עסקה") as string;
    case "Quote": return `הצעה #${item.quote_number || item.id}`;
    case "Installation": return `התקנה #${item.id}`;
    default: return (item.name || item.title || "פריט") as string;
  }
}

function getItemSubtitle(item: Record<string, unknown>, entityType: string): string {
  switch (entityType) {
    case "Lead": return (item.phone || item.email || "") as string;
    case "Customer": return (item.email || item.phone || "") as string;
    case "SalesOrder": return `${item.customer_name || ""} • ${item.status || ""}`;
    case "Product": return `מק"ט: ${item.sku || ""}`;
    case "Invoice": return `₪${((item.total as number) || 0).toLocaleString()}`;
    case "Deal": return `₪${((item.amount as number) || 0).toLocaleString()}`;
    default: return "";
  }
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntities, setSelectedEntities] = useState<string[]>(["all"]);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (searchTerm.length < 2) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const entitiesToSearch = selectedEntities.includes("all") ? entities.filter((e) => e.value !== "all") : entities.filter((e) => selectedEntities.includes(e.value));
        const promises = entitiesToSearch.map(async (entityConfig) => {
          try {
            const items = await entityList<Record<string, unknown>>(entityConfig.apiEntity || entityConfig.value.toLowerCase() + "s");
            return items
              .filter((item) => JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase()))
              .slice(0, 5)
              .map((item) => ({ ...item, _entityType: entityConfig.value, _entityConfig: entityConfig }));
          } catch { return []; }
        });
        const allResults = await Promise.all(promises);
        setResults(allResults.flat().slice(0, 20) as SearchResult[]);
      } catch (error) { console.error("Search error:", error); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchTerm, selectedEntities]);

  const handleResultClick = (item: SearchResult) => {
    if (item._entityConfig?.page) {
      navigate(createPageUrl(item._entityConfig.page) + (item.id ? `?id=${item.id}` : ""));
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle className="text-right">חיפוש גלובלי</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="חפש בכל המערכת..." className="pr-10" autoFocus />
          </div>
          <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon"><Save className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {entities.map((entity) => {
            const Icon = entity.icon;
            return (
              <Badge key={entity.value} variant={selectedEntities.includes(entity.value) ? "default" : "outline"} className="cursor-pointer whitespace-nowrap flex items-center gap-1"
                onClick={() => {
                  if (entity.value === "all") setSelectedEntities(["all"]);
                  else setSelectedEntities((prev) => prev.includes(entity.value) ? prev.filter((v) => v !== entity.value) : [...prev.filter((v) => v !== "all"), entity.value]);
                }}>
                <Icon className="w-3 h-3" />{entity.label}
              </Badge>
            );
          })}
        </div>
        <Tabs defaultValue="results" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="results">תוצאות</TabsTrigger>
            <TabsTrigger value="recent">חיפושים אחרונים</TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="flex-1 overflow-y-auto mt-4">
            {searching ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
            ) : searchTerm.length >= 2 ? (
              results.length > 0 ? (
                <div className="space-y-2">
                  {results.map((result, idx) => {
                    const Icon = result._entityConfig.icon;
                    return (
                      <div key={`${result._entityType}-${result.id || idx}`} className="p-3 rounded-lg border hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => handleResultClick(result)}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-600" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">{result._entityConfig.label}</Badge>
                              <span className="font-medium truncate">{getItemTitle(result, result._entityType)}</span>
                            </div>
                            <div className="text-sm text-slate-500 truncate">{getItemSubtitle(result, result._entityType)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (<div className="text-center py-12 text-slate-400">לא נמצאו תוצאות</div>)
            ) : (<div className="text-center py-12 text-slate-400">הקלד לפחות 2 תווים לחיפוש...</div>)}
          </TabsContent>
          <TabsContent value="recent" className="flex-1 overflow-y-auto mt-4">
            <div className="text-center py-12 text-slate-400">חיפושים אחרונים יישמרו בקרוב</div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
