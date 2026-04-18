import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { createPageUrl } from "@/lib/route-map";
import { UserPlus, Package, Receipt, FolderPlus, ClipboardList, type LucideIcon } from "lucide-react";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  page: string;
  color: string;
}

const actions: QuickAction[] = [
  { label: "ליד חדש", icon: UserPlus, page: "Leads", color: "bg-blue-500 hover:bg-blue-600" },
  { label: "לקוח חדש", icon: UserPlus, page: "Customers", color: "bg-emerald-500 hover:bg-emerald-600" },
  { label: "הזמנה חדשה", icon: ClipboardList, page: "Orders", color: "bg-purple-500 hover:bg-purple-600" },
  { label: "חשבונית חדשה", icon: Receipt, page: "Invoices", color: "bg-orange-500 hover:bg-orange-600" },
  { label: "פרויקט חדש", icon: FolderPlus, page: "Projects", color: "bg-indigo-500 hover:bg-indigo-600" },
  { label: "מוצר חדש", icon: Package, page: "Products", color: "bg-pink-500 hover:bg-pink-600" },
];

export default function QuickActions() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">פעולות מהירות</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {actions.map(({ label, icon: Icon, page, color }) => (
            <Link key={label} href={createPageUrl(page) + "?action=new"}>
              <Button variant="ghost" className={`w-full h-auto py-4 flex flex-col items-center gap-2 text-white ${color}`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
