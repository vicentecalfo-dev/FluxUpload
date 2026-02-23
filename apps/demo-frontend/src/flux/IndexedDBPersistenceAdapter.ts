import type { PersistenceAdapter, UploadState } from '@flux-upload/core';

const DATABASE_NAME = 'flux_upload_demo';
const DATABASE_VERSION = 1;
const STORE_UPLOADS = 'uploads';

export class IndexedDBPersistenceAdapter implements PersistenceAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public async save(state: UploadState): Promise<void> {
    const db = await this.getDb();
    await withTransaction(db, 'readwrite', async (store) => {
      store.put(cloneUploadState(state));
    });
  }

  public async load(localId: string): Promise<UploadState | null> {
    const db = await this.getDb();
    const item = await withTransaction<UploadState | undefined>(db, 'readonly', (store) =>
      requestToPromise<UploadState | undefined>(store.get(localId)),
    );

    return item ? cloneUploadState(item) : null;
  }

  public async list(): Promise<UploadState[]> {
    const db = await this.getDb();
    const items = await withTransaction<UploadState[]>(db, 'readonly', (store) =>
      requestToPromise<UploadState[]>(store.getAll()),
    );

    return items.map((item) => cloneUploadState(item));
  }

  public async remove(localId: string): Promise<void> {
    const db = await this.getDb();
    await withTransaction(db, 'readwrite', async (store) => {
      store.delete(localId);
    });
  }

  private async getDb(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB is only available in the browser environment.');
    }

    if (!this.dbPromise) {
      this.dbPromise = openDatabase();
    }

    return this.dbPromise;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_UPLOADS)) {
        db.createObjectStore(STORE_UPLOADS, {
          keyPath: 'localId',
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB database.'));
    };
  });
}

async function withTransaction<TResult>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<TResult> | TResult,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const transaction = db.transaction(STORE_UPLOADS, mode);
    const store = transaction.objectStore(STORE_UPLOADS);

    const resultPromise = Promise.resolve(fn(store));

    transaction.oncomplete = async () => {
      try {
        resolve(await resultPromise);
      } catch (error) {
        reject(error);
      }
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed.'));
    };
  });
}

function cloneUploadState(state: UploadState): UploadState {
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
