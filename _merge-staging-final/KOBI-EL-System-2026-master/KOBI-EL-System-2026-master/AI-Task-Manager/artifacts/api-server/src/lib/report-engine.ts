/**
 * BASH44 Report Engine — Dynamic Report Generation
 *
 * Features:
 * 1. Report definition with dimensions & measures
 * 2. Filter/group/sort/aggregate
 * 3. Multiple output formats (table, chart, summary)
 * 4. Scheduled report generation
 * 5. Cross-module reporting
 */

// ═══════════════════════════════════════════════════════════════
// REPORT DEFINITION
// ═══════════════════════════════════════════════════════════════
export interface ReportDefinition {
  code: string;
  name: string;
  nameHe: string;
  module: string;
  dataSource: string;
  dimensions: ReportDimension[];
  measures: ReportMeasure[];
  filters: ReportFilter[];
  sortBy: Array<{ field: string; direction: "asc" | "desc" }>;
  groupBy: string[];
  outputFormat: "table" | "chart" | "summary" | "pivot";
  schedule?: { frequency: "daily" | "weekly" | "monthly"; time: string; recipients: string[] };
}

export interface ReportDimension {
  field: string;
  label: string;
  labelHe: string;
  type: "text" | "date" | "number" | "boolean" | "enum";
  groupable: boolean;
  filterable: boolean;
}

export interface ReportMeasure {
  field: string;
  label: string;
  labelHe: string;
  aggregation: "sum" | "avg" | "count" | "min" | "max" | "countDistinct";
  format: "number" | "currency" | "percent" | "integer";
  decimals: number;
}

export interface ReportFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "notIn" | "between" | "like" | "isNull" | "isNotNull";
  value: any;
}

// ═══════════════════════════════════════════════════════════════
// REPORT EXECUTION
// ═══════════════════════════════════════════════════════════════
export interface ReportRow {
  [key: string]: any;
}

export interface ReportResult {
  reportCode: string;
  reportName: string;
  executedAt: string;
  filters: ReportFilter[];
  columns: Array<{ field: string; label: string; type: string }>;
  rows: ReportRow[];
  totals: Record<string, number>;
  groupedData?: Record<string, ReportRow[]>;
  stats: {
    totalRows: number;
    executionMs: number;
    groupCount?: number;
  };
}

