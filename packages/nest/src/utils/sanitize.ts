const INVALID_FILE_CHARS = /[^a-zA-Z0-9._-]/g;
const INVALID_PREFIX_CHARS = /[^a-zA-Z0-9/_-]/g;

export function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const safe = normalized.replace(INVALID_FILE_CHARS, '_').slice(0, 180);
  if (safe.length === 0) {
    return 'file';
  }

  return safe;
}

export function sanitizePrefix(prefix: string): string {
  const normalized = prefix
    .normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(INVALID_PREFIX_CHARS, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

  return normalized;
}

export function sanitizeEtag(etag: string): string {
  return etag.replace(/^"|"$/g, '').trim();
}
