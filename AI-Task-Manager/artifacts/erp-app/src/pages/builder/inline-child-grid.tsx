import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, X, Check, Table2, Calculator } from "lucide-react";
import { renderCellValueEnhanced } from "./form-field-components";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface InlineChildGridProps {
  parentRecordId: number;
  childEntityId: number;
  relation: any;
  readOnly?: boolean;
}

export function InlineChildGrid({ parentRecordId, childEntityId, relation, readOnly = false }: InlineChildGridProps) {
  const queryClient = useQueryClient();
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Record<string, any>>({});
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [addingRow, setAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});

  const settings = (relation.settings as Record<string, any>) || {};
  const displayColumns: string[] = settings.displayColumns || [];
  const aggregations: Array<{ function: string; sourceField: string; targetField: string }> = settings.aggregations || [];

  const { data: childEntity } = useQuery({
    queryKey: ["platform-entity", childEntityId],
    queryFn: () => authFetch(`${API}/platform/entities/${childEntityId}`).then(r => r.json()),
  });

  const { data: childRecordsData, isLoading } = useQuery({
    queryKey: ["child-records", parentRecordId, childEntityId],
    queryFn: () => authFetch(`${API}/platform/records/${parentRecordId}/children/${childEntityId}`).then(r => r.json()),
    enabled: !!parentRecordId && !!childEntityId,
  });

  const childFields = useMemo(() => {
    if (!childEntity?.fields) return [];
    const fields = childEntity.fields as any[];
    if (displayColumns.length > 0) {
      return displayColumns
        .map(slug => fields.find((f: any) => f.slug === slug))
        .filter(Boolean);
    }
    return fields.filter((f: any) => f.showInList && f.slug !== "_parent_id");
  }, [childEntity, displayColumns]);

  const allFields = childEntity?.fields || [];
  const childRecords = childRecordsData?.records || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => authFetch(`${API}/platform/records/${parentRecordId}/children/${childEntityId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-records", parentRecordId, childEntityId] });
      queryClient.invalidateQueries({ queryKey: ["entity-records"] });
      setAddingRow(false);
      setNewRowData({});
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => authFetch(`${API}/platform/records/${parentRecordId}/children/${childEntityId}/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-records", parentRecordId, childEntityId] });
      queryClient.invalidateQueries({ queryKey: ["entity-records"] });
      setEditingRowId(null);
      setEditingData({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/platform/records/${parentRecordId}/children/${childEntityId}/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-records", parentRecordId, childEntityId] });
      queryClient.invalidateQueries({ queryKey: ["entity-records"] });
    },
  });

  const startEdit = (record: any) => {
    setEditingRowId(record.id);
    setEditingData({ ...(record.data || {}) });
  };

  const startAdd = () => {
    const initial: Record<string, any> = {};
    allFields.forEach((f: any) => {
      if (f.slug === "_parent_id") return;
      initial[f.slug] = f.defaultValue ?? (f.fieldType === "number" || f.fieldType === "currency" || f.fieldType === "decimal" ? 0 : "");
    });
    setNewRowData(initial);
    setAddingRow(true);
  };

  const computedAggregates = useMemo(() => {
    if (aggregations.length === 0) return {};
    const results: Record<string, number> = {};
    for (const agg of aggregations) {
      const values = childRecords
        .map((r: any) => Number((r.data || {})[agg.sourceField] ?? 0))
        .filter((n: number) => !isNaN(n));

      let result = 0;
      switch (agg.function) {
        case "SUM":
          result = values.reduce((a: number, b: number) => a + b, 0);
          break;
        case "COUNT":
          result = values.length;
          break;
        case "AVG":
          result = values.length === 0 ? 0 : values.reduce((a: number, b: number) => a + b, 0) / values.length;
          break;
        case "MIN":
          result = values.length === 0 ? 0 : Math.min(...values);
          break;
        case "MAX":
          result = values.length === 0 ? 0 : Math.max(...values);
          break;
      }
      results[agg.targetField] = Math.round(result * 100) / 100;
    }
    return results;
  }, [childRecords, aggregations]);

  const renderInlineInput = (field: any, value: any, onChange: (val: any) => void) => {
    const cls = "w-full px-2 py-1.5 bg-background border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/50";
    const type = field.fieldType;

    if (type === "number" || type === "decimal" || type === "currency" || type === "percent") {
      return <input type="number" value={value ?? ""} onChange={e => onChange(e.target.value ? Number(e.target.value) : "")}
        step={type === "decimal" || type === "currency" ? "0.01" : "1"} className={cls} />;
    }
    if (type === "date") {
      return <input type="date" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} />;
    }
    if (type === "boolean" || type === "checkbox") {
      return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded border-border text-primary" />;
    }
    if (type === "single_select" || type === "radio") {
      const options = Array.isArray(field.options) ? field.options : [];
      return (
        <select value={value || ""} onChange={e => onChange(e.target.value)} className={cls}>
          <option value="">בחר...</option>
          {options.map((opt: any) => {
            const optValue = typeof opt === "string" ? opt : opt.value;
            return <option key={optValue} value={optValue}>{optValue}</option>;
          })}
        </select>
      );
    }
    return <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} />;
  };

  const renderCellValue = (value: any, field: any) => {
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">-</span>;
    const type = field.fieldType;
    if (type === "boolean" || type === "checkbox") return value ? "✓" : "✗";
    if (type === "date") return new Date(value).toLocaleDateString("he-IL");
    if (type === "currency") return `₪${Number(value).toLocaleString()}`;
    if (type === "percent") return `${value}%`;
    const enhanced = renderCellValueEnhanced(value, field);
    if (enhanced !== null) return enhanced;
    if (typeof value === "number") return value.toLocaleString();
    if (typeof value === "string" && value.length > 40) return value.slice(0, 40) + "...";
    return String(value);
  };

  const label = relation.label || childEntity?.namePlural || "תת-טבלה";

  return (
    <div className="col-span-2 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md">
            {childRecords.length} שורות
          </span>
        </div>
        {!readOnly && (
          <button type="button" onClick={startAdd} disabled={addingRow}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" />
            הוסף שורה
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border">
                <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground w-8">#</th>
                {childFields.map((f: any) => (
                  <th key={f.slug} className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">{f.name}</th>
                ))}
                {!readOnly && <th className="px-2 py-2 w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {childRecords.map((rec: any, idx: number) => {
                const data = rec.data || {};
                const isEditing = editingRowId === rec.id;

                return (
                  <tr key={rec.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                    {childFields.map((f: any) => (
                      <td key={f.slug} className="px-1 py-1">
                        {isEditing ? (
                          renderInlineInput(f, editingData[f.slug], (val) => setEditingData(d => ({ ...d, [f.slug]: val })))
                        ) : (
                          <span className="text-xs px-1">{renderCellValue(data[f.slug], f)}</span>
                        )}
                      </td>
                    ))}
                    {!readOnly && (
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-0.5">
                          {isEditing ? (
                            <>
                              <button type="button" onClick={() => updateMutation.mutate({ id: rec.id, data: editingData })}
                                className="p-1 hover:bg-green-500/10 rounded" disabled={updateMutation.isPending}>
                                <Check className="w-3 h-3 text-green-500" />
                              </button>
                              <button type="button" onClick={() => { setEditingRowId(null); setEditingData({}); }}
                                className="p-1 hover:bg-muted rounded">
                                <X className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEdit(rec)} className="p-1 hover:bg-muted rounded">
                                <Edit2 className="w-3 h-3 text-muted-foreground" />
                              </button>
                              {isSuperAdmin && (
                                <button type="button" onClick={async () => { const ok = await globalConfirm("מחיקת שורה", { itemName: `#${rec.id}`, entityType: "רשומה" }); if (ok) deleteMutation.mutate(rec.id); }}
                                  className="p-1 hover:bg-destructive/10 rounded">
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {addingRow && (
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">+</td>
                  {childFields.map((f: any) => (
                    <td key={f.slug} className="px-1 py-1">
                      {renderInlineInput(f, newRowData[f.slug], (val) => setNewRowData(d => ({ ...d, [f.slug]: val })))}
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => createMutation.mutate(newRowData)}
                        className="p-1 hover:bg-green-500/10 rounded" disabled={createMutation.isPending}>
                        <Check className="w-3 h-3 text-green-500" />
                      </button>
                      <button type="button" onClick={() => { setAddingRow(false); setNewRowData({}); }}
                        className="p-1 hover:bg-muted rounded">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {aggregations.length > 0 && childRecords.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/20">
          <div className="flex items-center gap-4 flex-wrap">
            <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
            {aggregations.map((agg, i) => {
              const sourceField = childFields.find((f: any) => f.slug === agg.sourceField);
              const funcLabels: Record<string, string> = { SUM: "סה\"כ", COUNT: "ספירה", AVG: "ממוצע", MIN: "מינימום", MAX: "מקסימום" };
              return (
                <span key={i} className="text-xs">
                  <span className="text-muted-foreground">{funcLabels[agg.function] || agg.function}({sourceField?.name || agg.sourceField}):</span>
                  <span className="font-medium text-primary mr-1">{computedAggregates[agg.targetField]?.toLocaleString() ?? "-"}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {childRecords.length === 0 && !addingRow && !isLoading && (
        <div className="py-6 text-center">
          <p className="text-xs text-muted-foreground">אין שורות עדיין</p>
          {!readOnly && (
            <button type="button" onClick={startAdd}
              className="mt-2 text-xs text-primary hover:text-primary/80">
              + הוסף שורה ראשונה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function InlineChildGridReadOnly({ parentRecordId, childEntityId, relation }: {
  parentRecordId: number;
  childEntityId: number;
  relation: any;
}) {
  return <InlineChildGrid parentRecordId={parentRecordId} childEntityId={childEntityId} relation={relation} readOnly />;
}
