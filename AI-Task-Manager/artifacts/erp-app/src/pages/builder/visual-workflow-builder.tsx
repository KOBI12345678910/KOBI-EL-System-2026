import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, Save, Plus, Trash2, X, Settings, Copy, Undo,
  Redo, ZoomIn, ZoomOut, Maximize2, Download, Upload, Search,
  GitBranch, ArrowRight, Circle, Square, Diamond, Hexagon,
  Clock, Mail, Bell, Database, Globe, Code, Filter, Zap,
  MessageCircle, FileText, Users, ShieldCheck, Webhook,
  Repeat, Timer, Eye, EyeOff, Lock, Unlock, Layers,
  ChevronRight, ChevronDown, GripVertical, MoreVertical,
  CheckCircle2, AlertTriangle, XCircle, Sparkles, Bot,
  Terminal, Workflow, PanelRight, PanelRightClose
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

// 25+ Node Types
interface NodeType {
  type: string;
  label: string;
  category: string;
  icon: any;
  color: string;
  description: string;
  inputs?: string[];
  outputs?: string[];
  properties?: PropertyDef[];
}

interface PropertyDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "textarea" | "email";
  options?: string[];
  defaultValue?: any;
}

const nodeTypes: NodeType[] = [
  // Triggers
  { type: "trigger_manual", label: "\u05D4\u05E4\u05E2\u05DC\u05D4 \u05D9\u05D3\u05E0\u05D9\u05EA", category: "\u05D8\u05E8\u05D9\u05D2\u05E8\u05D9\u05DD", icon: Play, color: "#22c55e", description: "\u05D4\u05EA\u05D7\u05DC\u05D4 \u05D9\u05D3\u05E0\u05D9\u05EA \u05E9\u05DC \u05EA\u05D4\u05DC\u05D9\u05DA", outputs: ["next"], properties: [{ key: "name", label: "\u05E9\u05DD", type: "text" }] },
  { type: "trigger_schedule", label: "\u05EA\u05D6\u05DE\u05D5\u05DF", category: "\u05D8\u05E8\u05D9\u05D2\u05E8\u05D9\u05DD", icon: Clock, color: "#22c55e", description: "\u05D4\u05E4\u05E2\u05DC\u05D4 \u05DC\u05E4\u05D9 \u05DC\u05D5\u05D7 \u05D6\u05DE\u05E0\u05D9\u05DD", outputs: ["next"], properties: [{ key: "cron", label: "\u05D1\u05D9\u05D8\u05D5\u05D9 Cron", type: "text", defaultValue: "0 9 * * *" }, { key: "timezone", label: "\u05D0\u05D6\u05D5\u05E8 \u05D6\u05DE\u05DF", type: "text", defaultValue: "Asia/Jerusalem" }] },
  { type: "trigger_webhook", label: "Webhook", category: "\u05D8\u05E8\u05D9\u05D2\u05E8\u05D9\u05DD", icon: Webhook, color: "#22c55e", description: "\u05D4\u05E4\u05E2\u05DC\u05D4 \u05D1\u05E7\u05D1\u05DC\u05EA \u05D1\u05E7\u05E9\u05EA HTTP", outputs: ["next"], properties: [{ key: "method", label: "\u05DE\u05EA\u05D5\u05D3\u05D4", type: "select", options: ["GET", "POST", "PUT"] }, { key: "path", label: "\u05E0\u05EA\u05D9\u05D1", type: "text" }] },
  { type: "trigger_event", label: "\u05D0\u05D9\u05E8\u05D5\u05E2", category: "\u05D8\u05E8\u05D9\u05D2\u05E8\u05D9\u05DD", icon: Zap, color: "#22c55e", description: "\u05D4\u05E4\u05E2\u05DC\u05D4 \u05D1\u05D0\u05D9\u05E8\u05D5\u05E2 \u05DE\u05E2\u05E8\u05DB\u05EA", outputs: ["next"], properties: [{ key: "event", label: "\u05E9\u05DD \u05D0\u05D9\u05E8\u05D5\u05E2", type: "text" }] },
  { type: "trigger_form", label: "\u05D8\u05D5\u05E4\u05E1", category: "\u05D8\u05E8\u05D9\u05D2\u05E8\u05D9\u05DD", icon: FileText, color: "#22c55e", description: "\u05D4\u05E4\u05E2\u05DC\u05D4 \u05D1\u05E9\u05DC\u05D9\u05D7\u05EA \u05D8\u05D5\u05E4\u05E1", outputs: ["next"], properties: [{ key: "form_id", label: "\u05DE\u05D6\u05D4\u05D4 \u05D8\u05D5\u05E4\u05E1", type: "text" }] },

  // Logic
  { type: "condition", label: "\u05EA\u05E0\u05D0\u05D9", category: "\u05DC\u05D5\u05D2\u05D9\u05E7\u05D4", icon: GitBranch, color: "#f59e0b", description: "\u05D4\u05E1\u05EA\u05E2\u05E4\u05D5\u05EA \u05DE\u05D5\u05EA\u05E0\u05D9\u05EA", inputs: ["input"], outputs: ["true", "false"], properties: [{ key: "condition", label: "\u05EA\u05E0\u05D0\u05D9", type: "textarea" }, { key: "operator", label: "\u05D0\u05D5\u05E4\u05E8\u05D8\u05D5\u05E8", type: "select", options: ["equals", "not_equals", "greater", "less", "contains"] }] },
  { type: "switch", label: "Switch", category: "\u05DC\u05D5\u05D2\u05D9\u05E7\u05D4", icon: Diamond, color: "#f59e0b", description: "\u05D4\u05E1\u05EA\u05E2\u05E4\u05D5\u05EA \u05DE\u05E8\u05D5\u05D1\u05EA", inputs: ["input"], outputs: ["case1", "case2", "default"], properties: [{ key: "expression", label: "\u05D1\u05D9\u05D8\u05D5\u05D9", type: "text" }] },
  { type: "loop", label: "\u05DC\u05D5\u05DC\u05D0\u05D4", category: "\u05DC\u05D5\u05D2\u05D9\u05E7\u05D4", icon: Repeat, color: "#f59e0b", description: "\u05D7\u05D6\u05E8\u05D4 \u05E2\u05DC \u05E8\u05E9\u05D9\u05DE\u05D4", inputs: ["input"], outputs: ["each", "done"], properties: [{ key: "collection", label: "\u05D0\u05D5\u05E1\u05E3", type: "text" }, { key: "max_iterations", label: "\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD", type: "number", defaultValue: 100 }] },
  { type: "delay", label: "\u05D4\u05E9\u05D4\u05D9\u05D9\u05D4", category: "\u05DC\u05D5\u05D2\u05D9\u05E7\u05D4", icon: Timer, color: "#f59e0b", description: "\u05D4\u05DE\u05EA\u05E0\u05D4 \u05DC\u05E4\u05E0\u05D9 \u05D4\u05DE\u05E9\u05DA", inputs: ["input"], outputs: ["next"], properties: [{ key: "duration", label: "\u05DE\u05E9\u05DA (\u05E9\u05E0\u05D9\u05D5\u05EA)", type: "number", defaultValue: 5 }] },
  { type: "parallel", label: "\u05DE\u05E7\u05D1\u05D9\u05DC\u05D9", category: "\u05DC\u05D5\u05D2\u05D9\u05E7\u05D4", icon: Layers, color: "#f59e0b", description: "\u05D4\u05E8\u05E6\u05D4 \u05DE\u05E7\u05D1\u05D9\u05DC\u05D9\u05EA", inputs: ["input"], outputs: ["branch1", "branch2", "join"] },

  // Actions
  { type: "send_email", label: "\u05E9\u05DC\u05D7 \u05DE\u05D9\u05D9\u05DC", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Mail, color: "#3b82f6", description: "\u05E9\u05DC\u05D9\u05D7\u05EA \u05D3\u05D5\u05D0\"\u05DC", inputs: ["input"], outputs: ["next"], properties: [{ key: "to", label: "\u05D0\u05DC", type: "email" }, { key: "subject", label: "\u05E0\u05D5\u05E9\u05D0", type: "text" }, { key: "body", label: "\u05D2\u05D5\u05E3", type: "textarea" }] },
  { type: "notification", label: "\u05D4\u05EA\u05E8\u05D0\u05D4", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Bell, color: "#3b82f6", description: "\u05E9\u05DC\u05D9\u05D7\u05EA \u05D4\u05EA\u05E8\u05D0\u05D4", inputs: ["input"], outputs: ["next"], properties: [{ key: "title", label: "\u05DB\u05D5\u05EA\u05E8\u05EA", type: "text" }, { key: "message", label: "\u05D4\u05D5\u05D3\u05E2\u05D4", type: "textarea" }, { key: "type", label: "\u05E1\u05D5\u05D2", type: "select", options: ["info", "warning", "error", "success"] }] },
  { type: "http_request", label: "\u05D1\u05E7\u05E9\u05EA HTTP", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Globe, color: "#3b82f6", description: "\u05E7\u05E8\u05D9\u05D0\u05D4 \u05DC-API \u05D7\u05D9\u05E6\u05D5\u05E0\u05D9", inputs: ["input"], outputs: ["success", "error"], properties: [{ key: "url", label: "URL", type: "text" }, { key: "method", label: "\u05DE\u05EA\u05D5\u05D3\u05D4", type: "select", options: ["GET", "POST", "PUT", "DELETE"] }, { key: "headers", label: "\u05DB\u05D5\u05EA\u05E8\u05D5\u05EA", type: "textarea" }] },
  { type: "db_query", label: "\u05E9\u05D0\u05D9\u05DC\u05EA\u05D0 \u05DC\u05DE\u05E1\u05D3", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Database, color: "#3b82f6", description: "\u05E7\u05E8\u05D9\u05D0\u05D4/\u05DB\u05EA\u05D9\u05D1\u05D4 \u05DC\u05DE\u05E1\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", inputs: ["input"], outputs: ["next"], properties: [{ key: "query", label: "\u05E9\u05D0\u05D9\u05DC\u05EA\u05D0", type: "textarea" }, { key: "table", label: "\u05D8\u05D1\u05DC\u05D4", type: "text" }] },
  { type: "transform", label: "\u05D4\u05DE\u05E8\u05D4", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Code, color: "#3b82f6", description: "\u05D4\u05DE\u05E8\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", inputs: ["input"], outputs: ["next"], properties: [{ key: "expression", label: "\u05D1\u05D9\u05D8\u05D5\u05D9", type: "textarea" }] },
  { type: "filter", label: "\u05E1\u05D9\u05E0\u05D5\u05DF", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Filter, color: "#3b82f6", description: "\u05E1\u05D9\u05E0\u05D5\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", inputs: ["input"], outputs: ["pass", "reject"], properties: [{ key: "condition", label: "\u05EA\u05E0\u05D0\u05D9", type: "textarea" }] },
  { type: "assign_user", label: "\u05D4\u05E7\u05E6\u05D4 \u05DC\u05DE\u05E9\u05EA\u05DE\u05E9", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Users, color: "#3b82f6", description: "\u05D4\u05E7\u05E6\u05D4 \u05DC\u05DE\u05E9\u05EA\u05DE\u05E9 \u05D0\u05D5 \u05E7\u05D1\u05D5\u05E6\u05D4", inputs: ["input"], outputs: ["next"], properties: [{ key: "user_id", label: "\u05DE\u05D6\u05D4\u05D4 \u05DE\u05E9\u05EA\u05DE\u05E9", type: "text" }, { key: "role", label: "\u05EA\u05E4\u05E7\u05D9\u05D3", type: "text" }] },
  { type: "approval", label: "\u05D0\u05D9\u05E9\u05D5\u05E8", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: ShieldCheck, color: "#3b82f6", description: "\u05D1\u05E7\u05E9\u05EA \u05D0\u05D9\u05E9\u05D5\u05E8", inputs: ["input"], outputs: ["approved", "rejected"], properties: [{ key: "approver", label: "\u05DE\u05D0\u05E9\u05E8", type: "text" }, { key: "timeout_hours", label: "\u05D6\u05DE\u05DF \u05DE\u05E7\u05E1\u05D9\u05DE\u05DC\u05D9 (\u05E9\u05E2\u05D5\u05EA)", type: "number", defaultValue: 48 }] },
  { type: "sms", label: "SMS", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: MessageCircle, color: "#3b82f6", description: "\u05E9\u05DC\u05D9\u05D7\u05EA SMS", inputs: ["input"], outputs: ["next"], properties: [{ key: "phone", label: "\u05D8\u05DC\u05E4\u05D5\u05DF", type: "text" }, { key: "message", label: "\u05D4\u05D5\u05D3\u05E2\u05D4", type: "textarea" }] },
  { type: "create_record", label: "\u05E6\u05D5\u05E8 \u05E8\u05E9\u05D5\u05DE\u05D4", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Plus, color: "#3b82f6", description: "\u05D9\u05E6\u05D9\u05E8\u05EA \u05E8\u05E9\u05D5\u05DE\u05D4 \u05D7\u05D3\u05E9\u05D4", inputs: ["input"], outputs: ["next"], properties: [{ key: "entity", label: "\u05D9\u05E9\u05D5\u05EA", type: "text" }, { key: "data", label: "\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", type: "textarea" }] },
  { type: "update_record", label: "\u05E2\u05D3\u05DB\u05DF \u05E8\u05E9\u05D5\u05DE\u05D4", category: "\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA", icon: Settings, color: "#3b82f6", description: "\u05E2\u05D3\u05DB\u05D5\u05DF \u05E8\u05E9\u05D5\u05DE\u05D4 \u05E7\u05D9\u05D9\u05DE\u05EA", inputs: ["input"], outputs: ["next"], properties: [{ key: "entity", label: "\u05D9\u05E9\u05D5\u05EA", type: "text" }, { key: "record_id", label: "\u05DE\u05D6\u05D4\u05D4", type: "text" }, { key: "data", label: "\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", type: "textarea" }] },

  // AI
  { type: "ai_analyze", label: "\u05E0\u05D9\u05EA\u05D5\u05D7 AI", category: "AI", icon: Sparkles, color: "#8b5cf6", description: "\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D1\u05D9\u05E0\u05D4 \u05DE\u05DC\u05D0\u05DB\u05D5\u05EA\u05D9\u05EA", inputs: ["input"], outputs: ["next"], properties: [{ key: "prompt", label: "\u05E4\u05E8\u05D5\u05DE\u05E4\u05D8", type: "textarea" }, { key: "model", label: "\u05DE\u05D5\u05D3\u05DC", type: "select", options: ["gpt-4", "gpt-3.5", "claude"] }] },
  { type: "ai_generate", label: "\u05D9\u05E6\u05D9\u05E8\u05EA \u05EA\u05D5\u05DB\u05DF AI", category: "AI", icon: Bot, color: "#8b5cf6", description: "\u05D9\u05E6\u05D9\u05E8\u05EA \u05EA\u05D5\u05DB\u05DF \u05D1-AI", inputs: ["input"], outputs: ["next"], properties: [{ key: "template", label: "\u05EA\u05D1\u05E0\u05D9\u05EA", type: "textarea" }] },
  { type: "ai_classify", label: "\u05E1\u05D9\u05D5\u05D5\u05D2 AI", category: "AI", icon: Layers, color: "#8b5cf6", description: "\u05E1\u05D9\u05D5\u05D5\u05D2 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9", inputs: ["input"], outputs: ["next"], properties: [{ key: "categories", label: "\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA", type: "textarea" }] },

  // End
  { type: "end_success", label: "\u05E1\u05D9\u05D5\u05DD \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4", category: "\u05E1\u05D9\u05D5\u05DD", icon: CheckCircle2, color: "#10b981", description: "\u05E1\u05D9\u05D5\u05DD \u05DE\u05D5\u05E6\u05DC\u05D7", inputs: ["input"] },
  { type: "end_error", label: "\u05E1\u05D9\u05D5\u05DD \u05D1\u05E9\u05D2\u05D9\u05D0\u05D4", category: "\u05E1\u05D9\u05D5\u05DD", icon: XCircle, color: "#ef4444", description: "\u05E1\u05D9\u05D5\u05DD \u05E2\u05DD \u05E9\u05D2\u05D9\u05D0\u05D4", inputs: ["input"], properties: [{ key: "error_message", label: "\u05D4\u05D5\u05D3\u05E2\u05EA \u05E9\u05D2\u05D9\u05D0\u05D4", type: "text" }] },
];

