import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, Square, Trash2, Download, Tag, X, Archive, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";

interface BulkAction {
  key: string;
  label: string;
  icon: any;
  color?: string;
  destructive?: boolean;
  handler: (selectedIds: number[]) => Promise<void>;
}

interface BulkActionsProps {
  items?: any[];
  selectedIds: number[];
  onSelectionChange?: (ids: number[]) => void;
  onClear?: () => void;
  actions: BulkAction[];
  idField?: string;
  entityName?: string;
}

export function useBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggle = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = (items: any[], idField = "id") => {
    const allIds = items.map(i => i[idField]);
    setSelectedIds(prev => prev.length === allIds.length ? [] : allIds);
  };

  const clear = () => setSelectedIds([]);
  const isSelected = (id: number) => selectedIds.includes(id);

  return { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected };
}

export function BulkCheckbox({ checked, onChange, partial }: { checked: boolean; onChange: () => void; partial?: boolean }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange(); }} className="p-0.5 hover:bg-muted/50 rounded transition-colors">
      {checked ? <CheckSquare className="w-4 h-4 text-primary" /> : partial ? <Square className="w-4 h-4 text-primary/50" /> : <Square className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

export default function BulkActions({ items, selectedIds, onSelectionChange, onClear, actions, entityName }: BulkActionsProps) {
  const [processing, setProcessing] = useState(false);

  if (selectedIds.length === 0) return null;

  const clearSelection = () => {
    if (onClear) onClear();
    else if (onSelectionChange) onSelectionChange([]);
  };

  const handleAction = async (action: BulkAction) => {
    if (action.destructive) {
      const confirmed = await globalConfirm(`האם למחוק ${selectedIds.length} רשומות? פעולה זו אינה ניתנת לביטול.`);
      if (!confirmed) return;
    }
    setProcessing(true);
    try {
      await action.handler(selectedIds);
      clearSelection();
    } catch {}
    setProcessing(false);
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/20 text-primary text-xs">{selectedIds.length} נבחרו</Badge>
          {entityName && <span className="text-xs text-muted-foreground">{entityName}</span>}
          {items && <span className="text-xs text-muted-foreground">מתוך {items.length}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <button key={action.key} onClick={() => handleAction(action)} disabled={processing} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${action.destructive ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-muted text-white hover:bg-muted/80"}`}>
                <Icon className="w-3.5 h-3.5" />{action.label}
              </button>
            );
          })}
          <button onClick={clearSelection} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function createBulkActions(selectedIds: number[], clear: () => void, reload: () => void, apiBase: string): BulkAction[] {
  return [
    {
      key: "delete", label: "מחיקה", icon: Trash2, destructive: true,
      handler: async (ids: number[]) => {
        for (const id of ids) await authFetch(`${apiBase}/${id}`, { method: "DELETE" });
        reload();
      },
    },
    {
      key: "export", label: "ייצוא", icon: Download,
      handler: async () => {},
    },
  ];
}

const presets = {
  delete: (handler: (ids: number[]) => Promise<void>): BulkAction => ({
    key: "delete", label: "מחיקה", icon: Trash2, destructive: true, color: "text-red-400", handler,
  }),
  export: (handler: (ids: number[]) => Promise<void>): BulkAction => ({
    key: "export", label: "ייצוא", icon: Download, handler,
  }),
  archive: (handler: (ids: number[]) => Promise<void>): BulkAction => ({
    key: "archive", label: "ארכיון", icon: Archive, handler,
  }),
  statusChange: (label: string, handler: (ids: number[]) => Promise<void>): BulkAction => ({
    key: "status", label, icon: Tag, handler,
  }),
  restore: (handler: (ids: number[]) => Promise<void>): BulkAction => ({
    key: "restore", label: "שחזור", icon: RotateCcw, handler,
  }),
};

export const defaultBulkActions: typeof presets & ((selectedIds: number[], clear: () => void, reload: () => void, apiBase: string) => BulkAction[]) = Object.assign(
  createBulkActions,
  presets
) as any;
