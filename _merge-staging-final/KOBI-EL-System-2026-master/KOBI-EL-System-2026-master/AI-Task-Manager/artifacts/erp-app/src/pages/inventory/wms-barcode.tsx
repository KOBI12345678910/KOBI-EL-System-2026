import { useState, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QrCode, Barcode, Download, Plus, X, Printer, Search, Package, MapPin, Container } from "lucide-react";

type LabelType = "barcode" | "qr";
type TargetType = "item" | "location" | "container";

interface LabelItem {
  id: string;
  text: string;
  targetType: TargetType;
  labelType: LabelType;
  svg?: string;
}

export default function WmsBarcodeQrPage() {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("item");
  const [labelType, setLabelType] = useState<LabelType>("barcode");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [batchText, setBatchText] = useState("");
  const [showBatch, setShowBatch] = useState(false);

  const addLabel = useCallback(async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/wms/barcode/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: [inputText.trim()], type: labelType }),
      });
      if (!res.ok) throw new Error("שגיאה ביצירת ברקוד");
      const data = await res.json();
      if (data.success && data.data?.length) {
        const newLabel: LabelItem = {
          id: `${Date.now()}`,
          text: inputText.trim(),
          targetType,
          labelType,
          svg: data.data[0].svg,
        };
        setLabels(prev => [...prev, newLabel]);
        setInputText("");
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [inputText, targetType, labelType]);

  const addBatch = useCallback(async () => {
    const lines = batchText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/wms/barcode/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: lines, type: labelType }),
      });
      if (!res.ok) throw new Error("שגיאה ביצירת ברקודים");
      const data = await res.json();
      if (data.success) {
        const newLabels: LabelItem[] = data.data.map((d: any, i: number) => ({
          id: `batch-${Date.now()}-${i}`,
          text: d.text,
          targetType,
          labelType,
          svg: d.svg,
        }));
        setLabels(prev => [...prev, ...newLabels]);
        setBatchText("");
        setShowBatch(false);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [batchText, targetType, labelType]);

  const removeLabel = (id: string) => setLabels(prev => prev.filter(l => l.id !== id));

  const downloadSvg = (label: LabelItem) => {
    if (!label.svg) return;
    const blob = new Blob([label.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.text}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    labels.forEach(label => downloadSvg(label));
  };

  const downloadPdfLabelSheet = async () => {
    if (!labels.length) return;
    setLoading(true);
    setError("");
    try {
      const labelTexts = labels.map(l => l.text);
      const currentLabelType = labels[0]?.labelType || labelType;
      const res = await authFetch(`/api/wms/barcode/label-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: labelTexts, type: currentLabelType, columns: 3 }),
      });
      if (!res.ok) throw new Error("שגיאה ביצירת PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "label-sheet.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const printLabels = () => {
    const printContent = labels.map(l => `
      <div style="display:inline-block;margin:10px;padding:10px;border:1px solid #ccc;text-align:center;page-break-inside:avoid;">
        <div style="font-size:10px;color:#666;margin-bottom:5px;">${l.targetType === 'item' ? 'פריט' : l.targetType === 'location' ? 'מיקום' : 'מכולה'}</div>
        ${l.svg || ''}
      </div>
    `).join("");
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(`<html><head><title>תוויות ברקוד</title><style>body{font-family:monospace;direction:rtl} @media print{.no-print{display:none}}</style></head><body>${printContent}</body></html>`);
      win.document.close();
      win.print();
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <QrCode className="h-6 w-6 text-purple-400" />
            יצירת ברקוד ו-QR
          </h1>
          <p className="text-sm text-muted-foreground mt-1">יצירה, הדפסה והורדה של ברקודים ו-QR לפריטים, מיקומים ומכולות</p>
        </div>
        <div className="flex gap-2">
          {labels.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1" onClick={printLabels}>
                <Printer className="h-4 w-4" />הדפסת כל התוויות
              </Button>
              <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1" onClick={downloadAll}>
                <Download className="h-4 w-4" />הורדת SVG
              </Button>
              <Button variant="outline" size="sm" className="border-purple-500/40 text-purple-300 gap-1" onClick={downloadPdfLabelSheet} disabled={loading}>
                <Download className="h-4 w-4" />הורדת PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <X className="h-4 w-4" /><span className="text-sm">{error}</span>
          <button onClick={() => setError("")} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card className="bg-card/80 border-border">
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">סוג יעד</label>
              <div className="flex gap-2">
                {([
                  { v: "item", label: "פריט", icon: Package },
                  { v: "location", label: "מיקום", icon: MapPin },
                  { v: "container", label: "מכולה", icon: Container },
                ] as const).map(({ v, label, icon: Icon }) => (
                  <button
                    key={v}
                    onClick={() => setTargetType(v)}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm border transition-colors ${targetType === v ? "bg-blue-600 border-blue-500 text-foreground" : "border-border text-gray-400 hover:border-blue-500/50"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-muted-foreground mb-1 block">סוג קוד</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setLabelType("barcode")}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm border transition-colors ${labelType === "barcode" ? "bg-purple-600 border-purple-500 text-foreground" : "border-border text-gray-400 hover:border-purple-500/50"}`}
                >
                  <Barcode className="h-3.5 w-3.5" />Code128
                </button>
                <button
                  onClick={() => setLabelType("qr")}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm border transition-colors ${labelType === "qr" ? "bg-purple-600 border-purple-500 text-foreground" : "border-border text-gray-400 hover:border-purple-500/50"}`}
                >
                  <QrCode className="h-3.5 w-3.5" />QR Code
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addLabel()}
                placeholder={targetType === "item" ? "קוד פריט (ITEM-001)" : targetType === "location" ? "קוד מיקום (A-01-01-01)" : "מזהה מכולה"}
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <Button onClick={addLabel} disabled={loading || !inputText.trim()} className="bg-blue-600 hover:bg-blue-700 gap-1">
              <Plus className="h-4 w-4" />הוסף
            </Button>
            <Button variant="outline" onClick={() => setShowBatch(!showBatch)} className="border-border text-gray-300 gap-1">
              <Plus className="h-4 w-4" />קבוצה
            </Button>
          </div>

          {showBatch && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">הכנס מספר קודים (שורה לכל קוד)</label>
              <textarea
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
                rows={5}
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none"
                placeholder={"ITEM-001\nITEM-002\nITEM-003"}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowBatch(false)} className="border-border">ביטול</Button>
                <Button size="sm" onClick={addBatch} disabled={loading || !batchText.trim()} className="bg-blue-600 hover:bg-blue-700">
                  צור תוויות קבוצה ({batchText.split("\n").filter(l => l.trim()).length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {labels.length === 0 ? (
        <div className="text-center py-16">
          <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">אין תוויות עדיין — הוסף קוד פריט, מיקום או מכולה</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{labels.length} תוויות</span>
            <Button variant="ghost" size="sm" onClick={() => setLabels([])} className="text-red-400 hover:text-red-300 gap-1">
              <X className="h-3 w-3" />נקה הכל
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {labels.map(label => (
              <Card key={label.id} className="bg-card/80 border-border hover:border-border transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={`text-[10px] border-0 ${
                      label.targetType === "item" ? "bg-blue-500/20 text-blue-300" :
                      label.targetType === "location" ? "bg-green-500/20 text-green-300" :
                      "bg-orange-500/20 text-orange-300"
                    }`}>
                      {label.targetType === "item" ? "פריט" : label.targetType === "location" ? "מיקום" : "מכולה"}
                    </Badge>
                    <button onClick={() => removeLabel(label.id)} className="text-gray-500 hover:text-red-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="bg-white rounded p-2 mb-2 flex items-center justify-center min-h-[80px]">
                    {label.svg && (
                      <img
                        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(label.svg)}`}
                        alt={label.text}
                        className="max-w-full"
                        style={{ maxHeight: "100px" }}
                      />
                    )}
                  </div>
                  <p className="text-xs font-mono text-center text-gray-300 truncate mb-2">{label.text}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-border h-7" onClick={() => downloadSvg(label)}>
                      <Download className="h-3 w-3 mr-1" />SVG
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs border-border h-7" onClick={() => {
                      const win = window.open("", "_blank");
                      if (win) {
                        win.document.write(`<html><head><title>${label.text}</title></head><body style="text-align:center;font-family:monospace">${label.svg || ""}</body></html>`);
                        win.document.close();
                        win.print();
                      }
                    }}>
                      <Printer className="h-3 w-3 mr-1" />הדפס
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
