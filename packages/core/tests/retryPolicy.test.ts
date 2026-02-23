import { describe, expect, it } from 'vitest';

import { AbortError, FluxUploadError } from '../src/errors';
import { retry } from '../src/retryPolicy';

describe('retry', () => {
  it('retries transient failures and succeeds', async () => {
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error('transient failure');
        }

        return 'ok';
      },
      {
        maxRetries: 5,
        baseDelayMs: 1,
        maxDelayMs: 5,
      },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry fatal failures by default', async () => {
    const fatalError = new FluxUploadError('fatal', { fatal: true });
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;
          throw fatalError;
        },
        {
          maxRetries: 5,
          baseDelayMs: 1,
          maxDelayMs: 5,
        },
      ),
    ).rejects.toBe(fatalError);

    expect(attempts).toBe(1);
  });

  it('aborts while waiting for next retry', async () => {
    const controller = new AbortController();
    let attempts = 0;

    const promise = retry(
      async () => {
        attempts += 1;
        throw new Error('network down');
      },
      {
        maxRetries: 5,
        baseDelayMs: 100,
        maxDelayMs: 100,
        signal: controller.signal,
      },
    );

    setTimeout(() => {
      controller.abort();
    }, 10);

    await expect(promise).rejects.toBeInstanceOf(AbortError);
    expect(attempts).toBe(1);
  });
});
