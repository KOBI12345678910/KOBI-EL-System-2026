import { usePermissions } from "@/hooks/use-permissions";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  Send, Bot, User, Plus, Trash2, Code, Settings, Database, Bug, HeadphonesIcon, Zap, Shield,
  ChevronLeft, ChevronRight, Loader2, Copy, Check, Clock, Sparkles, RotateCcw, Hash, Wrench, CheckCircle2, XCircle,
  ImagePlus, X, Layers, SquarePlus, StopCircle, AlertTriangle, Timer, Cpu, ArrowDown, Search, MessageSquare
} from "lucide-react";
import ActivityLog from "@/components/activity-log";

const API = "/api";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const COMPRESS_TARGET_BYTES = 1 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const CLIENT_TIMEOUT_MS = 180000;

interface Conversation { id: number; channel: string; title: string; model: string; status: string; totalMessages: number; createdAt: string; updatedAt: string; }
interface Message { id: number; conversationId: number; role: string; content: string; channel: string; inputTokens?: number; outputTokens?: number; model?: string; responseTimeMs?: number; createdAt: string; hasImage?: boolean; }
interface OptimisticMessage { id: string; role: "user"; content: string; hasImage?: boolean; imageDataUrl?: string; isOptimistic: true; }
interface ToolCall { tool: string; input: Record<string, unknown>; success: boolean; resultSummary: string; link?: string; }
interface PendingImage { dataUrl: string; mediaType: string; }
interface ChatTab {
  id: string;
  channel: string;
  conversationId: number | null;
  label: string;
  isSending?: boolean;
}

const CHANNEL_CONFIG: Record<string, { nameHe: string; icon: LucideIcon; color: string; bg: string; desc: string }> = {
  development: { nameHe: "המשך פיתוח", icon: Code, color: "text-blue-400", bg: "bg-blue-600", desc: "כתיבת קוד, frontend, backend, DB, API" },
  management: { nameHe: "ניהול מערכת", icon: Settings, color: "text-purple-400", bg: "bg-purple-600", desc: "ניהול DB, ביצועים, משתמשים, הרשאות" },
  dataflow: { nameHe: "זרימת נתונים", icon: Database, color: "text-cyan-400", bg: "bg-cyan-600", desc: "ETL, אינטגרציות, ייבוא/ייצוא, דוחות" },
  testing: { nameHe: "בדיקות ותיקונים", icon: Bug, color: "text-red-400", bg: "bg-red-600", desc: "QA, debugging, תיקון באגים, בדיקות" },
  support: { nameHe: "תמיכה ומענה", icon: HeadphonesIcon, color: "text-green-400", bg: "bg-green-600", desc: "עזרה, הסברים, הדרכה למשתמשים" },
  automation: { nameHe: "אוטומציה", icon: Zap, color: "text-amber-400", bg: "bg-amber-600", desc: "workflows, triggers, התראות, תזמון" },
  architecture: { nameHe: "ארכיטקטורה ואבטחה", icon: Shield, color: "text-indigo-400", bg: "bg-indigo-600", desc: "תכנון, אבטחה, scalability, best practices" },
};

const imageSessionCache = new Map<string, string>();

async function compressImageToJpeg(dataUrl: string): Promise<{ dataUrl: string; mediaType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const MAX_DIM = 1920;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      let result = canvas.toDataURL("image/jpeg", quality);
      while (result.length > COMPRESS_TARGET_BYTES * 1.37 && quality > 0.3) {
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      resolve({ dataUrl: result, mediaType: "image/jpeg" });
    };
    img.onerror = () => resolve({ dataUrl, mediaType: "image/jpeg" });
    img.src = dataUrl;
  });
}

function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative group my-2">
      <button onClick={copy} className="absolute top-2 left-2 p-1.5 rounded bg-muted hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-300" />}
      </button>
      <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm text-foreground leading-relaxed"><code>{content}</code></pre>
    </div>
  );
}

