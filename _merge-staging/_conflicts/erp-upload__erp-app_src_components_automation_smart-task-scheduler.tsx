import { useEffect } from "react";
import { entityFilter, entityCreate, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface User {
  id: string;
}

interface Lead {
  id: string;
  full_name?: string;
  company_name?: string;
  stage?: string;
  grade?: string;
  owner_id?: string;
  last_contacted_at?: string;
  created_date?: string;
}

interface Task {
  id: string;
  lead_id?: string;
  title?: string;
  assigned_to?: string;
  status?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  reminder_sent?: boolean;
  is_overdue?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function SmartTaskScheduler() {
  useEffect(() => {
    const interval = setInterval(runScheduler, 5 * 60 * 1000);
    runScheduler();
    return () => clearInterval(interval);
  }, []);

  const runScheduler = async () => {
    try {
      const user = await authJson<User>("/api/auth/me");
      await createFollowUpTasks(user);
      await remindUpcomingTasks(user);
      await checkOverdueTasks(user);
      await optimizeTaskPriorities(user);
    } catch (error) {
      console.error("Scheduler error:", error);
    }
  };

  const createFollowUpTasks = async (user: User) => {
    const leads = await entityFilter<Lead>("lead", { owner_id: user.id });

    for (const lead of leads) {
      if (lead.stage === "won" || lead.stage === "lost") continue;

      const lastContact = lead.last_contacted_at
        ? new Date(lead.last_contacted_at)
        : new Date(lead.created_date!);
      const daysSince = Math.floor(
        (Date.now() - lastContact.getTime()) / 86_400_000
      );

      if (daysSince >= 3) {
        const existingTasks = await entityFilter<Task>("task", {
          lead_id: lead.id,
          category: "follow_up",
          status: "todo",
        });

        if (existingTasks.length === 0) {
          await entityCreate<Task>("task", {
            lead_id: lead.id,
            title: `Follow-up ${lead.grade === "hot" ? "urgent" : ""} - ${lead.full_name || lead.company_name}`,
            description: `${daysSince} days since last contact. Recommended to reach out.`,
            priority: lead.grade === "hot" ? "high" : daysSince >= 7 ? "high" : "medium",
            category: "follow_up",
            status: "todo",
            assigned_to: user.id,
            due_date: new Date(Date.now() + 86_400_000).toISOString(),
          } as unknown as Task);
        }
      }
    }
  };

  const remindUpcomingTasks = async (user: User) => {
    const tasks = await entityFilter<Task>("task", {
      assigned_to: user.id,
      status: "todo",
    });

    for (const task of tasks) {
      if (!task.due_date) continue;

      const hoursUntil =
        (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60);

      if (hoursUntil > 0 && hoursUntil <= 1 && !task.reminder_sent) {
        toast.warning(
          `Urgent task in ${Math.floor(hoursUntil * 60)} minutes: ${task.title}`,
          { duration: 10_000 }
        );

        await entityUpdate<Task>("task", task.id, {
          reminder_sent: true,
        } as Partial<Task>);
      }
    }
  };

  const checkOverdueTasks = async (user: User) => {
    const tasks = await entityFilter<Task>("task", {
      assigned_to: user.id,
      status: "todo",
    });

    const actuallyOverdue = tasks.filter(
      (t) => t.due_date && new Date(t.due_date) < new Date()
    );

    for (const task of actuallyOverdue) {
      if (!task.is_overdue) {
        await entityUpdate<Task>("task", task.id, {
          is_overdue: true,
        } as Partial<Task>);
      }
    }
  };

  const optimizeTaskPriorities = async (user: User) => {
    const tasks = await entityFilter<Task>("task", {
      assigned_to: user.id,
      status: "todo",
    });

    for (const task of tasks) {
      if (!task.due_date) continue;

      const hoursUntil =
        (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60);

      if (hoursUntil <= 24 && hoursUntil > 0 && task.priority === "low") {
        await entityUpdate<Task>("task", task.id, {
          priority: "medium",
        } as Partial<Task>);
      }

      if (hoursUntil <= 6 && hoursUntil > 0 && task.priority !== "critical") {
        await entityUpdate<Task>("task", task.id, {
          priority: "high",
        } as Partial<Task>);
      }
    }
  };

  return null;
}
