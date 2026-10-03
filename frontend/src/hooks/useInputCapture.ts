import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTION_DOWN,
  ACTION_MOVE,
  ACTION_UP,
  buildKeycodeEvent,
  buildScrollEvent,
  buildTextEvent,
  buildTouchEvent,
  buildSetClipboardEvent,
} from '../lib/control';
import {
  ANDROID_KEYCODES,
  mapBrowserCodeToAndroidKeycode,
  mapMetaState,
} from '../lib/keymap';

export type InputMode = 'touch' | 'dpad';

export interface UseInputCaptureProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  sendControl: (payload: Uint8Array | ArrayBuffer) => void;
  deviceWidth?: number;
  deviceHeight?: number;
  enabled?: boolean;
  inputMode?: InputMode;
  kioskEnabled?: boolean;
}

export function calculateNormalizedCoordinates(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  deviceWidth: number,
  deviceHeight: number
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0 || deviceWidth <= 0 || deviceHeight <= 0) {
    return { x: 0, y: 0 };
  }

  // Account for letterboxing/pillarboxing when canvas has CSS object-contain
  const scale = Math.min(rect.width / deviceWidth, rect.height / deviceHeight);
  const renderedWidth = deviceWidth * scale;
  const renderedHeight = deviceHeight * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;

  const rawX = ((clientX - rect.left - offsetX) / renderedWidth) * deviceWidth;
  const rawY = ((clientY - rect.top - offsetY) / renderedHeight) * deviceHeight;

  const x = Math.max(0, Math.min(deviceWidth - 1, Math.round(rawX)));
  const y = Math.max(0, Math.min(deviceHeight - 1, Math.round(rawY)));

  return { x, y };
}

