import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  X, Edit2, ChevronDown, ChevronUp, Activity, ArrowLeftRight,
  Play, LinkIcon, FileText, Clock, MessageSquare, Paperclip
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { STATUS_COLORS } from "./field-type-registry.ts";
import { InlineChildGridReadOnly } from "./inline-child-grid";
import { renderCellValueEnhanced } from "./form-field-components";
import AIRecordSummary from "@/components/ai/ai-record-summary";

const API = "/api";

function renderDetailValue(value: any, field: any): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">-</span>;
  const type = field.fieldType;
  if (type === "boolean" || type === "checkbox") return value ? "כן" : "לא";
  if (type === "date") return new Date(value).toLocaleDateString("he-IL");
  if (type === "datetime") return new Date(value).toLocaleString("he-IL");
  if (type === "currency") return `₪${Number(value).toLocaleString()}`;
  if (type === "percent") return `${value}%`;
  if (type === "email") return <a href={`mailto:${value}`} className="text-primary hover:underline">{value}</a>;
  if (type === "url") return <a href={value} target="_blank" className="text-primary hover:underline" rel="noreferrer">{value}</a>;
  if (type === "phone") return <a href={`tel:${value}`} className="text-primary hover:underline">{value}</a>;
  if (type === "tags" || type === "multi_select") {
    const arr = Array.isArray(value) ? value : [];
    return <div className="flex gap-1 flex-wrap">{arr.map((v: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">{v}</span>)}</div>;
  }
  if (type === "formula" || type === "computed") return <span className="font-mono text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded">{typeof value === "number" ? value.toLocaleString() : String(value)}</span>;
  if (type === "auto_number") return <span className="font-mono text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">{String(value)}</span>;
  if (type === "rich_text") {
    const sanitized = String(value).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/on\w+\s*=/gi, "data-disabled=");
    return <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  if (type === "address") {
    if (typeof value === "object" && value) {
      const parts = [value.street, value.city, value.zip, value.country].filter(Boolean);
      return <span>{parts.join(", ") || "-"}</span>;
    }
    return String(value);
  }
  if (type === "user_reference") {
    if (typeof value === "object" && value) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
            {(value.name || value.email || "?").charAt(0).toUpperCase()}
          </span>
          <span>{value.name || value.email || `#${value.id}`}</span>
        </span>
      );
    }
    return String(value);
  }
  if (type === "image") {
    if (typeof value === "object" && value?.dataUrl) {
      return <img src={value.dataUrl} alt="" className="w-20 h-20 rounded-xl object-cover border border-border" />;
    }
    return "-";
  }
  if (type === "signature") {
    if (typeof value === "string" && value.startsWith("data:image")) {
      return <img src={value} alt="חתימה" className="h-12 w-auto border border-border rounded" />;
    }
    return <span className="text-green-400 text-xs">חתום</span>;
  }
  if (type === "duration") {
    const mins = Number(value);
    if (isNaN(mins)) return String(value);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return <span className="font-mono">{h > 0 ? `${h}ש ${m}ד` : `${m}ד`}</span>;
  }
  const enhanced = renderCellValueEnhanced(value, field);
  if (enhanced !== null) return enhanced;
  if (typeof value === "string" && value.length > 200) return value.slice(0, 200) + "...";
  return String(value);
}

interface DynamicDetailPageProps {
  record: any;
  fields: any[];
  statuses: any[];
  entityName: string;
  entityId: number;
  detailDefinition?: any;
  relations?: any[];
  actions?: any[];
  onClose: () => void;
  onEdit: () => void;
  onExecuteAction?: (action: any) => void;
  mode?: "modal" | "page";
}

