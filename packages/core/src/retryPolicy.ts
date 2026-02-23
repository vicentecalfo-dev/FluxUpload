import { AbortError } from './errors.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 150;
const DEFAULT_MAX_DELAY_MS = 5_000;

export function defaultIsRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return true;
  }

  if ('fatal' in error && (error as { fatal?: unknown }).fatal === true) {
    return false;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }

  return true;
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const signal = options.signal;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  if (maxRetries < 0) {
    throw new RangeError('maxRetries must be >= 0.');
  }

  if (baseDelayMs < 0 || maxDelayMs < 0) {
    throw new RangeError('baseDelayMs and maxDelayMs must be >= 0.');
  }

  let attempt = 0;

  for (;;) {
    throwIfAborted(signal);

    try {
      return await fn();
    } catch (error) {
      throwIfAborted(signal);

      const shouldRetry = attempt < maxRetries && isRetryable(error);
      if (!shouldRetry) {
        throw error;
      }

      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.random() * (exponentialDelay * 0.2);
      const delayMs = Math.min(maxDelayMs, exponentialDelay + jitter);

      await sleep(delayMs, signal);
      attempt += 1;
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  if (typeof signal.reason === 'string' && signal.reason.length > 0) {
    throw new AbortError(signal.reason);
  }

  throw new AbortError();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new AbortError());
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
