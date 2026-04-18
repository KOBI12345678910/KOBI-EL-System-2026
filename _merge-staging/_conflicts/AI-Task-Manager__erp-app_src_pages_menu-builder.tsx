import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { Plus, Edit2, Trash2, GripVertical, Menu, Eye, EyeOff, ArrowUp, ArrowDown, Search, Copy, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface MenuItem {
  id: number;
  moduleId: number | null;
  entityId: number | null;
  parentId: number | null;
  label: string;
  labelHe: string | null;
  labelEn: string | null;
  icon: string | null;
  path: string | null;
  section: string | null;
  roles: string[];
  sortOrder: number;
  isActive: boolean;
  settings: Record<string, any>;
  createdAt: string;
}

interface Role {
  id: number;
  name: string;
  nameHe: string | null;
  slug: string;
}

const ICON_OPTIONS = [
  "LayoutDashboard", "Box", "Server", "Key", "Activity", "MessageSquare",
  "Star", "Shield", "FileText", "Users", "Settings", "Layers",
  "Database", "Globe", "Mail", "Calendar", "Folder", "BarChart",
];

export default function MenuBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    label: "", labelHe: "", icon: "Box", path: "", section: "",
    roles: [] as string[], isActive: true,
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["menu-items"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/menu-items`);
      if (!r.ok) throw new Error("Failed to fetch menu items");
      return r.json();
    },
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["platform-roles"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/roles`);
      if (!r.ok) throw new Error("Failed to fetch roles");
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API_BASE}/platform/menu-items`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      setIsModalOpen(false);
      toast({ title: "נוצר", description: "פריט תפריט חדש נוסף." });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await authFetch(`${API_BASE}/platform/menu-items/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      setIsModalOpen(false);
      toast({ title: "עודכן", description: "פריט תפריט עודכן." });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/menu-items/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete menu item");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      toast({ title: "נמחק", description: "פריט תפריט נמחק." });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/menu-items/${id}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to duplicate");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      toast({ title: "שוכפל", description: "פריט תפריט שוכפל בהצלחה." });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (items: { id: number; sortOrder: number; section?: string }[]) => {
      const r = await authFetch(`${API_BASE}/platform/menu-items/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      });
      if (!r.ok) throw new Error("Failed to reorder");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    },
  });

  const autoGenerateMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/menu-definitions/auto-generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      toast({ title: "נוצר אוטומטית", description: data.message });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingItem(null);
    setForm({ label: "", labelHe: "", icon: "Box", path: "", section: "", roles: [], isActive: true });
    setIsModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setForm({
      label: item.label,
      labelHe: item.labelHe || "",
      icon: item.icon || "Box",
      path: item.path || "",
      section: item.section || "",
      roles: (item.roles as string[]) || [],
      isActive: item.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      roles: form.roles.length > 0 ? form.roles : [],
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate({ ...data, sortOrder: menuItems.length });
    }
  };

  const moveItem = (item: MenuItem, direction: "up" | "down") => {
    const sorted = [...menuItems].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(i => i.id === item.id);
    if (direction === "up" && idx > 0) {
      const swapWith = sorted[idx - 1];
      reorderMutation.mutate([
        { id: item.id, sortOrder: swapWith.sortOrder, section: item.section || undefined },
        { id: swapWith.id, sortOrder: item.sortOrder, section: swapWith.section || undefined },
      ]);
    } else if (direction === "down" && idx < sorted.length - 1) {
      const swapWith = sorted[idx + 1];
      reorderMutation.mutate([
        { id: item.id, sortOrder: swapWith.sortOrder, section: item.section || undefined },
        { id: swapWith.id, sortOrder: item.sortOrder, section: swapWith.section || undefined },
      ]);
    }
  };

  const toggleRole = (roleSlug: string) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(roleSlug)
        ? f.roles.filter(r => r !== roleSlug)
        : [...f.roles, roleSlug],
    }));
  };

  const filteredMenuItems = menuItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (item.label || "").toLowerCase().includes(q) || (item.labelHe || "").toLowerCase().includes(q) || (item.path || "").toLowerCase().includes(q);
  });

  const sections = [...new Set(filteredMenuItems.map(i => i.section).filter(Boolean))] as string[];
  const groupedItems: Record<string, MenuItem[]> = {};
  for (const item of filteredMenuItems) {
    const sec = item.section || "ללא קבוצה";
    if (!groupedItems[sec]) groupedItems[sec] = [];
    groupedItems[sec].push(item);
  }
  for (const sec in groupedItems) {
    groupedItems[sec].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">בונה תפריט</h1>
          <p className="text-muted-foreground mt-1">התאמת הניווט בסרגל הצד — סדר, קבוצות, אייקונים ונראות לפי תפקיד</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={async () => { const ok = await globalConfirm("ליצור פריטי תפריט אוטומטית מכל המודולים הפורסמים?"); if (ok) autoGenerateMutation.mutate(); }} variant="outline" className="gap-2" disabled={autoGenerateMutation.isPending}>
            <Wand2 className="w-4 h-4" /> {autoGenerateMutation.isPending ? "מייצר..." : "יצירה אוטומטית"}
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-5 h-5" /> פריט חדש
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פריטי תפריט..."
          className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {Object.keys(groupedItems).length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Menu className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא נוספו פריטי תפריט עדיין</p>
              <p className="text-sm mt-1">לחץ "פריט חדש" להוספת פריט ראשון</p>
            </Card>
          ) : (
            Object.entries(groupedItems).map(([section, items]) => (
              <Card key={section} className="overflow-hidden">
                <div className="px-4 py-3 bg-muted/10 border-b border-border/50">
                  <h3 className="text-sm font-semibold text-muted-foreground">{section}</h3>
                </div>
                <div className="divide-y divide-border/30">
                  {items.map((item) => (
                    <div key={item.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      item.isActive ? "hover:bg-card/[0.02]" : "opacity-50"
                    }`}>
                      <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-primary font-mono">{item.icon?.slice(0, 2) || "?"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.labelHe || item.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.path || "—"}</p>
                      </div>
                      {item.roles && (item.roles as string[]).length > 0 && (
                        <div className="flex gap-1">
                          {(item.roles as string[]).map(r => (
                            <span key={r} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{r}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => moveItem(item, "up")} className="p-1 text-muted-foreground hover:text-foreground">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => moveItem(item, "down")} className="p-1 text-muted-foreground hover:text-foreground">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => duplicateMutation.mutate(item.id)} className="p-1 text-muted-foreground hover:text-primary" title="שכפול">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(item)} className="p-1 text-muted-foreground hover:text-blue-400">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק פריט זה?"); if (ok) deleteMutation.mutate(item.id); }} className="p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>

        <div>
          <Card className="p-4 sticky top-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4" /> תצוגה מקדימה
            </h3>
            <div className="bg-card/80 border border-border/50 rounded-xl p-3 space-y-1">
              {Object.entries(groupedItems).map(([section, items]) => (
                <div key={section} className="mb-3">
                  <div className="text-[10px] font-semibold text-muted-foreground mb-1 px-2 tracking-wider">{section}</div>
                  {items.filter(i => i.isActive).map(item => (
                    <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-card/5">
                      <span className="text-[10px] font-mono">{item.icon?.slice(0, 2) || "?"}</span>
                      <span>{item.labelHe || item.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "עריכת פריט" : "פריט תפריט חדש"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>שם (אנגלית)</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Dashboard" />
            </div>
            <div className="space-y-2">
              <Label>שם (עברית)</Label>
              <Input value={form.labelHe} onChange={e => setForm(f => ({ ...f, labelHe: e.target.value }))} placeholder="דאשבורד" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>נתיב (Path)</Label>
            <Input value={form.path} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} placeholder="/dashboard" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>קבוצה (Section)</Label>
            <Input
              value={form.section}
              onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
              placeholder="ראשי"
              list="sections-list"
            />
            <datalist id="sections-list">
              {sections.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>אייקון</Label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_OPTIONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, icon }))}
                  className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                    form.icon === icon
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-muted/10 text-muted-foreground border-border/50 hover:bg-muted/20"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          {roles.length > 0 && (
            <div className="space-y-2">
              <Label>נראות לפי תפקיד (ריק = כולם)</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map(role => (
                  <button
                    key={role.slug}
                    type="button"
                    onClick={() => toggleRole(role.slug)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      form.roles.includes(role.slug)
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-muted/10 text-muted-foreground border-border/50 hover:bg-muted/20"
                    }`}
                  >
                    {role.nameHe || role.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            <Label htmlFor="isActive" className="mb-0 cursor-pointer">פעיל</Label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>ביטול</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
