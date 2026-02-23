import { planParts } from './chunkPlanner.js';
import { EventEmitter, type UploadEvents } from './events.js';
import {
  AbortError,
  InvalidUploadStateError,
  MissingPartDataProviderError,
  PersistenceError,
  isAbortError,
  toUploadErrorInfo,
} from './errors.js';
import { retry } from './retryPolicy.js';
import {
  cloneUploadState,
  normalizePartNumbers,
  type PartDataProvider,
  type PartSpec,
  type UploadProgress,
  type UploadState,
  type UploadTaskOptions,
} from './types.js';
import type { UploadedPart } from './transport/TransportAdapter.js';

const DEFAULT_CONCURRENCY = 3;

export class UploadTask {
  private readonly emitter = new EventEmitter<UploadEvents>();
  private readonly parts: PartSpec[];
  private readonly concurrency: number;
  private readonly retryOptions;

  private partDataProvider?: PartDataProvider;
  private runPromise: Promise<void> | null = null;
  private runController: AbortController | null = null;
  private pauseRequested = false;
  private cancelRequested = false;

  private state: UploadState;

  public constructor(private readonly options: UploadTaskOptions) {
    if (options.fileMeta.size < 0 || !Number.isFinite(options.fileMeta.size)) {
      throw new InvalidUploadStateError('fileMeta.size must be a non-negative finite number.');
    }

    if (options.chunkSize <= 0 || !Number.isFinite(options.chunkSize)) {
      throw new InvalidUploadStateError('chunkSize must be a positive finite number.');
    }

    this.partDataProvider = options.partDataProvider;
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
    this.retryOptions = options.retry;
    this.parts = planParts(options.fileMeta.size, options.chunkSize);

    this.state = this.buildInitialState(options);
  }

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  public setPartDataProvider(provider: PartDataProvider): void {
    this.partDataProvider = provider;
  }

  public getState(): UploadState {
    return cloneUploadState(this.state);
  }

  public async persistState(): Promise<void> {
    await this.persist();
  }

  public async start(): Promise<void> {
    if (this.state.status === 'completed' || this.state.status === 'canceled') {
      return;
    }

    if (!this.partDataProvider) {
      throw new MissingPartDataProviderError(this.state.localId);
    }

    if (this.runPromise) {
      return this.runPromise;
    }

    this.pauseRequested = false;
    this.cancelRequested = false;

    this.runPromise = this.runInternal();

    try {
      await this.runPromise;
    } finally {
      this.runPromise = null;
    }
  }

  public async pause(): Promise<void> {
    if (this.state.status === 'completed' || this.state.status === 'canceled') {
      return;
    }

    this.pauseRequested = true;
    this.runController?.abort();

    if (!this.runPromise) {
      await this.updateStatus('paused', 'Upload paused');
      return;
    }

    await this.runPromise.catch(() => undefined);
  }

  public async resume(): Promise<void> {
    await this.start();
  }

  public async cancel(): Promise<void> {
    if (this.state.status === 'completed' || this.state.status === 'canceled') {
      return;
    }

    this.cancelRequested = true;
    this.pauseRequested = false;
    this.runController?.abort();

    if (this.runPromise) {
      await this.runPromise.catch(() => undefined);
    }

    if (this.getStatus() === 'completed') {
      return;
    }

    await this.tryAbortRemoteUpload();
    await this.updateStatus('canceled', 'Upload canceled');
  }

  private async runInternal(): Promise<void> {
    this.runController = new AbortController();
    const signal = this.runController.signal;

    try {
      await this.updateStatus('running', 'Upload started');

      if (!this.state.uploadId) {
        const initResult = await this.withRetry(() =>
          this.options.transportAdapter.initUpload({
            localId: this.state.localId,
            fileMeta: this.state.fileMeta,
            chunkSize: this.state.chunkSize,
          }),
        signal,
        );

        this.state.uploadId = initResult.uploadId;
        await this.persist();
      }

      const uploadId = this.state.uploadId;
      if (!uploadId) {
        throw new InvalidUploadStateError('uploadId is required after initUpload.');
      }

      const remoteUploadedParts = await this.withRetry(
        () => this.options.transportAdapter.getUploadedParts({ uploadId }),
        signal,
      );
      this.reconcileUploadedParts(remoteUploadedParts);
      await this.persist();
      this.emitProgress();

      const pendingParts = this.parts.filter(
        (part) => !this.state.uploadedParts.includes(part.partNumber),
      );

      if (pendingParts.length > 0) {
        await this.uploadPendingParts(uploadId, pendingParts, signal);
      }

      this.throwIfAborted(signal);

      const completedParts = this.getCompletedParts();
      const commitParts = this.options.transportAdapter.commitParts;
      if (commitParts) {
        await this.withRetry(
          () => commitParts({ uploadId, parts: completedParts }),
          signal,
        );
      }

      await this.withRetry(
        () => this.options.transportAdapter.completeUpload({ uploadId, parts: completedParts }),
        signal,
      );

      this.state.lastError = undefined;
      await this.updateStatus('completed', 'Upload completed');
      this.emitter.emit('completed', { localId: this.state.localId });
    } catch (error) {
      if (this.cancelRequested) {
        await this.tryAbortRemoteUpload();
        await this.updateStatus('canceled', 'Upload canceled');
        return;
      }

      if (isAbortError(error) && this.pauseRequested) {
        await this.updateStatus('paused', 'Upload paused');
        return;
      }

      if (isAbortError(error)) {
        await this.updateStatus('paused', 'Upload interrupted');
        return;
      }

      this.state.lastError = toUploadErrorInfo(error);
      await this.updateStatus('error', this.state.lastError.message);
      this.emitter.emit('error', { localId: this.state.localId, error });
      throw error;
    } finally {
      this.runController = null;
    }
  }

