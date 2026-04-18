import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type KPIDefinition = {
  id: number;
  kpi_code: string;
  kpi_name: string;
  category?: string | null;
  formula_type: string;
  source_ref?: string | null;
  formula_payload?: Record<string, unknown> | null;
  unit_label?: string | null;
  lower_threshold?: number | null;
  upper_threshold?: number | null;
  active: boolean;
};

type FormulaBuilderPayload = {
  definitions: KPIDefinition[];
};

async function fetchFormulaBuilder(): Promise<FormulaBuilderPayload> {
  const res = await fetch("/api/intelligence/formula-builder", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to fetch formula builder: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function saveKPIDefinition(payload: Record<string, unknown>) {
  const res = await fetch("/api/intelligence/kpi-definition/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save KPI definition");
  return res.json();
}

export const formulaBuilderQueryKey = () => ["formulaBuilder"] as const;

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="text-lg font-black text-slate-900">{title}</div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {label}
    </button>
  );
}

export default function FormulaBuilder() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: formulaBuilderQueryKey(),
    queryFn: fetchFormulaBuilder,
  });

  const saveMutation = useMutation({
    mutationFn: saveKPIDefinition,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: formulaBuilderQueryKey() });
    },
  });

  const definitions = query.data?.definitions ?? [];

  const selected = useMemo(() => {
    return definitions.find((d) => d.id === selectedId) || null;
  }, [definitions, selectedId]);

  const [form, setForm] = useState({
    id: 0,
    kpi_code: "",
    kpi_name: "",
    category: "",
    formula_type: "sql_scalar",
    source_ref: "",
    formula_payload: `{"field":"value"}`,
    unit_label: "",
    lower_threshold: "",
    upper_threshold: "",
    active: true,
  });

  React.useEffect(() => {
    if (selected) {
      setForm({
        id: selected.id,
        kpi_code: selected.kpi_code || "",
        kpi_name: selected.kpi_name || "",
        category: selected.category || "",
        formula_type: selected.formula_type || "sql_scalar",
        source_ref: selected.source_ref || "",
        formula_payload: JSON.stringify(selected.formula_payload || {}, null, 2),
        unit_label: selected.unit_label || "",
        lower_threshold: selected.lower_threshold?.toString() || "",
        upper_threshold: selected.upper_threshold?.toString() || "",
        active: selected.active,
      });
    }
  }, [selected]);

  if (query.isLoading) return <div className="p-6 text-white">Loading formula builder...</div>;
  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          Failed to load Formula Builder
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-4xl font-black text-slate-900">Formula Builder</h1>
          <div className="mt-2 text-sm text-slate-600">
            \u05D1\u05E0\u05D9\u05D9\u05EA \u05E0\u05D5\u05E1\u05D7\u05D0\u05D5\u05EA KPI, source mapping, thresholds \u05D5\u05BE calculation metadata.
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <Panel title="KPI Definitions">
            <div className="space-y-3">
              {definitions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={`w-full rounded-2xl border p-4 text-right ${
                    selectedId === d.id
                      ? "border-slate-900 bg-slate-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="font-bold text-slate-900">{d.kpi_name}</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {d.kpi_code} &bull; {d.category || "\u2014"} &bull; {d.formula_type}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            title="Definition Editor"
            right={
              <ActionButton
                label={saveMutation.isPending ? "\u05E9\u05D5\u05DE\u05E8..." : "Save Definition"}
                onClick={() =>
                  saveMutation.mutate({
                    id: form.id || null,
                    kpi_code: form.kpi_code,
                    kpi_name: form.kpi_name,
                    category: form.category,
                    formula_type: form.formula_type,
                    source_ref: form.source_ref,
                    formula_payload: JSON.parse(form.formula_payload || "{}"),
                    unit_label: form.unit_label,
                    lower_threshold: form.lower_threshold ? Number(form.lower_threshold) : null,
                    upper_threshold: form.upper_threshold ? Number(form.upper_threshold) : null,
                    active: form.active,
                  })
                }
              />
            }
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.kpi_code} onChange={(e) => setForm((p) => ({ ...p, kpi_code: e.target.value }))} placeholder="kpi_code" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.kpi_name} onChange={(e) => setForm((p) => ({ ...p, kpi_name: e.target.value }))} placeholder="kpi_name" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="category" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.formula_type} onChange={(e) => setForm((p) => ({ ...p, formula_type: e.target.value }))} placeholder="formula_type" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900 xl:col-span-2" value={form.source_ref} onChange={(e) => setForm((p) => ({ ...p, source_ref: e.target.value }))} placeholder="source_ref" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.unit_label} onChange={(e) => setForm((p) => ({ ...p, unit_label: e.target.value }))} placeholder="unit_label" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.lower_threshold} onChange={(e) => setForm((p) => ({ ...p, lower_threshold: e.target.value }))} placeholder="lower_threshold" />
              <input className="rounded-xl border border-slate-200 px-4 py-3 text-slate-900" value={form.upper_threshold} onChange={(e) => setForm((p) => ({ ...p, upper_threshold: e.target.value }))} placeholder="upper_threshold" />
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-slate-900">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
                Active
              </label>
              <textarea
                className="min-h-[320px] rounded-xl border border-slate-200 px-4 py-3 text-slate-900 xl:col-span-2"
                value={form.formula_payload}
                onChange={(e) => setForm((p) => ({ ...p, formula_payload: e.target.value }))}
                placeholder="formula_payload json"
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
