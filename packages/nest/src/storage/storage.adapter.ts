export interface StorageCompletedPart {
  partNumber: number;
  etag: string;
}

export interface StorageListedPart {
  partNumber: number;
  etag: string;
  size?: number;
}

export interface StorageAdapter {
  createMultipartUpload(
    bucket: string,
    key: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string>;
  signUploadPart(
    bucket: string,
    key: string,
    multipartUploadId: string,
    partNumber: number,
    expiresSeconds: number,
  ): Promise<string>;
  listParts(bucket: string, key: string, multipartUploadId: string): Promise<StorageListedPart[]>;
  completeMultipartUpload(
    bucket: string,
    key: string,
    multipartUploadId: string,
    parts: StorageCompletedPart[],
  ): Promise<void>;
  abortMultipartUpload(bucket: string, key: string, multipartUploadId: string): Promise<void>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
