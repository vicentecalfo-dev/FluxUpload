'use client';

import { UploadManager } from '@flux-upload/core';

import { HttpTransportAdapter } from './HttpTransportAdapter';
import { IndexedDBPersistenceAdapter } from './IndexedDBPersistenceAdapter';

declare global {
  // eslint-disable-next-line no-var
  var __fluxUploadDemoManager: UploadManager | undefined;
}

export function getDemoUploadManager(): UploadManager {
  if (typeof window === 'undefined') {
    throw new Error('Upload manager must be created in a browser environment.');
  }

  if (!globalThis.__fluxUploadDemoManager) {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    const authToken = process.env.NEXT_PUBLIC_AUTH_TOKEN;

    if (!apiBaseUrl) {
      throw new Error('NEXT_PUBLIC_API_BASE_URL is required.');
    }

    if (!authToken) {
      throw new Error('NEXT_PUBLIC_AUTH_TOKEN is required.');
    }

    globalThis.__fluxUploadDemoManager = new UploadManager({
      transportAdapter: new HttpTransportAdapter({
        apiBaseUrl,
        authToken,
      }),
      persistenceAdapter: new IndexedDBPersistenceAdapter(),
      // S3-compatible multipart requires >= 5 MiB for all parts except the last.
      // Using 5 MiB gives the most frequent confirmed-progress updates while staying valid.
      defaultChunkSize: 1 * 1024 * 1024,
      defaultConcurrency: 3,
      defaultRetry: {
        maxRetries: 3,
        baseDelayMs: 200,
        maxDelayMs: 4000,
      },
    });
  }

  return globalThis.__fluxUploadDemoManager;
}
