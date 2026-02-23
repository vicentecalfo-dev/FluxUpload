import type { UploadProgress, UploadStatus } from './types.js';

export interface UploadStatusEvent {
  localId: string;
  status: UploadStatus;
  message?: string;
}

export interface UploadErrorEvent {
  localId: string;
  error: unknown;
}

export interface UploadCompletedEvent {
  localId: string;
}

export interface UploadEvents {
  status: UploadStatusEvent;
  progress: UploadProgress;
  error: UploadErrorEvent;
  completed: UploadCompletedEvent;
}

export type EventHandler<TPayload> = (payload: TPayload) => void;

export class EventEmitter<TEvents extends object> {
  private readonly handlers = new Map<keyof TEvents, Set<EventHandler<TEvents[keyof TEvents]>>>();

  public on<TKey extends keyof TEvents>(
    eventName: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): () => void {
    const eventHandlers =
      this.handlers.get(eventName) ?? new Set<EventHandler<TEvents[keyof TEvents]>>();
    eventHandlers.add(handler as EventHandler<TEvents[keyof TEvents]>);
    this.handlers.set(eventName, eventHandlers);

    return () => {
      this.off(eventName, handler);
    };
  }

  public off<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): void {
    const eventHandlers = this.handlers.get(eventName);
    if (!eventHandlers) {
      return;
    }

    eventHandlers.delete(handler as EventHandler<TEvents[keyof TEvents]>);

    if (eventHandlers.size === 0) {
      this.handlers.delete(eventName);
    }
  }

  public emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    const eventHandlers = this.handlers.get(eventName);
    if (!eventHandlers || eventHandlers.size === 0) {
      return;
    }

    for (const handler of eventHandlers) {
      handler(payload as TEvents[keyof TEvents]);
    }
  }
}
