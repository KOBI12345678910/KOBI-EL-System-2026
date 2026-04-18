import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Redo, Undo, Link as LinkIcon, Trash2
} from "lucide-react";

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = doc.querySelectorAll("script, iframe, object, embed, form");
  scripts.forEach(el => el.remove());
  const allElements = doc.body.querySelectorAll("*");
  allElements.forEach(el => {
    const attrs = Array.from(el.attributes);
    attrs.forEach(attr => {
      if (attr.name.startsWith("on") || attr.value.trim().toLowerCase().startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}

export function RichTextField({ value, onChange, placeholder }: { value: any; onChange: (val: any) => void; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string>(value || "");

  useEffect(() => {
    if (editorRef.current) {
      const sanitized = sanitizeHtml(value || "");
      if (editorRef.current.innerHTML !== sanitized) {
        editorRef.current.innerHTML = sanitized;
      }
      lastValueRef.current = sanitized;
    }
  }, [value]);

  const execCmd = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastValueRef.current = html;
      onChange(html);
    }
  };

  const handleLink = () => {
    const url = prompt("הכנס קישור:", "https://");
    if (url) execCmd("createLink", url);
  };

  const toolbarBtnCls = "p-1.5 rounded hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground";

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30 flex-wrap">
        <button type="button" onClick={() => execCmd("bold")} className={toolbarBtnCls} title="מודגש">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => execCmd("italic")} className={toolbarBtnCls} title="נטוי">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => execCmd("underline")} className={toolbarBtnCls} title="קו תחתון">
          <Underline className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button type="button" onClick={() => execCmd("insertUnorderedList")} className={toolbarBtnCls} title="רשימה">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => execCmd("insertOrderedList")} className={toolbarBtnCls} title="רשימה ממוספרת">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button type="button" onClick={() => execCmd("justifyRight")} className={toolbarBtnCls} title="ימין">
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => execCmd("justifyCenter")} className={toolbarBtnCls} title="מרכז">
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => execCmd("justifyLeft")} className={toolbarBtnCls} title="שמאל">
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button type="button" onClick={handleLink} className={toolbarBtnCls} title="קישור">
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        <select onChange={e => { if (e.target.value) execCmd("formatBlock", e.target.value); e.target.value = ""; }}
          className="text-xs bg-transparent border-none outline-none text-muted-foreground cursor-pointer px-1">
          <option value="">כותרת...</option>
          <option value="h1">כותרת 1</option>
          <option value="h2">כותרת 2</option>
          <option value="h3">כותרת 3</option>
          <option value="p">פסקה</option>
        </select>
        <div className="w-px h-5 bg-border mx-1" />
        <button type="button" onClick={() => execCmd("undo")} className={toolbarBtnCls} title="בטל">
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => execCmd("redo")} className={toolbarBtnCls} title="בצע שוב">
          <Redo className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        dir="rtl"
        onInput={handleInput}
        data-placeholder={placeholder || "הקלד טקסט מעוצב..."}
        className="min-h-[120px] max-h-[300px] overflow-y-auto px-3 py-2.5 text-sm focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground prose prose-sm max-w-none"
        style={{ direction: "rtl" }}
      />
    </div>
  );
}

export function SignatureField({ value, onChange }: { value: any; onChange: (val: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const initializedRef = useRef(false);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e2e8f0";
  };

  useEffect(() => {
    if (!initializedRef.current) {
      initCanvas();
      initializedRef.current = true;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
  }, [value]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPosRef.current = pos;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2;
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPosRef.current) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPosRef.current = null;
    if (canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative border border-border rounded-xl overflow-hidden bg-card">
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className="w-full cursor-crosshair touch-none"
          style={{ height: "120px" }}
        />
        {!value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted-foreground text-sm">חתום כאן</span>
          </div>
        )}
      </div>
      {value && (
        <button type="button" onClick={clearSignature}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80">
          <Trash2 className="w-3 h-3" />
          נקה חתימה
        </button>
      )}
    </div>
  );
}

function generateBarcodeSVG(val: string): string {
  const chars = val.slice(0, 20);
  let pattern: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    pattern.push(1);
    pattern.push(((code >> 6) & 1) ? 2 : 1);
    pattern.push(((code >> 5) & 1) ? 2 : 1);
    pattern.push(((code >> 4) & 1) ? 1 : 2);
    pattern.push(((code >> 3) & 1) ? 2 : 1);
    pattern.push(((code >> 2) & 1) ? 1 : 2);
    pattern.push(1);
  }
  if (pattern.length === 0) pattern = [1, 2, 1, 2, 1];
  return pattern.join(",");
}

