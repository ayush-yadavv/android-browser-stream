import { useCallback, useEffect, useRef, useState } from 'react';

export interface BenchmarkResult {
  timestamp: string;
  sampleCount: number;
  fps: number;
  jitterMs: number;
  bitrateKbps: number;
  rttMinMs: number;
  rttP50Ms: number;
  rttMeanMs: number;
  rttP95Ms: number;
  rttMaxMs: number;
  g2gMinMs: number;
  g2gMedianMs: number;
  g2gP95Ms: number;
  g2gMaxMs: number;
  sub50msTargetMet: boolean;
}

export interface LatencyStats {
  fps: number;
  jitterMs: number;
  rttMs: number;
  rttP50Ms: number;
  rttP95Ms: number;
  rttMinMs: number;
  rttMaxMs: number;
  bitrateKbps: number;
  totalFrames: number;
  estimatedGlassToGlassMs: number;
  isBenchmarking: boolean;
  benchmarkProgress: number; // 0 to 100%
  benchmarkResult: BenchmarkResult | null;
}

/**
 * Maximum threshold for consecutive inter-frame interval during active streaming (ms).
 * Intervals > 200ms indicate a static screen or user pause between touches (scrcpy VFR behavior),
 * which should not pollute active streaming frame pacing jitter calculations.
 */
export const MAX_STREAMING_INTERVAL_MS = 200;

/**
 * Calculates standard deviation (jitter) of inter-frame arrival intervals.
 * Automatically filters out non-positive and idle pause intervals (> maxIntervalMs) if specified.
 */
export function calculateJitter(intervals: number[], maxIntervalMs?: number): number {
  const filtered =
    maxIntervalMs !== undefined && maxIntervalMs > 0
      ? intervals.filter((val) => val > 0 && val <= maxIntervalMs)
      : intervals;

  if (filtered.length < 2) return 0;

  const mean = filtered.reduce((acc, val) => acc + val, 0) / filtered.length;
  const variance =
    filtered.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / filtered.length;

  return Math.sqrt(variance);
}

/**
 * Calculates a specific percentile from a set of numbers.
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(percentile * (sorted.length - 1));
  return sorted[index];
}

/**
 * Calculates min, max, mean, median (p50), and p95 from a sample array.
 */
export function calculateStatsSummary(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / count;
  const median = sorted[Math.floor(0.5 * (count - 1))];
  const p95 = sorted[Math.floor(0.95 * (count - 1))];
  return {
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    p95: Math.round(p95 * 10) / 10,
  };
}

