import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Clock, CheckCircle2, Package, AlertCircle, Phone, Navigation } from "lucide-react";

const API = "/api";

const STATUS_TIMELINE = [
  { key: "dispatched", label: "יצא מהמחסן", icon: Package },
  { key: "en_route", label: "בדרך אליך", icon: Truck },
  { key: "arriving_soon", label: "מגיע בקרוב", icon: Navigation },
  { key: "delivered", label: "נמסר", icon: CheckCircle2 },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  dispatched: { label: "יצא לדרך", color: "bg-blue-500/20 text-blue-300" },
  en_route: { label: "בדרך", color: "bg-yellow-500/20 text-yellow-300" },
  arriving_soon: { label: "מגיע בקרוב", color: "bg-orange-500/20 text-orange-300" },
  delivered: { label: "נמסר", color: "bg-green-500/20 text-green-300" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-300" },
};

interface TrackingData {
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
  delivery_address?: any;
  route_distance_km?: number;
  events?: any[];
}

function getStatusIndex(status: string): number {
  return STATUS_TIMELINE.findIndex(s => s.key === status);
}

export default function CustomerTrackingPortal() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) loadTracking();
    let running = false;
    const interval = setInterval(async () => {
      if (!token || running || document.hidden) return;
      running = true;
      try { await loadTracking(); } finally { running = false; }
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

  async function loadTracking() {
    try {
      const r = await fetch(`${API}/delivery-tracking/token/${token}`);
      if (r.ok) {
        setTracking(await r.json());
        setError(null);
      } else {
        setError("קישור מעקב לא נמצא");
      }
    } catch {
      setError("שגיאה בטעינת נתוני המשלוח");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center">
          <Truck className="w-12 h-12 mx-auto mb-3 text-primary animate-pulse" />
          <p className="text-muted-foreground">טוען נתוני משלוח...</p>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Card className="max-w-md w-full mx-4 bg-card/50 border-border/50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400 opacity-70" />
            <p className="text-lg font-medium text-foreground mb-2">קישור לא בתוקף</p>
            <p className="text-sm text-muted-foreground">{error || "לא נמצא משלוח עבור קישור זה"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusIdx = getStatusIndex(tracking.status || "dispatched");
  const isDelivered = tracking.status === "delivered";

  const getEtaText = () => {
    if (!tracking.estimated_arrival) return null;
    const eta = new Date(tracking.estimated_arrival);
    const now = new Date();
    const diffMs = eta.getTime() - now.getTime();
    if (diffMs < 0) return isDelivered ? null : "הגיע";
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) return `כ-${diffMins} דקות`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `כ-${hours} שעות${mins > 0 ? ` ו-${mins} דקות` : ""}`;
  };

  const etaText = getEtaText();

  return (
    <div className="min-h-screen bg-background p-4" dir="rtl">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center pt-4 pb-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="text-lg font-bold text-foreground">מעקב משלוח</span>
          </div>
          {tracking.delivery_number && (
            <p className="text-sm text-muted-foreground">תעודה: {tracking.delivery_number}</p>
          )}
        </div>

        {!isDelivered && etaText && (
          <Card className="bg-primary/10 border-primary/30">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-primary mb-1">{etaText}</div>
              <div className="text-sm text-muted-foreground">זמן הגעה משוער</div>
              {tracking.estimated_arrival && (
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(tracking.estimated_arrival).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isDelivered && (
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
              <div className="text-lg font-bold text-green-400">המשלוח נמסר!</div>
              <div className="text-sm text-muted-foreground mt-1">המשלוח שלך נמסר בהצלחה</div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-foreground mb-3">סטטוס משלוח</div>
            <div className="space-y-3">
              {STATUS_TIMELINE.map((step, idx) => {
                const Icon = step.icon;
                const isActive = idx === statusIdx;
                const isCompleted = idx < statusIdx;
                const isPending = idx > statusIdx;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted ? "bg-green-500/20" : isActive ? "bg-primary/20" : "bg-gray-500/10"
                    }`}>
                      <Icon className={`w-4 h-4 ${
                        isCompleted ? "text-green-400" : isActive ? "text-primary" : "text-muted-foreground/30"
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${
                        isCompleted ? "text-green-400" : isActive ? "text-foreground" : "text-muted-foreground/50"
                      }`}>{step.label}</div>
                    </div>
                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                    {isActive && <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0"></div>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {(tracking.current_lat || tracking.current_lng) && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="text-sm font-medium text-foreground mb-2">מיקום נוכחי</div>
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-primary opacity-50" />
                <div className="text-sm">{Number(tracking.current_lat).toFixed(4)}, {Number(tracking.current_lng).toFixed(4)}</div>
                {tracking.current_speed && tracking.current_speed > 0 && (
                  <div className="text-xs mt-1">{tracking.current_speed} קמ"ש</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {tracking.driver_name && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{tracking.driver_name}</div>
                  <div className="text-xs text-muted-foreground">נהג המשלוח</div>
                </div>
              </div>
              {tracking.driver_phone && (
                <a href={`tel:${tracking.driver_phone}`} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
                  <Phone className="w-4 h-4" />
                  <span>{tracking.driver_phone}</span>
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {tracking.events && tracking.events.length > 0 && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="text-sm font-medium text-foreground mb-3">עדכוני משלוח</div>
              <div className="space-y-3">
                {tracking.events.slice(0, 5).map((ev, i) => (
                  <div key={ev.id || i} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5"></div>
                      {i < Math.min(tracking.events!.length, 5) - 1 && <div className="w-px flex-1 bg-border/30 mt-1"></div>}
                    </div>
                    <div className="pb-2">
                      <div className="text-foreground">{ev.description || ev.event_type}</div>
                      <div className="text-xs text-muted-foreground">{new Date(ev.timestamp).toLocaleString("he-IL")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-muted-foreground pb-4">
          <Clock className="w-3 h-3 inline ml-1" />
          עודכן לאחרונה: {tracking.last_updated ? new Date(tracking.last_updated).toLocaleTimeString("he-IL") : "—"}
          <span className="mr-2">• מתרענן אוטומטית כל 30 שניות</span>
        </div>
      </div>
    </div>
  );
}
