import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useLeafletIcons, createCustomIcon } from "@/lib/leaflet-icons";
import { useGetSavedPlaces, useSaveLocation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crosshair, Search } from "lucide-react";
import { toast } from "sonner";

// Auto-center map on position changes if tracking is active
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function MapView() {
  useLeafletIcons();
  
  const [position, setPosition] = useState<[number, number]>([51.505, -0.09]);
  const { data: places } = useGetSavedPlaces();
  const saveLocation = useSaveLocation();
  const sessionIdRef = useRef(crypto.randomUUID());

  const handleLocate = () => {
    if ("geolocation" in navigator) {
      toast.loading("Locating...", { id: "locate" });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newPos);
          toast.success("Location found", { id: "locate" });
          
          saveLocation.mutate({
            data: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
              sessionId: sessionIdRef.current,
              timestamp: new Date().toISOString()
            }
          });
        },
        (err) => {
          toast.error("Failed to get location", { id: "locate" });
        },
        { enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    handleLocate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customMarker = createCustomIcon("hsl(175 85% 40%)"); // Primary color
  const placeMarker = createCustomIcon("hsl(43 96% 58%)"); // Accent color

  return (
    <div className="relative w-full" style={{ height: "calc(100dvh - 80px)" }}>
      <div className="absolute top-4 left-4 right-4 z-[400] flex gap-2 max-w-md mx-auto">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            className="w-full bg-card/90 backdrop-blur border-border pl-9 shadow-lg h-12 rounded-full" 
            placeholder="Search destination..." 
          />
        </div>
      </div>

      <MapContainer 
        center={position} 
        zoom={15} 
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles"
        />
        <MapUpdater center={position} />
        
        <Marker position={position} icon={customMarker}>
          <Popup className="rounded-xl overflow-hidden">
            <div className="p-1">
              <p className="font-bold text-sm">Current Location</p>
            </div>
          </Popup>
        </Marker>

        {places?.map((place) => (
          <Marker 
            key={place.id} 
            position={[place.latitude, place.longitude]}
            icon={placeMarker}
          >
            <Popup>
              <div className="p-1">
                <p className="font-bold text-sm">{place.name}</p>
                {place.address && <p className="text-xs text-muted-foreground">{place.address}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <Button
        size="icon"
        variant="secondary"
        className="absolute bottom-6 right-4 z-[400] w-12 h-12 rounded-full shadow-lg bg-card/90 backdrop-blur hover:bg-card border-border border text-primary"
        onClick={handleLocate}
      >
        <Crosshair className="w-6 h-6" />
      </Button>

      <style dangerouslySetInnerHTML={{ __html: `
        .map-tiles { filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7); }
        .leaflet-popup-content-wrapper { background: hsl(var(--card)); color: hsl(var(--card-foreground)); border-radius: var(--radius); }
        .leaflet-popup-tip { background: hsl(var(--card)); }
        .custom-leaflet-icon { background: none; border: none; }
      ` }} />
    </div>
  );
}
