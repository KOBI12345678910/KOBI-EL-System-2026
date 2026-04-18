import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityList, entityCreate, entityUpdate } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Phone, MessageSquare, Facebook, Plus, Settings, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

interface LeadSource {
  id?: string | number;
  source_name: string;
  source_type: string;
  auto_assign: boolean;
  is_active: boolean;
  lead_count?: number;
  conversion_rate?: number;
  default_owner?: string;
  webhook_url?: string;
  [key: string]: unknown;
}

interface User {
  email: string;
  full_name?: string;
  [key: string]: unknown;
}

const sourceIcons: Record<string, LucideIcon> = {
  website: Globe,
  phone_call: Phone,
  whatsapp: MessageSquare,
  facebook: Facebook,
  instagram: Facebook,
  google_ads: Globe,
};

export default function LeadSourcesManager() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState(false);
  const [currentSource, setCurrentSource] = useState<LeadSource | null>(null);

  const { data: sources = [] } = useQuery({
    queryKey: ["lead-sources"],
    queryFn: () => entityList<LeadSource>("lead-sources"),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => entityList<User>("users"),
  });

  const saveMutation = useMutation({
    mutationFn: (data: LeadSource) => {
      if (currentSource?.id) {
        return entityUpdate<LeadSource>("lead-sources", currentSource.id, data);
      }
      return entityCreate<LeadSource>("lead-sources", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
      toast.success("המקור נשמר בהצלחה");
      setEditDialog(false);
      setCurrentSource(null);
    },
  });

  const handleEdit = (source: LeadSource | null) => {
    setCurrentSource(
      source || {
        source_name: "",
        source_type: "website",
        auto_assign: true,
        is_active: true,
      }
    );
    setEditDialog(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">מקורות לידים</h2>
        <Button onClick={() => handleEdit(null)}>
          <Plus className="w-4 h-4 ml-2" />
          מקור חדש
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sources.map((source) => {
          const Icon = sourceIcons[source.source_type] || Globe;
          return (
            <Card key={source.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{source.source_name}</CardTitle>
                      <div className="text-xs text-slate-500">{source.source_type}</div>
                    </div>
                  </div>
                  <Badge variant={source.is_active ? "default" : "outline"}>
                    {source.is_active ? "פעיל" : "כבוי"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">לידים:</span>
                  <span className="font-semibold">{source.lead_count || 0}</span>
                </div>
                {source.conversion_rate != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">המרה:</span>
                    <span className="font-semibold text-green-600">
                      {source.conversion_rate}%
                    </span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleEdit(source)}
                >
                  <Settings className="w-4 h-4 ml-2" />
                  הגדרות
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {currentSource?.id ? "עריכת מקור" : "מקור חדש"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>שם המקור</Label>
              <Input
                value={currentSource?.source_name || ""}
                onChange={(e) =>
                  setCurrentSource({ ...currentSource!, source_name: e.target.value })
                }
                placeholder="לדוגמה: טופס אתר, פרסום פייסבוק..."
              />
            </div>

            <div>
              <Label>סוג</Label>
              <Select
                value={currentSource?.source_type}
                onValueChange={(value) =>
                  setCurrentSource({ ...currentSource!, source_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">אתר</SelectItem>
                  <SelectItem value="phone_call">טלפון</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="referral">הפניה</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>הקצאה אוטומטית</Label>
              <Switch
                checked={currentSource?.auto_assign}
                onCheckedChange={(checked) =>
                  setCurrentSource({ ...currentSource!, auto_assign: checked })
                }
              />
            </div>

            <div>
              <Label>בעלים ברירת מחדל</Label>
              <Select
                value={currentSource?.default_owner}
                onValueChange={(value) =>
                  setCurrentSource({ ...currentSource!, default_owner: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר משתמש..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.email} value={user.email}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Webhook URL (אופציונלי)</Label>
              <Input
                value={currentSource?.webhook_url || ""}
                onChange={(e) =>
                  setCurrentSource({ ...currentSource!, webhook_url: e.target.value })
                }
                placeholder="https://..."
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => saveMutation.mutate(currentSource!)}
                disabled={saveMutation.isPending}
                className="flex-1"
              >
                שמור
              </Button>
              <Button variant="outline" onClick={() => setEditDialog(false)}>
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
