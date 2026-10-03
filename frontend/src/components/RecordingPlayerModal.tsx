import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Download, Film, AlertCircle, Play, CheckCircle2 } from 'lucide-react';

export interface RecordingPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  sessionTitle?: string;
  createdAt?: string;
}

export const RecordingPlayerModal: React.FC<RecordingPlayerModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  sessionTitle = 'Session Video Recording',
  createdAt,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state when modal is opened or target session changes, and pause video on close
  React.useEffect(() => {
    if (isOpen) {
      setLoadError(false);
      setCopied(false);
    } else if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [isOpen, sessionId]);

  const recordingUrl = `/api/sessions/${sessionId}/recording`;

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${recordingUrl}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(fullUrl)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // Gracefully ignore clipboard rejection in restricted contexts
        });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-surface-1 border-hairline text-ink">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue flex items-center justify-center">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-ink">
                {sessionTitle}
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-muted">
                Session ID: <code className="font-mono text-ink-muted">{sessionId}</code>
                {createdAt && ` • ${new Date(createdAt).toLocaleString()}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black/90 border border-hairline flex items-center justify-center min-h-[300px]">
            {loadError ? (
              <div className="p-8 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-medium text-ink">Recording Still Finalizing or Unavailable</p>
                <p className="text-xs text-ink-muted max-w-sm">
                  The fragmented MP4 file is being muxed or was not recorded for this session.
                </p>
              </div>
            ) : (
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[55vh] object-contain rounded-xl"
                src={recordingUrl}
                onError={() => setLoadError(true)}
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-hairline text-xs">
            <div className="flex items-center gap-2 text-ink-muted">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>fMP4 H.264 Video Stream Copy</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyLink}
                className="h-8 text-xs rounded-pill gap-1.5"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied' : 'Copy Direct Link'}</span>
              </Button>

              <a href={recordingUrl} download target="_blank" rel="noreferrer">
                <Button size="sm" className="h-8 text-xs rounded-pill gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  <span>Download MP4</span>
                </Button>
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
