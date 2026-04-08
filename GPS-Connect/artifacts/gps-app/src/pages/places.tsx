import { useState } from "react";
import {
  useGetSavedPlaces,
  useCreateSavedPlace,
  useDeleteSavedPlace,
  getGetSavedPlacesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MapPin, Plus, Trash2, Home, Briefcase, Coffee, TreePine } from "lucide-react";
import { toast } from "sonner";

const categoryIcons: Record<string, typeof MapPin> = {
  home: Home,
  work: Briefcase,
  food: Coffee,
  outdoors: TreePine,
};

const categories = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "food", label: "Food & Drink" },
  { value: "outdoors", label: "Outdoors" },
  { value: "other", label: "Other" },
];

export default function PlacesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPlace, setNewPlace] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    category: "other",
  });

  const queryClient = useQueryClient();
  const { data: places, isLoading } = useGetSavedPlaces();
  const createPlace = useCreateSavedPlace();
  const deletePlace = useDeleteSavedPlace();

  const handleAddPlace = () => {
    if (!newPlace.name.trim()) {
      toast.error("Please enter a place name");
      return;
    }

    const lat = parseFloat(newPlace.latitude);
    const lng = parseFloat(newPlace.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Please enter valid coordinates");
      return;
    }

    createPlace.mutate(
      {
        data: {
          name: newPlace.name,
          address: newPlace.address || null,
          latitude: lat,
          longitude: lng,
          category: newPlace.category,
        },
      },
      {
        onSuccess: () => {
          toast.success("Place saved!");
          setDialogOpen(false);
          setNewPlace({ name: "", address: "", latitude: "", longitude: "", category: "other" });
          queryClient.invalidateQueries({ queryKey: getGetSavedPlacesQueryKey() });
        },
        onError: () => {
          toast.error("Failed to save place");
        },
      },
    );
  };

  const handleUseCurrentLocation = () => {
    if ("geolocation" in navigator) {
      toast.loading("Getting location...", { id: "get-loc" });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setNewPlace((prev) => ({
            ...prev,
            latitude: pos.coords.latitude.toFixed(6),
            longitude: pos.coords.longitude.toFixed(6),
          }));
          toast.success("Location set!", { id: "get-loc" });
        },
        () => {
          toast.error("Could not get location", { id: "get-loc" });
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    deletePlace.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Place deleted");
          queryClient.invalidateQueries({ queryKey: getGetSavedPlacesQueryKey() });
        },
        onError: () => {
          toast.error("Failed to delete place");
        },
      },
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Saved Places</h1>
          <p className="text-muted-foreground text-sm">Your favorite locations.</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" data-testid="button-add-place" className="rounded-full">
              <Plus className="w-5 h-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Add New Place</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="place-name">Name</Label>
                <Input
                  id="place-name"
                  data-testid="input-place-name"
                  value={newPlace.name}
                  onChange={(e) => setNewPlace((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My favorite cafe..."
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="place-address">Address (optional)</Label>
                <Input
                  id="place-address"
                  data-testid="input-place-address"
                  value={newPlace.address}
                  onChange={(e) => setNewPlace((p) => ({ ...p, address: e.target.value }))}
                  placeholder="123 Main St..."
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={newPlace.category}
                  onValueChange={(v) => setNewPlace((p) => ({ ...p, category: v }))}
                >
                  <SelectTrigger data-testid="select-category" className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="place-lat">Latitude</Label>
                  <Input
                    id="place-lat"
                    data-testid="input-place-lat"
                    value={newPlace.latitude}
                    onChange={(e) => setNewPlace((p) => ({ ...p, latitude: e.target.value }))}
                    placeholder="32.0853"
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="place-lng">Longitude</Label>
                  <Input
                    id="place-lng"
                    data-testid="input-place-lng"
                    value={newPlace.longitude}
                    onChange={(e) => setNewPlace((p) => ({ ...p, longitude: e.target.value }))}
                    placeholder="34.7818"
                    className="bg-background/50"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                data-testid="button-use-current-location"
                onClick={handleUseCurrentLocation}
                className="w-full"
                size="sm"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Use Current Location
              </Button>
              <Button
                data-testid="button-save-place"
                onClick={handleAddPlace}
                disabled={createPlace.isPending}
                className="w-full"
              >
                {createPlace.isPending ? "Saving..." : "Save Place"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-20 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : places?.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-3">
          <MapPin className="w-10 h-10 mx-auto opacity-40" />
          <p className="text-sm">No saved places yet</p>
          <p className="text-xs">Add your favorite locations to see them on the map.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {places?.map((place, i) => {
            const Icon = categoryIcons[place.category ?? ""] ?? MapPin;
            return (
              <Card
                key={place.id}
                data-testid={`card-place-${place.id}`}
                className="bg-card/40 border-border/50 hover:bg-card/60 transition-all"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{place.name}</p>
                      {place.address && (
                        <p className="text-xs text-muted-foreground">{place.address}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`button-delete-place-${place.id}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(place.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
