'use client';

import {
  UploadManager,
  type UploadState as CoreUploadState,
  type FileMeta,
  type PartDataProvider,
} from '@flux-upload/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from 'react';

import { createFluxUploadStore } from './createFluxUploadStore.js';
import {
  FileMismatchError,
  type FluxUploadActions,
  type FluxUploadContextValue,
  type FluxUploadProviderProps,
  type CreateUploadFromFileOptions,
  type UploadState,
} from './types.js';

const FluxUploadContext = createContext<FluxUploadContextValue | null>(null);

export function FluxUploadProvider(props: FluxUploadProviderProps): ReactElement {
  const managerRef = useRef<UploadManager>();
  if (!managerRef.current) {
    managerRef.current = resolveManager(props);
  }
  const storeRef = useRef(props.store ?? createFluxUploadStore());
  const boundLocalIdsRef = useRef(new Set<string>());
  const pendingBindsRef = useRef(new Map<string, Promise<void>>());
  const latestRefreshRequestRef = useRef(0);

  const manager = managerRef.current;
  const store = storeRef.current;

  const refreshFromPersistence = useCallback(async (): Promise<void> => {
    const requestId = latestRefreshRequestRef.current + 1;
    latestRefreshRequestRef.current = requestId;
    const states = await manager.listStates();

    if (requestId !== latestRefreshRequestRef.current) {
      return;
    }

    store.setMany(
      states.map((state) =>
        withRuntimeState(state, {
          isBound: boundLocalIdsRef.current.has(state.localId),
        }),
      ),
    );
  }, [manager, store]);

  const bindFile = useCallback(
    (localId: string, file: File): void => {
      const snapshot = store.getSnapshot();
      const state = snapshot.uploadsById[localId];

      if (!state) {
        const error = new Error(`Upload '${localId}' was not found in the local store.`) as Error & {
          code?: string;
        };
        error.code = 'UPLOAD_NOT_FOUND';
        throw error;
      }

      assertFileMatch(localId, state, file);
      store.upsertState({
        ...state,
        runtime: {
          isBound: true,
        },
      });

      const bindPromise = manager
        .bindPartDataProvider(localId, createPartDataProvider(file))
        .then(async () => {
          boundLocalIdsRef.current.add(localId);
          await refreshFromPersistence();
        })
        .catch(async () => {
          boundLocalIdsRef.current.delete(localId);
          await refreshFromPersistence();
        })
        .finally(() => {
          pendingBindsRef.current.delete(localId);
        });

      pendingBindsRef.current.set(localId, bindPromise);
      void bindPromise;
    },
    [manager, store, refreshFromPersistence],
  );

  const actions = useMemo<FluxUploadActions>(
    () => ({
      createUploadFromFile: async (
        file: File,
        options?: CreateUploadFromFileOptions,
      ): Promise<{ localId: string }> => {
        const { autoStart = false, ...overrides } = options ?? {};
        const localId = manager.createUpload(
          toFileMeta(file),
          createPartDataProvider(file),
          overrides,
        );
        boundLocalIdsRef.current.add(localId);

        await refreshFromPersistence();

        if (autoStart) {
          await manager.start(localId);
          await refreshFromPersistence();
        }

        return { localId };
      },

      bindFile,

      start: async (localId: string): Promise<void> => {
        await pendingBindsRef.current.get(localId);
        await manager.start(localId);
        await refreshFromPersistence();
      },

      pause: async (localId: string): Promise<void> => {
        await manager.pause(localId);
        await refreshFromPersistence();
      },

      resume: async (localId: string): Promise<void> => {
        await pendingBindsRef.current.get(localId);
        await manager.resume(localId);
        await refreshFromPersistence();
      },

      cancel: async (localId: string): Promise<void> => {
        await manager.cancel(localId);
        await refreshFromPersistence();
      },

      list: (): UploadState[] => {
        const snapshot = store.getSnapshot();
        return snapshot.order
          .map((localId) => snapshot.uploadsById[localId])
          .filter((state): state is UploadState => state !== undefined);
      },

      refreshFromPersistence,
    }),
    [bindFile, manager, refreshFromPersistence, store],
  );

  useEffect(() => {
    const queueRefresh = (): void => {
      void refreshFromPersistence();
    };

    const unsubscribers = [
      manager.on('status', queueRefresh),
      manager.on('progress', queueRefresh),
      manager.on('completed', queueRefresh),
      manager.on('error', queueRefresh),
    ];

    queueRefresh();

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [manager, refreshFromPersistence]);

  const contextValue = useMemo<FluxUploadContextValue>(
    () => ({
      manager,
      store,
      actions,
    }),
    [actions, manager, store],
  );

  return <FluxUploadContext.Provider value={contextValue}>{props.children}</FluxUploadContext.Provider>;
}

export function useFluxUploadContext(): FluxUploadContextValue {
  const context = useContext(FluxUploadContext);

  if (!context) {
    throw new Error('useFluxUploadContext must be used within FluxUploadProvider.');
  }

  return context;
}

function toFileMeta(file: File): FileMeta {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

function createPartDataProvider(file: File): PartDataProvider {
  return async (partSpec) => file.slice(partSpec.startByte, partSpec.endByteExclusive);
}

function assertFileMatch(localId: string, state: UploadState, file: File): void {
  const meta = state.fileMeta;

  if (meta.name !== file.name) {
    throw new FileMismatchError(localId, `name differs (${meta.name} !== ${file.name})`);
  }

  if (meta.size !== file.size) {
    throw new FileMismatchError(localId, `size differs (${meta.size} !== ${file.size})`);
  }

  if ((meta.lastModified ?? null) !== file.lastModified) {
    throw new FileMismatchError(
      localId,
      `lastModified differs (${meta.lastModified ?? 'null'} !== ${file.lastModified})`,
    );
  }
}

function withRuntimeState(
  state: CoreUploadState,
  runtimeState: {
    isBound: boolean;
  },
): UploadState {
  return {
    ...state,
    runtime: runtimeState,
  };
}

function resolveManager(props: FluxUploadProviderProps): UploadManager {
  if ('manager' in props && props.manager) {
    return props.manager;
  }

  return new UploadManager(props.managerOptions);
}
