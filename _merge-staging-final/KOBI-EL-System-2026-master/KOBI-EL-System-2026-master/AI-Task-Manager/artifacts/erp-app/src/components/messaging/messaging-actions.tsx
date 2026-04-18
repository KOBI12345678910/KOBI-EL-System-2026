import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Mail, History } from "lucide-react";
import SendMessageDialog from "./send-message-dialog";
import MessageHistory from "./message-history";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MessagingActionsProps {
  entityType: string;
  entityId: number;
  entityName: string;
  phone?: string;
  email?: string;
  showHistory?: boolean;
}

export default function MessagingActions({
  entityType,
  entityId,
  entityName,
  phone,
  email,
  showHistory = true,
}: MessagingActionsProps) {
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-green-500 hover:text-green-400 hover:bg-green-500/10"
        onClick={() => setWhatsappOpen(true)}
      >
        <MessageSquare className="w-4 h-4" />
        שלח וואטסאפ
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10"
        onClick={() => setEmailOpen(true)}
      >
        <Mail className="w-4 h-4" />
        שלח אימייל
      </Button>

      {showHistory && (
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <History className="w-4 h-4" />
              היסטוריית הודעות
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[420px] sm:max-w-[420px]">
            <SheetHeader>
              <SheetTitle>היסטוריית הודעות — {entityName}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <Tabs defaultValue="all">
                <TabsList className="w-full">
                  <TabsTrigger value="all" className="flex-1">הכל</TabsTrigger>
                  <TabsTrigger value="whatsapp" className="flex-1">וואטסאפ</TabsTrigger>
                  <TabsTrigger value="gmail" className="flex-1">אימייל</TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                  <MessageHistory entityType={entityType} entityId={entityId} />
                </TabsContent>
                <TabsContent value="whatsapp">
                  <MessageHistory entityType={entityType} entityId={entityId} channel="whatsapp" />
                </TabsContent>
                <TabsContent value="gmail">
                  <MessageHistory entityType={entityType} entityId={entityId} channel="gmail" />
                </TabsContent>
              </Tabs>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <SendMessageDialog
        open={whatsappOpen}
        onOpenChange={setWhatsappOpen}
        channel="whatsapp"
        defaultTo={phone || ""}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
      />

      <SendMessageDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        channel="gmail"
        defaultTo={email || ""}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
      />
    </div>
  );
}
