import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TicketCheck, AlertTriangle, Clock, CheckCircle, Wrench,
  Truck, PackageSearch, Timer, TrendingUp, TrendingDown,
  User, Calendar, Camera, MessageSquare, Link2, ChevronDown, ChevronUp,
  Phone, MapPin, Star, CircleDollarSign
} from "lucide-react";

const fmt = (v: number) => `\u20AA${v.toLocaleString("he-IL")}`;

type CaseStatus = "new" | "assigned" | "en_route" | "diagnosing" | "repairing" | "waiting_part" | "completed" | "awaiting_approval" | "closed" | "cancelled";
type Urgency = "critical" | "urgent" | "normal";
type SlaStatus = "on_time" | "breached";

const statusCfg: Record<CaseStatus, { label: string; cls: string }> = {
  new:                { label: "\u05D7\u05D3\u05E9",                  cls: "bg-blue-500/20 text-blue-400" },
  assigned:           { label: "\u05E9\u05D5\u05D1\u05E5",                cls: "bg-indigo-500/20 text-indigo-400" },
  en_route:           { label: "\u05D1\u05D3\u05E8\u05DA \u05DC\u05D0\u05EA\u05E8",           cls: "bg-cyan-500/20 text-cyan-400" },
  diagnosing:         { label: "\u05D1\u05D0\u05D1\u05D7\u05D5\u05DF",                cls: "bg-purple-500/20 text-purple-400" },
  repairing:          { label: "\u05D1\u05EA\u05D9\u05E7\u05D5\u05DF",                cls: "bg-amber-500/20 text-amber-400" },
  waiting_part:       { label: "\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D7\u05DC\u05E7",          cls: "bg-orange-500/20 text-orange-400" },
  completed:          { label: "\u05D4\u05D5\u05E9\u05DC\u05DD",                cls: "bg-emerald-500/20 text-emerald-400" },
  awaiting_approval:  { label: "\u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DC\u05E7\u05D5\u05D7", cls: "bg-teal-500/20 text-teal-400" },
  closed:             { label: "\u05E0\u05E1\u05D2\u05E8",                 cls: "bg-zinc-500/20 text-zinc-400" },
  cancelled:          { label: "\u05D1\u05D5\u05D8\u05DC",                 cls: "bg-red-500/20 text-red-400" },
};

const urgencyCfg: Record<Urgency, { label: string; cls: string }> = {
  critical: { label: "\u05E7\u05E8\u05D9\u05D8\u05D9",  cls: "bg-red-500/20 text-red-400" },
  urgent:   { label: "\u05D3\u05D7\u05D5\u05E3",   cls: "bg-amber-500/20 text-amber-400" },
  normal:   { label: "\u05E8\u05D2\u05D9\u05DC",   cls: "bg-zinc-500/20 text-zinc-400" },
};

const slaCfg: Record<SlaStatus, { label: string; cls: string }> = {
  on_time: { label: "\u05D1\u05D6\u05DE\u05DF",  cls: "bg-emerald-500/20 text-emerald-400" },
  breached: { label: "\u05D7\u05E8\u05D9\u05D2\u05D4", cls: "bg-red-500/20 text-red-400" },
};

interface ServiceCase {
  id: string;
  customer: string;
  project: string;
  installationId: string;
  faultType: string;
  description: string;
  urgency: Urgency;
  technician: string;
  slaTarget: string;
  slaStatus: SlaStatus;
  status: CaseStatus;
  openDate: string;
  daysOpen: number;
  installationDate: string;
  installationCrew: string;
  handoverStatus: string;
}

