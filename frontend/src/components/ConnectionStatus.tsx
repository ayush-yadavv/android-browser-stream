import React from 'react';
import { Wifi, Activity, Keyboard } from 'lucide-react';
import { Badge } from './ui/badge';

interface ConnectionStatusProps {
  isConnected: boolean;
  hasFirstFrame: boolean;
  fps: number;
  estimatedLatencyMs: number;
  isFocused: boolean;
  isHudOpen: boolean;
  onToggleHud: () => void;
  codecName?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  hasFirstFrame,
  fps,
  estimatedLatencyMs,
  isFocused,
  isHudOpen,
  onToggleHud,
  codecName,
}) => {
  return (
    <div className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-surface-1 border border-hairline text-xs">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5">
          <Wifi
            className={`w-3.5 h-3.5 ${
              isConnected ? 'text-semantic-success' : 'text-neutral-500'
            }`}
          />
          <span className="text-ink font-medium">
            {isConnected
              ? hasFirstFrame
                ? `${fps || 60} FPS`
                : 'Booting Android...'
              : 'Connecting...'}
          </span>
        </div>

        {codecName && hasFirstFrame && (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0 border-accent-blue/30 text-accent-blue bg-accent-blue/10 font-mono"
          >
            {codecName}
          </Badge>
        )}

        {hasFirstFrame && (
          <button
            onClick={onToggleHud}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] transition-colors cursor-pointer ${
              isHudOpen
                ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                : 'bg-surface-2 border-hairline hover:bg-surface-2/80 text-ink'
            }`}
            title="Toggle Performance HUD (Ctrl+Shift+L)"
          >
            <Activity className="w-3 h-3 text-accent-blue" />
            <span>~{estimatedLatencyMs}ms Latency</span>
          </button>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <span
          className={`hidden sm:inline-flex items-center gap-1 text-[11px] transition-colors ${
            isFocused ? 'text-accent-blue' : 'text-ink-muted'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>{isFocused ? 'Input Active' : 'Click to Focus'}</span>
        </span>

        <Badge variant={isConnected ? 'default' : 'secondary'}>
          {isConnected ? 'Online' : 'Offline'}
        </Badge>
      </div>
    </div>
  );
};
