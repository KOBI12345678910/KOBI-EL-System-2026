import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, MapPin, Truck, Clock, Bell, Phone, Navigation, AlertCircle, CheckCircle2, Package, Plus, RefreshCw, Send, Eye } from "lucide-react";

const API = "/api";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  dispatched: { label: "יצא לדרך", color: "bg-blue-500/20 text-blue-300" },
  en_route: { label: "בדרך", color: "bg-yellow-500/20 text-yellow-300" },
  arriving_soon: { label: "מגיע בקרוב", color: "bg-orange-500/20 text-orange-300" },
  delivered: { label: "נמסר", color: "bg-green-500/20 text-green-300" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-300" },
};

const FALLBACK_EVENT_TYPES = [
  { value: "dispatched", label: "יצא לדרך" },
  { value: "en_route", label: "בדרך" },
  { value: "checkpoint", label: "נקודת ביקורת" },
  { value: "arriving_soon", label: "מגיע בקרוב" },
  { value: "delivered", label: "נמסר" },
  { value: "delay", label: "עיכוב" },
];

const FALLBACK_NOTIFICATION_CHANNELS = [
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "אימייל" },
];

const FALLBACK_NOTIFICATION_TYPES = [
  { value: "dispatched", label: "יצא לדרך" },
  { value: "en_route", label: "בדרך" },
  { value: "arriving_soon", label: "מגיע בקרוב (30 דק')" },
  { value: "delivered", label: "נמסר בהצלחה" },
];

interface Tracking {
  id: number;
  delivery_id?: number;
  driver_name?: string;
  driver_phone?: string;
  current_lat?: number;
  current_lng?: number;
  current_speed?: number;
  last_updated?: string;
  estimated_arrival?: string;
  status?: string;
  tracking_token?: string;
  delivery_number?: string;
  customer_name?: string;
  route_distance_km?: number;
}

