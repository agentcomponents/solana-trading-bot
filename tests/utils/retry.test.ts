/**
 * Tests for retry utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  retry,
  retryIf,
  retryWithTimeout,
  DEFAULT_RETRY_OPTIONS
} from '../../src/utils/retry';

// Mock the sleep function to avoid actual delays
vi.mock('../../src/utils/sleep', () => ({
  sleep: vi.fn(() => Promise.resolve())
}));

describe('Retry Utility', () => {
  describe('retry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelayMs: 10,
        jitter: false
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(
        retry(fn, {
          maxAttempts: 2,
          initialDelayMs: 10
        })
      ).rejects.toThrow('fail');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use default options when none provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
    });

    it('should handle immediate success after failure', async () => {
      let attempts = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          throw new Error('first fail');
        }
        return Promise.resolve('success');
      });

      const result = await retry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should handle all attempts failing', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent error'));

      await expect(
        retry(fn, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow('persistent error');

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('retryIf', () => {
    it('should only retry when predicate returns true', async () => {
      const retryableError = new Error('retryable');
      const fatalError = new Error('fatal');

      const fn = vi
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(fatalError);

      await expect(
        retryIf(
          fn,
          (err) => err.message === 'retryable',
          { maxAttempts: 5, initialDelayMs: 10 }
        )
      ).rejects.toThrow('fatal');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on non-retryable error', async () => {
      const fatalError = new Error('fatal');
      const fn = vi.fn().mockRejectedValue(fatalError);

      await expect(
        retryIf(
          fn,
          (err) => err.message === 'retryable',
          { maxAttempts: 5, initialDelayMs: 10 }
        )
      ).rejects.toThrow('fatal');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry until success on retryable errors', async () => {
      const retryableError = new Error('retryable');

      const fn = vi
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('success');

      const result = await retryIf(
        fn,
        (err) => err.message === 'retryable',
        { maxAttempts: 5, initialDelayMs: 10, jitter: false }
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should retry based on error type', async () => {
      class NetworkError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'NetworkError';
        }
      }

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('network fail'))
        .mockRejectedValueOnce(new NetworkError('network fail again'))
        .mockResolvedValue('success');

      const result = await retryIf(
        fn,
        (err) => err instanceof NetworkError,
        { maxAttempts: 5, initialDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('retryWithTimeout', () => {
    it('should return result on first success before timeout', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithTimeout(fn, 1000, {
        maxAttempts: 2,
        initialDelayMs: 10
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return result after retry before timeout', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const result = await retryWithTimeout(fn, 1000, {
        maxAttempts: 3,
        initialDelayMs: 10
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('DEFAULT_RETRY_OPTIONS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_OPTIONS.initialDelayMs).toBe(1_000);
      expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBe(30_000);
      expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_OPTIONS.jitter).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should convert non-Error errors to Error', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(
        retry(fn, { maxAttempts: 2, initialDelayMs: 10 })
      ).rejects.toThrow('string error');
    });

    it('should handle null error', async () => {
      const fn = vi.fn().mockRejectedValue(null);

      await expect(
        retry(fn, { maxAttempts: 2, initialDelayMs: 10 })
      ).rejects.toThrow();
    });

    it('should handle undefined error', async () => {
      const fn = vi.fn().mockRejectedValue(undefined);

      await expect(
        retry(fn, { maxAttempts: 2, initialDelayMs: 10 })
      ).rejects.toThrow();
    });
  });
});
