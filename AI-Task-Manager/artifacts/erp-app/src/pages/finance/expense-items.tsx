import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Receipt, Plus, Search, Eye, Edit2, Trash2, X, Package
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authJson } from "@/lib/utils";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";

const DOC_TYPES = [
  { id: "supplier_invoice_payment", label: "חשבוניות ותשלומים לספקים" },
  { id: "supplier_invoice", label: "חשבוניות ספקים" },
  { id: "payment_record", label: "תיעודי תשלומים לספקים" },
  { id: "payment_request", label: "בקשות תשלום מספקים" },
];

const DEFAULT_ITEMS = [
  "ARCDB", "BDI", "CRM", "SEO", "א את צ טכנולוגיות", "אוטומציות",
  "אוזיה אוטומציה", "אלומיניום ורד", "אנשי מכירות קבלני משנה", "ארנונה",
  "ביגוד", "ביטוח", "בניה", "גז", "דלק", "הובלה", "הנהלת חשבונות",
  "השכרת ציוד", "חומרי גלם", "חשמל ומים", "טלפון", "מזון ומשקאות",
  "מימון משכנתא", "מיסים ואגרות", "ציוד משרדי", "שיווק ופרסום",
  "שכירות", "שכר עבודה", "תחזוקה ותיקונים", "תקשורת ואינטרנט",
];

export default function ExpenseItemsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [docTypeDialogOpen, setDocTypeDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemDocType, setNewItemDocType] = useState("");
  const [itemDetailView, setItemDetailView] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const { data } = useQuery({
    queryKey: ["expense-items"],
    queryFn: async () => {
      try {
        const res = await authJson(`${API}/platform/category-items?category=expense_items`);
        const items = Array.isArray(res) ? res : res?.data || [];
        if (items.length > 0) return items;
        return DEFAULT_ITEMS.map((name, i) => ({ id: i + 1, name, count: 0 }));
      } catch {
        return DEFAULT_ITEMS.map((name, i) => ({ id: i + 1, name, count: 0 }));
      }
    },
  });

  const items = (Array.isArray(data) ? data : []).filter((item: any) =>
    !search || item.name?.includes(search)
  );

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6 text-orange-400" /> פריטי הוצאות
          </h1>
          <p className="text-muted-foreground mt-1">ניהול קטגוריות ופריטי הוצאה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-slate-600" onClick={() => setDocTypeDialogOpen(true)}>
            מסמכים לפי סוג
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 ml-2" />יצירת פריט הוצאה
          </Button>
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="pr-9 bg-slate-800 border-slate-700"
          />
        </div>
        <Button variant="outline" size="sm" className="border-slate-600">
          הצגת פילטרים
        </Button>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="פריטי הוצאה" actions={defaultBulkActions(selectedIds, clear, () => {}, `${API}/platform/category-items`)} />
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="p-3 w-10"><BulkCheckbox checked={selectedIds.length === items.length && items.length > 0} onChange={() => toggleAll(items)} partial={selectedIds.length > 0 && selectedIds.length < items.length} /></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">שם פריט הוצאה ↑</th>
                  <th className="p-3 text-center text-muted-foreground font-medium w-[120px]">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id || item.name} className="border-b border-slate-800/50 hover:bg-slate-800/30 group">
                    <td className="p-3 w-[40px]">
                      <BulkCheckbox checked={isSelected(item.id)} onChange={() => toggle(item.id)} />
                    </td>
                    <td className="p-3 text-foreground font-medium cursor-pointer hover:underline" onClick={() => { setItemDetailView(item); setDetailTab("details"); }}>{item.name}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 rounded hover:bg-slate-700 text-muted-foreground hover:text-foreground" title="עריכה">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-slate-700 text-muted-foreground hover:text-foreground" title="צפייה">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">לא נמצאו פריטי הוצאה</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={docTypeDialogOpen} onOpenChange={setDocTypeDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>פירוט מסמכים לפי סוג</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {DOC_TYPES.map(dt => (
              <button
                key={dt.id}
                className="w-full text-right p-4 rounded-lg border border-slate-700 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all text-foreground font-medium"
                onClick={() => {
                  setDocTypeDialogOpen(false);
                  window.location.href = `/finance/expenses?doc_type=${dt.id}`;
                }}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>יצירת פריט הוצאה חדש</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם פריט הוצאה</Label>
              <Input
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="הזן שם פריט..."
                className="bg-slate-800 border-slate-700 mt-1"
              />
            </div>
            <div>
              <Label>תיאור</Label>
              <Input
                value={newItemDescription}
                onChange={e => setNewItemDescription(e.target.value)}
                placeholder="תיאור הפריט..."
                className="bg-slate-800 border-slate-700 mt-1"
              />
            </div>
            <div>
              <Label>סוג מסמך</Label>
              <select
                value={newItemDocType}
                onChange={e => setNewItemDocType(e.target.value)}
                className="w-full mt-1 p-2 rounded-md bg-slate-800 border border-slate-700 text-foreground"
              >
                <option value="">בחירת סוג מסמך</option>
                {DOC_TYPES.map(dt => <option key={dt.id} value={dt.id}>{dt.label}</option>)}
              </select>
            </div>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-foreground"
              disabled={!newItemName.trim()}
              onClick={() => {
                toast({ title: "פריט הוצאה נוצר", description: newItemName });
                setCreateDialogOpen(false);
                setNewItemName("");
                setNewItemDescription("");
                setNewItemDocType("");
              }}
            >
              <Plus className="w-4 h-4 ml-2" />צור פריט
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemDetailView} onOpenChange={(open) => { if (!open) { setItemDetailView(null); setDetailTab("details"); } }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>{itemDetailView?.name || "פרטי פריט"}</DialogTitle></DialogHeader>
          <div className="flex border-b border-slate-700/50">{[{id:"details",label:"פרטים"},{id:"related",label:"רשומות קשורות"},{id:"attachments",label:"מסמכים"},{id:"history",label:"היסטוריה"}].map(t => (<button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>))}</div>
          {detailTab === "details" && itemDetailView && <div className="grid grid-cols-2 gap-4 p-4">
            <div><span className="text-muted-foreground block text-sm">שם פריט</span><span className="text-foreground font-medium">{itemDetailView.name}</span></div>
            <div><span className="text-muted-foreground block text-sm">מזהה</span><span className="text-foreground">{itemDetailView.id || "-"}</span></div>
            <div><span className="text-muted-foreground block text-sm">תיאור</span><span className="text-foreground">{itemDetailView.description || "-"}</span></div>
            <div><span className="text-muted-foreground block text-sm">סוג מסמך</span><span className="text-foreground">{itemDetailView.doc_type || "-"}</span></div>
          </div>}
          {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={[{key:"expenses",label:"הוצאות קשורות",icon:"documents",endpoint:`${API}/expense-files?category=${itemDetailView?.name}&limit=5`,columns:[{key:"file_name",label:"קובץ"},{key:"amount",label:"סכום"},{key:"status",label:"סטטוס"},{key:"created_at",label:"תאריך"}]}]} /></div>}
          {detailTab === "attachments" && itemDetailView && <div className="p-4"><AttachmentsSection entityType="expense-items" entityId={itemDetailView.id} /></div>}
          {detailTab === "history" && itemDetailView && <div className="p-4"><ActivityLog entityType="expense-items" entityId={itemDetailView.id} /></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
