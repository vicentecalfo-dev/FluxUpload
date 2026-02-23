'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { useFluxUploadContext } from '../FluxUploadProvider.js';
import type { UploadState } from '../types.js';

export interface UseFluxUploadResult {
  uploads: UploadState[];
  uploadsById: Record<string, UploadState>;
  actions: ReturnType<typeof useFluxUploadContext>['actions'];
  manager: ReturnType<typeof useFluxUploadContext>['manager'];
}

export function useFluxUpload(): UseFluxUploadResult {
  const { store, actions, manager } = useFluxUploadContext();

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const uploads = useMemo(
    () =>
      snapshot.order
        .map((localId) => snapshot.uploadsById[localId])
        .filter((upload): upload is UploadState => upload !== undefined),
    [snapshot],
  );

  return {
    uploads,
    uploadsById: snapshot.uploadsById,
    actions,
    manager,
  };
}
