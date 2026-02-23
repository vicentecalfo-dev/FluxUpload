import {
  MemoryPersistenceAdapter,
  UploadManager,
  type InitUploadInput,
  type SignPartInput,
  type TransportAdapter,
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
});

function createManager(): UploadManager {
  const options: UploadManagerOptions = {
    transportAdapter: new FakeTransportAdapter(),
    persistenceAdapter: new MemoryPersistenceAdapter(),
    defaultChunkSize: 5,
    defaultConcurrency: 2,
  };

  return new UploadManager(options);
}

function createWrapper(manager: UploadManager): (props: PropsWithChildren) => JSX.Element {
  return function Wrapper(props: PropsWithChildren): JSX.Element {
    return <FluxUploadProvider manager={manager}>{props.children}</FluxUploadProvider>;
  };
}
