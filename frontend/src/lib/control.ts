// scrcpy v2.7 Control Message Types
export const MSG_TYPE_INJECT_KEYCODE = 0x00;
export const MSG_TYPE_INJECT_TEXT = 0x01;
export const MSG_TYPE_INJECT_TOUCH_EVENT = 0x02;
export const MSG_TYPE_INJECT_SCROLL_EVENT = 0x03;
export const MSG_TYPE_SET_CLIPBOARD = 0x09;

// Actions
export const ACTION_DOWN = 0x00;
export const ACTION_UP = 0x01;
export const ACTION_MOVE = 0x02;
export const ACTION_CANCEL = 0x03;

export interface TouchEventParams {
  action: number;
  pointerId?: bigint;
  x: number;
  y: number;
  screenW: number;
  screenH: number;
  pressure?: number;
  actionButton?: number;
  buttons?: number;
}

/**
 * Builds an INJECT_TOUCH_EVENT message (32 bytes).
 */
export function buildTouchEvent({
  action,
  pointerId = -1n,
  x,
  y,
  screenW,
  screenH,
  pressure = 0xffff,
  actionButton = 1,
  buttons = 1,
}: TouchEventParams): Uint8Array {
  const buf = new Uint8Array(32);
  const view = new DataView(buf.buffer);

  view.setUint8(0, MSG_TYPE_INJECT_TOUCH_EVENT);
  view.setUint8(1, action);
  view.setBigInt64(2, pointerId, false); // 8 bytes BigEndian
  view.setInt32(10, Math.round(x), false); // 4 bytes BigEndian
  view.setInt32(14, Math.round(y), false); // 4 bytes BigEndian
  view.setUint16(18, screenW, false); // 2 bytes BigEndian
  view.setUint16(20, screenH, false); // 2 bytes BigEndian
  view.setUint16(22, pressure, false); // 2 bytes BigEndian
  view.setUint32(24, actionButton, false); // 4 bytes BigEndian
  view.setUint32(28, buttons, false); // 4 bytes BigEndian

  return buf;
}

export interface ScrollEventParams {
  x: number;
  y: number;
  screenW: number;
  screenH: number;
  hscroll: number;
  vscroll: number;
  buttons?: number;
}

/**
 * Builds an INJECT_SCROLL_EVENT message (21 bytes).
 */
export function buildScrollEvent({
  x,
  y,
  screenW,
  screenH,
  hscroll,
  vscroll,
  buttons = 0,
}: ScrollEventParams): Uint8Array {
  const buf = new Uint8Array(21);
  const view = new DataView(buf.buffer);

  view.setUint8(0, MSG_TYPE_INJECT_SCROLL_EVENT);
  view.setInt32(1, Math.round(x), false);
  view.setInt32(5, Math.round(y), false);
  view.setUint16(9, screenW, false);
  view.setUint16(11, screenH, false);
  view.setInt16(13, hscroll, false);
  view.setInt16(15, vscroll, false);
  view.setUint32(17, buttons, false);

  return buf;
}

export interface KeycodeEventParams {
  action: number;
  keycode: number;
  repeat?: number;
  metaState?: number;
}

/**
 * Builds an INJECT_KEYCODE message (14 bytes).
 */
export function buildKeycodeEvent({
  action,
  keycode,
  repeat = 0,
  metaState = 0,
}: KeycodeEventParams): Uint8Array {
  const buf = new Uint8Array(14);
  const view = new DataView(buf.buffer);

  view.setUint8(0, MSG_TYPE_INJECT_KEYCODE);
  view.setUint8(1, action);
  view.setUint32(2, keycode, false);
  view.setUint32(6, repeat, false);
  view.setUint32(10, metaState, false);

  return buf;
}

/**
 * Builds an INJECT_TEXT message (5 + N bytes).
 */
export function buildTextEvent(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const buf = new Uint8Array(5 + textBytes.byteLength);
  const view = new DataView(buf.buffer);

  view.setUint8(0, MSG_TYPE_INJECT_TEXT);
  view.setUint32(1, textBytes.byteLength, false);
  buf.set(textBytes, 5);

  return buf;
}
