import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entityFilter } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HeaderZone from "./header-zone";
import LeftPanel from "./left-panel";
import RightPanel from "./right-panel";
import ModuleManager from "./module-manager";
import { useLeadPermissions } from "./use-lead-permissions";
import { useLeadCardAutomation } from "./lead-card-automation";
import AutomationRulesManager from "./automation-rules-manager";
import LeadCardTestBot from "@/components/testing/LeadCardTestBot";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadRecord {
  id: string;
  [key: string]: unknown;
}

interface UserRecord {
  email?: string;
  role?: string;
  [key: string]: unknown;
}

interface LeadCardProProps {
  leadId: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadCardPro({ leadId }: LeadCardProProps) {
  const [activeModules] = useState<string[]>([
    "lead_details",
    "timeline",
    "activities",
    "tasks",
    "documents",
    "communication",
    "analytics",
    "integrations",
    "audit",
    "testing",
  ]);

  const {
    data: lead,
    isLoading,
    refetch,
  } = useQuery<LeadRecord | undefined>({
    queryKey: ["lead", leadId],
    queryFn: () =>
      entityFilter<LeadRecord>("leads", { id: leadId }).then((r) => r[0]),
    enabled: !!leadId,
  });

  const { data: user } = useQuery<UserRecord>({
    queryKey: ["currentUser"],
    queryFn: () => authJson("/api/auth/me"),
  });

  const permissions = useLeadPermissions(user, lead);

  // Enable automation engine
  useLeadCardAutomation(lead as any, user);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">\u05D8\u05D5\u05E2\u05DF \u05DB\u05E8\u05D8\u05D9\u05E1 \u05DC\u05D9\u05D3...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-red-600 text-lg font-medium">\u05DC\u05D9\u05D3 \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0</p>
        </Card>
      </div>
    );
  }

  const hasModule = (moduleId: string) => activeModules.includes(moduleId);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* HEADER ZONE */}
      <HeaderZone lead={lead as any} user={user} permissions={permissions} onRefresh={refetch} />

      {/* MAIN CONTENT */}
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {hasModule("lead_details") && (
            <div className="lg:col-span-5">
              <LeftPanel lead={lead as any} permissions={permissions} onUpdate={refetch} />
            </div>
          )}

          {hasModule("timeline") && (
            <div className="lg:col-span-7">
              <RightPanel lead={lead as any} leadId={leadId} permissions={permissions} />
            </div>
          )}
        </div>

        {/* TABS SECTION */}
        <div className="mt-6">
          <Tabs defaultValue="activities" className="w-full">
            <TabsList className="w-full grid grid-cols-8 mb-6">
              {hasModule("activities") && <TabsTrigger value="activities">\u05E4\u05E2\u05D9\u05DC\u05D5\u05D9\u05D5\u05EA</TabsTrigger>}
              {hasModule("tasks") && <TabsTrigger value="tasks">\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA</TabsTrigger>}
              {hasModule("documents") && <TabsTrigger value="documents">\u05DE\u05E1\u05DE\u05DB\u05D9\u05DD</TabsTrigger>}
              {hasModule("communication") && <TabsTrigger value="communication">\u05EA\u05E7\u05E9\u05D5\u05E8\u05EA</TabsTrigger>}
              {hasModule("analytics") && <TabsTrigger value="analytics">\u05D0\u05E0\u05DC\u05D9\u05D8\u05D9\u05E7\u05D4</TabsTrigger>}
              {hasModule("integrations") && <TabsTrigger value="integrations">\u05D0\u05D9\u05E0\u05D8\u05D2\u05E8\u05E6\u05D9\u05D5\u05EA</TabsTrigger>}
              {hasModule("audit") && <TabsTrigger value="audit">\u05DC\u05D5\u05D2</TabsTrigger>}
              {hasModule("testing") && <TabsTrigger value="testing">\uD83E\uDD16 \u05D1\u05D3\u05D9\u05E7\u05D5\u05EA</TabsTrigger>}
            </TabsList>

            <TabsContent value="activities">
              {hasModule("activities") && (
                <ModuleManager moduleId="activities" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="tasks">
              {hasModule("tasks") && (
                <ModuleManager moduleId="tasks" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="documents">
              {hasModule("documents") && (
                <ModuleManager moduleId="documents" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="communication">
              {hasModule("communication") && (
                <ModuleManager moduleId="communication" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="analytics">
              {hasModule("analytics") && (
                <ModuleManager moduleId="analytics" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="integrations">
              {hasModule("integrations") && (
                <ModuleManager moduleId="integrations" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="audit">
              {hasModule("audit") && (
                <ModuleManager moduleId="audit" leadId={leadId} permissions={permissions} />
              )}
            </TabsContent>
            <TabsContent value="testing">
              {hasModule("testing") && <LeadCardTestBot leadId={leadId} />}
            </TabsContent>
          </Tabs>
        </div>

        {/* Automation Rules Manager */}
        {permissions.isManager && (
          <div className="mt-6">
            <AutomationRulesManager permissions={permissions} />
          </div>
        )}
      </div>
    </div>
  );
}
