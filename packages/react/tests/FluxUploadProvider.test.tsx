import {
  MemoryPersistenceAdapter,
  UploadManager,
  type InitUploadInput,
  type SignPartInput,
  type TransportAdapter,
  type UploadState,
  type UploadManagerOptions,
  type UploadPartInput,
  type UploadedPart,
} from '@flux-upload/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';

import { FluxUploadProvider } from '../src/FluxUploadProvider.js';
import { useFluxUpload } from '../src/hooks/useFluxUpload.js';
import { FILE_MISMATCH_CODE } from '../src/types.js';

class FakeTransportAdapter implements TransportAdapter {
  private sequence = 0;
  private readonly uploadedPartsByUploadId = new Map<string, Set<number>>();

  public constructor(private readonly uploadDelayMs = 0) {}

  public seedUploadedParts(uploadId: string, partNumbers: number[]): void {
    const set = this.uploadedPartsByUploadId.get(uploadId) ?? new Set<number>();
    for (const partNumber of partNumbers) {
      set.add(partNumber);
    }
    this.uploadedPartsByUploadId.set(uploadId, set);
  }

  public async initUpload(_input: InitUploadInput): Promise<{ uploadId: string }> {
    this.sequence += 1;
    const uploadId = `upload-${this.sequence}`;
    this.uploadedPartsByUploadId.set(uploadId, new Set<number>());
    return { uploadId };
  }

  public async getUploadedParts(input: { uploadId: string }): Promise<number[]> {
    const uploadedParts = this.uploadedPartsByUploadId.get(input.uploadId) ?? new Set<number>();
    return [...uploadedParts];
  }

  public async signPart(input: SignPartInput): Promise<{ url: string; expiresAt?: string }> {
    return { url: `https://example.test/${input.uploadId}/part/${input.partNumber}` };
  }

  public async uploadPart(input: UploadPartInput): Promise<{ etag?: string }> {
    await input.getPartData();
    if (this.uploadDelayMs > 0) {
      await sleep(this.uploadDelayMs);
    }
    const uploadId = input.url.split('/')[3];

    if (!uploadId) {
      throw new Error('missing upload id in URL');
    }

    const uploadedParts = this.uploadedPartsByUploadId.get(uploadId) ?? new Set<number>();
    uploadedParts.add(input.partNumber);
    this.uploadedPartsByUploadId.set(uploadId, uploadedParts);

    return { etag: `etag-${input.partNumber}` };
  }

  public async completeUpload(_input: {
    uploadId: string;
    parts?: UploadedPart[];
  }): Promise<void> {
    return;
  }

  public async abortUpload(_input: { uploadId: string }): Promise<void> {
    return;
  }
}

