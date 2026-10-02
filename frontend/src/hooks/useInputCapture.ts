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

export interface UseInputCaptureProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  sendControl: (payload: Uint8Array | ArrayBuffer) => void;
  deviceWidth?: number;
  deviceHeight?: number;
  enabled?: boolean;
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
}: UseInputCaptureProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isPointerDownRef = useRef(false);
  const lastMoveTimeRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  // Send single key press (DOWN + UP)
  const sendKey = useCallback(
    (keycode: number) => {
      if (!enabled) return;
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
    [enabled, sendControl]
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      if (!target) return;

      // Scrcpy standard mouse mappings:
      // Right-Click (button 2) -> Android Back
      if (e.button === 2) {
        e.preventDefault();
        sendBack();
        return;
      }
      // Middle-Click (button 1) -> Android Home
      if (e.button === 1) {
        e.preventDefault();
        sendHome();
        return;
      }

      if (e.button !== 0) return; // Only primary (left) button for touches
      e.preventDefault();
      setIsFocused(true);
      target.focus();
      isPointerDownRef.current = true;
      pointerIdRef.current = e.pointerId;

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
    [enabled, canvasRef, sendBack, sendHome, getTargetResolution, sendControl]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;
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
    [enabled, canvasRef, getTargetResolution, sendControl]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      e.preventDefault();
      isPointerDownRef.current = false;
      pointerIdRef.current = null;

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
    [enabled, canvasRef, getTargetResolution, sendControl]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      isPointerDownRef.current = false;
      pointerIdRef.current = null;

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
    [enabled, canvasRef, getTargetResolution, sendControl]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement> | WheelEvent) => {
      if (!enabled) return;
      const target = (e.currentTarget || canvasRef.current) as HTMLCanvasElement | null;
      if (!target) return;

      if (e.cancelable) {
        e.preventDefault();
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
        // Line delta mode
        deltaX *= 33;
        deltaY *= 33;
      } else if (e.deltaMode === 2) {
        // Page delta mode
        deltaX *= 300;
        deltaY *= 300;
      }

      // In scrcpy protocol: hscroll & vscroll are 16-bit signed fixed-point numbers (i16fp)
      // where 1.0 scroll unit = 2048 (0x0800). Negative vscroll is scroll down, positive is scroll up.
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
    [enabled, canvasRef, getTargetResolution, sendControl]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement> | KeyboardEvent) => {
      if (!enabled) return;

      // Ctrl+V / Cmd+V host clipboard paste into Android
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        e.preventDefault();
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then((clipText) => {
            if (clipText) {
              sendClipboard(clipText, true);
            }
          }).catch(() => {
            // Permission prompt denied or unavailable
          });
        }
        return;
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
    [enabled, sendClipboard, sendControl]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement> | KeyboardEvent) => {
      if (!enabled) return;

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
    [enabled, sendControl]
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

  // Global window keyboard listener backup when focused
  useEffect(() => {
    if (!enabled || !isFocused) return;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing if user is focused inside a text input field or textarea
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
  }, [enabled, isFocused, handleKeyDown, handleKeyUp]);

  return {
    sendKey,
    sendText,
    sendClipboard,
    sendBack,
    sendHome,
    sendAppSwitch,
    sendVolumeUp,
    sendVolumeDown,
    sendPower,
    isFocused,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    handleKeyDown,
    handleKeyUp,
    handleContextMenu,
    handleFocus,
    handleBlur,
  };
}