export function executeReport(definition: ReportDefinition, rawData: ReportRow[]): ReportResult {
  const startTime = Date.now();

  // 1. Apply filters
  let filtered = applyFilters(rawData, definition.filters);

  // 2. Sort
  if (definition.sortBy.length > 0) {
    filtered = applySort(filtered, definition.sortBy);
  }

  // 3. Group (if needed)
  let groupedData: Record<string, ReportRow[]> | undefined;
  if (definition.groupBy.length > 0) {
    groupedData = applyGroupBy(filtered, definition.groupBy);
  }

  // 4. Calculate totals
  const totals = calculateTotals(filtered, definition.measures);

  // 5. Build columns
  const columns = [
    ...definition.dimensions.map((d) => ({ field: d.field, label: d.labelHe || d.label, type: d.type })),
    ...definition.measures.map((m) => ({ field: m.field, label: m.labelHe || m.label, type: m.format })),
  ];

  return {
    reportCode: definition.code,
    reportName: definition.nameHe || definition.name,
    executedAt: new Date().toISOString(),
    filters: definition.filters,
    columns,
    rows: filtered,
    totals,
    groupedData,
    stats: {
      totalRows: filtered.length,
      executionMs: Date.now() - startTime,
      groupCount: groupedData ? Object.keys(groupedData).length : undefined,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// FILTER ENGINE
// ═══════════════════════════════════════════════════════════════
function applyFilters(data: ReportRow[], filters: ReportFilter[]): ReportRow[] {
  return data.filter((row) => {
    return filters.every((f) => {
      const val = row[f.field];
      switch (f.operator) {
        case "eq": return val === f.value;
        case "neq": return val !== f.value;
        case "gt": return Number(val) > Number(f.value);
        case "gte": return Number(val) >= Number(f.value);
        case "lt": return Number(val) < Number(f.value);
        case "lte": return Number(val) <= Number(f.value);
        case "in": return Array.isArray(f.value) && f.value.includes(val);
        case "notIn": return Array.isArray(f.value) && !f.value.includes(val);
        case "between": return Array.isArray(f.value) && val >= f.value[0] && val <= f.value[1];
        case "like": return String(val).includes(String(f.value));
        case "isNull": return val == null || val === "";
        case "isNotNull": return val != null && val !== "";
        default: return true;
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// SORT ENGINE
// ═══════════════════════════════════════════════════════════════
function applySort(data: ReportRow[], sortBy: Array<{ field: string; direction: "asc" | "desc" }>): ReportRow[] {
  return [...data].sort((a, b) => {
    for (const s of sortBy) {
      const aVal = a[s.field];
      const bVal = b[s.field];
      if (aVal === bVal) continue;
      const cmp = aVal < bVal ? -1 : 1;
      return s.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

// ═══════════════════════════════════════════════════════════════
// GROUP BY ENGINE
// ═══════════════════════════════════════════════════════════════
function applyGroupBy(data: ReportRow[], groupBy: string[]): Record<string, ReportRow[]> {
  const groups: Record<string, ReportRow[]> = {};
  for (const row of data) {
    const key = groupBy.map((g) => String(row[g] ?? "")).join(" | ");
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups;
}

// ═══════════════════════════════════════════════════════════════
// AGGREGATION ENGINE
// ═══════════════════════════════════════════════════════════════
function calculateTotals(data: ReportRow[], measures: ReportMeasure[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const m of measures) {
    const values = data.map((r) => Number(r[m.field] || 0)).filter((v) => !isNaN(v));
    switch (m.aggregation) {
      case "sum": totals[m.field] = values.reduce((a, b) => a + b, 0); break;
      case "avg": totals[m.field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
      case "count": totals[m.field] = values.length; break;
      case "min": totals[m.field] = values.length > 0 ? Math.min(...values) : 0; break;
      case "max": totals[m.field] = values.length > 0 ? Math.max(...values) : 0; break;
      case "countDistinct": totals[m.field] = new Set(data.map((r) => r[m.field])).size; break;
    }
    totals[m.field] = Number(totals[m.field].toFixed(m.decimals));
  }
  return totals;
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN REPORT CATALOG
// ═══════════════════════════════════════════════════════════════
export const BUILT_IN_REPORTS: Partial<ReportDefinition>[] = [
  { code: "RPT_PNL", name: "Profit & Loss", nameHe: "רווח והפסד", module: "finance", dataSource: "journal_entries" },
  { code: "RPT_BS", name: "Balance Sheet", nameHe: "מאזן", module: "finance", dataSource: "gl_accounts" },
  { code: "RPT_TB", name: "Trial Balance", nameHe: "מאזן בוחן", module: "finance", dataSource: "journal_entries" },
  { code: "RPT_AP_AGING", name: "AP Aging", nameHe: "גיול ספקים", module: "finance", dataSource: "ap_invoices" },
  { code: "RPT_AR_AGING", name: "AR Aging", nameHe: "גיול לקוחות", module: "finance", dataSource: "ar_invoices" },
  { code: "RPT_CASHFLOW", name: "Cash Flow", nameHe: "תזרים מזומנים", module: "finance", dataSource: "payments" },
  { code: "RPT_INV_VAL", name: "Inventory Valuation", nameHe: "שווי מלאי", module: "inventory", dataSource: "stock_balances" },
  { code: "RPT_INV_MOVE", name: "Inventory Movements", nameHe: "תנועות מלאי", module: "inventory", dataSource: "inventory_transactions" },
  { code: "RPT_PO_STATUS", name: "PO Status", nameHe: "סטטוס הזמנות רכש", module: "procurement", dataSource: "purchase_orders" },
  { code: "RPT_VENDOR_PERF", name: "Vendor Performance", nameHe: "ביצועי ספקים", module: "procurement", dataSource: "suppliers" },
  { code: "RPT_PROJ_MARGIN", name: "Project Margin", nameHe: "רווחיות פרויקטים", module: "projects", dataSource: "projects" },
  { code: "RPT_PROJ_BUDGET", name: "Budget vs Actual", nameHe: "תקציב מול ביצוע", module: "projects", dataSource: "project_budgets" },
  { code: "RPT_WO_STATUS", name: "Work Order Status", nameHe: "סטטוס פקודות עבודה", module: "production", dataSource: "work_orders" },
  { code: "RPT_PROD_COST", name: "Production Cost", nameHe: "עלות ייצור", module: "production", dataSource: "work_order_costs" },
  { code: "RPT_OEE", name: "OEE Report", nameHe: 'דו"ח OEE', module: "production", dataSource: "production_lines" },
  { code: "RPT_SALES", name: "Sales Summary", nameHe: "סיכום מכירות", module: "sales", dataSource: "sales_orders" },
  { code: "RPT_CEO", name: "Executive Dashboard", nameHe: "דשבורד מנכ\"ל", module: "executive", dataSource: "kpis" },
  { code: "RPT_HR", name: "Workforce Report", nameHe: 'דו"ח כוח אדם', module: "hr", dataSource: "employees" },
];

// ═══════════════════════════════════════════════════════════════
// PIVOT TABLE
// ═══════════════════════════════════════════════════════════════
export function createPivotTable(
  data: ReportRow[],
  rowField: string,
  columnField: string,
  valueField: string,
  aggregation: "sum" | "avg" | "count" = "sum"
): { rows: string[]; columns: string[]; values: number[][] } {
  const rowValues = [...new Set(data.map((r) => String(r[rowField])))].sort();
  const colValues = [...new Set(data.map((r) => String(r[columnField])))].sort();

  const matrix: number[][] = rowValues.map(() => colValues.map(() => 0));
  const counts: number[][] = rowValues.map(() => colValues.map(() => 0));

  for (const row of data) {
    const ri = rowValues.indexOf(String(row[rowField]));
    const ci = colValues.indexOf(String(row[columnField]));
    if (ri >= 0 && ci >= 0) {
      matrix[ri][ci] += Number(row[valueField] || 0);
      counts[ri][ci]++;
    }
  }

  if (aggregation === "avg") {
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        matrix[i][j] = counts[i][j] > 0 ? Number((matrix[i][j] / counts[i][j]).toFixed(2)) : 0;
      }
    }
  } else if (aggregation === "count") {
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        matrix[i][j] = counts[i][j];
      }
    }
  }

  return { rows: rowValues, columns: colValues, values: matrix };
}
