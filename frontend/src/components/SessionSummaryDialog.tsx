import React, { useState } from 'react';
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
import { Clock, Film, Zap, Activity, CheckCircle2, Download, Play, ArrowLeft } from 'lucide-react';
import { RecordingPlayerModal } from './RecordingPlayerModal';

interface SessionSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stats: LatencyStats;
  sessionDurationSec: number;
  sessionId?: string;
  recording?: boolean;
}

export const SessionSummaryDialog: React.FC<SessionSummaryDialogProps> = ({
  isOpen,
  onClose,
  stats,
  sessionDurationSec,
  sessionId,
  recording,
}) => {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  // Ensure child player modal closes if the parent summary dialog is dismissed
  React.useEffect(() => {
    if (!isOpen) {
      setIsPlayerOpen(false);
    }
  }, [isOpen]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md bg-surface-1 border-hairline text-ink">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <DialogTitle>Session Complete</DialogTitle>
            <DialogDescription>
              Your ephemeral sandbox session has ended and resources have been reclaimed.
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

          {/* Finalized Recording Playback & Download */}
          {recording && sessionId && (
            <div className="p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-accent-blue shrink-0" />
                <div>
                  <span className="text-xs font-medium text-ink block">Session Recording Ready</span>
                  <span className="text-[10px] text-ink-muted">Lossless fMP4 finalized on server</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsPlayerOpen(true)}
                  className="text-xs gap-1.5 h-7 rounded-pill"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Watch Replay</span>
                </Button>
                <a href={`/api/sessions/${sessionId}/recording?download=true`} download target="_blank" rel="noreferrer">
                  <Button size="sm" variant="default" className="text-xs gap-1.5 h-7 rounded-pill">
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </Button>
                </a>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="default" onClick={onClose} className="rounded-pill w-full sm:w-auto gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    {sessionId && (
      <RecordingPlayerModal
        isOpen={isPlayerOpen}
        onClose={() => setIsPlayerOpen(false)}
        sessionId={sessionId}
      />
    )}
  </>
  );
};
