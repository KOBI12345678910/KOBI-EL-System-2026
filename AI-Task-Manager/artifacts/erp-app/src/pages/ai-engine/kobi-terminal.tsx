import { useState, useRef, useEffect, useCallback } from "react";
import RenderContentWithCharts from "./render-content-with-charts";
import FileExplorer from "../../components/ai/file-explorer";
import CodeViewer from "../../components/ai/code-viewer";
import TerminalPanel, { type TerminalEntry } from "../../components/ai/terminal-panel";
import PreviewPanel from "../../components/ai/preview-panel";
import MapPanel, { type MapData } from "../../components/ai/map-panel";
import AgentProgressBar from "../../components/ai/agent-progress-bar";
import {
  Send, Trash2, Loader2,
  Terminal, Cpu, Database, Activity,
  CheckCircle2, XCircle, Wrench, Code2,
  FolderTree, FileText, Copy, StopCircle,
  ChevronDown, Zap, Hash, Search, Plus,
  Table2, Globe, BarChart3,
  Layers, Bug, Image as ImageIcon,
  Settings, Package, PenTool, Rocket, LayoutGrid,
  ArrowLeftRight, TestTube, X, Pin, PinOff,
  MessageSquare, Brain, ListTodo, Clock,
  MoreVertical, Edit3, Maximize2, Minimize2,
  Network, Camera, Map as MapIcon, Monitor,
  PanelLeftClose, PanelRightClose, ChevronRight
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface ImageAttachment {
  base64: string;
  media_type: string;
  file_name: string;
  preview_url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolActions?: ToolAction[];
  images?: ImageAttachment[];
}

interface ToolAction {
  name: string;
  input?: any;
  result?: string;
  success?: boolean;
  executing?: boolean;
  time_ms?: number;
}

interface Session {
  id: number;
  title: string;
  status: string;
  agent_type: string;
  total_messages: number;
  total_tool_calls: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface TabState {
  sessionId: number | null;
  messages: Message[];
  isStreaming: boolean;
  streamContent: string;
  activeTools: ToolAction[];
  title: string;
  agentId: number;
  status: "idle" | "working" | "done" | "error";
  startedAt?: Date;
  completedAt?: Date;
  toolCount: number;
  filesChanged: string[];
  terminalEntries: TerminalEntry[];
  mapData: MapData | null;
  previewUrl: string;
  activeToolName?: string;
}

const TOOL_ICONS: Record<string, typeof Cpu> = {
  read_file: FileText, write_file: Code2, edit_file: PenTool, delete_file: Trash2,
  list_files: FolderTree, search_files: Search, run_sql: Database, run_command: Terminal,
  manage_module: Layers, manage_menu: Hash, system_health: Activity,
  create_page: LayoutGrid, create_api_route: Globe, create_table: Table2,
  data_operations: ArrowLeftRight, analyze_code: Bug, api_test: TestTube,
  add_field: Settings, stream_data: Network, db_schema: Database, task_queue: ListTodo,
  erp_query: Search, financial_calc: Activity, user_management: Settings,
  report_generator: Table2, notification_send: Activity, data_validator: Bug,
  bulk_update: ArrowLeftRight, erp_insights: BarChart3, customer_service: Search,
  inventory_check: Database, backup_restore: FolderTree, workflow_trigger: Rocket,
  smart_fix: Bug, deploy_check: Rocket, export_report: FileText, import_data: Package,
  scheduler: Clock, automation_trigger: Zap, agent_status: Cpu,
  build_feature: Rocket, package_manager: Package, git_ops: Code2,
  analyze_image: Camera, show_map: MapIcon,
};

const TOOL_LABELS: Record<string, string> = {
  read_file: "קריאת קובץ", write_file: "כתיבת קובץ", edit_file: "עריכת קובץ",
  delete_file: "מחיקת קובץ", list_files: "סריקת קבצים", search_files: "חיפוש בקוד",
  run_sql: "שאילתת SQL", run_command: "הרצת פקודה", manage_module: "ניהול מודול",
  manage_menu: "ניהול תפריט", system_health: "בדיקת מערכת", create_page: "יצירת דף",
  create_api_route: "יצירת API", create_table: "יצירת טבלה",
  data_operations: "פעולות נתונים", analyze_code: "ניתוח קוד", api_test: "בדיקת API",
  add_field: "הוספת עמודה", stream_data: "העברת נתונים", db_schema: "סכמת DB", task_queue: "ניהול משימות",
  erp_query: "שאילתת ERP", financial_calc: "חישוב פיננסי", user_management: "ניהול משתמשים",
  report_generator: "יצירת דוח", notification_send: "שליחת התראה", data_validator: "אימות נתונים",
  bulk_update: "עדכון המוני", erp_insights: "תובנות עסקיות", customer_service: "שירות לקוחות",
  inventory_check: "בדיקת מלאי", backup_restore: "גיבוי/שחזור", workflow_trigger: "הפעלת תהליך",
  smart_fix: "תיקון אוטומטי", deploy_check: "בדיקת מוכנות", export_report: "ייצוא דוח", import_data: "יבוא נתונים",
  scheduler: "תזמון משימות", automation_trigger: "טריגר אוטומטי", agent_status: "סטטוס סוכן",
  build_feature: "בניית פיצ'ר מלא", package_manager: "ניהול חבילות", git_ops: "פעולות Git",
  analyze_image: "ניתוח תמונה", show_map: "הצגת מפה",
};

const QUICK_ACTIONS = [
  { icon: BarChart3, label: "סקירה עסקית", prompt: "תן לי סקירה עסקית כללית — לקוחות, מוצרים, הזמנות, מלאי, חשבוניות" },
  { icon: Activity, label: "בדיקת מערכת", prompt: "בצע בדיקת בריאות מלאה למערכת — API, DB, טבלאות, זיכרון, שגיאות" },
  { icon: Database, label: "מלאי נמוך", prompt: "הצג פריטים עם מלאי נמוך שדורשים הזמנה" },
  { icon: Zap, label: "דוח הכנסות", prompt: "הכן סיכום הכנסות — סה\"כ חשבוניות, ממוצע, טופ 10 לקוחות" },
  { icon: Bug, label: "תקן שגיאות", prompt: "מצא ותקן שגיאות אוטומטית — routes שבורים, NULLs, טבלאות חסרות" },
  { icon: Layers, label: "מודולים", prompt: "הצג את כל המודולים והטבלאות במערכת ERP" },
  { icon: Globe, label: "ייצא Excel", prompt: "ייצא דוח של כל הלקוחות לקובץ Excel" },
  { icon: Package, label: "ייבא נתונים", prompt: "נתח קובץ CSV/Excel ויבא נתונים לטבלה" },
  { icon: Clock, label: "חובות פתוחים", prompt: "הצג דוח גיול חובות — חשבוניות פתוחות לפי תקופה" },
  { icon: ListTodo, label: "משימות", prompt: "הצג את כל המשימות הפעילות שלי" },
  { icon: Brain, label: "תובנות BI", prompt: "תן תובנות עסקיות — מגמות, KPIs, המלצות לשיפור" },
  { icon: MapIcon, label: "מפת לקוחות", prompt: "הראה לי את כל הלקוחות על מפה גאוגרפית" },
];

let terminalIdCounter = 0;

export default function KobiTerminal() {
  const agentCounter = useRef(1);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tabs, setTabs] = useState<TabState[]>([createNewTab()]);
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"sessions" | "memory" | "tasks">("sessions");
  const [memories, setMemories] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [chatDragOver, setChatDragOver] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTaskInput, setSplitTaskInput] = useState("");

  const [centerPanel, setCenterPanel] = useState(true);
  const [rightPanel, setRightPanel] = useState(false);
  const [centerTab, setCenterTab] = useState<"files" | "code" | "terminal">("files");
  const [rightTab, setRightTab] = useState<"preview" | "map">("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const abortRefs = useRef<Map<number, AbortController>>(new Map());

  function createNewTab(): TabState {
    const id = agentCounter.current++;
    return {
      sessionId: null,
      messages: [],
      isStreaming: false,
      streamContent: "",
      activeTools: [],
      title: `סוכן #${id}`,
      agentId: id,
      status: "idle",
      toolCount: 0,
      filesChanged: [],
      terminalEntries: [],
      mapData: null,
      previewUrl: "",
    };
  }

  const activeTab = tabs[activeTabIdx] || tabs[0];

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTab?.messages, activeTab?.streamContent, activeTab?.activeTools]);

  const loadSessions = async () => {
    try {
      const r = await authFetch(`${API}/kobi/sessions`);
      const data = await r.json();
      setSessions(data.sessions || []);
    } catch {}
  };

  const loadMemories = async () => {
    try {
      const r = await authFetch(`${API}/kobi/memory`);
      const data = await r.json();
      setMemories(data.memories || []);
    } catch {}
  };

  const loadTasks = async () => {
    try {
      const r = await authFetch(`${API}/kobi/tasks`);
      const data = await r.json();
      setTasks(data.tasks || []);
    } catch {}
  };

  const addNewTab = () => {
    const newTab = createNewTab();
    setTabs(prev => [...prev, newTab]);
    setActiveTabIdx(tabs.length);
  };

  const closeTab = (idx: number) => {
    if (tabs.length <= 1) return;
    const tabToClose = tabs[idx];
    if (tabToClose.isStreaming) {
      const controller = abortRefs.current.get(idx);
      controller?.abort();
    }
    setTabs(prev => prev.filter((_, i) => i !== idx));
    if (activeTabIdx >= idx && activeTabIdx > 0) {
      setActiveTabIdx(prev => prev - 1);
    }
  };

  const updateTab = (idx: number, updates: Partial<TabState>) => {
    setTabs(prev => prev.map((t, i) => i === idx ? { ...t, ...updates } : t));
  };

  const openSession = async (session: Session) => {
    try {
      const r = await authFetch(`${API}/kobi/sessions/${session.id}/messages`);
      const data = await r.json();
      const msgs: Message[] = (data.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
        toolActions: m.tool_calls && m.tool_calls.length > 0 ? m.tool_calls : undefined,
      }));
      const existingIdx = tabs.findIndex(t => t.sessionId === session.id);
      if (existingIdx >= 0) {
        setActiveTabIdx(existingIdx);
        updateTab(existingIdx, { messages: msgs });
      } else {
        const newTab: TabState = {
          ...createNewTab(),
          sessionId: session.id,
          messages: msgs,
          title: session.title,
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabIdx(tabs.length);
      }
    } catch {}
  };

  const deleteSession = async (sessionId: number) => {
    try {
      await authFetch(`${API}/kobi/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      const tabIdx = tabs.findIndex(t => t.sessionId === sessionId);
      if (tabIdx >= 0) closeTab(tabIdx);
    } catch {}
  };

  const pinSession = async (sessionId: number, pinned: boolean) => {
    try {
      await authFetch(`${API}/kobi/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      loadSessions();
    } catch {}
  };

  const handleImageUpload = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("image", file);
        const res = await authFetch(`${API}/kobi/upload`, { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          const previewUrl = URL.createObjectURL(file);
          setPendingImages(prev => [...prev, {
            base64: data.base64,
            media_type: data.media_type,
            file_name: data.file_name,
            preview_url: previewUrl,
          }]);
        }
      }
    } catch (e) {
      console.error("Image upload error:", e);
    }
    setUploadingImage(false);
  }, []);

  const removePendingImage = useCallback((idx: number) => {
    setPendingImages(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].preview_url);
      next.splice(idx, 1);
      return next;
    });
  }, []);

  const handleChatPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const f = items[i].getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleImageUpload(imageFiles);
    }
  }, [handleImageUpload]);

  const handleChatDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setChatDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
      if (imageFiles.length > 0) handleImageUpload(imageFiles);
    }
  }, [handleImageUpload]);

  const sendMessage = useCallback(async (text?: string, tabIdx?: number) => {
    const idx = tabIdx ?? activeTabIdx;
    const tab = tabs[idx];
    if (!tab) return;
    const msg = text || "";
    if ((!msg.trim() && pendingImages.length === 0) || tab.isStreaming) return;

    const currentImages = [...pendingImages];
    if (tabIdx === undefined || tabIdx === activeTabIdx) setPendingImages([]);

    const userMsg: Message = {
      role: "user",
      content: msg || (currentImages.length > 0 ? "נתח את התמונה" : ""),
      timestamp: new Date(),
      images: currentImages.length > 0 ? currentImages : undefined,
    };
    const updatedMsgs = [...tab.messages, userMsg];
    const isNewAgent = tab.title.startsWith("סוכן #");
    updateTab(idx, {
      messages: updatedMsgs,
      isStreaming: true,
      streamContent: "",
      activeTools: [],
      title: isNewAgent ? msg.slice(0, 40) || tab.title : tab.title,
      status: "working",
      startedAt: new Date(),
      toolCount: 0,
      filesChanged: [],
    });

    const controller = new AbortController();
    abortRefs.current.set(idx, controller);

    try {
      const allMessages = updatedMsgs.map(m => {
        const out: any = { role: m.role, content: m.content };
        if (m.images && m.images.length > 0) {
          out.images = m.images.map(img => ({ base64: img.base64, media_type: img.media_type }));
        }
        return out;
      });

      const response = await authFetch(`${API}/kobi/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          sessionId: tab.sessionId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`שגיאה ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      const toolActions: ToolAction[] = [];
      const changedFiles: string[] = [];
      const termEntries: TerminalEntry[] = [...(tab.terminalEntries || [])];
      let latestMapData: MapData | null = tab.mapData;
      let latestPreviewUrl = tab.previewUrl || "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.session_id && !tabs[idx]?.sessionId) {
              updateTab(idx, { sessionId: data.session_id });
            }

            if (data.content) {
              fullContent += data.content;
              updateTab(idx, { streamContent: fullContent });
            }

            if (data.tool_start) {
              toolActions.push({ name: data.tool_start, executing: true });
              updateTab(idx, { activeTools: [...toolActions], activeToolName: TOOL_LABELS[data.tool_start] || data.tool_start });
            }

            if (data.tool_executing) {
              const last = toolActions[toolActions.length - 1];
              if (last) {
                last.input = data.tool_input;
                updateTab(idx, { activeTools: [...toolActions] });
              }
            }

            if (data.tool_result) {
              const matching = toolActions.find(t => t.name === data.tool_result && t.executing);
              if (matching) {
                matching.result = data.result;
                matching.success = data.success;
                matching.executing = false;
                matching.time_ms = data.time_ms;
                updateTab(idx, { activeTools: [...toolActions], toolCount: toolActions.length });
              }
            }

            if (data.file_changed) {
              changedFiles.push(data.file_changed);
              updateTab(idx, { filesChanged: [...changedFiles] });
              if (!centerPanel) setCenterPanel(true);
              setCenterTab("code");
              setSelectedFile(data.file_changed);
            }

            if (data.command_output) {
              const entry: TerminalEntry = {
                id: ++terminalIdCounter,
                type: data.command_output.startsWith("SQL:") ? "sql" : "command",
                command: data.command_output,
                output: data.output || "",
                timestamp: new Date(),
              };
              termEntries.push(entry);
              updateTab(idx, { terminalEntries: [...termEntries] });
            }

            if (data.map_data) {
              latestMapData = data.map_data;
              updateTab(idx, { mapData: data.map_data });
              setRightPanel(true);
              setRightTab("map");
            }

            if (data.preview_url) {
              latestPreviewUrl = data.preview_url;
              updateTab(idx, { previewUrl: data.preview_url });
              setRightPanel(true);
              setRightTab("preview");
            }

            if (data.done) {
              fullContent = data.fullContent || fullContent;
            }

            if (data.error) {
              fullContent += `\n\n❌ ${data.error}`;
              updateTab(idx, { streamContent: fullContent });
            }
          } catch {}
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) fullContent += data.content;
            if (data.done) fullContent = data.fullContent || fullContent;
          } catch {}
        }
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: fullContent,
        timestamp: new Date(),
        toolActions: toolActions.length > 0 ? [...toolActions] : undefined,
      };

      setTabs(prev => prev.map((t, i) => i === idx ? {
        ...t,
        messages: [...updatedMsgs, assistantMsg],
        isStreaming: false,
        streamContent: "",
        activeTools: [],
        status: "done",
        completedAt: new Date(),
        toolCount: toolActions.length,
        filesChanged: changedFiles,
        terminalEntries: termEntries,
        mapData: latestMapData,
        previewUrl: latestPreviewUrl,
        activeToolName: undefined,
      } : t));

      loadSessions();
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setTabs(prev => prev.map((t, i) => i === idx ? {
          ...t,
          messages: [...updatedMsgs, { role: "assistant" as const, content: `❌ שגיאה: ${err.message}`, timestamp: new Date() }],
          isStreaming: false,
          streamContent: "",
          activeTools: [],
          status: "error",
        } : t));
      } else {
        updateTab(idx, { isStreaming: false, streamContent: "", activeTools: [], status: "idle" });
      }
    } finally {
      abortRefs.current.delete(idx);
    }
  }, [activeTabIdx, tabs, pendingImages, centerPanel]);

  const stopStreaming = (idx: number) => {
    const controller = abortRefs.current.get(idx);
    controller?.abort();
    updateTab(idx, { isStreaming: false, status: "idle" });
  };

  const stopAllAgents = () => {
    tabs.forEach((_, idx) => {
      if (tabs[idx].isStreaming) stopStreaming(idx);
    });
  };

  const splitTask = useCallback((taskText: string) => {
    const lines = taskText.split("\n").filter(l => l.trim());
    if (lines.length === 0) return;
    const newTabs: TabState[] = [];
    for (const line of lines) {
      const newTab = createNewTab();
      newTab.title = line.slice(0, 40);
      newTabs.push(newTab);
    }
    const currentLen = tabs.length;
    setTabs(prev => [...prev, ...newTabs]);
    setShowSplitModal(false);
    setSplitTaskInput("");
    setTimeout(() => {
      lines.forEach((line, i) => {
        const targetIdx = currentLen + i;
        setTimeout(() => { sendMessage(line.trim(), targetIdx); }, i * 500);
      });
    }, 300);
  }, [tabs.length, sendMessage]);

  const runningAgents = tabs.filter(t => t.isStreaming).length;
  const doneAgents = tabs.filter(t => t.status === "done").length;
  const [inputValue, setInputValue] = useState("");

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    setCenterTab("code");
  };

  return (
    <div className={`h-screen flex flex-col bg-background text-foreground ${isFullscreen ? "fixed inset-0 z-50" : ""}`} dir="rtl">
      <AgentProgressBar
        status={activeTab.status}
        toolCount={activeTab.toolCount}
        filesChanged={activeTab.filesChanged?.length || 0}
        startedAt={activeTab.startedAt}
        completedAt={activeTab.completedAt}
        activeToolName={activeTab.activeToolName}
        totalAgents={tabs.length}
        runningAgents={runningAgents}
      />

      <div className="border-b border-purple-500/15 bg-background">
        <div className="flex items-center">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-purple-400/50 hover:text-purple-300 transition-colors"
            title={sidebarOpen ? "הסתר סרגל" : "הצג סרגל"}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center overflow-x-auto gap-0.5 px-1">
            {tabs.map((tab, idx) => {
              const statusColor = tab.isStreaming ? "bg-amber-400 animate-pulse" :
                tab.status === "done" ? "bg-emerald-400" :
                tab.status === "error" ? "bg-red-400" : "bg-muted";
              return (
                <div
                  key={idx}
                  onClick={() => setActiveTabIdx(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer min-w-0 max-w-[200px] group transition-colors ${
                    idx === activeTabIdx
                      ? "bg-background border-t border-x border-purple-500/20 text-purple-200"
                      : "text-gray-500 hover:text-gray-300 hover:bg-muted/30"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                  {tab.isStreaming && <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />}
                  <span className="text-[11px] truncate">{tab.title}</span>
                  {tab.toolCount > 0 && !tab.isStreaming && (
                    <span className="text-[9px] text-purple-500/50 flex-shrink-0">{tab.toolCount}</span>
                  )}
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(idx); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button onClick={addNewTab} className="p-1.5 rounded-lg text-emerald-500/60 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors flex-shrink-0" title="סוכן חדש">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSplitModal(true)} className="p-1.5 rounded-lg text-blue-500/60 hover:text-blue-300 hover:bg-blue-500/10 transition-colors flex-shrink-0" title="חלוקת משימות">
              <Layers className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2">
            <button
              onClick={() => setCenterPanel(!centerPanel)}
              className={`p-1.5 rounded-lg transition-colors ${centerPanel ? "text-purple-400 bg-purple-500/10" : "text-gray-600 hover:text-gray-400"}`}
              title="קוד/קבצים/טרמינל"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setRightPanel(!rightPanel)}
              className={`p-1.5 rounded-lg transition-colors ${rightPanel ? "text-blue-400 bg-blue-500/10" : "text-gray-600 hover:text-gray-400"}`}
              title="Preview/מפה"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>

            {runningAgents > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-[10px] text-amber-300">{runningAgents} פעילים</span>
                <button onClick={stopAllAgents} className="mr-1 text-red-400 hover:text-red-300" title="עצור הכל">
                  <StopCircle className="w-3 h-3" />
                </button>
              </div>
            )}
            {doneAgents > 0 && !runningAgents && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-emerald-300">{doneAgents} סיימו</span>
              </div>
            )}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg text-gray-600 hover:text-purple-300 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSplitModal(false)}>
          <div className="bg-[#12121a] border border-purple-500/20 rounded-2xl p-6 w-[520px] max-h-[80vh] overflow-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-foreground">חלוקת משימות לסוכנים</h3>
              </div>
              <button onClick={() => setShowSplitModal(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">כתוב כל משימה בשורה נפרדת. כל שורה תפתח סוכן עצמאי שיעבוד במקביל.</p>
            <textarea
              value={splitTaskInput}
              onChange={e => setSplitTaskInput(e.target.value)}
              placeholder={"בדוק מלאי נמוך ושלח התראות\nהכן דוח הכנסות חודשי\nנתח גיול חובות פתוחים\nצור דף חדש לניהול ספקים"}
              className="w-full h-40 px-4 py-3 rounded-xl bg-muted/50 border border-border/50 focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 text-sm text-foreground placeholder-gray-600 outline-none resize-none"
              dir="rtl"
            />
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">
                {splitTaskInput.split("\n").filter(l => l.trim()).length} משימות
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowSplitModal(false)} className="px-4 py-2 rounded-lg bg-muted/50 text-gray-300 text-sm hover:bg-muted">ביטול</button>
                <button
                  onClick={() => splitTask(splitTaskInput)}
                  disabled={!splitTaskInput.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-foreground text-sm font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-30 flex items-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  הפעל
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <div className="w-56 border-l border-purple-500/15 bg-[#0a0a12] flex flex-col flex-shrink-0">
            <div className="flex items-center gap-1 px-2 py-2 border-b border-purple-500/10">
              {(["sessions", "memory", "tasks"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setSidebarTab(tab);
                    if (tab === "memory") loadMemories();
                    if (tab === "tasks") loadTasks();
                  }}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    sidebarTab === tab ? "bg-purple-500/15 text-purple-300" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"
                  }`}
                >
                  {tab === "sessions" ? "שיחות" : tab === "memory" ? "זיכרון" : "משימות"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sidebarTab === "sessions" && (
                <>
                  <button onClick={addNewTab} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/8 border border-purple-500/15 hover:bg-purple-500/15 text-xs text-purple-300 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    שיחה חדשה
                  </button>
                  {sessions.map(s => (
                    <div
                      key={s.id}
                      className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                        tabs[activeTabIdx]?.sessionId === s.id ? "bg-purple-500/15 border border-purple-500/25" : "hover:bg-muted/40 border border-transparent"
                      }`}
                      onClick={() => openSession(s)}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-purple-500/50 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-300 truncate flex-1">{s.title}</span>
                          {s.pinned && <Pin className="w-2.5 h-2.5 text-purple-400" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                          <span>{s.total_messages} הודעות</span>
                          <span>{s.total_tool_calls} כלים</span>
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); pinSession(s.id, !s.pinned); }} className="p-0.5 rounded hover:bg-purple-500/20">
                          {s.pinned ? <PinOff className="w-3 h-3 text-purple-400" /> : <Pin className="w-3 h-3 text-gray-500" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="p-0.5 rounded hover:bg-red-500/20">
                          <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {sidebarTab === "memory" && (
                <div className="space-y-1">
                  {memories.length === 0 && (
                    <div className="text-center py-6">
                      <Brain className="w-8 h-8 text-purple-500/30 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">הזיכרון ריק עדיין</p>
                    </div>
                  )}
                  {memories.map(m => (
                    <div key={m.id} className="px-2.5 py-2 rounded-lg bg-muted/30 border border-border/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-purple-400 font-medium">{m.category}</span>
                        <button onClick={async () => { await authFetch(`${API}/kobi/memory/${m.id}`, { method: "DELETE" }); loadMemories(); }} className="p-0.5 rounded hover:bg-red-500/20">
                          <X className="w-2.5 h-2.5 text-gray-600" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-300 mt-0.5">{m.key}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === "tasks" && (
                <div className="space-y-1">
                  {tasks.length === 0 && (
                    <div className="text-center py-6">
                      <ListTodo className="w-8 h-8 text-purple-500/30 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">אין משימות</p>
                    </div>
                  )}
                  {tasks.map(t => (
                    <div key={t.id} className="px-2.5 py-2 rounded-lg bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          t.status === "completed" ? "bg-emerald-400" :
                          t.status === "running" ? "bg-amber-400 animate-pulse" :
                          t.status === "failed" ? "bg-red-400" : "bg-gray-500"
                        }`} />
                        <span className="text-xs text-gray-300">{t.title}</span>
                      </div>
                      {t.progress > 0 && (
                        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${t.progress}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className="flex-1 flex flex-col min-w-0"
          onDragOver={e => { e.preventDefault(); setChatDragOver(true); }}
          onDragLeave={e => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setChatDragOver(false); }}
          onDrop={handleChatDrop}
        >
          <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 transition-colors ${chatDragOver ? "bg-purple-500/5 ring-2 ring-inset ring-purple-500/30" : ""}`}>
            {activeTab.messages.length === 0 && !activeTab.isStreaming && (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/15 to-violet-600/15 border border-purple-500/25 flex items-center justify-center">
                    <Cpu className="w-8 h-8 text-purple-400" />
                  </div>
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                    <Rocket className="w-2.5 h-2.5 text-foreground" />
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="text-lg font-bold text-purple-200 mb-1">קובי — סוכן AI אוטונומי</h2>
                  <p className="text-xs text-purple-400/50 max-w-md">
                    45 כלים • IDE חי • מפה גאוגרפית • סוכנים מקבילים • Vision • פיתוח מלא
                  </p>
                </div>
                <div className="w-full max-w-2xl">
                  <div className="grid grid-cols-4 gap-1.5">
                    {QUICK_ACTIONS.map((action, i) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={i}
                          onClick={() => { setInputValue(""); sendMessage(action.prompt, activeTabIdx); }}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/8 hover:bg-purple-500/12 hover:border-purple-500/20 transition-all text-[11px] text-purple-300/70 hover:text-purple-200 text-right group"
                        >
                          <Icon className="w-3 h-3 text-purple-500/40 group-hover:text-purple-400 flex-shrink-0" />
                          <span className="truncate">{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab.messages.map((msg, idx) => (
              <MessageBubble key={idx} msg={msg} />
            ))}

            {activeTab.isStreaming && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <Cpu className="w-4 h-4 text-purple-400 animate-pulse" />
                </div>
                <div className="flex-1 max-w-[85%]">
                  {activeTab.activeTools.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {activeTab.activeTools.map((tool, i) => (
                        <ToolActionCard key={i} tool={tool} />
                      ))}
                    </div>
                  )}
                  {activeTab.streamContent && (
                    <div className="rounded-xl px-4 py-3 bg-purple-500/5 border border-purple-500/10">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <RenderContentWithCharts content={activeTab.streamContent} />
                      </div>
                    </div>
                  )}
                  {!activeTab.streamContent && activeTab.activeTools.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-purple-400/60">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      קובי חושב...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-purple-500/12 bg-background">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { handleImageUpload(e.target.files); e.target.value = ""; }}
            />
            {pendingImages.length > 0 && (
              <div className="flex gap-2 mb-2 max-w-4xl mx-auto flex-wrap">
                {pendingImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img.preview_url} alt={img.file_name} className="w-16 h-16 rounded-lg object-cover border border-purple-500/20" />
                    <button onClick={() => removePendingImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 max-w-4xl mx-auto">
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={activeTab.isStreaming || uploadingImage}
                className="p-3 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200 disabled:opacity-30 transition-colors flex-shrink-0"
                title="העלאת תמונה לניתוח"
              >
                {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              </button>
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (inputValue.trim() || pendingImages.length > 0) {
                        sendMessage(inputValue.trim(), activeTabIdx);
                        setInputValue("");
                      }
                    }
                  }}
                  onPaste={handleChatPaste}
                  placeholder={pendingImages.length > 0 ? "שאל שאלה על התמונה..." : "תן לקובי משימה — בנה, תקן, שדרג, צור, נתח, הראה על מפה..."}
                  className="w-full px-4 py-3 rounded-xl bg-purple-500/5 border border-purple-500/12 focus:border-purple-500/35 focus:ring-1 focus:ring-purple-500/15 resize-none text-sm text-foreground placeholder-purple-400/25 outline-none transition-all"
                  rows={inputValue.split("\n").length > 3 ? 4 : 2}
                  dir="rtl"
                  disabled={activeTab.isStreaming}
                />
              </div>
              {activeTab.isStreaming ? (
                <button onClick={() => stopStreaming(activeTabIdx)} className="p-3 rounded-xl bg-red-500/12 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (inputValue.trim() || pendingImages.length > 0) {
                      sendMessage(inputValue.trim(), activeTabIdx);
                      setInputValue("");
                    }
                  }}
                  disabled={!inputValue.trim() && pendingImages.length === 0}
                  className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 text-foreground shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 disabled:opacity-15 disabled:shadow-none transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {centerPanel && (
          <div className="w-80 border-r border-purple-500/15 flex flex-col flex-shrink-0">
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-purple-500/10 bg-background">
              {([
                { key: "files" as const, icon: FolderTree, label: "קבצים" },
                { key: "code" as const, icon: Code2, label: "קוד" },
                { key: "terminal" as const, icon: Terminal, label: "טרמינל" },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setCenterTab(t.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                    centerTab === t.key ? "bg-purple-500/15 text-purple-300" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"
                  }`}
                >
                  <t.icon className="w-3 h-3" />
                  {t.label}
                </button>
              ))}
              <div className="flex-1" />
              <button onClick={() => setCenterPanel(false)} className="p-0.5 rounded hover:bg-muted/50 text-gray-600 hover:text-gray-400">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {centerTab === "files" && (
                <FileExplorer
                  onFileSelect={handleFileSelect}
                  highlightedFiles={activeTab.filesChanged}
                />
              )}
              {centerTab === "code" && (
                <CodeViewer
                  filePath={selectedFile}
                  onClose={() => { setSelectedFile(null); setCenterTab("files"); }}
                />
              )}
              {centerTab === "terminal" && (
                <TerminalPanel
                  entries={activeTab.terminalEntries || []}
                  onClear={() => updateTab(activeTabIdx, { terminalEntries: [] })}
                />
              )}
            </div>
          </div>
        )}

        {rightPanel && (
          <div className="w-80 border-r border-purple-500/15 flex flex-col flex-shrink-0">
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-purple-500/10 bg-background">
              {([
                { key: "preview" as const, icon: Monitor, label: "Preview" },
                { key: "map" as const, icon: MapIcon, label: "מפה" },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setRightTab(t.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                    rightTab === t.key ? "bg-blue-500/15 text-blue-300" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"
                  }`}
                >
                  <t.icon className="w-3 h-3" />
                  {t.label}
                </button>
              ))}
              <div className="flex-1" />
              <button onClick={() => setRightPanel(false)} className="p-0.5 rounded hover:bg-muted/50 text-gray-600 hover:text-gray-400">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === "preview" && (
                <PreviewPanel
                  url={activeTab.previewUrl || ""}
                  onUrlChange={(url) => updateTab(activeTabIdx, { previewUrl: url })}
                />
              )}
              {rightTab === "map" && (
                <MapPanel data={activeTab.mapData} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  return (
    <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
        msg.role === "user"
          ? "bg-blue-500/15 border border-blue-500/20"
          : "bg-purple-500/15 border border-purple-500/20"
      }`}>
        {msg.role === "user" ? <Send className="w-3.5 h-3.5 text-blue-400" /> : <Cpu className="w-3.5 h-3.5 text-purple-400" />}
      </div>
      <div className={`flex-1 max-w-[85%] ${msg.role === "user" ? "text-right" : ""}`}>
        {msg.toolActions && msg.toolActions.length > 0 && (
          <div className="mb-2 space-y-1">
            {msg.toolActions.map((tool, ti) => (
              <ToolActionCard key={ti} tool={tool} />
            ))}
          </div>
        )}
        <div className={`rounded-xl px-4 py-3 ${
          msg.role === "user" ? "bg-blue-500/8 border border-blue-500/12" : "bg-purple-500/4 border border-purple-500/8"
        }`}>
          {msg.role === "assistant" ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <RenderContentWithCharts content={msg.content} />
            </div>
          ) : (
            <>
              {msg.images && msg.images.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {msg.images.map((img, i) => (
                    <img key={i} src={img.preview_url || `data:${img.media_type};base64,${img.base64.slice(0, 100)}`} alt={img.file_name} className="w-24 h-24 rounded-lg object-cover border border-blue-500/20" />
                  ))}
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-[10px] text-gray-600">{msg.timestamp.toLocaleTimeString("he-IL")}</span>
          {msg.role === "assistant" && (
            <>
              <button onClick={() => navigator.clipboard.writeText(msg.content)} className="text-gray-600 hover:text-purple-400 transition-colors">
                <Copy className="w-3 h-3" />
              </button>
              {msg.toolActions && <span className="text-[10px] text-purple-500/40">{msg.toolActions.length} כלים</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolActionCard({ tool }: { tool: ToolAction }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[tool.name] || Wrench;
  const label = TOOL_LABELS[tool.name] || tool.name;
  const inputPreview = tool.input
    ? (tool.input.path || tool.input.query?.slice(0, 50) || tool.input.command?.slice(0, 50) || tool.input.pattern?.slice(0, 50) || tool.input.action || tool.input.page_path || tool.input.table_name || tool.input.method || "")
    : "";

  return (
    <div className={`rounded-lg border overflow-hidden transition-all ${
      tool.executing
        ? "border-amber-500/20 bg-amber-500/4"
        : tool.success !== false
          ? "border-emerald-500/12 bg-emerald-500/3"
          : "border-red-500/12 bg-red-500/3"
    }`}>
      <button
        onClick={() => !tool.executing && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-right"
      >
        {tool.executing ? (
          <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />
        ) : tool.success !== false ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
        )}
        <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
        {inputPreview && <span className="text-[10px] text-gray-500 truncate max-w-[200px] font-mono">{inputPreview}</span>}
        <span className="flex-1" />
        {tool.time_ms !== undefined && !tool.executing && <span className="text-[9px] text-gray-600">{tool.time_ms}ms</span>}
        {!tool.executing && <ChevronDown className={`w-2.5 h-2.5 text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`} />}
      </button>
      {expanded && tool.result && (
        <div className="px-3 py-2 border-t border-border/20 max-h-60 overflow-auto bg-[#090910]">
          <pre className="text-[10px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{tool.result}</pre>
        </div>
      )}
    </div>
  );
}
