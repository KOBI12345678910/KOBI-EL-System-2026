import { useState, useRef, useEffect, useCallback } from "react";
import {
  Cpu, Send, X, Loader2, StopCircle,
  CheckCircle2, XCircle, Wrench, ChevronDown,
  FileText, Code2, PenTool, Trash2, FolderTree,
  Search, Database, Terminal, Layers, Hash,
  Activity, LayoutGrid, Globe, Table2,
  ArrowLeftRight, Bug, TestTube, Settings,
  Network, ListTodo, Copy, Rocket, Upload, ImagePlus
} from "lucide-react";
import RenderContentWithCharts from "../../pages/ai-engine/render-content-with-charts";
import { authFetch } from "../../lib/utils";

const API = "/api";

interface ChatImage {
  base64: string;
  media_type: string;
  name: string;
  preview_url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolActions?: ToolAction[];
  images?: ChatImage[];
}

interface ToolAction {
  name: string;
  input?: any;
  result?: string;
  success?: boolean;
  executing?: boolean;
  time_ms?: number;
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
  bulk_update: ArrowLeftRight, erp_insights: Activity, customer_service: Search,
  inventory_check: Database, backup_restore: FolderTree, workflow_trigger: Rocket,
  smart_fix: Bug, deploy_check: Rocket, export_report: FileText, import_data: Upload,
  scheduler: Activity, automation_trigger: Rocket, agent_status: Cpu,
  build_feature: Rocket, package_manager: Upload, git_ops: Code2,
  analyze_image: Activity,
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
  bulk_update: "עדכון המוני", erp_insights: "תובנות עסקיות", customer_service: "שרות לקוחות",
  inventory_check: "בדיקת מלאי", backup_restore: "גיבוי/שחזור", workflow_trigger: "הפעלת תהליך",
  smart_fix: "תיקון אוטומטי", deploy_check: "בדיקת מוכנות", export_report: "ייצוא דוח", import_data: "יבוא נתונים",
  scheduler: "תזמון משימות", automation_trigger: "טריגר אוטומטי", agent_status: "סטטוס סוכן",
  build_feature: "בניית פיצ'ר מלא", package_manager: "ניהול חבילות", git_ops: "פעולות Git",
  analyze_image: "ניתוח תמונה",
};

const QUICK_PROMPTS = [
  { label: "סקירה עסקית", prompt: "תן לי סקירה עסקית כללית — לקוחות, מוצרים, הזמנות, מלאי, חשבוניות" },
  { label: "בדיקת מערכת", prompt: "בצע בדיקת בריאות מלאה למערכת — API, DB, טבלאות, זיכרון, שגיאות" },
  { label: "מלאי נמוך", prompt: "הצג מוצרים במלאי נמוך ושווי מלאי כולל" },
  { label: "דוח גיול חובות", prompt: "הצג דוח גיול חובות — חשבוניות פתוחות לפי תקופה" },
  { label: "סיכום הכנסות", prompt: "הצג סיכום הכנסות חודשי מתחילת השנה" },
  { label: "תובנות BI", prompt: "הצג מגמות מכירות, טופ לקוחות, וטופ מוצרים" },
];

