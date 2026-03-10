import { describe, it, expect } from 'vitest';
import { sleep, sleepUntil } from '../../src/utils/sleep';
describe('Sleep Utility', () => {
    describe('sleep', () => {
        it('should resolve for zero delay', async () => {
            await expect(sleep(0)).resolves.toBeUndefined();
        });
        it('should throw on negative duration', () => {
            expect(() => sleep(-100)).toThrow('cannot be negative');
        });
        it('should throw on NaN duration', () => {
            expect(() => sleep(NaN)).toThrow('must be finite');
        });
        it('should throw on Infinity duration', () => {
            expect(() => sleep(Infinity)).toThrow('must be finite');
        });
        it('should return a Promise', () => {
            const result = sleep(100);
            expect(result).toBeInstanceOf(Promise);
        });
    });
    describe('sleepUntil', () => {
        it('should resolve immediately for past timestamp', async () => {
            const past = Date.now() - 1000;
            await expect(sleepUntil(past)).resolves.toBeUndefined();
        });
        it('should resolve immediately for current timestamp', async () => {
            const now = Date.now();
            await expect(sleepUntil(now)).resolves.toBeUndefined();
        });
        it('should return a Promise for future timestamp', () => {
            const future = Date.now() + 10000;
            const result = sleepUntil(future);
            expect(result).toBeInstanceOf(Promise);
        });
    });
});
//# sourceMappingURL=sleep.test.js.map