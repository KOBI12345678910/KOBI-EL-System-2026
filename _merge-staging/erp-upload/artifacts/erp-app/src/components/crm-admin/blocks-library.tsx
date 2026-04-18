import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Edit, Copy, Trash2, Search, Box, BarChart3,
  Users, Calendar, FileText, DollarSign, TrendingUp,
} from "lucide-react";

interface BlockItem {
  id: string;
  name: string;
  type: string;
  description: string;
  icon: string;
  fields: string[];
  display_type: string;
  created_date: string;
}

interface BlocksLibraryProps {
  onChangeDetected?: () => void;
}

export default function BlocksLibrary({ onChangeDetected }: BlocksLibraryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [, setEditingBlock] = useState<BlockItem | null>(null);

  const blocks: BlockItem[] = [
    {
      id: "1",
      name: "מדדי KPI",
      type: "kpi",
      description: "תצוגת מדדי ביצוע עבור הליד",
      icon: "BarChart3",
      fields: ["conversion_rate", "response_time", "engagement_score"],
      display_type: "widget",
      created_date: "2026-01-15",
    },
    {
      id: "2",
      name: "ניתוח AI",
      type: "ai_analysis",
      description: "סיכום AI אוטומטי של הליד",
      icon: "TrendingUp",
      fields: ["ai_summary", "sentiment_score", "risk_score"],
      display_type: "widget",
      created_date: "2026-01-20",
    },
    {
      id: "3",
      name: "מוצרים מעניינים",
      type: "products_interest",
      description: "רשימת מוצרים שהלקוח התעניין",
      icon: "Box",
      fields: ["product_name", "quantity", "price"],
      display_type: "table",
      created_date: "2026-02-01",
    },
  ];

  const blockTypes = [
    { value: "kpi", label: "KPI Widget", icon: BarChart3 },
    { value: "ai_analysis", label: "ניתוח AI", icon: TrendingUp },
    { value: "products_interest", label: "מוצרים", icon: Box },
    { value: "measurement_history", label: "היסטוריית מדידות", icon: Calendar },
    { value: "drawing_files", label: "קבצי שרטוט", icon: FileText },
    { value: "custom_field", label: "שדה מותאם", icon: FileText },
    { value: "financial_notes", label: "הערות כספיות", icon: DollarSign },
    { value: "competitors_log", label: "יומן מתחרים", icon: Users },
    { value: "profitability_calc", label: "חישוב רווחיות", icon: DollarSign },
  ];

  const displayTypes = [
    { value: "table", label: "טבלה" },
    { value: "widget", label: "וידג'ט" },
    { value: "form", label: "טופס" },
    { value: "chart", label: "גרף" },
  ];

  const filteredBlocks = blocks.filter(
    (block) => block.name.includes(searchTerm) || block.description.includes(searchTerm)
  );

  const handleCreateBlock = () => {
    setIsCreateOpen(false);
    if (onChangeDetected) onChangeDetected();
  };

  const handleDuplicateBlock = (block: BlockItem) => {
    if (confirm(`לשכפל את "${block.name}"?`)) {
      if (onChangeDetected) onChangeDetected();
    }
  };

  const handleDeleteBlock = (block: BlockItem) => {
    if (confirm(`למחוק את "${block.name}"? פעולה זו בלתי הפיכה.`)) {
      if (onChangeDetected) onChangeDetected();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="חיפוש בלוקים..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 ml-2" />
              בלוק חדש
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>יצירת בלוק חדש</DialogTitle>
              <DialogDescription>הגדר את המאפיינים של הבלוק החדש</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם הבלוק</Label>
                  <Input placeholder="לדוגמה: מדדי ביצוע" />
                </div>
                <div className="space-y-2">
                  <Label>סוג בלוק</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר סוג" />
                    </SelectTrigger>
                    <SelectContent>
                      {blockTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>תיאור</Label>
                <Textarea placeholder="תאר את תפקיד הבלוק..." rows={3} />
              </div>
              <div className="space-y-2">
                <Label>סוג תצוגה</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר תצוגה" />
                  </SelectTrigger>
                  <SelectContent>
                    {displayTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>שדות (מופרד בפסיקים)</Label>
                <Input placeholder="field1, field2, field3" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                ביטול
              </Button>
              <Button onClick={handleCreateBlock} className="bg-indigo-600">
                יצירה
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBlocks.map((block) => {
          const IconComponent =
            block.icon === "BarChart3"
              ? BarChart3
              : block.icon === "TrendingUp"
                ? TrendingUp
                : Box;
          return (
            <Card key={block.id} className="hover:shadow-lg transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <IconComponent className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{block.name}</CardTitle>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {block.type}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-600">{block.description}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="secondary">{block.display_type}</Badge>
                  <span>•</span>
                  <span>{block.fields.length} שדות</span>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditingBlock(block)}
                  >
                    <Edit className="w-3 h-3 ml-1" />
                    עריכה
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicateBlock(block)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDeleteBlock(block)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredBlocks.length === 0 && (
        <div className="text-center py-12">
          <Box className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">לא נמצאו בלוקים</p>
        </div>
      )}
    </div>
  );
}
