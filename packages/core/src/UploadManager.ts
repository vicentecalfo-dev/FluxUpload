import { EventEmitter, type UploadEvents } from './events.js';
import { MemoryPersistenceAdapter } from './persistence/MemoryPersistenceAdapter.js';
import { UploadTask } from './UploadTask.js';
import { UploadNotFoundError } from './errors.js';
import type {
  CreateUploadOverrides,
  FileMeta,
  PauseUploadOptions,
  PartDataProvider,
  UploadManagerOptions,
  UploadState,
  UploadTaskOptions,
} from './types.js';

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 3;

export class UploadManager {
  private readonly tasks = new Map<string, UploadTask>();
  private readonly partDataProviders = new Map<string, PartDataProvider>();
  private readonly emitter = new EventEmitter<UploadEvents>();

  private readonly defaultChunkSize: number;
  private readonly defaultConcurrency: number;

  public readonly persistenceAdapter;

  public constructor(private readonly options: UploadManagerOptions) {
    this.defaultChunkSize = options.defaultChunkSize ?? DEFAULT_CHUNK_SIZE;
    this.defaultConcurrency = options.defaultConcurrency ?? DEFAULT_CONCURRENCY;
    this.persistenceAdapter = options.persistenceAdapter ?? new MemoryPersistenceAdapter();
  }

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  public addUpload(taskOptions: UploadTaskOptions): UploadTask {
    const task = new UploadTask(taskOptions);
    this.registerTask(task);
    return task;
  }

  public createUpload(
    fileMeta: FileMeta,
    partDataProvider: PartDataProvider,
    overrides: CreateUploadOverrides = {},
  ): string {
    const localId = overrides.localId ?? fileMeta.localId ?? this.generateLocalId();

    const task = this.addUpload({
      localId,
      fileMeta: { ...fileMeta, localId },
      chunkSize: overrides.chunkSize ?? this.defaultChunkSize,
      concurrency: overrides.concurrency ?? this.defaultConcurrency,
      retry: overrides.retry ?? this.options.defaultRetry,
      partDataProvider,
      transportAdapter: this.options.transportAdapter,
      persistenceAdapter: this.persistenceAdapter,
    });

    this.partDataProviders.set(localId, partDataProvider);
    void task.persistState().catch((error: unknown) => {
      this.emitter.emit('error', { localId, error });
    });

    return localId;
  }

  public async bindPartDataProvider(localId: string, partDataProvider: PartDataProvider): Promise<void> {
    const task = await this.ensureTask(localId);
    task.setPartDataProvider(partDataProvider);
    this.partDataProviders.set(localId, partDataProvider);
  }

  public async bindDataProvider(localId: string, partDataProvider: PartDataProvider): Promise<void> {
    await this.bindPartDataProvider(localId, partDataProvider);
  }

  public hasPartDataProvider(localId: string): boolean {
    return this.partDataProviders.has(localId);
  }

  public async start(localId: string): Promise<void> {
    const task = await this.ensureTask(localId);
    await task.start();
  }

  public async pause(localId: string, options?: PauseUploadOptions): Promise<void> {
    const task = await this.ensureTask(localId);
    await task.pause(options);
  }

  public async resume(localId: string): Promise<void> {
    const task = await this.ensureTask(localId);
    await task.resume();
  }

  public async cancel(localId: string): Promise<void> {
    const task = await this.ensureTask(localId);
    await task.cancel();
  }

  public async listStates(): Promise<UploadState[]> {
    return this.persistenceAdapter.list();
  }

  public async reconcile(localId: string): Promise<UploadState> {
    const task = await this.ensureTask(localId);
    await task.reconcileWithRemote();
    return task.getState();
  }

  public async rehydratePersistedUploads(options?: {
    pauseRunningOnBoot?: boolean;
    pauseOptions?: PauseUploadOptions;
  }): Promise<UploadState[]> {
    const pauseRunningOnBoot = options?.pauseRunningOnBoot ?? true;
    const states = await this.restorePersistedUploads();

    for (const state of states) {
      const task = await this.ensureTask(state.localId);
      const current = task.getState();

      if (pauseRunningOnBoot && current.status === 'running') {
        await task.pause(options?.pauseOptions);
      }

      await task.reconcileWithRemote();
    }

    return this.persistenceAdapter.list();
  }

  public async restorePersistedUploads(): Promise<UploadState[]> {
    const states = await this.persistenceAdapter.list();

    for (const state of states) {
      if (this.tasks.has(state.localId)) {
        continue;
      }

      const provider = this.partDataProviders.get(state.localId);

      this.addUpload({
        localId: state.localId,
        fileMeta: state.fileMeta,
        chunkSize: state.chunkSize,
        concurrency: this.defaultConcurrency,
        retry: this.options.defaultRetry,
        transportAdapter: this.options.transportAdapter,
        persistenceAdapter: this.persistenceAdapter,
        partDataProvider: provider,
        initialState: state,
      });
    }

    return states;
  }

  private registerTask(task: UploadTask): void {
    const localId = task.getState().localId;
    this.tasks.set(localId, task);

    task.on('status', (payload) => this.emitter.emit('status', payload));
    task.on('progress', (payload) => this.emitter.emit('progress', payload));
    task.on('error', (payload) => this.emitter.emit('error', payload));
    task.on('completed', (payload) => this.emitter.emit('completed', payload));
  }

  private async ensureTask(localId: string): Promise<UploadTask> {
    const cachedTask = this.tasks.get(localId);
    if (cachedTask) {
      return cachedTask;
    }

    const state = await this.persistenceAdapter.load(localId);
    if (!state) {
      throw new UploadNotFoundError(localId);
    }

    const task = this.addUpload({
      localId: state.localId,
      fileMeta: state.fileMeta,
      chunkSize: state.chunkSize,
      concurrency: this.defaultConcurrency,
      retry: this.options.defaultRetry,
      transportAdapter: this.options.transportAdapter,
      persistenceAdapter: this.persistenceAdapter,
      partDataProvider: this.partDataProviders.get(state.localId),
      initialState: state,
    });

    return task;
  }

  private generateLocalId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `flux-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
