import { useState } from "react";
import {
  useCreateShareSession,
  useGetSharedLocation,
  getGetSharedLocationQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Share2, Copy, Search, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useLeafletIcons, createCustomIcon } from "@/lib/leaflet-icons";
import { formatDistanceToNow } from "date-fns";

export default function SharePage() {
  useLeafletIcons();

  const [shareName, setShareName] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const createShare = useCreateShareSession();
  const { data: sharedLocation, isLoading: sharedLoading } = useGetSharedLocation(activeCode, {
    query: {
      enabled: !!activeCode,
      queryKey: getGetSharedLocationQueryKey(activeCode),
      refetchInterval: 10000,
    },
  });

  const handleCreateShare = () => {
    if (!shareName.trim()) {
      toast.error("Please enter a name for the share session");
      return;
    }

    if ("geolocation" in navigator) {
      toast.loading("Getting your location...", { id: "share-create" });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          createShare.mutate(
            {
              data: {
                name: shareName,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                durationMinutes: 60,
              },
            },
            {
              onSuccess: (session) => {
                setCreatedCode(session.shareCode);
                setShareName("");
                toast.success("Share session created!", { id: "share-create" });
              },
              onError: () => {
                toast.error("Failed to create share session", { id: "share-create" });
              },
            },
          );
        },
        () => {
          toast.error("Could not get your location", { id: "share-create" });
        },
      );
    }
  };

  const handleLookup = () => {
    if (!lookupCode.trim()) {
      toast.error("Please enter a share code");
      return;
    }
    setActiveCode(lookupCode.trim().toUpperCase());
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const sharedMarker = createCustomIcon("hsl(43 96% 58%)");

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Share Location</h1>
        <p className="text-muted-foreground text-sm">Share your location or find someone else's.</p>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" />
            Create Share Session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="share-name" className="text-sm">Your Name</Label>
            <Input
              id="share-name"
              data-testid="input-share-name"
              placeholder="Enter your name..."
              value={shareName}
              onChange={(e) => setShareName(e.target.value)}
              className="bg-background/50"
            />
          </div>
          <Button
            data-testid="button-create-share"
            onClick={handleCreateShare}
            disabled={createShare.isPending}
            className="w-full"
          >
            {createShare.isPending ? "Creating..." : "Share My Location"}
          </Button>

          {createdCode && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-2 animate-in fade-in duration-300">
              <p className="text-sm text-muted-foreground">Your share code:</p>
              <div className="flex items-center gap-2">
                <code className="text-2xl font-bold text-primary tracking-widest flex-1">
                  {createdCode}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid="button-copy-code"
                  onClick={() => copyCode(createdCode)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Share this code with others so they can see your location.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-accent" />
            Find Shared Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              data-testid="input-lookup-code"
              placeholder="Enter share code..."
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value)}
              className="bg-background/50 uppercase tracking-widest font-mono"
            />
            <Button
              data-testid="button-lookup"
              onClick={handleLookup}
              variant="secondary"
            >
              Find
            </Button>
          </div>

          {sharedLoading && (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
          )}

          {sharedLocation && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent" />
                  <span className="font-medium text-sm">{sharedLocation.name}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(sharedLocation.updatedAt), { addSuffix: true })}
                </div>
              </div>

              {!sharedLocation.active && (
                <div className="text-xs text-destructive font-medium p-2 rounded bg-destructive/10">
                  This share session has expired.
                </div>
              )}

              <div className="h-48 rounded-lg overflow-hidden border border-border/50">
                <MapContainer
                  center={[sharedLocation.latitude, sharedLocation.longitude]}
                  zoom={15}
                  className="w-full h-full"
                  zoomControl={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    className="map-tiles"
                  />
                  <Marker
                    position={[sharedLocation.latitude, sharedLocation.longitude]}
                    icon={sharedMarker}
                  >
                    <Popup>
                      <p className="font-bold text-sm">{sharedLocation.name}</p>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <style dangerouslySetInnerHTML={{ __html: `
        .map-tiles { filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7); }
        .leaflet-popup-content-wrapper { background: hsl(var(--card)); color: hsl(var(--card-foreground)); border-radius: var(--radius); }
        .leaflet-popup-tip { background: hsl(var(--card)); }
        .custom-leaflet-icon { background: none; border: none; }
      ` }} />
    </div>
  );
}
