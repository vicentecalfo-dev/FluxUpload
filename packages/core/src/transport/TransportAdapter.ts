import type { FileMeta, PartData } from '../types.js';

export interface InitUploadInput {
  localId: string;
  fileMeta: FileMeta;
  chunkSize: number;
}

export interface SignPartInput {
  uploadId: string;
  partNumber: number;
}

export interface UploadPartInput {
  url: string;
  partNumber: number;
  getPartData: () => Promise<PartData>;
}

export interface UploadedPart {
  partNumber: number;
  etag?: string;
}

export interface TransportAdapter {
  initUpload(input: InitUploadInput): Promise<{ uploadId: string }>;
  getUploadedParts(input: { uploadId: string }): Promise<number[]>;
  signPart(input: SignPartInput): Promise<{ url: string; expiresAt?: string }>;
  uploadPart(input: UploadPartInput): Promise<{ etag?: string }>;
  commitParts?(input: { uploadId: string; parts: UploadedPart[] }): Promise<void>;
  completeUpload(input: { uploadId: string; parts?: UploadedPart[] }): Promise<void>;
  abortUpload(input: { uploadId: string }): Promise<void>;
}
