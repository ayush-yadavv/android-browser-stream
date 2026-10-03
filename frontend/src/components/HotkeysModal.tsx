import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Keyboard } from 'lucide-react';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  action: string;
  context: string;
}

export const HotkeysModal: React.FC<HotkeysModalProps> = ({ isOpen, onClose }) => {
  const shortcuts: ShortcutItem[] = [
    { keys: ['Esc'], action: 'Android Back', context: 'Navigation' },
    { keys: ['Home', 'Alt + Home'], action: 'Android Home', context: 'Navigation' },
    { keys: ['Alt + Tab'], action: 'Recent Apps', context: 'Navigation' },
    { keys: ['M', 'Alt + U'], action: 'Toggle Audio Mute / Unmute', context: 'Audio Playback' },
    { keys: ['Alt + M'], action: 'Toggle Touch / D-pad Mode', context: 'Input Mode' },
    { keys: ['Ctrl + Shift + L'], action: 'Toggle Performance HUD', context: 'Inspector' },
    { keys: ['Ctrl + V'], action: 'Paste Host Clipboard', context: 'Text Input' },
    { keys: ['Arrow Keys'], action: 'D-Pad Directional Move', context: 'D-Pad Mode' },
    { keys: ['Enter', 'Space'], action: 'D-Pad Select / Center', context: 'D-Pad Mode' },
    { keys: ['Right Click'], action: 'Android Back', context: 'Mouse Gesture' },
    { keys: ['Middle Click'], action: 'Android Home', context: 'Mouse Gesture' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-surface-1 border-hairline text-ink">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-accent-blue/10 border border-accent-blue/20 text-accent-blue flex items-center justify-center mb-1">
            <Keyboard className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-semibold text-ink">Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="text-xs text-ink-muted">
            Desktop hotkeys for remote Android control without leaving the keyboard.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-hairline mt-2 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((item, index) => (
            <div key={index} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="text-ink font-medium">{item.action}</span>
                <span className="text-[11px] text-ink-muted block">{item.context}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {item.keys.map((k, kIdx) => (
                  <kbd
                    key={kIdx}
                    className="px-2 py-0.5 rounded-md bg-surface-2 border border-hairline text-ink font-mono text-[11px] shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
