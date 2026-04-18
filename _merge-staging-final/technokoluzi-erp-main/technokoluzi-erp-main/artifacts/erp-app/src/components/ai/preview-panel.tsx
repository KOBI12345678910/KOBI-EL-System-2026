import { useState } from "react";
import { Globe, RefreshCw, ExternalLink, Maximize2, Minimize2 } from "lucide-react";

interface PreviewPanelProps {
  url: string;
  onUrlChange?: (url: string) => void;
}

export default function PreviewPanel({ url, onUrlChange }: PreviewPanelProps) {
  const [inputUrl, setInputUrl] = useState(url);
  const [key, setKey] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);

  const handleNavigate = () => {
    onUrlChange?.(inputUrl);
    setKey(k => k + 1);
  };

  const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;

  return (
    <div className={`h-full flex flex-col bg-[#0a0a12] ${isMaximized ? "fixed inset-0 z-50" : ""}`}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-purple-500/10 bg-[#0b0b14]">
        <Globe className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0" />
        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleNavigate(); }}
          className="flex-1 px-2 py-0.5 rounded bg-gray-800/40 border border-gray-700/30 text-[10px] text-gray-300 font-mono outline-none focus:border-purple-500/30"
          dir="ltr"
        />
        <button onClick={() => setKey(k => k + 1)} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300" title="רענן">
          <RefreshCw className="w-3 h-3" />
        </button>
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300" title="פתח בחלון חדש">
          <ExternalLink className="w-3 h-3" />
        </a>
        <button onClick={() => setIsMaximized(!isMaximized)} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300">
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>
      <div className="flex-1 bg-white">
        {url ? (
          <iframe
            key={key}
            src={fullUrl}
            className="w-full h-full border-0"
            title="Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-[#0a0a12]">
            <div className="text-center">
              <Globe className="w-10 h-10 text-blue-500/15 mx-auto mb-2" />
              <p className="text-xs text-gray-600">תצוגה מקדימה תופיע כאן</p>
              <p className="text-[10px] text-gray-700 mt-1">כשקובי יוצר דף חדש, הוא יוצג אוטומטית</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
