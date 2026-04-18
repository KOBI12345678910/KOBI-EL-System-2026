import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  Panel,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Settings, ChevronLeft, Save,
  Zap, Bell, Timer, GitMerge, UserCheck,
  FileEdit, Mail, ArrowRight, Play, X,
  CheckCircle, XCircle, AlertCircle, Clock,
} from "lucide-react";

const API = "/api";

const NODE_STATUS_COLORS: Record<string, string> = {
  pending: "border-gray-400 bg-gray-500/10",
  running: "border-blue-400 bg-blue-500/10 animate-pulse",
  completed: "border-green-400 bg-green-500/10",
  failed: "border-red-400 bg-red-500/10",
  skipped: "border-gray-300 bg-gray-400/10",
};

const NODE_STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  running: Clock,
  completed: CheckCircle,
  failed: XCircle,
  skipped: AlertCircle,
};

function TriggerNode({ data }: { data: any }) {
  const status = data.executionStatus;
  const StatusIcon = status ? NODE_STATUS_ICONS[status] : null;
  return (
    <div className={`min-w-[160px] rounded-2xl border-2 border-green-500/60 bg-green-500/10 p-3 shadow-lg ${status ? NODE_STATUS_COLORS[status] : ""}`}>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center">
          <Play className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-[10px] text-green-400 font-medium">טריגר</p>
          <p className="text-xs font-semibold text-foreground">{data.label}</p>
        </div>
        {StatusIcon && <StatusIcon className={`w-4 h-4 mr-auto ${status === "completed" ? "text-green-400" : status === "failed" ? "text-red-400" : "text-blue-400"}`} />}
      </div>
    </div>
  );
}

