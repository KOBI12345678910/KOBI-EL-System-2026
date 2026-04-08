import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";

interface QRCodeDisplayProps {
  value: string;
  title?: string;
  size?: number;
  onDownload?: () => void;
}

export default function QRCodeDisplay({ value, title, size = 256, onDownload }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#000", light: "#fff" },
      errorCorrectionLevel: "H"
    }).catch(err => console.error("QR Code generation failed:", err));
  }, [value, size]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      alert("הקישור הועתק!");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png");
    link.download = `qr-code-${Date.now()}.png`;
    link.click();
    onDownload?.();
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border">
      {title && <h4 className="font-bold text-sm text-foreground">{title}</h4>}
      <canvas ref={canvasRef} className="border border-border rounded" />
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
        >
          <Copy size={16} /> העתק קישור
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm font-medium"
        >
          <Download size={16} /> הורד
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center break-all max-w-xs">{value}</p>
    </div>
  );
}
