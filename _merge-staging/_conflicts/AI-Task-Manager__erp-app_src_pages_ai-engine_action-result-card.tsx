import { memo, useState, useEffect } from "react";
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle, Copy } from "lucide-react";
import { ACTION_LABELS } from "./action-labels";

export interface ActionResult {
  actionType: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs?: number;
  resolvedInfo?: Record<string, any>;
  suggestions?: string[];
}

function getResultSummary(r: ActionResult): string | null {
  if (!r.result) return null;
  if (r.result.rowCount !== undefined) return `${r.result.rowCount} שורות`;
  if (r.result.id) return `ID: ${r.result.id}`;
  if (r.result.created !== undefined) return `${r.result.created} נוצרו`;
  if (r.result.count !== undefined) return `${r.result.count} רשומות`;
  if (r.result.table) return `${r.result.columns?.length || 0} עמודות, ${r.result.totalRows} שורות`;
  if (r.result.updated !== undefined && r.result.failed !== undefined) return `${r.result.updated} עודכנו, ${r.result.failed} נכשלו`;
  if (r.result.deleted !== undefined && r.result.failed !== undefined) return `${r.result.deleted} נמחקו, ${r.result.failed} נכשלו`;
  if (r.result.format === "csv") return `CSV: ${r.result.rowCount} שורות`;
  if (r.result.format === "json") return `JSON: ${r.result.rowCount} רשומות`;
  if (r.result.db_size) return `DB: ${r.result.db_size}, ${r.result.totalRows} שורות`;
  if (r.result.fieldCount !== undefined) return `${r.result.fieldCount} שדות, ${r.result.totalRecords || 0} רשומות`;
  if (r.result.valid !== undefined) return r.result.valid ? "✅ תקין" : `⚠️ ${r.result.issueCount} בעיות`;
  if (r.result.commonFields) return `${r.result.commonFields.length} שדות משותפים`;
  if (r.result.uptimeHuman) return `⏱ ${r.result.uptimeHuman}, ${r.result.memory?.heapUsedMB}MB`;
  if (r.result.entity) return `${r.result.entity.nameHe || r.result.entity.name}: ${r.result.fieldCount} שדות`;
  if (r.result.totalMatches !== undefined) return `${r.result.totalMatches} תוצאות ב-${r.result.matches?.length || 0} ישויות`;
  if (r.result.copiedFields !== undefined) return `שוכפל: ${r.result.copiedFields} שדות → ID: ${r.result.newEntityId}`;
  if (r.result.totalRelations !== undefined) return `${r.result.outgoing?.length || 0} יוצאים, ${r.result.incoming?.length || 0} נכנסים`;
  if (r.result.schema) return `${r.result.moduleCount} מודולים, ${r.result.entityCount} ישויות`;
  if (r.result.transferred !== undefined) return `${r.result.transferred} הועברו, ${r.result.failed} נכשלו`;
  if (r.result.fillRate !== undefined) return `${r.result.filled}/${r.result.total} מלאים (${r.result.fillRate})`;
  if (r.result.entries !== undefined && r.result.count !== undefined && r.actionType === "audit_log") return `${r.result.count} רשומות שינוי`;
  if (r.result.score !== undefined && r.result.db) return `${r.result.score === "excellent" ? "🟢" : r.result.score === "good" ? "🟡" : "🔴"} ${r.result.score} — DB: ${r.result.db.connectionMs}ms`;
  if (r.result.overallScore !== undefined) return `ציון כולל: ${r.result.overallScore}%, ${r.result.entitiesChecked} ישויות`;
  if (r.result.suggestions && r.result.emptyEntities !== undefined) return `${r.result.suggestions.length} הצעות`;
  if (r.result.company) return `${r.result.company} — ${Object.keys(r.result.counts || {}).length} ספירות`;
  if (r.result.summary && typeof r.result.summary === "string") return r.result.summary.slice(0, 60);
  if (r.result.modules && Array.isArray(r.result.modules)) return `${r.result.modules.length} מודולים`;
  if (r.result.entities && Array.isArray(r.result.entities)) return `${r.result.entities.length} ישויות`;
  if (r.result.agents && Array.isArray(r.result.agents)) return `${r.result.agents.length} סוכנים`;
  if (r.result.records && Array.isArray(r.result.records)) return `${r.result.records.length} רשומות`;
  if (r.result.success === true && r.result.message) return r.result.message;
  if (r.result.output) return r.result.output.slice(0, 80);
  if (r.result.content) return `${r.result.lines || ""} שורות`;
  if (Array.isArray(r.result)) return `${r.result.length} תוצאות`;
  return null;
}