describe('FluxUploadProvider', () => {
  it('provides manager and actions through hooks', () => {
    const manager = createManager();

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    expect(result.current.manager).toBe(manager);
    expect(typeof result.current.actions.createUploadFromFile).toBe('function');
    expect(typeof result.current.actions.bindFile).toBe('function');
    expect(typeof result.current.actions.start).toBe('function');
    expect(typeof result.current.actions.pause).toBe('function');
    expect(typeof result.current.actions.resume).toBe('function');
    expect(typeof result.current.actions.cancel).toBe('function');
  });

  it('creates an upload from File and syncs store snapshot', async () => {
    const manager = createManager();

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    const file = new File([new Uint8Array(20)], 'avatar.png', {
      type: 'image/png',
      lastModified: 100,
    });

    let localId = '';
    await act(async () => {
      const created = await result.current.actions.createUploadFromFile(file, { chunkSize: 5 });
      localId = created.localId;
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]).toBeDefined();
    });

    expect(result.current.uploadsById[localId]?.fileMeta.name).toBe('avatar.png');
    expect(result.current.uploadsById[localId]?.status).toBe('idle');
  });

  it('throws FILE_MISMATCH when rebinding a different File', async () => {
    const manager = createManager();

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    const originalFile = new File([new Uint8Array(20)], 'report.pdf', {
      type: 'application/pdf',
      lastModified: 123,
    });

    const mismatchFile = new File([new Uint8Array(20)], 'other.pdf', {
      type: 'application/pdf',
      lastModified: 123,
    });

    let localId = '';
    await act(async () => {
      const created = await result.current.actions.createUploadFromFile(originalFile, { chunkSize: 5 });
      localId = created.localId;
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]).toBeDefined();
    });

    expect(() => {
      result.current.actions.bindFile(localId, mismatchFile);
    }).toThrowError(
      expect.objectContaining({
        code: FILE_MISMATCH_CODE,
      }),
    );
  });

  it('updates store when manager emits upload lifecycle events', async () => {
    const manager = createManager();

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    const file = new File([new Uint8Array(24)], 'chunked.bin', {
      type: 'application/octet-stream',
      lastModified: 999,
    });

    let localId = '';
    await act(async () => {
      const created = await result.current.actions.createUploadFromFile(file, { chunkSize: 6 });
      localId = created.localId;
    });

    await act(async () => {
      await result.current.actions.start(localId);
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]?.status).toBe('completed');
    });

    expect(result.current.uploadsById[localId]?.bytesConfirmed).toBe(file.size);
  });

  it('restores persisted uploads as unbound and requiring reconnect', async () => {
    const transport = new FakeTransportAdapter();
    const persistence = new MemoryPersistenceAdapter();
    const state: UploadState = {
      localId: 'persisted-1',
      uploadId: 'upload-persisted-1',
      status: 'paused',
      fileMeta: {
        localId: 'persisted-1',
        name: 'persisted.dat',
        size: 50,
        type: 'application/octet-stream',
        lastModified: 123,
      },
      chunkSize: 10,
      totalParts: 5,
      uploadedParts: [1, 2],
      partEtags: {
        1: 'etag-1',
        2: 'etag-2',
      },
      bytesConfirmed: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    transport.seedUploadedParts(state.uploadId as string, [1, 2, 3]);
    await persistence.save(state);

    const manager = createManager({
      transportAdapter: transport,
      persistenceAdapter: persistence,
    });

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    await waitFor(() => {
      expect(result.current.uploadsById[state.localId]).toBeDefined();
    });

    const restored = result.current.uploadsById[state.localId];
    expect(restored?.runtime.isBound).toBe(false);
    expect(restored?.runtime.needsReconnect).toBe(true);
    expect(restored?.uploadedParts).toEqual([1, 2, 3]);
  });

  it('pauses running uploads automatically when browser goes offline', async () => {
    const manager = createManager({
      transportAdapter: new FakeTransportAdapter(40),
      defaultChunkSize: 5,
      defaultConcurrency: 1,
    });

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    const file = new File([new Uint8Array(120)], 'offline.bin', {
      type: 'application/octet-stream',
      lastModified: 444,
    });

    let localId = '';
    await act(async () => {
      const created = await result.current.actions.createUploadFromFile(file, { chunkSize: 5 });
      localId = created.localId;
    });

    let startPromise: Promise<void> | undefined;
    await act(async () => {
      startPromise = result.current.actions.start(localId);
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]?.status).toBe('running');
    });

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]?.status).toBe('paused');
      expect(result.current.uploadsById[localId]?.lastError?.code).toBe('OFFLINE');
    });

    if (startPromise) {
      await act(async () => {
        await startPromise;
      });
    }
  });

  it('pauses running uploads on pagehide with PAGE_UNLOAD reason', async () => {
    const manager = createManager({
      transportAdapter: new FakeTransportAdapter(40),
      defaultChunkSize: 5,
      defaultConcurrency: 1,
    });

    const { result } = renderHook(() => useFluxUpload(), {
      wrapper: createWrapper(manager),
    });

    const file = new File([new Uint8Array(120)], 'reload.bin', {
      type: 'application/octet-stream',
      lastModified: 555,
    });

    let localId = '';
    await act(async () => {
      const created = await result.current.actions.createUploadFromFile(file, { chunkSize: 5 });
      localId = created.localId;
    });

    let startPromise: Promise<void> | undefined;
    await act(async () => {
      startPromise = result.current.actions.start(localId);
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]?.status).toBe('running');
    });

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(() => {
      expect(result.current.uploadsById[localId]?.status).toBe('paused');
      expect(result.current.uploadsById[localId]?.lastError?.code).toBe('PAGE_UNLOAD');
    });

    if (startPromise) {
      await act(async () => {
        await startPromise;
      });
    }
  });
});

function createManager(overrides: Partial<UploadManagerOptions> = {}): UploadManager {
  const options: UploadManagerOptions = {
    transportAdapter: overrides.transportAdapter ?? new FakeTransportAdapter(),
    persistenceAdapter: overrides.persistenceAdapter ?? new MemoryPersistenceAdapter(),
    defaultChunkSize: overrides.defaultChunkSize ?? 5,
    defaultConcurrency: overrides.defaultConcurrency ?? 2,
    defaultRetry: overrides.defaultRetry,
  };

  return new UploadManager(options);
}

function createWrapper(manager: UploadManager): (props: PropsWithChildren) => JSX.Element {
  return function Wrapper(props: PropsWithChildren): JSX.Element {
    return <FluxUploadProvider manager={manager}>{props.children}</FluxUploadProvider>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
