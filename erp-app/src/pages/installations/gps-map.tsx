import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  MapPin, RefreshCw, Users, Search, Filter, AlertCircle, Loader2, Navigation,
  Bookmark, Share2, History, BarChart3, Star, Home, Briefcase, UtensilsCrossed,
  TreePine, Copy, Check, Trash2, Plus, X, ChevronDown, Route, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type EmployeeType = "sales_agent" | "measurer" | "installer" | "other";

interface TeamMember {
  user_id: number;
  full_name: string;
  department: string;
  job_title: string;
  employee_type: EmployeeType;
  latitude: string | number;
  longitude: string | number;
  accuracy: string | number | null;
  created_at: string;
  action: string;
}

interface SavedLocation {
  id: number;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string | null;
  notes: string | null;
  icon: string | null;
  color: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

interface LocationShare {
  id: number;
  share_code: string;
  name: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  expires_at: string | null;
  is_active: boolean;
  view_count: number;
  created_at: string;
}

interface TrackingStats {
  savedLocationsCount: number;
  activeSharesCount: number;
  todayPingsCount: number;
  totalDistanceKm: number;
  activeFieldWorkers: number;
  isManager: boolean;
}

interface LocationPing {
  id: number;
  user_id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  created_at: string;
}

const EMPLOYEE_TYPE_COLORS: Record<EmployeeType, string> = {
  sales_agent: "#3b82f6",
  measurer: "#f59e0b",
  installer: "#10b981",
  other: "#8b5cf6",
};

const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
  sales_agent: "סוכני מכירות",
  measurer: "מודדים",
  installer: "מתקינים",
  other: "אחר",
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Home; color: string }> = {
  home: { label: "בית", icon: Home, color: "#3b82f6" },
  work: { label: "עבודה", icon: Briefcase, color: "#f59e0b" },
  food: { label: "אוכל", icon: UtensilsCrossed, color: "#ef4444" },
  nature: { label: "טבע", icon: TreePine, color: "#10b981" },
  other: { label: "אחר", icon: MapPin, color: "#8b5cf6" },
};

async function fetchTeamLocations(): Promise<{ members: TeamMember[] }> {
  const res = await authFetch("/api/field-ops/gps-clock/team");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "שגיאה בטעינת מיקומי הצוות");
  }
  return res.json();
}

async function fetchSalesAgentCustomer(userId: number): Promise<{ recentOrder: Record<string, unknown> | null; customerDetails: Record<string, unknown> | null }> {
  const res = await authFetch(`/api/field-ops/sales-agent-customer/${userId}`);
  if (!res.ok) return { recentOrder: null, customerDetails: null };
  return res.json();
}

async function fetchSavedLocations(category?: string): Promise<SavedLocation[]> {
  const url = category && category !== "all"
    ? `/api/field-ops/gps/saved-locations?category=${category}`
    : "/api/field-ops/gps/saved-locations";
  const res = await authFetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.locations || [];
}

async function fetchMyShares(): Promise<LocationShare[]> {
  const res = await authFetch("/api/field-ops/gps/my-shares");
  if (!res.ok) return [];
  const data = await res.json();
  return data.shares || [];
}

async function fetchTrackingStats(): Promise<TrackingStats> {
  const res = await authFetch("/api/field-ops/gps/tracking-stats");
  if (!res.ok) return { savedLocationsCount: 0, activeSharesCount: 0, todayPingsCount: 0, totalDistanceKm: 0, activeFieldWorkers: 0, isManager: false };
  return res.json();
}