function ExpandedContent({ r }: { r: ActionResult }) {
  if (!r.result) return null;

  if (r.result.rows && Array.isArray(r.result.rows) && r.result.rows.length > 0) {
    return (
      <div className="overflow-x-auto max-h-[250px] overflow-y-auto rounded border border-border">
        <table className="w-full text-[10px] font-mono">
          <thead className="bg-background/80 sticky top-0">
            <tr>{Object.keys(r.result.rows[0]).map((h, hi) => <th key={hi} className="px-2 py-1 text-right text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {r.result.rows.slice(0, 50).map((row: any, ri: number) => (
              <tr key={ri} className={ri % 2 === 0 ? "bg-black/20" : "bg-black/10"}>
                {Object.values(row).map((v: any, vi) => <td key={vi} className="px-2 py-0.5 text-gray-300 border-b border-border/50 whitespace-nowrap max-w-[200px] truncate">{String(v ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {r.result.rows.length > 50 && <div className="text-[9px] text-muted-foreground text-center py-1">+ {r.result.rows.length - 50} עוד...</div>}
      </div>
    );
  }

  if (r.result.fields && Array.isArray(r.result.fields) && r.result.fields.length > 0) {
    return (
      <div className="overflow-x-auto max-h-[250px] overflow-y-auto rounded border border-border">
        <table className="w-full text-[10px] font-mono">
          <thead className="bg-background/80 sticky top-0">
            <tr><th className="px-2 py-1 text-right text-muted-foreground border-b border-border">שם</th><th className="px-2 py-1 text-right text-muted-foreground border-b border-border">סוג</th><th className="px-2 py-1 text-right text-muted-foreground border-b border-border">חובה</th></tr>
          </thead>
          <tbody>
            {r.result.fields.map((f: any, fi: number) => (
              <tr key={fi} className={fi % 2 === 0 ? "bg-black/20" : "bg-black/10"}>
                <td className="px-2 py-0.5 text-gray-300 border-b border-border/50">{f.name || f.slug}</td>
                <td className="px-2 py-0.5 text-cyan-400 border-b border-border/50">{f.type || f.fieldType}</td>
                <td className="px-2 py-0.5 border-b border-border/50">{f.required ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (r.result.issues && Array.isArray(r.result.issues) && r.result.issues.length > 0) {
    return (
      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
        {r.result.issues.map((issue: string, ii: number) => (
          <div key={ii} className="text-[10px] text-amber-400 bg-amber-500/5 rounded px-2 py-0.5 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />{issue}
          </div>
        ))}
      </div>
    );
  }

  if (r.result.csv) {
    return (
      <div className="relative">
        <pre className="text-[10px] text-muted-foreground bg-black/30 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono">{r.result.csv}</pre>
        <button onClick={() => navigator.clipboard.writeText(r.result.csv)} className="absolute top-1 left-1 text-[9px] bg-muted text-gray-300 px-1.5 py-0.5 rounded hover:bg-muted">
          <Copy className="w-2.5 h-2.5 inline mr-0.5" />העתק
        </button>
      </div>
    );
  }

  if (r.result.score && r.result.db) {
    return (
      <div className="space-y-2 text-[10px]">
        <div className="flex items-center gap-2">
          <span className={`text-lg ${r.result.score === "excellent" ? "text-green-400" : r.result.score === "good" ? "text-yellow-400" : "text-red-400"}`}>
            {r.result.score === "excellent" ? "🟢" : r.result.score === "good" ? "🟡" : "🔴"}
          </span>
          <span className="text-foreground font-medium">{r.result.score.toUpperCase()}</span>
          <span className="text-muted-foreground">({r.result.totalMs}ms total)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/30 rounded p-2"><div className="text-muted-foreground">DB Connection</div><div className="text-cyan-400 font-mono">{r.result.db.connectionMs}ms</div></div>
          <div className="bg-black/30 rounded p-2"><div className="text-muted-foreground">DB Read</div><div className="text-cyan-400 font-mono">{r.result.db.readMs}ms</div></div>
          <div className="bg-black/30 rounded p-2"><div className="text-muted-foreground">Complex Query</div><div className="text-cyan-400 font-mono">{r.result.db.complexQueryMs}ms</div></div>
          <div className="bg-black/30 rounded p-2"><div className="text-muted-foreground">API Latency</div><div className="text-cyan-400 font-mono">{r.result.api.latencyMs}ms</div></div>
        </div>
        {r.result.recommendations && <div className="text-muted-foreground bg-black/20 rounded p-1.5">{r.result.recommendations.join(" | ")}</div>}
      </div>
    );
  }

  if (r.result.overallScore !== undefined && r.result.details) {
    return (
      <div className="space-y-2 text-[10px]">
        <div className="flex items-center gap-2">
          <span className={`text-lg ${r.result.overallScore >= 80 ? "text-green-400" : r.result.overallScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
            {r.result.overallScore >= 80 ? "🟢" : r.result.overallScore >= 50 ? "🟡" : "🔴"}
          </span>
          <span className="text-foreground font-medium">ציון כולל: {r.result.overallScore}%</span>
          <span className="text-muted-foreground">({r.result.entitiesChecked} ישויות נבדקו)</span>
        </div>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {r.result.details.slice(0, 15).map((d: any, di: number) => (
            <div key={di} className="flex items-center gap-2 bg-black/20 rounded px-2 py-1">
              <span className="text-gray-300 w-24 truncate">{d.name}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${d.qualityScore >= 80 ? "bg-green-500" : d.qualityScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${d.qualityScore}%` }} />
              </div>
              <span className="text-muted-foreground w-8 text-left">{d.qualityScore}%</span>
              <span className="text-muted-foreground w-12">{d.recordCount} rec</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (r.result.distribution && Array.isArray(r.result.distribution)) {
    return (
      <div className="space-y-2 text-[10px]">
        <div className="grid grid-cols-3 gap-2">
          {r.result.total !== undefined && <div className="bg-black/30 rounded p-1.5"><div className="text-muted-foreground">סה"כ</div><div className="text-foreground font-mono">{r.result.total}</div></div>}
          {r.result.filled !== undefined && <div className="bg-black/30 rounded p-1.5"><div className="text-muted-foreground">מלאים</div><div className="text-green-400 font-mono">{r.result.filled}</div></div>}
          {r.result.fillRate && <div className="bg-black/30 rounded p-1.5"><div className="text-muted-foreground">אחוז מילוי</div><div className="text-cyan-400 font-mono">{r.result.fillRate}</div></div>}
          {r.result.min !== undefined && <div className="bg-black/30 rounded p-1.5"><div className="text-muted-foreground">מינימום</div><div className="text-foreground font-mono">{r.result.min}</div></div>}
          {r.result.max !== undefined && <div className="bg-black/30 rounded p-1.5"><div className="text-muted-foreground">מקסימום</div><div className="text-foreground font-mono">{r.result.max}</div></div>}
          {r.result.avg !== undefined && <div className="bg-black/30 rounded p-1.5"><div className="text-muted-foreground">ממוצע</div><div className="text-foreground font-mono">{r.result.avg}</div></div>}
        </div>
        <div className="space-y-0.5 max-h-[150px] overflow-y-auto">
          {r.result.distribution.map((d: any, di: number) => (
            <div key={di} className="flex items-center gap-2 bg-black/20 rounded px-2 py-0.5">
              <span className="text-gray-300 w-20 truncate">{d.value}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(d.count / r.result.distribution[0].count) * 100}%` }} />
              </div>
              <span className="text-muted-foreground w-6 text-left">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (r.result.suggestions && r.result.emptyEntities !== undefined) {
    return (
      <div className="space-y-1 text-[10px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-green-400">{r.result.populatedEntities} עם נתונים</span>
          <span className="text-red-400">{r.result.emptyEntities} ריקים</span>
        </div>
        {r.result.suggestions.map((s: string, si: number) => (
          <div key={si} className="bg-yellow-500/5 border border-yellow-500/20 rounded px-2 py-1 text-yellow-300 flex items-center gap-1.5">
            <span>💡</span>{s}
          </div>
        ))}
      </div>
    );
  }

  if (r.result.entries && Array.isArray(r.result.entries) && r.result.entries.length > 0) {
    return (
      <div className="overflow-x-auto max-h-[250px] overflow-y-auto rounded border border-border">
        <table className="w-full text-[10px] font-mono">
          <thead className="bg-background/80 sticky top-0">
            <tr>
              <th className="px-2 py-1 text-right text-muted-foreground border-b border-border">פעולה</th>
              <th className="px-2 py-1 text-right text-muted-foreground border-b border-border">טבלה</th>
              <th className="px-2 py-1 text-right text-muted-foreground border-b border-border">רשומה</th>
              <th className="px-2 py-1 text-right text-muted-foreground border-b border-border">זמן</th>
            </tr>
          </thead>
          <tbody>
            {r.result.entries.map((e: any, ei: number) => (
              <tr key={ei} className={ei % 2 === 0 ? "bg-black/20" : "bg-black/10"}>
                <td className="px-2 py-0.5 border-b border-border/50">
                  <span className={`px-1 py-0.5 rounded text-[9px] ${e.operation === "INSERT" ? "bg-green-500/20 text-green-400" : e.operation === "UPDATE" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}`}>{e.operation}</span>
                </td>
                <td className="px-2 py-0.5 text-gray-300 border-b border-border/50">{e.table_name}</td>
                <td className="px-2 py-0.5 text-muted-foreground border-b border-border/50">#{e.record_id}</td>
                <td className="px-2 py-0.5 text-muted-foreground border-b border-border/50">{new Date(e.created_at).toLocaleString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (r.result.transferred !== undefined && r.result.details) {
    return (
      <div className="space-y-1 text-[10px]">
        <div className="flex items-center gap-3">
          <span className="text-green-400">{r.result.transferred} הועברו בהצלחה</span>
          {r.result.failed > 0 && <span className="text-red-400">{r.result.failed} נכשלו</span>}
        </div>
        <div className="space-y-0.5 max-h-[150px] overflow-y-auto">
          {r.result.details.map((d: any, di: number) => (
            <div key={di} className={`flex items-center gap-2 rounded px-2 py-0.5 ${d.success ? "bg-green-500/5" : "bg-red-500/5"}`}>
              <span>{d.success ? "✅" : "❌"}</span>
              <span className="text-muted-foreground">#{d.sourceId}</span>
              {d.newId && <span className="text-cyan-400">→ #{d.newId}</span>}
              {d.error && <span className="text-red-400 text-[9px]">{d.error}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (r.result.outgoing && r.result.incoming) {
    return (
      <div className="space-y-2 text-[10px]">
        <div className="text-muted-foreground">סה"כ {r.result.totalRelations} קשרים</div>
        {r.result.outgoing.length > 0 && (
          <div>
            <div className="text-cyan-400 mb-1">קשרים יוצאים ({r.result.outgoing.length}):</div>
            <div className="space-y-0.5">
              {r.result.outgoing.map((rel: any, ri: number) => (
                <div key={ri} className="flex items-center gap-2 bg-cyan-500/5 rounded px-2 py-0.5">
                  <span className="text-cyan-400">→</span>
                  <span className="text-foreground">{rel.fieldName || rel.slug}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-green-400">{rel.targetName || `Entity#${rel.targetEntityId}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {r.result.incoming.length > 0 && (
          <div>
            <div className="text-orange-400 mb-1">קשרים נכנסים ({r.result.incoming.length}):</div>
            <div className="space-y-0.5">
              {r.result.incoming.map((rel: any, ri: number) => (
                <div key={ri} className="flex items-center gap-2 bg-orange-500/5 rounded px-2 py-0.5">
                  <span className="text-orange-400">←</span>
                  <span className="text-foreground">{rel.sourceName || `Entity#${rel.sourceEntityId}`}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-gray-300">{rel.fieldName || rel.slug}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <pre className="text-[10px] text-muted-foreground bg-black/30 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono">
      {JSON.stringify(r.result, null, 2).slice(0, 3000)}
    </pre>
  );
}

interface ActionResultCardProps {
  r: ActionResult;
  index: number;
  isLast: boolean;
  onSuggestionClick?: (text: string) => void;
}

const ActionResultCard = memo(function ActionResultCard({ r, index, isLast, onSuggestionClick }: ActionResultCardProps) {
  const info = ACTION_LABELS[r.actionType] || { label: r.actionType, icon: "⚙️", color: "text-muted-foreground" };
  const [expanded, setExpanded] = useState(isLast);
  const resultSummary = getResultSummary(r);

  useEffect(() => {
    if (!isLast) setExpanded(false);
  }, [isLast]);

  return (
    <div className={`rounded-lg border p-2.5 transition-all ${r.success ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50" : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{info.icon}</span>
          <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
          {r.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
          {resultSummary && <span className="text-[10px] bg-card/5 text-gray-300 px-1.5 py-0.5 rounded">{resultSummary}</span>}
          {r.durationMs !== undefined && <span className="text-[10px] text-muted-foreground">{r.durationMs}ms</span>}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground p-0.5">
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {r.resolvedInfo && Object.keys(r.resolvedInfo).length > 0 && (
        <div className="mt-1 flex gap-2 flex-wrap">
          {Object.entries(r.resolvedInfo).map(([k, v]) => (
            <span key={k} className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
      {r.error && <div className="mt-1.5 text-[11px] text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{typeof r.error === "string" ? r.error : JSON.stringify(r.error)}</div>}
      {expanded && r.result && (
        <div className="mt-2">
          <ExpandedContent r={r} />
        </div>
      )}
      {r.suggestions && r.suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.suggestions.map((s, si) => (
            <button key={si} onClick={() => onSuggestionClick?.(s)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default ActionResultCard;
