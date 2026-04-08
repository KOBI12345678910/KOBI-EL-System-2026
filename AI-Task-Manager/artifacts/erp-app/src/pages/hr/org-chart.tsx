import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ChevronLeft, ChevronDown, ChevronRight, Users, Building2,
  Search, ZoomIn, ZoomOut, Maximize2, User, Mail, Phone,
  LayoutGrid, List, Download, Printer, Send, UserPlus,
  Briefcase, TrendingUp, Award, Network, Eye, ChevronUp,
  Filter, BarChart3, ArrowRight, AlertTriangle, GripVertical, X, Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson, authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";

const API = "/api";

interface OrgNode {
  id: number;
  name: string;
  title: string;
  department: string;
  managerName: string;
  managerId: number | null;
  email: string;
  phone: string;
  status: string;
  hire_date?: string;
  employee_number?: string;
}

const DEPT_COLORS: Record<string, string> = {
  "ייצור": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "מכירות": "bg-green-500/20 text-green-400 border-green-500/30",
  "הנהלה": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "כספים": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "לוגיסטיקה": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "שירות": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "הנדסה": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  "IT": "bg-violet-500/20 text-violet-400 border-violet-500/30",
  "משאבי אנוש": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "שיווק": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "חיתוך": "bg-red-500/20 text-red-400 border-red-500/30",
  "ריתוך": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "צביעה": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "הרכבה": "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "מחסן": "bg-muted/20 text-muted-foreground border-slate-500/30",
  "בקרת איכות": "bg-lime-500/20 text-lime-400 border-lime-500/30",
  "תחזוקה": "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  "active": "bg-green-500/20 text-green-400",
  "פעיל": "bg-green-500/20 text-green-400",
  "inactive": "bg-red-500/20 text-red-400",
  "לא פעיל": "bg-red-500/20 text-red-400",
  "on_leave": "bg-yellow-500/20 text-yellow-400",
  "בחופשה": "bg-yellow-500/20 text-yellow-400",
};

