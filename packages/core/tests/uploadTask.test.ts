import { describe, expect, it } from 'vitest';

import { UploadSessionExpiredError } from '../src/errors';
import { MemoryPersistenceAdapter } from '../src/persistence/MemoryPersistenceAdapter';
import { UploadTask } from '../src/UploadTask';
import type { FileMeta, PartDataProvider, PartSpec } from '../src/types';
import type { PersistenceAdapter } from '../src/persistence/PersistenceAdapter';
import type {
  InitUploadInput,
  SignPartInput,
  TransportAdapter,
  UploadPartInput,
  UploadedPart,
} from '../src/transport/TransportAdapter';

class FakeTransportAdapter implements TransportAdapter {
  public readonly uploadedParts = new Set<number>();
  public readonly uploadAttempts = new Map<number, number>();
  public readonly uploadPartCalls: number[] = [];

  public initCalls = 0;
  public getUploadedPartsCalls = 0;
  public completeCalls = 0;
  public abortCalls = 0;

  public activeUploads = 0;
  public maxParallel = 0;

  private readonly transientFailures = new Map<number, number>();

  public constructor(private readonly uploadDelayMs = 15) {}

  public setTransientFailures(partNumber: number, failureCount: number): void {
    this.transientFailures.set(partNumber, failureCount);
  }

  public seedUploadedParts(partNumbers: number[]): void {
    for (const partNumber of partNumbers) {
      this.uploadedParts.add(partNumber);
    }
  }

  public async initUpload(_input: InitUploadInput): Promise<{ uploadId: string }> {
    this.initCalls += 1;
    return { uploadId: 'upload-1' };
  }

  public async getUploadedParts(_input: { uploadId: string }): Promise<number[]> {
    this.getUploadedPartsCalls += 1;
    return [...this.uploadedParts];
  }

  public async signPart(input: SignPartInput): Promise<{ url: string; expiresAt?: string }> {
    return {
      url: `https://example.test/upload/${input.partNumber}`,
    };
  }

  public async uploadPart(input: UploadPartInput): Promise<{ etag?: string }> {
    this.uploadPartCalls.push(input.partNumber);
    this.activeUploads += 1;
    this.maxParallel = Math.max(this.maxParallel, this.activeUploads);

    const attempts = (this.uploadAttempts.get(input.partNumber) ?? 0) + 1;
    this.uploadAttempts.set(input.partNumber, attempts);

    try {
      const chunk = await input.getPartData();
      expect(chunk).toBeTruthy();
      await sleep(this.uploadDelayMs);

      const pendingFailures = this.transientFailures.get(input.partNumber) ?? 0;
      if (pendingFailures > 0) {
        this.transientFailures.set(input.partNumber, pendingFailures - 1);
        throw new Error('transient upload error');
      }

      this.uploadedParts.add(input.partNumber);
      return { etag: `etag-${input.partNumber}-${attempts}` };
    } finally {
      this.activeUploads -= 1;
    }
  }

  public async completeUpload(_input: {
    uploadId: string;
    parts?: UploadedPart[];
  }): Promise<void> {
    this.completeCalls += 1;
  }

  public async abortUpload(_input: { uploadId: string }): Promise<void> {
    this.abortCalls += 1;
  }
}

class RecordingPersistenceAdapter implements PersistenceAdapter {
  public readonly saves: Array<{ uploadId?: string; uploadedParts: number[]; status: string }> = [];
  private latestState = new Map<string, ReturnType<UploadTask['getState']>>();

  public async save(state: ReturnType<UploadTask['getState']>): Promise<void> {
    this.latestState.set(state.localId, state);
    this.saves.push({
      uploadId: state.uploadId,
      uploadedParts: [...state.uploadedParts],
      status: state.status,
    });
  }

  public async load(localId: string): Promise<ReturnType<UploadTask['getState']> | null> {
    return this.latestState.get(localId) ?? null;
  }

  public async list(): Promise<Array<ReturnType<UploadTask['getState']>>> {
    return [...this.latestState.values()];
  }

  public async remove(localId: string): Promise<void> {
    this.latestState.delete(localId);
  }
}

