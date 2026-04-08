import { useEffect, useRef } from "react";
import { Map as MapIcon, X } from "lucide-react";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  type?: string;
  color?: string;
  info?: string;
}

export interface MapData {
  markers: MapMarker[];
  center: { lat: number; lng: number };
  zoom: number;
  title: string;
}

interface MapPanelProps {
  data: MapData | null;
  onClose?: () => void;
}

const COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f59e0b",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  pink: "#ec4899",
};

const TYPE_COLORS: Record<string, string> = {
  customer: "#3b82f6",
  warehouse: "#f59e0b",
  delivery: "#10b981",
  agent: "#8b5cf6",
  branch: "#ef4444",
};

export default function MapPanel({ data, onClose }: MapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!data || !mapRef.current) return;

    let L: any;
    const loadMap = async () => {
      try {
        L = await import("leaflet");

        if (!document.querySelector('link[href*="leaflet"]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapRef.current!).setView(
          [data.center.lat, data.center.lng],
          data.zoom
        );

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18,
        }).addTo(map);

        for (const marker of data.markers) {
          const color = COLOR_MAP[marker.color || ""] || TYPE_COLORS[marker.type || ""] || "#3b82f6";

          const icon = L.divIcon({
            html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
            className: "",
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          });

          const m = L.marker([marker.lat, marker.lng], { icon }).addTo(map);

          const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
          let popup = `<div style="font-family:system-ui;min-width:120px">`;
          popup += `<strong style="font-size:13px">${esc(marker.label)}</strong>`;
          if (marker.type) popup += `<br><span style="color:#888;font-size:11px">${esc(marker.type)}</span>`;
          if (marker.info) popup += `<br><span style="font-size:11px">${esc(marker.info)}</span>`;
          popup += `</div>`;
          m.bindPopup(popup);
        }

        mapInstanceRef.current = map;

        setTimeout(() => map.invalidateSize(), 200);
      } catch (e) {
        console.error("Map load error:", e);
      }
    };

    loadMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [data]);

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a12]">
        <div className="text-center">
          <MapIcon className="w-10 h-10 text-emerald-500/15 mx-auto mb-2" />
          <p className="text-xs text-gray-600">מפה תופיע כאן</p>
          <p className="text-[10px] text-gray-700 mt-1">בקש מקובי &quot;הראה לקוחות על מפה&quot;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a12]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-purple-500/10 bg-[#0b0b14]">
        <MapIcon className="w-3.5 h-3.5 text-emerald-400/60" />
        <span className="text-[11px] text-gray-300 flex-1">{data.title}</span>
        <span className="text-[9px] text-gray-600">{data.markers.length} נקודות</span>
        {onClose && (
          <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />
      </div>
      <div className="flex flex-wrap gap-2 px-3 py-1.5 border-t border-gray-800/30 bg-[#0b0b14]">
        {Object.entries(
          data.markers.reduce((acc, m) => {
            const t = m.type || "אחר";
            acc[t] = (acc[t] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([type, count]) => (
          <div key={type} className="flex items-center gap-1">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: TYPE_COLORS[type] || "#3b82f6" }}
            />
            <span className="text-[9px] text-gray-500">{type} ({count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
