import React, { useEffect, useState } from 'react';
import { Box, Terminal, Cpu, MonitorPlay, CheckCircle2, Loader2 } from 'lucide-react';

interface BootMilestonesProps {
  onCancel?: () => void;
}

const MILESTONES = [
  {
    id: 1,
    title: 'Sandbox Container',
    description: 'Allocating isolated Redroid container with guest GPU emulation',
    icon: Box,
    approxDurationMs: 1500,
  },
  {
    id: 2,
    title: 'Kernel Binder IPC & ADB',
    description: 'Mounting /dev/binderfs and attaching ADB daemon loopback',
    icon: Terminal,
    approxDurationMs: 2000,
  },
  {
    id: 3,
    title: 'SurfaceFlinger Capture',
    description: 'Injecting scrcpy-server v2.7 and binding abstract sockets',
    icon: Cpu,
    approxDurationMs: 2500,
  },
  {
    id: 4,
    title: 'WebCodecs GPU Sync',
    description: 'Receiving SPS/PPS parameter set and awaiting IDR keyframe',
    icon: MonitorPlay,
    approxDurationMs: 1000,
  },
];

export const BootMilestones: React.FC<BootMilestonesProps> = ({ onCancel }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setCurrentStep(2), 1200);
    const t2 = setTimeout(() => setCurrentStep(3), 3200);
    const t3 = setTimeout(() => setCurrentStep(4), 5800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-canvas/95 backdrop-blur-md p-6 text-center select-none animate-in fade-in duration-300">
      <div className="w-full max-w-sm space-y-6">
        {/* Header Indicator */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Booting Android 13 ({elapsedSec}s)</span>
          </div>
          <h4 className="text-lg font-semibold text-ink tracking-tight">
            Provisioning Live Stream
          </h4>
          <p className="text-xs text-ink-muted">
            Initial cold boot synchronizes cloud container pipeline
          </p>
        </div>

        {/* Milestone Steps (Goal-Gradient Effect & Law of Uniform Connectedness) */}
        <div className="space-y-3 text-left">
          {MILESTONES.map((milestone, idx) => {
            const isDone = currentStep > milestone.id;
            const isCurrent = currentStep === milestone.id;
            const Icon = milestone.icon;

            return (
              <div
                key={milestone.id}
                className={`relative flex items-start gap-3.5 p-3 rounded-xl border transition-all duration-300 ${
                  isCurrent
                    ? 'bg-surface-2 border-accent-blue/40 shadow-lg shadow-accent-blue/5'
                    : isDone
                    ? 'bg-surface-1/60 border-hairline/60 opacity-80'
                    : 'bg-surface-1/20 border-hairline/30 opacity-40'
                }`}
              >
                <div
                  className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs transition-colors ${
                    isDone
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : isCurrent
                      ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/40'
                      : 'bg-surface-2 text-neutral-500 border border-hairline'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Icon className="w-3 h-3" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium truncate ${
                        isCurrent ? 'text-ink' : isDone ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      {milestone.title}
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted">
                      {idx + 1}/4
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted truncate mt-0.5">
                    {milestone.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-ink-muted hover:text-red-400 transition-colors cursor-pointer"
          >
            Cancel and return to dashboard
          </button>
        )}
      </div>
    </div>
  );
};
