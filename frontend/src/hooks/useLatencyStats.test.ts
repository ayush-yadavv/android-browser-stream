import { describe, it, expect } from 'vitest';
import { calculateJitter, calculatePercentile, calculateStatsSummary } from './useLatencyStats';

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

  describe('calculatePercentile', () => {
    it('returns 0 for empty arrays', () => {
      expect(calculatePercentile([], 0.5)).toBe(0);
    });

    it('calculates median (p50) and 95th percentile (p95) correctly', () => {
      const samples = [10, 12, 14, 15, 18, 20, 25, 30, 35, 100];
      const p50 = calculatePercentile(samples, 0.5);
      const p95 = calculatePercentile(samples, 0.95);

      expect(p50).toBe(18);
      expect(p95).toBe(35);
    });
  });

  describe('calculateStatsSummary', () => {
    it('computes min, max, mean, median and p95 summary', () => {
      const samples = [10, 20, 30, 40, 50];
      const summary = calculateStatsSummary(samples);

      expect(summary.min).toBe(10);
      expect(summary.max).toBe(50);
      expect(summary.mean).toBe(30);
      expect(summary.median).toBe(30);
      expect(summary.p95).toBe(40);
    });
  });
});