export function useInputCapture({
  canvasRef,
  sendControl,
  deviceWidth = 1080,
  deviceHeight = 1920,
  enabled = true,
  inputMode = 'touch',
  kioskEnabled = false,
}: UseInputCaptureProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const isPointerDownRef = useRef(false);
  const lastMoveTimeRef = useRef(0);
  const lastDpadWheelTimeRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const gestureStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const virtualCursorRef = useRef({ x: deviceWidth / 2, y: deviceHeight / 2 });

  // Sync virtual cursor if dimensions change
  useEffect(() => {
    virtualCursorRef.current = { x: deviceWidth / 2, y: deviceHeight / 2 };
  }, [deviceWidth, deviceHeight]);

  // Send single key press (DOWN + UP)
  const sendKey = useCallback(
    (keycode: number) => {
      if (!enabled) return;
      if (kioskEnabled) {
        if (
          keycode === ANDROID_KEYCODES.KEYCODE_HOME ||
          keycode === ANDROID_KEYCODES.KEYCODE_APP_SWITCH ||
          keycode === ANDROID_KEYCODES.KEYCODE_POWER
        ) {
          return;
        }
      }
      sendControl(
        buildKeycodeEvent({
          action: ACTION_DOWN,
          keycode,
          repeat: 0,
          metaState: 0,
        })
      );
      sendControl(
        buildKeycodeEvent({
          action: ACTION_UP,
          keycode,
          repeat: 0,
          metaState: 0,
        })
      );
    },
    [enabled, kioskEnabled, sendControl]
  );

  // Send D-pad specific action
  const sendDpad = useCallback(
    (keycode: number) => {
      sendKey(keycode);
    },
    [sendKey]
  );

  // Send injected text
  const sendText = useCallback(
    (text: string) => {
      if (!enabled || !text) return;
      sendControl(buildTextEvent(text));
    },
    [enabled, sendControl]
  );

  // Send clipboard synchronization (SET_CLIPBOARD)
  const sendClipboard = useCallback(
    (text: string, paste = true) => {
      if (!enabled || !text) return;
      sendControl(buildSetClipboardEvent({ text, paste }));
    },
    [enabled, sendControl]
  );

  // Convenience navigation keys
  const sendBack = useCallback(() => sendKey(ANDROID_KEYCODES.KEYCODE_BACK), [sendKey]);
  const sendHome = useCallback(() => sendKey(ANDROID_KEYCODES.KEYCODE_HOME), [sendKey]);
  const sendAppSwitch = useCallback(
    () => sendKey(ANDROID_KEYCODES.KEYCODE_APP_SWITCH),
    [sendKey]
  );
  const sendVolumeUp = useCallback(
    () => sendKey(ANDROID_KEYCODES.KEYCODE_VOLUME_UP),
    [sendKey]
  );
  const sendVolumeDown = useCallback(
    () => sendKey(ANDROID_KEYCODES.KEYCODE_VOLUME_DOWN),
    [sendKey]
  );
  const sendVolumeMute = useCallback(
    () => sendKey(ANDROID_KEYCODES.KEYCODE_VOLUME_MUTE),
    [sendKey]
  );
  const sendPower = useCallback(
    () => sendKey(ANDROID_KEYCODES.KEYCODE_POWER),
    [sendKey]
  );

  const getTargetResolution = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      const w = canvas && canvas.width > 0 ? canvas.width : deviceWidth;
      const h = canvas && canvas.height > 0 ? canvas.height : deviceHeight;
      return { w, h };
    },
    [deviceWidth, deviceHeight]
  );

  // Pointer Lock API methods
  const requestPointerLock = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await canvas.requestPointerLock();
      } catch (err) {
        console.warn('Pointer lock request denied:', err);
      }
    }
  }, [canvasRef]);

  const exitPointerLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  // Monitor pointer lock state changes
  useEffect(() => {
    const handleLockChange = () => {
      const isLocked = document.pointerLockElement === canvasRef.current;
      setIsPointerLocked(isLocked);
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
    };
  }, [canvasRef]);

  // Handle locked mouse move with virtual cursor
  const handleLockedMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !isPointerLocked) return;

      const sensitivity = 1.0;
      virtualCursorRef.current.x = Math.max(
        0,
        Math.min(deviceWidth - 1, virtualCursorRef.current.x + e.movementX * sensitivity)
      );
      virtualCursorRef.current.y = Math.max(
        0,
        Math.min(deviceHeight - 1, virtualCursorRef.current.y + e.movementY * sensitivity)
      );

      // If mouse primary button is held, dispatch ACTION_MOVE with virtual position
      if (isPointerDownRef.current) {
        const now = performance.now();
        if (now - lastMoveTimeRef.current < 16) return;
        lastMoveTimeRef.current = now;

        sendControl(
          buildTouchEvent({
            action: ACTION_MOVE,
            pointerId: -1n,
            x: Math.round(virtualCursorRef.current.x),
            y: Math.round(virtualCursorRef.current.y),
            screenW: deviceWidth,
            screenH: deviceHeight,
            pressure: 0xffff,
            actionButton: 1,
            buttons: 1,
          })
        );
      }
    },
    [enabled, isPointerLocked, deviceWidth, deviceHeight, sendControl]
  );

  useEffect(() => {
    if (isPointerLocked) {
      document.addEventListener('mousemove', handleLockedMouseMove);
      return () => {
        document.removeEventListener('mousemove', handleLockedMouseMove);
      };
    }
  }, [isPointerLocked, handleLockedMouseMove]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      if (!target) return;

      // Scrcpy standard mouse mappings:
      // Right-Click (button 2) -> Android Back
      if (e.button === 2) {
        e.preventDefault();
        if (!kioskEnabled) {
          sendBack();
        }
        return;
      }
      // Middle-Click (button 1) -> Android Home
      if (e.button === 1) {
        e.preventDefault();
        if (!kioskEnabled) {
          sendHome();
        }
        return;
      }

      if (e.button !== 0) return; // Only primary (left) button for interactions
      e.preventDefault();
      setIsFocused(true);
      target.focus();
      isPointerDownRef.current = true;
      pointerIdRef.current = e.pointerId;

      // D-Pad Mode: Suppress raw touch event to keep Android out of Touch Mode
      if (inputMode === 'dpad') {
        gestureStartRef.current = { clientX: e.clientX, clientY: e.clientY };
        return;
      }

      // Pointer lock active: start touch at virtual cursor position
      if (isPointerLocked) {
        sendControl(
          buildTouchEvent({
            action: ACTION_DOWN,
            pointerId: -1n,
            x: Math.round(virtualCursorRef.current.x),
            y: Math.round(virtualCursorRef.current.y),
            screenW: deviceWidth,
            screenH: deviceHeight,
            pressure: 0xffff,
            actionButton: 1,
            buttons: 1,
          })
        );
        return;
      }

      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Ignored if browser pointer capture fails
      }

      const { w: activeW, h: activeH } = getTargetResolution(target);
      const rect = target.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        activeW,
        activeH
      );

      // Kiosk Mode: Bottom navigation bar is eliminated at the OS compositor level (h=0) via FRRO overlays.
      // Guard extreme top-edge swipes (top 15px) to prevent notification shade drag.
      if (kioskEnabled && y < 15) {
        return;
      }

      const pointerId = e.pointerType === 'mouse' ? -1n : BigInt(Math.max(0, e.pointerId));

      sendControl(
        buildTouchEvent({
          action: ACTION_DOWN,
          pointerId,
          x,
          y,
          screenW: activeW,
          screenH: activeH,
          pressure: 0xffff,
          actionButton: 1,
          buttons: 1,
        })
      );
    },
    [
      enabled,
      kioskEnabled,
      canvasRef,
      inputMode,
      isPointerLocked,
      deviceWidth,
      deviceHeight,
      sendBack,
      sendHome,
      getTargetResolution,
      sendControl,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;
      if (inputMode === 'dpad' || isPointerLocked) return;

      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      if (!target) return;
      e.preventDefault();

      // Throttle mouse moves to ~60Hz (16ms) to avoid saturating network buffer
      const now = performance.now();
      if (now - lastMoveTimeRef.current < 16) {
        return;
      }
      lastMoveTimeRef.current = now;

      const { w: activeW, h: activeH } = getTargetResolution(target);
      const rect = target.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        activeW,
        activeH
      );

      // Kiosk Mode: Bottom navigation bar is eliminated at the OS compositor level (h=0) via FRRO overlays.
      // Guard extreme top-edge swipes (top 15px) to prevent notification shade drag.
      if (kioskEnabled && y < 15) {
        return;
      }

      const pointerId = e.pointerType === 'mouse' ? -1n : BigInt(Math.max(0, e.pointerId));

      sendControl(
        buildTouchEvent({
          action: ACTION_MOVE,
          pointerId,
          x,
          y,
          screenW: activeW,
          screenH: activeH,
          pressure: 0xffff,
          actionButton: 1,
          buttons: 1,
        })
      );
    },
    [enabled, kioskEnabled, canvasRef, inputMode, isPointerLocked, getTargetResolution, sendControl]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      e.preventDefault();
      isPointerDownRef.current = false;
      pointerIdRef.current = null;

      // D-Pad Mode: Recognize tap vs swipe gesture
      if (inputMode === 'dpad') {
        if (gestureStartRef.current) {
          const dx = e.clientX - gestureStartRef.current.clientX;
          const dy = e.clientY - gestureStartRef.current.clientY;
          const dist = Math.hypot(dx, dy);
          gestureStartRef.current = null;

          if (dist < 15) {
            // Short tap: emit KEYCODE_DPAD_CENTER (23)
            sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_CENTER);
          } else if (dist >= 35) {
            // Swipe gesture: emit directional navigation
            if (Math.abs(dx) > Math.abs(dy)) {
              if (dx > 0) {
                sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_RIGHT);
              } else {
                sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_LEFT);
              }
            } else {
              if (dy > 0) {
                sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_DOWN);
              } else {
                sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_UP);
              }
            }
          }
        }
        return;
      }

      // Pointer lock active: release touch at virtual cursor position
      if (isPointerLocked) {
        sendControl(
          buildTouchEvent({
            action: ACTION_UP,
            pointerId: -1n,
            x: Math.round(virtualCursorRef.current.x),
            y: Math.round(virtualCursorRef.current.y),
            screenW: deviceWidth,
            screenH: deviceHeight,
            pressure: 0,
            actionButton: 0,
            buttons: 0,
          })
        );
        return;
      }

      if (target) {
        try {
          target.releasePointerCapture(e.pointerId);
        } catch {
          // Ignored
        }
      }

      const { w: activeW, h: activeH } = getTargetResolution(target);
      const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0, width: activeW, height: activeH };
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        activeW,
        activeH
      );

      const pointerId = e.pointerType === 'mouse' ? -1n : BigInt(Math.max(0, e.pointerId));

      sendControl(
        buildTouchEvent({
          action: ACTION_UP,
          pointerId,
          x,
          y,
          screenW: activeW,
          screenH: activeH,
          pressure: 0,
          actionButton: 0,
          buttons: 0,
        })
      );
    },
    [
      enabled,
      kioskEnabled,
      canvasRef,
      inputMode,
      isPointerLocked,
      deviceWidth,
      deviceHeight,
      getTargetResolution,
      sendControl,
      sendKey,
    ]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      isPointerDownRef.current = false;
      pointerIdRef.current = null;
      gestureStartRef.current = null;

      if (inputMode === 'dpad') return;

      const { w: activeW, h: activeH } = getTargetResolution(target);
      const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0, width: activeW, height: activeH };
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        activeW,
        activeH
      );

      const pointerId = e.pointerType === 'mouse' ? -1n : BigInt(Math.max(0, e.pointerId));

      sendControl(
        buildTouchEvent({
          action: ACTION_UP,
          pointerId,
          x,
          y,
          screenW: activeW,
          screenH: activeH,
          pressure: 0,
          actionButton: 0,
          buttons: 0,
        })
      );
    },
    [enabled, canvasRef, inputMode, getTargetResolution, sendControl]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement> | WheelEvent) => {
      if (!enabled) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      if (!target) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      // D-Pad Mode: Wheel up/down triggers discrete KEYCODE_DPAD_UP / KEYCODE_DPAD_DOWN
      if (inputMode === 'dpad') {
        const now = performance.now();
        if (now - lastDpadWheelTimeRef.current > 120) {
          lastDpadWheelTimeRef.current = now;
          if (e.deltaY > 0) {
            sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_DOWN);
          } else if (e.deltaY < 0) {
            sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_UP);
          }
        }
        return;
      }

      const { w: activeW, h: activeH } = getTargetResolution(target);
      const rect = target.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        activeW,
        activeH
      );

      let deltaX = e.deltaX;
      let deltaY = e.deltaY;
      if (e.deltaMode === 1) {
        deltaX *= 33;
        deltaY *= 33;
      } else if (e.deltaMode === 2) {
        deltaX *= 300;
        deltaY *= 300;
      }

      const hFloat = -deltaX / 100;
      const vFloat = -deltaY / 100;

      const hscroll = Math.max(-32768, Math.min(32767, Math.round(hFloat * 2048)));
      const vscroll = Math.max(-32768, Math.min(32767, Math.round(vFloat * 2048)));

      if (hscroll === 0 && vscroll === 0) return;

      sendControl(
        buildScrollEvent({
          x,
          y,
          screenW: activeW,
          screenH: activeH,
          hscroll,
          vscroll,
          buttons: 0,
        })
      );
    },
    [enabled, canvasRef, inputMode, getTargetResolution, sendControl, sendKey]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement> | KeyboardEvent) => {
      if (!enabled) return;

      // Pointer lock escape resolution:
      // If pointer is locked and user presses Escape, release lock natively
      // and SUPPRESS sending KEYCODE_BACK to Android!
      if (isPointerLocked && e.code === 'Escape') {
        exitPointerLock();
        return;
      }

      // Ctrl+V / Cmd+V host clipboard paste into Android
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        e.preventDefault();
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard
            .readText()
            .then((clipText) => {
              if (clipText) {
                sendClipboard(clipText, true);
              }
            })
            .catch(() => {
              // Permission prompt denied or unavailable
            });
        }
        return;
      }

      // D-Pad Mode: Map Enter or Space to KEYCODE_DPAD_CENTER
      if (inputMode === 'dpad' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        e.preventDefault();
        sendKey(ANDROID_KEYCODES.KEYCODE_DPAD_CENTER);
        return;
      }

      // Kiosk Mode: Suppress navigation escape keys
      if (kioskEnabled) {
        if (e.code === 'Home' || e.code === 'BrowserHome' || e.code === 'Power') {
          e.preventDefault();
          return;
        }
      }

      const keycode = mapBrowserCodeToAndroidKeycode(e.code);
      if (keycode === null) return;

      e.preventDefault();
      sendControl(
        buildKeycodeEvent({
          action: ACTION_DOWN,
          keycode,
          repeat: e.repeat ? 1 : 0,
          metaState: mapMetaState(e),
        })
      );
    },
    [enabled, kioskEnabled, inputMode, isPointerLocked, exitPointerLock, sendClipboard, sendKey, sendControl]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement> | KeyboardEvent) => {
      if (!enabled) return;

      if (isPointerLocked && e.code === 'Escape') {
        return;
      }

      if (inputMode === 'dpad' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        return;
      }

      const keycode = mapBrowserCodeToAndroidKeycode(e.code);
      if (keycode === null) return;

      e.preventDefault();
      sendControl(
        buildKeycodeEvent({
          action: ACTION_UP,
          keycode,
          repeat: 0,
          metaState: mapMetaState(e),
        })
      );
    },
    [enabled, inputMode, isPointerLocked, sendControl]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
      e.preventDefault(); // Suppress browser menu so right-click is back
    },
    []
  );

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  // Imperative non-passive wheel listener on canvas element to allow e.preventDefault()
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      handleWheel(e);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [canvasRef, enabled, handleWheel]);

  // Global window keyboard listener backup when canvas is focused or pointer locked
  useEffect(() => {
    if (!enabled || (!isFocused && !isPointerLocked)) return;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      handleKeyDown(e);
    };

    const onWindowKeyUp = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      handleKeyUp(e);
    };

    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('keyup', onWindowKeyUp);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('keyup', onWindowKeyUp);
    };
  }, [enabled, isFocused, isPointerLocked, handleKeyDown, handleKeyUp]);

  return {
    isFocused,
    isPointerLocked,
    requestPointerLock,
    exitPointerLock,
    sendKey,
    sendDpad,
    sendText,
    sendClipboard,
    sendBack,
    sendHome,
    sendAppSwitch,
    sendVolumeUp,
    sendVolumeDown,
    sendVolumeMute,
    sendPower,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyDown,
    handleKeyUp,
    handleContextMenu,
    handleFocus,
    handleBlur,
  };
}
