import { useCallback, useEffect, useRef, useState } from 'react';

export interface LatencyStats {
  fps: number;
  jitterMs: number;
  rttMs: number;
  bitrateKbps: number;
  totalFrames: number;
  estimatedGlassToGlassMs: number;
}

/**
 * Calculates standard deviation (jitter) of inter-frame arrival intervals.
 */
export function calculateJitter(intervals: number[]): number {
  if (intervals.length < 2) return 0;

  const mean = intervals.reduce((acc, val) => acc + val, 0) / intervals.length;
  const variance =
    intervals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / intervals.length;

  return Math.sqrt(variance);
}

export function useLatencyStats() {
  const [stats, setStats] = useState<LatencyStats>({
    fps: 0,
    jitterMs: 0,
    rttMs: 0,
    bitrateKbps: 0,
    totalFrames: 0,
    estimatedGlassToGlassMs: 0,
  });

  // Rolling metrics refs
  const frameTimestampsRef = useRef<number[]>([]);
  const frameIntervalsRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const bytesInWindowRef = useRef<number>(0);
  const totalFramesRef = useRef<number>(0);
  const latestRttRef = useRef<number>(0);

  const recordFrameRendered = useCallback((timestamp: number = performance.now()) => {
    totalFramesRef.current += 1;
    frameTimestampsRef.current.push(timestamp);

    if (lastFrameTimeRef.current > 0) {
      const interval = timestamp - lastFrameTimeRef.current;
      frameIntervalsRef.current.push(interval);
      if (frameIntervalsRef.current.length > 60) {
        frameIntervalsRef.current.shift();
      }
    }
    lastFrameTimeRef.current = timestamp;
  }, []);

  const recordBytes = useCallback((byteCount: number) => {
    bytesInWindowRef.current += byteCount;
  }, []);

  const recordPong = useCallback((rttMs: number) => {
    latestRttRef.current = rttMs;
  }, []);

  // Update statistics every 1 second
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const cutoff = now - 1000;

      // Filter frames to last 1 second
      frameTimestampsRef.current = frameTimestampsRef.current.filter((t) => t >= cutoff);
      const currentFps = frameTimestampsRef.current.length;

      // Calculate jitter from recent frame intervals
      const currentJitter = calculateJitter(frameIntervalsRef.current);

      // Calculate bitrate (kilobits per second)
      const currentBitrate = Math.round((bytesInWindowRef.current * 8) / 1000);
      bytesInWindowRef.current = 0;

      const currentRtt = latestRttRef.current;

      // Estimated Glass-to-Glass Latency:
      // scrcpy capture/encode (~12ms) + 1/2 RTT (~5-15ms) + WebCodecs decode/render (~6ms)
      const estimatedG2G = Math.round(18 + currentRtt / 2);

      setStats({
        fps: currentFps,
        jitterMs: Math.round(currentJitter * 10) / 10,
        rttMs: Math.round(currentRtt * 10) / 10,
        bitrateKbps: currentBitrate,
        totalFrames: totalFramesRef.current,
        estimatedGlassToGlassMs: estimatedG2G,
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return {
    stats,
    recordFrameRendered,
    recordBytes,
    recordPong,
  };
}