  private async uploadPendingParts(
    uploadId: string,
    pendingParts: PartSpec[],
    signal: AbortSignal,
  ): Promise<void> {
    let nextIndex = 0;
    const workerCount = Math.min(this.concurrency, pendingParts.length);

    const workers = Array.from({ length: workerCount }, async () => {
      for (;;) {
        this.throwIfAborted(signal);

        const part = pendingParts[nextIndex];
        nextIndex += 1;
        if (!part) {
          return;
        }

        try {
          await this.uploadSinglePart(uploadId, part, signal);
        } catch (error) {
          if (!isAbortError(error)) {
            this.runController?.abort();
          }
          throw error;
        }
      }
    });

    await Promise.all(workers);
  }

  private async uploadSinglePart(uploadId: string, part: PartSpec, signal: AbortSignal): Promise<void> {
    const uploadResult = await this.withRetry(async () => {
      this.throwIfAborted(signal);

      const signResult = await this.options.transportAdapter.signPart({
        uploadId,
        partNumber: part.partNumber,
      });

      this.throwIfAborted(signal);

      return this.options.transportAdapter.uploadPart({
        url: signResult.url,
        partNumber: part.partNumber,
        getPartData: async () => {
          this.throwIfAborted(signal);

          const provider = this.partDataProvider;
          if (!provider) {
            throw new MissingPartDataProviderError(this.state.localId);
          }

          return provider(part);
        },
      });
    }, signal);

    const currentParts = new Set(this.state.uploadedParts);
    currentParts.add(part.partNumber);
    this.state.uploadedParts = normalizePartNumbers([...currentParts], this.state.totalParts);

    if (!this.state.partEtags) {
      this.state.partEtags = {};
    }

    this.state.partEtags[part.partNumber] = uploadResult.etag;
    this.state.bytesConfirmed = Math.min(
      this.state.fileMeta.size,
      this.state.uploadedParts.length * this.state.chunkSize,
    );
    this.state.lastError = undefined;

    await this.persist();
    this.emitProgress();
  }

  private reconcileUploadedParts(remoteParts: number[]): void {
    const mergedParts = normalizePartNumbers(
      [...this.state.uploadedParts, ...remoteParts],
      this.state.totalParts,
    );
    this.state.uploadedParts = mergedParts;
    this.state.bytesConfirmed = Math.min(
      this.state.fileMeta.size,
      this.state.uploadedParts.length * this.state.chunkSize,
    );
  }

  private getCompletedParts(): UploadedPart[] {
    return this.state.uploadedParts.map((partNumber) => ({
      partNumber,
      etag: this.state.partEtags?.[partNumber],
    }));
  }

  private buildInitialState(options: UploadTaskOptions): UploadState {
    const now = new Date().toISOString();
    const baseState = options.initialState;

    const totalParts = this.parts.length;
    const uploadedParts = normalizePartNumbers(baseState?.uploadedParts ?? [], totalParts);

    return {
      localId: options.localId,
      uploadId: baseState?.uploadId,
      status: baseState?.status ?? 'idle',
      fileMeta: { ...options.fileMeta },
      chunkSize: options.chunkSize,
      totalParts,
      uploadedParts,
      partEtags: baseState?.partEtags ? { ...baseState.partEtags } : {},
      bytesConfirmed: Math.min(options.fileMeta.size, uploadedParts.length * options.chunkSize),
      createdAt: baseState?.createdAt ?? now,
      updatedAt: baseState?.updatedAt ?? now,
      lastError: baseState?.lastError ? { ...baseState.lastError } : undefined,
    };
  }

  private async persist(): Promise<void> {
    this.state.updatedAt = new Date().toISOString();

    try {
      await this.options.persistenceAdapter.save(this.getState());
    } catch (error) {
      throw new PersistenceError('Failed to persist upload state.', error);
    }
  }

  private getStatus(): UploadState['status'] {
    return this.state.status;
  }

  private async updateStatus(status: UploadState['status'], message?: string): Promise<void> {
    this.state.status = status;
    await this.persist();
    this.emitter.emit('status', {
      localId: this.state.localId,
      status,
      message,
    });

    if (status === 'running') {
      this.emitProgress();
    }
  }

  private emitProgress(): void {
    const totalBytes = this.state.fileMeta.size;
    const pct = totalBytes === 0 ? 100 : (this.state.bytesConfirmed / totalBytes) * 100;

    const payload: UploadProgress = {
      localId: this.state.localId,
      bytesConfirmed: this.state.bytesConfirmed,
      totalBytes,
      pct,
    };

    this.emitter.emit('progress', payload);
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new AbortError();
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return retry(fn, {
      ...this.retryOptions,
      signal,
    });
  }

  private async tryAbortRemoteUpload(): Promise<void> {
    if (!this.state.uploadId) {
      return;
    }

    try {
      await this.options.transportAdapter.abortUpload({ uploadId: this.state.uploadId });
    } catch (error) {
      this.emitter.emit('error', {
        localId: this.state.localId,
        error,
      });
    }
  }
}
