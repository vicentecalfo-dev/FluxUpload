import { sanitizeFileName, sanitizePrefix } from './sanitize.js';

interface BuildObjectKeyInput {
  defaultPrefix: string;
  requestPrefix?: string;
  uploadId: string;
  fileName: string;
}

export function buildObjectKey(input: BuildObjectKeyInput): string {
  const prefix = sanitizePrefix(input.requestPrefix || input.defaultPrefix || 'flux-upload');
  const fileName = sanitizeFileName(input.fileName);

  return `${prefix}/${input.uploadId}/${fileName}`;
}
