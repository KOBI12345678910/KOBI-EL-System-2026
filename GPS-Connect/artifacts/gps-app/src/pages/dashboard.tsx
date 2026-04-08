import { useGetLocationStats, useGetRecentSessions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Activity, Navigation, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetLocationStats();
  const { data: recentSessions, isLoading: sessionsLoading } = useGetRecentSessions({ limit: 5 });

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm">Your location activity at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Distance</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : `${stats?.totalDistanceKm?.toFixed(1) || 0} km`}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Places</CardTitle>
            <MapPin className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.totalSavedPlaces || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
            <Navigation className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.totalSessions || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tracked</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.totalLocationsTracked || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">points</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent Sessions</h2>
        {sessionsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-20 animate-pulse bg-muted/20" />
            ))}
          </div>
        ) : recentSessions?.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border border-dashed rounded-xl border-border/50">
            No recent sessions found
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions?.map((session) => (
              <Card key={session.sessionId} className="bg-card/40 border-border/50 hover:bg-card/60 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Navigation className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Session {session.sessionId.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(session.startTime), { addSuffix: true })}
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
    </div>
  );
}
