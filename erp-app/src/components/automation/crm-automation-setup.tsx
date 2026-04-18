import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityCreate } from "@/lib/entity-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Zap, Clock } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Workflow {
  id?: string;
  name: string;
  description: string;
  category: string;
  trigger: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  is_active: boolean;
}

interface AutomationState {
  invoiceReminder: boolean;
  creditLimitAlert: boolean;
  monthlySummary: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CRMAutomationSetup() {
  const [automations, setAutomations] = useState<AutomationState>({
    invoiceReminder: true,
    creditLimitAlert: true,
    monthlySummary: true,
  });

  const [reminderDays, setReminderDays] = useState(7);
  const [summaryDay, setSummaryDay] = useState(1);

  const queryClient = useQueryClient();

  const createWorkflowMutation = useMutation({
    mutationFn: (workflowData: Workflow) =>
      entityCreate<Workflow>("workflow", workflowData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Automation enabled successfully");
    },
    onError: () => toast.error("Error enabling automation"),
  });

  const handleToggleAutomation = async (
    automationType: keyof AutomationState
  ) => {
    const isEnabled = !automations[automationType];
    setAutomations({ ...automations, [automationType]: isEnabled });

    if (!isEnabled) return;

    if (automationType === "invoiceReminder") {
      createWorkflowMutation.mutate({
        name: `Invoice payment reminder - ${reminderDays} days`,
        description: `Send payment reminder for unpaid invoices after ${reminderDays} days`,
        category: "finance",
        trigger: { type: "scheduled", schedule: "daily" },
        conditions: [
          { field: "days_overdue", operator: "equals", value: reminderDays.toString() },
          { field: "status", operator: "not_equals", value: "paid" },
        ],
        actions: [
          {
            type: "send_email",
            config: { template: "payment_reminder", to_field: "customer_email", subject: "Invoice payment reminder" },
          },
          {
            type: "send_notification",
            config: { message: "Payment reminder sent to customer", to_user_email: "assigned_user_email" },
          },
        ],
        is_active: true,
      });
    } else if (automationType === "creditLimitAlert") {
      createWorkflowMutation.mutate({
        name: "Credit limit alert",
        description: "Notify when a customer reaches their credit limit",
        category: "finance",
        trigger: { type: "record_updated", entity: "Customer", field: "credit_limit" },
        conditions: [
          { field: "total_revenue", operator: "greater_than", value: "credit_limit" },
        ],
        actions: [
          {
            type: "create_record",
            config: {
              entity: "Approval",
              fields: { title: "Customer review - credit limit reached", description: "Customer reached credit limit", type: "customer_review", customer_id: "customer_id" },
            },
          },
          {
            type: "send_email",
            config: { template: "credit_limit_alert", to_user_email: "assigned_user_email", subject: "Alert: Customer reached credit limit" },
          },
        ],
        is_active: true,
      });
    } else if (automationType === "monthlySummary") {
      createWorkflowMutation.mutate({
        name: `Monthly customer report - day ${summaryDay}`,
        description: `Generate monthly report of all customers and sales plans on day ${summaryDay}`,
        category: "finance",
        trigger: { type: "scheduled", schedule: `monthly_day_${summaryDay}` },
        conditions: [],
        actions: [
          {
            type: "generate_document",
            config: { type: "monthly_customer_report", format: "pdf", include_metrics: ["total_revenue", "outstanding_invoices", "credit_usage"] },
          },
          {
            type: "send_email",
            config: { template: "monthly_report", to_role: "admin", subject: "Monthly report - customer summary", attach_document: true },
          },
        ],
        is_active: true,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Invoice Reminder */}
        <Card className={automations.invoiceReminder ? "border-green-200 bg-green-50/50" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <CardTitle className="text-base">Invoice Payment Reminder</CardTitle>
                  <p className="text-xs text-slate-600 mt-1">
                    Send automatic reminders for unpaid invoices
                  </p>
                </div>
              </div>
              <Switch
                checked={automations.invoiceReminder}
                onCheckedChange={() => handleToggleAutomation("invoiceReminder")}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {automations.invoiceReminder && (
              <>
                <div>
                  <Label className="text-xs">Send reminder after (days)</Label>
                  <Input
                    type="number"
                    value={reminderDays}
                    onChange={(e) => setReminderDays(parseInt(e.target.value) || 7)}
                    min="1"
                    max="30"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <Badge className="w-full justify-center bg-green-100 text-green-800">
                  <CheckCircle2 className="w-3 h-3 ml-1" />
                  Active
                </Badge>
              </>
            )}
            <p className="text-xs text-slate-600">
              Email &amp; WhatsApp<br />
              Notify account owner<br />
              Daily at 09:00
            </p>
          </CardContent>
        </Card>

        {/* Credit Limit Alert */}
        <Card className={automations.creditLimitAlert ? "border-green-200 bg-green-50/50" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <CardTitle className="text-base">Credit Limit Alert</CardTitle>
                  <p className="text-xs text-slate-600 mt-1">
                    Flag customers who reached their credit limit
                  </p>
                </div>
              </div>
              <Switch
                checked={automations.creditLimitAlert}
                onCheckedChange={() => handleToggleAutomation("creditLimitAlert")}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {automations.creditLimitAlert && (
              <Badge className="w-full justify-center bg-green-100 text-green-800">
                <CheckCircle2 className="w-3 h-3 ml-1" />
                Active
              </Badge>
            )}
            <p className="text-xs text-slate-600">
              Create review request<br />
              Email notification to owner<br />
              Flag as &quot;review required&quot;
            </p>
          </CardContent>
        </Card>

        {/* Monthly Report */}
        <Card className={automations.monthlySummary ? "border-green-200 bg-green-50/50" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <CardTitle className="text-base">Monthly Customer Report</CardTitle>
                  <p className="text-xs text-slate-600 mt-1">
                    Generate automatic report every month
                  </p>
                </div>
              </div>
              <Switch
                checked={automations.monthlySummary}
                onCheckedChange={() => handleToggleAutomation("monthlySummary")}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {automations.monthlySummary && (
              <>
                <div>
                  <Label className="text-xs">Send on day</Label>
                  <Input
                    type="number"
                    value={summaryDay}
                    onChange={(e) => setSummaryDay(parseInt(e.target.value) || 1)}
                    min="1"
                    max="28"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <Badge className="w-full justify-center bg-green-100 text-green-800">
                  <CheckCircle2 className="w-3 h-3 ml-1" />
                  Active
                </Badge>
              </>
            )}
            <p className="text-xs text-slate-600">
              Detailed PDF report<br />
              Performance metrics<br />
              Sent to all managers
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Tip:</p>
              <p>
                All automations run on their own. You can enable or disable them at any
                time. Monthly reports will be emailed to all managers automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
