import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { GripVertical, Eye, Edit2, MoreHorizontal } from "lucide-react";
import { STATUS_COLORS } from "./field-type-registry";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface KanbanViewProps {
  records: any[];
  fields: any[];
  statuses: any[];
  entity: any;
  activeView: any;
  entityId: number;
  onViewRecord: (record: any) => void;
  onEditRecord: (record: any) => void;
  canEdit?: boolean;
}

export default function KanbanView({
  records, fields, statuses, entity, activeView, entityId,
  onViewRecord, onEditRecord, canEdit = true,
}: KanbanViewProps) {
  const queryClient = useQueryClient();
  const [draggedRecord, setDraggedRecord] = useState<any>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const groupByField = activeView?.settings?.kanbanGroupBy || activeView?.grouping?.fieldSlug || "_status";
  const isStatusGrouping = groupByField === "_status";

  const titleField = useMemo(() => {
    const slug = activeView?.settings?.kanbanTitleField;
    if (slug) return fields.find((f: any) => f.slug === slug);
    return fields.find((f: any) => f.showInList) || fields[0];
  }, [fields, activeView]);

  const bodyFields = useMemo(() => {
    const slugs = activeView?.settings?.kanbanBodyFields;
    if (slugs && Array.isArray(slugs)) {
      return slugs.map((s: string) => fields.find((f: any) => f.slug === s)).filter(Boolean);
    }
    return fields.filter((f: any) => f.showInList).slice(1, 4);
  }, [fields, activeView]);

  const columns = useMemo(() => {
    if (isStatusGrouping) {
      const cols = statuses.map((s: any) => ({
        key: s.slug,
        label: s.name,
        color: STATUS_COLORS.find(c => c.key === s.color)?.hex || "#6b7280",
        records: records.filter((r: any) => r.status === s.slug),
      }));
      const noStatus = records.filter((r: any) => !statuses.find((s: any) => s.slug === r.status));
      if (noStatus.length > 0) {
        cols.push({ key: "_none", label: "ללא סטטוס", color: "#6b7280", records: noStatus });
      }
      return cols;
    }

    const field = fields.find((f: any) => f.slug === groupByField);
    const groups: Record<string, any[]> = {};
    for (const rec of records) {
      const val = String((rec.data || {})[groupByField] || "ללא");
      if (!groups[val]) groups[val] = [];
      groups[val].push(rec);
    }
    return Object.entries(groups).map(([key, recs]) => ({
      key,
      label: key,
      color: "#6b7280",
      records: recs,
    }));
  }, [records, statuses, fields, groupByField, isStatusGrouping]);

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/records/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-records", entityId] }),
  });

  const handleDragStart = (e: React.DragEvent, record: any) => {
    setDraggedRecord(record);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDragOverColumn(columnKey);
  };

  const handleDrop = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedRecord || !canEdit) return;

    if (isStatusGrouping) {
      if (columnKey === "_none") {
        setDraggedRecord(null);
        return;
      }
      if (draggedRecord.status !== columnKey) {
        updateMutation.mutate({ id: draggedRecord.id, status: columnKey });
      }
    } else {
      const currentVal = (draggedRecord.data || {})[groupByField];
      if (String(currentVal) !== columnKey) {
        updateMutation.mutate({
          id: draggedRecord.id,
          data: { ...(draggedRecord.data || {}), [groupByField]: columnKey },
        });
      }
    }
    setDraggedRecord(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "400px" }}>
      {columns.map((col, i) => (
        <motion.div
          key={col.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`flex-shrink-0 w-72 bg-card border rounded-2xl flex flex-col transition-colors ${
            dragOverColumn === col.key ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => handleDragOver(e, col.key)}
          onDragLeave={() => setDragOverColumn(null)}
          onDrop={(e) => handleDrop(e, col.key)}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
              <span className="text-sm font-semibold">{col.label}</span>
            </div>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {col.records.length}
            </span>
          </div>

          <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
            {col.records.map((rec: any) => {
              const data = rec.data || {};
              return (
                <div
                  key={rec.id}
                  draggable={canEdit}
                  onDragStart={canEdit ? (e) => handleDragStart(e, rec) : undefined}
                  onDragEnd={canEdit ? () => { setDraggedRecord(null); setDragOverColumn(null); } : undefined}
                  className={`bg-background border border-border/50 rounded-xl p-3 ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"} hover:border-primary/30 transition-all group ${
                    draggedRecord?.id === rec.id ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="text-sm font-medium truncate max-w-[180px]">
                        {titleField ? (data[titleField.slug] || `#${rec.id}`) : `#${rec.id}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onViewRecord(rec)} className="p-1 hover:bg-muted rounded">
                        <Eye className="w-3 h-3 text-muted-foreground" />
                      </button>
                      {canEdit && (
                        <button onClick={() => onEditRecord(rec)} className="p-1 hover:bg-muted rounded">
                          <Edit2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>

                  {bodyFields.length > 0 && (
                    <div className="space-y-1">
                      {bodyFields.map((f: any) => {
                        const val = data[f.slug];
                        if (val === undefined || val === null || val === "") return null;
                        return (
                          <div key={f.slug} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground truncate">{f.name}:</span>
                            <span className="truncate">{String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!isStatusGrouping && rec.status && (
                    <div className="mt-2">
                      {(() => {
                        const statusDef = statuses.find((s: any) => s.slug === rec.status);
                        const colorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);
                        return statusDef ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ backgroundColor: `${colorDef?.hex || "#6b7280"}20`, color: colorDef?.hex || "#6b7280" }}>
                            {statusDef.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            {col.records.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                גרור כרטיסים לכאן
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
