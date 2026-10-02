import { describe, it, expect } from 'vitest';
import {
  ANDROID_KEYCODES,
  mapBrowserCodeToAndroidKeycode,
  mapMetaState,
} from './keymap';

describe('keymap', () => {
  describe('mapBrowserCodeToAndroidKeycode', () => {
    it('maps alphanumeric keys correctly', () => {
      expect(mapBrowserCodeToAndroidKeycode('KeyA')).toBe(ANDROID_KEYCODES.KEYCODE_A);
      expect(mapBrowserCodeToAndroidKeycode('KeyZ')).toBe(ANDROID_KEYCODES.KEYCODE_Z);
      expect(mapBrowserCodeToAndroidKeycode('Digit0')).toBe(ANDROID_KEYCODES.KEYCODE_0);
      expect(mapBrowserCodeToAndroidKeycode('Digit9')).toBe(ANDROID_KEYCODES.KEYCODE_9);
    });

    it('maps control and navigation keys correctly', () => {
      expect(mapBrowserCodeToAndroidKeycode('Enter')).toBe(ANDROID_KEYCODES.KEYCODE_ENTER);
      expect(mapBrowserCodeToAndroidKeycode('NumpadEnter')).toBe(ANDROID_KEYCODES.KEYCODE_NUMPAD_ENTER);
      expect(mapBrowserCodeToAndroidKeycode('Backspace')).toBe(ANDROID_KEYCODES.KEYCODE_DEL);
      expect(mapBrowserCodeToAndroidKeycode('Delete')).toBe(ANDROID_KEYCODES.KEYCODE_FORWARD_DEL);
      expect(mapBrowserCodeToAndroidKeycode('Tab')).toBe(ANDROID_KEYCODES.KEYCODE_TAB);
      expect(mapBrowserCodeToAndroidKeycode('Space')).toBe(ANDROID_KEYCODES.KEYCODE_SPACE);
      expect(mapBrowserCodeToAndroidKeycode('Escape')).toBe(ANDROID_KEYCODES.KEYCODE_ESCAPE);
      expect(mapBrowserCodeToAndroidKeycode('ArrowUp')).toBe(ANDROID_KEYCODES.KEYCODE_DPAD_UP);
      expect(mapBrowserCodeToAndroidKeycode('ArrowDown')).toBe(ANDROID_KEYCODES.KEYCODE_DPAD_DOWN);
      expect(mapBrowserCodeToAndroidKeycode('ArrowLeft')).toBe(ANDROID_KEYCODES.KEYCODE_DPAD_LEFT);
      expect(mapBrowserCodeToAndroidKeycode('ArrowRight')).toBe(ANDROID_KEYCODES.KEYCODE_DPAD_RIGHT);
      expect(mapBrowserCodeToAndroidKeycode('Home')).toBe(ANDROID_KEYCODES.KEYCODE_MOVE_HOME);
      expect(mapBrowserCodeToAndroidKeycode('End')).toBe(ANDROID_KEYCODES.KEYCODE_MOVE_END);
      expect(mapBrowserCodeToAndroidKeycode('PageUp')).toBe(ANDROID_KEYCODES.KEYCODE_PAGE_UP);
      expect(mapBrowserCodeToAndroidKeycode('PageDown')).toBe(ANDROID_KEYCODES.KEYCODE_PAGE_DOWN);
    });

    it('maps modifier keys correctly', () => {
      expect(mapBrowserCodeToAndroidKeycode('ShiftLeft')).toBe(ANDROID_KEYCODES.KEYCODE_SHIFT_LEFT);
      expect(mapBrowserCodeToAndroidKeycode('ShiftRight')).toBe(ANDROID_KEYCODES.KEYCODE_SHIFT_RIGHT);
      expect(mapBrowserCodeToAndroidKeycode('ControlLeft')).toBe(ANDROID_KEYCODES.KEYCODE_CTRL_LEFT);
      expect(mapBrowserCodeToAndroidKeycode('ControlRight')).toBe(ANDROID_KEYCODES.KEYCODE_CTRL_RIGHT);
      expect(mapBrowserCodeToAndroidKeycode('AltLeft')).toBe(ANDROID_KEYCODES.KEYCODE_ALT_LEFT);
      expect(mapBrowserCodeToAndroidKeycode('AltRight')).toBe(ANDROID_KEYCODES.KEYCODE_ALT_RIGHT);
      expect(mapBrowserCodeToAndroidKeycode('MetaLeft')).toBe(ANDROID_KEYCODES.KEYCODE_META_LEFT);
      expect(mapBrowserCodeToAndroidKeycode('MetaRight')).toBe(ANDROID_KEYCODES.KEYCODE_META_RIGHT);
    });

    it('maps function and numpad keys correctly', () => {
      expect(mapBrowserCodeToAndroidKeycode('Insert')).toBe(ANDROID_KEYCODES.KEYCODE_INSERT);
      expect(mapBrowserCodeToAndroidKeycode('ContextMenu')).toBe(ANDROID_KEYCODES.KEYCODE_MENU);
      expect(mapBrowserCodeToAndroidKeycode('F1')).toBe(ANDROID_KEYCODES.KEYCODE_F1);
      expect(mapBrowserCodeToAndroidKeycode('F12')).toBe(ANDROID_KEYCODES.KEYCODE_F12);
      expect(mapBrowserCodeToAndroidKeycode('Numpad0')).toBe(ANDROID_KEYCODES.KEYCODE_NUMPAD_0);
      expect(mapBrowserCodeToAndroidKeycode('NumpadAdd')).toBe(ANDROID_KEYCODES.KEYCODE_NUMPAD_ADD);
      expect(mapBrowserCodeToAndroidKeycode('Quote')).toBe(ANDROID_KEYCODES.KEYCODE_APOSTROPHE);
    });

    it('returns null for unrecognized keys', () => {
      expect(mapBrowserCodeToAndroidKeycode('F15')).toBeNull();
      expect(mapBrowserCodeToAndroidKeycode('')).toBeNull();
    });
  });

  describe('mapMetaState', () => {
    it('returns 0 when no modifiers are active', () => {
      expect(mapMetaState({})).toBe(0);
    });

    it('calculates bitmask for active modifiers', () => {
      const shiftState = mapMetaState({ shiftKey: true });
      expect(shiftState & 0x01).toBeTruthy(); // AMETA_SHIFT_ON

      const ctrlState = mapMetaState({ ctrlKey: true });
      expect(ctrlState & 0x1000).toBeTruthy(); // AMETA_CTRL_ON

      const altState = mapMetaState({ altKey: true });
      expect(altState & 0x02).toBeTruthy(); // AMETA_ALT_ON

      const combined = mapMetaState({ shiftKey: true, ctrlKey: true });
      expect(combined & 0x01).toBeTruthy();
      expect(combined & 0x1000).toBeTruthy();
    });
  });
});
