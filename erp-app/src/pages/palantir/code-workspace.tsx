import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileCode2, Folder, FolderOpen, Database, Play, Square, RotateCcw,
  Save, Share2, Download, Upload, Plus, Trash2, Copy, Code2,
  FileText, Terminal, BarChart3, Table as TableIcon, ChevronRight,
  ChevronDown, Cpu, HardDrive, Clock, CheckCircle2, Circle,
  Settings, BookOpen, Zap, Activity, GitBranch, ArrowUpRight,
  Layers, Maximize2, Eye, EyeOff, AlertCircle, Sparkles, FileSearch,
} from "lucide-react";

type CellType = "code" | "markdown" | "sql";
type CellLang = "python" | "sql" | "markdown";
type OutputType = "table" | "text" | "chart" | "dataframe" | "error" | "none";
type KernelStatus = "idle" | "busy" | "running" | "dead";

interface NotebookCell {
  id: string;
  type: CellType;
  lang: CellLang;
  executionCount: number | null;
  source: string;
  outputType: OutputType;
  output?: any;
  duration?: number;
  executed?: boolean;
  collapsed?: boolean;
}

interface NotebookFile {
  id: string;
  name: string;
  type: "notebook" | "folder" | "python" | "sql" | "markdown";
  children?: NotebookFile[];
  open?: boolean;
  active?: boolean;
}

interface Dataset {
  rid: string;
  name: string;
  path: string;
  rows: number;
  cols: number;
  size: string;
  lastUpdated: string;
  owner: string;
}

interface Variable {
  name: string;
  type: string;
  shape?: string;
  size: string;
  preview: string;
}

const MOCK_FILES: NotebookFile[] = [
  {
    id: "f1", name: "Customer Analytics", type: "folder", open: true, children: [
      { id: "f1-1", name: "customer_segmentation.ipynb", type: "notebook", active: true },
      { id: "f1-2", name: "churn_analysis.ipynb", type: "notebook" },
      { id: "f1-3", name: "ltv_model.ipynb", type: "notebook" },
      { id: "f1-4", name: "rfm_scoring.py", type: "python" },
    ],
  },
  {
    id: "f2", name: "Finance Reports", type: "folder", open: true, children: [
      { id: "f2-1", name: "monthly_close.ipynb", type: "notebook" },
      { id: "f2-2", name: "cashflow_forecast.ipynb", type: "notebook" },
      { id: "f2-3", name: "ap_aging.sql", type: "sql" },
      { id: "f2-4", name: "revenue_analysis.ipynb", type: "notebook" },
    ],
  },
  {
    id: "f3", name: "Supply Chain", type: "folder", open: false, children: [
      { id: "f3-1", name: "inventory_optimization.ipynb", type: "notebook" },
      { id: "f3-2", name: "supplier_performance.ipynb", type: "notebook" },
      { id: "f3-3", name: "demand_forecast.py", type: "python" },
    ],
  },
  {
    id: "f4", name: "Data Prep", type: "folder", open: false, children: [
      { id: "f4-1", name: "etl_pipeline.ipynb", type: "notebook" },
      { id: "f4-2", name: "data_validation.ipynb", type: "notebook" },
      { id: "f4-3", name: "cleansing_rules.sql", type: "sql" },
    ],
  },
  { id: "f5", name: "README.md", type: "markdown" },
  { id: "f6", name: "requirements.txt", type: "python" },
];

const MOCK_DATASETS: Dataset[] = [
  { rid: "ri.foundry.main.dataset.01", name: "customers_cleaned", path: "/ontology/customers", rows: 45890, cols: 27, size: "12.4 MB", lastUpdated: "2026-04-10 08:30", owner: "data-team" },
  { rid: "ri.foundry.main.dataset.02", name: "orders_enriched", path: "/ontology/orders", rows: 127450, cols: 34, size: "48.7 MB", lastUpdated: "2026-04-10 09:15", owner: "data-team" },
  { rid: "ri.foundry.main.dataset.03", name: "products_master", path: "/ontology/products", rows: 8920, cols: 19, size: "3.2 MB", lastUpdated: "2026-04-09 22:00", owner: "product-team" },
  { rid: "ri.foundry.main.dataset.04", name: "invoice_history", path: "/finance/invoices", rows: 98340, cols: 22, size: "31.5 MB", lastUpdated: "2026-04-10 07:45", owner: "finance-team" },
  { rid: "ri.foundry.main.dataset.05", name: "payments_ledger", path: "/finance/payments", rows: 76580, cols: 15, size: "18.9 MB", lastUpdated: "2026-04-10 07:50", owner: "finance-team" },
  { rid: "ri.foundry.main.dataset.06", name: "inventory_snapshot", path: "/supply/inventory", rows: 34120, cols: 18, size: "9.8 MB", lastUpdated: "2026-04-10 06:00", owner: "supply-team" },
];

