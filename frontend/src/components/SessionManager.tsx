import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import {
  Play,
  Sparkles,
  MonitorPlay,
  Terminal,
  ShieldCheck,
  Zap,
  Layers,
  Code2,
  Loader2,
  Film,
  Clock,
  Download,
  ArrowRight,
  Lock,
  CheckCircle2,
  Activity,
  CornerDownLeft,
} from 'lucide-react';
import { SessionData } from '../types/session';
import { RecordingPlayerModal } from './RecordingPlayerModal';
import { ScrollArea } from './ui/scroll-area';

export interface LaunchOptions {
  kioskMode?: boolean;
  recordSession?: boolean;
}

interface SessionManagerProps {
  onLaunch: (opts?: LaunchOptions) => void;
  isLaunching: boolean;
  launchError: string | null;
  activeSlots?: number;
  maxSlots?: number;
  sessions?: SessionData[];
}

type InstanceMode = 'standard' | 'kiosk';

export const SessionManager: React.FC<SessionManagerProps> = ({
  onLaunch,
  isLaunching,
  launchError,
  activeSlots = 0,
  maxSlots = 3,
  sessions = [],
}) => {
  const navigate = useNavigate();
  const [instanceMode, setInstanceMode] = useState<InstanceMode>('standard');
  const [recordSession, setRecordSession] = useState<boolean>(false);
  const [selectedSessionForVideo, setSelectedSessionForVideo] = useState<string | null>(null);

  const kioskMode = instanceMode === 'kiosk';

  const availableSlots = Math.max(0, maxSlots - activeSlots);
  const isCapacityFull = availableSlots === 0 && activeSlots >= maxSlots;

  // Active (in-progress) sessions for Zeigarnik Effect (resume interrupted / ongoing tasks)
  const activeSessions = sessions.filter(
    (s) => s.status === 'streaming' || s.status === 'ready'
  );
  const pastSessions = sessions.filter(
    (s) => s.status !== 'streaming' && s.status !== 'ready'
  );

  // Keyboard shortcut listener for Doherty Threshold: 'Enter' launches immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Enter' &&
        !isLaunching &&
        !isCapacityFull &&
        !selectedSessionForVideo &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        onLaunch({ kioskMode, recordSession });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLaunching, isCapacityFull, selectedSessionForVideo, kioskMode, recordSession, onLaunch]);

  const handleResumeSession = (session: SessionData) => {
    navigate(`/session/${session.id}`, { state: { session } });
  };

  return (
    <div className="space-y-20 max-w-6xl mx-auto py-6 select-none font-body">
      {/* ─────────────────────────────────────────────────────────────
          1. HERO & PRIMARY LAUNCHPAD (Aesthetic-Usability & Fitts's Law)
          ───────────────────────────────────────────────────────────── */}
      <section className="text-center space-y-6 pt-4 pb-2">
        {/* Eyebrow Badge (DESIGN.md) */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface-1 border border-hairline text-xs font-medium text-ink-muted shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
          <span>DroidCanvas Engine v2.7</span>
          <span className="w-1 h-1 rounded-full bg-hairline" />
          <span className="text-ink">Sub-50ms Glass-to-Glass</span>
        </div>

        {/* Poster-Grade Display Headline (DESIGN.md: extreme negative tracking) */}
        <div className="space-y-3">
          <h1 className="text-5xl sm:text-7xl lg:text-[76px] font-medium tracking-[-0.05em] leading-[0.92] text-white">
            Interactive Android.
            <br />
            <span className="text-ink-muted font-normal tracking-[-0.04em]">
              Directly in Your Browser.
            </span>
          </h1>
          <p className="text-ink-muted max-w-2xl mx-auto text-base sm:text-lg leading-relaxed pt-2">
            Zero plugins. Zero client downloads. Ephemeral Android 13 sandboxes rendered at 60 FPS
            directly onto your GPU with WebCodecs hardware decoding.
          </p>
        </div>

        {/* Primary Launch Action Area (Fitts's Law, Von Restorff Effect & Doherty Threshold) */}
        <div className="flex flex-col items-center gap-5 pt-3">
          {/* Main Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              onClick={() => onLaunch({ kioskMode, recordSession })}
              disabled={isLaunching || isCapacityFull}
              size="lg"
              className="h-14 px-8 text-base font-medium rounded-pill gap-3 shadow-[0_0_35px_rgba(255,255,255,0.18)] hover:scale-[1.02] active:scale-[0.98] transition-all bg-white text-black hover:bg-neutral-200 cursor-pointer disabled:opacity-50"
            >
              {isLaunching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-black" />
                  <span>Provisioning Sandbox...</span>
                </>
              ) : isCapacityFull ? (
                <span>All Ephemeral Slots In Use</span>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Android Session</span>
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/10 text-black/70">
                    <CornerDownLeft className="w-3 h-3" />
                  </span>
                </>
              )}
            </Button>

            <a href="#architecture">
              <Button
                variant="secondary"
                size="lg"
                className="h-14 px-7 text-sm font-medium rounded-pill bg-surface-1 border border-hairline hover:bg-surface-2 text-ink"
              >
                System Architecture
              </Button>
            </a>
          </div>

          {/* Quick Mode Selection & Recording Add-On (Hick's Law & Choice Overload / Chunking) */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">
              Launch Configuration &amp; Features
            </span>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* Base Environment Mode Selector */}
              <div className="inline-flex p-1 rounded-pill bg-surface-1 border border-hairline text-xs">
                <button
                  type="button"
                  onClick={() => setInstanceMode('standard')}
                  className={`px-4 py-2 rounded-pill font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    instanceMode === 'standard'
                      ? 'bg-surface-2 text-white shadow-sm'
                      : 'text-ink-muted hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-accent-blue" />
                  <span>Standard Android</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInstanceMode('kiosk')}
                  className={`px-4 py-2 rounded-pill font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    instanceMode === 'kiosk'
                      ? 'bg-surface-2 text-white shadow-sm'
                      : 'text-ink-muted hover:text-white'
                  }`}
                  title="Restricted Kiosk Mode: Locks container to AOSP DeskClock and filters navigation events."
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kiosk Lockdown</span>
                </button>
              </div>

              {/* Recording Feature Add-on Toggle Pill */}
              <button
                type="button"
                onClick={() => setRecordSession((prev) => !prev)}
                className={`px-4 py-2 rounded-pill text-xs font-medium border transition-all cursor-pointer flex items-center gap-2 ${
                  recordSession
                    ? 'bg-surface-2 border-emerald-500/40 text-emerald-400 shadow-sm'
                    : 'bg-surface-1 border-hairline text-ink-muted hover:text-white hover:border-hairline/80'
                }`}
                title="Optional feature: Automatically captures lossless fragmented MP4 video of this session."
              >
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    recordSession ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-neutral-600'
                  }`}
                />
                <Film className="w-3.5 h-3.5" />
                <span>Record Session (fMP4)</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                    recordSession ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-2 text-ink-muted'
                  }`}
                >
                  {recordSession ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            <p className="text-[11px] text-ink-muted text-center max-w-lg">
              {instanceMode === 'standard' && !recordSession && 'Full interactive Android 13 OS with touch, keyboard, and audio streaming.'}
              {instanceMode === 'standard' && recordSession && 'Standard Android 13 OS with real-time fMP4 video capture enabled for replay & download.'}
              {instanceMode === 'kiosk' && !recordSession && 'Locked to AOSP DeskClock. Server-side drops Home, Recents, and Status Bar swipes.'}
              {instanceMode === 'kiosk' && recordSession && 'Restricted Kiosk mode with real-time fMP4 video capture enabled for auditing.'}
            </p>
          </div>

          {/* Live Capacity Meter (Goal-Gradient Effect & Law of Common Region) */}
          <div className="flex flex-col items-center gap-1.5 pt-2">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span
                className={`w-2 h-2 rounded-full ${
                  availableSlots > 0 ? 'bg-semantic-success animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>
                Capacity:{' '}
                <strong className="text-white">
                  {availableSlots} of {maxSlots}
                </strong>{' '}
                ephemeral sandboxes available
              </span>
            </div>

            {/* Segmented Capacity Indicator Track */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: maxSlots }).map((_, idx) => {
                const isSlotActive = idx < activeSlots;
                return (
                  <div
                    key={idx}
                    className={`h-1.5 w-8 rounded-full transition-all ${
                      isSlotActive
                        ? 'bg-accent-blue/80'
                        : 'bg-emerald-500/40 border border-emerald-500/20'
                    }`}
                    title={isSlotActive ? `Slot ${idx + 1}: In Use` : `Slot ${idx + 1}: Standby Ready`}
                  />
                );
              })}
            </div>
            <span className="text-[10px] text-ink-muted/80">
              ⚡ Pre-warmed standby pool ready · Sub-second boot (&lt;300ms)
            </span>
          </div>

          {/* Launch Error Notification */}
          {launchError && (
            <div className="mt-2 text-xs text-rose-300 bg-rose-950/40 px-4 py-2.5 rounded-xl border border-rose-800/40 animate-in fade-in flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>{launchError}</span>
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. ACTIVE & HISTORICAL SESSIONS (Zeigarnik Effect & Peak-End Rule)
          ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        {/* Active Streaming Session Highlight (Zeigarnik Effect) */}
        {activeSessions.length > 0 && (
          <div className="p-4 rounded-2xl bg-surface-1 border border-accent-blue/30 shadow-lg shadow-accent-blue/5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-semantic-success animate-ping" />
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <span>Active Session Streaming Now</span>
                    <Badge variant="accent" className="text-[10px] py-0">
                      Live
                    </Badge>
                  </h2>
                  <p className="text-xs text-ink-muted">
                    You have an open sandbox container running. Resume stream anytime without losing state.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeSessions.map((session) => (
                  <Button
                    key={session.id}
                    onClick={() => handleResumeSession(session)}
                    size="sm"
                    className="rounded-pill bg-white text-black hover:bg-neutral-200 text-xs font-medium h-9 px-4 gap-1.5"
                  >
                    <span>Resume Session</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Past Sessions & Recorded Media Archive */}
        {pastSessions.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-accent-blue" />
                  <span>Session History & Recordings</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  Review recent ephemeral containers, watch in-browser video replays, or download fMP4 recordings.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {pastSessions.length} total
              </Badge>
            </div>

            <ScrollArea className="max-h-[380px] pr-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pastSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-4 rounded-xl bg-surface-1 border border-hairline hover:border-white/20 transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-mono font-medium text-white bg-surface-2 px-2 py-0.5 rounded">
                          {s.id.slice(0, 8)}...{s.id.slice(-4)}
                        </code>
                        <Badge
                          variant={s.recording ? 'accent' : 'secondary'}
                          className="text-[10px] py-0 shrink-0"
                        >
                          {s.recording ? '🎥 Recorded' : 'Terminated'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                        {s.created_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        )}
                        {s.kiosk_enabled && (
                          <span className="text-amber-400 font-medium">· 🔒 Kiosk</span>
                        )}
                      </div>
                    </div>

                    {s.recording && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelectedSessionForVideo(s.id)}
                          className="h-7 text-xs rounded-pill gap-1.5 px-3"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Watch Replay</span>
                        </Button>
                        <a href={`/api/sessions/${s.id}/recording`} download target="_blank" rel="noreferrer">
                          <Button size="sm" variant="default" className="h-7 text-xs rounded-pill gap-1.5 px-3">
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </Button>
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. SIGNATURE SPOTLIGHT ATMOSPHERE CARDS (DESIGN.md: 2 Cards)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Violet Spotlight Atmosphere Card */}
        <Card variant="spotlight-violet" className="p-2 relative overflow-hidden">
          <CardHeader className="p-7 pb-4">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 mb-3 shadow-inner">
              <Zap className="w-5 h-5" />
            </div>
            <CardTitle className="text-xl text-white font-medium tracking-tight">
              Sub-50ms Glass-to-Glass Pipeline
            </CardTitle>
            <CardDescription className="text-purple-200/70 text-sm leading-relaxed pt-1">
              WebCodecs Hardware VideoDecoder renders H.264 Annex B chunks directly onto HTML5 Canvas
              with desynchronized 2D context, bypassing the OS window compositor completely.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7 pb-7 text-xs text-purple-200/60 space-y-2 font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Zero-latency latest-frame-wins RAF loop</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Dynamic SPS/PPS extraction with avc1 auto-negotiation</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Client GPU hardware VPU slice decoding: ~3.5ms</span>
            </div>
          </CardContent>
        </Card>

        {/* Sunset Orange Spotlight Atmosphere Card */}
        <Card variant="spotlight-orange" className="p-2 relative overflow-hidden">
          <CardHeader className="p-7 pb-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 mb-3 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <CardTitle className="text-xl text-white font-medium tracking-tight">
              Zero-Transcode Ephemeral Sandboxes
            </CardTitle>
            <CardDescription className="text-amber-200/70 text-sm leading-relaxed pt-1">
              scrcpy-server v2.7 taps Android SurfaceFlinger natively. The Go server forwards raw Annex B
              NAL frames over binary WebSockets with zero CPU transcode overhead, destroying containers on exit.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7 pb-7 text-xs text-amber-200/60 space-y-2 font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Native Linux binderfs IPC device passthrough</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Dynamic FIFO port allocation &amp; idle container reaper</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Pre-warmed standby container acquisition: &lt;300ms</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. PERFORMANCE BENCHMARK STRIP (Doherty Threshold & Mental Model)
          ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="p-5 rounded-2xl bg-surface-1 border border-hairline space-y-1">
          <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono">&lt; 50ms</p>
          <p className="text-xs text-ink-muted">Glass-to-Glass Latency</p>
        </div>
        <div className="p-5 rounded-2xl bg-surface-1 border border-hairline space-y-1">
          <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono">60 FPS</p>
          <p className="text-xs text-ink-muted">Full-Rate Video Capture</p>
        </div>
        <div className="p-5 rounded-2xl bg-surface-1 border border-hairline space-y-1">
          <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono">&lt; 300ms</p>
          <p className="text-xs text-ink-muted">Standby Container Launch</p>
        </div>
        <div className="p-5 rounded-2xl bg-surface-1 border border-hairline space-y-1">
          <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono">100%</p>
          <p className="text-xs text-ink-muted">Ephemeral Zero-State Storage</p>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. INTERACTIVE ARCHITECTURE SPECIFICATION (Chunking & Miller's Law)
          ───────────────────────────────────────────────────────────── */}
      <section id="architecture" className="space-y-6 pt-2">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            System Architecture &amp; Clean Contracts
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted max-w-xl mx-auto">
            Strict Clean Architecture separation of concerns across Go backend, scrcpy protocol, and browser WebCodecs.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="flex justify-center">
            <TabsList>
              <TabsTrigger value="overview">Pipeline Topology</TabsTrigger>
              <TabsTrigger value="backend">Clean Architecture</TabsTrigger>
              <TabsTrigger value="protocol">Wire Protocol</TabsTrigger>
              <TabsTrigger value="webcodecs">WebCodecs GPU</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <Card className="p-6 bg-surface-1 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-white">End-to-End Streaming Topology</h3>
              </div>
              <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                The browser client connects over a single multiplexed binary WebSocket. The Go backend
                orchestrates container lifecycles, manages ADB socket forwards, and forwards Annex B video
                slices directly without server re-encoding.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 1</span>
                  <p className="text-xs font-medium text-white">Redroid 13</p>
                  <p className="text-[11px] text-ink-muted">AOSP userspace runtime with binderfs IPC</p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 2</span>
                  <p className="text-xs font-medium text-white">scrcpy-server v2.7</p>
                  <p className="text-[11px] text-ink-muted">SurfaceControl screen capture at 60 FPS</p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 3</span>
                  <p className="text-xs font-medium text-white">Go Backend Relay</p>
                  <p className="text-[11px] text-ink-muted">StreamRelay byte multiplexer &amp; Kiosk filter</p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 4</span>
                  <p className="text-xs font-medium text-white">WebCodecs</p>
                  <p className="text-[11px] text-ink-muted">Hardware GPU decode &amp; 2D canvas paint</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="backend">
            <Card className="p-6 bg-surface-1 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <Code2 className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-white">Clean Architecture Layer Separation</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-surface-2/60 border border-hairline space-y-1.5">
                  <strong className="text-white font-semibold">Domain Layer</strong>
                  <p className="text-ink-muted text-[11px] leading-relaxed">
                    Pure business entities (`Session`, `ContainerConfig`), domain error definitions, and interface contracts.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-surface-2/60 border border-hairline space-y-1.5">
                  <strong className="text-white font-semibold">Use Case Layer</strong>
                  <p className="text-ink-muted text-[11px] leading-relaxed">
                    `SessionUsecase` and `StreamUsecase`. Orchestrates container lifecycles, FIFO port pools, and binary relaying.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-surface-2/60 border border-hairline space-y-1.5">
                  <strong className="text-white font-semibold">Infrastructure Layer</strong>
                  <p className="text-ink-muted text-[11px] leading-relaxed">
                    Adapters for Docker SDK, ADB daemon, SQLite persistence, and scrcpy v2.7 binary framing.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="protocol">
            <Card className="p-6 bg-surface-1 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-white">scrcpy Binary Framing Protocol</h3>
              </div>
              <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                Single-byte channel demultiplexing without JSON parsing overhead: `0x00` Video, `0x01` Audio,
                `0x02` Control, `0x03` Latency Ping/Pong, `0x04` Codec Metadata.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline">
                  <span className="text-accent-blue font-semibold">0x02 INJECT_TOUCH</span>
                  <p className="text-[11px] text-ink-muted mt-1">32 bytes Big-Endian (pointerId, x, y, pressure)</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline">
                  <span className="text-accent-blue font-semibold">0x02 INJECT_SCROLL</span>
                  <p className="text-[11px] text-ink-muted mt-1">21 bytes Big-Endian (x, y, i16fp fixed-point delta)</p>
                </div>
                <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline">
                  <span className="text-accent-blue font-semibold">0x02 INJECT_KEYCODE</span>
                  <p className="text-[11px] text-ink-muted mt-1">14 bytes Big-Endian (action, keycode, metaState)</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="webcodecs">
            <Card className="p-6 bg-surface-1 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <MonitorPlay className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-white">WebCodecs Hardware VPU Decoding</h3>
              </div>
              <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                Incoming Annex B H.264 packets pass through SPS/PPS parameter inspection. Frames are fed to
                the browser's native `VideoDecoder` offloaded directly to your GPU. Decoded `VideoFrame` outputs
                are painted on a desynchronized canvas context with a latest-frame-wins RAF queue to eliminate stutter.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* Video Replay Modal */}
      {selectedSessionForVideo && (
        <RecordingPlayerModal
          isOpen={!!selectedSessionForVideo}
          onClose={() => setSelectedSessionForVideo(null)}
          sessionId={selectedSessionForVideo}
        />
      )}
    </div>
  );
};
