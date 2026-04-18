import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone, MessageCircle, Mail, Bell, Upload, Users, Trash2,
  Clock, User, MapPin, AlertCircle, CheckCircle2, LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

// Modals
import LogCallModal from "@/components/leads/modals/LogCallModal";
import WhatsAppModal from "@/components/leads/modals/WhatsAppModal";
import EmailModal from "@/components/leads/modals/EmailModal";
import ReminderModal from "@/components/leads/modals/ReminderModal";
import UploadModal from "@/components/leads/modals/UploadModal";
import TransferAgentModal from "@/components/leads/modals/TransferAgentModal";
import DeleteApprovalModal from "@/components/leads/modals/DeleteApprovalModal";
import type { LeadPermissions } from "./use-lead-permissions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadRecord {
  id: string;
  customer_type: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  sales_status: string;
  urgency: string;
  phone?: string;
  owner_user_id?: string;
  source?: string;
  target_date?: string;
  email?: string;
  [key: string]: unknown;
}

interface UserRecord {
  email?: string;
  role?: string;
  [key: string]: unknown;
}

interface HeaderZoneProps {
  lead: LeadRecord;
  user: UserRecord | undefined;
  permissions: LeadPermissions;
  onRefresh: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HeaderZone({ lead, user, permissions, onRefresh }: HeaderZoneProps) {
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const getDisplayName = (): string => {
    if (lead.customer_type === "private") {
      return `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "\u05DC\u05E7\u05D5\u05D7 \u05E4\u05E8\u05D8\u05D9";
    }
    return lead.company_name || "\u05D7\u05D1\u05E8\u05D4";
  };

  const statusColors: Record<string, string> = {
    new_lead: "bg-blue-100 text-blue-800 border-blue-200",
    first_contact: "bg-purple-100 text-purple-800 border-purple-200",
    interested: "bg-cyan-100 text-cyan-800 border-cyan-200",
    measurement_scheduled: "bg-indigo-100 text-indigo-800 border-indigo-200",
    measurement_done: "bg-violet-100 text-violet-800 border-violet-200",
    quote_preparation: "bg-amber-100 text-amber-800 border-amber-200",
    quote_sent: "bg-orange-100 text-orange-800 border-orange-200",
    negotiation: "bg-yellow-100 text-yellow-800 border-yellow-200",
    won: "bg-green-100 text-green-800 border-green-200",
    lost: "bg-red-100 text-red-800 border-red-200",
    not_relevant: "bg-slate-100 text-slate-800 border-slate-200",
  };

  const statusLabels: Record<string, string> = {
    new_lead: "\u05DC\u05D9\u05D3 \u05D7\u05D3\u05E9",
    first_contact: "\u05D9\u05E6\u05D9\u05E8\u05EA \u05E7\u05E9\u05E8 \u05E8\u05D0\u05E9\u05D5\u05E0\u05D9\u05EA",
    interested: "\u05DE\u05E2\u05D5\u05E0\u05D9\u05D9\u05DF",
    measurement_scheduled: "\u05DE\u05D3\u05D9\u05D3\u05D4 \u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA",
    measurement_done: "\u05DE\u05D3\u05D9\u05D3\u05D4 \u05D1\u05D5\u05E6\u05E2\u05D4",
    quote_preparation: "\u05D4\u05DB\u05E0\u05EA \u05D4\u05E6\u05E2\u05D4",
    quote_sent: "\u05D4\u05E6\u05E2\u05D4 \u05E0\u05E9\u05DC\u05D7\u05D4",
    negotiation: "\u05DE\u05E9\u05D0 \u05D5\u05DE\u05EA\u05DF",
    won: "\u05D6\u05DB\u05D9\u05D9\u05D4 \u2713",
    lost: "\u05D0\u05D1\u05D3",
    not_relevant: "\u05DC\u05D0 \u05E8\u05DC\u05D5\u05D5\u05E0\u05D8\u05D9",
  };

  const urgencyColors: Record<string, string> = {
    normal: "bg-slate-100 text-slate-700 border-slate-200",
    urgent: "bg-orange-100 text-orange-800 border-orange-200",
    very_urgent: "bg-red-100 text-red-800 border-red-200",
  };

  const urgencyLabels: Record<string, string> = {
    normal: "\u05E8\u05D2\u05D9\u05DC",
    urgent: "\u05D3\u05D7\u05D5\u05E3",
    very_urgent: "\u05D3\u05D7\u05D5\u05E3 \u05DE\u05D0\u05D5\u05D3!",
  };

  const sourceLabels: Record<string, string> = {
    website: "\u05D0\u05EA\u05E8",
    referral: "\u05D4\u05DE\u05DC\u05E6\u05D4",
    phone: "\u05D8\u05DC\u05E4\u05D5\u05DF",
    facebook: "\u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7",
    instagram: "\u05D0\u05D9\u05E0\u05E1\u05D8\u05D2\u05E8\u05DD",
    google: "\u05D2\u05D5\u05D2\u05DC",
    whatsapp: "\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4",
    other: "\u05D0\u05D7\u05E8",
  };

  const getSLAStatus = (): { label: string; color: string; icon: LucideIcon } => {
    if (!lead.target_date) return { label: "\u05DC\u05D0 \u05D4\u05D5\u05D2\u05D3\u05E8", color: "text-slate-500", icon: Clock };
    const target = new Date(lead.target_date);
    const now = new Date();
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `\u05D1\u05D0\u05D9\u05D7\u05D5\u05E8 ${Math.abs(diffDays)} \u05D9\u05DE\u05D9\u05DD`, color: "text-red-600", icon: AlertCircle };
    if (diffDays <= 2) return { label: `\u05E0\u05D5\u05EA\u05E8\u05D5 ${diffDays} \u05D9\u05DE\u05D9\u05DD`, color: "text-orange-600", icon: Clock };
    return { label: `\u05EA\u05E7\u05D9\u05DF (${diffDays} \u05D9\u05DE\u05D9\u05DD)`, color: "text-green-600", icon: CheckCircle2 };
  };

  const slaStatus = getSLAStatus();
  const SLAIcon = slaStatus.icon;

  return (
    <>
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          {/* Top Row */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-900">{getDisplayName()}</h1>
                <Badge className={`${statusColors[lead.sales_status]} border font-medium`}>
                  {statusLabels[lead.sales_status]}
                </Badge>
                <Badge className={`${urgencyColors[lead.urgency]} border font-medium`}>
                  {urgencyLabels[lead.urgency]}
                </Badge>
              </div>

              <div className="flex items-center gap-6 text-sm text-slate-600">
                {lead.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {lead.owner_user_id && (
                  <div className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    <span>\u05D0\u05D7\u05E8\u05D0\u05D9: {lead.owner_user_id}</span>
                  </div>
                )}
                {lead.source && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>\u05DE\u05E7\u05D5\u05E8: {sourceLabels[lead.source] || lead.source}</span>
                  </div>
                )}
                <div className={`flex items-center gap-1 font-medium ${slaStatus.color}`}>
                  <SLAIcon className="w-4 h-4" />
                  <span>SLA: {slaStatus.label}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {permissions.canEditLead && (
                <>
                  <Button onClick={() => setLogCallOpen(true)} variant="outline" className="gap-2">
                    <Phone className="w-4 h-4" />
                    \u05E9\u05D9\u05D7\u05D4
                  </Button>
                  <Button onClick={() => setWhatsappOpen(true)} variant="outline" className="gap-2">
                    <MessageCircle className="w-4 h-4" />
                    \u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4
                  </Button>
                  <Button onClick={() => setEmailOpen(true)} variant="outline" className="gap-2">
                    <Mail className="w-4 h-4" />
                    \u05DE\u05D9\u05D9\u05DC
                  </Button>
                  <Button onClick={() => setReminderOpen(true)} variant="outline" className="gap-2">
                    <Bell className="w-4 h-4" />
                    \u05EA\u05D6\u05DB\u05D5\u05E8\u05EA
                  </Button>
                  <Button onClick={() => setUploadOpen(true)} variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" />
                    \u05DE\u05E1\u05DE\u05DA
                  </Button>
                </>
              )}
              {permissions.canChangeOwnership && (
                <Button onClick={() => setTransferOpen(true)} variant="outline" className="gap-2">
                  <Users className="w-4 h-4" />
                  \u05D4\u05E2\u05D1\u05E8\u05D4
                </Button>
              )}
              {permissions.canDelete && (
                <Button
                  onClick={() => setDeleteOpen(true)}
                  variant="outline"
                  className="gap-2 text-red-600"
                  title={permissions.canDelete === "request" ? "\u05D1\u05E7\u05E9\u05EA \u05D0\u05D9\u05E9\u05D5\u05E8 \u05DC\u05DE\u05D7\u05D9\u05E7\u05D4" : "\u05DE\u05D7\u05D9\u05E7\u05EA \u05DC\u05D9\u05D3"}
                >
                  <Trash2 className="w-4 h-4" />
                  {permissions.canDelete === "request" ? "\u05D1\u05E7\u05E9 \u05DE\u05D7\u05D9\u05E7\u05D4" : "\u05DE\u05D7\u05D9\u05E7\u05D4"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <LogCallModal open={logCallOpen} onClose={() => setLogCallOpen(false)} leadId={lead.id} onSuccess={onRefresh} />
      <WhatsAppModal open={whatsappOpen} onClose={() => setWhatsappOpen(false)} lead={lead} />
      <EmailModal open={emailOpen} onClose={() => setEmailOpen(false)} lead={lead} onSuccess={onRefresh} />
      <ReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} leadId={lead.id} onSuccess={onRefresh} />
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} leadId={lead.id} onSuccess={onRefresh} />
      <TransferAgentModal open={transferOpen} onClose={() => setTransferOpen(false)} leadId={lead.id} onSuccess={onRefresh} />
      <DeleteApprovalModal open={deleteOpen} onClose={() => setDeleteOpen(false)} lead={lead} />
    </>
  );
}