const MOCK_VARIABLES: Variable[] = [
  { name: "df_customers", type: "DataFrame", shape: "(45890, 27)", size: "12.4 MB", preview: "customer_id | name | segment ..." },
  { name: "df_orders", type: "DataFrame", shape: "(127450, 34)", size: "48.7 MB", preview: "order_id | customer_id | total ..." },
  { name: "top_customers", type: "DataFrame", shape: "(100, 5)", size: "0.1 MB", preview: "name | total_spent | segment ..." },
  { name: "segment_counts", type: "Series", shape: "(5,)", size: "0.0 MB", preview: "Enterprise 1847\nSMB 18290 ..." },
  { name: "revenue_by_month", type: "DataFrame", shape: "(24, 3)", size: "0.0 MB", preview: "month | revenue | growth ..." },
  { name: "ltv_model", type: "RandomForestRegressor", size: "2.8 MB", preview: "n_estimators=100, max_depth=8" },
  { name: "churn_rate", type: "float64", size: "8 B", preview: "0.0847" },
  { name: "n_clusters", type: "int", size: "28 B", preview: "5" },
];

const CELL_1_OUTPUT = [
  { customer_id: "C-1001", name: "תעש ישראל", segment: "Enterprise", total_spent: 4890000, orders: 127 },
  { customer_id: "C-1042", name: "אלקטרה בע\"מ", segment: "Enterprise", total_spent: 3240000, orders: 98 },
  { customer_id: "C-1118", name: "טבע תעשיות", segment: "Enterprise", total_spent: 2980000, orders: 84 },
  { customer_id: "C-1203", name: "אסם השקעות", segment: "Enterprise", total_spent: 2450000, orders: 72 },
  { customer_id: "C-1267", name: "בזק ישראל", segment: "Enterprise", total_spent: 2120000, orders: 68 },
  { customer_id: "C-1345", name: "שטראוס גרופ", segment: "Enterprise", total_spent: 1890000, orders: 61 },
];

const CELL_5_OUTPUT = [
  { segment: "Enterprise", customers: 1847, revenue: 28940000, avg_order: 15680 },
  { segment: "Mid-Market", customers: 5420, revenue: 18450000, avg_order: 3405 },
  { segment: "SMB", customers: 18290, revenue: 9840000, avg_order: 538 },
  { segment: "Startup", customers: 12840, revenue: 4120000, avg_order: 321 },
  { segment: "Individual", customers: 7493, revenue: 980000, avg_order: 131 },
];