export function BarcodeDisplay({ value }: { value: any }) {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>;
  const strVal = String(value);
  const pattern = generateBarcodeSVG(strVal);
  const bars = pattern.split(",").map(Number);
  const totalWidth = bars.reduce((a, b) => a + b, 0);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${totalWidth} 40`} className="h-10 w-auto max-w-full" preserveAspectRatio="none">
        {(() => {
          let x = 0;
          return bars.map((w, i) => {
            const bar = i % 2 === 0
              ? <rect key={i} x={x} y={0} width={w} height={40} fill="currentColor" />
              : null;
            x += w;
            return bar;
          });
        })()}
      </svg>
      <span className="text-[10px] font-mono text-muted-foreground">{strVal}</span>
    </div>
  );
}

function generateQRMatrix(val: string): boolean[][] {
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinderPattern = (row: number, col: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          if (row + r < size && col + c < size) matrix[row + r][col + c] = true;
        }
      }
    }
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  const bytes = new TextEncoder().encode(val);
  let bitIdx = 0;
  for (let r = 8; r < size; r++) {
    for (let c = 8; c < size - 7; c++) {
      if (!matrix[r][c]) {
        const byteIdx = Math.floor(bitIdx / 8) % bytes.length;
        const bit = (bytes[byteIdx] >> (7 - (bitIdx % 8))) & 1;
        matrix[r][c] = bit === 1;
        bitIdx++;
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  return matrix;
}

export function QRDisplay({ value }: { value: any }) {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>;
  const matrix = generateQRMatrix(String(value));
  const size = matrix.length;
  const cellSize = 3;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${size * cellSize + 8} ${size * cellSize + 8}`} className="h-20 w-20">
        <rect x={0} y={0} width={size * cellSize + 8} height={size * cellSize + 8} fill="white" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? <rect key={`${r}-${c}`} x={c * cellSize + 4} y={r * cellSize + 4} width={cellSize} height={cellSize} fill="black" /> : null
          )
        )}
      </svg>
      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">{String(value)}</span>
    </div>
  );
}

function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
      let cls = "text-green-400";
      if (match.endsWith(":")) {
        cls = "text-purple-400";
      }
      return `<span class="${cls}">${match}</span>`;
    })
    .replace(/\b(true|false)\b/g, '<span class="text-amber-400">$1</span>')
    .replace(/\b(null)\b/g, '<span class="text-red-400">$1</span>')
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="text-blue-400">$1</span>');
}

export function JsonEditor({ value, onChange }: { value: any; onChange: (val: any) => void }) {
  const [raw, setRaw] = useState(() =>
    typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : (value || "")
  );
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const lastExternalRef = useRef(value);

  useEffect(() => {
    if (value !== lastExternalRef.current) {
      lastExternalRef.current = value;
      const newRaw = typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : (value || "");
      setRaw(newRaw);
      setError(null);
    }
  }, [value]);

  const handleChange = (text: string) => {
    setRaw(text);
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
      setError(null);
    } catch {
      setError("JSON לא תקין");
      onChange(text);
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(raw);
      const formatted = JSON.stringify(parsed, null, 2);
      setRaw(formatted);
      onChange(parsed);
      setError(null);
    } catch {
      setError("JSON לא תקין");
    }
  };

  const highlighted = (() => {
    try {
      const obj = typeof value === "object" && value !== null ? value : JSON.parse(raw);
      return syntaxHighlight(JSON.stringify(obj, null, 2));
    } catch {
      return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  })();

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-[10px] text-muted-foreground font-mono">JSON</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowPreview(!showPreview)}
            className="text-[10px] text-primary hover:text-primary/80">
            {showPreview ? "עורך" : "תצוגה מקדימה"}
          </button>
          <button type="button" onClick={formatJson}
            className="text-[10px] text-primary hover:text-primary/80">
            סדר
          </button>
        </div>
      </div>
      {showPreview ? (
        <pre className="px-3 py-2.5 text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <textarea
          value={raw}
          onChange={e => handleChange(e.target.value)}
          rows={6}
          dir="ltr"
          spellCheck={false}
          className="w-full px-3 py-2.5 text-xs font-mono bg-transparent resize-y focus:outline-none"
          placeholder='{ "key": "value" }'
        />
      )}
      {error && <div className="px-3 py-1 text-[10px] text-destructive border-t border-border bg-destructive/5">{error}</div>}
    </div>
  );
}

