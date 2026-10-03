import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useVideoDecoder } from '../hooks/useVideoDecoder';
import { useWebSocket } from '../hooks/useWebSocket';
import { useInputCapture, InputMode } from '../hooks/useInputCapture';
import { useLatencyStats, LatencyStats } from '../hooks/useLatencyStats';
import { BootMilestones } from './BootMilestones';
import { PhoneChassis } from './PhoneChassis';
import { SessionInspector } from './SessionInspector';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { CodecFactory } from '../lib/codec/registry';
import {
  AlertCircle,
  ChevronLeft,
  Circle,
  Square,
  Volume2,
  VolumeX,
  Minus,
  Plus,
  Send,
  Power,
  Clipboard,
} from 'lucide-react';

interface DeviceCanvasProps {
  sessionId: string;
  kioskEnabled?: boolean;
  targetPackage?: string;
  recording?: boolean;
  onDisconnect?: () => void;
  onSendControlReady?: (sendControl: (payload: Uint8Array | ArrayBuffer) => void) => void;
  inputMode?: InputMode;
  onToggleInputMode?: () => void;
  onStatsUpdate?: (stats: LatencyStats, durationSec: number, isConnected: boolean) => void;
  onAudioPacket?: (data: Uint8Array, ptsUs: number, isConfig: boolean) => void;
  isMuted?: boolean;
  volume?: number;
  onToggleMute?: () => void;
  onVolumeChange?: (volume: number) => void;
  onUserInteraction?: () => void;
}

