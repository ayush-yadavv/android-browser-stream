import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DeviceCanvas } from '../components/DeviceCanvas';
import { SessionTopBar } from '../components/SessionTopBar';
import { HotkeysModal } from '../components/HotkeysModal';
import { SessionSummaryDialog } from '../components/SessionSummaryDialog';
import { Button } from '../components/ui/button';
import { AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { SessionData } from '../types/session';
import { LatencyStats } from '../hooks/useLatencyStats';
import { InputMode } from '../hooks/useInputCapture';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { ANDROID_KEYCODES } from '../lib/keymap';
import { buildKeycodeEvent, ACTION_DOWN, ACTION_UP } from '../lib/control';

export const SessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const pageContainerRef = useRef<HTMLDivElement | null>(null);

  const [session, setSession] = useState<SessionData | null>(() => {
    const stateSession = (location.state as any)?.session as SessionData | undefined;
    if (stateSession && stateSession.id === sessionId) {
      return stateSession;
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(!session);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('touch');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [sessionDurationSec, setSessionDurationSec] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<LatencyStats>({
    fps: 60,
    jitterMs: 0,
    rttMs: 4,
    rttP50Ms: 4,
    rttP95Ms: 6,
    rttMinMs: 2,
    rttMaxMs: 10,
    bitrateKbps: 0,
    totalFrames: 0,
    estimatedGlassToGlassMs: 24,
    isBenchmarking: false,
    benchmarkProgress: 0,
    benchmarkResult: null,
  });

  const {
    isMuted,
    volume,
    toggleMute,
    setMuted,
    setVolume,
    playChunk: playAudioChunk,
    unlockAudio,
  } = useAudioPlayer();

  const sendControlRef = useRef<((payload: Uint8Array | ArrayBuffer) => void) | null>(null);

  const sendAndroidKey = useCallback((keycode: number) => {
    if (!sendControlRef.current) return;
    sendControlRef.current(buildKeycodeEvent({ action: ACTION_DOWN, keycode }));
    sendControlRef.current(buildKeycodeEvent({ action: ACTION_UP, keycode }));
  }, []);

  // Unified Master Volume Controller: syncs both Web Audio GainNode & Android media volume
  const handleUnifiedVolumeChange = useCallback(
    (newVol: number) => {
      const clamped = Math.max(0, Math.min(1, newVol));
      const oldVol = isMuted ? 0 : volume;
      setVolume(clamped);

      if (isMuted && clamped > 0) {
        setMuted(false);
        unlockAudio();
      }

      // Sync Android media volume steps (15 discrete steps in Android AudioManager)
      const oldStep = Math.round(oldVol * 15);
      const newStep = Math.round(clamped * 15);
      const diff = newStep - oldStep;

      if (diff > 0) {
        for (let i = 0; i < Math.min(diff, 5); i++) {
          sendAndroidKey(ANDROID_KEYCODES.KEYCODE_VOLUME_UP);
        }
      } else if (diff < 0) {
        for (let i = 0; i < Math.min(-diff, 5); i++) {
          sendAndroidKey(ANDROID_KEYCODES.KEYCODE_VOLUME_DOWN);
        }
      }
    },
    [isMuted, volume, setVolume, setMuted, unlockAudio, sendAndroidKey]
  );

  // Unified Master Mute: syncs both Web Audio & Android
  const handleUnifiedToggleMute = useCallback(() => {
    unlockAudio();
    toggleMute();
    sendAndroidKey(ANDROID_KEYCODES.KEYCODE_VOLUME_MUTE);
  }, [unlockAudio, toggleMute, sendAndroidKey]);

  // Audio Mute hotkey: 'M' (when not in text input) or 'Alt + U'
  useEffect(() => {
    const handleAudioHotkeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((e.code === 'KeyM' && !isInput && !e.ctrlKey && !e.metaKey) || (e.altKey && e.code === 'KeyU')) {
        e.preventDefault();
        handleUnifiedToggleMute();
      }
    };
    window.addEventListener('keydown', handleAudioHotkeys);
    return () => window.removeEventListener('keydown', handleAudioHotkeys);
  }, [handleUnifiedToggleMute]);

  // Deep linking & refresh recovery: Fetch session metadata from backend if not already cached
  useEffect(() => {
    if (!sessionId) {
      setError('Invalid session ID');
      setIsLoading(false);
      return;
    }

    if (session && session.id === sessionId) {
      setIsLoading(false);
      return;
    }

    let isSubscribed = true;
    const verifySession = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('This session has expired or does not exist.');
          }
          throw new Error(`Failed to load session details (HTTP ${res.status}).`);
        }
        const data: SessionData = await res.json();
        if (data.status === 'terminated') {
          throw new Error('This session has already been terminated.');
        }
        if (isSubscribed) {
          setSession(data);
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err.message || 'Unable to connect to session.');
        }
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    verifySession();
    return () => {
      isSubscribed = false;
    };
  }, [sessionId]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (pageContainerRef.current?.requestFullscreen) {
        pageContainerRef.current.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleStatsUpdate = useCallback((latestStats: LatencyStats, durationSec: number, connected: boolean) => {
    setStats(latestStats);
    setSessionDurationSec(durationSec);
    setIsConnected(connected);
  }, []);

  const handleToggleInputMode = useCallback(() => {
    setInputMode((prev) => (prev === 'touch' ? 'dpad' : 'touch'));
  }, []);

  const handleEndSessionClick = useCallback(() => {
    // Peak-End Rule: Show summary celebration dialog before tearing down
    setShowSummaryDialog(true);
  }, []);

  const handleConfirmDisconnect = async () => {
    setShowSummaryDialog(false);
    if (!sessionId) {
      navigate('/');
      return;
    }

    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to terminate session on server:', err);
    } finally {
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
        <p className="text-sm text-ink-muted">Resolving Android session container...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mx-auto flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ink">Session Unavailable</h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            {error || 'The requested streaming session could not be found.'}
          </p>
        </div>
        <Button onClick={() => navigate('/')} variant="default" className="gap-2 rounded-pill">
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={pageContainerRef}
      className={`space-y-4 w-full mx-auto transition-all ${
        isFullscreen ? 'p-4 bg-canvas fixed inset-0 z-50 overflow-y-auto' : 'py-2 max-w-6xl'
      }`}
    >
      {/* Studio Top Bar with Breadcrumbs, Badges, Mode Switcher, and End Session CTA */}
      <SessionTopBar
        sessionId={session.id}
        kioskEnabled={session.kiosk_enabled}
        recording={session.recording}
        recordingDurationSec={sessionDurationSec}
        inputMode={inputMode}
        onToggleInputMode={handleToggleInputMode}
        onOpenHotkeys={() => setShowHotkeys(true)}
        onEndSession={handleEndSessionClick}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        estimatedLatencyMs={stats.estimatedGlassToGlassMs}
        fps={stats.fps}
        isConnected={isConnected}
        isMuted={isMuted}
        volume={volume}
        onToggleMute={handleUnifiedToggleMute}
        onVolumeChange={handleUnifiedVolumeChange}
      />

      {/* Main Interactive Studio Stage & Tabbed Inspector */}
      <DeviceCanvas
        sessionId={session.id}
        kioskEnabled={session.kiosk_enabled}
        targetPackage={session.target_package}
        recording={session.recording}
        onDisconnect={handleEndSessionClick}
        onSendControlReady={(sendControl) => {
          sendControlRef.current = sendControl;
        }}
        inputMode={inputMode}
        onToggleInputMode={handleToggleInputMode}
        onStatsUpdate={handleStatsUpdate}
        onAudioPacket={playAudioChunk}
        isMuted={isMuted}
        volume={volume}
        onToggleMute={handleUnifiedToggleMute}
        onVolumeChange={handleUnifiedVolumeChange}
        onUserInteraction={unlockAudio}
      />

      {/* Desktop Keyboard Shortcuts Cheatsheet Modal */}
      <HotkeysModal isOpen={showHotkeys} onClose={() => setShowHotkeys(false)} />

      {/* Peak-End Rule Session Summary & Recording Download Dialog */}
      <SessionSummaryDialog
        isOpen={showSummaryDialog}
        onClose={() => setShowSummaryDialog(false)}
        onConfirmDisconnect={handleConfirmDisconnect}
        stats={stats}
        sessionDurationSec={sessionDurationSec}
        sessionId={session.id}
        recording={session.recording}
      />
    </div>
  );
};
