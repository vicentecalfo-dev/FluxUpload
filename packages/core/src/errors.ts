import type { UploadErrorInfo } from './types.js';

export interface FluxUploadErrorOptions {
  code?: string;
  fatal?: boolean;
  cause?: unknown;
}

export class FluxUploadError extends Error {
  public readonly code?: string;
  public readonly fatal: boolean;
  public override readonly cause?: unknown;

  public constructor(message: string, options: FluxUploadErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.fatal = options.fatal ?? false;
    this.cause = options.cause;
  }
}

export class AbortError extends FluxUploadError {
  public constructor(message = 'Operation aborted', options: FluxUploadErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'ABORT_ERR',
      fatal: options.fatal ?? true,
    });
    this.name = 'AbortError';
  }
}

export class UploadNotFoundError extends FluxUploadError {
  public constructor(localId: string) {
    super(`Upload '${localId}' was not found.`, { code: 'UPLOAD_NOT_FOUND', fatal: true });
  }
}

export class MissingPartDataProviderError extends FluxUploadError {
  public constructor(localId: string) {
    super(`Upload '${localId}' has no partDataProvider bound.`, {
      code: 'MISSING_PART_DATA_PROVIDER',
      fatal: true,
    });
  }
}

export class InvalidUploadStateError extends FluxUploadError {
  public constructor(message: string) {
    super(message, { code: 'INVALID_UPLOAD_STATE', fatal: true });
  }
}

export class PersistenceError extends FluxUploadError {
  public constructor(message: string, cause?: unknown) {
    super(message, { code: 'PERSISTENCE_ERROR', fatal: true, cause });
  }
}

export class UploadSessionExpiredError extends FluxUploadError {
  public constructor(message = 'Upload session expired', options: FluxUploadErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'UPLOAD_SESSION_EXPIRED',
      fatal: options.fatal ?? true,
    });
    this.name = 'UploadSessionExpiredError';
  }
}

export function isAbortError(error: unknown): error is AbortError {
  if (error instanceof AbortError) {
    return true;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return false;
}

export function isUploadSessionExpiredError(error: unknown): error is UploadSessionExpiredError {
  if (error instanceof UploadSessionExpiredError) {
    return true;
  }

  if (error instanceof FluxUploadError && error.code === 'UPLOAD_SESSION_EXPIRED') {
    return true;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'UPLOAD_SESSION_EXPIRED'
  ) {
    return true;
  }

  return false;
}

export function toUploadErrorInfo(error: unknown): UploadErrorInfo {
  if (error instanceof FluxUploadError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      fatal: error.fatal,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}
