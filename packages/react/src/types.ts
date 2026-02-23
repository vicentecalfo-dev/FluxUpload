import type {
  CreateUploadOverrides,
  UploadManager,
  UploadManagerOptions,
  UploadState as CoreUploadState,
} from '@flux-upload/core';
import type { ReactNode } from 'react';

import type { FluxUploadStore } from './createFluxUploadStore.js';

export type {
  UploadStatus,
  UploadProgress,
  UploadErrorInfo,
  FileMeta,
  PartSpec,
  PartData,
  PartDataProvider,
} from '@flux-upload/core';

export const FILE_MISMATCH_CODE = 'FILE_MISMATCH';

export class FileMismatchError extends Error {
  public readonly code = FILE_MISMATCH_CODE;

  public constructor(localId: string, message: string) {
    super(`Upload '${localId}' cannot be rebound: ${message}`);
    this.name = 'FileMismatchError';
  }
}

export interface CreateUploadFromFileOptions extends CreateUploadOverrides {
  autoStart?: boolean;
}

export interface UploadRuntimeState {
  isBound: boolean;
  needsReconnect: boolean;
}

export type UploadState = CoreUploadState & {
  runtime: UploadRuntimeState;
};

export interface UploadBoundActions {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  bindFile: (file: File) => void;
}

export interface FluxUploadActions {
  createUploadFromFile: (
    file: File,
    options?: CreateUploadFromFileOptions,
  ) => Promise<{ localId: string }>;
  bindFile: (localId: string, file: File) => void;
  start: (localId: string) => Promise<void>;
  pause: (localId: string) => Promise<void>;
  resume: (localId: string) => Promise<void>;
  cancel: (localId: string) => Promise<void>;
  list: () => UploadState[];
  refreshFromPersistence: () => Promise<void>;
}

export interface FluxUploadContextValue {
  manager: UploadManager;
  store: FluxUploadStore;
  actions: FluxUploadActions;
}

interface FluxUploadProviderBaseProps {
  children: ReactNode;
  store?: FluxUploadStore;
  autoPauseOnOffline?: boolean;
  autoResumeOnReconnect?: boolean;
}

export interface FluxUploadProviderWithManagerProps extends FluxUploadProviderBaseProps {
  manager: UploadManager;
  managerOptions?: never;
}

export interface FluxUploadProviderWithOptionsProps extends FluxUploadProviderBaseProps {
  manager?: never;
  managerOptions: UploadManagerOptions;
}

export type FluxUploadProviderProps =
  | FluxUploadProviderWithManagerProps
  | FluxUploadProviderWithOptionsProps;
