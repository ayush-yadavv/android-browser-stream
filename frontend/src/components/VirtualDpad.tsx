import React from 'react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { ANDROID_KEYCODES } from '../lib/keymap';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Undo2,
  Home,
  Menu,
  Gamepad2,
} from 'lucide-react';

interface VirtualDpadProps {
  onSendKey: (keycode: number) => void;
  className?: string;
}

export const VirtualDpad: React.FC<VirtualDpadProps> = ({ onSendKey, className = '' }) => {
  return (
    <TooltipProvider>
      <div
        className={`flex flex-col items-center bg-surface-1/90 backdrop-blur-md border border-hairline rounded-2xl p-4 shadow-xl select-none ${className}`}
      >
        <div className="flex items-center justify-between w-full mb-3 px-1">
          <div className="flex items-center space-x-2">
            <Gamepad2 className="w-4 h-4 text-accent-blue" />
            <span className="text-xs font-semibold text-ink uppercase tracking-wider">
              D-Pad Controller
            </span>
          </div>
          <span className="text-[10px] text-ink-muted bg-surface-2 px-2 py-0.5 rounded-full border border-hairline">
            TV Mode
          </span>
        </div>

        {/* Directional Pad Cluster */}
        <div className="relative w-36 h-36 flex items-center justify-center my-2">
          {/* Background circle / bezel */}
          <div className="absolute inset-0 rounded-full bg-surface-2/60 border border-hairline/80 pointer-events-none" />

          {/* D-Pad Up */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-10 h-10 rounded-full hover:bg-surface-3 active:scale-90 text-ink shadow-sm"
                  onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_DPAD_UP)}
                  aria-label="D-pad Up"
                >
                  <ChevronUp className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Up (ArrowUp)</TooltipContent>
            </Tooltip>
          </div>

          {/* D-Pad Left */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-10 h-10 rounded-full hover:bg-surface-3 active:scale-90 text-ink shadow-sm"
                  onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_DPAD_LEFT)}
                  aria-label="D-pad Left"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Left (ArrowLeft)</TooltipContent>
            </Tooltip>
          </div>

          {/* Center OK Button */}
          <div className="relative z-10">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="w-12 h-12 rounded-full bg-surface-3 hover:bg-surface-2 border border-hairline font-bold text-xs text-ink active:scale-95 shadow-md flex flex-col items-center justify-center"
                  onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_DPAD_CENTER)}
                  aria-label="D-pad Select"
                >
                  <Circle className="w-4 h-4 fill-accent-blue/30 text-accent-blue" />
                  <span className="text-[9px] tracking-tight mt-0.5">OK</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select / Enter</TooltipContent>
            </Tooltip>
          </div>

          {/* D-Pad Right */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-10 h-10 rounded-full hover:bg-surface-3 active:scale-90 text-ink shadow-sm"
                  onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_DPAD_RIGHT)}
                  aria-label="D-pad Right"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Right (ArrowRight)</TooltipContent>
            </Tooltip>
          </div>

          {/* D-Pad Down */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-10 h-10 rounded-full hover:bg-surface-3 active:scale-90 text-ink shadow-sm"
                  onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_DPAD_DOWN)}
                  aria-label="D-pad Down"
                >
                  <ChevronDown className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Down (ArrowDown)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Auxiliary Controls (Back, Home, Menu) */}
        <div className="flex items-center justify-around w-full pt-2 border-t border-hairline/60">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-lg flex items-center space-x-1"
                onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_BACK)}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="text-xs">Back</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Android Back (Esc)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-lg flex items-center space-x-1"
                onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_HOME)}
              >
                <Home className="w-3.5 h-3.5" />
                <span className="text-xs">Home</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Android Home</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-lg flex items-center space-x-1"
                onClick={() => onSendKey(ANDROID_KEYCODES.KEYCODE_MENU)}
              >
                <Menu className="w-3.5 h-3.5" />
                <span className="text-xs">Menu</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Options / Menu</TooltipContent>
          </Tooltip>
        </div>

        {/* Ergonomic Hint */}
        <div className="mt-3 text-[10px] text-ink-muted/80 text-center leading-relaxed">
          Use <kbd className="px-1 py-0.5 bg-surface-2 rounded border border-hairline text-ink">Arrow Keys</kbd> + <kbd className="px-1 py-0.5 bg-surface-2 rounded border border-hairline text-ink">Enter</kbd> or swipe on screen to navigate.
        </div>
      </div>
    </TooltipProvider>
  );
};