export function renderCellValueEnhanced(value: any, field: any): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">-</span>;
  const type = field.fieldType;

  if (type === "image") {
    if (typeof value === "object" && value?.dataUrl) {
      return <img src={value.dataUrl} alt="" className="w-8 h-8 rounded object-cover inline-block" />;
    }
    if (typeof value === "string" && (value.startsWith("http") || value.startsWith("data:"))) {
      return <img src={value} alt="" className="w-8 h-8 rounded object-cover inline-block" />;
    }
    return <span className="text-xs text-muted-foreground">📷 תמונה</span>;
  }

  if (type === "file") {
    if (Array.isArray(value)) {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {value.map((f: any, i: number) => {
            const name = typeof f === "object" ? f.name : String(f);
            const url = typeof f === "object" ? (f.url || f.dataUrl) : (typeof f === "string" && (f.startsWith("http") || f.startsWith("data:")) ? f : null);
            return url ? (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs text-primary hover:underline">
                📎 {name}
              </a>
            ) : (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs">📎 {name}</span>
            );
          })}
        </div>
      );
    }
    if (typeof value === "object" && value?.name) {
      const url = value.url || value.dataUrl;
      return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs text-primary hover:underline">📎 {value.name}</a>
      ) : (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs">📎 {value.name}</span>
      );
    }
    if (typeof value === "string" && (value.startsWith("http") || value.startsWith("data:"))) {
      return <a href={value} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">📎 קובץ</a>;
    }
    return <span className="text-xs">📎 {String(value).slice(0, 30)}</span>;
  }

  if (type === "json") {
    try {
      const obj = typeof value === "object" ? value : JSON.parse(value);
      const preview = JSON.stringify(obj).slice(0, 50);
      return <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{preview}{preview.length >= 50 ? "..." : ""}</span>;
    } catch {
      return <span className="font-mono text-xs">{String(value).slice(0, 50)}</span>;
    }
  }

  if (type === "address") {
    if (typeof value === "object" && value) {
      const parts = [value.street, value.city, value.zip, value.country].filter(Boolean);
      return <span className="text-xs">{parts.join(", ") || "-"}</span>;
    }
    return <span className="text-xs">{String(value)}</span>;
  }

  if (type === "signature") {
    if (typeof value === "string" && value.startsWith("data:")) {
      return <img src={value} alt="חתימה" className="h-6 w-auto inline-block" />;
    }
    return <span className="text-xs text-muted-foreground">✍️ חתימה</span>;
  }

  if (type === "barcode") {
    return <BarcodeDisplay value={value} />;
  }

  if (type === "qr") {
    return <QRDisplay value={value} />;
  }

  if (type === "rich_text") {
    const text = typeof value === "string" ? value.replace(/<[^>]*>/g, "") : String(value);
    return <span className="text-sm">{text.length > 60 ? text.slice(0, 60) + "..." : text}</span>;
  }

  if (type === "relation" || type === "relation_list") {
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-muted-foreground">-</span>;
      return (
        <div className="flex gap-1 flex-wrap">
          {value.slice(0, 5).map((v: any, i: number) => (
            <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
              {typeof v === "object" && v?._display ? v._display : typeof v === "object" && v?.name ? v.name : `#${v}`}
            </span>
          ))}
          {value.length > 5 && <span className="text-xs text-muted-foreground">+{value.length - 5}</span>}
        </div>
      );
    }
    if (value && typeof value === "object" && value._display) {
      return <span className="text-xs text-primary">{value._display}</span>;
    }
    return <span className="text-xs text-primary">#{String(value)}</span>;
  }

  return null;
}
