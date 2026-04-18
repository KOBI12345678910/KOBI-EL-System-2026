import { useEffect, useState } from "react";
import { entityFilter } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface User {
  id: string;
  email?: string;
}

interface Task {
  id: string;
  assigned_to?: string;
  status?: string;
  due_date?: string;
  title?: string;
}

interface SLAViolation {
  id: string;
  lead_owner_id?: string;
  status?: string;
}

interface Lead {
  id: string;
  owner_id?: string;
  grade?: string;
  last_contacted_at?: string;
  created_date?: string;
}

interface Meeting {
  id: string;
  status?: string;
  meeting_date?: string;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function SmartNotificationEngine() {
  const [, setNotificationCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      checkSmartNotifications().catch((err) =>
        console.error("Notification check failed:", err)
      );
    }, 300_000);

    checkSmartNotifications().catch((err) =>
      console.error("Initial notification check failed:", err)
    );

    return () => clearInterval(interval);
  }, []);

  const checkSmartNotifications = async () => {
    try {
      const user = await authJson<User>("/api/auth/me");

      // Overdue tasks
      const tasks = await entityFilter<Task>("task", {
        assigned_to: user.id,
        status: "todo",
      });

      const overdueTasks = tasks.filter(
        (t) => t.due_date && new Date(t.due_date) < new Date()
      );
      if (overdueTasks.length > 0) {
        toast.error(`${overdueTasks.length} overdue tasks!`, {
          duration: 5000,
          action: {
            label: "View",
            onClick: () => {
              window.location.href = "/tasks";
            },
          },
        });
      }

      // SLA Violations
      const violations = await entityFilter<SLAViolation>("sla-violation", {
        lead_owner_id: user.id,
        status: "open",
      });

      if (violations.length > 0) {
        toast.warning(`${violations.length} SLA violations need attention`, {
          duration: 5000,
        });
      }

      // Hot leads with no activity
      const myLeads = await entityFilter<Lead>("lead", {
        owner_id: user.id,
        grade: "hot",
      });

      const hotLeadsNoActivity = myLeads.filter((lead) => {
        const lastContact = lead.last_contacted_at
          ? new Date(lead.last_contacted_at)
          : new Date(lead.created_date!);
        const daysSince = Math.floor(
          (Date.now() - lastContact.getTime()) / 86_400_000
        );
        return daysSince >= 2;
      });

      if (hotLeadsNoActivity.length > 0) {
        toast.info(
          `${hotLeadsNoActivity.length} hot leads with no activity in 2 days`,
          { duration: 5000 }
        );
      }

      // Upcoming meetings
      const meetings = await entityFilter<Meeting>("meeting", {
        status: "scheduled",
      });

      const upcomingMeetings = meetings.filter((m) => {
        const meetingDate = new Date(m.meeting_date!);
        const minutesUntil = (meetingDate.getTime() - Date.now()) / 60_000;
        return minutesUntil > 0 && minutesUntil <= 30;
      });

      if (upcomingMeetings.length > 0) {
        const mins = Math.floor(
          (new Date(upcomingMeetings[0].meeting_date!).getTime() - Date.now()) /
            60_000
        );
        toast.info(`Meeting coming up in ${mins} minutes`, { duration: 10_000 });
      }

      setNotificationCount(
        overdueTasks.length + violations.length + hotLeadsNoActivity.length
      );
    } catch (error) {
      console.error("Smart notification error:", error);
    }
  };

  return null;
}
