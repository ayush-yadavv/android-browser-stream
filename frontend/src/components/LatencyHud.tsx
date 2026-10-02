import React, { useState, useEffect } from 'react';
import { LatencyStats } from '../hooks/useLatencyStats';
import { Activity, Gauge, Zap, BarChart2, Radio, X, ChevronDown, ChevronUp } from 'lucide-react';

interface LatencyHudProps {
  stats: LatencyStats;
  isOpen: boolean;
  onToggle: () => void;
}

export const LatencyHud: React.FC<LatencyHudProps> = ({ stats, isOpen, onToggle }) => {
  const [isMinimized, setIsMinimized] = useState(false);

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

  return (
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

      {/* Frame Counter Footer */}
      {!isMinimized && (
        <div className="flex items-center justify-between pt-1 border-t border-hairline/40 text-[10px] text-ink-muted">
          <span>Decoded Frames:</span>
          <span className="font-semibold text-ink">{stats.totalFrames.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};
