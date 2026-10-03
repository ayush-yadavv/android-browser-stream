import React from 'react';
import { Gamepad2, MousePointer, Clipboard, Copy } from 'lucide-react';
import { Button } from './ui/button';

interface PhoneChassisProps {
  children: React.ReactNode;
  isFocused: boolean;
  inputMode: 'touch' | 'dpad';
  isPointerLocked: boolean;
  clipboardNotice?: string | null;
  onCopyClipboardNotice?: () => void;
  hasFirstFrame: boolean;
}

export const PhoneChassis: React.FC<PhoneChassisProps> = ({
  children,
  isFocused,
  inputMode,
  isPointerLocked,
  clipboardNotice,
  onCopyClipboardNotice,
  hasFirstFrame,
}) => {
  return (
    <div
      className={`relative mx-auto transition-all duration-200 select-none ${
        /* Outer hardware bezel: responsive padding and radius */
        'bg-[#0b0b0d] border border-white/10 shadow-2xl shadow-black/90'
      } rounded-[24px] sm:rounded-[40px] p-1.5 sm:p-3 max-w-[430px] w-full ${
        isFocused ? 'ring-2 ring-accent-blue/50 border-accent-blue/60' : ''
      }`}
    >
      {/* Top Phone Hardware Features (Speaker Slit & Camera Punch Hole) */}
      <div className="hidden sm:flex flex-col items-center justify-center mb-2 pt-0.5 space-y-1">
        <div className="w-14 h-1 rounded-full bg-white/15" />
        <div className="w-2.5 h-2.5 rounded-full bg-black border border-white/20" />
      </div>

      {/* Screen Frame Window (Enforces 9:16 aspect ratio & inner curvature) */}
      <div className="relative w-full aspect-[9/16] rounded-[20px] sm:rounded-[28px] overflow-hidden bg-black flex flex-col items-center justify-center max-h-[58vh] sm:max-h-[74vh]">
        {children}

        {/* Floating Status Badge: D-pad Active */}
        {hasFirstFrame && inputMode === 'dpad' && (
          <div className="absolute top-3 left-3 bg-surface-1/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-accent-blue/30 text-[10px] text-accent-blue font-medium shadow-md flex items-center space-x-1.5 pointer-events-none z-20">
            <Gamepad2 className="w-3 h-3" />
            <span>D-Pad Active</span>
          </div>
        )}

        {/* Floating Status Badge: Pointer Lock Active */}
        {hasFirstFrame && isPointerLocked && (
          <div className="absolute top-3 right-3 bg-accent-blue/90 text-white px-2.5 py-1 rounded-full text-[10px] font-medium shadow-md flex items-center space-x-1.5 pointer-events-none z-20">
            <MousePointer className="w-3 h-3" />
            <span>Pointer Locked (Esc)</span>
          </div>
        )}

        {/* Floating Remote Clipboard Toast Banner */}
        {clipboardNotice && (
          <div className="absolute bottom-3 inset-x-3 bg-surface-1/95 border border-accent-blue/40 shadow-2xl rounded-xl p-2.5 flex items-center justify-between text-xs z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center space-x-2 truncate mr-2">
              <Clipboard className="w-4 h-4 text-accent-blue shrink-0" />
              <span className="text-ink truncate text-[11px]">
                <span className="font-semibold text-accent-blue">Android Copy: </span>
                {clipboardNotice}
              </span>
            </div>
            {onCopyClipboardNotice && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-[10px] gap-1 shrink-0"
                onClick={onCopyClipboardNotice}
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
