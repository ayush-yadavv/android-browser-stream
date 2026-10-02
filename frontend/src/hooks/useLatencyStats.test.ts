import { describe, it, expect } from 'vitest';
import { calculateJitter } from './useLatencyStats';

describe('useLatencyStats', () => {
  describe('calculateJitter', () => {
    it('returns 0 for empty or single intervals', () => {
      expect(calculateJitter([])).toBe(0);
      expect(calculateJitter([16.6])).toBe(0);
    });

    it('calculates standard deviation of frame intervals accurately', () => {
      // Consistent 16.6ms intervals -> 0 jitter
      expect(calculateJitter([16.6, 16.6, 16.6, 16.6])).toBeCloseTo(0, 2);

      // Jittery intervals
      const jitter = calculateJitter([10, 20, 15, 25]);
      expect(jitter).toBeGreaterThan(0);
    });
  });
});
