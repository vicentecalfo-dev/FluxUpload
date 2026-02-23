import type { PersistenceAdapter } from './PersistenceAdapter.js';
import { cloneUploadState, type UploadState } from '../types.js';

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly stateMap = new Map<string, UploadState>();

  public async save(state: UploadState): Promise<void> {
    this.stateMap.set(state.localId, cloneUploadState(state));
  }

  public async load(localId: string): Promise<UploadState | null> {
    const state = this.stateMap.get(localId);
    return state ? cloneUploadState(state) : null;
  }

  public async list(): Promise<UploadState[]> {
    return [...this.stateMap.values()].map((state) => cloneUploadState(state));
  }

  public async remove(localId: string): Promise<void> {
    this.stateMap.delete(localId);
  }
}
