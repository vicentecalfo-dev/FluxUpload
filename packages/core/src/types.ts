import type { PersistenceAdapter } from './persistence/PersistenceAdapter.js';
import type { TransportAdapter } from './transport/TransportAdapter.js';
import type { RetryOptions } from './retryPolicy.js';

export type UploadStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'canceled'
  | 'expired';

export interface FileMeta {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
  localId?: string;
}

export interface PartSpec {
  partNumber: number;
  startByte: number;
  endByteExclusive: number;
}

export interface UploadProgress {
  localId: string;
  bytesConfirmed: number;
  totalBytes: number;
  pct: number;
}

export interface UploadErrorInfo {
  name: string;
  message: string;
  code?: string;
  fatal?: boolean;
}

export interface PauseUploadOptions {
  message?: string;
  lastError?: UploadErrorInfo;
}

export interface UploadState {
  localId: string;
  uploadId?: string;
  status: UploadStatus;
  fileMeta: FileMeta;
  chunkSize: number;
  totalParts: number;
  uploadedParts: number[];
  partEtags?: Record<number, string | undefined>;
  bytesConfirmed: number;
  createdAt: string;
  updatedAt: string;
  lastError?: UploadErrorInfo;
}

export type PartData = Blob | Uint8Array;
export type PartDataProvider = (partSpec: PartSpec) => Promise<PartData>;

export interface UploadTaskOptions {
  localId: string;
  fileMeta: FileMeta;
  chunkSize: number;
  concurrency?: number;
  retry?: RetryOptions;
  transportAdapter: TransportAdapter;
  persistenceAdapter: PersistenceAdapter;
  partDataProvider?: PartDataProvider;
  initialState?: UploadState;
}

export interface CreateUploadOverrides {
  localId?: string;
  chunkSize?: number;
  concurrency?: number;
  retry?: RetryOptions;
}

export interface UploadManagerOptions {
  transportAdapter: TransportAdapter;
  persistenceAdapter?: PersistenceAdapter;
  defaultChunkSize?: number;
  defaultConcurrency?: number;
  defaultRetry?: RetryOptions;
}

export function cloneUploadState(state: UploadState): UploadState {
  return {
    ...state,
    fileMeta: {
      ...state.fileMeta,
    },
    uploadedParts: [...state.uploadedParts],
    partEtags: state.partEtags ? { ...state.partEtags } : undefined,
    lastError: state.lastError ? { ...state.lastError } : undefined,
  };
}

export function normalizePartNumbers(partNumbers: number[], totalParts: number): number[] {
  const unique = new Set<number>();

  for (const partNumber of partNumbers) {
    if (!Number.isInteger(partNumber)) {
      continue;
    }

    if (partNumber < 1 || partNumber > totalParts) {
      continue;
    }

    unique.add(partNumber);
  }

  return [...unique].sort((a, b) => a - b);
}
