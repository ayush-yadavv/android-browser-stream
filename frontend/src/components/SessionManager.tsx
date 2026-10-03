import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import {
  Play,
  Sparkles,
  Cpu,
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
} from 'lucide-react';
import { SessionData } from '../types/session';
import { RecordingPlayerModal } from './RecordingPlayerModal';

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

export const SessionManager: React.FC<SessionManagerProps> = ({
  onLaunch,
  isLaunching,
  launchError,
  activeSlots = 0,
  maxSlots = 3,
  sessions = [],
}) => {
  const [kioskMode, setKioskMode] = React.useState(false);
  const [recordSession, setRecordSession] = React.useState(false);
  const [selectedSessionForVideo, setSelectedSessionForVideo] = React.useState<string | null>(null);

  return (
    <div className="space-y-16 max-w-5xl mx-auto py-6 select-none">
      {/* Hero Section (Framer Poster Cadence & Aesthetic-Usability Effect) */}
      <section className="text-center space-y-5 pt-6 pb-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface-1 border border-hairline text-xs font-medium text-ink-muted shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
          <span>DroidCanvas Engine</span>
          <Badge variant="accent" className="ml-1 text-[10px] py-0 px-2">
            v2.7
          </Badge>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tighter text-ink display-title">
          DroidCanvas <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-300 to-neutral-500">
            Ephemeral Android in Browser
          </span>
        </h1>

        <p className="text-ink-muted max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
          Low-latency sub-50ms H.264 video pipeline offloaded to client GPU via WebCodecs.
          Ephemeral Android 13 sandboxes orchestrated with Clean Architecture.
        </p>

        {/* Primary CTA (Fitts's Law & Choice Overload / Hick's Law) */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              onClick={() => onLaunch({ kioskMode, recordSession })}
              disabled={isLaunching}
              size="lg"
              className="px-8 text-base gap-2.5 font-medium shadow-2xl hover:scale-[1.02] active:scale-95 transition-all"
            >
              {isLaunching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Provisioning Sandbox...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Android Session</span>
                </>
              )}
            </Button>

            <a href="#architecture">
              <Button variant="secondary" size="lg" className="px-6 text-sm font-medium">
                View Architecture
              </Button>
            </a>
          </div>

          {/* Launch Configuration Switches (Kiosk Mode & Automated Recording) */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs pt-1 select-none">
            <label
              className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-surface-1 border border-hairline hover:bg-surface-2 transition-colors"
              title="Restricted Kiosk Mode: Locks container to AOSP DeskClock / Stopwatch. Server-side drops Home, Recents, Power keys and status bar swipes."
            >
              <input
                type="checkbox"
                checked={kioskMode}
                onChange={(e) => setKioskMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-accent-blue focus:ring-accent-blue/40"
              />
              <span className="text-ink font-medium">🔒 Kiosk Mode</span>
              <span className="text-ink-muted text-[11px]">(DeskClock Lockdown)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-surface-1 border border-hairline hover:bg-surface-2 transition-colors">
              <input
                type="checkbox"
                checked={recordSession}
                onChange={(e) => setRecordSession(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-accent-blue focus:ring-accent-blue/40"
              />
              <span className="text-ink font-medium">🎥 Record Session</span>
              <span className="text-ink-muted text-[11px]">(fMP4 Capture)</span>
            </label>
          </div>

          {/* Capacity Indicator (Zeigarnik Effect & Law of Common Region) */}
          <div className="flex items-center gap-2 text-xs text-ink-muted pt-1">
            <span className="w-2 h-2 rounded-full bg-semantic-success animate-pulse" />
            <span>
              Capacity: <strong className="text-ink">{maxSlots - activeSlots}</strong> of {maxSlots} ephemeral slots available
            </span>
          </div>

          {launchError && (
            <p className="text-xs text-red-400 bg-red-950/40 px-4 py-2 rounded-xl border border-red-800/40 animate-in fade-in">
              {launchError}
            </p>
          )}
        </div>
      </section>

      {/* Signature Atmospheric Spotlight Cards Grid (DESIGN.md) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Violet Spotlight Card */}
        <Card variant="spotlight-violet" className="p-2">
          <CardHeader className="p-6 pb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 mb-2">
              <Zap className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg text-white">Sub-50ms Glass-to-Glass</CardTitle>
            <CardDescription className="text-purple-200/70">
              WebCodecs VideoDecoder renders hardware H.264 Annex B chunks directly onto HTML5 canvas with desynchronized 2D context.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-xs text-purple-200/50 space-y-1.5 font-mono">
            <div>• Zero compositor delay</div>
            <div>• Latest-frame-wins RAF queue</div>
          </CardContent>
        </Card>

        {/* Magenta Spotlight Card */}
        <Card variant="spotlight-magenta" className="p-2">
          <CardHeader className="p-6 pb-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-300 mb-2">
              <Cpu className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg text-white">Zero Server Transcoding</CardTitle>
            <CardDescription className="text-pink-200/70">
              scrcpy-server v2.7 taps Android SurfaceFlinger natively. The Go server forwards raw Annex B NAL units with 0 CPU transcode overhead.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-xs text-pink-200/50 space-y-1.5 font-mono">
            <div>• 60 FPS 1080×1920 capture</div>
            <div>• 1-byte WS channel multiplexing</div>
          </CardContent>
        </Card>

        {/* Orange Spotlight Card */}
        <Card variant="spotlight-orange" className="p-2">
          <CardHeader className="p-6 pb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 mb-2">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg text-white">Zero-State Sandbox</CardTitle>
            <CardDescription className="text-amber-200/70">
              Isolated ephemeral Docker container provisioned per session and destroyed upon client disconnect with complete storage reclamation.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 text-xs text-amber-200/50 space-y-1.5 font-mono">
            <div>• Kernel binderfs IPC passthrough</div>
            <div>• Dynamic FIFO ADB port pool</div>
          </CardContent>
        </Card>
      </section>

      {/* Recent Sessions & Recorded Media Section (BR-5) */}
      {sessions && sessions.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
                <Film className="w-5 h-5 text-accent-blue" />
                <span>Recent Sessions & Recorded Streams</span>
              </h2>
              <p className="text-xs text-ink-muted">
                Review past sessions, launch in-browser video playback, or download captured fragmented MP4s.
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {sessions.length} total
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sessions.slice(0, 6).map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl bg-surface-1 border border-hairline hover:border-hairline/80 transition-all flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono font-medium text-ink bg-surface-2 px-1.5 py-0.5 rounded">
                        {s.id.slice(0, 8)}...{s.id.slice(-4)}
                      </code>
                      <Badge
                        variant={s.status === 'streaming' ? 'default' : 'secondary'}
                        className="text-[10px] uppercase font-mono py-0"
                      >
                        {s.status}
                      </Badge>
                      {s.kiosk_enabled && (
                        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30 py-0">
                          🔒 Kiosk
                        </Badge>
                      )}
                    </div>
                    {s.created_at && (
                      <p className="text-[11px] text-ink-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(s.created_at).toLocaleString()}</span>
                      </p>
                    )}
                  </div>

                  {s.recording ? (
                    <Badge variant="accent" className="text-[10px] py-0 shrink-0">
                      🎥 Recorded
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-ink-muted shrink-0">No Video</span>
                  )}
                </div>

                {s.recording && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-hairline/60">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedSessionForVideo(s.id)}
                      className="h-7 text-xs rounded-pill gap-1.5"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Watch</span>
                    </Button>
                    <a href={`/api/sessions/${s.id}/recording`} download target="_blank" rel="noreferrer">
                      <Button size="sm" variant="default" className="h-7 text-xs rounded-pill gap-1.5">
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Interactive Architecture & Technical Specification Tabs */}
      <section id="architecture" className="space-y-6 pt-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-ink">System Architecture</h2>
          <p className="text-xs text-ink-muted max-w-lg mx-auto">
            Clean Architecture separation of concerns across Go backend, scrcpy protocol, and browser WebCodecs.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="flex justify-center">
            <TabsList>
              <TabsTrigger value="overview">Pipeline Overview</TabsTrigger>
              <TabsTrigger value="backend">Clean Architecture</TabsTrigger>
              <TabsTrigger value="protocol">Binary Protocol</TabsTrigger>
              <TabsTrigger value="webcodecs">WebCodecs</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <Card className="p-6 bg-surface-1/80 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-ink">End-to-End Streaming Topology</h3>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                The architecture decouples the browser client from Android container internals. The Go server acts as the business logic and session orchestration hub, relaying binary video frames and normalized touch events over a single multiplexed WebSocket connection.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 1</span>
                  <p className="text-xs font-medium text-ink">Redroid 13</p>
                  <p className="text-[11px] text-ink-muted">AOSP ART runtime + guest GPU</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 2</span>
                  <p className="text-xs font-medium text-ink">scrcpy-server v2.7</p>
                  <p className="text-[11px] text-ink-muted">SurfaceControl screen capture</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 3</span>
                  <p className="text-xs font-medium text-ink">Go Backend</p>
                  <p className="text-[11px] text-ink-muted">Gin + coder/websocket relay</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <span className="text-[10px] text-accent-blue font-mono font-semibold">STAGE 4</span>
                  <p className="text-xs font-medium text-ink">WebCodecs</p>
                  <p className="text-[11px] text-ink-muted">Hardware GPU canvas render</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="backend">
            <Card className="p-6 bg-surface-1/80 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <Code2 className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-ink">Clean Architecture Layer Separation</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <strong className="text-ink font-semibold">Domain Layer</strong>
                  <p className="text-ink-muted text-[11px]">
                    Pure business entities (`Session`, `ContainerConfig`), domain error definitions, and interface contracts.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <strong className="text-ink font-semibold">Use Case Layer</strong>
                  <p className="text-ink-muted text-[11px]">
                    `SessionUsecase` and `StreamUsecase`. Manages container lifecycle, port pool allocation, and stream piping.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-surface-2/60 border border-hairline space-y-1">
                  <strong className="text-ink font-semibold">Infrastructure Layer</strong>
                  <p className="text-ink-muted text-[11px]">
                    Adapters for Docker SDK, ADB daemon, SQLite persistence, and scrcpy binary protocol serialization.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="protocol">
            <Card className="p-6 bg-surface-1/80 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-ink">scrcpy Binary Framing</h3>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Binary communication uses single-byte multiplexed channels (`0x00` Video, `0x02` Control, `0x03` Latency Ping).
                Control packets are serialized directly to scrcpy v2.7 specifications:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-2.5 rounded-lg bg-surface-2/60 border border-hairline">
                  <span className="text-accent-blue font-semibold">INJECT_TOUCH</span>
                  <p className="text-[11px] text-ink-muted mt-1">32 bytes Big-Endian (action, pointerId, x, y, width, height, pressure)</p>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2/60 border border-hairline">
                  <span className="text-accent-blue font-semibold">INJECT_SCROLL</span>
                  <p className="text-[11px] text-ink-muted mt-1">21 bytes Big-Endian (x, y, width, height, hscroll i16fp, vscroll i16fp)</p>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2/60 border border-hairline">
                  <span className="text-accent-blue font-semibold">INJECT_KEYCODE</span>
                  <p className="text-[11px] text-ink-muted mt-1">14 bytes Big-Endian (action, keycode, repeat, metaState)</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="webcodecs">
            <Card className="p-6 bg-surface-1/80 border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <MonitorPlay className="w-5 h-5 text-accent-blue" />
                <h3 className="text-base font-semibold text-ink">WebCodecs Hardware Pipeline</h3>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Raw H.264 Annex B stream packets are demuxed in the browser and passed to `VideoDecoder`. Dynamic SPS parsing extracts the exact codec profile string (`avc1.PPCCLL`), and decoded `VideoFrame` surfaces are drawn immediately onto an HTML5 canvas using `desynchronized: true` to bypass OS compositor queues.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

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
