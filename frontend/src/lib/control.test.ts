import { describe, it, expect } from 'vitest';
import {
  ACTION_DOWN,
  buildTouchEvent,
  buildScrollEvent,
  buildKeycodeEvent,
  buildTextEvent,
  buildSetClipboardEvent,
  MSG_TYPE_INJECT_KEYCODE,
  MSG_TYPE_INJECT_TEXT,
  MSG_TYPE_INJECT_TOUCH_EVENT,
  MSG_TYPE_INJECT_SCROLL_EVENT,
  MSG_TYPE_SET_CLIPBOARD,
} from './control';

describe('control serializers', () => {
  it('serializes touch event correctly to 32 bytes', () => {
    const bytes = buildTouchEvent({
      action: ACTION_DOWN,
      pointerId: -1n,
      x: 540,
      y: 960,
      screenW: 1080,
      screenH: 1920,
      pressure: 0xffff,
      actionButton: 1,
      buttons: 1,
    });

    expect(bytes.byteLength).toBe(32);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint8(0)).toBe(MSG_TYPE_INJECT_TOUCH_EVENT);
    expect(view.getUint8(1)).toBe(ACTION_DOWN);
    expect(view.getBigInt64(2, false)).toBe(-1n);
    expect(view.getInt32(10, false)).toBe(540);
    expect(view.getInt32(14, false)).toBe(960);
    expect(view.getUint16(18, false)).toBe(1080);
    expect(view.getUint16(20, false)).toBe(1920);
    expect(view.getUint16(22, false)).toBe(0xffff);
    expect(view.getUint32(24, false)).toBe(1);
    expect(view.getUint32(28, false)).toBe(1);
  });

  it('serializes scroll event correctly to 21 bytes', () => {
    const bytes = buildScrollEvent({
      x: 200,
      y: 400,
      screenW: 1080,
      screenH: 1920,
      hscroll: 0,
      vscroll: -5,
      buttons: 0,
    });

    expect(bytes.byteLength).toBe(21);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint8(0)).toBe(MSG_TYPE_INJECT_SCROLL_EVENT);
    expect(view.getInt32(1, false)).toBe(200);
    expect(view.getInt32(5, false)).toBe(400);
    expect(view.getUint16(9, false)).toBe(1080);
    expect(view.getUint16(11, false)).toBe(1920);
    expect(view.getInt16(13, false)).toBe(0);
    expect(view.getInt16(15, false)).toBe(-5);
    expect(view.getUint32(17, false)).toBe(0);
  });

  it('serializes keycode event correctly to 14 bytes', () => {
    const bytes = buildKeycodeEvent({
      action: ACTION_DOWN,
      keycode: 66, // KEYCODE_ENTER
      repeat: 0,
      metaState: 0,
    });

    expect(bytes.byteLength).toBe(14);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint8(0)).toBe(MSG_TYPE_INJECT_KEYCODE);
    expect(view.getUint8(1)).toBe(ACTION_DOWN);
    expect(view.getUint32(2, false)).toBe(66);
    expect(view.getUint32(6, false)).toBe(0);
    expect(view.getUint32(10, false)).toBe(0);
  });

  it('serializes text event correctly to 5 + N bytes', () => {
    const text = 'hello android';
    const bytes = buildTextEvent(text);

    expect(bytes.byteLength).toBe(5 + 13);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint8(0)).toBe(MSG_TYPE_INJECT_TEXT);
    expect(view.getUint32(1, false)).toBe(13);

    const decoder = new TextDecoder();
    const extracted = decoder.decode(bytes.subarray(5));
    expect(extracted).toBe(text);
  });

  it('serializes set clipboard event correctly to 14 + N bytes', () => {
    const text = 'hello paste 📋';
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);
    const bytes = buildSetClipboardEvent({ sequence: 100n, paste: true, text });

    expect(bytes.byteLength).toBe(14 + textBytes.byteLength);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint8(0)).toBe(MSG_TYPE_SET_CLIPBOARD);
    expect(view.getBigUint64(1, false)).toBe(100n);
    expect(view.getUint8(9)).toBe(1);
    expect(view.getUint32(10, false)).toBe(textBytes.byteLength);

    const decoder = new TextDecoder();
    const extracted = decoder.decode(bytes.subarray(14));
    expect(extracted).toBe(text);
  });
});

