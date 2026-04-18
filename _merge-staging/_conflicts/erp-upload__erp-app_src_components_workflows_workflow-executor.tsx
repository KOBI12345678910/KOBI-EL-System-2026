import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { useEffect } from "react";

export class WorkflowEngine {
  static async executeWorkflow(workflowId, entity, entityType) {
    try {
      const workflow = await entityFilter<any>("workflows", { id: workflowId }).then(r => r[0]);
      if (!workflow || !workflow.is_active) return;

      const execution = await entityCreate<any>("workflow-executions", {
        workflow_id: workflowId,
        entity_type: entityType,
        entity_id: entity.id,
        status: 'in_progress',
        total_steps: workflow.steps?.length || 0,
        started_at: new Date().toISOString()
      });

      for (let step of workflow.steps || []) {
        try {
          await this.executeStep(step, entity, entityType, execution.id, workflow);
          
          await entityUpdate<any>("workflow-executions", execution.id, {
            steps_completed: (execution.steps_completed || 0) + 1
          });
        } catch (error) {
          console.error(`Step ${step.id} failed:`, error);
          await entityUpdate<any>("workflow-executions", execution.id, {
            status: 'failed',
            error_message: error.message
          });
          return;
        }
      }

      await entityUpdate<any>("workflow-executions", execution.id, {
        status: 'completed',
        completed_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Workflow execution failed:', error);
    }
  }

  static async executeStep(step, entity, entityType, executionId, workflow) {
    const { action_type, config } = step;

    if (action_type === 'send_email') {
      await this.sendEmail(config, entity);
    } else if (action_type === 'create_task') {
      await this.createTask(config, entity, entityType);
    } else if (action_type === 'delay') {
      await new Promise(resolve => setTimeout(resolve, (config.minutes || 0) * 60000));
    } else if (action_type === 'conditional') {
      // Check condition, if fails skip remaining steps
      if (!this.evaluateCondition(config, entity)) {
        throw new Error('Condition not met');
      }
    }
  }

  static async sendEmail(config, entity) {
    const template = await entityFilter<any>("email-templates", { name: config.template_name }).then(r => r[0]);
    if (!template) throw new Error('Template not found');

    const email = entity.email || (entity.contact_email);
    if (!email) throw new Error('No email found');

    const body = template.body
      .replace(/{{firstName}}/g, entity.first_name || entity.contact_name?.split(' ')[0] || '')
      .replace(/{{email}}/g, email)
      .replace(/{{name}}/g, entity.name || entity.contact_name || '');

    await fetch("/api/integrations/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      to: email,
      subject: config.subject_override || template.subject,
      body
    }) });

    // Create analytics record
    await entityCreate<any>("email-analytics", {
      email_id: `email_${Date.now()}`,
      recipient: email,
      subject: config.subject_override || template.subject,
      sent_at: new Date().toISOString(),
      tracking_pixel: `${window.location.origin}/api/track-email/${Date.now()}`
    });
  }

  static async createTask(config, entity, entityType) {
    await entityCreate<any>("tasks", {
      title: config.title,
      priority: config.priority || 'medium',
      related_entity_type: entityType,
      related_entity_id: entity.id,
      status: 'pending'
    });
  }

  static evaluateCondition(config, entity) {
    const fieldValue = entity[config.field];
    const expectedValue = config.value;

    switch (config.operator) {
      case 'equals':
        return fieldValue === expectedValue;
      case 'not_equals':
        return fieldValue !== expectedValue;
      case 'greater':
        return Number(fieldValue) > Number(expectedValue);
      case 'less':
        return Number(fieldValue) < Number(expectedValue);
      default:
        return true;
    }
  }
}

export default function WorkflowExecutor() {
  return null; // This is a utility class, no UI needed
}