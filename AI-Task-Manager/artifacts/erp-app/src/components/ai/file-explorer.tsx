import { useState, useEffect, useCallback } from "react";
import { FolderOpen, FolderClosed, FileText, FileCode, Database, Image, ChevronLeft, RefreshCw, Loader2 } from "lucide-react";
import { authFetch } from "../../lib/utils";

const API = "/api";

interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface FileExplorerProps {
  onFileSelect: (path: string) => void;
  highlightedFiles?: string[];
}

const FILE_ICONS: Record<string, typeof FileText> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  sql: Database, png: Image, jpg: Image, jpeg: Image, svg: Image,
};

function getFileIcon(name: string, isDir: boolean) {
  if (isDir) return FolderClosed;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || FileText;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1048576).toFixed(1)}M`;
}

function TreeNode({ item, onFileSelect, expandedDirs, toggleDir, highlightedFiles }: {
  item: FileItem;
  onFileSelect: (path: string) => void;
  expandedDirs: Map<string, FileItem[]>;
  toggleDir: (path: string) => void;
  highlightedFiles?: string[];
}) {
  const isExpanded = expandedDirs.has(item.path);
  const children = expandedDirs.get(item.path);
  const Icon = item.isDir ? (isExpanded ? FolderOpen : FolderClosed) : getFileIcon(item.name, false);
  const isHighlighted = highlightedFiles?.some(f => item.path.includes(f));

  return (
    <div>
      <button
        onClick={() => item.isDir ? toggleDir(item.path) : onFileSelect(item.path)}
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-right hover:bg-purple-500/10 transition-colors group ${
          isHighlighted ? "bg-amber-500/10 border-r-2 border-amber-400" : ""
        }`}
      >
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${
          item.isDir ? "text-amber-400/70" : "text-purple-400/60"
        }`} />
        <span className={`text-[11px] truncate flex-1 ${
          isHighlighted ? "text-amber-300" : "text-gray-300 group-hover:text-gray-100"
        }`}>
          {item.name}
        </span>
        {!item.isDir && (
          <span className="text-[9px] text-gray-600 opacity-0 group-hover:opacity-100">{formatSize(item.size)}</span>
        )}
      </button>
      {item.isDir && isExpanded && children && (
        <div className="mr-3 border-r border-gray-800/40">
          {children.map(child => (
            <TreeNode
              key={child.path}
              item={child}
              onFileSelect={onFileSelect}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
              highlightedFiles={highlightedFiles}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileExplorer({ onFileSelect, highlightedFiles }: FileExplorerProps) {
  const [rootItems, setRootItems] = useState<FileItem[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Map<string, FileItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(".");

  const loadDir = useCallback(async (path: string): Promise<FileItem[]> => {
    try {
      const r = await authFetch(`${API}/kobi/files?path=${encodeURIComponent(path)}`);
      const data = await r.json();
      return data.items || [];
    } catch {
      return [];
    }
  }, []);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    const items = await loadDir(currentPath);
    setRootItems(items);
    setLoading(false);
  }, [currentPath, loadDir]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  const toggleDir = useCallback(async (path: string) => {
    setExpandedDirs(prev => {
      const next = new Map(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.set(path, []);
        loadDir(path).then(items => {
          setExpandedDirs(p => {
            const n = new Map(p);
            n.set(path, items);
            return n;
          });
        });
      }
      return next;
    });
  }, [loadDir]);

  const navigateUp = () => {
    const parts = currentPath.split("/");
    if (parts.length > 1) {
      parts.pop();
      setCurrentPath(parts.join("/") || ".");
      setExpandedDirs(new Map());
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a12]">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-purple-500/10">
        <span className="text-[10px] text-purple-400/60 flex-1 truncate font-mono">{currentPath}</span>
        <button onClick={navigateUp} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300" title="תיקייה למעלה">
          <ChevronLeft className="w-3 h-3" />
        </button>
        <button onClick={loadRoot} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300" title="רענן">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          </div>
        ) : rootItems.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-gray-600">תיקייה ריקה</div>
        ) : (
          rootItems.map(item => (
            <TreeNode
              key={item.path}
              item={item}
              onFileSelect={onFileSelect}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
              highlightedFiles={highlightedFiles}
            />
          ))
        )}
      </div>
    </div>
  );
}