const MOCK_CELLS: NotebookCell[] = [
  {
    id: "c1",
    type: "code",
    lang: "sql",
    executionCount: 1,
    source: `-- טעינת נתוני לקוחות מהאונטולוגיה
SELECT
  customer_id,
  name,
  segment,
  SUM(total) AS total_spent,
  COUNT(*) AS orders
FROM \`/ontology/customers\` c
JOIN \`/ontology/orders\` o ON c.customer_id = o.customer_id
WHERE o.created_at >= '2025-01-01'
GROUP BY customer_id, name, segment
ORDER BY total_spent DESC
LIMIT 100;`,
    outputType: "table",
    output: CELL_1_OUTPUT,
    duration: 847,
    executed: true,
  },
  {
    id: "c2",
    type: "markdown",
    lang: "markdown",
    executionCount: null,
    source: `# ניתוח לקוחות — סגמנטציה RFM

מחברת זו מבצעת סגמנטציה של לקוחות באמצעות מודל **RFM** (Recency, Frequency, Monetary).

## שלבי עיבוד:
1. טעינת נתונים מהאונטולוגיה
2. ניקוי וטרנספורמציה של הנתונים
3. חישוב מדדי RFM
4. סגמנטציה והפקת ויזואליזציות
5. כתיבת תוצאות חזרה ל-Ontology`,
    outputType: "none",
    executed: true,
  },
  {
    id: "c3",
    type: "code",
    lang: "python",
    executionCount: 2,
    source: `import pandas as pd
import numpy as np
from foundry.transforms import Input, Output
from palantir.ontology import ontology

# טעינת הנתונים ל-DataFrame
df_customers = _.to_pandas()

# ניקוי נתונים
df_customers['name'] = df_customers['name'].str.strip()
df_customers = df_customers.dropna(subset=['customer_id', 'total_spent'])
df_customers['segment'] = df_customers['segment'].fillna('Unknown')

# המרת סוגי נתונים
df_customers['total_spent'] = df_customers['total_spent'].astype('float64')
df_customers['orders'] = df_customers['orders'].astype('int32')

print(f"Cleaned DataFrame: {df_customers.shape}")
print(f"Unique segments: {df_customers['segment'].nunique()}")
df_customers.info()`,
    outputType: "text",
    output: `Cleaned DataFrame: (45890, 27)
Unique segments: 5
<class 'pandas.core.frame.DataFrame'>
RangeIndex: 45890 entries, 0 to 45889
Data columns (total 27 columns):
 #   Column          Non-Null Count  Dtype
---  ------          --------------  -----
 0   customer_id     45890 non-null  object
 1   name            45890 non-null  object
 2   segment         45890 non-null  object
 3   total_spent     45890 non-null  float64
 4   orders          45890 non-null  int32
dtypes: float64(1), int32(1), object(25)
memory usage: 12.4+ MB`,
    duration: 412,
    executed: true,
  },
  {
    id: "c4",
    type: "code",
    lang: "python",
    executionCount: 3,
    source: `import matplotlib.pyplot as plt
import seaborn as sns

# חלוקה לסגמנטים לפי total_spent
df_customers['rfm_score'] = (
    df_customers['recency_days'].rank(pct=True) * 0.3 +
    df_customers['frequency'].rank(pct=True) * 0.3 +
    df_customers['total_spent'].rank(pct=True) * 0.4
)

# ויזואליזציה
fig, ax = plt.subplots(figsize=(12, 6))
sns.histplot(df_customers['rfm_score'], bins=50, kde=True, ax=ax, color='#6366f1')
ax.set_title('התפלגות ציוני RFM', fontsize=14)
ax.set_xlabel('RFM Score')
ax.set_ylabel('מספר לקוחות')
plt.tight_layout()
plt.show()`,
    outputType: "chart",
    output: "histogram",
    duration: 1284,
    executed: true,
  },
  {
    id: "c5",
    type: "code",
    lang: "sql",
    executionCount: 4,
    source: `-- אגרגציה לפי סגמנט
SELECT
  segment,
  COUNT(*) AS customers,
  SUM(total_spent) AS revenue,
  AVG(total_spent) AS avg_order
FROM df_customers
GROUP BY segment
ORDER BY revenue DESC;`,
    outputType: "dataframe",
    output: CELL_5_OUTPUT,
    duration: 234,
    executed: true,
  },
  {
    id: "c6",
    type: "markdown",
    lang: "markdown",
    executionCount: null,
    source: `## תוצאות

המודל זיהה **5 סגמנטים ברורים** של לקוחות. סגמנט ה-**Enterprise** (4% מהלקוחות) אחראי ל-**47%** מההכנסות.

> **המלצה:** להפנות מאמצי שימור מוגברים לסגמנט Enterprise ולבנות תוכנית חידוש ייעודית ל-Mid-Market.`,
    outputType: "none",
    executed: true,
  },
  {
    id: "c7",
    type: "code",
    lang: "python",
    executionCount: 5,
    source: `# אימון מודל LTV
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error

X = df_customers[['recency_days', 'frequency', 'total_spent', 'segment_encoded']]
y = df_customers['ltv_12m']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

ltv_model = RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42)
ltv_model.fit(X_train, y_train)

pred = ltv_model.predict(X_test)
print(f"R² Score: {r2_score(y_test, pred):.4f}")
print(f"MAE: {mean_absolute_error(y_test, pred):.2f}")`,
    outputType: "text",
    output: `R² Score: 0.8947
MAE: 1243.50

Model trained successfully.
Feature importances:
  total_spent: 0.4281
  frequency:   0.2847
  recency_days: 0.1924
  segment:     0.0948`,
    duration: 3847,
    executed: true,
  },
  {
    id: "c8",
    type: "code",
    lang: "python",
    executionCount: 6,
    source: `# כתיבת תוצאות חזרה לאונטולוגיה
output_df = df_customers[['customer_id', 'segment', 'rfm_score', 'ltv_12m']]

# Writeback ל-Ontology
ontology.customers.update_batch(
    records=output_df.to_dict('records'),
    action='enrichCustomerSegmentation'
)

print(f"Wrote {len(output_df)} records to ontology.customers")
print("Pipeline complete ✓")`,
    outputType: "text",
    output: `Wrote 45890 records to ontology.customers
Pipeline complete ✓

Ontology refresh triggered.
Downstream objects updated: 12
Materialized views refreshed: 3`,
    duration: 2891,
    executed: true,
  },
];