function NodeCard({
  node, isSelected, onClick, childCount,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: {
  node: OrgNode;
  isSelected: boolean;
  onClick: () => void;
  childCount: number;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragOver?: boolean;
}) {
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`px-4 py-3 bg-card border rounded-xl cursor-pointer transition-all min-w-[220px] max-w-[260px] ${
        isSelected ? "border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10" : "border-border/50 hover:border-primary/30 hover:shadow-md"
      } ${isDragOver ? "border-primary bg-primary/5 ring-2 ring-primary/40 scale-105" : ""}`}
    >
      {onDragStart && (
        <div className="absolute top-2 left-2 opacity-30 hover:opacity-60 cursor-grab">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0 relative">
          {node.name.charAt(0)}
          {childCount > 0 && (
            <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-blue-500 text-foreground text-[9px] flex items-center justify-center font-bold">
              {childCount}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{node.name}</p>
          <p className="text-xs text-muted-foreground truncate">{node.title || "—"}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {node.department && (
              <Badge className={`text-[10px] px-1.5 py-0 ${DEPT_COLORS[node.department] || "bg-muted/20 text-muted-foreground"}`}>
                {node.department}
              </Badge>
            )}
            {node.status && (
              <span className={`w-2 h-2 rounded-full ${node.status === "active" || node.status === "פעיל" ? "bg-green-400" : "bg-slate-400"}`} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeBranch({
  node,
  childrenMap,
  allNodes,
  collapsed,
  toggleCollapse,
  selectedId,
  onSelect,
  level,
  dragNodeId,
  dragOverNodeId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  node: OrgNode;
  childrenMap: Map<number, OrgNode[]>;
  allNodes: OrgNode[];
  collapsed: Set<number>;
  toggleCollapse: (id: number) => void;
  selectedId: number | null;
  onSelect: (node: OrgNode) => void;
  level: number;
  dragNodeId: number | null;
  dragOverNodeId: number | null;
  onDragStart: (node: OrgNode) => (e: React.DragEvent) => void;
  onDragOver: (node: OrgNode) => (e: React.DragEvent) => void;
  onDrop: (node: OrgNode) => (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const children = childrenMap.get(node.id) || [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.id);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <NodeCard
          node={node}
          isSelected={selectedId === node.id}
          onClick={() => onSelect(node)}
          childCount={children.length}
          onDragStart={onDragStart(node)}
          onDragOver={onDragOver(node)}
          onDrop={onDrop(node)}
          onDragEnd={onDragEnd}
          isDragOver={dragOverNodeId === node.id && dragNodeId !== node.id}
        />
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors z-10"
          >
            {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <>
          <div className="w-px h-6 bg-border/50" />
          <div className="relative flex gap-6">
            {children.length > 1 && (
              <div className="absolute top-0 left-[50%] right-[50%] h-px bg-border/50" style={{
                left: `${(100 / (children.length * 2))}%`,
                right: `${(100 / (children.length * 2))}%`,
              }} />
            )}
            {children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-4 bg-border/50" />
                <TreeBranch
                  node={child}
                  childrenMap={childrenMap}
                  allNodes={allNodes}
                  collapsed={collapsed}
                  toggleCollapse={toggleCollapse}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  level={level + 1}
                  dragNodeId={dragNodeId}
                  dragOverNodeId={dragOverNodeId}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [deptFilter, setDeptFilter] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [listSortField, setListSortField] = useState("name");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const [dragNodeId, setDragNodeId] = useState<number | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<number | null>(null);
  const [confirmReassign, setConfirmReassign] = useState<{ employee: OrgNode; newManager: OrgNode } | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["hr-org-chart"],
    queryFn: () => authJson(`${API}/hr/org-chart`),
  });

  const reassignMutation = useMutation({
    mutationFn: (payload: { employeeId: number; newManagerId: number | null }) =>
      authFetch(`${API}/org-chart/reassign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-org-chart"] });
      setConfirmReassign(null);
    },
  });

  const nodes: OrgNode[] = data?.nodes || [];
  const departments: { name: string; count: number }[] = data?.departments || [];

  const handleDragStart = useCallback((node: OrgNode) => (e: React.DragEvent) => {
    setDragNodeId(node.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((node: OrgNode) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverNodeId(node.id);
  }, []);

  const handleDrop = useCallback((targetNode: OrgNode) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragNodeId && dragNodeId !== targetNode.id) {
      const draggedNode = nodes.find(n => n.id === dragNodeId);
      if (draggedNode && draggedNode.managerId !== targetNode.id) {
        setConfirmReassign({ employee: draggedNode, newManager: targetNode });
      }
    }
    setDragOverNodeId(null);
  }, [dragNodeId, nodes]);

  const handleDragEnd = useCallback(() => {
    setDragNodeId(null);
    setDragOverNodeId(null);
  }, []);

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const kpiStats = useMemo(() => {
    const total = nodes.length;
    const active = nodes.filter(n => n.status === "active" || n.status === "פעיל").length;
    const managers = nodes.filter(n => {
      return nodes.some(c => c.managerId === n.id);
    }).length;
    const deptCount = departments.length;
    const noManager = nodes.filter(n => !n.managerId).length;
    const avgTeamSize = managers > 0 ? (total / managers).toFixed(1) : "0";
    const maxDepth = (() => {
      const getDepth = (id: number, visited: Set<number> = new Set()): number => {
        if (visited.has(id)) return 0;
        visited.add(id);
        const children = nodes.filter(n => n.managerId === id);
        if (children.length === 0) return 1;
        return 1 + Math.max(...children.map(c => getDepth(c.id, visited)));
      };
      const roots = nodes.filter(n => !n.managerId);
      return roots.length > 0 ? Math.max(...roots.map(r => getDepth(r.id))) : 0;
    })();

    return { total, active, managers, deptCount, noManager, avgTeamSize, maxDepth };
  }, [nodes, departments]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(n =>
        n.name.toLowerCase().includes(s) ||
        n.title.toLowerCase().includes(s) ||
        n.department.toLowerCase().includes(s) ||
        (n.email && n.email.toLowerCase().includes(s)) ||
        (n.employee_number && n.employee_number.toLowerCase().includes(s))
      );
    }
    if (deptFilter) {
      result = result.filter(n => n.department === deptFilter);
    }
    if (statusFilter) {
      result = result.filter(n => n.status === statusFilter);
    }
    return result;
  }, [nodes, search, deptFilter, statusFilter]);

  const sortedListNodes = useMemo(() => {
    const sorted = [...filteredNodes];
    sorted.sort((a: any, b: any) => {
      const av = a[listSortField] || "";
      const bv = b[listSortField] || "";
      const cmp = String(av).localeCompare(String(bv), "he");
      return listSortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredNodes, listSortField, listSortDir]);

  const { roots, childrenMap } = useMemo(() => {
    const nodeSet = new Set(filteredNodes.map(n => n.id));
    const cMap = new Map<number, OrgNode[]>();
    const rootNodes: OrgNode[] = [];

    filteredNodes.forEach(n => {
      if (n.managerId && nodeSet.has(n.managerId)) {
        if (!cMap.has(n.managerId)) cMap.set(n.managerId, []);
        cMap.get(n.managerId)!.push(n);
      } else {
        rootNodes.push(n);
      }
    });

    return { roots: rootNodes, childrenMap: cMap };
  }, [filteredNodes]);

  const toggleListSort = (field: string) => {
    if (listSortField === field) setListSortDir(d => d === "asc" ? "desc" : "asc");
    else { setListSortField(field); setListSortDir("asc"); }
  };

  const collapseAll = () => setCollapsed(new Set(nodes.map(n => n.id)));
  const expandAll = () => setCollapsed(new Set());

  const exportData = () => {
    exportToExcel(filteredNodes as any[], {
      employee_number: "מספר עובד",
      name: "שם",
      title: "תפקיד",
      department: "מחלקה",
      managerName: "מנהל ישיר",
      email: "דוא\"ל",
      phone: "טלפון",
      status: "סטטוס"
    }, "org_chart");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/hr" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          משאבי אנוש
        </Link>
        <span>/</span>
        <span className="text-foreground">מבנה ארגוני</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
            <Network className="w-7 h-7 text-blue-400" />
            מבנה ארגוני
          </h1>
          <p className="text-muted-foreground mt-1">{kpiStats.total} עובדים | {kpiStats.deptCount} מחלקות | {kpiStats.maxDepth} רמות היררכיה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportData} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-colors">
            <Download className="w-4 h-4" /> ייצוא
          </button>
          <button onClick={() => printPage("מבנה ארגוני - טכנו-כל עוזי")} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-colors">
            <Printer className="w-4 h-4" /> הדפסה
          </button>
          <button onClick={() => sendByEmail("מבנה ארגוני - טכנו-כל עוזי", generateEmailBody("מבנה ארגוני", filteredNodes as any[], { name: "שם", title: "תפקיד", department: "מחלקה", managerName: "מנהל" }))} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-colors">
            <Send className="w-4 h-4" /> שליחה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "סה\"כ עובדים", value: kpiStats.total, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "עובדים פעילים", value: kpiStats.active, icon: User, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "מנהלים", value: kpiStats.managers, icon: Award, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "מחלקות", value: kpiStats.deptCount, icon: Building2, color: "text-orange-400", bg: "bg-orange-500/10" },
          { label: "ממוצע צוות", value: kpiStats.avgTeamSize, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "רמות היררכיה", value: kpiStats.maxDepth, icon: BarChart3, color: "text-indigo-400", bg: "bg-indigo-500/10" },
          { label: "ללא מנהל", value: kpiStats.noManager, icon: Briefcase, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((kpi, i) => (
          <div key={i} className={`${kpi.bg} rounded-xl border border-border/50 p-3`}>
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-1.5`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <button
          onClick={() => setDeptFilter("")}
          className={`p-2.5 rounded-xl border text-right transition-all text-sm ${
            !deptFilter ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-card hover:border-primary/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-bold text-foreground">{nodes.length}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">כל המחלקות</p>
        </button>
        {departments.map(dept => (
          <button
            key={dept.name}
            onClick={() => setDeptFilter(deptFilter === dept.name ? "" : dept.name)}
            className={`p-2.5 rounded-xl border text-right transition-all text-sm ${
              deptFilter === dept.name
                ? "border-primary bg-primary/10"
                : "border-border/50 bg-card hover:border-primary/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-bold text-foreground">{dept.count}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{dept.name}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש עובד, תפקיד, מחלקה, דוא״ל..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm transition-colors ${showFilters ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/30"}`}>
          <Filter className="w-4 h-4" /> סינון
        </button>

        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          <button onClick={() => setViewMode("tree")} className={`p-2 rounded-lg transition-colors ${viewMode === "tree" ? "bg-primary/20 text-primary" : "hover:bg-muted"}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg transition-colors ${viewMode === "list" ? "bg-primary/20 text-primary" : "hover:bg-muted"}`}>
            <List className="w-4 h-4" />
          </button>
        </div>

        {viewMode === "tree" && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="p-2 hover:bg-muted rounded-lg">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground px-2 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-2 hover:bg-muted rounded-lg">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(1)} className="p-2 hover:bg-muted rounded-lg">
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button onClick={expandAll} className="p-2 hover:bg-muted rounded-lg text-xs" title="פרוס הכל">
              <ChevronDown className="w-4 h-4" />
            </button>
            <button onClick={collapseAll} className="p-2 hover:bg-muted rounded-lg text-xs" title="כווץ הכל">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          {filteredNodes.length} / {nodes.length} עובדים
        </div>
      </div>

      {showFilters && (
        <div className="flex gap-3 flex-wrap p-4 bg-card border border-border/50 rounded-xl">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm">
              <option value="">הכל</option>
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
              <option value="on_leave">בחופשה</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">מחלקה</label>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-2 text-sm">
              <option value="">כל המחלקות</option>
              {departments.map(d => <option key={d.name} value={d.name}>{d.name} ({d.count})</option>)}
            </select>
          </div>
          <button onClick={() => { setStatusFilter(""); setDeptFilter(""); setSearch(""); }} className="self-end px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            נקה סינון
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {viewMode === "tree" ? (
          <div className="flex-1 overflow-auto border border-border/50 rounded-2xl bg-card/50 p-8 min-h-[400px]">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top right" }} className="transition-transform">
              {roots.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Network className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">אין עובדים להצגה</p>
                  <p className="text-sm mt-1">נסה לשנות את הסינון או לחפש עובד אחר</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-8 justify-center">
                  {roots.map(root => (
                    <TreeBranch
                      key={root.id}
                      node={root}
                      childrenMap={childrenMap}
                      allNodes={filteredNodes}
                      collapsed={collapsed}
                      toggleCollapse={toggleCollapse}
                      selectedId={selectedNode?.id ?? null}
                      onSelect={setSelectedNode}
                      level={0}
                      dragNodeId={dragNodeId}
                      dragOverNodeId={dragOverNodeId}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto border border-border/50 rounded-2xl bg-card/50">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50 sticky top-0">
                <tr>
                  {[
                    { key: "employee_number", label: "מס׳ עובד" },
                    { key: "name", label: "שם" },
                    { key: "title", label: "תפקיד" },
                    { key: "department", label: "מחלקה" },
                    { key: "managerName", label: "מנהל ישיר" },
                    { key: "email", label: "דוא\"ל" },
                    { key: "phone", label: "טלפון" },
                    { key: "status", label: "סטטוס" },
                  ].map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                      onClick={() => toggleListSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {listSortField === col.key && (
                          listSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sortedListNodes.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">אין עובדים להצגה</td></tr>
                ) : sortedListNodes.map(n => (
                  <tr key={n.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${selectedNode?.id === n.id ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{n.employee_number || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {n.name.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{n.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{n.title || "—"}</td>
                    <td className="px-4 py-3">
                      {n.department && (
                        <Badge className={`text-[10px] ${DEPT_COLORS[n.department] || "bg-muted/20 text-muted-foreground"}`}>
                          {n.department}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{n.managerName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{n.email || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs" dir="ltr">{n.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${STATUS_COLORS[n.status] || "bg-muted/20 text-muted-foreground"}`}>
                        {n.status === "active" ? "פעיל" : n.status === "inactive" ? "לא פעיל" : n.status === "on_leave" ? "בחופשה" : n.status || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setSelectedNode(n)} className="p-1.5 hover:bg-muted rounded-lg" title="פרטים">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <Link href={`/hr/employees/${n.id}`} className="p-1.5 hover:bg-muted rounded-lg" title="תיק עובד">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedNode && (
          <Card className="w-80 border-border/50 shrink-0 self-start sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  פרטי עובד
                </CardTitle>
                <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex border-b border-border/50 mt-2">
                {[{key:"details",label:"פרטים"},{key:"related",label:"קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-2 py-1.5 text-[10px] font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailTab === "related" && <RelatedRecords entityType="employees" entityId={selectedNode.id} relations={[{key:"departments",label:"מחלקות",icon:"Building2"},{key:"subordinates",label:"כפיפים",icon:"Users"}]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="employees" entityId={selectedNode.id} />}
              {detailTab === "history" && <ActivityLog entityType="employees" entityId={selectedNode.id} />}
              {detailTab === "details" && <>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                  {selectedNode.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{selectedNode.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedNode.title || "—"}</p>
                  {selectedNode.department && (
                    <Badge className={`text-xs mt-1 ${DEPT_COLORS[selectedNode.department] || "bg-muted/20 text-muted-foreground"}`}>
                      {selectedNode.department}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {selectedNode.employee_number && (
                  <div className="flex justify-between py-1.5 border-b border-border/20">
                    <span className="text-sm text-muted-foreground">מספר עובד</span>
                    <span className="text-sm text-foreground font-mono">{selectedNode.employee_number}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">סטטוס</span>
                  <Badge className={`text-xs ${STATUS_COLORS[selectedNode.status] || "bg-muted/20 text-muted-foreground"}`}>
                    {selectedNode.status === "active" ? "פעיל" : selectedNode.status || "—"}
                  </Badge>
                </div>
                {selectedNode.managerName && (
                  <div className="flex justify-between py-1.5 border-b border-border/20">
                    <span className="text-sm text-muted-foreground">מנהל ישיר</span>
                    <span className="text-sm text-foreground">{selectedNode.managerName}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">כפיפים ישירים</span>
                  <span className="text-sm text-foreground font-bold">
                    {(childrenMap.get(selectedNode.id) || []).length}
                  </span>
                </div>
              </div>

              {selectedNode.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate">{selectedNode.email}</span>
                </div>
              )}
              {selectedNode.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  <span dir="ltr">{selectedNode.phone}</span>
                </div>
              )}
              {selectedNode.hire_date && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>תחילת עבודה: {selectedNode.hire_date.slice(0, 10)}</span>
                </div>
              )}

              <Link
                href={`/hr/employees/${selectedNode.id}`}
                className="block w-full text-center py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                צפייה בתיק עובד
              </Link>
              </>}
            </CardContent>
          </Card>
        )}
      </div>

      {confirmReassign && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmReassign(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                אישור שינוי מבנה ארגוני
              </h2>
              <button onClick={() => setConfirmReassign(null)} className="p-1.5 hover:bg-muted rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">האם לשנות את המנהל הישיר של העובד?</p>
              <div className="bg-muted/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {confirmReassign.employee.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{confirmReassign.employee.name}</p>
                    <p className="text-xs text-muted-foreground">{confirmReassign.employee.title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex-1 text-center">
                    מנהל נוכחי: <strong className="text-foreground">{confirmReassign.employee.managerName || "—"}</strong>
                  </span>
                  <ArrowRight className="w-4 h-4 rotate-180 text-primary" />
                  <span className="flex-1 text-center">
                    מנהל חדש: <strong className="text-foreground">{confirmReassign.newManager.name}</strong>
                  </span>
                </div>
              </div>
              <p className="text-xs text-yellow-400/80">פעולה זו תעדכן את המנהל הישיר במערכת ותשפיע על עץ הארגון.</p>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setConfirmReassign(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button
                onClick={() => reassignMutation.mutate({
                  employeeId: confirmReassign.employee.id,
                  newManagerId: confirmReassign.newManager.id,
                })}
                disabled={reassignMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {reassignMutation.isPending ? "מעדכן..." : "אשר שינוי"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
