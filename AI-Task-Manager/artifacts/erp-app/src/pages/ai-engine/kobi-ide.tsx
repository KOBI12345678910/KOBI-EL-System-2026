import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  FolderOpen, FolderClosed, FileCode, FileText, Database, Image as ImageIcon,
  ChevronLeft, ChevronRight, RefreshCw, Loader2, Save, X, Plus, Search,
  Terminal, Play, Settings, GitBranch, AlertTriangle, CheckCircle2,
  Code2, FolderTree, Maximize2, Minimize2, SplitSquareHorizontal,
  Undo2, Redo2, Copy, Scissors, ClipboardPaste, FileSearch, Replace,
  Braces, Hash, Regex, CaseSensitive, WrapText, ZoomIn, ZoomOut,
  Download, Upload, Trash2, FilePlus, FolderPlus, MoreVertical,
  Globe, PanelRight, ExternalLink, Smartphone, Monitor, Tablet,
  ArrowLeft, ArrowRight, RotateCw, Home, MessageSquare, Send, Bot, User,
  Sparkles, Wand2, PanelLeft, GitCommit, GitPullRequest, Archive,
  RotateCcw, Eye, FileWarning, FileMinus, FilePlus2, Clock, ImagePlus
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then(m => ({ default: m.default })));

const API = "/api";

interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface OpenTab {
  path: string;
  name: string;
  language: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

interface SearchResult {
  path: string;
  line: number;
  text: string;
}

interface TerminalTabState {
  id: number;
  name: string;
  output: string[];
  input: string;
  running: boolean;
}

let terminalIdCounter = 0;

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
  json: "json", sql: "sql", css: "css", scss: "scss", less: "less",
  html: "html", md: "markdown", py: "python", sh: "bash", yml: "yaml",
  yaml: "yaml", xml: "xml", toml: "toml", env: "ini", txt: "plaintext",
  rs: "rust", go: "go", java: "java", kt: "kotlin", swift: "swift",
  rb: "ruby", php: "php", c: "c", cpp: "cpp", h: "c",
};

