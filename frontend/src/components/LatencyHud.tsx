import React, { useState, useEffect } from 'react';
import { LatencyStats } from '../hooks/useLatencyStats';
import {
  Activity,
  Gauge,
  Zap,
  BarChart2,
  Radio,
  X,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
  Copy,
  Check,
  Clock,
  Sliders,
} from 'lucide-react';
import { Button } from './ui/button';

interface LatencyHudProps {
  stats: LatencyStats;
  isOpen: boolean;
  onToggle: () => void;
  onStartBenchmark?: (durationSec?: number) => void;
  onResetBenchmark?: () => void;
}

export const LatencyHud: React.FC<LatencyHudProps> = ({
  stats,
  isOpen,
  onToggle,
  onStartBenchmark,
  onResetBenchmark,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPercentiles, setShowPercentiles] = useState(false);
  const [showLoopbackClock, setShowLoopbackClock] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clockTime, setClockTime] = useState<string>('');

  // Global hotkey Ctrl+Shift+L or Alt+L to toggle HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggle]);

  // Visual Loopback Millisecond Clock ticker
  useEffect(() => {
    if (!showLoopbackClock) return;

    let rafId: number;
    const updateClock = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      setClockTime(`${h}:${m}:${s}.${ms}`);
      rafId = requestAnimationFrame(updateClock);
    };

    rafId = requestAnimationFrame(updateClock);
    return () => cancelAnimationFrame(rafId);
  }, [showLoopbackClock]);

  if (!isOpen) return null;

  // Latency health indicator badge helper
  const getLatencyColor = (ms: number) => {
    if (ms <= 35) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (ms <= 50) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  const formatBitrate = (kbps: number) => {
    if (kbps >= 1000) {
      return `${(kbps / 1000).toFixed(1)} Mbps`;
    }
    return `${kbps} Kbps`;
  };

  const handleCopyBenchmarkJson = () => {
    if (!stats.benchmarkResult) return;
    const jsonStr = JSON.stringify(stats.benchmarkResult, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      {/* Floating Visual Loopback Precision Clock Overlay */}
      {showLoopbackClock && (
        <div className="fixed top-20 right-6 z-50 bg-black/90 text-emerald-400 font-mono text-base px-4 py-2 rounded-xl border border-emerald-500/30 shadow-2xl backdrop-blur-md pointer-events-none select-none flex items-center space-x-2 animate-in fade-in">
          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
          <div className="flex flex-col">
            <span className="text-[10px] text-ink-muted uppercase tracking-wider">Visual Loopback Clock</span>
            <span className="font-bold tracking-widest text-lg text-emerald-400">{clockTime}</span>
          </div>
        </div>
      )}

      {/* Main Performance HUD Panel */}
      <div className="w-full rounded-2xl bg-canvas/90 backdrop-blur-md border border-hairline shadow-2xl p-3.5 space-y-3 font-mono text-xs select-none animate-in fade-in duration-200">
        {/* HUD Header */}
        <div className="flex items-center justify-between pb-2 border-b border-hairline/60">
          <div className="flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-accent-blue animate-pulse" />
            <span className="font-sans font-semibold text-ink text-[13px] tracking-tight">
              Performance HUD
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setShowLoopbackClock(!showLoopbackClock)}
              className={`p-1 rounded transition-colors ${
                showLoopbackClock ? 'bg-accent-blue/20 text-accent-blue' : 'hover:bg-surface-2 text-ink-muted hover:text-ink'
              }`}
              title="Toggle Visual Loopback Clock"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
              title={isMinimized ? 'Expand' : 'Collapse'}
            >
              {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onToggle}
              className="p-1 rounded hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
              title="Close HUD (Ctrl+Shift+L)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Latency Hero Metric */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-1/80 border border-hairline">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-accent-blue" />
            <div>
              <div className="text-[11px] font-sans text-ink-muted">Glass-to-Glass</div>
              <div className="text-lg font-bold text-ink leading-tight">
                ~{stats.estimatedGlassToGlassMs}
                <span className="text-[11px] font-normal text-ink-muted ml-0.5">ms</span>
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getLatencyColor(
              stats.estimatedGlassToGlassMs
            )}`}
          >
            {stats.estimatedGlassToGlassMs <= 50 ? 'Sub-50ms OK' : 'Degraded'}
          </span>
        </div>

        {/* Detailed Metrics Grid */}
        {!isMinimized && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Framerate */}
            <div className="p-2 rounded-lg bg-surface-1/50 border border-hairline/50 space-y-0.5">
              <div className="flex items-center space-x-1.5 text-ink-muted">
                <Gauge className="w-3 h-3 text-neutral-400" />
                <span>Framerate</span>
              </div>
              <div className="text-sm font-semibold text-ink">
                {stats.fps}{' '}
                <span className="text-[10px] font-normal text-ink-muted">/ 60 FPS</span>
              </div>
            </div>

            {/* RTT Ping */}
            <div className="p-2 rounded-lg bg-surface-1/50 border border-hairline/50 space-y-0.5">
              <div className="flex items-center space-x-1.5 text-ink-muted">
                <Radio className="w-3 h-3 text-neutral-400" />
                <span>RTT Ping</span>
              </div>
              <div className="text-sm font-semibold text-ink">
                {stats.rttMs}{' '}
                <span className="text-[10px] font-normal text-ink-muted">ms</span>
              </div>
            </div>

            {/* Frame Jitter */}
            <div className="p-2 rounded-lg bg-surface-1/50 border border-hairline/50 space-y-0.5">
              <div className="flex items-center space-x-1.5 text-ink-muted">
                <Activity className="w-3 h-3 text-neutral-400" />
                <span>Jitter (σ)</span>
              </div>
              <div className="text-sm font-semibold text-ink">
                {stats.jitterMs}{' '}
                <span className="text-[10px] font-normal text-ink-muted">ms</span>
              </div>
            </div>

            {/* Bitrate */}
            <div className="p-2 rounded-lg bg-surface-1/50 border border-hairline/50 space-y-0.5">
              <div className="flex items-center space-x-1.5 text-ink-muted">
                <BarChart2 className="w-3 h-3 text-neutral-400" />
                <span>Bitrate</span>
              </div>
              <div className="text-sm font-semibold text-ink">
                {formatBitrate(stats.bitrateKbps)}
              </div>
            </div>
          </div>
        )}

        {/* Percentile Breakdown Accordion */}
        {!isMinimized && (
          <div className="border-t border-hairline/50 pt-2">
            <button
              onClick={() => setShowPercentiles(!showPercentiles)}
              className="w-full flex items-center justify-between text-[10px] text-ink-muted hover:text-ink transition-colors pb-1"
            >
              <div className="flex items-center space-x-1.5">
                <Sliders className="w-3 h-3" />
                <span>Percentile Distribution (p50 / p95)</span>
              </div>
              {showPercentiles ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showPercentiles && (
              <div className="grid grid-cols-4 gap-1.5 pt-1.5 text-[10px]">
                <div className="p-1.5 rounded bg-surface-1/40 border border-hairline/30 text-center">
                  <div className="text-ink-muted text-[9px]">Min</div>
                  <div className="font-semibold text-ink">{stats.rttMinMs}ms</div>
                </div>
                <div className="p-1.5 rounded bg-surface-1/40 border border-hairline/30 text-center">
                  <div className="text-ink-muted text-[9px]">p50 (Med)</div>
                  <div className="font-semibold text-emerald-400">{stats.rttP50Ms}ms</div>
                </div>
                <div className="p-1.5 rounded bg-surface-1/40 border border-hairline/30 text-center">
                  <div className="text-ink-muted text-[9px]">p95</div>
                  <div className="font-semibold text-amber-400">{stats.rttP95Ms}ms</div>
                </div>
                <div className="p-1.5 rounded bg-surface-1/40 border border-hairline/30 text-center">
                  <div className="text-ink-muted text-[9px]">Max</div>
                  <div className="font-semibold text-rose-400">{stats.rttMaxMs}ms</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Automated Benchmark Calibration Runner */}
        {!isMinimized && onStartBenchmark && (
          <div className="border-t border-hairline/50 pt-2 space-y-2">
            {stats.isBenchmarking ? (
              <div className="p-2.5 rounded-xl bg-surface-1/80 border border-accent-blue/30 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink font-sans font-medium flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-accent-blue animate-spin" />
                    <span>Calibrating Latency Profile...</span>
                  </span>
                  <span className="text-accent-blue font-bold">{stats.benchmarkProgress}%</span>
                </div>
                <div className="w-full bg-surface-2 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-accent-blue h-full transition-all duration-200 ease-out"
                    style={{ width: `${stats.benchmarkProgress}%` }}
                  />
                </div>
              </div>
            ) : stats.benchmarkResult ? (
              <div className="p-2.5 rounded-xl bg-surface-1/80 border border-hairline space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-sans font-semibold text-ink text-[11px]">
                    10s Benchmark Result
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-medium border ${
                      stats.benchmarkResult.sub50msTargetMet
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    }`}
                  >
                    {stats.benchmarkResult.sub50msTargetMet ? 'CR-3 Passed' : 'CR-3 Degraded'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div>
                    <span className="text-ink-muted">G2G Median:</span>{' '}
                    <span className="font-semibold text-ink">~{stats.benchmarkResult.g2gMedianMs}ms</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">G2G p95:</span>{' '}
                    <span className="font-semibold text-ink">~{stats.benchmarkResult.g2gP95Ms}ms</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">RTT p50:</span>{' '}
                    <span className="font-semibold text-ink">{stats.benchmarkResult.rttP50Ms}ms</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Frame Jitter:</span>{' '}
                    <span className="font-semibold text-ink">{stats.benchmarkResult.jitterMs}ms</span>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-[10px] space-x-1 border-hairline"
                    onClick={handleCopyBenchmarkJson}
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={() => {
                      onResetBenchmark?.();
                      onStartBenchmark(10);
                    }}
                    title="Re-run benchmark"
                  >
                    <RotateCcw className="w-3 h-3 text-ink-muted" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-[11px] font-sans font-medium space-x-2 border-hairline hover:border-hairline-bright"
                onClick={() => onStartBenchmark(10)}
              >
                <Play className="w-3 h-3 text-accent-blue" />
                <span>Run 10s Benchmark (CR-3)</span>
              </Button>
            )}
          </div>
        )}

        {/* Frame Counter Footer */}
        {!isMinimized && (
          <div className="flex items-center justify-between pt-1 border-t border-hairline/40 text-[10px] text-ink-muted">
            <span>Decoded Frames:</span>
            <span className="font-semibold text-ink">{stats.totalFrames.toLocaleString()}</span>
          </div>
        )}
      </div>
    </>
  );
};
