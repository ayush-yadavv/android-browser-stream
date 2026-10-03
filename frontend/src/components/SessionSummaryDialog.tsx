import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { LatencyStats } from '../hooks/useLatencyStats';
import { Clock, Film, Zap, Activity, AlertTriangle, Download } from 'lucide-react';

interface SessionSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDisconnect: () => void;
  stats: LatencyStats;
  sessionDurationSec: number;
  sessionId?: string;
  recording?: boolean;
}

export const SessionSummaryDialog: React.FC<SessionSummaryDialogProps> = ({
  isOpen,
  onClose,
  onConfirmDisconnect,
  stats,
  sessionDurationSec,
  sessionId,
  recording,
}) => {
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mb-2">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <DialogTitle>Terminate Ephemeral Session?</DialogTitle>
          <DialogDescription>
            Disconnecting will trigger the Go orchestrator to destroy the container sandbox and release allocated ADB port resources immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Peak-End Rule Session Metrics */}
        <div className="grid grid-cols-2 gap-2.5 py-2">
          <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-xs">
              <Clock className="w-3.5 h-3.5" />
              <span>Session Time</span>
            </div>
            <p className="text-base font-semibold font-mono text-ink">
              {formatTime(sessionDurationSec)}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-xs">
              <Film className="w-3.5 h-3.5" />
              <span>Frames Rendered</span>
            </div>
            <p className="text-base font-semibold font-mono text-ink">
              {stats.totalFrames.toLocaleString()}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-xs">
              <Zap className="w-3.5 h-3.5 text-accent-blue" />
              <span>Estimated Latency</span>
            </div>
            <p className="text-base font-semibold font-mono text-ink">
              ~{stats.estimatedGlassToGlassMs}ms
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-2/60 border border-hairline space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-xs">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Rolling FPS</span>
            </div>
            <p className="text-base font-semibold font-mono text-ink">
              {stats.fps || 60} FPS
            </p>
          </div>
        </div>

        {recording && sessionId && (
          <div className="p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-accent-blue" />
              <span className="text-xs font-medium text-ink">Session Recording Captured</span>
            </div>
            <a href={`/api/sessions/${sessionId}/recording`} download target="_blank" rel="noreferrer">
              <Button size="sm" variant="default" className="text-xs gap-1.5 h-7 rounded-pill">
                <Download className="w-3.5 h-3.5" />
                <span>Download MP4</span>
              </Button>
            </a>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={onClose} className="rounded-pill">
            Resume Session
          </Button>
          <Button variant="destructive" onClick={onConfirmDisconnect} className="rounded-pill">
            End & Teardown
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
