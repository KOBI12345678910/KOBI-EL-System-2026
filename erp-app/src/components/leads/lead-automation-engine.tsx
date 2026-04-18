import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityCreate, entityUpdate } from '@/lib/entity-api';
import { authFetch } from '@/lib/utils';

interface LeadAutomationEngineProps {
  lead: any;
}

export default function LeadAutomationEngine({ lead }: LeadAutomationEngineProps) {
  const queryClient = useQueryClient();

  const { data: automationRules = [] } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: () => entityFilter<any>("lead-automation-rules", { is_active: true })
  });

  const createEventMutation = useMutation({
    mutationFn: (event: any) => entityCreate("event-logs", event)
  });

  const createTaskMutation = useMutation({
    mutationFn: (task: any) => entityCreate("lead-tasks", task)
  });

  useEffect(() => {
    if (!lead) return;

    const executeAutomationRules = async () => {
      for (const rule of automationRules) {
        try {
          if (!shouldExecuteRule(rule, lead)) continue;
          for (const action of rule.actions || []) {
            await executeAction(action, lead);
          }
          await entityUpdate("lead-automation-rules", rule.id, {
            last_run: new Date().toISOString(),
            run_count: (rule.run_count || 0) + 1,
            success_count: (rule.success_count || 0) + 1
          });
        } catch (error) {
          console.error(`Error executing rule ${rule.rule_name}:`, error);
          await entityUpdate("lead-automation-rules", rule.id, {
            error_count: (rule.error_count || 0) + 1
          });
        }
      }
    };

    executeAutomationRules();
  }, [lead?.id, lead?.status, lead?.updated_date, automationRules]);

  const shouldExecuteRule = (rule: any, lead: any): boolean => {
    if (rule.apply_to_status?.length > 0 && !rule.apply_to_status.includes(lead.status)) return false;
    const trigger = rule.trigger;
    if (!trigger) return false;

    switch (trigger.type) {
      case 'lead_created': return !rule.last_run;
      case 'lead_updated': return true;
      case 'field_changed': return checkFieldConditions(trigger.conditions, lead);
      case 'status_changed': return checkFieldConditions(trigger.conditions, lead);
      case 'inactivity_period': return checkInactivity(trigger.time_config, lead);
      case 'time_elapsed': return checkTimeElapsed(trigger.time_config, lead);
      case 'score_threshold': return false;
      default: return false;
    }
  };

  const checkFieldConditions = (conditions: any[], lead: any): boolean => {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every((cond: any) => {
      const fieldValue = lead[cond.field];
      switch (cond.operator) {
        case 'equals': return fieldValue === cond.value;
        case 'not_equals': return fieldValue !== cond.value;
        case 'contains': return String(fieldValue).includes(cond.value);
        case 'greater_than': return Number(fieldValue) > Number(cond.value);
        case 'less_than': return Number(fieldValue) < Number(cond.value);
        case 'is_empty': return !fieldValue;
        case 'is_not_empty': return !!fieldValue;
        default: return false;
      }
    });
  };

  const checkInactivity = (timeConfig: any, lead: any): boolean => {
    if (!timeConfig) return false;
    const lastActivity = lead.last_contacted_at || lead.updated_date || lead.created_date;
    const inactiveDuration = Date.now() - new Date(lastActivity).getTime();
    const threshold =
      (timeConfig.duration_minutes || 0) * 60 * 1000 +
      (timeConfig.duration_hours || 0) * 60 * 60 * 1000 +
      (timeConfig.duration_days || 0) * 24 * 60 * 60 * 1000;
    return inactiveDuration > threshold;
  };

  const checkTimeElapsed = (timeConfig: any, lead: any): boolean => {
    if (!timeConfig) return false;
    const elapsed = Date.now() - new Date(lead.created_date).getTime();
    const threshold =
      (timeConfig.duration_minutes || 0) * 60 * 1000 +
      (timeConfig.duration_hours || 0) * 60 * 60 * 1000 +
      (timeConfig.duration_days || 0) * 24 * 60 * 60 * 1000;
    return elapsed > threshold;
  };

  const executeAction = async (action: any, lead: any) => {
    switch (action.type) {
      case 'assign_to_user':
        await entityUpdate("leads", lead.id, { owner_user_id: action.config.user_email });
        break;
      case 'change_status':
        await entityUpdate("leads", lead.id, { status: action.config.new_status });
        break;
      case 'change_priority':
        await entityUpdate("leads", lead.id, { priority: action.config.new_priority });
        break;
      case 'update_field':
        await entityUpdate("leads", lead.id, { [action.config.field]: action.config.value });
        break;
      case 'create_task':
        await entityCreate("lead-tasks", {
          lead_id: lead.id,
          title: action.config.task_title || 'Automatic task',
          description: action.config.task_description || '',
          priority: 'medium',
          status: 'pending',
          assigned_to: lead.owner_user_id || lead.created_by
        });
        break;
      case 'send_notification':
        const toUser = action.config.to_user === 'owner' ? lead.owner_user_id : action.config.to_user === 'creator' ? lead.created_by : action.config.user_email;
        await entityCreate("notifications", {
          user_email: toUser,
          title: action.config.title || 'Automatic notification',
          message: action.config.message || '',
          type: 'info',
          priority: 'medium',
          entity_type: 'Lead',
          entity_id: lead.id
        });
        break;
      case 'send_email':
        await authFetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: action.config.to_email || lead.email,
            subject: action.config.subject || 'Automatic message',
            body: action.config.body || ''
          })
        });
        break;
      case 'create_activity':
        await entityCreate("lead-activities", {
          lead_id: lead.id,
          type: action.config.activity_type || 'note',
          description: action.config.description || 'Automatic activity'
        });
        break;
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  };

  return null;
}