interface WorkflowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  properties: Record<string, any>;
  label?: string;
}

interface Connection {
  id: string;
  from: string;
  fromOutput: string;
  to: string;
  toInput: string;
}

interface Template {
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: Connection[];
}

const templates: Template[] = [
  {
    name: "\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D5\u05E6\u05D0\u05D4",
    description: "\u05EA\u05D4\u05DC\u05D9\u05DA \u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D5\u05E6\u05D0\u05D4 \u05E2\u05DD \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA",
    nodes: [
      { id: "n1", type: "trigger_form", x: 100, y: 200, properties: { form_id: "expense_form" } },
      { id: "n2", type: "condition", x: 300, y: 200, properties: { condition: "amount > 1000" } },
      { id: "n3", type: "approval", x: 500, y: 100, properties: { approver: "manager" } },
      { id: "n4", type: "send_email", x: 500, y: 300, properties: { subject: "\u05D4\u05D7\u05D6\u05E8 \u05D0\u05D5\u05E9\u05E8" } },
      { id: "n5", type: "end_success", x: 700, y: 200, properties: {} },
    ],
    connections: [
      { id: "c1", from: "n1", fromOutput: "next", to: "n2", toInput: "input" },
      { id: "c2", from: "n2", fromOutput: "true", to: "n3", toInput: "input" },
      { id: "c3", from: "n2", fromOutput: "false", to: "n4", toInput: "input" },
      { id: "c4", from: "n3", fromOutput: "approved", to: "n5", toInput: "input" },
      { id: "c5", from: "n4", fromOutput: "next", to: "n5", toInput: "input" },
    ],
  },
  {
    name: "\u05E7\u05DC\u05D9\u05D8\u05EA \u05E2\u05D5\u05D1\u05D3 \u05D7\u05D3\u05E9",
    description: "\u05EA\u05D4\u05DC\u05D9\u05DA \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9 \u05DC\u05E7\u05DC\u05D9\u05D8\u05EA \u05E2\u05D5\u05D1\u05D3 \u05D7\u05D3\u05E9",
    nodes: [
      { id: "n1", type: "trigger_event", x: 100, y: 200, properties: { event: "employee_created" } },
      { id: "n2", type: "create_record", x: 300, y: 200, properties: { entity: "onboarding_tasks" } },
      { id: "n3", type: "assign_user", x: 500, y: 100, properties: { role: "hr_manager" } },
      { id: "n4", type: "send_email", x: 500, y: 300, properties: { subject: "\u05D1\u05E8\u05D5\u05DA \u05D4\u05D1\u05D0 \u05DC\u05E6\u05D5\u05D5\u05EA!" } },
      { id: "n5", type: "notification", x: 700, y: 200, properties: { title: "\u05E2\u05D5\u05D1\u05D3 \u05D7\u05D3\u05E9" } },
      { id: "n6", type: "end_success", x: 900, y: 200, properties: {} },
    ],
    connections: [
      { id: "c1", from: "n1", fromOutput: "next", to: "n2", toInput: "input" },
      { id: "c2", from: "n2", fromOutput: "next", to: "n3", toInput: "input" },
      { id: "c3", from: "n2", fromOutput: "next", to: "n4", toInput: "input" },
      { id: "c4", from: "n3", fromOutput: "next", to: "n5", toInput: "input" },
      { id: "c5", from: "n5", fromOutput: "next", to: "n6", toInput: "input" },
    ],
  },
];