describe('UploadTask', () => {
  it('uploads all parts with retry and respects concurrency', async () => {
    const fileMeta: FileMeta = {
      name: 'video.mp4',
      size: 100,
      type: 'video/mp4',
    };

    const transport = new FakeTransportAdapter(20);
    transport.setTransientFailures(3, 1);

    const task = new UploadTask({
      localId: 'local-1',
      fileMeta,
      chunkSize: 10,
      concurrency: 3,
      retry: {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
      },
      transportAdapter: transport,
      persistenceAdapter: new MemoryPersistenceAdapter(),
      partDataProvider: createPartDataProvider(),
    });

    await task.start();

    const state = task.getState();

    expect(state.status).toBe('completed');
    expect(state.uploadedParts).toHaveLength(10);
    expect(state.bytesConfirmed).toBe(100);
    expect(transport.maxParallel).toBeLessThanOrEqual(3);
    expect(transport.maxParallel).toBeGreaterThan(1);
    expect(transport.uploadAttempts.get(3)).toBe(2);
    expect(transport.completeCalls).toBe(1);
  });

  it('persists upload session and part confirmations while progressing', async () => {
    const transport = new FakeTransportAdapter(5);
    const persistence = new RecordingPersistenceAdapter();

    const task = new UploadTask({
      localId: 'local-persist',
      fileMeta: {
        name: 'persist.bin',
        size: 30,
      },
      chunkSize: 10,
      concurrency: 1,
      transportAdapter: transport,
      persistenceAdapter: persistence,
      partDataProvider: createPartDataProvider(),
    });

    await task.start();

    const anyWithUploadId = persistence.saves.some((state) => state.uploadId === 'upload-1');
    const anyWithAtLeastOnePart = persistence.saves.some(
      (state) => state.uploadedParts.length >= 1,
    );
    const latest = await persistence.load('local-persist');

    expect(anyWithUploadId).toBe(true);
    expect(anyWithAtLeastOnePart).toBe(true);
    expect(latest?.status).toBe('completed');
    expect(latest?.uploadedParts).toEqual([1, 2, 3]);
  });

  it('marks upload as expired when backend returns session expiration', async () => {
    const transport = new FakeTransportAdapter(1);

    transport.getUploadedParts = async () => {
      throw new UploadSessionExpiredError("Upload session 'upload-1' has expired.");
    };

    const task = new UploadTask({
      localId: 'local-expired',
      fileMeta: {
        name: 'stale.bin',
        size: 10,
      },
      chunkSize: 5,
      transportAdapter: transport,
      persistenceAdapter: new MemoryPersistenceAdapter(),
      partDataProvider: createPartDataProvider(),
    });

    await task.start();

    const state = task.getState();
    expect(state.status).toBe('expired');
    expect(state.lastError?.code).toBe('UPLOAD_SESSION_EXPIRED');
  });

  it('pauses and resumes without losing uploaded parts', async () => {
    const fileMeta: FileMeta = {
      name: 'archive.zip',
      size: 200,
      type: 'application/zip',
    };

    const transport = new FakeTransportAdapter(30);
    const persistence = new MemoryPersistenceAdapter();

    const task = new UploadTask({
      localId: 'local-2',
      fileMeta,
      chunkSize: 10,
      concurrency: 1,
      retry: {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
      },
      transportAdapter: transport,
      persistenceAdapter: persistence,
      partDataProvider: createPartDataProvider(),
    });

    const startPromise = task.start();

    await waitFor(() => task.getState().uploadedParts.length > 0, 2_000);
    await task.pause();
    await startPromise;

    const pausedState = task.getState();
    const pausedParts = [...pausedState.uploadedParts];

    expect(pausedState.status).toBe('paused');
    expect(pausedParts.length).toBeGreaterThan(0);
    expect(pausedParts.length).toBeLessThan(pausedState.totalParts);

    await task.resume();

    const completedState = task.getState();

    expect(completedState.status).toBe('completed');
    expect(completedState.uploadedParts).toHaveLength(completedState.totalParts);

    for (const partNumber of pausedParts) {
      expect(completedState.uploadedParts).toContain(partNumber);
    }
  });

  it('reconciles remote parts and resumes missing etags/parts only', async () => {
    const transport = new FakeTransportAdapter(5);
    transport.seedUploadedParts([1, 2]);

    const task = new UploadTask({
      localId: 'local-3',
      fileMeta: {
        name: 'reconcile.bin',
        size: 30,
        type: 'application/octet-stream',
      },
      chunkSize: 10,
      concurrency: 2,
      retry: {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
      },
      transportAdapter: transport,
      persistenceAdapter: new MemoryPersistenceAdapter(),
      partDataProvider: createPartDataProvider(),
      initialState: {
        localId: 'local-3',
        uploadId: 'upload-1',
        status: 'paused',
        fileMeta: {
          name: 'reconcile.bin',
          size: 30,
          type: 'application/octet-stream',
          localId: 'local-3',
        },
        chunkSize: 10,
        totalParts: 3,
        uploadedParts: [1],
        partEtags: {
          1: 'etag-1',
        },
        bytesConfirmed: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    await task.start();

    const state = task.getState();

    expect(state.status).toBe('completed');
    expect(state.uploadedParts).toEqual([1, 2, 3]);
    expect(state.bytesConfirmed).toBe(30);
    expect(transport.getUploadedPartsCalls).toBe(1);
    expect(transport.uploadPartCalls).not.toContain(1);
    expect(transport.uploadPartCalls).toContain(2);
    expect(transport.uploadPartCalls).toContain(3);
  });
});

function createPartDataProvider(): PartDataProvider {
  return async (part: PartSpec) => {
    const chunkSize = part.endByteExclusive - part.startByte;
    return new Uint8Array(chunkSize);
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (condition()) {
      return;
    }

    await sleep(10);
  }

  throw new Error('Timed out waiting for condition.');
}