export function useLatencyStats() {
  const [stats, setStats] = useState<LatencyStats>({
    fps: 0,
    jitterMs: 0,
    rttMs: 0,
    rttP50Ms: 0,
    rttP95Ms: 0,
    rttMinMs: 0,
    rttMaxMs: 0,
    bitrateKbps: 0,
    totalFrames: 0,
    estimatedGlassToGlassMs: 0,
    isBenchmarking: false,
    benchmarkProgress: 0,
    benchmarkResult: null,
  });

  // Rolling metrics refs
  const frameTimestampsRef = useRef<number[]>([]);
  const frameIntervalsRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const bytesInWindowRef = useRef<number>(0);
  const totalFramesRef = useRef<number>(0);
  const latestRttRef = useRef<number>(0);
  const rttHistoryRef = useRef<number[]>([]);

  // Benchmarking runner refs
  const isBenchmarkingRef = useRef(false);
  const benchmarkStartTimeRef = useRef(0);
  const benchmarkDurationMsRef = useRef(10000);
  const benchmarkRttsRef = useRef<number[]>([]);
  const benchmarkFrameIntervalsRef = useRef<number[]>([]);
  const benchmarkStartFramesRef = useRef(0);
  const benchmarkStartBytesRef = useRef(0);
  const benchmarkTotalBytesRef = useRef(0);

  const recordFrameRendered = useCallback((timestamp: number = performance.now()) => {
    totalFramesRef.current += 1;
    frameTimestampsRef.current.push(timestamp);

    if (lastFrameTimeRef.current > 0) {
      const interval = timestamp - lastFrameTimeRef.current;
      // Filter out static screen idle pauses and browser background pauses (>200ms)
      if (interval <= MAX_STREAMING_INTERVAL_MS) {
        frameIntervalsRef.current.push(interval);
        if (frameIntervalsRef.current.length > 60) {
          frameIntervalsRef.current.shift();
        }

        if (isBenchmarkingRef.current) {
          benchmarkFrameIntervalsRef.current.push(interval);
        }
      } else {
        // Long pause encountered (idle screen): reset rolling interval buffer to prevent stale jitter
        frameIntervalsRef.current = [];
      }
    }
    lastFrameTimeRef.current = timestamp;
  }, []);

  const recordBytes = useCallback((byteCount: number) => {
    bytesInWindowRef.current += byteCount;
    if (isBenchmarkingRef.current) {
      benchmarkTotalBytesRef.current += byteCount;
    }
  }, []);

  const recordPong = useCallback((rttMs: number) => {
    latestRttRef.current = rttMs;
    rttHistoryRef.current.push(rttMs);
    if (rttHistoryRef.current.length > 60) {
      rttHistoryRef.current.shift();
    }

    if (isBenchmarkingRef.current) {
      benchmarkRttsRef.current.push(rttMs);
    }
  }, []);

  const startBenchmark = useCallback((durationSec: number = 10) => {
    if (isBenchmarkingRef.current) return;

    isBenchmarkingRef.current = true;
    benchmarkStartTimeRef.current = performance.now();
    benchmarkDurationMsRef.current = durationSec * 1000;
    benchmarkRttsRef.current = [];
    benchmarkFrameIntervalsRef.current = [];
    benchmarkStartFramesRef.current = totalFramesRef.current;
    benchmarkStartBytesRef.current = bytesInWindowRef.current;
    benchmarkTotalBytesRef.current = 0;

    setStats((prev) => ({
      ...prev,
      isBenchmarking: true,
      benchmarkProgress: 0,
      benchmarkResult: null,
    }));
  }, []);

  const resetBenchmark = useCallback(() => {
    isBenchmarkingRef.current = false;
    setStats((prev) => ({
      ...prev,
      isBenchmarking: false,
      benchmarkProgress: 0,
      benchmarkResult: null,
    }));
  }, []);

  // Update statistics every 1 second
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const cutoff = now - 1000;

      // Filter frames to last 1 second
      frameTimestampsRef.current = frameTimestampsRef.current.filter((t) => t >= cutoff);
      const currentFps = frameTimestampsRef.current.length;

      // Calculate jitter from recent frame intervals if actively streaming (fps > 0)
      const currentJitter =
        currentFps > 0 ? calculateJitter(frameIntervalsRef.current, MAX_STREAMING_INTERVAL_MS) : 0;

      // Calculate bitrate (kilobits per second)
      const currentBitrate = Math.round((bytesInWindowRef.current * 8) / 1000);
      bytesInWindowRef.current = 0;

      const currentRtt = latestRttRef.current;
      const rttSummary = calculateStatsSummary(rttHistoryRef.current);

      // Estimated Glass-to-Glass Latency:
      // scrcpy capture/encode (~12ms) + 1/2 RTT (~5-15ms) + WebCodecs decode/render (~6ms) + OS/Input (~6ms) = 24ms + RTT
      const estimatedG2G = Math.round(24 + (rttSummary.median || currentRtt));

      // Handle active benchmark progress and completion
      let isStillBenchmarking = isBenchmarkingRef.current;
      let progress = 0;
      let completedResult: BenchmarkResult | null = null;

      if (isStillBenchmarking) {
        const elapsed = now - benchmarkStartTimeRef.current;
        const totalDuration = benchmarkDurationMsRef.current;
        progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

        if (elapsed >= totalDuration) {
          // Finalize benchmark
          isStillBenchmarking = false;
          isBenchmarkingRef.current = false;

          const benchRttSummary = calculateStatsSummary(benchmarkRttsRef.current);
          const benchJitter = calculateJitter(benchmarkFrameIntervalsRef.current, MAX_STREAMING_INTERVAL_MS);
          const benchFrames = totalFramesRef.current - benchmarkStartFramesRef.current;
          const benchDurationSec = totalDuration / 1000;
          const benchFps = Math.round(benchFrames / benchDurationSec);
          const benchBitrate = Math.round((benchmarkTotalBytesRef.current * 8) / (benchDurationSec * 1000));

          completedResult = {
            timestamp: new Date().toISOString(),
            sampleCount: benchmarkRttsRef.current.length,
            fps: benchFps,
            jitterMs: Math.round(benchJitter * 10) / 10,
            bitrateKbps: benchBitrate,
            rttMinMs: benchRttSummary.min,
            rttP50Ms: benchRttSummary.median,
            rttMeanMs: benchRttSummary.mean,
            rttP95Ms: benchRttSummary.p95,
            rttMaxMs: benchRttSummary.max,
            g2gMinMs: Math.round((24.0 + benchRttSummary.min) * 10) / 10,
            g2gMedianMs: Math.round((24.0 + benchRttSummary.median) * 10) / 10,
            g2gP95Ms: Math.round((24.0 + benchRttSummary.p95) * 10) / 10,
            g2gMaxMs: Math.round((24.0 + benchRttSummary.max) * 10) / 10,
            sub50msTargetMet: 24.0 + benchRttSummary.median <= 50.0,
          };
        }
      }

      setStats((prev) => ({
        ...prev,
        fps: currentFps,
        jitterMs: Math.round(currentJitter * 10) / 10,
        rttMs: Math.round(currentRtt * 10) / 10,
        rttP50Ms: rttSummary.median,
        rttP95Ms: rttSummary.p95,
        rttMinMs: rttSummary.min,
        rttMaxMs: rttSummary.max,
        bitrateKbps: currentBitrate,
        totalFrames: totalFramesRef.current,
        estimatedGlassToGlassMs: estimatedG2G,
        isBenchmarking: isStillBenchmarking,
        benchmarkProgress: progress,
        benchmarkResult: completedResult !== null ? completedResult : prev.benchmarkResult,
      }));
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
    startBenchmark,
    resetBenchmark,
  };
}
