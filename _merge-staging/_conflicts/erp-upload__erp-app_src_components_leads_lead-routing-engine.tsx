import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityUpdate, entityCreate } from '@/lib/entity-api';
import { toast } from 'sonner';

interface LeadRoutingEngineProps {
  lead: any;
  onAssigned?: (userId: string) => void;
}

/**
 * Lead Routing Engine - Assigns leads to users based on rules
 * Supports: Geographic, Work Type, Customer Type, Urgency, Round Robin, Skill-based
 */
export default function LeadRoutingEngine({ lead, onAssigned }: LeadRoutingEngineProps) {
  const queryClient = useQueryClient();

  const { data: routingRules = [] } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: () => entityFilter<any>("lead-routing-rules", { is_active: true })
  });

  const assignLeadMutation = useMutation({
    mutationFn: ({ leadId, userId, reason }: { leadId: string; userId: string; reason: string }) =>
      entityUpdate("leads", leadId, {
        owner_user_id: userId,
        assignment_reason: reason
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (onAssigned) onAssigned(variables.userId);

      entityCreate("lead-activities", {
        lead_id: lead.id,
        type: 'note',
        description: `Assigned to ${variables.userId} (${variables.reason})`
      });
    }
  });

  const createNotificationMutation = useMutation({
    mutationFn: (notification: any) => entityCreate("notifications", notification)
  });

  useEffect(() => {
    if (!lead || lead.owner_user_id) return;

    const executeRouting = async () => {
      const matchingRule = routingRules.find((rule: any) =>
        checkRuleConditions(rule, lead)
      );

      if (!matchingRule) {
        console.log('No matching routing rule found');
        return;
      }

      try {
        const assignedUser = await assignLead(matchingRule, lead);

        if (assignedUser) {
          await assignLeadMutation.mutateAsync({
            leadId: lead.id,
            userId: assignedUser,
            reason: `${matchingRule.routing_type} - ${matchingRule.rule_name}`
          });

          await createNotificationMutation.mutateAsync({
            user_email: assignedUser,
            title: 'New lead assigned to you',
            message: `New lead created: ${lead.first_name || lead.company_name}`,
            type: 'info',
            priority: lead.urgency === 'critical' ? 'critical' : 'medium',
            entity_type: 'Lead',
            entity_id: lead.id
          });

          await entityUpdate("lead-routing-rules", matchingRule.id, {
            execution_count: (matchingRule.execution_count || 0) + 1,
            last_executed: new Date().toISOString()
          });

          if (matchingRule.escalation_config?.enabled) {
            setTimeout(() => {
              checkEscalation(lead, matchingRule);
            }, matchingRule.escalation_config.after_minutes * 60 * 1000);
          }
        }
      } catch (error) {
        console.error('Routing error:', error);
        toast.error('Error assigning lead');
      }
    };

    executeRouting();
  }, [lead?.id, routingRules]);

  const checkRuleConditions = (rule: any, lead: any): boolean => {
    if (!rule.conditions || rule.conditions.length === 0) return true;

    return rule.conditions.every((condition: any) => {
      const fieldValue = lead[condition.field];

      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value;
        case 'not_equals':
          return fieldValue !== condition.value;
        case 'contains':
          if (Array.isArray(fieldValue)) {
            return fieldValue.includes(condition.value);
          }
          return String(fieldValue).includes(condition.value);
        case 'in':
          const values = condition.value.split(',').map((v: string) => v.trim());
          return values.includes(fieldValue);
        default:
          return false;
      }
    });
  };

  const assignLead = async (rule: any, lead: any): Promise<string | null> => {
    const config = rule.assignment_config;

    switch (config.type) {
      case 'specific_user':
        return config.user_email;

      case 'round_robin':
        if (!config.users_pool || config.users_pool.length === 0) return null;

        const currentIndex = config.current_index || 0;
        const assignedUser = config.users_pool[currentIndex];

        const nextIndex = (currentIndex + 1) % config.users_pool.length;
        await entityUpdate("lead-routing-rules", rule.id, {
          assignment_config: {
            ...config,
            current_index: nextIndex
          }
        });

        return assignedUser;

      case 'load_balanced':
        if (!config.users_pool || config.users_pool.length === 0) return null;

        const userLoads = await Promise.all(
          config.users_pool.map(async (userEmail: string) => {
            const leads = await entityFilter<any>("leads", {
              owner_user_id: userEmail,
              status: ['new', 'measuring', 'quoted']
            });
            return { userEmail, count: leads.length };
          })
        );

        const leastBusy = userLoads.reduce((min, curr) =>
          curr.count < min.count ? curr : min
        );

        return leastBusy.userEmail;

      case 'team':
        return null;

      default:
        return null;
    }
  };

  const checkEscalation = async (lead: any, rule: any) => {
    const activities = await entityFilter<any>("lead-activities", {
      lead_id: lead.id,
      type: ['call', 'email', 'whatsapp']
    });

    const leadAge = Date.now() - new Date(lead.created_date).getTime();
    const threshold = rule.escalation_config.after_minutes * 60 * 1000;

    if (activities.length === 0 && leadAge > threshold) {
      const escalateTo = rule.escalation_config.escalate_to;

      await entityUpdate("leads", lead.id, {
        owner_user_id: escalateTo,
        escalated: true,
        escalation_reason: `No activity after ${rule.escalation_config.after_minutes} minutes`
      });

      if (rule.escalation_config.notify) {
        await createNotificationMutation.mutateAsync({
          user_email: escalateTo,
          title: 'Escalation - Urgent lead without response',
          message: `Lead ${lead.first_name || lead.company_name} did not receive a response within ${rule.escalation_config.after_minutes} minutes`,
          type: 'sla_breach',
          priority: 'critical',
          entity_type: 'Lead',
          entity_id: lead.id
        });
      }

      toast.warning(`Lead escalated to ${escalateTo}`);
    }
  };

  return null;
}