const categories = [...new Set(nodeTypes.map(n => n.category))];

let idCounter = 1;
const genId = () => `node_${Date.now()}_${idCounter++}`;

export default function VisualWorkflowBuilderPage() {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [toolboxSearch, setToolboxSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(categories));
  const [showProperties, setShowProperties] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [workflowName, setWorkflowName] = useState("\u05EA\u05D4\u05DC\u05D9\u05DA \u05E2\u05D1\u05D5\u05D3\u05D4 \u05D7\u05D3\u05E9");
  const [connecting, setConnecting] = useState<{ nodeId: string; output: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Add node from toolbox
  const addNode = (type: string) => {
    const nodeType = nodeTypes.find(n => n.type === type);
    if (!nodeType) return;
    const defaultProps: Record<string, any> = {};
    nodeType.properties?.forEach(p => { defaultProps[p.key] = p.defaultValue || ""; });
    const newNode: WorkflowNode = {
      id: genId(),
      type,
      x: 300 + Math.random() * 200,
      y: 150 + Math.random() * 200,
      properties: defaultProps,
      label: nodeType.label,
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode.id);
  };

  // Delete node
  const deleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  };

  // Duplicate node
  const duplicateNode = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newNode: WorkflowNode = { ...node, id: genId(), x: node.x + 40, y: node.y + 40, properties: { ...node.properties } };
    setNodes(prev => [...prev, newNode]);
  };

  // Handle canvas drag
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
    setDragOffset({ x: e.clientX - node.x * zoom, y: e.clientY - node.y * zoom });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingNode) return;
    setNodes(prev => prev.map(n => n.id === draggingNode ? { ...n, x: (e.clientX - dragOffset.x) / zoom, y: (e.clientY - dragOffset.y) / zoom } : n));
  }, [draggingNode, dragOffset, zoom]);

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  // Start connection
  const startConnection = (nodeId: string, output: string) => {
    setConnecting({ nodeId, output });
  };

  // End connection
  const endConnection = (nodeId: string, input: string) => {
    if (!connecting || connecting.nodeId === nodeId) { setConnecting(null); return; }
    const exists = connections.some(c => c.from === connecting.nodeId && c.fromOutput === connecting.output && c.to === nodeId);
    if (!exists) {
      setConnections(prev => [...prev, { id: genId(), from: connecting.nodeId, fromOutput: connecting.output, to: nodeId, toInput: input }]);
    }
    setConnecting(null);
  };

  // Load template
  const loadTemplate = (template: Template) => {
    setNodes(template.nodes.map(n => ({ ...n, id: genId() + n.id })));
    // Remap connections with new IDs - simplified
    setNodes(template.nodes);
    setConnections(template.connections);
    setShowTemplates(false);
    setWorkflowName(template.name);
  };

  // Update node property
  const updateNodeProperty = (nodeId: string, key: string, value: any) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, properties: { ...n.properties, [key]: value } } : n));
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const filteredNodeTypes = toolboxSearch ? nodeTypes.filter(n => n.label.includes(toolboxSearch) || n.description.includes(toolboxSearch)) : nodeTypes;
  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  const selectedNodeType = selectedNodeData ? nodeTypes.find(t => t.type === selectedNodeData.type) : null;

  // Save workflow
  const saveWorkflow = async () => {
    try {
      await fetch(`${API}/workflows`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ name: workflowName, nodes, connections, status: "draft" }),
      });
      alert("\u05D4\u05EA\u05D4\u05DC\u05D9\u05DA \u05E0\u05E9\u05DE\u05E8 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4!");
    } catch (err) { console.error(err); }
  };

  return (
    <div dir="rtl" className="h-screen flex flex-col">
      {/* Toolbar */}
      <div className="border-b bg-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow className="w-5 h-5 text-blue-600" />
          <Input value={workflowName} onChange={e => setWorkflowName(e.target.value)} className="w-64 h-8 text-sm font-medium border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500" />
          <Badge variant="outline">{nodes.length} \u05E6\u05DE\u05EA\u05D9\u05DD</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
          <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
            <FileText className="w-4 h-4 ml-1" />\u05EA\u05D1\u05E0\u05D9\u05D5\u05EA
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowProperties(!showProperties)}>
            {showProperties ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
          </Button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <Button variant="outline" size="sm" onClick={saveWorkflow}>
            <Save className="w-4 h-4 ml-1" />\u05E9\u05DE\u05D5\u05E8
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700">
            <Play className="w-4 h-4 ml-1" />\u05D4\u05E8\u05E5
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Toolbox */}
        <div className="w-64 border-l bg-gray-50 overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute right-2 top-2 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E6\u05DE\u05EA\u05D9\u05DD..." value={toolboxSearch} onChange={e => setToolboxSearch(e.target.value)} className="pr-8 text-sm h-8" />
            </div>
          </div>
          <div className="p-2">
            {categories.map(cat => {
              const catNodes = filteredNodeTypes.filter(n => n.category === cat);
              if (catNodes.length === 0) return null;
              const isExpanded = expandedCategories.has(cat);
              return (
                <div key={cat} className="mb-2">
                  <button className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded" onClick={() => toggleCategory(cat)}>
                    <span>{cat}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {isExpanded && (
                    <div className="space-y-1 mt-1">
                      {catNodes.map(nt => {
                        const Icon = nt.icon;
                        return (
                          <button key={nt.type} onClick={() => addNode(nt.type)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
                            title={nt.description}
                          >
                            <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: nt.color + "20" }}>
                              <Icon className="w-3.5 h-3.5" style={{ color: nt.color }} />
                            </div>
                            <span className="truncate">{nt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div ref={canvasRef} className="flex-1 overflow-auto bg-gray-100 relative" onClick={() => { setSelectedNode(null); setConnecting(null); }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: "2000px", minHeight: "1500px" }}>
            {/* Grid pattern */}
            <defs>
              <pattern id="grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse">
                <path d={`M ${20 * zoom} 0 L 0 0 0 ${20 * zoom}`} fill="none" stroke="#e5e7eb" strokeWidth={0.5} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Connections */}
            {connections.map(conn => {
              const fromNode = nodes.find(n => n.id === conn.from);
              const toNode = nodes.find(n => n.id === conn.to);
              if (!fromNode || !toNode) return null;
              const x1 = fromNode.x * zoom + 80;
              const y1 = fromNode.y * zoom + 25;
              const x2 = toNode.x * zoom;
              const y2 = toNode.y * zoom + 25;
              const mx = (x1 + x2) / 2;
              return (
                <g key={conn.id}>
                  <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    fill="none" stroke="#94a3b8" strokeWidth={2} className="pointer-events-auto cursor-pointer hover:stroke-blue-500" />
                  <circle cx={x2} cy={y2} r={3} fill="#94a3b8" />
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(node => {
            const nt = nodeTypes.find(t => t.type === node.type);
            if (!nt) return null;
            const Icon = nt.icon;
            const isSelected = selectedNode === node.id;
            return (
              <div key={node.id}
                className={`absolute bg-white rounded-lg shadow-md border-2 transition-shadow cursor-move select-none ${isSelected ? "border-blue-500 shadow-lg" : "border-gray-200 hover:shadow-lg"}`}
                style={{ left: node.x * zoom, top: node.y * zoom, transform: `scale(${zoom})`, transformOrigin: "top left", minWidth: "160px" }}
                onMouseDown={e => handleMouseDown(e, node.id)}
                onClick={e => { e.stopPropagation(); setSelectedNode(node.id); }}
              >
                {/* Header */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-t-lg" style={{ backgroundColor: nt.color + "15" }}>
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: nt.color }} />
                  <span className="text-xs font-medium truncate">{node.label || nt.label}</span>
                  <div className="mr-auto flex gap-0.5">
                    <button onClick={e => { e.stopPropagation(); duplicateNode(node.id); }} className="opacity-0 group-hover:opacity-100 hover:text-blue-500"><Copy className="w-3 h-3" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteNode(node.id); }} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                </div>

                {/* Inputs */}
                {nt.inputs?.map((inp, i) => (
                  <div key={inp} className="absolute -right-2 flex items-center" style={{ top: 12 + i * 20 }}
                    onClick={e => { e.stopPropagation(); endConnection(node.id, inp); }}>
                    <div className={`w-4 h-4 rounded-full border-2 bg-white cursor-pointer ${connecting ? "border-green-500 animate-pulse" : "border-gray-300 hover:border-blue-500"}`} />
                  </div>
                ))}

                {/* Outputs */}
                {nt.outputs?.map((out, i) => (
                  <div key={out} className="absolute -left-2 flex items-center" style={{ top: 12 + i * 20 }}
                    onClick={e => { e.stopPropagation(); startConnection(node.id, out); }}>
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 bg-white cursor-pointer hover:border-blue-500 hover:bg-blue-50" />
                    <span className="text-[8px] text-gray-400 mr-1">{out}</span>
                  </div>
                ))}

                {/* Footer info */}
                <div className="px-3 py-1 text-[9px] text-gray-400 border-t">{nt.category}</div>
              </div>
            );
          })}

          {/* Connecting indicator */}
          {connecting && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-foreground px-4 py-2 rounded-full text-sm shadow-lg z-10 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />\u05DC\u05D7\u05E5 \u05E2\u05DC \u05E6\u05DE\u05EA \u05D9\u05E2\u05D3 \u05DC\u05D7\u05D9\u05D1\u05D5\u05E8
              <button onClick={() => setConnecting(null)} className="mr-2"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {/* Properties Panel */}
        {showProperties && selectedNodeData && selectedNodeType && (
          <div className="w-72 border-r bg-white overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: selectedNodeType.color + "20" }}>
                  {(() => { const Icon = selectedNodeType.icon; return <Icon className="w-4 h-4" style={{ color: selectedNodeType.color }} />; })()}
                </div>
                <div>
                  <h3 className="font-medium text-sm">{selectedNodeType.label}</h3>
                  <p className="text-xs text-gray-400">{selectedNodeType.description}</p>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">\u05EA\u05D5\u05D5\u05D9\u05EA</label>
                <Input value={selectedNodeData.label || ""} onChange={e => setNodes(prev => prev.map(n => n.id === selectedNodeData.id ? { ...n, label: e.target.value } : n))} className="mt-1 h-8 text-sm" />
              </div>

              {selectedNodeType.properties?.map(prop => (
                <div key={prop.key}>
                  <label className="text-xs font-medium text-gray-500">{prop.label}</label>
                  {prop.type === "text" || prop.type === "email" || prop.type === "number" ? (
                    <Input type={prop.type === "number" ? "number" : "text"} className="mt-1 h-8 text-sm"
                      value={selectedNodeData.properties[prop.key] || ""}
                      onChange={e => updateNodeProperty(selectedNodeData.id, prop.key, prop.type === "number" ? +e.target.value : e.target.value)} />
                  ) : prop.type === "select" ? (
                    <select className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                      value={selectedNodeData.properties[prop.key] || ""}
                      onChange={e => updateNodeProperty(selectedNodeData.id, prop.key, e.target.value)}>
                      <option value="">\u05D1\u05D7\u05E8...</option>
                      {prop.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : prop.type === "textarea" ? (
                    <textarea className="w-full border rounded px-2 py-1.5 text-sm mt-1" rows={3}
                      value={selectedNodeData.properties[prop.key] || ""}
                      onChange={e => updateNodeProperty(selectedNodeData.id, prop.key, e.target.value)} />
                  ) : prop.type === "boolean" ? (
                    <div className="mt-1"><input type="checkbox"
                      checked={!!selectedNodeData.properties[prop.key]}
                      onChange={e => updateNodeProperty(selectedNodeData.id, prop.key, e.target.checked)} />
                    </div>
                  ) : null}
                </div>
              ))}

              <div className="pt-3 border-t flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => duplicateNode(selectedNodeData.id)}>
                  <Copy className="w-3 h-3 ml-1" />\u05E9\u05DB\u05E4\u05DC
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-red-600 hover:bg-red-50" onClick={() => deleteNode(selectedNodeData.id)}>
                  <Trash2 className="w-3 h-3 ml-1" />\u05DE\u05D7\u05E7
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>\u05EA\u05D1\u05E0\u05D9\u05D5\u05EA \u05EA\u05D4\u05DC\u05D9\u05DB\u05D9 \u05E2\u05D1\u05D5\u05D3\u05D4</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {templates.map((tmpl, i) => (
                <div key={i} className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => loadTemplate(tmpl)}>
                  <h3 className="font-medium">{tmpl.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{tmpl.description}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline">{tmpl.nodes.length} \u05E6\u05DE\u05EA\u05D9\u05DD</Badge>
                    <Badge variant="outline">{tmpl.connections.length} \u05D7\u05D9\u05D1\u05D5\u05E8\u05D9\u05DD</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