const FALLBACK_CASES: ServiceCase[] = [
  { id: "SRV-301", customer: '\u05D0\u05DC\u05D5\u05DF \u05DE\u05E2\u05E8\u05DB\u05D5\u05EA \u05D1\u05E2"\u05DE', project: "\u05DE\u05D2\u05D3\u05DC \u05DE\u05E9\u05E8\u05D3\u05D9\u05DD \u05E8\u05DE\u05EA \u05D2\u05DF", installationId: "INS-1180", faultType: "\u05E0\u05D6\u05D9\u05DC\u05D4", description: "\u05E0\u05D6\u05D9\u05DC\u05D4 \u05DE\u05EA\u05D7\u05EA \u05DC\u05DE\u05E1\u05D2\u05E8\u05EA \u05D7\u05DC\u05D5\u05DF \u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD \u05D1\u05E7\u05D5\u05DE\u05D4 3", urgency: "critical", technician: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF", slaTarget: "4 \u05E9\u05E2\u05D5\u05EA", slaStatus: "breached", status: "repairing", openDate: "2026-04-05", daysOpen: 3, installationDate: "2025-11-12", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D0\u05DC\u05E3", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-302", customer: '\u05E0\u05D3\u05DC"\u05DF \u05E6\u05E4\u05D5\u05DF', project: "\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8 \u05DE\u05D2\u05D5\u05E8\u05D9 \u05E7\u05E8\u05D9\u05D9\u05EA \u05D9\u05DD", installationId: "INS-1195", faultType: "\u05D0\u05D9\u05D8\u05D5\u05DD", description: "\u05D0\u05D9\u05D8\u05D5\u05DD \u05DC\u05E7\u05D5\u05D9 \u05D1\u05D7\u05DC\u05D5\u05DF \u05E1\u05DC\u05D5\u05DF \u05DE\u05E8\u05DB\u05D6\u05D9", urgency: "urgent", technician: "\u05DE\u05D5\u05D8\u05D9 \u05DC\u05D5\u05D9", slaTarget: "8 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "diagnosing", openDate: "2026-04-07", daysOpen: 1, installationDate: "2026-01-20", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D1\u05D9\u05EA", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-303", customer: "\u05E7\u05D9\u05D1\u05D5\u05E5 \u05D3\u05D2\u05E0\u05D9\u05D4", project: "\u05E9\u05D3\u05E8\u05D5\u05D2 \u05D7\u05D3\u05E8 \u05D0\u05D5\u05DB\u05DC", installationId: "INS-1142", faultType: "\u05E0\u05E2\u05D9\u05DC\u05D4", description: "\u05DE\u05E0\u05E2\u05D5\u05DC \u05E9\u05E2\u05E8 \u05D7\u05E9\u05DE\u05DC\u05D9 \u05DC\u05D0 \u05E0\u05E0\u05E2\u05DC \u05D1\u05E9\u05DC\u05D8", urgency: "critical", technician: "\u05D0\u05D1\u05D9 \u05D3\u05D5\u05D3", slaTarget: "4 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "en_route", openDate: "2026-04-08", daysOpen: 0, installationDate: "2025-08-05", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D0\u05DC\u05E3", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-304", customer: "\u05E2\u05D9\u05E8\u05D9\u05D9\u05EA \u05D7\u05D9\u05E4\u05D4", project: "\u05D2\u05D3\u05E8 \u05D2\u05DF \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9", installationId: "INS-1210", faultType: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA", description: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA \u05D7\u05DC\u05D5\u05DF \u05D1\u05D8\u05D9\u05D7\u05D5\u05EA \u05E1\u05D3\u05D5\u05E7\u05D4 \u05E9\u05D1\u05D5\u05E8\u05D4", urgency: "urgent", technician: "\u05E8\u05E4\u05D9 \u05D0\u05D6\u05D5\u05DC\u05D0\u05D9", slaTarget: "8 \u05E9\u05E2\u05D5\u05EA", slaStatus: "breached", status: "waiting_part", openDate: "2026-04-02", daysOpen: 6, installationDate: "2026-02-15", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D2\u05D9\u05DE\u05DC", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-305", customer: "\u05DE\u05E4\u05E2\u05DC\u05D9 \u05D4\u05D3\u05E8\u05D5\u05DD", project: "\u05E7\u05D5 \u05D9\u05D9\u05E6\u05D5\u05E8 \u05DE\u05E4\u05E2\u05DC", installationId: "INS-1088", faultType: "\u05E8\u05E2\u05E9", description: "\u05E8\u05E2\u05E9 \u05D7\u05D6\u05E7 \u05D1\u05EA\u05E8\u05D9\u05E1 \u05D2\u05DC\u05D9\u05DC\u05D4 \u05D7\u05E9\u05DE\u05DC\u05D9 \u05D1\u05E8\u05D5\u05D7", urgency: "normal", technician: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "completed", openDate: "2026-04-01", daysOpen: 7, installationDate: "2025-03-18", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D3\u05DC\u05EA", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-306", customer: '\u05E8\u05E9\u05EA \u05E1\u05D5\u05E4\u05E8-\u05D1\u05D9\u05EA', project: "\u05E1\u05E0\u05D9\u05E3 \u05D7\u05D3\u05E9 \u05D1\u05D0\u05E8 \u05E9\u05D1\u05E2", installationId: "INS-1225", faultType: "\u05D7\u05DC\u05D5\u05D3\u05D4", description: "\u05D7\u05DC\u05D5\u05D3\u05D4 \u05D1\u05DE\u05E2\u05E7\u05D4 \u05E0\u05D9\u05E8\u05D5\u05E1\u05D8\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4", urgency: "normal", technician: "\u05DE\u05D5\u05D8\u05D9 \u05DC\u05D5\u05D9", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "assigned", openDate: "2026-04-08", daysOpen: 0, installationDate: "2026-03-01", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D1\u05D9\u05EA", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-307", customer: "\u05D1\u05D9\u05EA \u05E1\u05E4\u05E8 \u05D0\u05D5\u05E8\u05D8", project: "\u05D4\u05E6\u05DC\u05DC\u05D4 \u05DE\u05D2\u05E8\u05E9 \u05E1\u05E4\u05D5\u05E8\u05D8", installationId: "INS-1056", faultType: "\u05E6\u05D1\u05E2", description: "\u05E6\u05D1\u05E2 \u05DE\u05EA\u05E7\u05DC\u05E3 \u05D1\u05E4\u05E8\u05D2\u05D5\u05DC\u05D4 \u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD", urgency: "normal", technician: "\u05D0\u05D1\u05D9 \u05D3\u05D5\u05D3", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "closed", openDate: "2026-03-25", daysOpen: 14, installationDate: "2024-09-10", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D0\u05DC\u05E3", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-308", customer: "\u05DE\u05E9\u05E8\u05D3 \u05D4\u05D1\u05D9\u05D8\u05D7\u05D5\u05DF", project: "\u05D1\u05E1\u05D9\u05E1 \u05E6\u05D4\"\u05DC \u05E0\u05D2\u05D1", installationId: "INS-1240", faultType: "\u05D7\u05E9\u05DE\u05DC\u05D9", description: "\u05D1\u05E7\u05E8 \u05D0\u05DC\u05E7\u05D8\u05E8\u05D5\u05E0\u05D9 \u05E9\u05E2\u05E8 ProX \u05DC\u05D0 \u05DE\u05D2\u05D9\u05D1", urgency: "critical", technician: "\u05E8\u05E4\u05D9 \u05D0\u05D6\u05D5\u05DC\u05D0\u05D9", slaTarget: "4 \u05E9\u05E2\u05D5\u05EA", slaStatus: "breached", status: "new", openDate: "2026-04-08", daysOpen: 0, installationDate: "2026-03-20", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D2\u05D9\u05DE\u05DC", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-309", customer: "\u05D7\u05D1\u05E8\u05EA \u05D7\u05E9\u05DE\u05DC \u05D9\u05E9\u05E8\u05D0\u05DC", project: "\u05DE\u05E8\u05DB\u05D6 \u05DC\u05D5\u05D2\u05D9\u05E1\u05D8\u05D9 \u05D0\u05E9\u05D3\u05D5\u05D3", installationId: "INS-1102", faultType: "\u05E0\u05E2\u05D9\u05DC\u05D4", description: "\u05DE\u05E0\u05E2\u05D5\u05DC \u05D3\u05DC\u05EA \u05DB\u05E0\u05D9\u05E1\u05D4 \u05DE\u05EA\u05E7\u05DC\u05E7\u05DC \u05D1\u05E9\u05D9\u05DE\u05D5\u05E9", urgency: "urgent", technician: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF", slaTarget: "8 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "repairing", openDate: "2026-04-07", daysOpen: 1, installationDate: "2025-06-22", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D3\u05DC\u05EA", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-310", customer: "\u05E7\u05D1\u05D5\u05E6\u05EA \u05E7\u05D1\u05DC\u05E0\u05D9\u05DD \u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD", project: "\u05E9\u05D9\u05E4\u05D5\u05E5 \u05D1\u05E0\u05D9\u05D9\u05DF \u05E7\u05D1\u05DC\u05E0\u05D9\u05DD", installationId: "INS-1170", faultType: "\u05D0\u05D9\u05D8\u05D5\u05DD", description: "\u05D0\u05D9\u05D8\u05D5\u05DD \u05D7\u05DC\u05D5\u05DF \u05D7\u05D3\u05E8 \u05E9\u05D9\u05E0\u05D4 \u05E0\u05DB\u05E9\u05DC", urgency: "normal", technician: "\u05DE\u05D5\u05D8\u05D9 \u05DC\u05D5\u05D9", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "awaiting_approval", openDate: "2026-03-30", daysOpen: 9, installationDate: "2025-10-08", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D0\u05DC\u05E3", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-311", customer: "\u05DE\u05DC\u05D5\u05DF \u05D4\u05E8\u05D1\u05E8\u05D4 \u05D0\u05D9\u05DC\u05EA", project: "\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8 \u05D3\u05D9\u05E8\u05D5\u05EA \u05D9\u05D5\u05E7\u05E8\u05D4", installationId: "INS-1198", faultType: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA", description: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA \u05DE\u05D7\u05D5\u05E1\u05DE\u05EA \u05D1\u05D3\u05DC\u05EA \u05DB\u05E0\u05D9\u05E1\u05D4 \u05DE\u05E4\u05DC\u05D3\u05D4", urgency: "normal", technician: "\u05D0\u05D1\u05D9 \u05D3\u05D5\u05D3", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "completed", openDate: "2026-04-03", daysOpen: 5, installationDate: "2026-01-05", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D1\u05D9\u05EA", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-312", customer: "\u05D1\u05D9\u05EA \u05D7\u05D5\u05DC\u05D9\u05DD \u05E8\u05DE\u05D1\"\u05DD", project: "\u05D0\u05D2\u05E3 \u05D7\u05D9\u05E8\u05D5\u05DD \u05D7\u05D3\u05E9", installationId: "INS-1255", faultType: "\u05E0\u05D6\u05D9\u05DC\u05D4", description: "\u05E0\u05D6\u05D9\u05DC\u05D4 \u05D1\u05D0\u05D9\u05D8\u05D5\u05DD \u05D7\u05DC\u05D5\u05DF \u05D2\u05D3\u05D5\u05DC \u05E7\u05D5\u05DE\u05D4 2", urgency: "urgent", technician: "\u05E8\u05E4\u05D9 \u05D0\u05D6\u05D5\u05DC\u05D0\u05D9", slaTarget: "8 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "new", openDate: "2026-04-08", daysOpen: 0, installationDate: "2026-03-10", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D2\u05D9\u05DE\u05DC", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-313", customer: "\u05DE\u05E9\u05E8\u05D3 \u05D4\u05D7\u05D9\u05E0\u05D5\u05DA", project: "\u05D2\u05D3\u05E8 \u05D1\u05D9\u05EA \u05E1\u05E4\u05E8 \u05D0\u05D6\u05D5\u05E8\u05D9", installationId: "INS-1130", faultType: "\u05E8\u05E2\u05E9", description: "\u05E8\u05E2\u05E9 \u05D7\u05E8\u05D9\u05E7\u05D4 \u05D1\u05DE\u05E2\u05E7\u05D4 \u05E0\u05D9\u05E8\u05D5\u05E1\u05D8\u05D4 \u05D1\u05E8\u05D5\u05D7", urgency: "normal", technician: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "closed", openDate: "2026-03-20", daysOpen: 19, installationDate: "2025-05-14", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D0\u05DC\u05E3", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-314", customer: "\u05E7\u05E0\u05D9\u05D5\u05DF \u05D4\u05D6\u05D4\u05D1 \u05E0\u05EA\u05E0\u05D9\u05D4", project: "\u05D7\u05D6\u05D9\u05EA \u05D7\u05E0\u05D5\u05EA \u05E7\u05E0\u05D9\u05D5\u05DF", installationId: "INS-1260", faultType: "\u05D7\u05E9\u05DE\u05DC\u05D9", description: "\u05EA\u05E7\u05DC\u05D4 \u05D1\u05DE\u05E0\u05D5\u05E2 \u05D7\u05E9\u05DE\u05DC\u05D9 \u05E9\u05DC \u05EA\u05E8\u05D9\u05E1 \u05D2\u05DC\u05D9\u05DC\u05D4", urgency: "urgent", technician: "\u05DE\u05D5\u05D8\u05D9 \u05DC\u05D5\u05D9", slaTarget: "8 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "new", openDate: "2026-04-08", daysOpen: 0, installationDate: "2026-03-25", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D3\u05DC\u05EA", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
  { id: "SRV-315", customer: "\u05D7\u05D1\u05E8\u05EA \u05D7\u05E9\u05DE\u05DC \u05D9\u05E9\u05E8\u05D0\u05DC", project: "\u05DE\u05D7\u05E1\u05DF \u05DE\u05E8\u05DB\u05D6\u05D9 \u05D7\u05D9\u05E4\u05D4", installationId: "INS-1115", faultType: "\u05D7\u05DC\u05D5\u05D3\u05D4", description: "\u05D7\u05DC\u05D5\u05D3\u05D4 \u05D1\u05D2\u05D3\u05E8 \u05DE\u05EA\u05DB\u05EA \u05D3\u05E7\u05D5\u05E8\u05D8\u05D9\u05D1\u05D9\u05EA", urgency: "normal", technician: "\u05D0\u05D1\u05D9 \u05D3\u05D5\u05D3", slaTarget: "24 \u05E9\u05E2\u05D5\u05EA", slaStatus: "on_time", status: "cancelled", openDate: "2026-04-04", daysOpen: 4, installationDate: "2025-07-30", installationCrew: "\u05E6\u05D5\u05D5\u05EA \u05D0\u05DC\u05E3", handoverStatus: "\u05D4\u05D5\u05E9\u05DC\u05DD" },
];

/* Detail data for case SRV-301 (expanded view) */
const FALLBACK_DETAIL_TIMELINE = [
  { time: "2026-04-05 08:12", event: "\u05E7\u05E8\u05D9\u05D0\u05D4 \u05E0\u05E4\u05EA\u05D7\u05D4 \u05E2\"\u05D9 \u05DC\u05E7\u05D5\u05D7", by: "\u05D3\u05E0\u05D9\u05D0\u05DC \u05D0\u05DC\u05D5\u05DF" },
  { time: "2026-04-05 08:30", event: "\u05E9\u05D5\u05D1\u05E6\u05D4 \u05DC\u05D8\u05DB\u05E0\u05D0\u05D9 \u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF", by: "\u05DE\u05E2\u05E8\u05DB\u05EA" },
  { time: "2026-04-05 10:00", event: "\u05D8\u05DB\u05E0\u05D0\u05D9 \u05D9\u05E6\u05D0 \u05DC\u05D0\u05EA\u05E8", by: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" },
  { time: "2026-04-05 11:15", event: "\u05D0\u05D1\u05D7\u05D5\u05DF: \u05D6\u05D5\u05D4\u05D4 \u05DB\u05E0\u05D6\u05D9\u05DC\u05D4 \u05DE\u05DE\u05E1\u05D2\u05E8\u05EA \u05D7\u05DC\u05D5\u05DF \u05E2\u05DC\u05D9\u05D5\u05DF", by: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" },
  { time: "2026-04-05 14:00", event: "\u05D4\u05D5\u05D6\u05DE\u05DF \u05D7\u05DC\u05E7 \u05D7\u05D9\u05DC\u05D5\u05E3 \u2014 \u05D2\u05D5\u05DE\u05D9\u05D9\u05EA \u05D0\u05D9\u05D8\u05D5\u05DD 5x3000mm", by: "\u05DE\u05E2\u05E8\u05DB\u05EA" },
  { time: "2026-04-06 09:00", event: "\u05D7\u05DC\u05E7 \u05D4\u05D2\u05D9\u05E2 \u2014 \u05D4\u05EA\u05D7\u05DC\u05EA \u05EA\u05D9\u05E7\u05D5\u05DF", by: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" },
  { time: "2026-04-07 16:30", event: "\u05EA\u05D9\u05E7\u05D5\u05DF \u05D4\u05D5\u05E9\u05DC\u05DD, \u05DE\u05DE\u05EA\u05D9\u05DF \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DC\u05E7\u05D5\u05D7", by: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" },
];

const FALLBACK_DETAIL_PARTS = [
  { part: "\u05D2\u05D5\u05DE\u05D9\u05D9\u05EA \u05D0\u05D9\u05D8\u05D5\u05DD 5x3000mm", qty: 2, cost: 85 },
  { part: "\u05E1\u05D9\u05DC\u05D9\u05E7\u05D5\u05DF \u05D7\u05D9\u05E6\u05D5\u05E0\u05D9 \u05E9\u05E7\u05D5\u05E3", qty: 1, cost: 120 },
  { part: "\u05D1\u05D5\u05E8\u05D2 \u05E4\u05DC\u05D3\u05D4 M8", qty: 4, cost: 15 },
];

const detailCost = { labor: 450, parts: 305, travel: 120, total: 875 };

/* KPI calculations */
const openCount = cases.filter(c => !["closed", "cancelled"].includes(c.status)).length;
const newToday = cases.filter(c => c.openDate === "2026-04-08" && c.status === "new").length + 1;
const completedToday = cases.filter(c => c.status === "completed").length;
const waitingPart = cases.filter(c => c.status === "waiting_part").length;
const slaBreaches = cases.filter(c => c.slaStatus === "breached").length;

export default function ServiceCases() {
  const { data: servicecasesData } = useQuery({
    queryKey: ["service-cases"],
    queryFn: () => authFetch("/api/service/service_cases"),
    staleTime: 5 * 60 * 1000,
  });

  const cases = servicecasesData ?? FALLBACK_CASES;

  const [activeTab, setActiveTab] = useState("all");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const filteredCases = (() => {
    switch (activeTab) {
      case "new": return cases.filter(c => c.status === "new");
      case "active": return cases.filter(c => ["assigned", "en_route", "diagnosing", "repairing"].includes(c.status));
      case "waiting": return cases.filter(c => ["waiting_part", "awaiting_approval"].includes(c.status));
      case "done": return cases.filter(c => ["completed", "closed"].includes(c.status));
      default: return cases;
    }
  })();

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TicketCheck className="h-7 w-7 text-cyan-400" /> \u05E7\u05E8\u05D9\u05D0\u05D5\u05EA \u05E9\u05D9\u05E8\u05D5\u05EA
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          \u05D8\u05DB\u05E0\u05D5-\u05DB\u05DC \u05E2\u05D5\u05D6\u05D9 \u2014 \u05E0\u05D9\u05D4\u05D5\u05DC \u05E7\u05E8\u05D9\u05D0\u05D5\u05EA \u05E9\u05D9\u05E8\u05D5\u05EA, \u05DE\u05E2\u05E7\u05D1 SLA, \u05D8\u05DB\u05E0\u05D0\u05D9\u05DD \u05D5\u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05D4\u05EA\u05E7\u05E0\u05D5\u05EA
        </p>
      </div>

      {/* KPI Strip - 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "\u05E4\u05EA\u05D5\u05D7\u05D5\u05EA", value: "18", color: "text-blue-400", icon: TicketCheck, trend: "+3", up: false },
          { label: "\u05D7\u05D3\u05E9\u05D5\u05EA \u05D4\u05D9\u05D5\u05DD", value: "4", color: "text-cyan-400", icon: Clock, trend: "+1", up: false },
          { label: "\u05D4\u05D5\u05E9\u05DC\u05DE\u05D5 \u05D4\u05D9\u05D5\u05DD", value: "3", color: "text-emerald-400", icon: CheckCircle, trend: "+1", up: true },
          { label: "\u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA \u05DC\u05D7\u05DC\u05E7", value: "2", color: "text-orange-400", icon: PackageSearch, trend: "\u05D9\u05E6\u05D9\u05D1", up: true },
          { label: "\u05D7\u05E8\u05D9\u05D2\u05D5\u05EA SLA", value: "3", color: "text-red-400", icon: AlertTriangle, trend: "+1", up: false },
          { label: "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05D6\u05DE\u05DF \u05E1\u05D2\u05D9\u05E8\u05D4", value: "8.5 \u05E9\u05E2\u05D5\u05EA", color: "text-purple-400", icon: Timer, trend: "-12%", up: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="all" className="text-xs gap-1"><TicketCheck className="h-3.5 w-3.5" /> \u05D4\u05DB\u05DC</TabsTrigger>
          <TabsTrigger value="new" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> \u05D7\u05D3\u05E9</TabsTrigger>
          <TabsTrigger value="active" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> \u05D1\u05D8\u05D9\u05E4\u05D5\u05DC</TabsTrigger>
          <TabsTrigger value="waiting" className="text-xs gap-1"><PackageSearch className="h-3.5 w-3.5" /> \u05DE\u05DE\u05EA\u05D9\u05DF</TabsTrigger>
          <TabsTrigger value="done" className="text-xs gap-1"><CheckCircle className="h-3.5 w-3.5" /> \u05D4\u05D5\u05E9\u05DC\u05DD</TabsTrigger>
        </TabsList>

        {/* Cases Table (shared across all tabs via filtering) */}
        <TabsContent value={activeTab} className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground w-6"></TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05DE\u05E1\u05E4\u05E8</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05DC\u05E7\u05D5\u05D7</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05D4\u05EA\u05E7\u05E0\u05D4</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05E1\u05D5\u05D2 \u05EA\u05E7\u05DC\u05D4</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05EA\u05D9\u05D0\u05D5\u05E8</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05D3\u05D7\u05D9\u05E4\u05D5\u05EA</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05D8\u05DB\u05E0\u05D0\u05D9</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">SLA</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05DE\u05E6\u05D1 SLA</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05E1\u05D8\u05D8\u05D5\u05E1</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05EA\u05D0\u05E8\u05D9\u05DA \u05E4\u05EA\u05D9\u05D7\u05D4</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">\u05D9\u05DE\u05D9\u05DD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCases.map(c => (
                      <>
                        <TableRow
                          key={c.id}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${c.slaStatus === "breached" ? "bg-red-500/5" : ""}`}
                          onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}
                        >
                          <TableCell className="px-2">
                            {expandedCase === c.id
                              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-blue-400">{c.id}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{c.customer}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{c.project}</TableCell>
                          <TableCell className="font-mono text-xs text-purple-400">{c.installationId}</TableCell>
                          <TableCell className="text-xs text-foreground">{c.faultType}</TableCell>
                          <TableCell className="text-xs text-foreground max-w-[160px] truncate">{c.description}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${urgencyCfg[c.urgency].cls}`}>{urgencyCfg[c.urgency].label}</Badge></TableCell>
                          <TableCell className="text-xs text-foreground flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{c.technician}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{c.slaTarget}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${slaCfg[c.slaStatus].cls}`}>{slaCfg[c.slaStatus].label}</Badge></TableCell>
                          <TableCell><Badge className={`text-[10px] ${statusCfg[c.status].cls}`}>{statusCfg[c.status].label}</Badge></TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{c.openDate}</TableCell>
                          <TableCell className={`font-mono text-xs ${c.daysOpen > 7 ? "text-red-400" : c.daysOpen > 3 ? "text-amber-400" : "text-foreground"}`}>{c.daysOpen}</TableCell>
                        </TableRow>

                        {/* Expanded Detail */}
                        {expandedCase === c.id && (
                          <TableRow key={`${c.id}-detail`} className="bg-muted/10">
                            <TableCell colSpan={14} className="p-0">
                              <div className="p-4 space-y-4">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                                  {/* Timeline */}
                                  <Card className="bg-card/60 border-border col-span-1 lg:col-span-2">
                                    <CardContent className="p-4">
                                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-cyan-400" /> \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05D8\u05D9\u05E4\u05D5\u05DC
                                      </h3>
                                      <div className="space-y-2">
                                        {detailTimeline.map((ev, idx) => (
                                          <div key={idx} className="flex items-start gap-3 text-xs">
                                            <div className="flex flex-col items-center">
                                              <div className={`w-2.5 h-2.5 rounded-full ${idx === detailTimeline.length - 1 ? "bg-cyan-400" : "bg-muted-foreground/40"}`} />
                                              {idx < detailTimeline.length - 1 && <div className="w-px h-5 bg-border" />}
                                            </div>
                                            <div className="flex-1">
                                              <span className="font-mono text-[10px] text-muted-foreground">{ev.time}</span>
                                              <p className="text-foreground">{ev.event}</p>
                                              <p className="text-muted-foreground text-[10px]">\u05E2\"\u05D9 {ev.by}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>

                                  {/* Parts + Cost + Feedback */}
                                  <div className="space-y-4">
                                    {/* Parts Used */}
                                    <Card className="bg-card/60 border-border">
                                      <CardContent className="p-4">
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                          <PackageSearch className="h-4 w-4 text-amber-400" /> \u05D7\u05DC\u05E7\u05D9\u05DD \u05E9\u05E0\u05D5\u05E6\u05DC\u05D5
                                        </h3>
                                        <div className="space-y-1.5">
                                          {detailParts.map((p, idx) => (
                                            <div key={idx} className="flex justify-between text-xs">
                                              <span className="text-foreground">{p.part} x{p.qty}</span>
                                              <span className="font-mono text-amber-300">{fmt(p.cost * p.qty)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </CardContent>
                                    </Card>

                                    {/* Photos */}
                                    <Card className="bg-card/60 border-border">
                                      <CardContent className="p-4">
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                          <Camera className="h-4 w-4 text-purple-400" /> \u05EA\u05DE\u05D5\u05E0\u05D5\u05EA
                                        </h3>
                                        <div className="grid grid-cols-3 gap-2">
                                          {["\u05DC\u05E4\u05E0\u05D9 \u05EA\u05D9\u05E7\u05D5\u05DF", "\u05D1\u05D6\u05DE\u05DF \u05D0\u05D1\u05D7\u05D5\u05DF", "\u05D0\u05D7\u05E8\u05D9 \u05EA\u05D9\u05E7\u05D5\u05DF"].map((label, idx) => (
                                            <div key={idx} className="bg-muted/20 border border-border rounded-md h-16 flex items-center justify-center">
                                              <div className="text-center">
                                                <Camera className="h-4 w-4 text-muted-foreground mx-auto" />
                                                <p className="text-[9px] text-muted-foreground mt-1">{label}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </CardContent>
                                    </Card>

                                    {/* Cost Summary */}
                                    <Card className="bg-card/60 border-border">
                                      <CardContent className="p-4">
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                          <CircleDollarSign className="h-4 w-4 text-emerald-400" /> \u05E2\u05DC\u05D5\u05EA
                                        </h3>
                                        <div className="space-y-1.5 text-xs">
                                          <div className="flex justify-between"><span className="text-muted-foreground">\u05E2\u05D1\u05D5\u05D3\u05D4</span><span className="font-mono text-cyan-300">{fmt(detailCost.labor)}</span></div>
                                          <div className="flex justify-between"><span className="text-muted-foreground">\u05D7\u05DC\u05E7\u05D9\u05DD</span><span className="font-mono text-amber-300">{fmt(detailCost.parts)}</span></div>
                                          <div className="flex justify-between"><span className="text-muted-foreground">\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA</span><span className="font-mono text-purple-300">{fmt(detailCost.travel)}</span></div>
                                          <div className="flex justify-between border-t border-border pt-1.5">
                                            <span className="font-semibold text-foreground">\u05E1\u05D4"\u05DB</span>
                                            <span className="font-mono font-bold text-emerald-400">{fmt(detailCost.total)}</span>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>

                                    {/* Customer Feedback */}
                                    <Card className="bg-card/60 border-border">
                                      <CardContent className="p-4">
                                        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                                          <MessageSquare className="h-4 w-4 text-teal-400" /> \u05DE\u05E9\u05D5\u05D1 \u05DC\u05E7\u05D5\u05D7
                                        </h3>
                                        <div className="text-xs space-y-1.5">
                                          <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4].map(s => (
                                              <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                            ))}
                                            <Star className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="font-mono text-muted-foreground mr-1">4/5</span>
                                          </div>
                                          <p className="text-muted-foreground">"\u05D8\u05DB\u05E0\u05D0\u05D9 \u05DE\u05E7\u05E6\u05D5\u05E2\u05D9, \u05D4\u05EA\u05D9\u05E7\u05D5\u05DF \u05D4\u05D9\u05D4 \u05D8\u05D5\u05D1. \u05D4\u05D9\u05D9\u05EA\u05D9 \u05DE\u05E2\u05D3\u05D9\u05E3 \u05D6\u05DE\u05DF \u05EA\u05D2\u05D5\u05D1\u05D4 \u05DE\u05D4\u05D9\u05E8 \u05D9\u05D5\u05EA\u05E8."</p>
                                          <p className="text-muted-foreground text-[10px]">\u2014 \u05D3\u05E0\u05D9\u05D0\u05DC \u05D0\u05DC\u05D5\u05DF, \u05DE\u05E0\u05D4\u05DC \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4</p>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  </div>
                                </div>

                                {/* Link to Installation */}
                                <Card className="bg-card/60 border-border">
                                  <CardContent className="p-4">
                                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                      <Link2 className="h-4 w-4 text-blue-400" /> \u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05D4\u05EA\u05E7\u05E0\u05D4 \u05DE\u05E7\u05D5\u05E8\u05D9\u05EA
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                      <div>
                                        <p className="text-muted-foreground">\u05DE\u05E1\u05E4\u05E8 \u05D4\u05EA\u05E7\u05E0\u05D4</p>
                                        <p className="font-mono text-blue-400 font-medium">{c.installationId}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05EA\u05E7\u05E0\u05D4</p>
                                        <p className="font-mono text-foreground flex items-center gap-1"><Calendar className="h-3 w-3 text-muted-foreground" />{c.installationDate}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05E6\u05D5\u05D5\u05EA \u05D4\u05EA\u05E7\u05E0\u05D4</p>
                                        <p className="text-foreground flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{c.installationCrew}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05E1\u05D8\u05D8\u05D5\u05E1 \u05DE\u05E1\u05D9\u05E8\u05D4</p>
                                        <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 mt-0.5">{c.handoverStatus}</Badge>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05DC\u05E7\u05D5\u05D7</p>
                                        <p className="text-foreground flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{c.customer}</p>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <MapPin className="h-3 w-3" />
                                      <span>\u05DB\u05EA\u05D5\u05D1\u05EA: {c.project} | \u05E4\u05E8\u05D5\u05D9\u05E7\u05D8: {c.project}</span>
                                    </div>
                                  </CardContent>
                                </Card>

                                {/* SLA Progress */}
                                <Card className="bg-card/60 border-border">
                                  <CardContent className="p-4">
                                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                      <Timer className="h-4 w-4 text-red-400" /> \u05DE\u05E2\u05E7\u05D1 SLA
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                      <div>
                                        <p className="text-muted-foreground">\u05D9\u05E2\u05D3 SLA</p>
                                        <p className="font-mono text-foreground font-medium">{c.slaTarget}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05D6\u05DE\u05DF \u05E9\u05E2\u05D1\u05E8</p>
                                        <p className="font-mono text-foreground">{c.daysOpen * 8} \u05E9\u05E2\u05D5\u05EA \u05E2\u05D1\u05D5\u05D3\u05D4</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05DE\u05E6\u05D1</p>
                                        <Badge className={`text-[10px] mt-0.5 ${slaCfg[c.slaStatus].cls}`}>{slaCfg[c.slaStatus].label}</Badge>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">\u05E0\u05D9\u05E6\u05D5\u05DC</p>
                                        <Progress value={c.slaStatus === "breached" ? 100 : Math.min(85, (c.daysOpen * 8 / parseInt(c.slaTarget)) * 100)} className="h-2 mt-1.5" />
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Summary Row */}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>\u05DE\u05E6\u05D9\u05D2 {filteredCases.length} \u05DE\u05EA\u05D5\u05DA {cases.length} \u05E7\u05E8\u05D9\u05D0\u05D5\u05EA</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> {slaBreaches} \u05D7\u05E8\u05D9\u05D2\u05D5\u05EA SLA</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> {waitingPart} \u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA \u05DC\u05D7\u05DC\u05E7</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {completedToday} \u05D4\u05D5\u05E9\u05DC\u05DE\u05D5 \u05D4\u05D9\u05D5\u05DD</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
