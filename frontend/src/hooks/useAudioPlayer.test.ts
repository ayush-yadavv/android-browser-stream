import { describe, it, expect } from 'vitest';
import {
  clampVolume,
  calculateTargetGain,
  loadSavedMuted,
  loadSavedVolume,
  calculateNextAudioPlayTime,
  STORAGE_MUTED_KEY,
  STORAGE_VOLUME_KEY,
} from './useAudioPlayer';

describe('useAudioPlayer helpers', () => {
  describe('clampVolume', () => {
    it('clamps values between 0.0 and 1.0', () => {
      expect(clampVolume(0.5)).toBe(0.5);
      expect(clampVolume(-0.2)).toBe(0.0);
      expect(clampVolume(1.5)).toBe(1.0);
      expect(clampVolume(0)).toBe(0);
      expect(clampVolume(1)).toBe(1);
    });

    it('handles NaN gracefully by returning default volume 1.0', () => {
      expect(clampVolume(NaN)).toBe(1.0);
    });
  });

  describe('calculateTargetGain', () => {
    it('returns 0.0 when muted regardless of volume', () => {
      expect(calculateTargetGain(true, 1.0)).toBe(0.0);
      expect(calculateTargetGain(true, 0.5)).toBe(0.0);
      expect(calculateTargetGain(true, 0.0)).toBe(0.0);
    });

    it('returns clamped volume when unmuted', () => {
      expect(calculateTargetGain(false, 0.8)).toBe(0.8);
      expect(calculateTargetGain(false, 1.5)).toBe(1.0);
      expect(calculateTargetGain(false, -0.5)).toBe(0.0);
    });
  });

  describe('localStorage persistence helpers', () => {
    class MockStorage {
      private store: Record<string, string> = {};
      getItem(key: string): string | null {
        return this.store[key] ?? null;
      }
      setItem(key: string, val: string): void {
        this.store[key] = val;
      }
      clear(): void {
        this.store = {};
      }
    }

    it('defaults to muted=true when no preference is saved', () => {
      const storage = new MockStorage() as unknown as Storage;
      expect(loadSavedMuted(storage)).toBe(true);
    });

    it('reads saved muted=false from storage', () => {
      const storage = new MockStorage() as unknown as Storage;
      storage.setItem(STORAGE_MUTED_KEY, 'false');
      expect(loadSavedMuted(storage)).toBe(false);
    });

    it('reads saved muted=true from storage', () => {
      const storage = new MockStorage() as unknown as Storage;
      storage.setItem(STORAGE_MUTED_KEY, 'true');
      expect(loadSavedMuted(storage)).toBe(true);
    });

    it('defaults to volume=1.0 when no preference is saved', () => {
      const storage = new MockStorage() as unknown as Storage;
      expect(loadSavedVolume(storage)).toBe(1.0);
    });

    it('reads and clamps saved volume from storage', () => {
      const storage = new MockStorage() as unknown as Storage;
      storage.setItem(STORAGE_VOLUME_KEY, '0.45');
      expect(loadSavedVolume(storage)).toBe(0.45);

      storage.setItem(STORAGE_VOLUME_KEY, '2.5');
      expect(loadSavedVolume(storage)).toBe(1.0);

      storage.setItem(STORAGE_VOLUME_KEY, 'invalid-num');
      expect(loadSavedVolume(storage)).toBe(1.0);
    });
  });

  describe('calculateNextAudioPlayTime (Jitter buffer & drift compensation)', () => {
    it('schedules next play time seamlessly when audio queue is healthy', () => {
      const currentTime = 10.0;
      const scheduledNextTime = 10.08; // 80ms ahead of current time
      const nextTime = calculateNextAudioPlayTime(currentTime, scheduledNextTime, 0.03, 0.25);
      expect(nextTime).toBe(10.08);
    });

    it('resets to currentTime + minLeadSec on buffer underrun (queue fell behind)', () => {
      const currentTime = 10.0;
      const underrunTime = 9.95; // 50ms behind currentTime
      const nextTime = calculateNextAudioPlayTime(currentTime, underrunTime, 0.03, 0.25);
      expect(nextTime).toBe(10.03); // 10.0 + 30ms lead
    });

    it('compensates for excessive drift when queue backlog exceeds maxLagSec (>250ms)', () => {
      const currentTime = 10.0;
      const excessiveLagTime = 10.35; // 350ms ahead (accumulated latency)
      const nextTime = calculateNextAudioPlayTime(currentTime, excessiveLagTime, 0.03, 0.25);
      expect(nextTime).toBe(10.03); // reset to immediate lead time to eliminate latency buildup
    });
  });
});
