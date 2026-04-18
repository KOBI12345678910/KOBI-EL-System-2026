import LeadActivitiesTab from "@/components/leads/tabs/LeadActivitiesTab";
import LeadTasksTab from "@/components/leads/tabs/LeadTasksTab";
import LeadDocumentsTab from "@/components/leads/tabs/LeadDocumentsTab";
import LeadCommunicationTab from "@/components/leads/tabs/LeadCommunicationTab";
import LeadIntegrationsTab from "@/components/leads/tabs/LeadIntegrationsTab";
import LeadAuditTab from "@/components/leads/tabs/LeadAuditTab";
import LeadAnalyticsModule from "./modules/lead-analytics-module";
import type { LeadPermissions } from "./use-lead-permissions";
import type { ComponentType } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ModuleManagerProps {
  moduleId: string;
  leadId: string;
  permissions: LeadPermissions;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ModuleManager({ moduleId, leadId, permissions }: ModuleManagerProps) {
  const modules: Record<string, ComponentType<{ leadId: string; permissions: LeadPermissions }>> = {
    activities: LeadActivitiesTab,
    tasks: LeadTasksTab,
    documents: LeadDocumentsTab,
    communication: LeadCommunicationTab,
    analytics: LeadAnalyticsModule as any,
    integrations: LeadIntegrationsTab,
    audit: LeadAuditTab,
  };

  const ModuleComponent = modules[moduleId];

  if (!ModuleComponent) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>\u05DE\u05D5\u05D3\u05D5\u05DC \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0: {moduleId}</p>
      </div>
    );
  }

  return <ModuleComponent leadId={leadId} permissions={permissions} />;
}
