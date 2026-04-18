import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Shield, Eye, Edit } from "lucide-react";

interface PermissionItem {
  id: string;
  name: string;
  view: boolean;
  edit?: boolean;
}

interface Role {
  id: string;
  name: string;
  color: string;
  users: number;
}

interface PermissionsManagerProps {
  onChangeDetected?: () => void;
}

export default function PermissionsManager({ onChangeDetected }: PermissionsManagerProps) {
  const [selectedRole, setSelectedRole] = useState("sales_rep");

  const roles: Role[] = [
    { id: "sales_rep", name: "נציג מכירות", color: "blue", users: 12 },
    { id: "manager", name: "מנהל", color: "purple", users: 3 },
    { id: "admin", name: "אדמין", color: "red", users: 2 },
  ];

  const permissions: Record<string, PermissionItem[]> = {
    blocks: [
      { id: "kpi", name: "מדדי KPI", view: true, edit: false },
      { id: "ai_analysis", name: "ניתוח AI", view: true, edit: false },
      { id: "financial", name: "הערות כספיות", view: false, edit: false },
      { id: "profitability", name: "חישוב רווחיות", view: false, edit: false },
    ],
    fields: [
      { id: "phone", name: "טלפון", view: true, edit: true },
      { id: "email", name: "אימייל", view: true, edit: true },
      { id: "budget", name: "תקציב", view: true, edit: false },
      { id: "internal_notes", name: "הערות פנימיות", view: false, edit: false },
    ],
    tabs: [
      { id: "details", name: "פרטים", view: true },
      { id: "activities", name: "פעילויות", view: true },
      { id: "analytics", name: "אנליטיקה", view: false },
      { id: "audit", name: "Audit", view: false },
    ],
  };

  const handleTogglePermission = (
    _category: string,
    _itemId: string,
    _permissionType: string
  ) => {
    if (onChangeDetected) onChangeDetected();
  };

  const PermissionRow = ({ item, type }: { item: PermissionItem; type: string }) => (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-slate-400" />
        <div>
          <div className="font-medium text-slate-900">{item.name}</div>
          <div className="text-xs text-slate-500 mt-1">ID: {item.id}</div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <Eye className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-600 w-12">צפייה</span>
          <Switch
            checked={item.view}
            onCheckedChange={() => handleTogglePermission(type, item.id, "view")}
          />
        </div>
        {type !== "tabs" && (
          <div className="flex items-center gap-3">
            <Edit className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-600 w-12">עריכה</span>
            <Switch
              checked={item.edit ?? false}
              onCheckedChange={() => handleTogglePermission(type, item.id, "edit")}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        {roles.map((role) => (
          <Button
            key={role.id}
            variant={selectedRole === role.id ? "default" : "outline"}
            onClick={() => setSelectedRole(role.id)}
            className="flex-1"
          >
            <Shield className="w-4 h-4 ml-2" />
            {role.name}
            <Badge variant="secondary" className="mr-2">
              {role.users}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">הרשאות בלוקים</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              קבע אילו בלוקים התפקיד יכול לצפות ולערוך
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {permissions.blocks.map((block) => (
              <PermissionRow key={block.id} item={block} type="blocks" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">הרשאות שדות</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              קבע אילו שדות התפקיד יכול לצפות ולערוך
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {permissions.fields.map((field) => (
              <PermissionRow key={field.id} item={field} type="fields" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">הרשאות טאבים</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              קבע אילו טאבים התפקיד יכול לצפות
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {permissions.tabs.map((tab) => (
              <PermissionRow key={tab.id} item={tab} type="tabs" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
