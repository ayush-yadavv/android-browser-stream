import React, { useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { DeviceCanvas } from './components/DeviceCanvas';
import { Play, Sparkles, Terminal, Cpu, MonitorPlay, XCircle, Loader2 } from 'lucide-react';

interface SessionData {
  id: string;
  container_id: string;
  adb_port: number;
  status: string;
}

export const App: React.FC = () => {
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const isLaunchingRef = useRef(false);

  const handleLaunchSession = async () => {
    if (isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    setIsLaunching(true);
    setLaunchError(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server returned HTTP ${res.status}`);
      }

      const session: SessionData = await res.json();
      setActiveSession(session);
    } catch (err: any) {
      setLaunchError(err.message || 'Failed to provision session');
    } finally {
      isLaunchingRef.current = false;
      setIsLaunching(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    setActiveSession(null);

    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to terminate session on server:', err);
    }
  };

  return (
    <Layout>
      {activeSession ? (
        /* Active Stream View */
        <div className="space-y-6 max-w-5xl mx-auto py-2">
          <div className="flex items-center justify-between pb-2 border-b border-hairline">
            <div>
              <h2 className="text-xl font-bold text-ink tracking-tight">Active Android Session</h2>
              <p className="text-xs text-ink-muted font-mono">ID: {activeSession.id}</p>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 rounded-pill bg-surface-1 border border-hairline hover:bg-surface-2 text-red-400 hover:text-red-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>End Session</span>
            </button>
          </div>

          <DeviceCanvas sessionId={activeSession.id} onDisconnect={handleDisconnect} />
        </div>
      ) : (
        /* Landing / Launch View */
        <div className="space-y-12 max-w-5xl mx-auto py-6">
          {/* Hero Section */}
          <div className="text-center space-y-4 pt-4 pb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface-1 border border-hairline text-xs font-medium text-ink-muted">
              <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
              <span>Cloud Native Android-in-Cloud (AIC) Stream</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-bold tracking-tighter text-ink display-title">
              Interactive Android <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-300 to-neutral-500">
                Directly in Your Browser
              </span>
            </h1>

            <p className="text-ink-muted max-w-2xl mx-auto text-base sm:text-lg">
              Low-latency sub-50ms video pipeline offloaded to client GPU via WebCodecs.
              Dedicated ephemeral Android 13 containers with zero state leakage.
            </p>

            <div className="flex flex-col items-center gap-3 pt-4">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  onClick={handleLaunchSession}
                  disabled={isLaunching}
                  className="px-6 py-3 rounded-pill bg-white text-on-primary font-medium hover:bg-neutral-200 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {isLaunching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Provisioning Android Container...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Launch Android Session</span>
                    </>
                  )}
                </button>

                <a
                  href="#spec"
                  className="px-6 py-3 rounded-pill bg-surface-1 border border-hairline text-ink hover:bg-surface-2 transition-colors font-medium"
                >
                  View Architecture Spec
                </a>
              </div>

              {launchError && (
                <p className="text-xs text-red-400 bg-red-950/40 px-3 py-1.5 rounded-lg border border-red-800/40">
                  {launchError}
                </p>
              )}
            </div>
          </div>

          {/* Placeholder Preview Container */}
          <div className="rounded-2xl border border-hairline bg-surface-1 overflow-hidden shadow-2xl relative">
            <div className="h-10 bg-canvas/60 border-b border-hairline px-4 flex items-center justify-between text-xs text-ink-muted">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
                <span className="ml-2 font-mono text-[11px]">stream-viewport (1080x1920)</span>
              </div>
              <div className="flex items-center space-x-3 font-mono text-[11px]">
                <span>60 FPS</span>
                <span className="text-accent-blue">WebCodecs Active</span>
              </div>
            </div>

            <div className="p-12 flex flex-col items-center justify-center min-h-[380px] bg-canvas text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-hairline flex items-center justify-center text-accent-blue shadow-inner">
                <MonitorPlay className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-ink">Phase 3 Streaming Pipeline Ready</h3>
                <p className="text-sm text-ink-muted max-w-md">
                  Click &quot;Launch Android Session&quot; above to allocate an on-demand Redroid instance and stream H.264 video to your canvas.
                </p>
              </div>
            </div>
          </div>

          {/* Feature Cards Grid (Framer Atmosphere per DESIGN.md) */}
          <div id="spec" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="p-6 rounded-xl bg-surface-1 border border-hairline space-y-3">
              <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center text-accent-blue">
                <Cpu className="w-5 h-5" />
              </div>
              <h4 className="text-base font-semibold text-ink">Zero Server Transcoding</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                scrcpy-server captures H.264 NAL units directly from Android SurfaceFlinger. The Go server forwards raw frames without CPU re-encoding.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-surface-1 border border-hairline space-y-3">
              <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center text-semantic-success">
                <MonitorPlay className="w-5 h-5" />
              </div>
              <h4 className="text-base font-semibold text-ink">WebCodecs VideoDecoder</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Browser hardware-accelerated video decoding onto HTML5 Canvas with desynchronized 2D context to avoid compositor queuing delay.
              </p>
            </div>

            <div className="p-6 rounded-xl bg-surface-1 border border-hairline space-y-3">
              <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center text-purple-400">
                <Terminal className="w-5 h-5" />
              </div>
              <h4 className="text-base font-semibold text-ink">True Zero-State Sandbox</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Ephemeral Redroid container spun up dynamically on user connect and destroyed upon disconnect. No state or credentials persist.
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