function ConditionNode({ data }: { data: any }) {
  const status = data.executionStatus;
  const StatusIcon = status ? NODE_STATUS_ICONS[status] : null;
  return (
    <div className={`min-w-[160px] rounded-2xl border-2 border-orange-500/60 bg-orange-500/10 p-3 shadow-lg ${status ? NODE_STATUS_COLORS[status] : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-green-400 !w-3 !h-3 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-red-400 !w-3 !h-3 !left-[70%]" />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <GitMerge className="w-4 h-4 text-orange-400" />
        </div>
        <div>
          <p className="text-[10px] text-orange-400 font-medium">תנאי</p>
          <p className="text-xs font-semibold text-foreground">{data.label}</p>
        </div>
        {StatusIcon && <StatusIcon className={`w-4 h-4 mr-auto ${status === "completed" ? "text-green-400" : status === "failed" ? "text-red-400" : "text-blue-400"}`} />}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
        <span className="text-green-400">כן</span>
        <span className="text-red-400">לא</span>
      </div>
    </div>
  );
}

function ActionNode({ data }: { data: any }) {
  const status = data.executionStatus;
  const StatusIcon = status ? NODE_STATUS_ICONS[status] : null;
  const iconMap: Record<string, any> = {
    send_notification: Bell,
    send_email: Mail,
    update_field: FileEdit,
    set_status: ArrowRight,
    create_record: Plus,
    call_webhook: Zap,
    wait_delay: Timer,
    approval: UserCheck,
  };
  const Icon = iconMap[data.actionType] || Zap;
  return (
    <div className={`min-w-[160px] rounded-2xl border-2 border-blue-500/60 bg-blue-500/10 p-3 shadow-lg ${status ? NODE_STATUS_COLORS[status] : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-[10px] text-blue-400 font-medium">פעולה</p>
          <p className="text-xs font-semibold text-foreground">{data.label}</p>
        </div>
        {StatusIcon && <StatusIcon className={`w-4 h-4 mr-auto ${status === "completed" ? "text-green-400" : status === "failed" ? "text-red-400" : "text-blue-400"}`} />}
      </div>
    </div>
  );
}

function DelayNode({ data }: { data: any }) {
  const status = data.executionStatus;
  return (
    <div className={`min-w-[140px] rounded-2xl border-2 border-gray-500/60 bg-gray-500/10 p-3 shadow-lg ${status ? NODE_STATUS_COLORS[status] : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-3 !h-3" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-gray-500/20 flex items-center justify-center">
          <Timer className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-medium">המתנה</p>
          <p className="text-xs font-semibold text-foreground">{data.label}</p>
        </div>
      </div>
    </div>
  );
}

function EndNode({ data }: { data: any }) {
  const status = data.executionStatus;
  return (
    <div className={`min-w-[140px] rounded-2xl border-2 border-red-500/60 bg-red-500/10 p-3 shadow-lg ${status ? NODE_STATUS_COLORS[status] : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center">
          <XCircle className="w-4 h-4 text-red-400" />
        </div>
        <div>
          <p className="text-[10px] text-red-400 font-medium">סיום</p>
          <p className="text-xs font-semibold text-foreground">{data.label || "סיום תהליך"}</p>
        </div>
        {status === "completed" && <CheckCircle className="w-4 h-4 text-green-400 mr-auto" />}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  delay: DelayNode,
  end: EndNode,
};

const ACTION_PALETTE = [
  { type: "action", actionType: "send_notification", label: "שלח התראה", color: "yellow" },
  { type: "action", actionType: "send_email", label: "שלח אימייל", color: "sky" },
  { type: "action", actionType: "update_field", label: "עדכן שדה", color: "blue" },
  { type: "action", actionType: "set_status", label: "שנה סטטוס", color: "purple" },
  { type: "action", actionType: "create_record", label: "צור רשומה", color: "green" },
  { type: "action", actionType: "call_webhook", label: "Webhook", color: "indigo" },
  { type: "action", actionType: "approval", label: "אישור", color: "emerald" },
  { type: "condition", actionType: "condition_check", label: "תנאי IF/ELSE", color: "orange" },
  { type: "delay", actionType: "wait_delay", label: "המתנה", color: "gray" },
  { type: "end", actionType: "end", label: "סיום", color: "red" },
];

function actionsToGraph(
  trigger: string,
  triggerLabel: string,
  actions: any[],
  executionSteps: any[] = []
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let yOffset = 0;

  const triggerNode: Node = {
    id: "trigger-0",
    type: "trigger",
    position: { x: 250, y: yOffset },
    data: {
      label: triggerLabel,
      trigger,
      executionStatus: executionSteps.length > 0 ? "completed" : undefined,
    },
  };
  nodes.push(triggerNode);
  yOffset += 120;

  function addActions(acts: any[], parentId: string, xBase = 250): string[] {
    const lastIds: string[] = [];
    let prevId = parentId;
    let xOff = xBase;

    for (let i = 0; i < acts.length; i++) {
      const action = acts[i];
      const nodeId = action.id || `action-${Math.random().toString(36).substr(2, 9)}`;
      const stepLog = executionSteps.find((s: any) => s.action === action.type || s.stepIndex === i);
      const execStatus = stepLog ? (stepLog.success ? "completed" : "failed") : (executionSteps.length > 0 ? "skipped" : undefined);

      if (action.type === "condition_check" || action.type === "conditional_branch") {
        const node: Node = {
          id: nodeId,
          type: "condition",
          position: { x: xOff, y: yOffset },
          data: { label: action.label || "תנאי", actionType: action.type, executionStatus: execStatus, config: action.config },
        };
        nodes.push(node);
        edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, markerEnd: { type: MarkerType.ArrowClosed } });
        yOffset += 120;
        prevId = nodeId;

        if (action.config?.ifActions?.length > 0) {
          const ifLastIds = addActions(action.config.ifActions, nodeId, xOff - 130);
          for (const lid of ifLastIds) {
            const mergeId = `merge-${nodeId}`;
          }
        }
        if (action.config?.elseActions?.length > 0) {
          const elseLastIds = addActions(action.config.elseActions, nodeId, xOff + 130);
        }
      } else if (action.type === "wait_delay") {
        const node: Node = {
          id: nodeId,
          type: "delay",
          position: { x: xOff, y: yOffset },
          data: { label: `המתנה: ${action.config?.duration || "?"} ${action.config?.unit || "דקות"}`, actionType: action.type, executionStatus: execStatus, config: action.config },
        };
        nodes.push(node);
        edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, markerEnd: { type: MarkerType.ArrowClosed } });
        yOffset += 120;
        prevId = nodeId;
      } else {
        const node: Node = {
          id: nodeId,
          type: "action",
          position: { x: xOff, y: yOffset },
          data: { label: action.label || action.type, actionType: action.type, executionStatus: execStatus, config: action.config },
        };
        nodes.push(node);
        edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, markerEnd: { type: MarkerType.ArrowClosed } });
        yOffset += 120;
        prevId = nodeId;
      }
      lastIds.push(prevId);
    }
    return lastIds;
  }

  const lastIds = addActions(actions, "trigger-0");

  return { nodes, edges };
}

interface VisualWorkflowDesignerProps {
  workflowId: number;
  workflowName: string;
  triggerType: string;
  actions: any[];
  conditions: any[];
  onBack: () => void;
  onSaveActions: (actions: any[], conditions: any[]) => void;
  isSaving: boolean;
  executionSteps?: any[];
}