const getFileIcon = (type: string) => {
  if (type === "folder") return Folder;
  if (type === "notebook") return BookOpen;
  if (type === "python") return FileCode2;
  if (type === "sql") return Database;
  return FileText;
};

const getFileColor = (type: string) => {
  if (type === "folder") return "text-amber-400";
  if (type === "notebook") return "text-blue-400";
  if (type === "python") return "text-yellow-400";
  if (type === "sql") return "text-purple-400";
  return "text-gray-400";
};

export default function CodeWorkspace() {
  const [activeCellId, setActiveCellId] = useState<string>("c1");
  const [showDatasetPreview, setShowDatasetPreview] = useState<boolean>(true);
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("idle");
  const [selectedKernel, setSelectedKernel] = useState<string>("python3-foundry");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    f1: true, f2: true, f3: false, f4: false,
  });

  const { data } = useQuery({
    queryKey: ["palantir-code-workspace"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/code-workspace");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return {
          files: MOCK_FILES,
          datasets: MOCK_DATASETS,
          cells: MOCK_CELLS,
          variables: MOCK_VARIABLES,
        };
      }
    },
  });

  const files: NotebookFile[] = data?.files || MOCK_FILES;
  const datasets: Dataset[] = data?.datasets || MOCK_DATASETS;
  const cells: NotebookCell[] = data?.cells || MOCK_CELLS;
  const variables: Variable[] = data?.variables || MOCK_VARIABLES;

  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));

  const executedCount = cells.filter((c) => c.executed && c.executionCount !== null).length;
  const totalDuration = cells.reduce((sum, c) => sum + (c.duration || 0), 0);

  const renderFileTree = (items: NotebookFile[], depth = 0) => {
    return items.map((item) => {
      const Icon = getFileIcon(item.type);
      const color = getFileColor(item.type);
      const isFolder = item.type === "folder";
      const isExpanded = expandedFolders[item.id];
      return (
        <div key={item.id}>
          <div
            onClick={() => isFolder && toggleFolder(item.id)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#1f2937] cursor-pointer text-xs ${
              item.active ? "bg-blue-500/10 border-l-2 border-blue-500" : ""
            }`}
            style={{ paddingRight: `${depth * 12 + 8}px` }}
          >
            {isFolder ? (
              isExpanded ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />
            ) : (
              <span className="w-3" />
            )}
            {isFolder && isExpanded ? (
              <FolderOpen className={`h-3.5 w-3.5 ${color}`} />
            ) : (
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            )}
            <span className={`${item.active ? "text-white font-medium" : "text-gray-300"}`}>
              {item.name}
            </span>
          </div>
          {isFolder && isExpanded && item.children && (
            <div>{renderFileTree(item.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const renderCellOutput = (cell: NotebookCell) => {
    if (cell.outputType === "none" || !cell.output) return null;

    if (cell.outputType === "table" || cell.outputType === "dataframe") {
      const rows = cell.output as any[];
      if (!rows.length) return null;
      const cols = Object.keys(rows[0]);
      return (
        <div className="mt-2 bg-[#0a0e1a] border border-[#1f2937] rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-[#1f2937]">
                <tr>
                  <th className="px-3 py-1.5 text-right text-gray-400 border-b border-[#374151]">#</th>
                  {cols.map((c) => (
                    <th key={c} className="px-3 py-1.5 text-right text-gray-400 border-b border-[#374151]">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-[#111827] border-b border-[#1f2937]">
                    <td className="px-3 py-1 text-gray-500">{i}</td>
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-1 text-gray-200">
                        {typeof row[c] === "number" ? row[c].toLocaleString() : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-1 bg-[#0a0e1a] text-[10px] text-gray-500 border-t border-[#1f2937]">
            {rows.length} rows × {cols.length} columns
          </div>
        </div>
      );
    }

    if (cell.outputType === "chart") {
      return (
        <div className="mt-2 bg-[#0a0e1a] border border-[#1f2937] rounded p-4">
          <svg viewBox="0 0 600 220" className="w-full">
            <line x1="50" y1="180" x2="580" y2="180" stroke="#374151" strokeWidth="1" />
            <line x1="50" y1="20" x2="50" y2="180" stroke="#374151" strokeWidth="1" />
            {[0, 25, 50, 75, 100].map((v, i) => (
              <g key={i}>
                <line x1="46" y1={180 - v * 1.5} x2="50" y2={180 - v * 1.5} stroke="#6b7280" />
                <text x="42" y={184 - v * 1.5} fontSize="9" fill="#6b7280" textAnchor="end">{v}</text>
              </g>
            ))}
            {[5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145].map((_, i) => {
              const heights = [12, 18, 28, 42, 58, 72, 88, 105, 125, 148, 132, 112, 85, 52, 28];
              const h = heights[i];
              return (
                <g key={i}>
                  <rect
                    x={60 + i * 35}
                    y={180 - h}
                    width="28"
                    height={h}
                    fill="#6366f1"
                    fillOpacity="0.8"
                  />
                </g>
              );
            })}
            <path
              d="M 74 170 Q 110 160 145 150 T 215 120 T 285 80 T 355 40 T 425 60 T 495 110 T 565 160"
              stroke="#22d3ee"
              strokeWidth="2"
              fill="none"
              strokeOpacity="0.9"
            />
            <text x="300" y="210" fontSize="10" fill="#9ca3af" textAnchor="middle">
              RFM Score Distribution (bins=50)
            </text>
          </svg>
          <div className="text-[10px] text-gray-500 mt-1 text-center">
            Figure 1: Histogram of RFM scores with KDE overlay
          </div>
        </div>
      );
    }

    return (
      <pre className="mt-2 bg-[#0a0e1a] border border-[#1f2937] rounded p-3 text-xs text-gray-200 font-mono whitespace-pre-wrap overflow-x-auto">
        {String(cell.output)}
      </pre>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white flex flex-col">
      {/* TOP TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111827] border-b border-[#1f2937]">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/40">
            <Code2 className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Code Workspace — סביבת עבודה לניתוח נתונים</h1>
            <p className="text-[10px] text-gray-500">customer_segmentation.ipynb · Palantir Foundry</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-300 hover:bg-[#1f2937]">
            <Save className="h-3.5 w-3.5 ml-1" /> שמור
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-300 hover:bg-[#1f2937]">
            <Play className="h-3.5 w-3.5 ml-1" /> הרץ הכל
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-300 hover:bg-[#1f2937]">
            <RotateCcw className="h-3.5 w-3.5 ml-1" /> אתחל Kernel
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-300 hover:bg-[#1f2937]">
            <Download className="h-3.5 w-3.5 ml-1" /> יצא
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-300 hover:bg-[#1f2937]">
            <Share2 className="h-3.5 w-3.5 ml-1" /> שתף
          </Button>
          <div className="h-5 w-px bg-[#1f2937] mx-1" />
          <select
            value={selectedKernel}
            onChange={(e) => setSelectedKernel(e.target.value)}
            className="bg-[#0a0e1a] border border-[#1f2937] rounded px-2 py-1 text-xs text-gray-300"
          >
            <option value="python3-foundry">Python 3 (Foundry)</option>
            <option value="python3-spark">Python 3 (Spark)</option>
            <option value="pyspark">PySpark 3.4</option>
            <option value="r-kernel">R 4.2</option>
          </select>
          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700">
            <Zap className="h-3.5 w-3.5 ml-1" /> Writeback to Ontology
          </Button>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR */}
        <div className="w-60 bg-[#0f172a] border-l border-[#1f2937] flex flex-col">
          <div className="px-3 py-2 border-b border-[#1f2937] flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">קבצים</span>
            <div className="flex gap-1">
              <button className="p-0.5 text-gray-500 hover:text-white"><Plus className="h-3.5 w-3.5" /></button>
              <button className="p-0.5 text-gray-500 hover:text-white"><FileSearch className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {renderFileTree(files)}
          </div>
          <div className="border-t border-[#1f2937] px-3 py-2">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Database className="h-3 w-3" /> Datasets מחוברים
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {datasets.slice(0, 4).map((ds) => (
                <div key={ds.rid} className="p-1.5 rounded bg-[#111827] border border-[#1f2937] hover:border-blue-500/40 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3 text-purple-400" />
                    <span className="text-[11px] font-medium text-white truncate">{ds.name}</span>
                  </div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{ds.rows.toLocaleString()} rows · {ds.size}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MAIN NOTEBOOK */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-[#0a0e1a] p-4">
            <div className="max-w-5xl mx-auto space-y-3">
              {cells.map((cell, idx) => (
                <div
                  key={cell.id}
                  onClick={() => setActiveCellId(cell.id)}
                  className={`rounded-lg border transition-all ${
                    activeCellId === cell.id
                      ? "border-blue-500/60 bg-[#111827]"
                      : "border-[#1f2937] bg-[#0f172a]"
                  }`}
                >
                  <div className="flex items-start gap-2 p-3">
                    {/* Execution count */}
                    <div className="flex flex-col items-center gap-1 pt-1 shrink-0 w-12">
                      <div className={`text-[10px] font-mono ${cell.executionCount ? "text-blue-400" : "text-gray-600"}`}>
                        [{cell.executionCount ?? " "}]
                      </div>
                      <button
                        className="p-1 rounded hover:bg-[#1f2937] text-gray-400 hover:text-white"
                        title="הרץ תא"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Cell type badges */}
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          className={`text-[10px] font-mono px-1.5 py-0 ${
                            cell.lang === "python"
                              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                              : cell.lang === "sql"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                              : "bg-gray-500/10 text-gray-300 border-gray-500/30"
                          }`}
                        >
                          {cell.lang.toUpperCase()}
                        </Badge>
                        <select
                          value={cell.type}
                          className="bg-transparent border border-[#1f2937] rounded text-[10px] text-gray-400 px-1.5 py-0.5"
                          onChange={() => {}}
                        >
                          <option value="code">Code</option>
                          <option value="markdown">Markdown</option>
                          <option value="sql">SQL</option>
                        </select>
                        {cell.duration !== undefined && (
                          <span className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {cell.duration} ms
                          </span>
                        )}
                        {cell.executed && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        )}
                        <div className="flex-1" />
                        <div className="flex gap-1">
                          <button className="p-0.5 text-gray-600 hover:text-white" title="העתק"><Copy className="h-3 w-3" /></button>
                          <button className="p-0.5 text-gray-600 hover:text-red-400" title="מחק"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>

                      {/* Cell source */}
                      {cell.type === "markdown" ? (
                        <div className="text-sm text-gray-200 font-mono whitespace-pre-wrap bg-[#0a0e1a] rounded px-3 py-2 border border-[#1f2937]">
                          {cell.source}
                        </div>
                      ) : (
                        <pre
                          className="text-xs font-mono text-gray-200 bg-[#0a0e1a] rounded px-3 py-2 border border-[#1f2937] whitespace-pre-wrap overflow-x-auto"
                          dir="ltr"
                        >
                          {cell.source}
                        </pre>
                      )}

                      {/* Cell output */}
                      {renderCellOutput(cell)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add cell */}
              <div className="flex justify-center gap-2 py-2">
                <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:bg-[#1f2937]">
                  <Plus className="h-3 w-3 ml-1" /> Code
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:bg-[#1f2937]">
                  <Plus className="h-3 w-3 ml-1" /> Markdown
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:bg-[#1f2937]">
                  <Plus className="h-3 w-3 ml-1" /> SQL
                </Button>
              </div>
            </div>
          </div>

          {/* Dataset preview panel */}
          {showDatasetPreview && (
            <div className="border-t border-[#1f2937] bg-[#0f172a] max-h-48 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#111827] border-b border-[#1f2937]">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-3 w-3 text-purple-400" />
                  <span className="text-xs text-gray-300">תצוגת Dataset: customers_cleaned</span>
                  <Badge className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/30">
                    45,890 rows · 27 cols
                  </Badge>
                </div>
                <button onClick={() => setShowDatasetPreview(false)} className="text-gray-500 hover:text-white">
                  <EyeOff className="h-3 w-3" />
                </button>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead className="bg-[#1f2937] sticky top-0">
                    <tr>
                      {["customer_id", "name", "segment", "total_spent", "orders", "recency_days", "ltv_12m"].map((c) => (
                        <th key={c} className="px-3 py-1.5 text-right text-gray-400 border-b border-[#374151]">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CELL_1_OUTPUT.slice(0, 6).map((row, i) => (
                      <tr key={i} className="hover:bg-[#111827] border-b border-[#1f2937]">
                        <td className="px-3 py-1 text-gray-200">{row.customer_id}</td>
                        <td className="px-3 py-1 text-gray-200">{row.name}</td>
                        <td className="px-3 py-1 text-blue-300">{row.segment}</td>
                        <td className="px-3 py-1 text-emerald-300">{row.total_spent.toLocaleString()}</td>
                        <td className="px-3 py-1 text-gray-200">{row.orders}</td>
                        <td className="px-3 py-1 text-gray-400">{Math.floor(Math.random() * 90)}</td>
                        <td className="px-3 py-1 text-amber-300">{(row.total_spent * 1.3).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="w-64 bg-[#0f172a] border-r border-[#1f2937] flex flex-col">
          <div className="px-3 py-2 border-b border-[#1f2937]">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="h-3 w-3" /> Variable Explorer
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {variables.map((v) => (
              <div key={v.name} className="p-2 rounded bg-[#111827] border border-[#1f2937] hover:border-blue-500/40 cursor-pointer">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-mono text-white">{v.name}</span>
                  <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                    {v.type}
                  </Badge>
                </div>
                {v.shape && (
                  <div className="text-[10px] text-gray-500 font-mono">{v.shape}</div>
                )}
                <div className="text-[9px] text-gray-500 mt-0.5">{v.size}</div>
                <div className="text-[9px] text-gray-600 mt-1 font-mono truncate" dir="ltr">
                  {v.preview}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#1f2937] px-3 py-2">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Database className="h-3 w-3" /> Dataset Browser
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {datasets.map((ds) => (
                <div key={ds.rid} className="p-1.5 rounded bg-[#111827] border border-[#1f2937] hover:border-purple-500/40 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3 w-3 text-purple-400" />
                    <span className="text-[11px] font-medium text-white truncate">{ds.name}</span>
                  </div>
                  <div className="text-[9px] text-gray-500 font-mono mt-0.5 truncate" dir="ltr">
                    {ds.path}
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-gray-600 mt-1">
                    <span>{ds.rows.toLocaleString()} rows</span>
                    <span>{ds.size}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM STATUS BAR */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#111827] border-t border-[#1f2937] text-[10px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Circle className={`h-2 w-2 fill-current ${
              kernelStatus === "busy" ? "text-amber-400 animate-pulse" :
              kernelStatus === "running" ? "text-blue-400" :
              kernelStatus === "dead" ? "text-red-400" : "text-emerald-400"
            }`} />
            <span className="text-gray-400">Kernel: {selectedKernel}</span>
            <span className="text-gray-500">({kernelStatus})</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Cpu className="h-3 w-3" /> CPU 24%
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <HardDrive className="h-3 w-3" /> RAM 1.84 GB / 8 GB
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Activity className="h-3 w-3" /> {executedCount} תאים הורצו
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Clock className="h-3 w-3" /> סה"כ: {(totalDuration / 1000).toFixed(2)}s
          </div>
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <div className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> main
          </div>
          <span>נשמר לאחרונה: 14:32</span>
          <span className="text-gray-500">Python 3.10.4</span>
          {!showDatasetPreview && (
            <button onClick={() => setShowDatasetPreview(true)} className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
              <Eye className="h-3 w-3" /> הצג תצוגת dataset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
