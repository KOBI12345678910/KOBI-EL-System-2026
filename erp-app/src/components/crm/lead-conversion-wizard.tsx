import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ArrowRight, Users, Handshake, Briefcase } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string | number;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  estimated_price?: number;
  [key: string]: unknown;
}

interface LeadConversionWizardProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

export default function LeadConversionWizard({ lead, open, onClose }: LeadConversionWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [conversionData, setConversionData] = useState({
    customer_name:
      lead?.company_name || `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim(),
    deal_name: `עסקה - ${lead?.company_name || lead?.first_name || ""}`,
    deal_amount: lead?.estimated_price || 0,
    project_name: "",
    notes: "",
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const { convertLeadToCustomer } = await import("./lead-conversion-engine");
      return await convertLeadToCustomer(lead as Lead, {
        amount: conversionData.deal_amount,
        createProject: !!conversionData.project_name,
        projectName: conversionData.project_name,
        notes: conversionData.notes,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`הליד הומר בהצלחה ללקוח: ${(data.customer as Record<string, unknown>).name}`);
      setStep(4);
    },
    onError: (error) => {
      toast.error("שגיאה בהמרת הליד");
      console.error(error);
    },
  });

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else convertMutation.mutate();
  };

  const progress = (step / 4) * 100;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            המרת ליד ללקוח
          </DialogTitle>
        </DialogHeader>

        <Progress value={progress} className="mb-4" />

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <div className="font-semibold">יצירת לקוח</div>
                <div className="text-sm text-slate-600">הגדר את פרטי הלקוח החדש</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>שם הלקוח *</Label>
                <Input
                  value={conversionData.customer_name}
                  onChange={(e) =>
                    setConversionData({ ...conversionData, customer_name: e.target.value })
                  }
                  placeholder="שם חברה או שם מלא"
                />
              </div>
            </div>
            <Button onClick={handleNext} className="w-full">
              המשך
              <ArrowRight className="w-4 h-4 mr-2" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
              <Handshake className="w-8 h-8 text-purple-600" />
              <div>
                <div className="font-semibold">יצירת עסקה</div>
                <div className="text-sm text-slate-600">פרטי העסקה שנסגרה</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>שם העסקה</Label>
                <Input
                  value={conversionData.deal_name}
                  onChange={(e) =>
                    setConversionData({ ...conversionData, deal_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>סכום העסקה</Label>
                <Input
                  type="number"
                  value={conversionData.deal_amount}
                  onChange={(e) =>
                    setConversionData({
                      ...conversionData,
                      deal_amount: parseFloat(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                חזור
              </Button>
              <Button onClick={handleNext} className="flex-1">
                המשך
                <ArrowRight className="w-4 h-4 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <Briefcase className="w-8 h-8 text-green-600" />
              <div>
                <div className="font-semibold">יצירת פרויקט (אופציונלי)</div>
                <div className="text-sm text-slate-600">האם לפתוח פרויקט?</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>שם הפרויקט</Label>
                <Input
                  value={conversionData.project_name}
                  onChange={(e) =>
                    setConversionData({ ...conversionData, project_name: e.target.value })
                  }
                  placeholder="אופציונלי"
                />
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea
                  value={conversionData.notes}
                  onChange={(e) =>
                    setConversionData({ ...conversionData, notes: e.target.value })
                  }
                  placeholder="הערות נוספות..."
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                חזור
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={convertMutation.isPending}
              >
                {convertMutation.isPending ? "ממיר..." : "המר ללקוח"}
                <CheckCircle2 className="w-4 h-4 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">המרה הושלמה בהצלחה!</div>
              <div className="text-sm text-slate-600 mt-2">
                הליד הומר ללקוח, נוצרו עסקה ופרויקט, וכל ההיסטוריה הועתקה
              </div>
            </div>
            <Button onClick={onClose} className="mt-4">
              סגור
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