interface KobiAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KobiAgentPanel({ isOpen, onClose }: KobiAgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [activeTools, setActiveTools] = useState<ToolAction[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [chatImages, setChatImages] = useState<ChatImage[]>([]);
  const [chatDragOver, setChatDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, activeTools]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleImageUpload = useCallback(async (files: FileList | File[]) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
    for (const file of Array.from(files)) {
      if (!allowed.includes(file.type)) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        const preview_url = result;
        setChatImages(prev => [...prev, { base64, media_type: file.type, name: file.name, preview_url }]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleChatDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setChatDragOver(false);
    if (e.dataTransfer.files.length > 0) handleImageUpload(e.dataTransfer.files);
  }, [handleImageUpload]);

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

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if ((!msg && chatImages.length === 0) || isStreaming) return;
    setInput("");
    const imagesToSend = [...chatImages];
    setChatImages([]);

    const userMsg: Message = { role: "user", content: msg, timestamp: new Date(), images: imagesToSend.length > 0 ? imagesToSend : undefined };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setIsStreaming(true);
    setStreamContent("");
    setActiveTools([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const allMessages = updatedMsgs.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.images && m.images.length > 0 ? { images: m.images.map(img => ({ base64: img.base64, media_type: img.media_type })) } : {}),
      }));

      const MAX_CLIENT_RETRIES = 3;
      const CLIENT_BACKOFFS = [1000, 3000, 9000];
      let response: Response | null = null;
      for (let attempt = 0; attempt <= MAX_CLIENT_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = CLIENT_BACKOFFS[attempt - 1] || 9000;
          setStreamContent(`מנסה שוב... (ניסיון ${attempt}/${MAX_CLIENT_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
        }
        try {
          const r = await authFetch(`${API}/kobi/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: allMessages, sessionId }),
            signal: controller.signal,
          });
          if (r.ok || attempt >= MAX_CLIENT_RETRIES) {
            response = r;
            break;
          }
          const status = r.status;
          if (status !== 429 && status !== 502 && status !== 503) {
            response = r;
            break;
          }
        } catch (fetchErr: any) {
          if (fetchErr.name === "AbortError") throw fetchErr;
          if (attempt >= MAX_CLIENT_RETRIES) throw fetchErr;
        }
      }
      setStreamContent("");

      if (!response || !response.ok) throw new Error(`שגיאה ${response?.status ?? "unknown"}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      const toolActions: ToolAction[] = [];

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

            if (data.session_id && !sessionId) setSessionId(data.session_id);

            if (data.content) {
              fullContent += data.content;
              setStreamContent(fullContent);
            }

            if (data.tool_start) {
              toolActions.push({ name: data.tool_start, executing: true });
              setActiveTools([...toolActions]);
            }

            if (data.tool_executing) {
              const last = toolActions[toolActions.length - 1];
              if (last) {
                last.input = data.tool_input;
                setActiveTools([...toolActions]);
              }
            }

            if (data.tool_result) {
              const matching = toolActions.find(t => t.name === data.tool_result && t.executing);
              if (matching) {
                matching.result = data.result;
                matching.success = data.success;
                matching.executing = false;
                matching.time_ms = data.time_ms;
                setActiveTools([...toolActions]);
              }
            }

            if (data.retrying) {
              setStreamContent(`מנסה שוב... (ניסיון ${data.attempt}/${data.maxRetries})`);
            }

            if (data.done) fullContent = data.fullContent || fullContent;
            if (data.error) {
              fullContent += `\n\n${data.error}`;
              setStreamContent(fullContent);
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
      setMessages([...updatedMsgs, assistantMsg]);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages([...updatedMsgs, { role: "assistant", content: `שגיאה: ${err.message}`, timestamp: new Date() }]);
      }
    } finally {
      setIsStreaming(false);
      setStreamContent("");
      setActiveTools([]);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, sessionId, chatImages]);

  const clearChat = () => {
    setMessages([]);
    setSessionId(null);
    setStreamContent("");
    setActiveTools([]);
    setChatImages([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed left-0 top-0 h-screen w-[360px] z-50 flex flex-col bg-[#08080d] border-r border-purple-500/15 shadow-2xl shadow-purple-900/20">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-purple-500/12 bg-[#0a0a14]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/30 flex items-center justify-center">
          <Cpu className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-purple-200">קובי AI</span>
          <span className="text-[10px] text-purple-500/50 mr-2">40 כלים</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="px-2 py-1 text-[10px] text-gray-500 hover:text-red-400 rounded border border-gray-700/30 hover:border-red-500/20 transition-colors"
          >
            נקה
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className={`flex-1 overflow-y-auto px-3 py-3 space-y-3 transition-colors ${chatDragOver ? "bg-purple-500/5 ring-2 ring-inset ring-purple-500/30" : ""}`}
        onDragOver={e => { e.preventDefault(); setChatDragOver(true); }}
        onDragLeave={() => setChatDragOver(false)}
        onDrop={handleChatDrop}
      >
        {chatDragOver && (
          <div className="flex flex-col items-center justify-center py-6 pointer-events-none">
            <ImagePlus className="w-8 h-8 text-purple-400/60 mb-1.5" />
            <p className="text-xs text-purple-400/60">שחרר תמונה כאן</p>
          </div>
        )}
        {messages.length === 0 && !isStreaming && !chatDragOver && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/12 to-violet-600/12 border border-purple-500/20 flex items-center justify-center">
                <Cpu className="w-6 h-6 text-purple-400" />
              </div>
              <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                <Rocket className="w-2 h-2 text-white" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-purple-200 font-medium">קובי מוכן לעבודה</p>
              <p className="text-[10px] text-purple-400/40 mt-0.5">40 כלים — בנה, נתח, נהל, תזמן, אוטומציה — הכל מכאן</p>
            </div>
            <div className="w-full space-y-1">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q.prompt)}
                  className="w-full text-right px-3 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/8 hover:bg-purple-500/12 hover:border-purple-500/20 text-[11px] text-purple-300/60 hover:text-purple-200 transition-all"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === "user"
                ? "bg-blue-500/15 border border-blue-500/20"
                : "bg-purple-500/15 border border-purple-500/20"
            }`}>
              {msg.role === "user" ? <Send className="w-3 h-3 text-blue-400" /> : <Cpu className="w-3 h-3 text-purple-400" />}
            </div>
            <div className={`flex-1 min-w-0 ${msg.role === "user" ? "text-right" : ""}`}>
              {msg.toolActions && msg.toolActions.length > 0 && (
                <div className="mb-1.5 space-y-0.5">
                  {msg.toolActions.map((tool, ti) => (
                    <MiniToolCard key={ti} tool={tool} />
                  ))}
                </div>
              )}
              <div className={`rounded-lg px-3 py-2 text-xs ${
                msg.role === "user"
                  ? "bg-blue-500/8 border border-blue-500/10"
                  : "bg-purple-500/4 border border-purple-500/6"
              }`}>
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.images.map((img, ii) => (
                      <div key={ii} className="relative group/img">
                        <img src={img.preview_url} alt={img.name} className="w-16 h-16 object-cover rounded-md border border-gray-700/50 cursor-pointer hover:border-purple-400/50 transition-colors" onClick={() => window.open(img.preview_url, "_blank")} />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[7px] text-gray-300 px-0.5 py-0.5 rounded-b-md truncate opacity-0 group-hover/img:opacity-100 transition-opacity">{img.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-xs max-w-none text-[12px] leading-relaxed">
                    <RenderContentWithCharts content={msg.content} />
                  </div>
                ) : (
                  msg.content && <p className="whitespace-pre-wrap text-gray-200">{msg.content}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 px-1">
                <span className="text-[9px] text-gray-600">{msg.timestamp.toLocaleTimeString("he-IL")}</span>
                {msg.role === "assistant" && (
                  <button onClick={() => navigator.clipboard.writeText(msg.content)} className="text-gray-600 hover:text-purple-400">
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-md bg-purple-500/15 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-3 h-3 text-purple-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              {activeTools.length > 0 && (
                <div className="mb-1.5 space-y-0.5">
                  {activeTools.map((tool, i) => (
                    <MiniToolCard key={i} tool={tool} />
                  ))}
                </div>
              )}
              {streamContent ? (
                <div className="rounded-lg px-3 py-2 bg-purple-500/4 border border-purple-500/6 text-xs">
                  <div className="prose prose-invert prose-xs max-w-none text-[12px] leading-relaxed">
                    <RenderContentWithCharts content={streamContent} />
                  </div>
                </div>
              ) : activeTools.length === 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-purple-400/50">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  קובי חושב...
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-3 py-2.5 border-t border-purple-500/10 bg-[#08080d]">
        {chatImages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {chatImages.map((img, ii) => (
              <div key={ii} className="relative group/staged">
                <img src={img.preview_url} alt={img.name} className="w-12 h-12 object-cover rounded-md border border-purple-500/30" />
                <button onClick={() => setChatImages(prev => prev.filter((_, idx) => idx !== ii))} className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/staged:opacity-100 transition-opacity">
                  <X className="w-2.5 h-2.5" />
                </button>
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[7px] text-gray-300 px-0.5 rounded-b-md truncate">{img.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() || chatImages.length > 0) sendMessage();
              }
            }}
            onPaste={handleChatPaste}
            placeholder={chatImages.length > 0 ? "תאר את התמונה או שאל שאלה..." : "תגיד לקובי מה לעשות..."}
            className="flex-1 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/10 focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10 resize-none text-xs text-gray-200 placeholder-purple-400/20 outline-none transition-all"
            rows={1}
           
            disabled={isStreaming}
          />
          <div className="flex flex-col gap-1">
            {!isStreaming && (
              <button
                onClick={() => chatFileInputRef.current?.click()}
                className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10 text-gray-400 hover:text-purple-400 hover:bg-purple-500/12 transition-colors"
                title="העלה תמונה"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
            )}
            {isStreaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="p-2 rounded-lg bg-red-500/10 border border-red-500/15 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => { if (input.trim() || chatImages.length > 0) sendMessage(); }}
                disabled={!input.trim() && chatImages.length === 0}
                className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/20 disabled:opacity-15 disabled:shadow-none transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <input ref={chatFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) { handleImageUpload(e.target.files); e.target.value = ""; } }} />
      </div>
    </div>
  );
}

function MiniToolCard({ tool }: { tool: ToolAction }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[tool.name] || Wrench;
  const label = TOOL_LABELS[tool.name] || tool.name;

  return (
    <div className={`rounded-md border overflow-hidden ${
      tool.executing
        ? "border-amber-500/15 bg-amber-500/3"
        : tool.success !== false
          ? "border-emerald-500/10 bg-emerald-500/2"
          : "border-red-500/10 bg-red-500/2"
    }`}>
      <button
        onClick={() => !tool.executing && setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-right"
      >
        {tool.executing ? (
          <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin flex-shrink-0" />
        ) : tool.success !== false ? (
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />
        )}
        <Icon className="w-2.5 h-2.5 text-gray-500 flex-shrink-0" />
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className="flex-1" />
        {tool.time_ms !== undefined && !tool.executing && (
          <span className="text-[8px] text-gray-600">{tool.time_ms}ms</span>
        )}
        {!tool.executing && <ChevronDown className={`w-2 h-2 text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`} />}
      </button>
      {expanded && tool.result && (
        <div className="px-2 py-1 border-t border-gray-800/20 max-h-32 overflow-auto bg-[#090910]">
          <pre className="text-[9px] text-gray-500 whitespace-pre-wrap font-mono">{tool.result}</pre>
        </div>
      )}
    </div>
  );
}
