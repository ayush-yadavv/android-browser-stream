import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SessionManager, LaunchOptions } from '../components/SessionManager';
import { SessionData } from '../types/session';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [activeSlots, setActiveSlots] = useState(0);
  const [maxSlots, setMaxSlots] = useState(3);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const isLaunchingRef = useRef(false);

  // Probe active sessions to update live capacity meter
  useEffect(() => {
    let mounted = true;
    const fetchSlots = async () => {
      try {
        const res = await fetch('/api/sessions');
        if (res.ok && mounted) {
          const data: SessionData[] = await res.json();
          setSessions(data);
          setActiveSlots(data.filter((s) => s.status !== 'terminated').length);
        }
        const healthRes = await fetch('/api/health');
        if (healthRes.ok && mounted) {
          const health = await healthRes.json();
          if (health.max_slots) setMaxSlots(health.max_slots);
        }
      } catch {
        // Silently tolerate probe failure on landing
      }
    };

    fetchSlots();
    const interval = setInterval(fetchSlots, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLaunchSession = async (opts?: LaunchOptions) => {
    if (isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    setIsLaunching(true);
    setLaunchError(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kiosk_mode: opts?.kioskMode ?? false,
          record_session: opts?.recordSession ?? false,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server returned HTTP ${res.status}`);
      }

      const session: SessionData = await res.json();
      // Navigate to dedicated session stream route with pre-populated session state
      navigate(`/session/${session.id}`, { state: { session } });
    } catch (err: any) {
      setLaunchError(err.message || 'Failed to provision session');
    } finally {
      isLaunchingRef.current = false;
      setIsLaunching(false);
    }
  };

  return (
    <SessionManager
      onLaunch={handleLaunchSession}
      isLaunching={isLaunching}
      launchError={launchError}
      activeSlots={activeSlots}
      maxSlots={maxSlots}
      sessions={sessions}
    />
  );
};
