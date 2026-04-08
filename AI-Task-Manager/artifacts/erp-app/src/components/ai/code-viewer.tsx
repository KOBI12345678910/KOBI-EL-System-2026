import { useState, useEffect } from "react";
import { FileCode, Loader2, X, Copy, Check } from "lucide-react";
import { authFetch } from "../../lib/utils";

const API = "/api";

interface CodeViewerProps {
  filePath: string | null;
  changedLines?: number[];
  onClose?: () => void;
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  json: "json", sql: "sql", css: "css", html: "html", md: "markdown",
  py: "python", sh: "bash", yml: "yaml", yaml: "yaml", xml: "xml",
  env: "bash", toml: "toml",
};

export default function CodeViewer({ filePath, changedLines, onClose }: CodeViewerProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lineCount, setLineCount] = useState(0);
  const [ext, setExt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError("");
    authFetch(`${API}/kobi/files/read?path=${encodeURIComponent(filePath)}`)
      .then(r => {
        if (!r.ok) throw new Error("קובץ לא נמצא");
        return r.json();
      })
      .then(data => {
        setContent(data.content || "");
        setLineCount(data.lines || 0);
        setExt(data.extension || "");
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [filePath]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a12]">
        <div className="text-center">
          <FileCode className="w-10 h-10 text-purple-500/20 mx-auto mb-2" />
          <p className="text-xs text-gray-600">בחר קובץ מסייר הקבצים</p>
        </div>
      </div>
    );
  }

  const lang = LANG_MAP[ext] || ext || "text";

  return (
    <div className="h-full flex flex-col bg-[#0a0a12]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-purple-500/10 bg-[#0b0b14]">
        <FileCode className="w-3.5 h-3.5 text-purple-400/60" />
        <span className="text-[11px] text-gray-300 flex-1 truncate font-mono">{filePath}</span>
        <span className="text-[9px] text-gray-600">{lineCount} שורות</span>
        <span className="text-[9px] text-purple-500/40 px-1.5 py-0.5 rounded bg-purple-500/8">{lang}</span>
        <button onClick={handleCopy} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
        {onClose && (
          <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-red-400">{error}</div>
        ) : (
          <div className="flex text-[12px] font-mono leading-[1.6]">
            <div className="select-none text-right px-2 py-2 text-gray-600 bg-[#08080d] border-l border-gray-800/30 min-w-[3rem]">
              {content.split("\n").map((_, i) => (
                <div key={i} className={`px-1 ${changedLines?.includes(i + 1) ? "text-amber-400 font-bold" : ""}`}>
                  {i + 1}
                </div>
              ))}
            </div>
            <pre className="flex-1 py-2 px-3 overflow-x-auto">
              {content.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={`${
                    changedLines?.includes(i + 1)
                      ? "bg-amber-500/10 border-r-2 border-amber-400"
                      : ""
                  }`}
                >
                  <code className="text-gray-300">{line || " "}</code>
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
