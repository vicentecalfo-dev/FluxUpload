'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { useFluxUploadContext } from '../FluxUploadProvider.js';
import type { UploadBoundActions, UploadState } from '../types.js';

export interface UseUploadResult {
  upload: UploadState | undefined;
  actions: UploadBoundActions;
}

export function useUpload(localId: string): UseUploadResult {
  const { store, actions } = useFluxUploadContext();

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const boundActions = useMemo<UploadBoundActions>(
    () => ({
      start: () => actions.start(localId),
      pause: () => actions.pause(localId),
      resume: () => actions.resume(localId),
      cancel: () => actions.cancel(localId),
      bindFile: (file: File) => actions.bindFile(localId, file),
    }),
    [actions, localId],
  );

  return {
    upload: snapshot.uploadsById[localId],
    actions: boundActions,
  };
}
