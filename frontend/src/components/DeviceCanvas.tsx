import React, { useEffect, useRef, useState } from 'react';
import { useVideoDecoder } from '../hooks/useVideoDecoder';
import { useWebSocket } from '../hooks/useWebSocket';
import { useInputCapture } from '../hooks/useInputCapture';
import { useLatencyStats } from '../hooks/useLatencyStats';
import { LatencyHud } from './LatencyHud';
import {
  Loader2,
  AlertCircle,
  Wifi,
  ChevronLeft,
  Circle,
  Square,
  Volume1,
  Volume2,
  Send,
  Keyboard,
  Activity,
  Power,
  Clipboard,
} from 'lucide-react';

interface DeviceCanvasProps {
  sessionId: string;
  onDisconnect?: () => void;
  onSendControlReady?: (sendControl: (payload: Uint8Array | ArrayBuffer) => void) => void;
}

export const DeviceCanvas: React.FC<DeviceCanvasProps> = ({
  sessionId,
  onDisconnect,
  onSendControlReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [decoderError, setDecoderError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isHudOpen, setIsHudOpen] = useState(true);
  const [isSocketClosed, setIsSocketClosed] = useState(false);

  const { stats, recordFrameRendered, recordBytes, recordPong } = useLatencyStats();

  const { init, feedPacket, destroy } = useVideoDecoder({
    canvasRef,
    onFirstFrame: () => setHasFirstFrame(true),
    onFrameRendered: recordFrameRendered,
    onError: (err) => setDecoderError(err.message || 'Decoder failure'),
  });

  const { isConnected, error: wsError, sendControl, sendPing } = useWebSocket({
    sessionId,
    onVideoPacket: (nalData, ptsUs, isKey, isConfig) => {
      feedPacket(nalData, ptsUs, isKey, isConfig);
    },
    onPong: recordPong,
    onBytesReceived: recordBytes,
    onClose: () => {
      setIsSocketClosed(true);
    },
  });

  // Periodic network RTT ping every 1.5s
  useEffect(() => {
    if (!isConnected) return;
    sendPing();
    const interval = window.setInterval(() => {
      sendPing();
    }, 1500);
    return () => window.clearInterval(interval);
  }, [isConnected, sendPing]);

  const {
    sendBack,
    sendHome,
    sendAppSwitch,
    sendVolumeUp,
    sendVolumeDown,
    sendPower,
    sendText,
    sendClipboard,
    isFocused,
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
          sendClipboard(text, true);
        }
      } else {
        const text = prompt('Enter text to paste into Android:');
        if (text) {
          sendClipboard(text, true);
        }
      }
    } catch {
      const text = prompt('Enter text to paste into Android:');
      if (text) {
        sendClipboard(text, true);
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 w-full max-w-5xl mx-auto">
      {/* Device Column */}
      <div className="flex flex-col items-center w-full max-w-md space-y-3 shrink-0">
        {/* Stream Status Bar */}
        <div className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-surface-1 border border-hairline text-xs">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5">
              <Wifi className={`w-3.5 h-3.5 ${isConnected ? 'text-semantic-success' : 'text-neutral-500'}`} />
              <span className="text-ink font-medium">
                {isConnected ? (hasFirstFrame ? `${stats.fps || 60} FPS` : 'Booting Android...') : 'Connecting...'}
              </span>
            </div>

            {hasFirstFrame && (
              <button
                onClick={() => setIsHudOpen(!isHudOpen)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] transition-colors cursor-pointer ${
                  isHudOpen
                    ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                    : 'bg-surface-2 border-hairline hover:bg-surface-3 text-ink'
                }`}
                title="Toggle Performance HUD (Ctrl+Shift+L)"
              >
                <Activity className="w-3 h-3 text-accent-blue" />
                <span>~{stats.estimatedGlassToGlassMs}ms Latency</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] transition-colors ${
              isFocused ? 'text-accent-blue font-medium' : 'text-ink-muted'
            }`}>
              <Keyboard className={`w-3 h-3 ${isFocused ? 'text-accent-blue' : 'text-neutral-400'}`} />
              {isFocused ? 'Keyboard active' : 'Click to type'}
            </span>
            <span className="font-mono text-[11px] text-ink-muted">1080 × 1920</span>
          </div>
        </div>

        {/* Main Viewport Container */}
        <div className={`relative rounded-2xl bg-black overflow-hidden shadow-2xl flex flex-col items-center justify-center max-h-[78vh] aspect-[9/16] w-full transition-all duration-200 ${
          isFocused ? 'ring-2 ring-accent-blue/50 border border-accent-blue' : 'border border-hairline'
        }`}>
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            className={`w-full h-full object-contain cursor-crosshair transition-opacity duration-300 outline-none select-none touch-none ${
              hasFirstFrame ? 'opacity-100' : 'opacity-0'
            }`}
            tabIndex={0}
            onPointerDown={handlePointerDown}
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

          {/* Loading / Booting Android Overlay */}
          {!hasFirstFrame && !decoderError && !wsError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas/90 backdrop-blur-sm p-6 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-accent-blue animate-spin" />
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-ink">Starting Ephemeral Android 13</h4>
                <p className="text-xs text-ink-muted max-w-xs leading-relaxed">
                  Allocating container sandbox, attaching scrcpy capture server, and syncing H.264 keyframe pipeline...
                </p>
              </div>
            </div>
          )}

          {/* Error Overlay */}
          {(decoderError || wsError || (isSocketClosed && !hasFirstFrame)) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas/95 p-6 text-center space-y-3 z-30">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <h4 className="text-base font-semibold text-ink">Streaming Interrupted</h4>
              <p className="text-xs text-ink-muted max-w-xs">
                {decoderError || wsError || 'Connection to Android session closed by server.'}
              </p>
              <button
                onClick={onDisconnect}
                className="mt-2 px-4 py-1.5 rounded-pill bg-white text-on-primary text-xs font-medium hover:bg-neutral-200 cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          )}
        </div>

      {/* Android System Navigation & Quick Input Toolbar */}
      {hasFirstFrame && (
        <div className="w-full space-y-2">
          {/* Virtual Navigation Bar */}
          <div className="flex items-center justify-between px-6 py-2 rounded-xl bg-surface-1 border border-hairline">
            <div className="flex items-center space-x-1">
              <button
                onClick={sendVolumeDown}
                title="Volume Down"
                className="p-2 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
              >
                <Volume1 className="w-4 h-4" />
              </button>
              <button
                onClick={sendVolumeUp}
                title="Volume Up"
                className="p-2 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-6">
              <button
                onClick={sendBack}
                title="Back (Esc)"
                className="p-2 rounded-lg hover:bg-surface-2 text-ink hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={sendHome}
                title="Home"
                className="p-2 rounded-lg hover:bg-surface-2 text-ink hover:text-white transition-colors"
              >
                <Circle className="w-4 h-4" />
              </button>
              <button
                onClick={sendAppSwitch}
                title="Recent Apps"
                className="p-2 rounded-lg hover:bg-surface-2 text-ink hover:text-white transition-colors"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={sendPower}
                title="Power / Lock Screen"
                className="p-2 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-red-400 transition-colors"
              >
                <Power className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Text Injection & Host Clipboard Sync Bar */}
          <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste or type text to inject directly into Android..."
              className="flex-1 px-4 py-2 rounded-xl bg-surface-1 border border-hairline text-xs text-ink placeholder:text-neutral-500 focus:outline-none focus:border-accent-blue transition-colors"
            />
            <button
              type="button"
              onClick={handlePasteClipboard}
              title="Paste from Host Clipboard (Ctrl+V)"
              className="px-3 py-2 rounded-xl bg-surface-1 border border-hairline hover:bg-surface-2 text-ink text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Clipboard className="w-3.5 h-3.5 text-accent-blue" />
              <span className="hidden sm:inline">Paste</span>
            </button>
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-4 py-2 rounded-xl bg-accent-blue text-white text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
      </div>

      {/* Dedicated Performance HUD Side Panel (Docked alongside device, NEVER overlapping screen) */}
      {isHudOpen && hasFirstFrame && (
        <div className="w-full lg:w-80 shrink-0 space-y-3 animate-in fade-in duration-200">
          <LatencyHud
            stats={stats}
            isOpen={isHudOpen}
            onToggle={() => setIsHudOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