async function fetchLocationPings(userId?: number): Promise<LocationPing[]> {
  const url = userId ? `/api/field-ops/location-pings?userId=${userId}&limit=200` : "/api/field-ops/location-pings?limit=200";
  const res = await authFetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.pings || [];
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "לפני רגע";
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `לפני ${diffH} שעות`;
  return date.toLocaleDateString("he-IL");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function MapTab({ members, filtered, activeWithLocation, isLoading, error, refetch, isRefetching, search, setSearch, employeeTypeFilter, setEmployeeTypeFilter }: {
  members: TeamMember[];
  filtered: TeamMember[];
  activeWithLocation: TeamMember[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
  search: string;
  setSearch: (v: string) => void;
  employeeTypeFilter: "all" | EmployeeType;
  setEmployeeTypeFilter: (v: "all" | EmployeeType) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const leafletRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const initMap = useCallback(async () => {
    if (!mapRef.current) return;
    try {
      const L = await import("leaflet");
      leafletRef.current = L;
      if (!document.querySelector('link[data-leaflet-css]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.setAttribute("data-leaflet-css", "1");
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
        await new Promise((r) => setTimeout(r, 150));
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      const map = L.map(mapRef.current, { zoomControl: true }).setView([31.5, 34.8], 8);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    } catch (e) {
      console.error("Map init error:", e);
    }
  }, []);

  useEffect(() => {
    initMap();
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [initMap]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    const points: { lat: number; lng: number }[] = [];
    for (const member of activeWithLocation) {
      const lat = Number(member.latitude);
      const lng = Number(member.longitude);
      if (!lat || !lng) continue;
      const color = EMPLOYEE_TYPE_COLORS[member.employee_type] || "#8b5cf6";
      const icon = L.divIcon({
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const accText = member.accuracy ? `\u00B1${Math.round(Number(member.accuracy))}\u05DE\u05F3` : "\u2014";
      const roleLabel = EMPLOYEE_TYPE_LABELS[member.employee_type] || "\u05E2\u05D5\u05D1\u05D3 \u05E9\u05D8\u05D7";
      let popupContent = `
        <div dir="rtl" style="font-family:system-ui;min-width:180px;padding:4px">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${esc(member.full_name || "\u05E2\u05D5\u05D1\u05D3")}</div>
          <div style="font-size:11px;font-weight:600;color:${color};margin-bottom:4px;padding:2px 6px;background:${color}18;border-radius:4px;display:inline-block">${roleLabel}</div>
          ${member.department ? `<div style="font-size:11px;color:#666;margin-bottom:2px">${esc(member.department)}</div>` : ""}
          <div style="font-size:11px;color:#888;margin-bottom:2px">\u05E2\u05D5\u05D3\u05DB\u05DF: ${formatRelativeTime(member.created_at)}</div>
          <div style="font-size:11px;color:#888">\u05D3\u05D9\u05D5\u05E7: ${accText}</div>`;
      if (member.employee_type === "sales_agent") {
        popupContent += `<div id="agent-customer-${member.user_id}" style="font-size:11px;color:#888;margin-top:4px;border-top:1px solid #eee;padding-top:4px">\u05D8\u05D5\u05E2\u05DF \u05E4\u05E8\u05D8\u05D9 \u05DC\u05E7\u05D5\u05D7...</div>`;
      }
      popupContent += `</div>`;
      const marker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(popupContent);
      if (member.employee_type === "sales_agent") {
        const userId = member.user_id;
        marker.on("popupopen", async () => {
          const el = document.getElementById(`agent-customer-${userId}`);
          if (!el) return;
          try {
            const agentData = await fetchSalesAgentCustomer(userId);
            const order = agentData.recentOrder;
            const cust = agentData.customerDetails;
            if (!order && !cust) { el.textContent = "\u05D0\u05D9\u05DF \u05E2\u05E1\u05E7\u05D0\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA"; return; }
            const customerName = String(order?.customer_name || cust?.name || cust?.customer_name || "\u2014");
            const phone = String(order?.customer_phone || cust?.phone || cust?.mobile || "\u2014");
            const address = String(order?.installation_address || order?.shipping_address || cust?.address || "\u2014");
            const city = String(order?.installation_city || cust?.city || "");
            el.textContent = "";
            const wrapper = document.createElement("div");
            wrapper.style.marginTop = "4px";
            const nameEl = document.createElement("div");
            nameEl.style.cssText = "font-weight:600;font-size:12px;color:#333";
            nameEl.textContent = customerName;
            wrapper.appendChild(nameEl);
            if (address !== "\u2014") {
              const addrEl = document.createElement("div");
              addrEl.style.cssText = "color:#555;font-size:11px";
              addrEl.textContent = address + (city ? ` ,${city}` : "");
              wrapper.appendChild(addrEl);
            }
            if (phone !== "\u2014") {
              const phoneEl = document.createElement("div");
              phoneEl.style.cssText = "color:#555;font-size:11px";
              phoneEl.textContent = `\uD83D\uDCDE ${phone}`;
              wrapper.appendChild(phoneEl);
            }
            el.appendChild(wrapper);
          } catch { el.textContent = "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA \u05E4\u05E8\u05D8\u05D9 \u05DC\u05E7\u05D5\u05D7"; }
        });
      }
      markersRef.current.push(marker);
      points.push({ lat, lng });
    }
    if (points.length > 0) {
      const lats = points.map((p) => p.lat);
      const lngs = points.map((p) => p.lng);
      const bounds = L.latLngBounds([Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]);
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 }); }
      catch { map.setView([lats[0], lngs[0]], 12); }
    }
  }, [mapReady, activeWithLocation]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-72 border-l border-border flex flex-col bg-card shrink-0 overflow-y-auto">
        <div className="p-3 space-y-2 border-b border-border">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={'חיפוש עובד שטח...'} className="pr-8 bg-input border-border text-foreground text-sm h-8" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select value={employeeTypeFilter} onChange={(e) => setEmployeeTypeFilter(e.target.value as "all" | EmployeeType)} className="flex-1 bg-input border border-border rounded-md px-2 py-1 text-xs text-foreground">
              <option value="all">כל סוגי העובדים</option>
              <option value="sales_agent">סוכני מכירות</option>
              <option value="measurer">מודדים</option>
              <option value="installer">מתקינים</option>
              <option value="other">אחר</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(Object.entries(EMPLOYEE_TYPE_COLORS) as [EmployeeType, string][]).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div style={{ background: color }} className="w-2.5 h-2.5 rounded-full" />
                <span className="text-[10px] text-muted-foreground">{EMPLOYEE_TYPE_LABELS[type]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 border-b border-border">
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground">פעילים</span>
              </div>
              <p className="text-xl font-bold text-emerald-400 font-mono">{isLoading ? "\u2014" : members.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-muted-foreground">עם מיקום</span>
              </div>
              <p className="text-xl font-bold text-blue-400 font-mono">{isLoading ? "\u2014" : activeWithLocation.length}</p>
            </CardContent>
          </Card>
        </div>
        <div className="flex-1 p-2 space-y-1.5">
          {isLoading && [0,1,2,3].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-card space-y-1.5">
              <Skeleton className="h-3.5 w-24 bg-muted" />
              <Skeleton className="h-2.5 w-16 bg-muted" />
            </div>
          ))}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center p-6 gap-2 text-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-red-400">{error instanceof Error ? error.message : "שגיאה בטעינת נתונים"}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="border-red-500/30 text-red-400 mt-2">נסה שוב</Button>
            </div>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center p-6 gap-2 text-center">
              <Users className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">אין עובדי שטח פעילים</p>
            </div>
          )}
          {!isLoading && filtered.map((member) => {
            const color = EMPLOYEE_TYPE_COLORS[member.employee_type] || "#8b5cf6";
            const roleLabel = EMPLOYEE_TYPE_LABELS[member.employee_type] || "עובד שטח";
            return (
              <button key={member.user_id} className="w-full text-right p-3 rounded-lg bg-card border border-border hover:border-emerald-500/40 hover:bg-muted transition-colors"
                onClick={() => {
                  if (!mapInstanceRef.current || !member.latitude || !member.longitude) return;
                  mapInstanceRef.current.setView([Number(member.latitude), Number(member.longitude)], 15);
                  const marker = markersRef.current.find((_, idx) => { const lm = activeWithLocation[idx]; return lm && lm.user_id === member.user_id; });
                  if (marker) marker.openPopup();
                }}>
                <div className="flex items-start gap-2">
                  <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: member.latitude ? color : "#6b7280" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{member.full_name || "עובד"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium" style={{ background: `${color}22`, color }}>{roleLabel}</span>
                      {member.department && <span className="text-[10px] text-muted-foreground truncate">{member.department}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(member.created_at)}</p>
                    {!member.latitude && <p className="text-[10px] text-amber-500/70 mt-0.5">ללא מיקום GPS</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-input/80">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-sm text-muted-foreground">טוען מיקומים...</p>
            </div>
          </div>
        )}
        <div ref={mapRef} className="absolute inset-0" />
        {!isLoading && activeWithLocation.length === 0 && !error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] bg-card/90 border border-border rounded-xl px-4 py-3 text-center shadow-xl">
            <MapPin className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">אין עובדי שטח פעילים עם מיקום GPS</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SavedLocationsTab() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: "", category: "other", latitude: "", longitude: "", address: "", notes: "" });

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["gps-saved-locations", categoryFilter],
    queryFn: () => fetchSavedLocations(categoryFilter),
  });

  const saveMutation = useMutation({
    mutationFn: async (loc: typeof newLoc) => {
      const res = await authFetch("/api/field-ops/gps/saved-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...loc, latitude: Number(loc.latitude), longitude: Number(loc.longitude) }),
      });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gps-saved-locations"] });
      queryClient.invalidateQueries({ queryKey: ["gps-tracking-stats"] });
      setShowAddForm(false);
      setNewLoc({ name: "", category: "other", latitude: "", longitude: "", address: "", notes: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/field-ops/gps/saved-locations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("שגיאה במחיקה");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gps-saved-locations"] });
      queryClient.invalidateQueries({ queryKey: ["gps-tracking-stats"] });
    },
  });

  const toggleFavMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: number; is_favorite: boolean }) => {
      const res = await authFetch(`/api/field-ops/gps/saved-locations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite }),
      });
      if (!res.ok) throw new Error("שגיאה בעדכון");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gps-saved-locations"] }),
  });

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setNewLoc((prev) => ({ ...prev, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) })),
      () => {}
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
            <button key={key} onClick={() => setCategoryFilter(key === categoryFilter ? "all" : key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${categoryFilter === key ? "bg-primary/20 text-primary" : "bg-card border border-border text-muted-foreground hover:bg-muted"}`}>
              <cfg.icon className="w-3.5 h-3.5" />
              {cfg.label}
            </button>
          ))}
          {categoryFilter !== "all" && (
            <button onClick={() => setCategoryFilter("all")} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">הכל</button>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="gap-1">
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? "ביטול" : "מיקום חדש"}
        </Button>
      </div>

      {showAddForm && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} placeholder={'שם המיקום'} className="bg-input border-border" />
              <select value={newLoc.category} onChange={(e) => setNewLoc({ ...newLoc, category: e.target.value })} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input value={newLoc.latitude} onChange={(e) => setNewLoc({ ...newLoc, latitude: e.target.value })} placeholder={'קו רוחב'} className="bg-input border-border" />
              <Input value={newLoc.longitude} onChange={(e) => setNewLoc({ ...newLoc, longitude: e.target.value })} placeholder={'קו אורך'} className="bg-input border-border" />
              <Button variant="outline" size="sm" onClick={handleGetCurrentLocation} className="gap-1 h-10">
                <Navigation className="w-3.5 h-3.5" />
                מיקום נוכחי
              </Button>
            </div>
            <Input value={newLoc.address} onChange={(e) => setNewLoc({ ...newLoc, address: e.target.value })} placeholder={'כתובת (אופציונלי)'} className="bg-input border-border" />
            <Input value={newLoc.notes} onChange={(e) => setNewLoc({ ...newLoc, notes: e.target.value })} placeholder={'הערות (אופציונלי)'} className="bg-input border-border" />
            <Button onClick={() => saveMutation.mutate(newLoc)} disabled={!newLoc.name || !newLoc.latitude || !newLoc.longitude || saveMutation.isPending} className="w-full">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור מיקום"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-20 bg-muted rounded-lg" />)}</div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Bookmark className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">אין מיקומים שמורים</p>
          <p className="text-xs text-muted-foreground">לחץ על &quot;מיקום חדש&quot; כדי להוסיף</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map((loc) => {
            const cat = CATEGORY_CONFIG[loc.category] || CATEGORY_CONFIG.other;
            const CatIcon = cat.icon;
            return (
              <Card key={loc.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cat.color}20` }}>
                        <CatIcon className="w-4 h-4" style={{ color: cat.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{loc.name}</p>
                        <p className="text-[10px] text-muted-foreground">{cat.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleFavMutation.mutate({ id: loc.id, is_favorite: !loc.is_favorite })}
                        className="p-1 hover:bg-muted rounded transition-colors">
                        <Star className={`w-4 h-4 ${loc.is_favorite ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                      </button>
                      <button onClick={() => deleteMutation.mutate(loc.id)}
                        className="p-1 hover:bg-red-500/10 rounded transition-colors text-muted-foreground hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {loc.address && <p className="text-xs text-muted-foreground mb-1">{loc.address}</p>}
                  {loc.notes && <p className="text-xs text-muted-foreground/70 mb-1">{loc.notes}</p>}
                  <p className="text-[10px] text-muted-foreground font-mono">{Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDate(loc.created_at)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LocationSharingTab() {
  const queryClient = useQueryClient();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupResult, setLookupResult] = useState<LocationShare | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareForm, setShareForm] = useState({ name: "", latitude: "", longitude: "", address: "", expiresInHours: "24" });

  const { data: shares = [], isLoading } = useQuery({
    queryKey: ["gps-my-shares"],
    queryFn: fetchMyShares,
  });

  const shareMutation = useMutation({
    mutationFn: async (form: typeof shareForm) => {
      const res = await authFetch("/api/field-ops/gps/share-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, latitude: Number(form.latitude), longitude: Number(form.longitude), expiresInHours: Number(form.expiresInHours) }),
      });
      if (!res.ok) throw new Error("שגיאה ביצירת שיתוף");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gps-my-shares"] });
      queryClient.invalidateQueries({ queryKey: ["gps-tracking-stats"] });
      setShowShareForm(false);
      setShareForm({ name: "", latitude: "", longitude: "", address: "", expiresInHours: "24" });
    },
  });

  const handleLookup = async () => {
    if (!lookupCode.trim()) return;
    setLookupError("");
    setLookupResult(null);
    try {
      const res = await authFetch(`/api/field-ops/gps/share/${lookupCode.trim()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLookupError(body.error || "קוד לא נמצא");
        return;
      }
      const data = await res.json();
      setLookupResult(data.share);
    } catch {
      setLookupError("שגיאה בחיפוש");
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setShareForm((prev) => ({ ...prev, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) })),
      () => {}
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-400" />
              חיפוש קוד שיתוף
            </h3>
            <div className="flex gap-2">
              <Input value={lookupCode} onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                placeholder={'הזן קוד שיתוף...'} className="bg-input border-border font-mono tracking-wider" maxLength={8}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()} />
              <Button onClick={handleLookup} size="sm">חפש</Button>
            </div>
            {lookupError && <p className="text-xs text-red-400 mt-2">{lookupError}</p>}
            {lookupResult && (
              <div className="mt-3 p-3 bg-muted rounded-lg border border-border">
                <p className="text-sm font-semibold text-foreground">{lookupResult.name || "מיקום משותף"}</p>
                {lookupResult.address && <p className="text-xs text-muted-foreground mt-1">{lookupResult.address}</p>}
                <p className="text-xs text-muted-foreground font-mono mt-1">{Number(lookupResult.latitude).toFixed(5)}, {Number(lookupResult.longitude).toFixed(5)}</p>
                <a href={`https://www.google.com/maps?q=${lookupResult.latitude},${lookupResult.longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary mt-2 inline-block hover:underline">פתח בגוגל מפות</a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-400" />
                שתף מיקום
              </h3>
              <Button size="sm" variant="outline" onClick={() => setShowShareForm(!showShareForm)}>
                {showShareForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
            {showShareForm && (
              <div className="space-y-2">
                <Input value={shareForm.name} onChange={(e) => setShareForm({ ...shareForm, name: e.target.value })} placeholder={'שם (אופציונלי)'} className="bg-input border-border" />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={shareForm.latitude} onChange={(e) => setShareForm({ ...shareForm, latitude: e.target.value })} placeholder={'קו רוחב'} className="bg-input border-border" />
                  <Input value={shareForm.longitude} onChange={(e) => setShareForm({ ...shareForm, longitude: e.target.value })} placeholder={'קו אורך'} className="bg-input border-border" />
                  <Button variant="outline" size="sm" onClick={handleGetCurrentLocation} className="gap-1 h-10">
                    <Navigation className="w-3 h-3" />
                    נוכחי
                  </Button>
                </div>
                <select value={shareForm.expiresInHours} onChange={(e) => setShareForm({ ...shareForm, expiresInHours: e.target.value })}
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="1">שעה אחת</option>
                  <option value="6">6 שעות</option>
                  <option value="24">24 שעות</option>
                  <option value="168">שבוע</option>
                </select>
                <Button onClick={() => shareMutation.mutate(shareForm)} disabled={!shareForm.latitude || !shareForm.longitude || shareMutation.isPending} className="w-full">
                  {shareMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "צור קוד שיתוף"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">השיתופים שלי</h3>
        {isLoading ? (
          <div className="space-y-2">{[0,1].map(i => <Skeleton key={i} className="h-16 bg-muted rounded-lg" />)}</div>
        ) : shares.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Share2 className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">אין שיתופים פעילים</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shares.map((share) => {
              const isExpired = share.expires_at && new Date(share.expires_at) < new Date();
              return (
                <Card key={share.id} className={`bg-card border-border ${isExpired ? "opacity-60" : ""}`}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 px-3 py-1.5 rounded-lg">
                        <span className="font-mono font-bold text-primary tracking-widest">{share.share_code}</span>
                      </div>
                      <div>
                        <p className="text-sm text-foreground">{share.name || "מיקום משותף"}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {share.view_count} צפיות
                          </span>
                          {isExpired ? (
                            <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px]">פג תוקף</Badge>
                          ) : share.expires_at ? (
                            <span className="text-[10px] text-muted-foreground">עד {formatDate(share.expires_at)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => copyCode(share.share_code)} className="gap-1">
                      {copiedCode === share.share_code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TrackingHistoryTab() {
  const { data: pings = [], isLoading } = useQuery({
    queryKey: ["gps-location-pings-history"],
    queryFn: () => fetchLocationPings(),
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <History className="w-4 h-4 text-blue-400" />
        היסטוריית מעקב (24 שעות אחרונות)
      </h3>
      {isLoading ? (
        <div className="space-y-2">{[0,1,2,3,4].map(i => <Skeleton key={i} className="h-12 bg-muted rounded-lg" />)}</div>
      ) : pings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <History className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">אין היסטוריית מעקב</p>
          <p className="text-xs text-muted-foreground">נתוני מעקב GPS יופיעו כאן</p>
        </div>
      ) : (
        <div className="space-y-1">
          {pings.map((ping, idx) => (
            <div key={ping.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex flex-col items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                {idx < pings.length - 1 && <div className="w-0.5 h-6 bg-border mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">{Number(ping.latitude).toFixed(5)}, {Number(ping.longitude).toFixed(5)}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDate(ping.created_at)}</span>
                </div>
                {ping.accuracy && <span className="text-[10px] text-muted-foreground">דיוק: {Math.round(ping.accuracy)} מ&apos;</span>}
              </div>
              <a href={`https://www.google.com/maps?q=${ping.latitude},${ping.longitude}`}
                target="_blank" rel="noopener noreferrer"
                className="p-1.5 hover:bg-primary/10 rounded-lg transition-colors text-muted-foreground hover:text-primary">
                <Navigation className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["gps-tracking-stats"],
    queryFn: fetchTrackingStats,
    refetchInterval: 60000,
  });

  if (isLoading || !stats) return null;

  const statCards = [
    { label: "מרחק היום", value: `${stats.totalDistanceKm} ק״מ`, icon: Route, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "מיקומים שמורים", value: String(stats.savedLocationsCount), icon: Bookmark, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "שיתופים פעילים", value: String(stats.activeSharesCount), icon: Share2, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "נקודות מעקב היום", value: String(stats.todayPingsCount), icon: MapPin, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  if (stats.isManager) {
    statCards.push({ label: "עובדי שטח פעילים", value: String(stats.activeFieldWorkers), icon: Users, color: "text-rose-400", bg: "bg-rose-500/10" });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 px-4 py-3 border-b border-border bg-card/50">
      {statCards.map((s) => (
        <div key={s.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-card border border-border">
          <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
            <s.icon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground font-mono leading-none">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GpsMapPage() {
  const [activeTab, setActiveTab] = useState("map");
  const [search, setSearch] = useState("");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<"all" | EmployeeType>("all");

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["gps-team-locations-web"],
    queryFn: fetchTeamLocations,
    refetchInterval: 30000,
    retry: 2,
  });

  const members = data?.members || [];

  const filtered = members.filter((m) => {
    const matchSearch = !search || (m.full_name || "").toLowerCase().includes(search.toLowerCase()) || (m.department || "").toLowerCase().includes(search.toLowerCase()) || (m.job_title || "").toLowerCase().includes(search.toLowerCase());
    const matchType = employeeTypeFilter === "all" || m.employee_type === employeeTypeFilter;
    return matchSearch && matchType;
  });

  const activeWithLocation = filtered.filter((m) => m.latitude && m.longitude);

  return (
    <div dir="rtl" className="flex flex-col h-screen bg-input text-foreground overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-none">GPS Connect</h1>
            <p className="text-xs text-muted-foreground mt-0.5">מעקב ושיתוף מיקומים בזמן אמת</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs gap-1">
            <Navigation className="w-3 h-3" />
            {activeWithLocation.length} פעילים
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="border-border text-gray-300 hover:bg-muted h-8 gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            רענן
          </Button>
        </div>
      </div>

      <DashboardStats />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border bg-card/50 px-4">
          <TabsList className="bg-transparent h-10 gap-1">
            <TabsTrigger value="map" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5" />
              מפה חיה
            </TabsTrigger>
            <TabsTrigger value="saved" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <Bookmark className="w-3.5 h-3.5" />
              מיקומים שמורים
            </TabsTrigger>
            <TabsTrigger value="sharing" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <Share2 className="w-3.5 h-3.5" />
              שיתוף מיקום
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <History className="w-3.5 h-3.5" />
              היסטוריית מעקב
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="map" className="flex-1 mt-0 overflow-hidden">
          <MapTab members={members} filtered={filtered} activeWithLocation={activeWithLocation}
            isLoading={isLoading} error={error} refetch={refetch} isRefetching={isRefetching}
            search={search} setSearch={setSearch} employeeTypeFilter={employeeTypeFilter} setEmployeeTypeFilter={setEmployeeTypeFilter} />
        </TabsContent>
        <TabsContent value="saved" className="flex-1 mt-0 overflow-hidden flex flex-col">
          <SavedLocationsTab />
        </TabsContent>
        <TabsContent value="sharing" className="flex-1 mt-0 overflow-hidden flex flex-col">
          <LocationSharingTab />
        </TabsContent>
        <TabsContent value="history" className="flex-1 mt-0 overflow-hidden flex flex-col">
          <TrackingHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
