'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { useFluxUploadContext } from '../FluxUploadProvider.js';
import type { UploadState } from '../types.js';

export function useUploadList(): UploadState[] {
  const { store } = useFluxUploadContext();

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return useMemo(
    () =>
      snapshot.order
        .map((localId) => snapshot.uploadsById[localId])
        .filter((upload): upload is UploadState => upload !== undefined),
    [snapshot],
  );
}
