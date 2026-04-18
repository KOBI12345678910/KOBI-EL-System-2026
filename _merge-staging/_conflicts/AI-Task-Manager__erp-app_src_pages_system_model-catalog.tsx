import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import {
  Database, Table2, Box, Search, Layers, RefreshCw, ChevronDown, ChevronUp,
  Server, FileCode, Hash, BookOpen
} from "lucide-react";

interface CatalogData {
  databaseTables: string[];
  tableCount: number;
  entities: Array<{ id: number; name: string; slug: string; description: string; module_name: string; module_id: number }>;
  entityCount: number;
  modules: Array<{ id: number; name: string; slug: string; description: string; icon: string; color: string; sort_order: number }>;
  moduleCount: number;
}

const hardcodedRoutes = [
  { path: "/api/auth", methods: ["POST /login", "POST /register", "GET /me", "POST /logout"], module: "Authentication" },
  { path: "/api/sales/customers", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Sales" },
  { path: "/api/sales/orders", methods: ["GET", "POST", "PUT /:id", "DELETE /:id", "GET /stats"], module: "Sales" },
  { path: "/api/quotations", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Sales" },
  { path: "/api/customer-invoices", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Finance" },
  { path: "/api/suppliers", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Procurement" },
  { path: "/api/purchase-orders", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Procurement" },
  { path: "/api/purchase-requests", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Procurement" },
  { path: "/api/raw-materials", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Inventory" },
  { path: "/api/work-orders", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Production" },
  { path: "/api/bom-headers", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Production" },
  { path: "/api/qc-inspections", methods: ["GET", "POST", "PUT /:id"], module: "Quality" },
  { path: "/api/hr/employees", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "HR" },
  { path: "/api/hr/attendance", methods: ["GET", "POST"], module: "HR" },
  { path: "/api/hr/payroll", methods: ["GET /run", "GET /summary"], module: "HR" },
  { path: "/api/finance/*", methods: ["GET", "POST", "PUT", "DELETE"], module: "Finance" },
  { path: "/api/crm/*", methods: ["GET /dashboard", "GET /leads"], module: "CRM" },
  { path: "/api/budgets", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Finance" },
  { path: "/api/projects/*", methods: ["GET", "POST", "PUT /:id", "DELETE /:id"], module: "Projects" },
  { path: "/api/platform/*", methods: ["Modules", "Entities", "Fields", "Workflows", "Approvals", "Documents"], module: "Platform" },
  { path: "/api/executive/war-room", methods: ["GET"], module: "Executive" },
  { path: "/api/executive/order-lifecycle", methods: ["GET"], module: "Executive" },
  { path: "/api/executive/model-catalog", methods: ["GET"], module: "System" },
];

export default function ModelCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"tables" | "entities" | "modules" | "routes">("modules");
  const [expandedModule, setExpandedModule] = useState<number | null>(null);

  const { data, isLoading: loading } = useQuery<CatalogData | null>({
    queryKey: ["model-catalog"],
    queryFn: async () => {
      const res = await authFetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/executive/model-catalog`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 300_000,
  });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">טוען קטלוג מודלים...</p>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-center text-muted-foreground py-20" dir="rtl">שגיאה בטעינת נתונים</div>;

  const filteredTables = data.databaseTables.filter(t => t.toLowerCase().includes(search.toLowerCase()));
  const filteredEntities = data.entities.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()) || e.slug?.toLowerCase().includes(search.toLowerCase()));
  const filteredRoutes = hardcodedRoutes.filter(r => r.path.toLowerCase().includes(search.toLowerCase()) || r.module.toLowerCase().includes(search.toLowerCase()));
  const entitiesByModule = filteredEntities.reduce<Record<number, typeof filteredEntities>>((acc, e) => {
    const k = e.module_id || 0;
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});

  const tabs = [
    { id: "modules" as const, label: "מודולים", count: data.moduleCount, icon: Layers },
    { id: "tables" as const, label: "טבלאות DB", count: data.tableCount, icon: Database },
    { id: "entities" as const, label: "ישויות", count: data.entityCount, icon: Box },
    { id: "routes" as const, label: "API Routes", count: hardcodedRoutes.length, icon: Server },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-xl">
            <BookOpen className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">קטלוג מודלים — Data Dictionary</h1>
            <p className="text-muted-foreground text-sm">מפת כל המודלים, טבלאות, ישויות ונתיבי API במערכת</p>
          </div>
        </div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ["model-catalog"] })} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "מודולים", value: data.moduleCount, icon: Layers, color: "text-purple-400" },
          { label: "ישויות", value: data.entityCount, icon: Box, color: "text-blue-400" },
          { label: "טבלאות DB", value: data.tableCount, icon: Database, color: "text-cyan-400" },
          { label: "API Routes", value: hardcodedRoutes.length, icon: Server, color: "text-emerald-400" },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4 text-center">
            <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="חיפוש מודל, טבלה, ישות..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pr-10 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                activeTab === tab.id ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              <span className="opacity-60">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === "modules" && (
        <div className="space-y-3">
          {data.modules.map(mod => {
            const modEntities = entitiesByModule[mod.id] || [];
            const isExpanded = expandedModule === mod.id;
            return (
              <div key={mod.id} className="bg-slate-800/60 rounded-xl border border-slate-700/40 overflow-hidden">
                <button
                  onClick={() => setExpandedModule(isExpanded ? null : mod.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-foreground text-xs font-bold">
                      {mod.icon || mod.name?.charAt(0)}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{mod.name}</p>
                      <p className="text-xs text-muted-foreground">{mod.slug} · {modEntities.length} ישויות</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">{modEntities.length}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {isExpanded && modEntities.length > 0 && (
                  <div className="border-t border-slate-700/50 p-3 space-y-2">
                    {modEntities.map(ent => (
                      <div key={ent.id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-2.5">
                        <Box className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{ent.name}</p>
                          <p className="text-[10px] text-muted-foreground">{ent.slug}{ent.description ? ` — ${ent.description}` : ""}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">#{ent.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "tables" && (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {filteredTables.map(table => (
              <div key={table} className="flex items-center gap-2 bg-slate-900/50 rounded-lg p-2.5 hover:bg-slate-900/80 transition-colors">
                <Table2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span className="text-xs text-slate-300 font-mono truncate">{table}</span>
              </div>
            ))}
          </div>
          {filteredTables.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">לא נמצאו טבלאות</div>
          )}
        </div>
      )}

      {activeTab === "entities" && (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="space-y-2">
            {filteredEntities.map(ent => (
              <div key={ent.id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-colors">
                <Box className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{ent.name}</p>
                  <p className="text-xs text-muted-foreground">{ent.slug}{ent.description ? ` — ${ent.description}` : ""}</p>
                </div>
                <span className="text-xs text-muted-foreground">{ent.module_name || "—"}</span>
                <span className="text-xs text-foreground font-mono">#{ent.id}</span>
              </div>
            ))}
          </div>
          {filteredEntities.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">לא נמצאו ישויות</div>
          )}
        </div>
      )}

      {activeTab === "routes" && (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <div className="space-y-2">
            {filteredRoutes.map((route, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-colors">
                <FileCode className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-foreground">{route.path}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {route.methods.map((m, j) => (
                      <span key={j} className={`px-1.5 py-0.5 text-[10px] rounded ${
                        m.startsWith("GET") ? "bg-green-500/20 text-green-400" :
                        m.startsWith("POST") ? "bg-blue-500/20 text-blue-400" :
                        m.startsWith("PUT") || m.startsWith("PATCH") ? "bg-yellow-500/20 text-yellow-400" :
                        m.startsWith("DELETE") ? "bg-red-500/20 text-red-400" :
                        "bg-slate-700/50 text-muted-foreground"
                      }`}>{m}</span>
                    ))}
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 text-purple-400">{route.module}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ActivityLog entityType="model-catalog" compact />
    </div>
  );
}
