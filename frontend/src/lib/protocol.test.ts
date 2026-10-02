import { describe, it, expect } from 'vitest';
import {
  CHANNEL_VIDEO,
  CHANNEL_PING,
  PTS_KEY_FLAG,
  buildPingPacket,
  parsePingMessage,
  parseVideoMessage,
} from './protocol';

describe('protocol', () => {
  it('parses valid video packet correctly', () => {
    const nalData = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x65]);
    const buffer = new ArrayBuffer(13 + nalData.length);
    const view = new DataView(buffer);

    view.setUint8(0, CHANNEL_VIDEO);
    const ptsWithFlags = 123456n | PTS_KEY_FLAG;
    view.setBigUint64(1, ptsWithFlags, false);
    view.setUint32(9, nalData.length, false);
    new Uint8Array(buffer, 13).set(nalData);

    const parsed = parseVideoMessage(buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.ptsMicroseconds).toBe(123456);
    expect(parsed?.isKeyFrame).toBe(true);
    expect(parsed?.isConfig).toBe(false);
    expect(parsed?.packetSize).toBe(nalData.length);
    expect(parsed?.nalData).toEqual(nalData);
  });

  it('serializes and parses ping message roundtrip', () => {
    const testTime = 1727850000123.45;
    const packet = buildPingPacket(testTime);

    expect(packet.byteLength).toBe(9);
    expect(packet[0]).toBe(CHANNEL_PING);

    const parsed = parsePingMessage(packet.buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.timestampMs).toBeCloseTo(testTime, 1);
  });

  it('rejects invalid or too short ping messages', () => {
    const tooShort = new Uint8Array([CHANNEL_PING, 1, 2, 3]).buffer;
    expect(parsePingMessage(tooShort)).toBeNull();

    const wrongChannel = new Uint8Array([0x05, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(parsePingMessage(wrongChannel)).toBeNull();
  });
});
