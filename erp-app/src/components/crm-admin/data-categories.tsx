import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Edit, Trash2, Tag, List, Database,
  ChevronRight, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CategoryItem {
  id: string;
  value: string;
  label: string;
  count: number;
  active: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: LucideIcon;
  items: CategoryItem[];
}

interface DataCategoriesProps {
  onChangeDetected?: () => void;
}

export default function DataCategories({ onChangeDetected }: DataCategoriesProps) {
  const [activeCategory, setActiveCategory] = useState("lead_sources");

  const categories: Category[] = [
    {
      id: "lead_sources",
      name: "מקורות ליד",
      icon: Tag,
      items: [
        { id: "1", value: "website", label: "אתר", count: 45, active: true },
        { id: "2", value: "referral", label: "הפניה", count: 23, active: true },
        { id: "3", value: "facebook", label: "Facebook", count: 67, active: true },
        { id: "4", value: "google", label: "Google Ads", count: 89, active: true },
      ],
    },
    {
      id: "work_types",
      name: "סוגי עבודה",
      icon: List,
      items: [
        { id: "1", value: "railings", label: "מעקות", count: 120, active: true },
        { id: "2", value: "gates", label: "שערים", count: 85, active: true },
        { id: "3", value: "fences", label: "גדרות", count: 45, active: true },
        { id: "4", value: "stairs", label: "מדרגות", count: 30, active: true },
      ],
    },
    {
      id: "sales_status",
      name: "סטטוסים מכירתיים",
      icon: Database,
      items: [
        { id: "1", value: "new_lead", label: "ליד חדש", count: 34, active: true },
        { id: "2", value: "contacted", label: "יצר קשר", count: 56, active: true },
        { id: "3", value: "quoted", label: "קיבל הצעה", count: 23, active: true },
        { id: "4", value: "won", label: "נסגר", count: 45, active: true },
      ],
    },
  ];

  const handleAddItem = (_categoryId: string) => {
    if (onChangeDetected) onChangeDetected();
  };

  const handleEditItem = (_categoryId: string, _itemId: string) => {
    if (onChangeDetected) onChangeDetected();
  };

  const handleDeleteItem = (_categoryId: string, _itemId: string) => {
    if (confirm("למחוק פריט זה?")) {
      if (onChangeDetected) onChangeDetected();
    }
  };

  const handleToggleActive = (_categoryId: string, _itemId: string) => {
    if (onChangeDetected) onChangeDetected();
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="w-full justify-start">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <TabsTrigger key={cat.id} value={cat.id} className="gap-2">
                <Icon className="w-4 h-4" />
                {cat.name}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <TabsContent key={category.id} value={category.id}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <p className="text-sm text-slate-500 mt-1">
                        {category.items.length} פריטים
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => handleAddItem(category.id)}>
                    <Plus className="w-4 h-4 ml-2" />
                    הוסף פריט
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {category.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex items-center gap-3 flex-1">
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                            <div>
                              <div className="font-medium text-slate-900">{item.label}</div>
                              <div className="text-xs text-slate-500 mt-1">
                                Value:{" "}
                                <code className="bg-slate-200 px-1 rounded">{item.value}</code>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{item.count} שימושים</Badge>
                            <Badge
                              variant={item.active ? "default" : "outline"}
                              className={item.active ? "bg-green-600" : ""}
                            >
                              {item.active ? "פעיל" : "לא פעיל"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mr-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(category.id, item.id)}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditItem(category.id, item.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteItem(category.id, item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
