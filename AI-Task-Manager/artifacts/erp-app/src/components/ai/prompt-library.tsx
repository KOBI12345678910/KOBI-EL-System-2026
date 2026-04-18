import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityList, entityCreate, entityUpdate } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Copy, Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: string[];
  version: number;
  usage_count: number;
  avg_rating: number;
}

interface PromptFormData {
  name: string;
  description: string;
  category: string;
  template: string;
  variables: string[];
}

interface PromptLibraryProps {
  onSelect?: (template: PromptTemplate) => void;
}

export default function PromptLibrary({ onSelect }: PromptLibraryProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PromptFormData>({
    name: "",
    description: "",
    category: "general",
    template: "",
    variables: [],
  });
  const queryClient = useQueryClient();

  const { data: templates = [] } = useQuery<PromptTemplate[]>({
    queryKey: ["prompt_templates"],
    queryFn: () => entityList<PromptTemplate>("prompt-templates", "-usage_count"),
  });

  const createMutation = useMutation({
    mutationFn: (data: PromptFormData) => entityCreate<PromptTemplate>("prompt-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt_templates"] });
      setFormOpen(false);
      setForm({ name: "", description: "", category: "general", template: "", variables: [] });
      toast.success("תבנית נוצרה");
    },
  });

  const useTemplate = (template: PromptTemplate) => {
    if (onSelect) onSelect(template);
    entityUpdate<PromptTemplate>("prompt-templates", template.id, {
      ...template,
      usage_count: (template.usage_count || 0) + 1,
    });
    toast.success("תבנית נטענה");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ספריית Prompts</CardTitle>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="w-3 h-3 ml-1" />
              תבנית חדשה
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.map((template) => (
            <Card key={template.id} className="bg-slate-50 hover:bg-slate-100 transition-colors">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{template.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {template.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        v{template.version}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">{template.description}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {template.usage_count || 0} שימושים
                      </div>
                      {template.avg_rating > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500" />
                          {template.avg_rating.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => useTemplate(template)}>
                    <Copy className="w-3 h-3 ml-1" />
                    השתמש
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {templates.length === 0 && (
            <p className="text-center text-slate-500 py-8 text-sm">אין תבניות. צור את הראשונה</p>
          )}
        </CardContent>
      </Card>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>תבנית Prompt חדשה</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>שם</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>תיאור</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>קטגוריה</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">כללי</SelectItem>
                  <SelectItem value="sales">מכירות</SelectItem>
                  <SelectItem value="production">ייצור</SelectItem>
                  <SelectItem value="inventory">מלאי</SelectItem>
                  <SelectItem value="finance">כספים</SelectItem>
                  <SelectItem value="support">תמיכה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Textarea
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
                placeholder="הקלד את ה-prompt... השתמש ב-{variable} למשתנים"
                rows={8}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <Button onClick={() => createMutation.mutate(form)} className="w-full">
              צור
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
