import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { entityFilter, entityUpdate, entityCreate } from '@/lib/entity-api';

interface NextActionEngineProps {
  lead: any;
}

/**
 * Next Action Engine - Automatically determines and sets the next action for a lead
 * Based on current status and configured rules
 */
export default function NextActionEngine({ lead }: NextActionEngineProps) {
  const { data: nextActionRules = [] } = useQuery({
    queryKey: ['next-action-rules'],
    queryFn: () => entityFilter<any>("next-action-rules", { is_active: true })
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entityUpdate("leads", id, data)
  });

  const createTaskMutation = useMutation({
    mutationFn: (task: any) => entityCreate("lead-tasks", task)
  });

  const createNotificationMutation = useMutation({
    mutationFn: (notification: any) => entityCreate("notifications", notification)
  });

  useEffect(() => {
    if (!lead) return;

    const setNextAction = async () => {
      const matchingRule = nextActionRules.find((rule: any) =>
        rule.trigger_status === lead.sales_status || rule.trigger_status === lead.status
      );

      if (!matchingRule) return;

      const nextActionDate = new Date();
      nextActionDate.setHours(nextActionDate.getHours() + (matchingRule.deadline_hours || 24));

      const nextAction = interpolateTemplate(matchingRule.next_action_template, lead);

      await updateLeadMutation.mutateAsync({
        id: lead.id,
        data: {
          next_action: nextAction,
          next_action_at: nextActionDate.toISOString()
        }
      });

      if (matchingRule.auto_create_task && matchingRule.task_config) {
        const taskTitle = interpolateTemplate(matchingRule.task_config.title_template, lead);
        const taskDescription = interpolateTemplate(
          matchingRule.task_config.description_template || '',
          lead
        );

        await createTaskMutation.mutateAsync({
          lead_id: lead.id,
          title: taskTitle,
          description: taskDescription,
          priority: matchingRule.priority,
          status: 'pending',
          due_date: nextActionDate.toISOString(),
          assigned_to: lead.owner_user_id || lead.created_by
        });
      }

      if (matchingRule.notification_config?.send_to) {
        for (const recipient of matchingRule.notification_config.send_to) {
          let recipientEmail: string | undefined;

          switch (recipient) {
            case 'owner':
              recipientEmail = lead.owner_user_id;
              break;
            case 'manager':
              recipientEmail = lead.created_by;
              break;
            default:
              continue;
          }

          if (recipientEmail) {
            const message = interpolateTemplate(
              matchingRule.notification_config.message_template || nextAction,
              lead
            );

            await createNotificationMutation.mutateAsync({
              user_email: recipientEmail,
              title: 'Action Required',
              message,
              type: 'info',
              priority: matchingRule.priority === 'critical' ? 'critical' : 'medium',
              entity_type: 'Lead',
              entity_id: lead.id,
              action_url: `/leads/${lead.id}`
            });
          }
        }
      }
    };

    setNextAction();
  }, [lead?.sales_status, lead?.status, nextActionRules]);

  const interpolateTemplate = (template: string, lead: any): string => {
    return template
      .replace('{customer_name}', lead.first_name || lead.company_name || 'Customer')
      .replace('{phone}', lead.phone || '')
      .replace('{city}', lead.city || '')
      .replace('{work_type}', Array.isArray(lead.work_type) ? lead.work_type.join(', ') : lead.work_type || '');
  };

  return null;
}
