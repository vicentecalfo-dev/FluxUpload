import type { UploadState } from '../types.js';

export interface PersistenceAdapter {
  save(state: UploadState): Promise<void>;
  load(localId: string): Promise<UploadState | null>;
  list(): Promise<UploadState[]>;
  remove(localId: string): Promise<void>;
}
