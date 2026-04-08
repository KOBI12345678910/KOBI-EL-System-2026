import { EventEmitter } from "events";

export type RecordEventType =
  | "record.created"
  | "record.updated"
  | "record.deleted"
  | "record.status_changed";

export interface RecordEvent {
  type: RecordEventType;
  entityId: number;
  recordId: number;
  data: Record<string, any>;
  oldData?: Record<string, any>;
  status?: string | null;
  oldStatus?: string | null;
  timestamp: Date;
}

class PlatformEventBus extends EventEmitter {
  emitRecordEvent(event: RecordEvent) {
    this.emit(event.type, event);
    this.emit("record.*", event);
  }
}

export const eventBus = new PlatformEventBus();
eventBus.setMaxListeners(50);
