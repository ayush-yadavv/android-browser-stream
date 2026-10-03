import React, { useEffect, useState } from 'react';
import { Smartphone, Activity, ShieldCheck, RefreshCw, Menu, X, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const checkHealth = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthResponse = await res.json();
      setHealth(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Offline');
      setHealth(null);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth(true);
    const interval = setInterval(() => checkHealth(false), 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-body selection:bg-accent-blue selection:text-white">
      {/* 56px sticky top bar on bg-canvas per DESIGN.md */}
      <header className="sticky top-0 z-50 h-14 bg-canvas/90 backdrop-blur-md border-b border-hairline px-4 sm:px-6 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-surface-1 border border-hairline flex items-center justify-center text-accent-blue shadow-sm">
            <Smartphone className="w-4 h-4" />
          </div>
          <Link to="/" className="font-semibold tracking-tight text-ink text-sm sm:text-base hover:opacity-90 transition-opacity">
            DroidCanvas <span className="text-ink-muted font-normal text-xs sm:text-sm">· Cloud Android Engine</span>
          </Link>
        </div>

        {/* Desktop Controls (≥810px) */}
        <div className="hidden min-[810px]:flex items-center space-x-3 text-xs">
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
              onClick={() => checkHealth(false)}
              title="Refresh Health"
              className="text-ink-muted hover:text-ink transition-colors ml-0.5 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <a
            href="https://github.com/ayush-yadavv/android-browser-stream"
            target="_blank"
            rel="noreferrer"
            title="android-browser-stream repository on GitHub"
          >
            <Button variant="default" size="sm" className="gap-1.5 h-8">
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </Button>
          </a>
        </div>

        {/* Mobile Hamburger Button (<810px per DESIGN.md) */}
        <div className="flex min-[810px]:hidden items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-surface-1 border border-hairline text-[11px]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                health?.status === 'healthy' ? 'bg-semantic-success' : 'bg-amber-400'
              }`}
            />
            <span className="text-ink-muted">
              {health?.status === 'healthy' ? `${health.max_slots} slots` : 'Connecting'}
            </span>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-surface-1 border border-hairline text-ink-muted hover:text-ink transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4 text-ink" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Overlay (<810px) */}
      {mobileMenuOpen && (
        <div className="min-[810px]:hidden z-40 bg-surface-1/95 backdrop-blur-xl border-b border-hairline p-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between text-xs pb-3 border-b border-hairline">
            <span className="text-ink-muted">Server Status:</span>
            <span className="text-ink font-medium">
              {health?.status === 'healthy' ? 'Online (Ready)' : error || 'Offline'}
            </span>
          </div>

          <div className="space-y-2">
            <a
              href="https://github.com/ayush-yadavv/android-browser-stream"
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <Button variant="default" className="w-full justify-center">
                <Github className="w-4 h-4 mr-2" />
                <span>View on GitHub</span>
              </Button>
            </a>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer per DESIGN.md */}
      <footer className="border-t border-hairline bg-canvas py-8 px-6 text-center text-xs text-ink-muted">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 DroidCanvas · Ephemeral Cloud-Native Android Streaming Engine</p>
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
