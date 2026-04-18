/**
 * Shared building blocks for all 360 pages.
 * Every 360 page must have: header+status, primary actions, related records, documents, audit log.
 */
import React from "react";

/* ── Page wrapper ── */
export function Page360({
  title, subtitle, state, children,
}: {
  title: string; subtitle?: string; state?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
        <StatusBadge state={state} />
      </header>
      {children}
    </div>
  );
}

/* ── Status badge ── */
export function StatusBadge({ state }: { state?: string }) {
  const s = state ?? "Draft";
  const colors: Record<string, string> = {
    Active: "bg-green-600/20 text-green-300 border-green-500/40",
    Open: "bg-green-600/20 text-green-300 border-green-500/40",
    InProgress: "bg-blue-600/20 text-blue-300 border-blue-500/40",
    Approved: "bg-green-600/20 text-green-300 border-green-500/40",
    Sent: "bg-yellow-600/20 text-yellow-300 border-yellow-500/40",
    Closed: "bg-gray-600/20 text-gray-300 border-gray-500/40",
    Cancelled: "bg-red-600/20 text-red-300 border-red-500/40",
    Draft: "bg-gray-600/20 text-gray-300 border-gray-500/40",
    Issued: "bg-green-600/20 text-green-300 border-green-500/40",
  };
  return (
    <span className={`px-3 py-1 rounded text-xs border ${colors[s] ?? colors.Draft}`}>
      {s}
    </span>
  );
}

/* ── KPI card ── */
export function KPI({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const colorMap: Record<string, string> = { red: "text-red-400", yellow: "text-yellow-400", green: "text-green-400" };
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color ?? ""] ?? "text-white"}`}>{value}</div>
    </div>
  );
}

/* ── Action button ── */
export function ActionBtn({ label, onClick, variant }: { label: string; onClick: () => void; variant?: "primary" | "secondary" }) {
  const cls = variant === "secondary"
    ? "px-4 py-2 border border-gray-600 hover:bg-gray-700 rounded text-sm transition-colors"
    : "px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors";
  return <button onClick={onClick} className={cls}>+ {label}</button>;
}

/* ── Section heading ── */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-700/50 pb-2">{title}</h2>
      {children}
    </section>
  );
}

/* ── Related records table ── */
export function RelatedTable({
  title, rows, cols, onRowClick, limit = 20,
}: {
  title: string;
  rows: any[];
  cols: { key: string; label: string; render?: (v: any, row: any) => React.ReactNode }[];
  onRowClick?: (r: any) => void;
  limit?: number;
}) {
  return (
    <Section title={`${title} (${rows.length})`}>
      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">אין רשומות</p>
      ) : (
        <div className="overflow-auto rounded border border-gray-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/50">
                {cols.map((c) => (
                  <th key={c.key} className="text-right px-3 py-2 text-xs text-gray-400 font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r, i) => (
                <tr
                  key={r.id ?? i}
                  onClick={() => onRowClick?.(r)}
                  className={`border-t border-gray-700/30 ${onRowClick ? "cursor-pointer hover:bg-gray-700/30" : ""}`}
                >
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-gray-200">
                      {c.render ? c.render(r[c.key], r) : (r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ── Audit log ── */
export function AuditLog({ entries }: { entries: any[] }) {
  return (
    <Section title="יומן פעילות">
      {entries.length === 0 ? (
        <p className="text-gray-500 text-sm">אין רשומות</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-auto">
          {entries.map((a) => (
            <div key={a.id} className="flex gap-3 text-xs text-gray-400 py-1 border-b border-gray-800/30">
              <span className="text-gray-500 w-32 shrink-0">{a.performed_at?.slice(0, 16)?.replace("T", " ")}</span>
              <span>{a.action_name}</span>
              <span className="mr-auto">{a.performed_by_user_name}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ── Loading / Error ── */
export function Loader({ label }: { label: string }) {
  return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse text-sm">{label}</div>;
}
export function ErrCard({ msg }: { msg: string }) {
  return <div className="p-4 bg-red-900/20 border border-red-500/40 rounded text-red-300 text-sm">שגיאה: {msg}</div>;
}
