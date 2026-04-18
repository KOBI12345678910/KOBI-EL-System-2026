import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type DomainEventPayload = {
  eventName: string;
  topicName: string;
  sourceService: string;
  sourceModule: string;
  entityType: string;
  entityId: number | string;
  partitionKey: string;
  correlationId?: string | null;
  causationId?: string | null;
  actorType: string;
  actorId: number | string | null;
  payload: unknown;
  metadata: unknown;
};

export async function writeDomainEvent(admin: SupabaseClient, event: DomainEventPayload): Promise<void> {
  const { error } = await admin.schema("governance").from("domain_events").insert({
    event_name: event.eventName,
    topic_name: event.topicName,
    source_service: event.sourceService,
    source_module: event.sourceModule,
    entity_type: event.entityType,
    entity_id: event.entityId,
    partition_key: event.partitionKey,
    correlation_id: event.correlationId,
    causation_id: event.causationId,
    actor_type: event.actorType,
    actor_id: event.actorId,
    payload: event.payload,
    metadata: event.metadata,
    published_at: new Date().toISOString(),
  });
  if (error) console.error("[events] Failed to write domain event:", error.message);
}