function ToolCallsDisplay({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <div className="my-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
        <Wrench className="w-3.5 h-3.5" />
        <span>{toolCalls.length} פעולות בוצעו</span>
      </div>
      {toolCalls.map((tc, i) => (
        <div key={i} className={`flex items-start gap-2 px-3 py-1.5 rounded-lg border text-xs ${tc.success ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
          <div className="mt-0.5">
            {tc.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-mono text-gray-300">{tc.tool}</span>
            <span className="text-muted-foreground mx-1.5">—</span>
            <span className={tc.success ? "text-emerald-300" : "text-red-300"}>{tc.resultSummary}</span>
            {tc.link && tc.success && (
              <a href={tc.link} className="mr-2 text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                פתח &larr;
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function parseToolCallsFromContent(content: string): { text: string; toolCalls: ToolCall[] } {
  const marker = "<!-- TOOL_CALLS:";
  const idx = content.indexOf(marker);
  if (idx === -1) return { text: content, toolCalls: [] };
  const text = content.substring(0, idx).trim();
  const jsonStart = idx + marker.length;
  const jsonEnd = content.indexOf(" -->", jsonStart);
  if (jsonEnd === -1) return { text, toolCalls: [] };
  try {
    const toolCalls = JSON.parse(content.substring(jsonStart, jsonEnd));
    return { text, toolCalls };
  } catch {
    return { text, toolCalls: [] };
  }
}

function MessageContent({ content }: { content: string }) {
  const { text, toolCalls } = parseToolCallsFromContent(content);
  const parts: JSX.Element[] = [];
  const lines = text.split("\n");
  let codeBlock = "";
  let inCode = false;
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("```") && !inCode) {
      inCode = true;
      codeBlock = "";
    } else if (line.startsWith("```") && inCode) {
      inCode = false;
      parts.push(<CodeBlock key={key++} content={codeBlock.trim()} />);
      codeBlock = "";
    } else if (inCode) {
      codeBlock += line + "\n";
    } else if (line.startsWith("### ")) {
      parts.push(<h3 key={key++} className="text-base font-bold text-foreground mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      parts.push(<h2 key={key++} className="text-lg font-bold text-foreground mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      parts.push(<h1 key={key++} className="text-xl font-bold text-foreground mt-3 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      parts.push(<li key={key++} className="text-foreground mr-4 list-disc list-inside">{renderInlineFormatting(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      parts.push(<li key={key++} className="text-foreground mr-4 list-decimal list-inside">{renderInlineFormatting(line.replace(/^\d+\.\s/, ""))}</li>);
    } else if (line.startsWith("> ")) {
      parts.push(<blockquote key={key++} className="border-r-4 border-blue-500 pr-4 text-gray-300 italic my-2">{line.slice(2)}</blockquote>);
    } else if (line.trim() === "") {
      parts.push(<div key={key++} className="h-2" />);
    } else {
      parts.push(<p key={key++} className="text-foreground leading-relaxed">{renderInlineFormatting(line)}</p>);
    }
  }
  if (inCode && codeBlock) {
    parts.push(<CodeBlock key={key++} content={codeBlock.trim()} />);
  }

  return (
    <div className="space-y-0.5 text-sm">
      {toolCalls.length > 0 && <ToolCallsDisplay toolCalls={toolCalls} />}
      {parts}
    </div>
  );
}

function renderInlineFormatting(text: string): (string | JSX.Element)[] {
  const result: (string | JSX.Element)[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) result.push(text.slice(lastIndex, match.index));
    const m = match[0];
    if (m.startsWith("`")) {
      result.push(<code key={k++} className="bg-muted text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono">{m.slice(1, -1)}</code>);
    } else if (m.startsWith("**")) {
      result.push(<strong key={k++} className="text-foreground font-semibold">{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("*")) {
      result.push(<em key={k++} className="text-gray-300 italic">{m.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(interval);
  }, [startTime]);
  return <span>{(elapsed / 1000).toFixed(1)}s</span>;
}

let tabCounter = 1;

function SingleChatPane({ tabId, channel: initialChannel, conversationId: initialConvId, onTabUpdate }: {
  tabId: string;
  channel: string;
  conversationId: number | null;
  onTabUpdate: (tabId: string, label: string, channel: string, convId: number | null, isSending?: boolean) => void;
}) {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState(initialChannel);
  const [activeConvId, setActiveConvId] = useState<number | null>(initialConvId);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[] | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingTools, setStreamingTools] = useState<Array<{tool: string; success?: boolean; resultSummary?: string; link?: string}>>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendStartTime, setSendStartTime] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedMsg, setLastFailedMsg] = useState<string | null>(null);
  const [lastFailedImg, setLastFailedImg] = useState<PendingImage | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<OptimisticMessage | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const channelConf = CHANNEL_CONFIG[activeChannel];
  const ChannelIcon = channelConf.icon;

  const debouncedChannel = useDebounce(activeChannel, 150);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["chat-convs", debouncedChannel],
    queryFn: async () => { const r = await authFetch(`${API}/claude/chat/conversations?channel=${debouncedChannel}`); if (!r.ok) return [] as Conversation[]; return r.json(); },
    staleTime: 30000,
  });

  const filteredConversations = useMemo(() => {
    if (!convSearch.trim()) return conversations;
    const q = convSearch.toLowerCase();
    return conversations.filter(c => c.title.toLowerCase().includes(q));
  }, [conversations, convSearch]);

  const debouncedConvId = useDebounce(activeConvId, 100);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["chat-msgs", debouncedConvId],
    queryFn: async () => {
      if (!debouncedConvId) return [];
      const r = await authFetch(`${API}/claude/chat/conversations/${debouncedConvId}/messages`);
      if (!r.ok) return [] as Message[];
      return r.json();
    },
    enabled: !!debouncedConvId,
    staleTime: 10000,
  });

  const { data: chatStatus } = useQuery({
    queryKey: ["chat-status"],
    queryFn: async () => { const r = await authFetch(`${API}/claude/chat/status`); if (!r.ok) return {}; return r.json(); },
    staleTime: 60000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/claude/chat/conversations/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      setActiveConvId(null);
      onTabUpdate(tabId, CHANNEL_CONFIG[activeChannel]?.nameHe || activeChannel, activeChannel, null);
      qc.invalidateQueries({ queryKey: ["chat-convs", activeChannel] });
    },
  });

  const processImageFile = useCallback(async (file: File): Promise<PendingImage | null> => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setSendError("פורמט תמונה לא נתמך. השתמש ב-JPEG, PNG, GIF, או WebP");
      return null;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setSendError("התמונה גדולה מדי. גודל מקסימלי: 5MB");
      return null;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (file.size > COMPRESS_TARGET_BYTES) {
          const compressed = await compressImageToJpeg(dataUrl);
          resolve({ dataUrl: compressed.dataUrl, mediaType: compressed.mediaType });
        } else {
          resolve({ dataUrl, mediaType: file.type });
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSending && abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSending]);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const sendMessage = async (msg: string, img?: PendingImage | null) => {
    if (!msg.trim() && !img) return;
    if (isSending) return;
    setSendError(null);
    setLastFailedMsg(null);
    setLastFailedImg(null);
    setIsSending(true);
    setSendStartTime(Date.now());
    setStreamingText("");
    setStreamingTools([]);

    const currentLabel = msg.substring(0, 25) || "שיחה חדשה";

    const optimisticId = `opt_${Date.now()}`;
    setOptimisticMessage({
      id: optimisticId,
      role: "user",
      content: msg,
      hasImage: !!img,
      imageDataUrl: img?.dataUrl,
      isOptimistic: true,
    });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const clientTimeout = setTimeout(() => {
      ctrl.abort();
      setSendError("הזמן הקצוב לתשובה עבר (3 דקות). נסה שוב.");
    }, CLIENT_TIMEOUT_MS);

    let receivedDone = false;
    let convIdLocal = activeConvId;
    let receivedAnyText = false;

    try {
      const body: Record<string, unknown> = {
        conversationId: activeConvId,
        message: msg || " ",
        channel: activeChannel,
      };

      if (img) {
        const base64 = img.dataUrl.split(",")[1];
        body.image = { data: base64, mediaType: img.mediaType };
      }

      onTabUpdate(tabId, currentLabel, activeChannel, activeConvId, true);

      const r = await authFetch(`${API}/claude/chat/send-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!r.ok || !r.body) {
        let errMsg = "שגיאה בשליחה";
        try { const err = await r.json(); errMsg = err.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === "conversation") {
              convIdLocal = parsed.conversationId;
              setActiveConvId(parsed.conversationId);
              onTabUpdate(tabId, currentLabel, activeChannel, parsed.conversationId, true);
              qc.invalidateQueries({ queryKey: ["chat-convs", activeChannel] });
            } else if (event === "user_message_id") {
              if (img && parsed.userMessageId) {
                imageSessionCache.set(`msg_${parsed.userMessageId}`, img.dataUrl);
              }
            } else if (event === "text") {
              receivedAnyText = true;
              setStreamingText(prev => (prev ?? "") + parsed.text);
            } else if (event === "tool_start") {
              setStreamingTools(prev => [...prev, { tool: parsed.tool }]);
            } else if (event === "tool_result") {
              setStreamingTools(prev => prev.map(t => t.tool === parsed.tool && t.success === undefined
                ? { ...t, success: parsed.success, resultSummary: parsed.resultSummary, link: parsed.link }
                : t));
            } else if (event === "done") {
              receivedDone = true;
              if (parsed.toolCalls && parsed.toolCalls.length > 0) {
                setPendingToolCalls(parsed.toolCalls);
                setTimeout(() => setPendingToolCalls(null), 8000);
              }
            } else if (event === "error") {
              throw new Error(parsed.error || "שגיאה לא ידועה");
            }
          } catch (parseErr) {
            if (event === "error") throw parseErr;
          }
        }
      }

      if (!receivedDone && !receivedAnyText) {
        setSendError("לא התקבלה תשובה. מרענן...");
        setLastFailedMsg(msg);
        setLastFailedImg(img ?? null);
      } else if (!receivedDone) {
        setSendError("החיבור נסגר לפני שהתשובה הושלמה.");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        if (!receivedAnyText) {
          setSendError("הבקשה בוטלה.");
        }
        return;
      }
      const errText = err instanceof Error ? err.message : "שגיאה לא ידועה";
      setSendError(errText);
      setLastFailedMsg(msg);
      setLastFailedImg(img ?? null);
    } finally {
      clearTimeout(clientTimeout);
      setOptimisticMessage(null);
      setIsSending(false);
      setSendStartTime(null);
      setStreamingText(null);
      setStreamingTools([]);
      abortRef.current = null;
      onTabUpdate(tabId, currentLabel, activeChannel, convIdLocal ?? activeConvId, false);
      qc.invalidateQueries({ queryKey: ["chat-msgs", convIdLocal ?? activeConvId] });
      qc.invalidateQueries({ queryKey: ["chat-convs", activeChannel] });
    }
  };

  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (scrollTimerRef.current) return;
    scrollTimerRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      scrollTimerRef.current = null;
    }, 150);
  }, [messages, streamingText, optimisticMessage, isSending]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(fromBottom > 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSend = () => {
    const msg = input.trim();
    const img = pendingImage;
    if (!msg && !img) return;
    setInput("");
    setPendingImage(null);
    setPendingToolCalls(null);
    sendMessage(msg, img);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find(item => item.type.startsWith("image/"));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) {
        const img = await processImageFile(file);
        if (img) setPendingImage(img);
      }
    }
  }, [processImageFile]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = await processImageFile(file);
      if (img) setPendingImage(img);
    }
    e.target.value = "";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!chatAreaRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const img = await processImageFile(file);
      if (img) setPendingImage(img);
    }
  }, [processImageFile]);

  const newConversation = () => {
    if (isSending) return;
    setActiveConvId(null);
    setPendingImage(null);
    setOptimisticMessage(null);
    setSendError(null);
    onTabUpdate(tabId, CHANNEL_CONFIG[activeChannel]?.nameHe || activeChannel, activeChannel, null);
    inputRef.current?.focus();
  };

  const switchChannel = (ch: string) => {
    if (isSending) return;
    setActiveChannel(ch);
    setActiveConvId(null);
    setPendingImage(null);
    setOptimisticMessage(null);
    setSendError(null);
    setConvSearch("");
    onTabUpdate(tabId, CHANNEL_CONFIG[ch]?.nameHe || ch, ch, null);
  };

  const allDisplayMessages = useMemo(() => {
    const result: Array<(Message | OptimisticMessage) & { imageDataUrl?: string }> = [...messages];
    if (optimisticMessage) {
      result.push(optimisticMessage);
    }
    return result;
  }, [messages, optimisticMessage]);

  return (
    <div className="h-full w-full flex" dir="rtl">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="border-l border-border bg-card flex flex-col overflow-hidden flex-shrink-0">
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-foreground font-bold flex items-center gap-2 text-sm"><Bot className="w-4 h-4 text-violet-400" />Claude AI</h2>
                <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <button onClick={newConversation} className="w-full flex items-center justify-center gap-2 px-2 py-2 bg-violet-600 hover:bg-violet-500 text-foreground rounded-lg text-xs font-medium transition-colors"><Plus className="w-3.5 h-3.5" />שיחה חדשה</button>
            </div>

            <div className="p-2 border-b border-border">
              <p className="text-muted-foreground text-[10px] font-medium mb-1.5 px-1">ערוצי משימות</p>
              <div className="space-y-0.5">
                {Object.entries(CHANNEL_CONFIG).map(([key, conf]) => {
                  const Icon = conf.icon;
                  return (
                    <button key={key} onClick={() => switchChannel(key)} disabled={isSending} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-right transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activeChannel === key ? `${conf.bg}/20 ${conf.color} font-medium` : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{conf.nameHe}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
              <div className="p-2 pb-1">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-muted-foreground text-[10px] font-medium">שיחות ({filteredConversations.length})</p>
                </div>
                {conversations.length > 3 && (
                  <div className="relative mb-1.5">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <input
                      value={convSearch}
                      onChange={e => setConvSearch(e.target.value)}
                      placeholder="חפש שיחה..."
                      className="w-full bg-muted/50 border border-border/50 rounded-lg pr-7 pl-2 py-1 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-border"
                    />
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                {filteredConversations.map(c => (
                  <div key={c.id} className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${activeConvId === c.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                    onClick={() => { setActiveConvId(c.id); onTabUpdate(tabId, c.title.substring(0, 25), activeChannel, c.id); }}>
                    <Hash className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{c.title}</span>
                      <span className="text-[9px] text-muted-foreground">{c.totalMessages} הודעות</span>
                    </div>
                    {isSuperAdmin && <button onClick={(e) => { e.stopPropagation(); deleteMut.mutate(c.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"><Trash2 className="w-3 h-3" /></button>}
                  </div>
                ))}
              </div>
            </div>

            {chatStatus && (
              <div className="p-2 border-t border-border text-[10px] text-muted-foreground space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${chatStatus.configured ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                  <span>{chatStatus.configured ? "מחובר" : "לא מחובר"}</span>
                  {chatStatus.toolsEnabled && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Wrench className="w-2.5 h-2.5" />
                      {chatStatus.toolCount} כלים
                    </span>
                  )}
                </div>
                <p>{chatStatus.totalConversations} שיחות | {chatStatus.totalMessages} הודעות</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={chatAreaRef}
        className="flex-1 flex flex-col bg-input relative min-w-0"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-violet-900/30 border-2 border-dashed border-violet-400 rounded-xl pointer-events-none">
            <div className="text-violet-300 text-lg font-medium flex items-center gap-3">
              <ImagePlus className="w-8 h-8" />
              <span>שחרר תמונה לצירוף לצ'אט</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
            )}
            <div className={`w-7 h-7 rounded-lg ${channelConf.bg}/20 flex items-center justify-center flex-shrink-0`}>
              <ChannelIcon className={`w-3.5 h-3.5 ${channelConf.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-foreground font-semibold text-xs truncate">{channelConf.nameHe}</h3>
              <p className="text-muted-foreground text-[10px] truncate">{channelConf.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isSending && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-violet-600/20 text-violet-300 rounded-lg text-[10px] font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                <Timer className="w-3 h-3" />
                {sendStartTime && <ElapsedTimer startTime={sendStartTime} />}
              </div>
            )}
            {isSending && (
              <button onClick={cancelStream} title="בטל" className="flex items-center gap-1 px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-[10px] font-medium transition-colors">
                <StopCircle className="w-3 h-3" />עצור
              </button>
            )}
            {activeConvId && !isSending && (
              <button onClick={newConversation} className="flex items-center gap-1 px-2 py-1 bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 rounded-lg text-[10px] font-medium transition-colors">
                <RotateCcw className="w-3 h-3" />שיחה חדשה
              </button>
            )}
          </div>
        </div>

        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
          {!activeConvId && allDisplayMessages.length === 0 && !isSending && (
            <div className="flex-1 flex flex-col items-center justify-center pt-12">
              <div className={`w-16 h-16 rounded-2xl ${channelConf.bg}/20 flex items-center justify-center mb-4`}>
                <ChannelIcon className={`w-8 h-8 ${channelConf.color}`} />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">{channelConf.nameHe}</h2>
              <p className="text-muted-foreground mb-1 text-center max-w-md text-sm">{channelConf.desc}</p>
              <p className="text-amber-400/70 text-[10px] mb-4 flex items-center gap-1.5">
                <Wrench className="w-3 h-3" />
                Claude יכול לבצע פעולות ישירות — בניית מודולים, ישויות, שדות ועוד
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {getChannelSuggestions(activeChannel).map((s, i) => (
                  <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-right p-2.5 bg-card border border-border rounded-xl text-xs text-gray-300 hover:border-violet-500/50 hover:text-foreground hover:bg-violet-600/5 transition-all">
                    <Sparkles className={`w-3.5 h-3.5 ${channelConf.color} mb-1`} />{s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {allDisplayMessages.map(m => {
            const msgId = "isOptimistic" in m ? m.id : String(m.id);
            const isOptimistic = "isOptimistic" in m;
            const imgDataUrl = isOptimistic ? (m as OptimisticMessage).imageDataUrl : undefined;
            const cachedImg = !isOptimistic && (m as Message).hasImage
              ? imageSessionCache.get(`msg_${(m as Message).id}`)
              : undefined;
            const displayImg = imgDataUrl || cachedImg;

            return (
              <motion.div key={msgId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${m.role === "user" ? "bg-blue-600" : `${channelConf.bg}/20`}`}>
                  {m.role === "user" ? <User className="w-3.5 h-3.5 text-foreground" /> : <Bot className={`w-3.5 h-3.5 ${channelConf.color}`} />}
                </div>
                <div className={`max-w-[80%] ${m.role === "user" ? "bg-blue-600/20 border border-blue-600/30" : "bg-card border border-border"} rounded-xl px-3 py-2.5 ${isOptimistic ? "opacity-70" : ""}`}>
                  {isOptimistic && (
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-blue-400/60">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>שולח...</span>
                    </div>
                  )}
                  {m.role === "user" ? (
                    <div>
                      {displayImg && (
                        <img src={displayImg} alt="תמונה שנשלחה" className="max-w-xs max-h-48 object-contain rounded-lg mb-2 border border-blue-600/30" />
                      )}
                      {!displayImg && (m.hasImage || (isOptimistic && (m as OptimisticMessage).hasImage)) && (
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>תמונה צורפה</span>
                        </div>
                      )}
                      <p className="text-foreground whitespace-pre-wrap text-sm">{m.content}</p>
                    </div>
                  ) : (
                    <MessageContent content={m.content} />
                  )}
                  {!isOptimistic && m.role === "assistant" && (m as Message).responseTimeMs && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{((m as Message).responseTimeMs! / 1000).toFixed(1)}s</span>
                      {(m as Message).inputTokens && <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" />{((m as Message).inputTokens || 0) + ((m as Message).outputTokens || 0)} tokens</span>}
                      {(m as Message).model && <span className="text-muted-foreground">{(m as Message).model}</span>}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {isSending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
              <div className={`flex-shrink-0 w-7 h-7 rounded-lg ${channelConf.bg}/20 flex items-center justify-center`}>
                <Bot className={`w-3.5 h-3.5 ${channelConf.color} animate-pulse`} />
              </div>
              <div className="bg-card border border-border rounded-xl px-3 py-2.5 max-w-[80%]">
                {streamingTools.length > 0 && (
                  <div className="mb-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium mb-1">
                      <Wrench className="w-3 h-3" />
                      <span>{streamingTools.length} פעולות בביצוע</span>
                    </div>
                    {streamingTools.map((t, i) => (
                      <div key={i} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded ${t.success === undefined ? "text-amber-400 bg-amber-400/5" : t.success ? "text-emerald-400 bg-emerald-400/5" : "text-red-400 bg-red-400/5"}`}>
                        {t.success === undefined ? <Loader2 className="w-3 h-3 animate-spin" /> : t.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span className="font-mono">{t.tool}</span>
                        {t.resultSummary && <span className="text-muted-foreground truncate">— {t.resultSummary}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {streamingText ? (
                  <div className="text-foreground text-sm whitespace-pre-wrap">{streamingText}<span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle rounded-sm" /></div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-sm">Claude חושב...</span>
                    {sendStartTime && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Timer className="w-2.5 h-2.5" />
                        <ElapsedTimer startTime={sendStartTime} />
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {showScrollDown && (
          <button onClick={scrollToBottom} className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-muted border border-border text-gray-300 hover:text-foreground rounded-full p-2 shadow-lg transition-all hover:bg-muted">
            <ArrowDown className="w-4 h-4" />
          </button>
        )}

        {sendError && (
          <div className="mx-3 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{sendError}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lastFailedMsg !== null && (
                <button onClick={() => { setSendError(null); sendMessage(lastFailedMsg!, lastFailedImg); }} className="text-violet-300 hover:text-violet-200 text-[10px] underline flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />נסה שוב
                </button>
              )}
              <button onClick={() => setSendError(null)} className="text-red-300 hover:text-red-200 text-[10px] underline">סגור</button>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-border bg-card flex-shrink-0">
          {pendingImage && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative">
                <img src={pendingImage.dataUrl} alt="תמונה לשליחה" className="h-14 w-14 object-cover rounded-lg border border-border" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">תמונה מצורפת</span>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              title="צרף תמונה"
              className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${pendingImage ? "bg-violet-600/30 text-violet-300" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-gray-500"} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 relative">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste}
                placeholder={`שלח הודעה ל-Claude (${channelConf.nameHe})...`}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500 min-h-[40px] max-h-[150px] transition-colors"
                rows={1}
                style={{ height: "auto" }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 150) + "px"; }}
                disabled={isSending} />
            </div>
            <button onClick={handleSend} disabled={(!input.trim() && !pendingImage) || isSending}
              className="flex-shrink-0 w-9 h-9 bg-violet-600 hover:bg-violet-500 disabled:bg-muted disabled:cursor-not-allowed text-foreground rounded-xl flex items-center justify-center transition-colors">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-muted-foreground">Ctrl+V להדבקת תמונה | Enter לשליחה | Shift+Enter לשורה חדשה</p>
            {isSending && (
              <button onClick={cancelStream} className="text-[10px] text-red-400/70 hover:text-red-400 flex items-center gap-1">
                <StopCircle className="w-2.5 h-2.5" />Esc לביטול
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getChannelSuggestions(channel: string): string[] {
  const map: Record<string, string[]> = {
    development: ["בנה מודול מכירות חדש", "הוסף ישות 'לקוחות' למודול קיים", "צור שדות לישות מוצרים", "בנה מודול מלאי עם ישויות ושדות"],
    management: ["בדוק ביצועי DB", "הצג שאילתות איטיות", "סקירת מצב המערכת", "הרץ אבחון מערכת"],
    dataflow: ["ייצא דוח ספקים ל-CSV", "הצלב נתוני הזמנות וקבלות", "בנה pipeline לעדכון מחירים", "חבר מודול מלאי לרכש"],
    testing: ["הרץ אבחון מערכת מלא", "מצא ישויות שבורות", "בדוק שדות יתומים", "אבחן בעיות בסטטוסים"],
    support: ["איך מוסיפים ספק חדש?", "איך יוצרים דרישת רכש?", "הסבר על תהליך האישורים", "מה ההבדל בין דרישה להזמנה?"],
    automation: ["התראה כשמלאי נמוך", "אישור אוטומטי עד 5000₪", "דוח שבועי אוטומטי", "שליחת הזמנה אוטומטית לספק"],
    architecture: ["תכנן מודול מלאי", "סקירת אבטחת API", "ארכיטקטורת מולטי-טננט", "אסטרטגיית caching"],
  };
  return map[channel] || [];
}

export default function ClaudeChatPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [tabs, setTabs] = useState<ChatTab[]>([
    { id: "tab_1", channel: "development", conversationId: null, label: "המשך פיתוח" },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab_1");

  const addTab = (channel = "development") => {
    tabCounter++;
    const newId = `tab_${tabCounter}`;
    const conf = CHANNEL_CONFIG[channel];
    setTabs(prev => [...prev, { id: newId, channel, conversationId: null, label: conf?.nameHe || "שיחה חדשה" }]);
    setActiveTabId(newId);
  };

  const closeTab = (tabId: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (filtered.length === 0) {
        tabCounter++;
        const newId = `tab_${tabCounter}`;
        filtered.push({ id: newId, channel: "development", conversationId: null, label: "המשך פיתוח" });
      }
      if (activeTabId === tabId) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const handleTabUpdate = (tabId: string, label: string, channel: string, convId: number | null, isSending?: boolean) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, label: label.substring(0, 30), channel, conversationId: convId, isSending: !!isSending } : t));
  };

  const activeSendingCount = tabs.filter(t => t.isSending).length;

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col bg-card">
      <div className="flex items-center bg-card border-b border-border px-1 flex-shrink-0" dir="rtl">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto py-1" style={{ scrollbarWidth: "none" }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            const conf = CHANNEL_CONFIG[tab.channel];
            const Icon = conf?.icon || Code;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-all min-w-0 max-w-[200px] flex-shrink-0
                  ${isActive
                    ? `bg-card ${conf?.color || "text-foreground"} font-medium border border-border shadow-lg shadow-black/20`
                    : "text-muted-foreground hover:text-gray-300 hover:bg-muted/50"
                  }`}
              >
                {tab.isSending ? (
                  <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin text-violet-400" />
                ) : (
                  <Icon className="w-3 h-3 flex-shrink-0" />
                )}
                <span className="truncate">{tab.label}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    aria-label="סגור טאב"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-400 transition-opacity mr-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 pr-1">
          <button
            onClick={() => addTab()}
            title="פתח טאב חדש"
            className="flex items-center gap-1 px-2 py-1.5 text-muted-foreground hover:text-violet-400 hover:bg-violet-600/10 rounded-lg text-xs transition-colors"
          >
            <SquarePlus className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground border-r border-border">
            <Layers className="w-3 h-3" />
            <span>{tabs.length}</span>
            {activeSendingCount > 0 && (
              <span className="flex items-center gap-0.5 text-violet-400 mr-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {activeSendingCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? "block" : "none" }}
          >
            <SingleChatPane
              tabId={tab.id}
              channel={tab.channel}
              conversationId={tab.conversationId}
              onTabUpdate={handleTabUpdate}
            />
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 max-h-[200px] overflow-y-auto">
        <ActivityLog entityType="claude-chat" compact showHeader />
      </div>
    </div>
  );
}