export const DeviceCanvas: React.FC<DeviceCanvasProps> = ({
  sessionId,
  kioskEnabled = false,
  targetPackage = 'com.android.deskclock',
  recording = false,
  onDisconnect,
  onSendControlReady,
  inputMode: externalInputMode,
  onToggleInputMode,
  onStatsUpdate,
  onAudioPacket,
  isMuted,
  volume,
  onToggleMute,
  onVolumeChange,
  onUserInteraction,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [decoderError, setDecoderError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSocketClosed, setIsSocketClosed] = useState(false);
  const [sessionDurationSec, setSessionDurationSec] = useState(0);
  const [localInputMode, setLocalInputMode] = useState<InputMode>('touch');
  const activeInputMode = externalInputMode || localInputMode;

  const [activeCodec, setActiveCodec] = useState<string>('H.264');
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const lastLocalClipboardSentRef = useRef<string>('');

  // Track session uptime
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss clipboard notification after 4s
  useEffect(() => {
    if (!clipboardNotice) return;
    const timer = setTimeout(() => {
      setClipboardNotice(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [clipboardNotice]);

  // Alt+M hotkey to toggle between Touch and D-pad mode
  useEffect(() => {
    const handleToggleModeKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyM') {
        e.preventDefault();
        if (onToggleInputMode) {
          onToggleInputMode();
        } else {
          setLocalInputMode((prev) => (prev === 'touch' ? 'dpad' : 'touch'));
        }
      }
    };
    window.addEventListener('keydown', handleToggleModeKey);
    return () => window.removeEventListener('keydown', handleToggleModeKey);
  }, [onToggleInputMode]);

  const {
    stats,
    recordFrameRendered,
    recordBytes,
    recordPong,
    startBenchmark,
    resetBenchmark,
  } = useLatencyStats();

  const { init, feedPacket, setCodec, destroy } = useVideoDecoder({
    canvasRef,
    onFirstFrame: () => setHasFirstFrame(true),
    onFrameRendered: recordFrameRendered,
    onError: (err) => setDecoderError(err.message || 'Decoder failure'),
  });

  // Handle incoming remote clipboard text from Android container (BR-3)
  const handleRemoteClipboard = useCallback((remoteText: string) => {
    if (!remoteText || remoteText === lastLocalClipboardSentRef.current) {
      return; // Suppress infinite echo loop
    }

    setClipboardNotice(remoteText);

    // If browser window is focused and Clipboard API is permitted, sync directly
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      if (document.hasFocus()) {
        navigator.clipboard.writeText(remoteText).catch(() => {
          // Handled via visual toast with 1-click fallback
        });
      }
    }
  }, []);

  const { isConnected, error: wsError, sendControl, sendPing } = useWebSocket({
    sessionId,
    onVideoPacket: (nalData, ptsUs, isKey, isConfig) => {
      feedPacket(nalData, ptsUs, isKey, isConfig);
    },
    onAudioPacket: (data, ptsUs, isConfig) => {
      onAudioPacket?.(data, ptsUs, isConfig);
    },
    onMetadata: (meta) => {
      setCodec(meta.wireCodecId);
      const handler = CodecFactory.getByWireId(meta.wireCodecId);
      setActiveCodec(handler.label);
    },
    onClipboardReceived: (text) => {
      handleRemoteClipboard(text);
    },
    onPong: recordPong,
    onBytesReceived: recordBytes,
    onClose: () => {
      setIsSocketClosed(true);
    },
  });

  // Periodic network RTT ping (1.5s idle, 200ms during active benchmarking)
  useEffect(() => {
    if (!isConnected) return;
    sendPing();
    const intervalMs = stats.isBenchmarking ? 200 : 1500;
    const interval = window.setInterval(() => {
      sendPing();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [isConnected, sendPing, stats.isBenchmarking]);

  // Sync stats and duration with parent component
  useEffect(() => {
    if (onStatsUpdate) {
      onStatsUpdate(stats, sessionDurationSec, isConnected);
    }
  }, [stats, sessionDurationSec, isConnected, onStatsUpdate]);

  const {
    sendBack,
    sendHome,
    sendAppSwitch,
    sendPower,
    sendKey,
    sendText,
    sendClipboard,
    isFocused,
    isPointerLocked,
    requestPointerLock,
    exitPointerLock,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyDown,
    handleKeyUp,
    handleContextMenu,
    handleFocus,
    handleBlur,
  } = useInputCapture({
    canvasRef,
    sendControl,
    deviceWidth: 1080,
    deviceHeight: 1920,
    enabled: isConnected,
    inputMode: activeInputMode,
    kioskEnabled,
  });

  useEffect(() => {
    if (onSendControlReady) {
      onSendControlReady(sendControl);
    }
  }, [sendControl, onSendControlReady]);

  useEffect(() => {
    init();
    return () => {
      destroy();
    };
  }, [init, destroy]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendText(inputText);
    setInputText('');
  };

  const handlePasteClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          lastLocalClipboardSentRef.current = text;
          sendClipboard(text, true);
        }
      } else {
        const text = prompt('Enter text to paste into Android:');
        if (text) {
          lastLocalClipboardSentRef.current = text;
          sendClipboard(text, true);
        }
      }
    } catch {
      const text = prompt('Enter text to paste into Android:');
      if (text) {
        lastLocalClipboardSentRef.current = text;
        sendClipboard(text, true);
      }
    }
  };

  const handleManualCopyRemoteText = async () => {
    if (!clipboardNotice) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clipboardNotice);
        setClipboardNotice(null);
      }
    } catch {
      // Handled silently
    }
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start max-w-6xl mx-auto">
        {/* PRIMARY DEVICE STAGE (Desktop 7-8 cols, Full width on mobile/tablet) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-center space-y-4 w-full">
          {/* Phone Chassis Framing the Live WebCodecs Video */}
          <PhoneChassis
            isFocused={isFocused}
            inputMode={activeInputMode}
            isPointerLocked={isPointerLocked}
            clipboardNotice={clipboardNotice}
            onCopyClipboardNotice={handleManualCopyRemoteText}
            hasFirstFrame={hasFirstFrame}
          >
            <canvas
              ref={canvasRef}
              width={1080}
              height={1920}
              className={`w-full h-full object-contain transition-opacity duration-300 outline-none select-none touch-none ${
                hasFirstFrame ? 'opacity-100' : 'opacity-0'
              } ${
                isPointerLocked
                  ? 'cursor-none'
                  : activeInputMode === 'dpad'
                  ? 'cursor-default'
                  : 'cursor-crosshair'
              }`}
              tabIndex={0}
              onPointerDown={(e) => {
                onUserInteraction?.();
                handlePointerDown(e);
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onContextMenu={handleContextMenu}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onClick={() => canvasRef.current?.focus()}
            />

            {/* Boot Milestones Stepper (Goal-Gradient Effect & Doherty Threshold) */}
            {!hasFirstFrame && !decoderError && !wsError && (
              <BootMilestones onCancel={onDisconnect} />
            )}

            {/* Streaming Interrupted Error Overlay */}
            {(decoderError || wsError || (isSocketClosed && !hasFirstFrame)) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas/95 p-6 text-center space-y-3 z-30">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <h4 className="text-base font-semibold text-ink">Streaming Interrupted</h4>
                <p className="text-xs text-ink-muted max-w-xs leading-relaxed">
                  {decoderError || wsError || 'Connection to Android session closed by server.'}
                </p>
                <Button
                  onClick={onDisconnect}
                  variant="default"
                  size="sm"
                  className="mt-2 text-xs rounded-pill"
                >
                  Return to Dashboard
                </Button>
              </div>
            )}
          </PhoneChassis>

          {/* DOCKED VIRTUAL NAVIGATION DOCK & TEXT INPUT (Fitts's Law >=44px) */}
          {hasFirstFrame && (
            <div className="w-full max-w-[430px] space-y-2 select-none">
              {!kioskEnabled ? (
                <div className="flex items-center justify-between px-3 sm:px-4 py-1.5 rounded-2xl bg-surface-1 border border-hairline shadow-lg">
                  {/* Unified Master Audio Controller (Web & Android Synced) */}
                  <div className="flex items-center bg-surface-2/80 border border-hairline rounded-xl px-1 sm:px-1.5 py-0.5 gap-0.5 sm:gap-1 shadow-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            onUserInteraction?.();
                            onToggleMute?.();
                          }}
                          aria-label={isMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-3 transition-colors cursor-pointer active:scale-95 text-ink-muted hover:text-ink"
                        >
                          {isMuted ? (
                            <VolumeX className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-accent-blue" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{isMuted ? 'Unmute (M or Alt+U)' : 'Mute (M or Alt+U)'}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            onUserInteraction?.();
                            const current = isMuted ? 0 : (volume ?? 1);
                            onVolumeChange?.(Math.max(0, Math.round((current - 0.08) * 100) / 100));
                          }}
                          aria-label="Volume Down"
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors cursor-pointer active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Volume Down (Website & App)</TooltipContent>
                    </Tooltip>

                    <span className="font-mono text-[11px] font-semibold text-ink w-7 sm:w-8 text-center select-none">
                      {Math.round((isMuted ? 0 : (volume ?? 1)) * 100)}%
                    </span>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            onUserInteraction?.();
                            const current = isMuted ? 0 : (volume ?? 1);
                            onVolumeChange?.(Math.min(1, Math.round((current + 0.08) * 100) / 100));
                          }}
                          aria-label="Volume Up"
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors cursor-pointer active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Volume Up (Website & App)</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="h-5 w-px bg-hairline" />

                  {/* Primary Navigation (Back, Home, Recents) */}
                  <div className="flex items-center space-x-2 sm:space-x-4">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={sendBack}
                          aria-label="Back"
                          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-surface-2 text-ink hover:text-white transition-colors cursor-pointer active:scale-95"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Back (Esc / Right-Click)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={sendHome}
                          aria-label="Home"
                          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-surface-2 text-ink hover:text-white transition-colors cursor-pointer active:scale-95"
                        >
                          <Circle className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Home (Middle-Click)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={sendAppSwitch}
                          aria-label="Recent Apps"
                          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-surface-2 text-ink hover:text-white transition-colors cursor-pointer active:scale-95"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Recent Apps (Alt+Tab)</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="h-5 w-px bg-hairline" />

                  {/* System Power & Wake */}
                  <div className="flex items-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={sendPower}
                          aria-label="Power"
                          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-surface-2 text-ink-muted hover:text-rose-400 transition-colors cursor-pointer active:scale-95"
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Power / Screen Wake</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ) : (
                /* Kiosk Mode Status Bar Banner */
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shadow-sm">
                  <span className="font-semibold">🔒 Kiosk Lockdown Active</span>
                  <span className="text-[11px] text-amber-200/80">
                    Locked to {targetPackage.includes('deskclock') ? 'Clock' : targetPackage}
                  </span>
                </div>
              )}

              {/* Text Injection & Host Clipboard Bar */}
              <form
                onSubmit={handleTextSubmit}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-2xl bg-surface-1 border border-hairline shadow-sm"
              >
                <Input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type or paste text into Android..."
                  className="flex-1 bg-transparent border-none text-xs focus-visible:ring-0 focus-visible:ring-offset-0 px-1 text-ink placeholder:text-ink-muted h-8"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handlePasteClipboard}
                      className="h-8 px-2.5 text-xs text-ink-muted hover:text-ink gap-1 rounded-lg cursor-pointer shrink-0"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-accent-blue" />
                      <span className="hidden sm:inline">Paste</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Paste Host Clipboard (Ctrl+V)</TooltipContent>
                </Tooltip>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={!inputText.trim()}
                  className="h-8 px-3 text-xs rounded-lg cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* CONSOLIDATED INSPECTOR SIDEBAR (Desktop 4-5 cols, Full width on mobile/tablet) */}
        <div className="lg:col-span-5 xl:col-span-4 w-full lg:sticky lg:top-20">
          <SessionInspector
            stats={stats}
            activeCodec={activeCodec}
            sessionId={sessionId}
            kioskEnabled={kioskEnabled}
            recording={recording}
            sessionDurationSec={sessionDurationSec}
            onStartBenchmark={startBenchmark}
            onResetBenchmark={resetBenchmark}
            onSendKey={sendKey}
            isPointerLocked={isPointerLocked}
            onRequestPointerLock={requestPointerLock}
            onExitPointerLock={exitPointerLock}
            isMuted={isMuted}
            volume={volume}
            onToggleMute={onToggleMute}
            onVolumeChange={onVolumeChange}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};