const EXT_COLORS: Record<string, string> = {
  ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400", jsx: "text-yellow-400",
  json: "text-green-400", css: "text-pink-400", scss: "text-pink-400", html: "text-orange-400",
  sql: "text-orange-400", md: "text-gray-400", py: "text-green-300", yml: "text-red-300",
  yaml: "text-red-300", sh: "text-emerald-400", toml: "text-amber-400",
};

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1048576).toFixed(1)}M`;
}

interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
  lineNum?: number;
}

interface FileDiff {
  path: string;
  lines: DiffLine[];
}

interface ChatImage {
  base64: string;
  media_type: string;
  name: string;
  preview_url: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  diffs?: FileDiff[];
  images?: ChatImage[];
}

function computeSimpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "context", text: oldLines[oi], lineNum: ni + 1 });
      oi++; ni++;
    } else {
      let foundMatch = false;
      for (let look = 1; look <= 5; look++) {
        if (ni + look < newLines.length && oi < oldLines.length && newLines[ni + look] === oldLines[oi]) {
          for (let k = 0; k < look; k++) {
            result.push({ type: "add", text: newLines[ni + k], lineNum: ni + k + 1 });
          }
          ni += look;
          foundMatch = true;
          break;
        }
        if (oi + look < oldLines.length && ni < newLines.length && oldLines[oi + look] === newLines[ni]) {
          for (let k = 0; k < look; k++) {
            result.push({ type: "remove", text: oldLines[oi + k], lineNum: oi + k + 1 });
          }
          oi += look;
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        if (oi < oldLines.length) { result.push({ type: "remove", text: oldLines[oi], lineNum: oi + 1 }); oi++; }
        if (ni < newLines.length) { result.push({ type: "add", text: newLines[ni], lineNum: ni + 1 }); ni++; }
      }
    }
  }

  const filtered: DiffLine[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i].type !== "context") {
      const ctxStart = Math.max(0, i - 2);
      const ctxEnd = Math.min(result.length - 1, i + 2);
      for (let j = ctxStart; j <= ctxEnd; j++) {
        if (!filtered.includes(result[j])) filtered.push(result[j]);
      }
    }
  }

  return filtered.length > 0 ? filtered : [];
}

interface ContextMenuState {
  x: number;
  y: number;
  item: FileItem | null;
  parentPath: string;
}

function TreeNode({ item, depth, onSelect, expandedDirs, toggleDir, activeFile, onContextMenu }: {
  item: FileItem; depth: number; onSelect: (path: string) => void;
  expandedDirs: Map<string, FileItem[]>; toggleDir: (path: string) => void; activeFile: string | null;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
}) {
  const isExpanded = expandedDirs.has(item.path);
  const children = expandedDirs.get(item.path);
  const ext = getExt(item.name);
  const isActive = activeFile === item.path;

  return (
    <div>
      <button
        onClick={() => item.isDir ? toggleDir(item.path) : null}
        onDoubleClick={() => !item.isDir ? onSelect(item.path) : null}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, item); }}
        className={`w-full flex items-center gap-1.5 py-[3px] pr-2 rounded text-right hover:bg-[#1e2533] transition-colors group ${
          isActive ? "bg-cyan-500/15 text-cyan-300" : ""
        }`}
        style={{ paddingRight: `${depth * 14 + 8}px` }}
      >
        {item.isDir && (
          <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        )}
        {item.isDir ? (
          isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-amber-400/80" /> : <FolderClosed className="w-3.5 h-3.5 text-amber-400/60" />
        ) : (
          <FileCode className={`w-3.5 h-3.5 ${EXT_COLORS[ext] || "text-gray-500"}`} />
        )}
        <span className={`text-[11px] truncate flex-1 ${isActive ? "text-cyan-300" : "text-gray-300"}`}>{item.name}</span>
        {!item.isDir && <span className="text-[9px] text-gray-600 opacity-0 group-hover:opacity-100">{formatSize(item.size)}</span>}
      </button>
      {item.isDir && isExpanded && children && (
        <div className="border-r border-border/30 mr-2">
          {children.map(child => (
            <TreeNode key={child.path} item={child} depth={depth + 1} onSelect={onSelect}
              expandedDirs={expandedDirs} toggleDir={toggleDir} activeFile={activeFile} onContextMenu={onContextMenu} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KobiIDE() {
  const [rootItems, setRootItems] = useState<FileItem[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Map<string, FileItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(".");

  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabIdx, setActiveTabIdx] = useState(-1);

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabState[]>([]);
  const [activeTermIdx, setActiveTermIdx] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState(200);

  const [leftPanel, setLeftPanel] = useState<"files" | "search" | "git" | null>("files");
  const [rightPanel, setRightPanel] = useState<"preview" | "chat" | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);

  const resizingRef = useRef<{ type: "left" | "right" | "terminal"; startX: number; startY: number; startSize: number } | null>(null);

  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState<"on" | "off">("on");
  const [minimap, setMinimap] = useState(true);

  const [previewUrl, setPreviewUrl] = useState("/");
  const [previewUrlInput, setPreviewUrlInput] = useState("/");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [fileFilter, setFileFilter] = useState("");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [chatImages, setChatImages] = useState<ChatImage[]>([]);
  const [chatDragOver, setChatDragOver] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const [gitBranch, setGitBranch] = useState("main");
  const [gitFiles, setGitFiles] = useState<{ path: string; status: string; statusLabel: string }[]>([]);
  const [gitCommits, setGitCommits] = useState<{ hash: string; message: string }[]>([]);
  const [gitBranches, setGitBranches] = useState<string[]>([]);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitCommitMsg, setGitCommitMsg] = useState("");
  const [gitDiffContent, setGitDiffContent] = useState<string | null>(null);
  const [gitDiffFile, setGitDiffFile] = useState<string | null>(null);
  const [gitTab, setGitTab] = useState<"changes" | "history">("changes");

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newItemMode, setNewItemMode] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const editorRef = useRef<any>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);

  const activeTab = activeTabIdx >= 0 && activeTabIdx < openTabs.length ? openTabs[activeTabIdx] : null;

  const loadDir = useCallback(async (dirPath: string): Promise<FileItem[]> => {
    try {
      const r = await authFetch(`${API}/kobi/files?path=${encodeURIComponent(dirPath)}`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.items || [];
    } catch (e) { console.error("שגיאה בטעינת תיקייה:", e); return []; }
  }, []);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    const items = await loadDir(currentPath);
    setRootItems(items);
    setLoading(false);
  }, [currentPath, loadDir]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  const toggleDir = useCallback(async (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Map(prev);
      if (next.has(dirPath)) { next.delete(dirPath); }
      else {
        next.set(dirPath, []);
        loadDir(dirPath).then(items => {
          setExpandedDirs(p => { const n = new Map(p); n.set(dirPath, items); return n; });
        });
      }
      return next;
    });
  }, [loadDir]);

  const openFile = useCallback(async (filePath: string) => {
    const existing = openTabs.findIndex(t => t.path === filePath);
    if (existing >= 0) { setActiveTabIdx(existing); return; }

    try {
      const r = await authFetch(`${API}/kobi/files/read?path=${encodeURIComponent(filePath)}`);
      if (!r.ok) throw new Error("לא ניתן לקרוא");
      const data = await r.json();
      const ext = getExt(filePath);
      const lang = LANG_MAP[ext] || "plaintext";
      const name = filePath.split("/").pop() || filePath;
      const newTab: OpenTab = { path: filePath, name, language: lang, content: data.content, originalContent: data.content, isDirty: false };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabIdx(openTabs.length);
    } catch (e) { console.error("שגיאה בפתיחת קובץ:", e); }
  }, [openTabs]);

  const closeTab = useCallback((idx: number) => {
    setOpenTabs(prev => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setActiveTabIdx(prev => {
      if (idx < prev) return prev - 1;
      if (idx === prev) return Math.min(prev, openTabs.length - 2);
      return prev;
    });
  }, [openTabs.length]);

  const updateTabContent = useCallback((content: string) => {
    if (activeTabIdx < 0) return;
    setOpenTabs(prev => {
      const next = [...prev];
      next[activeTabIdx] = { ...next[activeTabIdx], content, isDirty: content !== next[activeTabIdx].originalContent };
      return next;
    });
  }, [activeTabIdx]);

  const saveFile = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const r = await authFetch(`${API}/kobi/files/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeTab.path, content: activeTab.content }),
      });
      if (!r.ok) throw new Error("שגיאה בשמירה");
      setOpenTabs(prev => {
        const next = [...prev];
        next[activeTabIdx] = { ...next[activeTabIdx], originalContent: next[activeTabIdx].content, isDirty: false };
        return next;
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally { setSaving(false); }
  }, [activeTab, activeTabIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        toggleLeftPanel("search");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setTerminalVisible(v => {
          if (!v && terminalTabs.length === 0) {
            const id = ++terminalIdCounter;
            setTerminalTabs([{ id, name: `טרמינל ${id}`, output: [], input: "", running: false }]);
            setActiveTermIdx(0);
          }
          return !v;
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleLeftPanel("files");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile, toggleLeftPanel]);

  const createTerminalTab = useCallback(() => {
    const id = ++terminalIdCounter;
    const newTab: TerminalTabState = { id, name: `טרמינל ${id}`, output: [], input: "", running: false };
    setTerminalTabs(prev => [...prev, newTab]);
    setActiveTermIdx(terminalTabs.length);
    return newTab;
  }, [terminalTabs.length]);

  const closeTerminalTab = useCallback((idx: number) => {
    setTerminalTabs(prev => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setActiveTermIdx(prev => {
      if (terminalTabs.length <= 1) return 0;
      if (idx < prev) return prev - 1;
      if (idx === prev) return Math.min(prev, terminalTabs.length - 2);
      return prev;
    });
  }, [terminalTabs.length]);

  const updateTermInput = useCallback((idx: number, value: string) => {
    setTerminalTabs(prev => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], input: value };
      return next;
    });
  }, []);

  const runCommand = useCallback(async (cmd: string, tabIdx: number) => {
    if (!cmd.trim()) return;
    setTerminalTabs(prev => {
      const next = [...prev];
      if (next[tabIdx]) next[tabIdx] = { ...next[tabIdx], running: true, output: [...next[tabIdx].output, `$ ${cmd}`], input: "" };
      return next;
    });
    try {
      const r = await authFetch(`${API}/kobi/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await r.json();
      const output = data.output || data.stdout || data.result || "בוצע";
      setTerminalTabs(prev => {
        const next = [...prev];
        if (next[tabIdx]) next[tabIdx] = { ...next[tabIdx], running: false, output: [...next[tabIdx].output, output] };
        return next;
      });
    } catch (e: any) {
      setTerminalTabs(prev => {
        const next = [...prev];
        if (next[tabIdx]) next[tabIdx] = { ...next[tabIdx], running: false, output: [...next[tabIdx].output, `שגיאה: ${e.message}`] };
        return next;
      });
    }
  }, []);

  const clearTerminal = useCallback((idx: number) => {
    setTerminalTabs(prev => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], output: [] };
      return next;
    });
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;
    editor.addAction({
      id: "save-file",
      label: "Save File",
      keybindings: [2048 | 49],
      run: () => saveFile(),
    });
  }, [saveFile]);

  const refreshParentDir = useCallback(async (itemPath: string) => {
    const parts = itemPath.split("/");
    parts.pop();
    const parentPath = parts.length > 0 ? parts.join("/") : ".";
    if (parentPath === "." || parentPath === currentPath) {
      const items = await loadDir(currentPath);
      setRootItems(items);
    }
    if (expandedDirs.has(parentPath)) {
      const items = await loadDir(parentPath);
      setExpandedDirs(p => { const n = new Map(p); n.set(parentPath, items); return n; });
    }
  }, [currentPath, expandedDirs, loadDir]);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: FileItem) => {
    const parentParts = item.path.split("/");
    parentParts.pop();
    setCtxMenu({ x: e.clientX, y: e.clientY, item, parentPath: parentParts.join("/") || "." });
  }, []);

  const handleNewFile = useCallback((parentPath: string) => {
    setCtxMenu(null);
    setNewItemMode({ parentPath, isDir: false });
    setNewItemName("");
  }, []);

  const handleNewFolder = useCallback((parentPath: string) => {
    setCtxMenu(null);
    setNewItemMode({ parentPath, isDir: true });
    setNewItemName("");
  }, []);

  const handleRename = useCallback((item: FileItem) => {
    setCtxMenu(null);
    setRenameTarget({ path: item.path, name: item.name });
    setRenameValue(item.name);
  }, []);

  const handleDelete = useCallback(async (item: FileItem) => {
    setCtxMenu(null);
    if (!confirm(`למחוק את "${item.name}"?`)) return;
    try {
      const r = await authFetch(`${API}/kobi/files/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || "שגיאה במחיקה"); return; }
      setOpenTabs(prev => prev.filter(t => !t.path.startsWith(item.path)));
      await refreshParentDir(item.path);
    } catch (e) { console.error("שגיאה במחיקה:", e); }
  }, [refreshParentDir]);

  const submitNewItem = useCallback(async () => {
    if (!newItemMode || !newItemName.trim()) { setNewItemMode(null); return; }
    const fullPath = newItemMode.parentPath === "." ? newItemName.trim() : `${newItemMode.parentPath}/${newItemName.trim()}`;
    try {
      const r = await authFetch(`${API}/kobi/files/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, isDir: newItemMode.isDir }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || "שגיאה ביצירה"); return; }
      await refreshParentDir(fullPath);
      if (!newItemMode.isDir) openFile(fullPath);
    } catch (e) { console.error("שגיאה ביצירה:", e); }
    setNewItemMode(null);
    setNewItemName("");
  }, [newItemMode, newItemName, refreshParentDir, openFile]);

  const submitRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim() || renameValue === renameTarget.name) { setRenameTarget(null); return; }
    const parts = renameTarget.path.split("/");
    parts.pop();
    const newPath = parts.length > 0 ? `${parts.join("/")}/${renameValue.trim()}` : renameValue.trim();
    try {
      const r = await authFetch(`${API}/kobi/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: renameTarget.path, newPath }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error || "שגיאה בשינוי שם"); return; }
      setOpenTabs(prev => prev.map(t =>
        t.path === renameTarget.path ? { ...t, path: newPath, name: renameValue.trim() } : t
      ));
      await refreshParentDir(renameTarget.path);
    } catch (e) { console.error("שגיאה בשינוי שם:", e); }
    setRenameTarget(null);
  }, [renameTarget, renameValue, refreshParentDir]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

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
    if (imageFiles.length > 0) handleImageUpload(imageFiles);
  }, [handleImageUpload]);

  const sendChat = useCallback(async () => {
    if ((!chatInput.trim() && chatImages.length === 0) || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim(), timestamp: Date.now(), images: chatImages.length > 0 ? [...chatImages] : undefined };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    const imagesToSend = [...chatImages];
    setChatImages([]);
    setChatLoading(true);

    let contextInfo = "";
    if (activeTab) {
      contextInfo = `[קובץ פתוח: ${activeTab.path}]\n`;
      if (activeTab.content) {
        const lines = activeTab.content.split("\n");
        const preview = lines.length > 200 ? lines.slice(0, 200).join("\n") + "\n...(קוצר)" : activeTab.content;
        contextInfo += `[תוכן הקובץ:]\n\`\`\`\n${preview}\n\`\`\`\n`;
      }
    }
    const fullContent = contextInfo + userMsg.content;

    let filesModified = false;
    const beforeContents = new Map<string, string>();
    for (const tab of openTabs) {
      beforeContents.set(tab.path, tab.content);
    }

    try {
      const r = await authFetch(`${API}/kobi/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: fullContent,
            ...(imagesToSend.length > 0 ? { images: imagesToSend.map(img => ({ base64: img.base64, media_type: img.media_type })) } : {}),
          }],
          sessionId: chatSessionId,
        }),
      });

      if (!r.ok) {
        setChatMessages(prev => [...prev, { role: "assistant", content: "שגיאה בחיבור לקובי", timestamp: Date.now() }]);
        setChatLoading(false);
        return;
      }

      const reader = r.body?.getReader();
      if (!reader) { setChatLoading(false); return; }

      const decoder = new TextDecoder();
      let assistantText = "";
      const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now() };
      setChatMessages(prev => [...prev, assistantMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.session_id && !chatSessionId) setChatSessionId(data.session_id);
            if (data.content || data.text) {
              assistantText += (data.content || data.text);
              setChatMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], content: assistantText };
                return next;
              });
            }
            if (data.tool_executing) {
              const toolName = data.tool_executing;
              if (toolName.includes("file") || toolName.includes("write") || toolName.includes("save") || toolName.includes("edit") || toolName.includes("create") || toolName.includes("delete")) {
                filesModified = true;
              }
              assistantText += `\n🔧 ${toolName}...\n`;
              setChatMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], content: assistantText };
                return next;
              });
            }
            if (data.tool_result) {
              filesModified = true;
            }
          } catch {}
        }
      }

      if (filesModified) {
        const diffs: FileDiff[] = [];
        for (const tab of openTabs) {
          try {
            const fr = await authFetch(`${API}/kobi/files/read?path=${encodeURIComponent(tab.path)}`);
            if (fr.ok) {
              const fd = await fr.json();
              if (fd.data?.content !== undefined) {
                const oldContent = beforeContents.get(tab.path) || "";
                const newContent = fd.data.content;
                if (oldContent !== newContent) {
                  const diffLines = computeSimpleDiff(oldContent, newContent);
                  if (diffLines.length > 0) {
                    diffs.push({ path: tab.path, lines: diffLines });
                  }
                }
                setOpenTabs(prev => prev.map(t =>
                  t.path === tab.path ? { ...t, content: newContent, isDirty: false } : t
                ));
              }
            }
          } catch {}
        }
        if (diffs.length > 0) {
          setChatMessages(prev => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
              next[lastIdx] = { ...next[lastIdx], diffs };
            }
            return next;
          });
        }
        loadRoot();
      }
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `שגיאה: ${e.message}`, timestamp: Date.now() }]);
    } finally { setChatLoading(false); }
  }, [chatInput, chatImages, chatLoading, chatSessionId, activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { type, startX, startY, startSize } = resizingRef.current;
      if (type === "left") {
        const newW = Math.max(180, Math.min(500, startSize + (e.clientX - startX)));
        setSidebarWidth(newW);
      } else if (type === "right") {
        const newW = Math.max(280, Math.min(700, startSize - (e.clientX - startX)));
        setRightPanelWidth(newW);
      } else if (type === "terminal") {
        const newH = Math.max(100, Math.min(500, startSize - (e.clientY - startY)));
        setTerminalHeight(newH);
      }
    };
    const onMouseUp = () => { resizingRef.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  const startResize = useCallback((type: "left" | "right" | "terminal", e: React.MouseEvent) => {
    e.preventDefault();
    const startSize = type === "left" ? sidebarWidth : type === "right" ? rightPanelWidth : terminalHeight;
    resizingRef.current = { type, startX: e.clientX, startY: e.clientY, startSize };
    document.body.style.cursor = type === "terminal" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth, rightPanelWidth, terminalHeight]);

  const toggleLeftPanel = useCallback((panel: "files" | "search" | "git") => {
    setLeftPanel(prev => prev === panel ? null : panel);
  }, []);

  const toggleRightPanel = useCallback((panel: "preview" | "chat") => {
    setRightPanel(prev => prev === panel ? null : panel);
  }, []);

  const loadGitStatus = useCallback(async () => {
    setGitLoading(true);
    try {
      const r = await authFetch(`${API}/kobi/git/status`);
      if (r.ok) {
        const d = await r.json();
        if (d.data) {
          setGitBranch(d.data.branch || "main");
          setGitFiles(d.data.files || []);
          setGitCommits(d.data.commits || []);
          setGitBranches(d.data.branches || []);
        }
      }
    } catch {} finally { setGitLoading(false); }
  }, []);

  const gitAction = useCallback(async (action: string, message?: string, files?: string[]) => {
    setGitLoading(true);
    try {
      const r = await authFetch(`${API}/kobi/git/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, message, files }),
      });
      if (r.ok) {
        const d = await r.json();
        if (action === "diff") {
          setGitDiffContent(d.output || "אין שינויים");
          setGitDiffFile(files?.[0] || null);
        }
      }
      await loadGitStatus();
    } catch {} finally { setGitLoading(false); }
  }, [loadGitStatus]);

  useEffect(() => {
    if (leftPanel === "git") loadGitStatus();
  }, [leftPanel, loadGitStatus]);

  const dirtyCount = openTabs.filter(t => t.isDirty).length;

  const filteredRootItems = fileFilter
    ? rootItems.filter(i => i.name.toLowerCase().includes(fileFilter.toLowerCase()))
    : rootItems;

  return (
    <div className="h-screen flex flex-col bg-card text-foreground overflow-hidden" dir="ltr">

      <div className="flex flex-1 overflow-hidden">

        <div className="w-12 bg-card border-l border-border flex flex-col items-center py-2 gap-1 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-2">
            <Code2 className="w-4 h-4 text-cyan-400" />
          </div>

          <button onClick={() => toggleLeftPanel("files")} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${leftPanel === "files" ? "bg-muted text-cyan-400" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"}`} title="סייר קבצים">
            <FolderTree className="w-4 h-4" />
          </button>
          <button onClick={() => toggleLeftPanel("search")} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${leftPanel === "search" ? "bg-muted text-cyan-400" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"}`} title="חיפוש">
            <Search className="w-4 h-4" />
          </button>
          <button onClick={() => toggleLeftPanel("git")} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors relative ${leftPanel === "git" ? "bg-muted text-orange-400" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"}`} title="Git">
            <GitBranch className="w-4 h-4" />
            {gitFiles.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-400" />}
          </button>

          <div className="flex-1" />

          <button onClick={() => {
            setTerminalVisible(v => {
              if (!v && terminalTabs.length === 0) {
                const id = ++terminalIdCounter;
                setTerminalTabs([{ id, name: `טרמינל ${id}`, output: [], input: "", running: false }]);
                setActiveTermIdx(0);
              }
              return !v;
            });
          }} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${terminalVisible ? "bg-muted text-green-400" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"}`} title="טרמינל">
            <Terminal className="w-4 h-4" />
          </button>
          <button onClick={() => toggleRightPanel("preview")} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${rightPanel === "preview" ? "bg-muted text-cyan-400" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"}`} title="תצוגה מקדימה">
            <Globe className="w-4 h-4" />
          </button>
          <button onClick={() => toggleRightPanel("chat")} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${rightPanel === "chat" ? "bg-muted text-purple-400" : "text-gray-500 hover:text-gray-300 hover:bg-muted/50"}`} title="קובי AI">
            <MessageSquare className="w-4 h-4" />
          </button>

          <div className="mt-2 mb-1">
            <button onClick={() => setMinimap(v => !v)} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${minimap ? "text-cyan-400" : "text-gray-600 hover:text-gray-400"}`} title="מיני-מפה">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {leftPanel && (<>
          <div className="flex flex-col border-l border-border bg-card flex-shrink-0" style={{ width: sidebarWidth }}>
            {leftPanel === "files" && (<>
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/60">
              <FolderTree className="w-3 h-3 text-cyan-400/60" />
              <span className="text-[10px] text-gray-400 flex-1">סייר קבצים</span>
              <button onClick={() => handleNewFile(currentPath)} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="קובץ חדש">
                <FilePlus className="w-3 h-3" />
              </button>
              <button onClick={() => handleNewFolder(currentPath)} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="תיקייה חדשה">
                <FolderPlus className="w-3 h-3" />
              </button>
              <button onClick={() => { setCurrentPath("."); setExpandedDirs(new Map()); loadRoot(); }} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="רענן">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <div className="px-2 py-1">
              <input
                value={fileFilter}
                onChange={e => setFileFilter(e.target.value)}
                placeholder="סנן..."
                className="w-full bg-card border border-border rounded px-2 py-0.5 text-[11px] text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40"
              />
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
              ) : filteredRootItems.length === 0 ? (
                <div className="text-center py-8 text-[10px] text-gray-600">אין קבצים</div>
              ) : (
                <>
                  {newItemMode && newItemMode.parentPath === currentPath && (
                    <div className="flex items-center gap-1 px-2 py-1">
                      {newItemMode.isDir ? <FolderPlus className="w-3 h-3 text-amber-400" /> : <FilePlus className="w-3 h-3 text-cyan-400" />}
                      <input
                        autoFocus
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") submitNewItem(); if (e.key === "Escape") { setNewItemMode(null); setNewItemName(""); } }}
                        onBlur={submitNewItem}
                        placeholder={newItemMode.isDir ? "שם תיקייה..." : "שם קובץ..."}
                        className="flex-1 bg-card border border-cyan-500/50 rounded px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none"
                      />
                    </div>
                  )}
                  {filteredRootItems.map(item => (
                    <TreeNode
                      key={item.path}
                      item={item}
                      depth={0}
                      onSelect={openFile}
                      expandedDirs={expandedDirs}
                      toggleDir={toggleDir}
                      activeFile={activeTab?.path || null}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                </>
              )}
            </div>

            <div className="px-2 py-1.5 border-t border-border/60 text-[9px] text-gray-600 flex items-center justify-between">
              <span>{rootItems.length} פריטים</span>
              <span className="font-mono">{currentPath}</span>
            </div>
            </>)}

            {leftPanel === "search" && (
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/60">
                  <Search className="w-3 h-3 text-cyan-400/60" />
                  <span className="text-[10px] text-gray-400 flex-1">חיפוש</span>
                </div>
                <div className="p-2">
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") setLeftPanel("files"); }}
                    placeholder="חיפוש בקבצים..."
                    className="w-full bg-card border border-border rounded px-2 py-1.5 text-[11px] text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40"
                    dir="rtl"
                  />
                </div>
                <div className="flex-1 overflow-y-auto px-2">
                  {searchResults.length > 0 && searchResults.map((r, i) => (
                    <button key={i} onClick={() => openFile(r.path)} className="w-full text-right px-2 py-1.5 text-[10px] text-gray-400 hover:text-foreground hover:bg-muted/30 rounded truncate" dir="ltr">
                      {r.path}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {leftPanel === "git" && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/60">
                  <GitBranch className="w-3 h-3 text-orange-400/60" />
                  <span className="text-[10px] text-gray-400">Git</span>
                  <select
                    value={gitBranch}
                    onChange={async (e) => { await gitAction("checkout", undefined, [e.target.value]); setGitBranch(e.target.value); }}
                    className="text-[9px] text-gray-400 bg-card border border-border rounded px-1 py-0.5 font-mono focus:outline-none max-w-[100px]"
                    dir="ltr"
                  >
                    {gitBranches.map(b => (<option key={b} value={b}>{b}</option>))}
                  </select>
                  <div className="flex-1" />
                  <button onClick={loadGitStatus} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                    {gitLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                </div>

                <div className="p-2 border-b border-border/40">
                  <input
                    value={gitCommitMsg}
                    onChange={e => setGitCommitMsg(e.target.value)}
                    placeholder="הודעת commit..."
                    className="w-full bg-card border border-border rounded px-2 py-1 text-[10px] text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-orange-500/40 mb-1.5"
                    dir="rtl"
                    onKeyDown={e => { if (e.key === "Enter" && gitCommitMsg.trim()) { gitAction("commit", gitCommitMsg); setGitCommitMsg(""); } }}
                  />
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => { if (gitCommitMsg.trim()) { gitAction("commit", gitCommitMsg); setGitCommitMsg(""); } }} disabled={!gitCommitMsg.trim() || gitLoading} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 disabled:opacity-30">
                      <GitCommit className="w-2.5 h-2.5" /> Commit
                    </button>
                    <button onClick={() => gitAction("push")} disabled={gitLoading} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-30">
                      <Upload className="w-2.5 h-2.5" /> Push
                    </button>
                    <button onClick={() => gitAction("stash")} disabled={gitLoading} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-muted/50 text-gray-400 hover:bg-muted/80 disabled:opacity-30">
                      <Archive className="w-2.5 h-2.5" /> Stash
                    </button>
                  </div>
                </div>

                <div className="flex border-b border-border/40">
                  <button onClick={() => setGitTab("changes")} className={`flex-1 text-[9px] py-1 ${gitTab === "changes" ? "text-orange-400 border-b border-orange-400" : "text-gray-500"}`}>שינויים ({gitFiles.length})</button>
                  <button onClick={() => setGitTab("history")} className={`flex-1 text-[9px] py-1 ${gitTab === "history" ? "text-orange-400 border-b border-orange-400" : "text-gray-500"}`}>היסטוריה</button>
                </div>

                {gitTab === "changes" && (
                  <div className="flex-1 overflow-y-auto">
                    {gitFiles.length === 0 ? (
                      <div className="flex flex-col items-center py-6 text-center opacity-50">
                        <CheckCircle2 className="w-6 h-6 text-green-400 mb-1" />
                        <p className="text-[10px] text-gray-600">עץ נקי</p>
                      </div>
                    ) : gitFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 hover:bg-muted/30 group border-b border-border/10">
                        <span className={`text-[8px] font-mono px-0.5 rounded ${f.status === "??" || f.status === "A" ? "text-green-400" : f.status === "D" ? "text-red-400" : "text-yellow-400"}`}>{f.status}</span>
                        <span className="text-[9px] text-gray-400 truncate flex-1 font-mono" dir="ltr">{f.path}</span>
                        <button onClick={() => gitAction("diff", undefined, [f.path])} className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-cyan-400"><Eye className="w-2.5 h-2.5" /></button>
                        <button onClick={() => gitAction("reset", undefined, [f.path])} className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"><RotateCcw className="w-2.5 h-2.5" /></button>
                      </div>
                    ))}
                    {gitDiffContent && (
                      <div className="border-t border-border max-h-48 overflow-y-auto bg-card">
                        <div className="flex items-center px-2 py-0.5 bg-card border-b border-border/60 sticky top-0">
                          <span className="text-[9px] text-yellow-400/80 font-mono truncate flex-1" dir="ltr">{gitDiffFile}</span>
                          <button onClick={() => { setGitDiffContent(null); setGitDiffFile(null); }} className="p-0.5 text-gray-500 hover:text-gray-300"><X className="w-2.5 h-2.5" /></button>
                        </div>
                        <pre className="text-[9px] font-mono p-1 whitespace-pre-wrap" dir="ltr">
                          {gitDiffContent.split("\n").map((line, li) => (
                            <div key={li} className={line.startsWith("+") && !line.startsWith("+++") ? "text-green-400 bg-green-500/5" : line.startsWith("-") && !line.startsWith("---") ? "text-red-400 bg-red-500/5" : line.startsWith("@@") ? "text-cyan-400" : "text-gray-500"}>{line}</div>
                          ))}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {gitTab === "history" && (
                  <div className="flex-1 overflow-y-auto">
                    {gitCommits.map((c, i) => (
                      <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 border-b border-border/10 hover:bg-muted/20">
                        <GitCommit className="w-2.5 h-2.5 text-orange-400/60 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[9px] text-gray-300 truncate">{c.message}</p>
                          <p className="text-[8px] text-gray-600 font-mono" dir="ltr">{c.hash}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="w-1 bg-muted/30 hover:bg-cyan-500/30 cursor-col-resize flex-shrink-0 transition-colors" onMouseDown={e => startResize("left", e)} />
        </>)}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {openTabs.length > 0 && (
            <div className="flex items-center bg-card border-b border-border overflow-x-auto flex-shrink-0">
              {openTabs.map((tab, idx) => (
                <button
                  key={tab.path}
                  onClick={() => setActiveTabIdx(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-l border-border/50 whitespace-nowrap group transition-colors ${
                    idx === activeTabIdx
                      ? "bg-card text-cyan-300 border-t-2 border-t-cyan-400"
                      : "text-gray-400 hover:text-foreground hover:bg-card border-t-2 border-t-transparent"
                  }`}
                >
                  <FileCode className={`w-3 h-3 ${EXT_COLORS[getExt(tab.name)] || "text-gray-500"}`} />
                  <span>{tab.name}</span>
                  {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  <button
                    onClick={e => { e.stopPropagation(); closeTab(idx); }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted/50 text-gray-500 hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-hidden min-w-0">
              {activeTab ? (
                <Suspense fallback={<div className="flex items-center justify-center h-full bg-card"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>}>
                  <MonacoEditor
                    height="100%"
                    language={activeTab.language}
                    value={activeTab.content}
                    theme="vs-dark"
                    onChange={v => updateTabContent(v || "")}
                    onMount={handleEditorMount}
                    options={{
                      fontSize,
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                      minimap: { enabled: minimap, scale: 2 },
                      wordWrap,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      renderWhitespace: "selection",
                      tabSize: 2,
                      automaticLayout: true,
                      smoothScrolling: true,
                      cursorBlinking: "smooth",
                      cursorSmoothCaretAnimation: "on",
                      bracketPairColorization: { enabled: true },
                      guides: { bracketPairs: true, indentation: true },
                      suggest: { showMethods: true, showFunctions: true, showConstructors: true, showFields: true, showVariables: true, showClasses: true, showInterfaces: true, showModules: true, showProperties: true, showEvents: true, showOperators: true, showUnits: true, showValues: true, showConstants: true, showEnums: true, showEnumMembers: true, showKeywords: true, showWords: true, showColors: true, showFiles: true, showReferences: true, showFolders: true, showTypeParameters: true, showSnippets: true },
                      padding: { top: 8 },
                      folding: true,
                      foldingStrategy: "indentation",
                      showFoldingControls: "always",
                      renderLineHighlight: "all",
                      renderLineHighlightOnlyWhenFocus: false,
                      colorDecorators: true,
                      linkedEditing: true,
                      formatOnPaste: true,
                      formatOnType: true,
                      autoClosingBrackets: "always",
                      autoClosingQuotes: "always",
                      autoSurround: "languageDefined",
                      stickyScroll: { enabled: true },
                    }}
                  />
                </Suspense>
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-card text-gray-500">
                  <Code2 className="w-20 h-20 mb-4 opacity-10" />
                  <p className="text-lg font-medium text-gray-400 mb-1">Kobi IDE</p>
                  <p className="text-sm text-gray-600 mb-6">בחר קובץ מסייר הקבצים לעריכה</p>
                  <div className="flex flex-col gap-2 text-[11px] text-gray-600">
                    <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 bg-muted rounded font-mono">Ctrl+S</span> שמירה</div>
                    <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 bg-muted rounded font-mono">Ctrl+B</span> סייר קבצים</div>
                    <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 bg-muted rounded font-mono">Ctrl+`</span> טרמינל</div>
                    <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 bg-muted rounded font-mono">Ctrl+P</span> חיפוש</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {terminalVisible && (
            <div className="w-full h-1 bg-muted/30 hover:bg-green-500/30 cursor-row-resize flex-shrink-0 transition-colors" onMouseDown={e => startResize("terminal", e)} />
          )}

          {terminalVisible && terminalTabs.length > 0 && (() => {
            const activeTerm = terminalTabs[activeTermIdx] || terminalTabs[0];
            const termIdx = terminalTabs[activeTermIdx] ? activeTermIdx : 0;
            return (
              <div className="border-t border-border bg-card flex flex-col flex-shrink-0" style={{ height: terminalHeight }}>
                <div className="flex items-center border-b border-border/60">
                  <div className="flex items-center flex-1 overflow-x-auto">
                    {terminalTabs.map((tt, idx) => (
                      <button
                        key={tt.id}
                        onClick={() => setActiveTermIdx(idx)}
                        className={`flex items-center gap-1 px-2.5 py-1 text-[10px] border-l border-border/40 group whitespace-nowrap ${
                          idx === termIdx
                            ? "bg-card text-emerald-300 border-t border-t-emerald-400"
                            : "bg-card text-gray-500 hover:text-gray-300 border-t border-t-transparent"
                        }`}
                      >
                        <Terminal className="w-3 h-3" />
                        <span>{tt.name}</span>
                        {tt.running && <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-400" />}
                        {terminalTabs.length > 1 && (
                          <button
                            onClick={e => { e.stopPropagation(); closeTerminalTab(idx); }}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted/50 text-gray-500 hover:text-foreground"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 px-2">
                    <button onClick={createTerminalTab} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-emerald-300" title="טרמינל חדש">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button onClick={() => clearTerminal(termIdx)} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="נקה">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => setTerminalVisible(false)} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-1 font-mono text-[12px]">
                  {activeTerm.output.map((line, i) => (
                    <div key={i} className={`whitespace-pre-wrap ${line.startsWith("$") ? "text-emerald-400" : line.startsWith("שגיאה") ? "text-red-400" : "text-gray-300"}`}>
                      {line}
                    </div>
                  ))}
                  {activeTerm.running && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin mt-1" />}
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/40">
                  <span className="text-emerald-400 text-xs">$</span>
                  <input
                    ref={terminalInputRef}
                    value={activeTerm.input}
                    onChange={e => updateTermInput(termIdx, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") runCommand(activeTerm.input, termIdx); }}
                    placeholder="הקלד פקודה..."
                    disabled={activeTerm.running}
                    className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-gray-600 focus:outline-none font-mono"
                  />
                  <button
                    onClick={() => runCommand(activeTerm.input, termIdx)}
                    disabled={activeTerm.running || !activeTerm.input.trim()}
                    className="p-1 rounded hover:bg-muted/50 text-emerald-400 disabled:opacity-30"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {rightPanel && (
          <>
          <div className="w-1 bg-muted/30 hover:bg-purple-500/30 cursor-col-resize flex-shrink-0 transition-colors" onMouseDown={e => startResize("right", e)} />

          <div className="flex flex-col border-l border-border bg-card flex-shrink-0" style={{ width: rightPanelWidth }}>

            {rightPanel === "preview" && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-1 border-b border-border/60 bg-card">
                  <Globe className="w-3 h-3 text-cyan-400/60" />
                  <span className="text-[10px] text-gray-400">תצוגה מקדימה</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-0.5 bg-card rounded px-1 py-0.5">
                    <button onClick={() => setPreviewDevice("mobile")} className={`p-0.5 rounded ${previewDevice === "mobile" ? "text-cyan-400 bg-cyan-500/10" : "text-gray-500 hover:text-gray-300"}`} title="נייד">
                      <Smartphone className="w-3 h-3" />
                    </button>
                    <button onClick={() => setPreviewDevice("tablet")} className={`p-0.5 rounded ${previewDevice === "tablet" ? "text-cyan-400 bg-cyan-500/10" : "text-gray-500 hover:text-gray-300"}`} title="טאבלט">
                      <Tablet className="w-3 h-3" />
                    </button>
                    <button onClick={() => setPreviewDevice("desktop")} className={`p-0.5 rounded ${previewDevice === "desktop" ? "text-cyan-400 bg-cyan-500/10" : "text-gray-500 hover:text-gray-300"}`} title="מחשב">
                      <Monitor className="w-3 h-3" />
                    </button>
                  </div>
                  <button onClick={() => setPreviewKey(k => k + 1)} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="רענן">
                    <RotateCw className="w-3 h-3" />
                  </button>
                  <button onClick={() => window.open(previewUrl, "_blank")} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="פתח בחלון חדש">
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button onClick={() => setRightPanel(null)} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 border-b border-border/40 bg-card">
                  <button onClick={() => { if (iframeRef.current) try { iframeRef.current.contentWindow?.history.back(); } catch {} }} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                  <button onClick={() => { if (iframeRef.current) try { iframeRef.current.contentWindow?.history.forward(); } catch {} }} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button onClick={() => { setPreviewUrl("/"); setPreviewUrlInput("/"); setPreviewKey(k => k + 1); }} className="p-0.5 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                    <Home className="w-3 h-3" />
                  </button>
                  <input
                    value={previewUrlInput}
                    onChange={e => setPreviewUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { setPreviewUrl(previewUrlInput); setPreviewKey(k => k + 1); } }}
                    className="flex-1 bg-card border border-border rounded px-2 py-0.5 text-[11px] text-gray-300 font-mono focus:outline-none focus:border-cyan-500/40"
                    dir="ltr"
                  />
                </div>
                <div className="flex-1 overflow-hidden flex items-center justify-center bg-card">
                  <div className={`h-full transition-all duration-200 ${previewDevice === "mobile" ? "w-[375px] border-x border-border" : previewDevice === "tablet" ? "w-[768px] border-x border-border" : "w-full"}`}>
                    <iframe ref={iframeRef} key={previewKey} src={previewUrl} className="w-full h-full bg-card" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals" title="תצוגה מקדימה" />
                  </div>
                </div>
                <div className="px-2 py-1 border-t border-border/60 text-[9px] text-gray-600 flex items-center gap-2">
                  <Globe className="w-2.5 h-2.5" />
                  <span className="font-mono truncate flex-1">{previewUrl}</span>
                  <span>{previewDevice === "mobile" ? "375px" : previewDevice === "tablet" ? "768px" : "100%"}</span>
                </div>
              </div>
            )}

            {rightPanel === "chat" && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-card">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                    </div>
                    <span className="text-xs font-medium text-purple-300">קובי AI</span>
                  </div>
                  <div className="flex-1" />
                  <button onClick={() => { setChatMessages([]); setChatSessionId(null); }} className="p-1 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300" title="שיחה חדשה">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setRightPanel(null)} className="p-1 rounded hover:bg-muted/50 text-gray-500 hover:text-gray-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div
                  className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${chatDragOver ? "bg-purple-500/5 ring-2 ring-inset ring-purple-500/30" : ""}`}
                  dir="rtl"
                  onDragOver={e => { e.preventDefault(); setChatDragOver(true); }}
                  onDragLeave={() => setChatDragOver(false)}
                  onDrop={handleChatDrop}
                >
                  {chatDragOver && (
                    <div className="flex flex-col items-center justify-center py-8 pointer-events-none">
                      <ImagePlus className="w-10 h-10 text-purple-400/60 mb-2" />
                      <p className="text-sm text-purple-400/60">שחרר תמונה כאן</p>
                    </div>
                  )}
                  {chatMessages.length === 0 && !chatDragOver && (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                      <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
                        <Bot className="w-6 h-6 text-purple-400" />
                      </div>
                      <p className="text-sm text-gray-400 mb-1">שלום! אני קובי</p>
                      <p className="text-xs text-gray-600">שאל אותי כל שאלה על הקוד, בקש עזרה, או תן לי משימה</p>
                      <div className="mt-4 space-y-1.5 w-full max-w-[250px]">
                        {["תקן את הבאג הזה", "הסבר את הקוד", "ערוך את הקובץ הפתוח", "נתח תמונה שאעלה", "שפר את הביצועים"].map(s => (
                          <button key={s} onClick={() => { setChatInput(s); }} className="w-full text-right px-3 py-1.5 rounded-lg border border-border text-[11px] text-gray-400 hover:text-foreground hover:border-purple-500/30 hover:bg-purple-500/5 transition-colors">
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === "user" ? "bg-cyan-500/20" : "bg-purple-500/20"}`}>
                        {msg.role === "user" ? <User className="w-3 h-3 text-cyan-400" /> : <Bot className="w-3 h-3 text-purple-400" />}
                      </div>
                      <div className="max-w-[85%] space-y-2">
                        <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${msg.role === "user" ? "bg-cyan-500/10 text-foreground border border-cyan-500/20" : "bg-card text-gray-300 border border-border"}`}>
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {msg.images.map((img, ii) => (
                                <div key={ii} className="relative group/img">
                                  <img src={img.preview_url} alt={img.name} className="w-20 h-20 object-cover rounded-md border border-border/50 cursor-pointer hover:border-purple-400/50 transition-colors" onClick={() => window.open(img.preview_url, "_blank")} />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-gray-300 px-1 py-0.5 rounded-b-md truncate opacity-0 group-hover/img:opacity-100 transition-opacity">{img.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {msg.content && <pre className="whitespace-pre-wrap font-sans text-right" dir="rtl">{msg.content}</pre>}
                          {!msg.content && !msg.images?.length && chatLoading && i === chatMessages.length - 1 && <pre className="whitespace-pre-wrap font-sans text-right" dir="rtl">...</pre>}
                        </div>
                        {msg.diffs && msg.diffs.length > 0 && (
                          <div className="space-y-2">
                            {msg.diffs.map((diff, di) => (
                              <div key={di} className="rounded-lg border border-border overflow-hidden bg-card">
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-card border-b border-border/60">
                                  <FileCode className="w-3 h-3 text-yellow-400/70" />
                                  <span className="text-[10px] text-yellow-400/80 font-mono truncate" dir="ltr">{diff.path}</span>
                                  <span className="text-[9px] text-gray-600 mr-auto">+{diff.lines.filter(l => l.type === "add").length} -{diff.lines.filter(l => l.type === "remove").length}</span>
                                </div>
                                <div className="overflow-x-auto max-h-48 overflow-y-auto" dir="ltr">
                                  {diff.lines.map((dl, dli) => (
                                    <div key={dli} className={`flex text-[10px] font-mono leading-5 ${dl.type === "add" ? "bg-green-500/10 text-green-300" : dl.type === "remove" ? "bg-red-500/10 text-red-300" : "text-gray-500"}`}>
                                      <span className="w-8 text-right px-1 text-gray-600 select-none flex-shrink-0 border-l border-border/40">{dl.lineNum || ""}</span>
                                      <span className="w-4 text-center select-none flex-shrink-0">{dl.type === "add" ? "+" : dl.type === "remove" ? "-" : " "}</span>
                                      <span className="px-1 whitespace-pre">{dl.text}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatLoading && chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role !== "assistant" && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-purple-500/20">
                        <Bot className="w-3 h-3 text-purple-400" />
                      </div>
                      <div className="bg-card rounded-lg px-3 py-2 border border-border">
                        <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {activeTab && (
                  <div className="px-3 py-1 border-t border-border/40 flex items-center gap-1.5" dir="rtl">
                    <Code2 className="w-3 h-3 text-gray-600" />
                    <span className="text-[9px] text-gray-600 truncate">הקשר: {activeTab.path}</span>
                  </div>
                )}

                <div className="p-2 border-t border-border/60 bg-card">
                  {chatImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                      {chatImages.map((img, ii) => (
                        <div key={ii} className="relative group/staged">
                          <img src={img.preview_url} alt={img.name} className="w-14 h-14 object-cover rounded-md border border-purple-500/30" />
                          <button onClick={() => setChatImages(prev => prev.filter((_, idx) => idx !== ii))} className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 text-foreground flex items-center justify-center opacity-0 group-hover/staged:opacity-100 transition-opacity">
                            <X className="w-2.5 h-2.5" />
                          </button>
                          <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[7px] text-gray-300 px-0.5 rounded-b-md truncate">{img.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-1.5" dir="rtl">
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      onPaste={handleChatPaste}
                      placeholder={chatImages.length > 0 ? "תאר את התמונה או שאל שאלה..." : "שאל את קובי..."}
                      rows={2}
                      className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-purple-500/40 resize-none"
                      dir="rtl"
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => chatFileInputRef.current?.click()} className="p-2 rounded-lg bg-muted/50 text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 transition-colors" title="העלה תמונה">
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      <button onClick={sendChat} disabled={chatLoading || (!chatInput.trim() && chatImages.length === 0)} className="p-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <input ref={chatFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) { handleImageUpload(e.target.files); e.target.value = ""; } }} />
                </div>
              </div>
            )}
          </div>
          </>
        )}

      </div>

      <div className="h-6 bg-card border-t border-border flex items-center px-3 text-[10px] text-gray-500 gap-4 flex-shrink-0">
        {saveStatus === "saved" && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> נשמר</span>}
        {saveStatus === "error" && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> שגיאה</span>}
        {dirtyCount > 0 && <span className="text-amber-400">{dirtyCount} לא שמורים</span>}
        <button onClick={saveFile} disabled={!activeTab?.isDirty || saving} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 text-foreground rounded text-[10px]">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          שמור
        </button>
        <div className="flex-1" />
        {activeTab && (
          <>
            <span className="flex items-center gap-1">
              <FileCode className="w-3 h-3" />
              {activeTab.language}
            </span>
            <span>{activeTab.content.split("\n").length} שורות</span>
            <span>{(new TextEncoder().encode(activeTab.content).length / 1024).toFixed(1)}KB</span>
          </>
        )}
        <span className="flex-1" />
        <span>גופן: {fontSize}px</span>
        <span>Tab: 2</span>
        <span className="text-cyan-400/60">UTF-8</span>
      </div>

      {ctxMenu && ctxMenu.item && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg shadow-2xl py-1 min-w-[180px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => handleNewFile(ctxMenu.item!.isDir ? ctxMenu.item!.path : ctxMenu.parentPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-300 hover:bg-cyan-500/15 hover:text-cyan-300"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>קובץ חדש</span>
          </button>
          <button
            onClick={() => handleNewFolder(ctxMenu.item!.isDir ? ctxMenu.item!.path : ctxMenu.parentPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-300 hover:bg-cyan-500/15 hover:text-cyan-300"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>תיקייה חדשה</span>
          </button>
          <div className="border-t border-border/50 my-1" />
          <button
            onClick={() => handleRename(ctxMenu.item!)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-300 hover:bg-cyan-500/15 hover:text-cyan-300"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>שנה שם</span>
          </button>
          <button
            onClick={() => handleDelete(ctxMenu.item!)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/15 hover:text-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>מחק</span>
          </button>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRenameTarget(null)}>
          <div className="bg-card border border-border rounded-lg p-4 w-80" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-300 mb-2" dir="rtl">שנה שם:</p>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenameTarget(null); }}
              className="w-full bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-cyan-500/50 mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRenameTarget(null)} className="px-3 py-1 text-xs text-gray-400 hover:text-foreground rounded hover:bg-muted/50">ביטול</button>
              <button onClick={submitRename} className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-foreground rounded">שנה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
