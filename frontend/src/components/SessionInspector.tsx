import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { LatencyStats } from '../hooks/useLatencyStats';
import { VirtualDpad } from './VirtualDpad';
import { ANDROID_KEYCODES } from '../lib/keymap';
import {
  Activity,
  Gauge,
  Zap,
  BarChart2,
  Radio,
  Gamepad2,
  Cpu,
  Film,
  Download,
  Copy,
  Check,
  Play,
  RotateCcw,
  Sparkles,
  MousePointer,
  Clock,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface SessionInspectorProps {
  stats: LatencyStats;
  activeCodec: string;
  sessionId: string;
  kioskEnabled?: boolean;
  recording?: boolean;
  sessionDurationSec: number;
  onStartBenchmark?: (durationSec?: number) => void;
  onResetBenchmark?: () => void;
  onSendKey?: (keycode: number) => void;
  isPointerLocked?: boolean;
  onRequestPointerLock?: () => void;
  onExitPointerLock?: () => void;
  isMuted?: boolean;
  volume?: number;
  onToggleMute?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export const SessionInspector: React.FC<SessionInspectorProps> = ({
  stats,
  activeCodec,
  sessionId,
  kioskEnabled = false,
  recording = false,
  sessionDurationSec,
  onStartBenchmark,
  onResetBenchmark,
  onSendKey,
  isPointerLocked = false,
  onRequestPointerLock,
  onExitPointerLock,
  isMuted = true,
  volume = 1.0,
  onToggleMute,
  onVolumeChange,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedBenchmark, setCopiedBenchmark] = useState(false);

  const formatBitrate = (kbps: number) => {
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
    return `${kbps} Kbps`;
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  };

  const handleCopyBenchmark = () => {
    if (!stats.benchmarkResult) return;
    navigator.clipboard.writeText(JSON.stringify(stats.benchmarkResult, null, 2)).then(() => {
      setCopiedBenchmark(true);
      setTimeout(() => setCopiedBenchmark(false), 2000);
    });
  };

  return (
    <div className="w-full bg-surface-1 border border-hairline rounded-2xl p-3 sm:p-4 shadow-xl space-y-4 select-none">
      <Tabs defaultValue="telemetry" className="w-full">
        {/* Framer-style Pill Tab Switcher */}
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <TabsList className="grid grid-cols-3 w-full bg-surface-2/80 p-1 rounded-pill">
            <TabsTrigger
              value="telemetry"
              className="text-xs font-medium rounded-pill gap-1.5 py-1.5"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Metrics</span>
            </TabsTrigger>
            <TabsTrigger
              value="controls"
              className="text-xs font-medium rounded-pill gap-1.5 py-1.5"
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Controls</span>
            </TabsTrigger>
            <TabsTrigger
              value="specs"
              className="text-xs font-medium rounded-pill gap-1.5 py-1.5"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Specs</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: TELEMETRY & PERFORMANCE HUD */}
        <TabsContent value="telemetry" className="space-y-4 pt-2">
          {/* Glass-to-Glass Latency Hero Meter */}
          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-hairline space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs text-ink-muted">
                <Zap className="w-3.5 h-3.5 text-accent-blue" />
                <span className="font-medium text-ink">Glass-to-Glass Latency</span>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  stats.estimatedGlassToGlassMs <= 35
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                    : stats.estimatedGlassToGlassMs <= 50
                    ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                    : 'border-rose-500/30 text-rose-400 bg-rose-500/10'
                }`}
              >
                {stats.estimatedGlassToGlassMs <= 35
                  ? 'Ultra Fast (<35ms)'
                  : stats.estimatedGlassToGlassMs <= 50
                  ? 'Interactive (<50ms)'
                  : 'High Latency'}
              </Badge>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-3xl sm:text-4xl font-bold font-mono text-ink tracking-tight">
                ~{stats.estimatedGlassToGlassMs}
              </span>
              <span className="text-sm font-medium text-ink-muted">ms</span>
            </div>

            <p className="text-[11px] text-ink-muted">
              Estimated pipeline: input capture → WS multiplex → Android input → SurfaceFlinger →
              WebCodecs decode → paint.
            </p>
          </div>

          {/* 4-Stat Metric Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline space-y-1">
              <div className="flex items-center space-x-1 text-ink-muted text-[11px]">
                <Gauge className="w-3 h-3 text-emerald-400" />
                <span>Framerate</span>
              </div>
              <p className="text-lg font-bold font-mono text-ink">{stats.fps || 60} FPS</p>
            </div>

            <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline space-y-1">
              <div className="flex items-center space-x-1 text-ink-muted text-[11px]">
                <Radio className="w-3 h-3 text-accent-blue" />
                <span>Bitrate</span>
              </div>
              <p className="text-lg font-bold font-mono text-ink">{formatBitrate(stats.bitrateKbps)}</p>
            </div>

            <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline space-y-1">
              <div className="flex items-center space-x-1 text-ink-muted text-[11px]">
                <BarChart2 className="w-3 h-3 text-purple-400" />
                <span>WebSocket RTT</span>
              </div>
              <p className="text-lg font-bold font-mono text-ink">{stats.rttMs} ms</p>
            </div>

            <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline space-y-1">
              <div className="flex items-center space-x-1 text-ink-muted text-[11px]">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Jitter</span>
              </div>
              <p className="text-lg font-bold font-mono text-ink">±{stats.jitterMs.toFixed(1)} ms</p>
            </div>
          </div>

          {/* Automated Benchmark Section */}
          <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink">Action-to-Render Benchmark</span>
              {stats.isBenchmarking && (
                <span className="text-[10px] text-accent-blue font-mono animate-pulse">
                  Calibrating ({stats.benchmarkProgress}%)
                </span>
              )}
            </div>

            {!stats.isBenchmarking && !stats.benchmarkResult && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onStartBenchmark && onStartBenchmark(10)}
                className="w-full text-xs gap-1.5 h-8 justify-center rounded-pill"
              >
                <Play className="w-3.5 h-3.5 text-accent-blue" />
                <span>Run 10s Automated Calibration</span>
              </Button>
            )}

            {stats.benchmarkResult && !stats.isBenchmarking && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-surface-1 border border-hairline">
                    <span className="text-[10px] text-ink-muted block">p50</span>
                    <span className="font-mono font-bold text-ink">{stats.benchmarkResult.g2gMedianMs}ms</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-1 border border-hairline">
                    <span className="text-[10px] text-ink-muted block">p95</span>
                    <span className="font-mono font-bold text-amber-400">{stats.benchmarkResult.g2gP95Ms}ms</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-1 border border-hairline">
                    <span className="text-[10px] text-ink-muted block">Min/Max</span>
                    <span className="font-mono font-bold text-ink">{stats.benchmarkResult.g2gMinMs}/{stats.benchmarkResult.g2gMaxMs}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyBenchmark}
                    className="flex-1 text-[11px] h-7 gap-1 rounded-pill"
                  >
                    {copiedBenchmark ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedBenchmark ? 'Copied Report' : 'Copy JSON'}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onResetBenchmark}
                    className="text-[11px] h-7 px-2 text-ink-muted hover:text-ink rounded-pill"
                    title="Reset"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: VIRTUAL D-PAD & GAMEPLAY CONTROLS */}
        <TabsContent value="controls" className="space-y-4 pt-2">
          {onSendKey && <VirtualDpad onSendKey={onSendKey} />}

          {/* Quick Remote Navigation Buttons */}
          <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline space-y-2">
            <span className="text-xs font-medium text-ink block">Quick Remote Keys</span>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSendKey && onSendKey(ANDROID_KEYCODES.KEYCODE_ENTER)}
                className="text-xs h-8 rounded-lg"
              >
                Enter
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSendKey && onSendKey(ANDROID_KEYCODES.KEYCODE_DEL)}
                className="text-xs h-8 rounded-lg"
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSendKey && onSendKey(ANDROID_KEYCODES.KEYCODE_SPACE)}
                className="text-xs h-8 rounded-lg"
              >
                Space
              </Button>
            </div>
          </div>

          {/* Mouse Pointer Lock Toggle */}
          <div className="p-3 rounded-xl bg-surface-2/40 border border-hairline flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <div className="flex items-center space-x-1.5">
                <MousePointer className="w-3.5 h-3.5 text-accent-blue" />
                <span className="text-xs font-medium text-ink">Pointer Lock Mode</span>
              </div>
              <p className="text-[11px] text-ink-muted">Locks mouse cursor to remote stream for FPS games.</p>
            </div>
            <Button
              variant={isPointerLocked ? 'default' : 'secondary'}
              size="sm"
              onClick={isPointerLocked ? onExitPointerLock : onRequestPointerLock}
              className="text-xs h-8 px-3 shrink-0 rounded-pill"
            >
              {isPointerLocked ? 'Unlock (Esc)' : 'Lock Cursor'}
            </Button>
          </div>

          {/* Audio Stream Controller Card */}
          {onToggleMute && (
            <div className="p-3.5 rounded-xl bg-surface-2/40 border border-hairline space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-accent-blue" />
                  )}
                  <span className="text-xs font-medium text-ink">Master Audio Stream</span>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    isMuted
                      ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                      : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                  }`}
                >
                  {isMuted ? 'Muted' : 'Live Audio'}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button
                  variant={isMuted ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={onToggleMute}
                  className="text-xs h-8 px-3 shrink-0 rounded-pill gap-1.5"
                >
                  {isMuted ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Unmute (M)</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mute (M)</span>
                    </>
                  )}
                </Button>

                {onVolumeChange && (
                  <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : (volume ?? 1)}
                      onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-accent-blue"
                    />
                    <span className="font-mono text-[11px] text-ink-muted w-8 text-right">
                      {Math.round((isMuted ? 0 : (volume ?? 1)) * 100)}%
                    </span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-ink-muted">
                Unified master controller synchronizing browser Web Audio gain and Android OS media volume.
              </p>
            </div>
          )}
        </TabsContent>

        {/* TAB 3: DEVICE & STORAGE SPECS */}
        <TabsContent value="specs" className="space-y-4 pt-2">
          {/* Framer Atmospheric Signature Spotlight Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-900/40 via-indigo-900/30 to-black border border-purple-500/20 shadow-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-white">Redroid Android 13</span>
              </div>
              <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-[10px]">
                AOSP Sandbox
              </Badge>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Dedicated kernel IPC container with hardware acceleration and zero-transcode raw NAL relay.
            </p>
          </div>

          {/* Session Metadata Specs */}
          <div className="divide-y divide-hairline bg-surface-2/40 border border-hairline rounded-xl px-3 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-ink-muted">Session ID</span>
              <button
                onClick={handleCopyId}
                className="flex items-center space-x-1 font-mono text-[11px] text-ink hover:text-accent-blue transition-colors cursor-pointer"
                title="Copy Session ID"
              >
                <span>{sessionId.slice(0, 12)}...</span>
                {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-ink-muted" />}
              </button>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-ink-muted">Video Codec</span>
              <span className="font-mono text-ink font-medium">{activeCodec} (WebCodecs)</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-ink-muted">Audio Codec</span>
              <span className="font-mono text-ink font-medium">AAC-LC 128 Kbps (Channel 0x01)</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-ink-muted">Session Uptime</span>
              <span className="font-mono text-ink">{formatTime(sessionDurationSec)}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-ink-muted">Kiosk Lockdown</span>
              <span className="text-ink">{kioskEnabled ? '🔒 Clock Active (Single-App)' : 'Disabled (Open OS)'}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-ink-muted">Session Recording</span>
              <span className="text-ink">{recording ? '🔴 Active (MP4 Mux)' : 'Disabled'}</span>
            </div>
          </div>

          {/* MP4 Recording Download Button if Recording was Enabled */}
          {recording && (
            <div className="p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-accent-blue shrink-0" />
                <span className="text-xs font-medium text-ink">Live MP4 Recording</span>
              </div>
              <a href={`/api/sessions/${sessionId}/recording`} download target="_blank" rel="noreferrer">
                <Button size="sm" variant="default" className="text-xs gap-1.5 h-7 rounded-pill">
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </Button>
              </a>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