export default function VisualWorkflowDesigner({
  workflowId,
  workflowName,
  triggerType,
  actions,
  conditions,
  onBack,
  onSaveActions,
  isSaving,
  executionSteps = [],
}: VisualWorkflowDesignerProps) {
  const queryClient = useQueryClient();

  const TRIGGER_LABELS: Record<string, string> = {
    on_create: "יצירת רשומה",
    on_update: "עדכון רשומה",
    on_status_change: "שינוי סטטוס",
    on_delete: "מחיקת רשומה",
    manual: "הפעלה ידנית",
    scheduled: "מתוזמן",
  };

  const [localActions, setLocalActions] = useState<any[]>(actions);
  const [localConditions, setLocalConditions] = useState<any[]>(conditions);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showNodeConfig, setShowNodeConfig] = useState(false);

  const { nodes: initNodes, edges: initEdges } = actionsToGraph(
    triggerType,
    TRIGGER_LABELS[triggerType] || triggerType,
    localActions,
    executionSteps
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = actionsToGraph(
      triggerType,
      TRIGGER_LABELS[triggerType] || triggerType,
      localActions,
      executionSteps
    );
    setNodes(n);
    setEdges(e);
  }, [localActions, executionSteps, triggerType]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const addNodeFromPalette = (item: typeof ACTION_PALETTE[0]) => {
    const newAction: any = {
      id: `node-${Date.now()}`,
      type: item.actionType,
      label: item.label,
      config: {},
    };

    if (item.actionType === "condition_check") {
      newAction.config = { conditions: [{ field: "", operator: "equals", value: "" }], ifActions: [], elseActions: [] };
    }
    if (item.actionType === "wait_delay") {
      newAction.config = { duration: 5, unit: "minutes" };
    }
    if (item.actionType === "approval") {
      newAction.config = { approverRole: "", title: "אישור נדרש", message: "" };
    }

    if (item.type === "end") {
      setLocalActions(prev => [...prev, { id: `end-${Date.now()}`, type: "end", label: "סיום", config: {} }]);
    } else {
      setLocalActions(prev => [...prev, newAction]);
    }
    setShowPalette(false);
  };

  const deleteNode = (nodeId: string) => {
    setLocalActions(prev => prev.filter(a => a.id !== nodeId));
    setSelectedNode(null);
  };

  const onNodeClick = (_: any, node: Node) => {
    if (node.id === "trigger-0") return;
    setSelectedNode(node);
    setShowNodeConfig(true);
  };

  const updateSelectedNodeConfig = (config: any) => {
    if (!selectedNode) return;
    setLocalActions(prev => prev.map(a => a.id === selectedNode.id ? { ...a, config } : a));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-0">
      <div className="flex items-center justify-between p-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-bold text-sm">{workflowName}</h2>
            <p className="text-xs text-muted-foreground">עורך תהליך ויזואלי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPalette(!showPalette)}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors">
            <Plus className="w-4 h-4" />
            הוסף צעד
          </button>
          <button onClick={() => onSaveActions(localActions, localConditions)} disabled={isSaving}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Save className="w-4 h-4" />
            {isSaving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative" style={{ direction: "ltr" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }}
          >
            <Background gap={20} size={1} color="var(--border)" />
            <Controls />
            <MiniMap nodeStrokeWidth={3} />
          </ReactFlow>

          {executionSteps.length > 0 && (
            <div className="absolute top-3 left-3 bg-card border border-border rounded-xl p-2 text-xs space-y-1 shadow-lg" style={{ direction: "rtl" }}>
              <p className="font-semibold mb-2">מצב ביצוע</p>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-400" /><span>הושלם</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span>נכשל</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /><span>רץ</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-400" /><span>דולג</span></div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showPalette && (
            <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
              className="w-64 bg-card border-r border-border p-3 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">סוגי צעדים</h3>
                <button onClick={() => setShowPalette(false)} className="p-1 hover:bg-muted rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {ACTION_PALETTE.map((item) => (
                  <button key={`${item.type}-${item.actionType}`} onClick={() => addNodeFromPalette(item)}
                    className="w-full text-right flex items-center gap-3 p-2.5 bg-muted/50 hover:bg-muted rounded-xl transition-colors text-sm">
                    <div className={`w-8 h-8 rounded-lg bg-${item.color}-500/20 flex items-center justify-center flex-shrink-0`}>
                      <Zap className={`w-4 h-4 text-${item.color}-400`} />
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {showNodeConfig && selectedNode && (
            <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
              className="w-72 bg-card border-r border-border p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">הגדרת צעד</h3>
                <div className="flex gap-1">
                  <button onClick={() => { deleteNode(selectedNode.id); setShowNodeConfig(false); }}
                    className="p-1.5 hover:bg-destructive/10 rounded transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                  <button onClick={() => { setShowNodeConfig(false); setSelectedNode(null); }}
                    className="p-1.5 hover:bg-muted rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <NodeConfigPanel
                node={selectedNode}
                onConfigChange={updateSelectedNodeConfig}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NodeConfigPanel({ node, onConfigChange }: { node: Node; onConfigChange: (config: any) => void }) {
  const config = (node.data?.config as Record<string, any>) || {};
  const actionType = node.data?.actionType as string;

  const update = (key: string, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  if (actionType === "send_notification") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">כותרת</label>
          <input value={config.title || ""} onChange={e => update("title", e.target.value)}
            placeholder="כותרת ההתראה" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">הודעה</label>
          <textarea value={config.message || ""} onChange={e => update("message", e.target.value)}
            placeholder="תוכן ההתראה" rows={3} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">תפקיד יעד</label>
          <input value={config.targetRole || ""} onChange={e => update("targetRole", e.target.value)}
            placeholder="admin, manager (ריק = כולם)" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
      </div>
    );
  }

  if (actionType === "send_email") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">נמען</label>
          <input value={config.to || ""} onChange={e => update("to", e.target.value)}
            placeholder="user@example.com או {{email}}" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">נושא</label>
          <input value={config.subject || ""} onChange={e => update("subject", e.target.value)}
            placeholder="נושא המייל" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">תוכן</label>
          <textarea value={config.body || ""} onChange={e => update("body", e.target.value)}
            placeholder="תוכן המייל" rows={4} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs resize-none" />
        </div>
      </div>
    );
  }

  if (actionType === "update_field") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">שם שדה</label>
          <input value={config.fieldSlug || ""} onChange={e => update("fieldSlug", e.target.value)}
            placeholder="שדה לעדכון" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">ערך חדש</label>
          <input value={config.value || ""} onChange={e => update("value", e.target.value)}
            placeholder="הערך לשמירה או {{field}}" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
      </div>
    );
  }

  if (actionType === "set_status") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">סטטוס חדש</label>
          <input value={config.status || ""} onChange={e => update("status", e.target.value)}
            placeholder="slug של הסטטוס" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
      </div>
    );
  }

  if (actionType === "wait_delay") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">משך המתנה</label>
          <input type="number" value={config.duration || 5} onChange={e => update("duration", Number(e.target.value))}
            min={1} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">יחידת זמן</label>
          <select value={config.unit || "minutes"} onChange={e => update("unit", e.target.value)}
            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs">
            <option value="seconds">שניות</option>
            <option value="minutes">דקות</option>
            <option value="hours">שעות</option>
            <option value="days">ימים</option>
          </select>
        </div>
      </div>
    );
  }

  if (actionType === "approval") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">כותרת אישור</label>
          <input value={config.title || ""} onChange={e => update("title", e.target.value)}
            placeholder="אישור נדרש" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">תפקיד מאשר</label>
          <input value={config.approverRole || ""} onChange={e => update("approverRole", e.target.value)}
            placeholder="admin, manager" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">הודעה</label>
          <textarea value={config.message || ""} onChange={e => update("message", e.target.value)}
            placeholder="הסבר מה מוגש לאישור" rows={2} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs resize-none" />
        </div>
      </div>
    );
  }

  if (actionType === "call_webhook") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">URL</label>
          <input value={config.url || ""} onChange={e => update("url", e.target.value)}
            placeholder="https://example.com/webhook" className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Method</label>
          <select value={config.method || "POST"} onChange={e => update("method", e.target.value)}
            className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs">
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="GET">GET</option>
          </select>
        </div>
      </div>
    );
  }

  if (actionType === "condition_check") {
    const conds = config.conditions || [];
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-orange-400">תנאי הסתעפות</p>
        {conds.map((cond: any, i: number) => (
          <div key={i} className="space-y-1.5 bg-muted/50 rounded-lg p-2">
            <input value={cond.field || ""} onChange={e => {
              const newConds = [...conds]; newConds[i] = { ...newConds[i], field: e.target.value };
              update("conditions", newConds);
            }} placeholder="שדה" className="w-full px-2 py-1 bg-background border border-border rounded text-xs" />
            <select value={cond.operator || "equals"} onChange={e => {
              const newConds = [...conds]; newConds[i] = { ...newConds[i], operator: e.target.value };
              update("conditions", newConds);
            }} className="w-full px-2 py-1 bg-background border border-border rounded text-xs">
              <option value="equals">שווה</option>
              <option value="not_equals">לא שווה</option>
              <option value="gt">גדול מ</option>
              <option value="lt">קטן מ</option>
              <option value="is_empty">ריק</option>
              <option value="is_not_empty">לא ריק</option>
            </select>
            <input value={cond.value || ""} onChange={e => {
              const newConds = [...conds]; newConds[i] = { ...newConds[i], value: e.target.value };
              update("conditions", newConds);
            }} placeholder="ערך" className="w-full px-2 py-1 bg-background border border-border rounded text-xs" />
          </div>
        ))}
        <button onClick={() => update("conditions", [...conds, { field: "", operator: "equals", value: "" }])}
          className="text-xs text-primary hover:text-primary/80">+ הוסף תנאי</button>
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground text-center py-4">
      לחץ על צעד בקנבס לעריכתו
    </div>
  );
}
