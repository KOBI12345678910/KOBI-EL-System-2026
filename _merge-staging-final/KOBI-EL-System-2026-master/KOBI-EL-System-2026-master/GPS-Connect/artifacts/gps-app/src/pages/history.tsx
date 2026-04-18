import { useState } from "react";
import {
  useGetRecentSessions,
  useGetLocationHistory,
  getGetLocationHistoryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation, ArrowLeft, Clock, MapPin } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { MapContainer, TileLayer, Polyline, Marker } from "react-leaflet";
import { useLeafletIcons, createCustomIcon } from "@/lib/leaflet-icons";

function SessionDetail({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  useLeafletIcons();

  const { data: locations, isLoading } = useGetLocationHistory(
    { sessionId, limit: 500 },
    {
      query: {
        enabled: !!sessionId,
        queryKey: getGetLocationHistoryQueryKey({ sessionId, limit: 500 }),
      },
    },
  );

  const positions: [number, number][] =
    locations?.map((l) => [l.latitude, l.longitude] as [number, number]) ?? [];

  const center: [number, number] = positions.length > 0 ? positions[0] : [51.505, -0.09];

  const startMarker = createCustomIcon("hsl(120 70% 45%)");
  const endMarker = createCustomIcon("hsl(0 70% 50%)");

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
      <Button
        variant="ghost"
        size="sm"
        data-testid="button-back-history"
        onClick={onBack}
        className="gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Session {sessionId.slice(0, 8)}</h2>
        <p className="text-sm text-muted-foreground">{positions.length} location points</p>
      </div>

      {isLoading ? (
        <div className="h-64 rounded-lg bg-muted/20 animate-pulse" />
      ) : (
        <div className="h-72 rounded-lg overflow-hidden border border-border/50">
          <MapContainer center={center} zoom={14} className="w-full h-full" zoomControl={false}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              className="map-tiles"
            />
            {positions.length > 1 && (
              <Polyline positions={positions} pathOptions={{ color: "hsl(175, 85%, 40%)", weight: 3 }} />
            )}
            {positions.length > 0 && (
              <>
                <Marker position={positions[0]} icon={startMarker} />
                <Marker position={positions[positions.length - 1]} icon={endMarker} />
              </>
            )}
          </MapContainer>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .map-tiles { filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7); }
        .custom-leaflet-icon { background: none; border: none; }
      ` }} />
    </div>
  );
}

export default function HistoryPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const { data: sessions, isLoading } = useGetRecentSessions({ limit: 20 });

  if (selectedSession) {
    return (
      <div className="p-4 sm:p-6 max-w-lg mx-auto pt-8">
        <SessionDetail sessionId={selectedSession} onBack={() => setSelectedSession(null)} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="text-muted-foreground text-sm">Your recent tracking sessions.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-20 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : sessions?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <Clock className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm">No tracking sessions yet</p>
          <p className="text-xs">Start tracking from the map to see your history here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions?.map((session, i) => (
            <Card
              key={session.sessionId}
              data-testid={`card-session-${session.sessionId}`}
              className="bg-card/40 border-border/50 hover:bg-card/60 transition-all cursor-pointer active:scale-[0.98]"
              onClick={() => setSelectedSession(session.sessionId)}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Navigation className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Session {session.sessionId.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(session.startTime), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{session.distanceKm.toFixed(2)} km</p>
                  <p className="text-xs text-muted-foreground">{session.locationCount} points</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