export default function DynamicDetailPage({
  record, fields, statuses, entityName, entityId,
  detailDefinition, relations = [], actions = [],
  onClose, onEdit, onExecuteAction, mode = "modal"
}: DynamicDetailPageProps) {
  const data = record.data || {};
  const statusDef = statuses.find((s: any) => s.slug === record.status);
  const statusColorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);
  const [activeTab, setActiveTab] = useState(0);
  const [showAudit, setShowAudit] = useState(true);

  const headerFields = useMemo(() => {
    if (!detailDefinition?.headerFields || !Array.isArray(detailDefinition.headerFields)) return [];
    return detailDefinition.headerFields.map((hf: any) => {
      const slug = typeof hf === "string" ? hf : hf.fieldSlug;
      const field = fields.find(f => f.slug === slug);
      return field ? { ...field, displayAs: hf.displayAs } : null;
    }).filter(Boolean);
  }, [detailDefinition, fields]);

  const tabs = useMemo(() => {
    if (!detailDefinition?.tabs || !Array.isArray(detailDefinition.tabs) || detailDefinition.tabs.length === 0) return [];
    return detailDefinition.tabs;
  }, [detailDefinition]);

  const sections = useMemo(() => {
    if (!detailDefinition?.sections || !Array.isArray(detailDefinition.sections) || detailDefinition.sections.length === 0) return [];
    return detailDefinition.sections;
  }, [detailDefinition]);

  const relatedLists = useMemo(() => {
    if (!detailDefinition?.relatedLists || !Array.isArray(detailDefinition.relatedLists)) return [];
    return detailDefinition.relatedLists;
  }, [detailDefinition]);

  const actionBarItems = useMemo(() => {
    if (detailDefinition?.actionBar && Array.isArray(detailDefinition.actionBar) && detailDefinition.actionBar.length > 0) {
      return detailDefinition.actionBar;
    }
    return actions.filter((a: any) => a.showInDetail !== false && a.isActive !== false);
  }, [detailDefinition, actions]);

  const hasSections = sections.length > 0;
  const hasTabs = tabs.length > 0;
  const showRelated = detailDefinition?.showRelatedRecords !== false;
  const detailFields = hasSections ? [] : fields.filter((f: any) => f.showInDetail);

  const getTabSections = (tabIdx: number) => {
    if (!hasTabs) return sections;
    const tab = tabs[tabIdx];
    if (!tab) return [];
    if (tab.sectionIds && Array.isArray(tab.sectionIds)) {
      return sections.filter((_: any, idx: number) => tab.sectionIds.includes(idx));
    }
    if (tab.sections && Array.isArray(tab.sections)) return tab.sections;
    return sections;
  };

  const headerContent = (
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-bold">{entityName} #{record.id}</h2>
          {statusDef && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${statusColorDef?.hex || "#6b7280"}20`, color: statusColorDef?.hex || "#6b7280" }}>
              {statusDef.name}
            </span>
          )}
        </div>
        {headerFields.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 mt-3">
            {headerFields.map((field: any) => (
              <div key={field.slug} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{field.name}:</span>
                <span className="text-sm font-medium">{renderDetailValue(data[field.slug], field)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm">
          <Edit2 className="w-3.5 h-3.5" />עריכה
        </button>
        <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
      </div>
    </div>
  );

  const aiSummarySection = (
    <AIRecordSummary
      record={record}
      entityName={entityName}
      entityId={entityId}
      fields={fields}
    />
  );

  const actionBar = actionBarItems.length > 0 && (
    <div className="flex flex-wrap gap-2 pb-4 border-b border-border">
      {actionBarItems.map((action: any, idx: number) => {
        const colorDef = STATUS_COLORS.find(c => c.key === action.color);
        return (
          <button key={action.id || idx}
            onClick={() => onExecuteAction?.(action)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border"
            style={{ borderColor: colorDef?.hex || "#6b7280", backgroundColor: `${colorDef?.hex || "#6b7280"}15`, color: colorDef?.hex || "#6b7280" }}
            title={action.description || action.name}>
            <Play className="w-3.5 h-3.5" />
            {action.name}
          </button>
        );
      })}
    </div>
  );

  const renderSections = (sectionsToRender: any[]) => (
    <div className="space-y-4 sm:space-y-6">
      {sectionsToRender.map((section: any, sIdx: number) => {
        const sectionType = section.type || "fields";
        if (sectionType === "fields") {
          const sectionFields = Array.isArray(section.fields) ? section.fields : [];
          return (
            <div key={sIdx}>
              {sectionsToRender.length > 1 && section.name && (
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border">{section.name}</h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sectionFields.map((slug: string) => {
                  const f = fields.find(field => field.slug === slug);
                  if (!f) return null;
                  return (
                    <div key={f.slug} className={f.fieldWidth === "full" ? "col-span-2" : "col-span-1"}>
                      <p className="text-xs text-muted-foreground mb-1">{f.name}</p>
                      <div className="text-sm font-medium">{renderDetailValue(data[f.slug], f)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
        if (sectionType === "related") {
          return (
            <div key={sIdx}>
              {section.name && <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border">{section.name}</h3>}
              <div className="space-y-3">
                {relations.filter((r: any) => r.relationType !== "inline_child").map((rel: any) => (
                  <RelatedRecordsList key={rel.id} relation={rel} currentEntityId={entityId} recordId={record.id} currentRecordData={data} />
                ))}
              </div>
            </div>
          );
        }
        if (sectionType === "activity") {
          return (
            <div key={sIdx}>
              {section.name && <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border flex items-center gap-2"><Activity className="w-4 h-4" />{section.name}</h3>}
              <AuditTrail recordId={record.id} entityId={entityId} />
            </div>
          );
        }
        if (sectionType === "notes") {
          return (
            <div key={sIdx}>
              {section.name && <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border flex items-center gap-2"><MessageSquare className="w-4 h-4" />{section.name}</h3>}
              <NotesSection recordId={record.id} />
            </div>
          );
        }
        if (sectionType === "attachments") {
          return (
            <div key={sIdx}>
              {section.name && <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border flex items-center gap-2"><Paperclip className="w-4 h-4" />{section.name}</h3>}
              <AttachmentsSection recordData={data} fields={fields} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );

  const mainContent = (
    <div className="space-y-4 sm:space-y-6">
      {aiSummarySection}
      {actionBar}

      {hasTabs ? (
        <>
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto border border-border">
            {tabs.map((tab: any, idx: number) => (
              <button key={idx} onClick={() => setActiveTab(idx)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === idx ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                {tab.icon && <span className="mr-1">{tab.icon}</span>}
                {tab.name || tab.label || `טאב ${idx + 1}`}
                {tab.badge && <span className="mr-1 px-1.5 py-0.5 bg-primary/20 rounded text-xs">{tab.badge}</span>}
              </button>
            ))}
          </div>
          {renderSections(getTabSections(activeTab))}
        </>
      ) : hasSections ? (
        renderSections(sections)
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {detailFields.map((f: any) => (
            <div key={f.slug} className={f.fieldWidth === "full" ? "col-span-2" : "col-span-1"}>
              <p className="text-xs text-muted-foreground mb-1">{f.name}</p>
              <div className="text-sm font-medium">{renderDetailValue(data[f.slug], f)}</div>
            </div>
          ))}
        </div>
      )}

      {relations.filter((r: any) => r.relationType === "inline_child" && r.sourceEntityId === entityId).map((rel: any) => (
        <div key={rel.id} className="pt-4 border-t border-border">
          <InlineChildGridReadOnly parentRecordId={record.id} childEntityId={rel.targetEntityId} relation={rel} />
        </div>
      ))}

      {showRelated && !hasTabs && relations.filter((r: any) => r.relationType !== "inline_child").length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            רשומות קשורות
          </h3>
          <div className="space-y-3">
            {relations.filter((r: any) => r.relationType !== "inline_child").map((rel: any) => (
              <RelatedRecordsList key={rel.id} relation={rel} currentEntityId={entityId} recordId={record.id} currentRecordData={data} />
            ))}
          </div>
        </div>
      )}

      {relatedLists.length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            רשימות קשורות
          </h3>
          <div className="space-y-3">
            {relatedLists.map((rl: any, idx: number) => {
              const rel = relations.find((r: any) => r.id === rl.relationId);
              if (!rel) return null;
              return <RelatedRecordsList key={idx} relation={rel} currentEntityId={entityId} recordId={record.id} currentRecordData={data} maxItems={rl.maxItems || 10} />;
            })}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <button onClick={() => setShowAudit(!showAudit)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <Activity className="w-4 h-4" />
          <span>היסטוריית שינויים</span>
          {showAudit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showAudit && <AuditTrail recordId={record.id} entityId={entityId} />}
      </div>

      <div className="pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />נוצר: {new Date(record.createdAt).toLocaleString("he-IL")}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />עודכן: {new Date(record.updatedAt).toLocaleString("he-IL")}</span>
      </div>
    </div>
  );

  if (mode === "page") {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-2xl p-6">
          {headerContent}
          <div className="mt-6">{mainContent}</div>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {headerContent}
        <div className="mt-6">{mainContent}</div>
      </motion.div>
    </motion.div>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "יצירת רשומה", update: "עדכון רשומה", delete: "מחיקת רשומה",
  status_change: "שינוי סטטוס", bulk_update: "עדכון מרובה", bulk_delete: "מחיקה מרובה",
  import: "ייבוא", publish: "פרסום", restore: "שחזור גרסה",
};

const AUDIT_ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500", update: "bg-blue-500", delete: "bg-red-500",
  status_change: "bg-amber-500", bulk_update: "bg-blue-400", bulk_delete: "bg-red-400",
  import: "bg-purple-500",
};

function AuditTrail({ recordId, entityId }: { recordId: number; entityId: number }) {
  const { data: auditLogs = [] } = useQuery({
    queryKey: ["record-audit", recordId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/records/${recordId}/audit`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  if (auditLogs.length === 0) return <p className="text-xs text-muted-foreground text-center py-3">אין היסטוריית שינויים</p>;

  return (
    <div className="space-y-0 max-h-64 overflow-y-auto pr-1">
      {auditLogs.slice(0, 30).map((log: any, i: number) => {
        const actionLabel = AUDIT_ACTION_LABELS[log.action] || log.action;
        const dotColor = AUDIT_ACTION_COLORS[log.action] || "bg-primary";
        const isLast = i === Math.min(auditLogs.length, 30) - 1;
        const diffs = formatAuditChanges(log.changes);
        return (
          <div key={i} className="flex gap-3 text-xs">
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
              {!isLast && <div className="w-px flex-1 bg-border min-h-[16px]" />}
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{log.performedBy || log.userName || "מערכת"}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{actionLabel}</span>
                <span className="text-muted-foreground/60 mr-auto">{new Date(log.createdAt || log.timestamp).toLocaleString("he-IL")}</span>
              </div>
              {diffs.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {diffs.map((d, di) => (
                    <div key={di} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">{d.key}:</span>{" "}
                      <span className="line-through text-muted-foreground/60">{d.from}</span>
                      <span className="mx-1">→</span>
                      <span className="text-foreground/80">{d.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatAuditChanges(changes: any): { key: string; from: string; to: string }[] {
  if (!changes || typeof changes !== "object") return [];
  const diffs: { key: string; from: string; to: string }[] = [];
  if (changes.oldStatus !== undefined || changes.newStatus !== undefined) diffs.push({ key: "סטטוס", from: String(changes.oldStatus || "-"), to: String(changes.newStatus || "-") });
  if (changes.old && changes.new && typeof changes.old === "object" && typeof changes.new === "object") {
    const allKeys = new Set([...Object.keys(changes.old), ...Object.keys(changes.new)]);
    for (const k of allKeys) {
      if (k.startsWith("_")) continue;
      const oldVal = changes.old[k];
      const newVal = changes.new[k];
      if (String(oldVal ?? "") !== String(newVal ?? "")) diffs.push({ key: k, from: String(oldVal ?? "-"), to: String(newVal ?? "-") });
    }
  }
  return diffs.slice(0, 5);
}

const RELATION_TYPE_LABELS: Record<string, string> = { one_to_one: "אחד לאחד", one_to_many: "אחד לרבים", many_to_many: "רבים לרבים", inline_child: "תת-טבלה" };

function RelatedRecordsList({ relation, currentEntityId, recordId, currentRecordData, maxItems = 5 }: { relation: any; currentEntityId: number; recordId: number; currentRecordData: any; maxItems?: number }) {
  const isSource = relation.sourceEntityId === currentEntityId;
  const relatedEntityId = isSource ? relation.targetEntityId : relation.sourceEntityId;
  const label = isSource ? relation.label : (relation.reverseLabel || relation.label);
  const foreignKeySlug = isSource ? relation.targetFieldSlug : relation.sourceFieldSlug;
  const sourceFieldSlug = isSource ? relation.sourceFieldSlug : relation.targetFieldSlug;

  const lookupValue = useMemo(() => {
    if (sourceFieldSlug && currentRecordData && currentRecordData[sourceFieldSlug] != null && currentRecordData[sourceFieldSlug] !== "") return String(currentRecordData[sourceFieldSlug]);
    return String(recordId);
  }, [sourceFieldSlug, currentRecordData, recordId]);

  const { data: relatedEntity } = useQuery({
    queryKey: ["platform-entity", relatedEntityId],
    queryFn: () => authFetch(`${API}/platform/entities/${relatedEntityId}`).then(r => r.json()),
  });

  const { data: relatedRecordsData } = useQuery({
    queryKey: ["related-records", relatedEntityId, recordId, relation.id, foreignKeySlug, lookupValue],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(maxItems + 5) });
      if (foreignKeySlug) { params.set("filterField", foreignKeySlug); params.set("filterValue", lookupValue); }
      const r = await authFetch(`${API}/platform/entities/${relatedEntityId}/records?${params}`);
      return r.json();
    },
    enabled: !!relatedEntity,
  });

  const relatedRecords = relatedRecordsData?.records || [];
  const relatedFields = (relatedEntity?.fields || []).filter((f: any) => f.showInList).slice(0, 4);
  if (!relatedEntity) return null;

  return (
    <div className="bg-background border border-border/50 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md">{RELATION_TYPE_LABELS[relation.relationType] || relation.relationType}</span>
          {relatedRecords.length > 0 && <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md">{relatedRecords.length}</span>}
        </div>
        <Link href={`/module/${relatedEntityId}`} className="text-xs text-primary hover:underline">צפה בכל ←</Link>
      </div>
      {relatedRecords.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">אין רשומות קשורות</p>
      ) : (
        <div className="space-y-1">
          {relatedRecords.slice(0, maxItems).map((rec: any) => {
            const recData = rec.data || {};
            return (
              <div key={rec.id} className="flex items-center gap-3 px-2 py-1.5 bg-card rounded-lg text-xs">
                <span className="text-muted-foreground">#{rec.id}</span>
                {relatedFields.map((f: any) => (
                  <span key={f.slug} className="truncate max-w-[150px]">{renderDetailValue(recData[f.slug], f)}</span>
                ))}
              </div>
            );
          })}
          {relatedRecords.length > maxItems && <p className="text-xs text-muted-foreground text-center py-1">+{relatedRecords.length - maxItems} נוספים</p>}
        </div>
      )}
    </div>
  );
}

function NotesSection({ recordId }: { recordId: number }) {
  return (
    <div className="text-xs text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
      הערות לרשומה #{recordId}
    </div>
  );
}

function AttachmentsSection({ recordData, fields }: { recordData: any; fields: any[] }) {
  const fileFields = fields.filter(f => f.fieldType === "file" || f.fieldType === "image");
  const attachments: any[] = [];
  fileFields.forEach(f => {
    const val = recordData[f.slug];
    if (!val) return;
    if (Array.isArray(val)) attachments.push(...val.map(v => ({ ...v, fieldName: f.name })));
    else if (typeof val === "object") attachments.push({ ...val, fieldName: f.name });
  });
  if (attachments.length === 0) return <p className="text-xs text-muted-foreground text-center py-3">אין קבצים מצורפים</p>;
  return (
    <div className="space-y-1">
      {attachments.map((att, idx) => (
        <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg text-xs">
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="flex-1 truncate">{att.name || "קובץ"}</span>
          <span className="text-muted-foreground">{att.fieldName}</span>
        </div>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="detail-page" />
        <RelatedRecords entityType="detail-page" />
      </div>
    </div>
  );
}

export { renderDetailValue };
