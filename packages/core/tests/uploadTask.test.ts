import { describe, expect, it } from 'vitest';

import { MemoryPersistenceAdapter } from '../src/persistence/MemoryPersistenceAdapter';
import { UploadTask } from '../src/UploadTask';
import type { FileMeta, PartDataProvider, PartSpec } from '../src/types';
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
