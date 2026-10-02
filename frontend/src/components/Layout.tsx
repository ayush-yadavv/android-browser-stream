import React, { useEffect, useState } from 'react';
import { Smartphone, Activity, ShieldCheck, RefreshCw } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

interface HealthResponse {
  status: string;
  service: string;
  max_slots: number;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthResponse = await res.json();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Offline');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-body selection:bg-accent-blue selection:text-white">
      {/* 56px sticky top bar on bg-canvas per DESIGN.md */}
      <header className="sticky top-0 z-50 h-14 bg-canvas/90 backdrop-blur-md border-b border-hairline px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-surface-1 border border-hairline flex items-center justify-center text-accent-blue">
            <Smartphone className="w-4 h-4" />
          </div>
          <span className="font-semibold tracking-tight text-ink text-sm sm:text-base">
            HealthTick <span className="text-ink-muted font-normal">· Android in Browser</span>
          </span>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          {/* Health Status Indicator */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-surface-1 border border-hairline">
            <span
              className={`w-2 h-2 rounded-full ${
                health?.status === 'healthy'
                  ? 'bg-semantic-success animate-pulse'
                  : loading
                  ? 'bg-amber-400'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-ink-muted">
              {loading && !health
                ? 'Connecting...'
                : health?.status === 'healthy'
                ? `Backend Online (${health.max_slots} slots)`
                : `Backend ${error || 'Offline'}`}
            </span>
            <button
              onClick={checkHealth}
              title="Refresh Health"
              className="text-ink-muted hover:text-ink transition-colors ml-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center justify-center px-4 py-1.5 rounded-pill bg-white text-on-primary font-medium hover:bg-neutral-200 transition-colors"
          >
            Assignment Repo
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer per DESIGN.md */}
      <footer className="border-t border-hairline bg-canvas py-8 px-6 text-center text-xs text-ink-muted">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 HealthTick Take-Home Assignment · Sub-50ms Cloud Native AIC</p>
          <div className="flex items-center space-x-4">
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <ShieldCheck className="w-3.5 h-3.5 text-accent-blue" /> Ephemeral Redroid Sandbox
            </span>
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <Activity className="w-3.5 h-3.5 text-accent-blue" /> WebCodecs H.264
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
