import { useCallback, useEffect, useRef } from 'react';
import {
  ACTION_DOWN,
  ACTION_MOVE,
  ACTION_UP,
  buildKeycodeEvent,
  buildScrollEvent,
  buildTextEvent,
  buildTouchEvent,
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
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }

  const rawX = ((clientX - rect.left) / rect.width) * deviceWidth;
  const rawY = ((clientY - rect.top) / rect.height) * deviceHeight;

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Only primary (left) button
      isPointerDownRef.current = true;
      pointerIdRef.current = e.pointerId;

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignored if browser pointer capture fails
      }

      const rect = canvas.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        deviceWidth,
        deviceHeight
      );

      sendControl(
        buildTouchEvent({
          action: ACTION_DOWN,
          pointerId: -1n,
          x,
          y,
          screenW: deviceWidth,
          screenH: deviceHeight,
          pressure: 0xffff,
          actionButton: 1,
          buttons: 1,
        })
      );
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;

      // Throttle mouse moves to ~60Hz (16ms) to avoid saturating network buffer
      const now = performance.now();
      if (now - lastMoveTimeRef.current < 16) {
        return;
      }
      lastMoveTimeRef.current = now;

      const rect = canvas.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        deviceWidth,
        deviceHeight
      );

      sendControl(
        buildTouchEvent({
          action: ACTION_MOVE,
          pointerId: -1n,
          x,
          y,
          screenW: deviceWidth,
          screenH: deviceHeight,
          pressure: 0xffff,
          actionButton: 1,
          buttons: 1,
        })
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      pointerIdRef.current = null;

      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }

      const rect = canvas.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        deviceWidth,
        deviceHeight
      );

      sendControl(
        buildTouchEvent({
          action: ACTION_UP,
          pointerId: -1n,
          x,
          y,
          screenW: deviceWidth,
          screenH: deviceHeight,
          pressure: 0,
          actionButton: 0,
          buttons: 0,
        })
      );
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      pointerIdRef.current = null;

      const rect = canvas.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        deviceWidth,
        deviceHeight
      );

      sendControl(
        buildTouchEvent({
          action: ACTION_UP,
          pointerId: -1n,
          x,
          y,
          screenW: deviceWidth,
          screenH: deviceHeight,
          pressure: 0,
          actionButton: 0,
          buttons: 0,
        })
      );
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const { x, y } = calculateNormalizedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        deviceWidth,
        deviceHeight
      );

      // In scrcpy protocol: negative vscroll is scroll down, positive is scroll up
      const hscroll = Math.max(-10, Math.min(10, -Math.round(e.deltaX / 20)));
      const vscroll = Math.max(-10, Math.min(10, -Math.round(e.deltaY / 20)));

      sendControl(
        buildScrollEvent({
          x,
          y,
          screenW: deviceWidth,
          screenH: deviceHeight,
          hscroll,
          vscroll,
          buttons: 0,
        })
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
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
    };

    const handleKeyUp = (e: KeyboardEvent) => {
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
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
    };
  }, [canvasRef, enabled, deviceWidth, deviceHeight, sendControl]);

  return {
    sendKey,
    sendText,
    sendBack,
    sendHome,
    sendAppSwitch,
    sendVolumeUp,
    sendVolumeDown,
  };
}
