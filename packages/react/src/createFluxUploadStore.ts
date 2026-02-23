import type { UploadState } from './types.js';

export interface FluxUploadStoreSnapshot {
  uploadsById: Record<string, UploadState>;
  order: string[];
}

export type FluxUploadStoreListener = () => void;

export interface FluxUploadStore {
  getSnapshot: () => FluxUploadStoreSnapshot;
  subscribe: (listener: FluxUploadStoreListener) => () => void;
  upsertState: (state: UploadState) => void;
  remove: (localId: string) => void;
  setMany: (states: UploadState[]) => void;
}

export function createFluxUploadStore(initialStates: UploadState[] = []): FluxUploadStore {
  let snapshot: FluxUploadStoreSnapshot = {
    uploadsById: {},
    order: [],
  };

  const listeners = new Set<FluxUploadStoreListener>();

  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setSnapshot = (nextSnapshot: FluxUploadStoreSnapshot): void => {
    snapshot = nextSnapshot;
    emit();
  };

  const api: FluxUploadStore = {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    upsertState: (state) => {
      const currentState = snapshot.uploadsById[state.localId];
      const hasEntry = Boolean(currentState);

      setSnapshot({
        uploadsById: {
          ...snapshot.uploadsById,
          [state.localId]: state,
        },
        order: hasEntry ? snapshot.order : [...snapshot.order, state.localId],
      });
    },

    remove: (localId) => {
      if (!snapshot.uploadsById[localId]) {
        return;
      }

      const remaining = { ...snapshot.uploadsById };
      delete remaining[localId];
      setSnapshot({
        uploadsById: remaining,
        order: snapshot.order.filter((id) => id !== localId),
      });
    },

    setMany: (states) => {
      const sortedStates = [...states].sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return a.localId.localeCompare(b.localId);
        }

        return a.createdAt.localeCompare(b.createdAt);
      });

      const uploadsById: Record<string, UploadState> = {};
      const order: string[] = [];

      for (const state of sortedStates) {
        uploadsById[state.localId] = state;
        order.push(state.localId);
      }

      setSnapshot({
        uploadsById,
        order,
      });
    },
  };

  if (initialStates.length > 0) {
    api.setMany(initialStates);
  }

  return api;
}
