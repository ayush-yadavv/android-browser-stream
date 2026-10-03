import React from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import {
  ArrowLeft,
  Smartphone,
  Maximize2,
  Minimize2,
  Keyboard,
  Touchpad,
  Gamepad2,
  Power,
  Zap,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface SessionTopBarProps {
  sessionId: string;
  kioskEnabled?: boolean;
  recording?: boolean;
  recordingDurationSec?: number;
  inputMode: 'touch' | 'dpad';
  onToggleInputMode: () => void;
  onOpenHotkeys: () => void;
  onEndSession: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  estimatedLatencyMs?: number;
  fps?: number;
  isConnected?: boolean;
  isMuted?: boolean;
  volume?: number;
  onToggleMute?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export const SessionTopBar: React.FC<SessionTopBarProps> = ({
  sessionId,
  kioskEnabled = false,
  recording = false,
  recordingDurationSec = 0,
  inputMode,
  onToggleInputMode,
  onOpenHotkeys,
  onEndSession,
  isFullscreen,
  onToggleFullscreen,
  estimatedLatencyMs = 0,
  fps = 60,
  isConnected = true,
  isMuted = true,
  volume = 1.0,
  onToggleMute,
  onVolumeChange,
}) => {
  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="w-full h-14 bg-surface-1/70 backdrop-blur-md border-b border-hairline px-3 sm:px-6 flex items-center justify-between transition-all select-none">
      {/* Left: Navigation Breadcrumb & Session Identity */}
      <div className="flex items-center space-x-2 sm:space-x-3 truncate">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEndSession}
          className="gap-1.5 text-ink-muted hover:text-ink -ml-1 sm:-ml-2 h-9 px-2 sm:px-3 text-xs"
          title="Return to Dashboard (Esc)"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline font-medium">Dashboard</span>
        </Button>

        <div className="h-4 w-px bg-hairline shrink-0" />

        {/* Device Badges */}
        <div className="flex items-center space-x-2 truncate">
          <div className="flex items-center space-x-1.5 shrink-0">
            <Smartphone className="w-4 h-4 text-accent-blue" />
            <h2 className="text-xs sm:text-sm font-semibold text-ink">Redroid 13</h2>
          </div>

          <Badge variant="outline" className="font-mono text-[10px] hidden lg:inline-flex shrink-0">
            {sessionId.slice(0, 8)}...
          </Badge>

          {/* Kiosk Mode Indicator (Von Restorff / Selective Attention) */}
          {kioskEnabled && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10 shrink-0 font-medium"
            >
              🔒 Kiosk
            </Badge>
          )}

          {/* Recording Active Indicator */}
          {recording && (
            <Badge
              variant="outline"
              className="text-[10px] border-red-500/40 text-red-300 bg-red-500/10 flex items-center gap-1 shrink-0 font-mono"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span>REC {formatDuration(recordingDurationSec)}</span>
            </Badge>
          )}

          {/* Latency & FPS Pill Indicator */}
          {isConnected && (
            <Badge
              variant="outline"
              className={`text-[10px] hidden sm:inline-flex items-center gap-1.5 shrink-0 ${
                estimatedLatencyMs <= 35
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                  : estimatedLatencyMs <= 50
                  ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                  : 'border-rose-500/30 text-rose-400 bg-rose-500/10'
              }`}
            >
              <Zap className="w-2.5 h-2.5" />
              <span>~{estimatedLatencyMs}ms · {fps || 60} FPS</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Right: Studio Control Actions */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        {/* Audio Mute & Volume Control Pill */}
        {onToggleMute && (
          <div className="flex items-center bg-surface-2 border border-hairline rounded-full h-8 sm:h-9 px-2 gap-1.5 transition-all">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleMute}
                  className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer active:scale-95 focus:outline-none"
                  aria-label={isMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden md:inline text-[11px] font-medium text-amber-400">Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-accent-blue" />
                      <span className="hidden md:inline text-[11px] font-medium text-ink">
                        {Math.round((volume ?? 1) * 100)}%
                      </span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isMuted ? 'Click to Unmute Device Audio (M or Alt+U)' : 'Click to Mute Device Audio (M or Alt+U)'}
              </TooltipContent>
            </Tooltip>

            {/* Compact Volume Slider on sm+ screens */}
            {onVolumeChange && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : (volume ?? 1)}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="hidden sm:inline-block w-14 lg:w-18 h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-accent-blue"
                title={`Volume: ${Math.round((isMuted ? 0 : (volume ?? 1)) * 100)}%`}
              />
            )}
          </div>
        )}

        {/* Input Mode Toggle (Touch vs D-Pad) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={onToggleInputMode}
              className={`h-8 sm:h-9 px-2 sm:px-3 text-xs gap-1.5 rounded-full transition-all active:scale-95 ${
                inputMode === 'dpad'
                  ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                  : 'border-hairline text-ink-muted hover:text-ink'
              }`}
              aria-label="Toggle Input Mode (Alt+M)"
            >
              {inputMode === 'dpad' ? (
                <>
                  <Gamepad2 className="w-3.5 h-3.5 text-accent-blue" />
                  <span className="hidden sm:inline font-medium">D-Pad Mode</span>
                </>
              ) : (
                <>
                  <Touchpad className="w-3.5 h-3.5 text-ink-muted" />
                  <span className="hidden sm:inline font-medium">Touch Mode</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Switch between Touch and D-pad TV navigation (Alt+M)</TooltipContent>
        </Tooltip>

        {/* Hotkeys Cheatsheet Dialog Trigger */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenHotkeys}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-surface-2 border border-hairline flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer active:scale-95"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Keyboard Shortcuts Cheatsheet</TooltipContent>
        </Tooltip>

        {/* Fullscreen Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleFullscreen}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-surface-2 border border-hairline flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer active:scale-95"
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</TooltipContent>
        </Tooltip>

        {/* Primary CTA: End Session White Pill Button (button-primary per DESIGN.md) */}
        <Button
          variant="default"
          size="sm"
          onClick={onEndSession}
          className="h-8 sm:h-9 px-3 sm:px-4 text-xs font-medium rounded-pill gap-1.5 shadow-sm active:scale-95"
          title="Terminate Session"
        >
          <Power className="w-3.5 h-3.5 text-neutral-900" />
          <span className="hidden xs:inline">End Session</span>
          <span className="xs:hidden">End</span>
        </Button>
      </div>
    </header>
  );
};
