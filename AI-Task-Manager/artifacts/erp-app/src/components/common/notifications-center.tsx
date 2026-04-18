import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, Archive, Settings, AtSign, UserPlus, AlertCircle, type LucideIcon } from "lucide-react";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  is_read: boolean;
  created_date: string;
}

interface NotificationsCenterProps {
  open: boolean;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "הרגע";
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

const iconMap: Record<string, LucideIcon> = { mention: AtSign, assignment: UserPlus, update: Bell, error: AlertCircle };

export default function NotificationsCenter({ open, onClose }: NotificationsCenterProps) {
  const [notifications] = useState<NotificationItem[]>([
    { id: "1", title: "אוזכרת בתגובה", message: 'דני כהן אזכר אותך בהזמנה #SO-001', type: "mention", priority: "high", is_read: false, created_date: new Date().toISOString() },
    { id: "2", title: "משימה חדשה הוקצתה", message: "הוקצתה לך משימה: בדיקת מלאי", type: "assignment", priority: "normal", is_read: false, created_date: new Date(Date.now() - 3600000).toISOString() },
    { id: "3", title: "עדכון סטטוס", message: 'הזמנה #SO-002 עברה לשלב "בייצור"', type: "update", priority: "normal", is_read: true, created_date: new Date(Date.now() - 7200000).toISOString() },
  ]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const renderNotification = (notification: NotificationItem) => {
    const Icon = iconMap[notification.type] || Bell;
    return (
      <div key={notification.id} className={`p-3 rounded-lg border ${notification.is_read ? "bg-white" : "bg-blue-50 border-blue-200"} cursor-pointer hover:shadow-sm transition-shadow`}>
        <div className="flex gap-3">
          <div className={`p-2 rounded-lg h-fit ${notification.priority === "high" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}><Icon className="w-4 h-4" /></div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="font-medium text-sm">{notification.title}</h4>
              <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(notification.created_date)}</span>
            </div>
            <p className="text-sm text-slate-600 mb-2">{notification.message}</p>
            <div className="flex gap-2">
              {!notification.is_read && <Button variant="ghost" size="sm" className="h-7 text-xs"><Check className="w-3 h-3 ml-1" />סמן כנקרא</Button>}
              <Button variant="ghost" size="sm" className="h-7 text-xs"><Archive className="w-3 h-3 ml-1" />ארכיון</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>התראות</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && <Badge variant="destructive">{unreadCount}</Badge>}
              <Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
            </div>
          </SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="all" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all">הכל ({notifications.length})</TabsTrigger>
            <TabsTrigger value="unread">לא נקראו ({unreadCount})</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4 space-y-2">{notifications.map(renderNotification)}</TabsContent>
          <TabsContent value="unread" className="mt-4 space-y-2">{notifications.filter((n) => !n.is_read).map(renderNotification)}</TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