export default function ShipmentTrackingLive() {
  const { data: EVENT_TYPES = FALLBACK_EVENT_TYPES } = useQuery({
    queryKey: ["logistics-event-types"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/shipment-tracking-live/event-types");
      if (!res.ok) return FALLBACK_EVENT_TYPES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_EVENT_TYPES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: NOTIFICATION_CHANNELS = FALLBACK_NOTIFICATION_CHANNELS } = useQuery({
    queryKey: ["logistics-notification-channels"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/shipment-tracking-live/notification-channels");
      if (!res.ok) return FALLBACK_NOTIFICATION_CHANNELS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_NOTIFICATION_CHANNELS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: NOTIFICATION_TYPES = FALLBACK_NOTIFICATION_TYPES } = useQuery({
    queryKey: ["logistics-notification-types"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/shipment-tracking-live/notification-types");
      if (!res.ok) return FALLBACK_NOTIFICATION_TYPES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_NOTIFICATION_TYPES;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTracking, setSelectedTracking] = useState<Tracking | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ channel: "sms", message_type: "dispatched", recipient: "" });
  const [updateForm, setUpdateForm] = useState({ current_lat: "", current_lng: "", current_speed: "", status: "en_route", estimated_arrival: "" });
  const [addForm, setAddForm] = useState({ delivery_id: "", driver_name: "", driver_phone: "", current_lat: "32.0853", current_lng: "34.7818", estimated_arrival: "", route_distance_km: "" });

  useEffect(() => { loadTrackings(); }, []);

  async function loadTrackings() {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/delivery-tracking`);
      if (r.ok) setTrackings(await r.json());
    } catch {}
    setLoading(false);
  }

  async function loadDetails(t: Tracking) {
    setSelectedTracking(t);
    try {
      const [ev, notif] = await Promise.all([
        authFetch(`${API}/tracking-events/${t.delivery_id}`).then(r => r.json()),
        authFetch(`${API}/customer-notifications/${t.delivery_id}`).then(r => r.json()),
      ]);
      setEvents(Array.isArray(ev) ? ev : []);
      setNotifications(Array.isArray(notif) ? notif : []);
    } catch {}
  }

  async function createTracking() {
    try {
      const r = await authFetch(`${API}/delivery-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (r.ok) { setShowAddDialog(false); setAddForm({ delivery_id: "", driver_name: "", driver_phone: "", current_lat: "32.0853", current_lng: "34.7818", estimated_arrival: "", route_distance_km: "" }); loadTrackings(); }
    } catch {}
  }

  async function updatePosition() {
    if (!selectedTracking) return;
    try {
      const r = await authFetch(`${API}/delivery-tracking/${selectedTracking.id}/position`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateForm),
      });
      if (r.ok) { setShowUpdateDialog(false); loadTrackings(); loadDetails(selectedTracking); }
    } catch {}
  }

  async function sendNotification() {
    if (!selectedTracking) return;
    try {
      const r = await authFetch(`${API}/customer-notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...notifyForm, delivery_id: selectedTracking.delivery_id }),
      });
      if (r.ok) { setShowNotifyDialog(false); loadDetails(selectedTracking); }
    } catch {}
  }

  const filtered = trackings.filter(t =>
    !search || [t.delivery_number, t.driver_name, t.customer_name].some(v => v?.includes(search))
  );

  const activeCount = trackings.filter(t => !['delivered', 'cancelled'].includes(t.status || '')).length;
  const deliveredCount = trackings.filter(t => t.status === 'delivered').length;
  const enRouteCount = trackings.filter(t => t.status === 'en_route').length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מעקב משלוחים חי</h1>
          <p className="text-sm text-muted-foreground mt-1">עקוב אחר משלוחים פעילים בזמן אמת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadTrackings} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />רענן
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 ml-1" />הוסף מעקב
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Truck className="w-8 h-8 text-blue-400" />
            <div>
              <div className="text-2xl font-bold text-foreground">{activeCount}</div>
              <div className="text-xs text-muted-foreground">משלוחים פעילים</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Navigation className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-foreground">{enRouteCount}</div>
              <div className="text-xs text-muted-foreground">בדרך</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div>
              <div className="text-2xl font-bold text-foreground">{deliveredCount}</div>
              <div className="text-xs text-muted-foreground">נמסרו</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-purple-400" />
            <div>
              <div className="text-2xl font-bold text-foreground">{trackings.length}</div>
              <div className="text-xs text-muted-foreground">סה"כ משלוחים</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card/50 border-border/50 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">רשימת משלוחים</CardTitle>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50 text-sm" />
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">אין משלוחים פעילים</p>
              </div>
            ) : filtered.map(t => (
              <div
                key={t.id}
                onClick={() => loadDetails(t)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTracking?.id === t.id ? 'border-primary bg-primary/10' : 'border-border/30 hover:bg-card/50'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-foreground text-sm">{t.delivery_number || `#${t.id}`}</span>
                  <Badge className={STATUS_MAP[t.status || 'dispatched']?.color || "bg-gray-500/20 text-gray-300"}>
                    {STATUS_MAP[t.status || 'dispatched']?.label || t.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{t.customer_name || "לקוח לא ידוע"}</div>
                {t.driver_name && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Truck className="w-3 h-3" />{t.driver_name}</div>}
                {t.estimated_arrival && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    הגעה משוערת: {new Date(t.estimated_arrival).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50 lg:col-span-2">
          {selectedTracking ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground">
                    {selectedTracking.delivery_number || `משלוח #${selectedTracking.id}`}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setUpdateForm({ current_lat: String(selectedTracking.current_lat || ''), current_lng: String(selectedTracking.current_lng || ''), current_speed: String(selectedTracking.current_speed || ''), status: selectedTracking.status || 'en_route', estimated_arrival: selectedTracking.estimated_arrival || '' }); setShowUpdateDialog(true); }}>
                      <MapPin className="w-3.5 h-3.5 ml-1" />עדכן מיקום
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowNotifyDialog(true)}>
                      <Bell className="w-3.5 h-3.5 ml-1" />שלח התראה
                    </Button>
                    {selectedTracking.tracking_token && (
                      <Button size="sm" variant="outline" onClick={() => window.open(`/logistics/track/${selectedTracking.tracking_token}`, '_blank')}>
                        <Eye className="w-3.5 h-3.5 ml-1" />פורטל לקוח
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">לקוח</div>
                    <div className="text-sm text-foreground">{selectedTracking.customer_name || "—"}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">נהג</div>
                    <div className="text-sm text-foreground flex items-center gap-2">
                      {selectedTracking.driver_name || "—"}
                      {selectedTracking.driver_phone && (
                        <a href={`tel:${selectedTracking.driver_phone}`} className="text-blue-400 hover:text-blue-300">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">מיקום נוכחי</div>
                    <div className="text-sm text-foreground">
                      {selectedTracking.current_lat && selectedTracking.current_lng
                        ? `${Number(selectedTracking.current_lat).toFixed(4)}, ${Number(selectedTracking.current_lng).toFixed(4)}`
                        : "לא ידוע"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">מהירות</div>
                    <div className="text-sm text-foreground">{selectedTracking.current_speed ? `${selectedTracking.current_speed} קמ"ש` : "—"}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">הגעה משוערת</div>
                    <div className="text-sm text-foreground">
                      {selectedTracking.estimated_arrival
                        ? new Date(selectedTracking.estimated_arrival).toLocaleString("he-IL")
                        : "—"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">מרחק מסלול</div>
                    <div className="text-sm text-foreground">{selectedTracking.route_distance_km ? `${selectedTracking.route_distance_km} ק"מ` : "—"}</div>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center text-muted-foreground text-sm">
                  <MapPin className="w-6 h-6 mx-auto mb-1 text-primary opacity-50" />
                  מפה חיה — {selectedTracking.current_lat && selectedTracking.current_lng
                    ? `מיקום: ${Number(selectedTracking.current_lat).toFixed(4)}, ${Number(selectedTracking.current_lng).toFixed(4)}`
                    : "ממתין לנתוני GPS"}
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground mb-2">ציר זמן אירועים</div>
                  {events.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">אין אירועים</div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {events.map((ev, i) => (
                        <div key={ev.id || i} className="flex gap-3 text-sm">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-primary mt-1.5"></div>
                            {i < events.length - 1 && <div className="w-px h-full bg-border/50 mt-1"></div>}
                          </div>
                          <div className="pb-2">
                            <div className="text-foreground">{ev.description || ev.event_type}</div>
                            <div className="text-xs text-muted-foreground">{new Date(ev.timestamp).toLocaleString("he-IL")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {notifications.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">התראות שנשלחו</div>
                    <div className="space-y-1">
                      {notifications.slice(0, 3).map((n, i) => (
                        <div key={n.id || i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Send className="w-3 h-3" />
                          <span>{n.channel?.toUpperCase()}</span>
                          <span>—</span>
                          <span>{NOTIFICATION_TYPES.find(t => t.value === n.message_type)?.label || n.message_type}</span>
                          <span className="text-muted-foreground/50">{new Date(n.sent_at).toLocaleTimeString("he-IL")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>בחר משלוח מהרשימה כדי לצפות בפרטים</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוסף מעקב חדש</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">מזהה תעודת משלוח</label>
              <Input value={addForm.delivery_id} onChange={e => setAddForm(f => ({ ...f, delivery_id: e.target.value }))} placeholder="מזהה תעודת משלוח" className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">שם נהג</label>
              <Input value={addForm.driver_name} onChange={e => setAddForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="שם הנהג" className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">טלפון נהג</label>
              <Input value={addForm.driver_phone} onChange={e => setAddForm(f => ({ ...f, driver_phone: e.target.value }))} placeholder="050-0000000" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-muted-foreground">קו רוחב</label>
                <Input value={addForm.current_lat} onChange={e => setAddForm(f => ({ ...f, current_lat: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">קו אורך</label>
                <Input value={addForm.current_lng} onChange={e => setAddForm(f => ({ ...f, current_lng: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">הגעה משוערת</label>
              <Input type="datetime-local" value={addForm.estimated_arrival} onChange={e => setAddForm(f => ({ ...f, estimated_arrival: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">מרחק מסלול (ק"מ)</label>
              <Input type="number" value={addForm.route_distance_km} onChange={e => setAddForm(f => ({ ...f, route_distance_km: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>ביטול</Button>
              <Button onClick={createTracking} className="bg-primary">צור מעקב</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>עדכן מיקום נהג</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-muted-foreground">קו רוחב</label>
                <Input value={updateForm.current_lat} onChange={e => setUpdateForm(f => ({ ...f, current_lat: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">קו אורך</label>
                <Input value={updateForm.current_lng} onChange={e => setUpdateForm(f => ({ ...f, current_lng: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">מהירות (קמ"ש)</label>
              <Input type="number" value={updateForm.current_speed} onChange={e => setUpdateForm(f => ({ ...f, current_speed: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">סטטוס</label>
              <select value={updateForm.status} onChange={e => setUpdateForm(f => ({ ...f, status: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {Object.entries(STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">הגעה משוערת</label>
              <Input type="datetime-local" value={updateForm.estimated_arrival} onChange={e => setUpdateForm(f => ({ ...f, estimated_arrival: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>ביטול</Button>
              <Button onClick={updatePosition} className="bg-primary">עדכן</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>שלח התראה ללקוח</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">ערוץ תקשורת</label>
              <select value={notifyForm.channel} onChange={e => setNotifyForm(f => ({ ...f, channel: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {NOTIFICATION_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">סוג הודעה</label>
              <select value={notifyForm.message_type} onChange={e => setNotifyForm(f => ({ ...f, message_type: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {NOTIFICATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">נמען (טלפון/אימייל)</label>
              <Input value={notifyForm.recipient} onChange={e => setNotifyForm(f => ({ ...f, recipient: e.target.value }))} placeholder="050-0000000 / email@example.com" className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowNotifyDialog(false)}>ביטול</Button>
              <Button onClick={sendNotification} className="bg-primary"><Send className="w-4 h-4 ml-1" />שלח</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
