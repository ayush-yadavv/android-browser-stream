import { describe, it, expect } from 'vitest';
import {
  CHANNEL_VIDEO,
  CHANNEL_AUDIO,
  CHANNEL_PING,
  CHANNEL_METADATA,
  CHANNEL_CONTROL,
  PTS_KEY_FLAG,
  PTS_CONFIG_FLAG,
  buildPingPacket,
  parsePingMessage,
  parseVideoMessage,
  parseAudioMessage,
  parseMetadataMessage,
  parseClipboardDeviceMessage,
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

  it('rejects video packet exceeding 16MB threshold or corrupted bounds', () => {
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);
    view.setUint8(0, CHANNEL_VIDEO);
    view.setBigUint64(1, 0n, false);
    view.setUint32(9, 20 * 1024 * 1024, false); // 20MB declared

    expect(parseVideoMessage(buffer)).toBeNull();
  });

  it('parses metadata handshake packet (Channel 0x04)', () => {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, CHANNEL_METADATA);
    view.setUint8(1, 0x03); // WireCodecAV1
    view.setUint16(2, 1080, false);
    view.setUint16(4, 1920, false);

    const parsed = parseMetadataMessage(buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.wireCodecId).toBe(0x03);
    expect(parsed?.width).toBe(1080);
    expect(parsed?.height).toBe(1920);
  });

  it('parses device-to-host clipboard message', () => {
    const text = 'https://healthtick.io';
    const textBytes = new TextEncoder().encode(text);
    const buffer = new ArrayBuffer(6 + textBytes.length);
    const view = new DataView(buffer);

    view.setUint8(0, CHANNEL_CONTROL);
    view.setUint8(1, 0x00); // DEVICE_MSG_TYPE_CLIPBOARD
    view.setUint32(2, textBytes.length, false);
    new Uint8Array(buffer, 6).set(textBytes);

    const parsed = parseClipboardDeviceMessage(buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.text).toBe(text);
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

  it('parses valid audio packet correctly (Channel 0x01)', () => {
    const audioPayload = new Uint8Array([0x21, 0x10, 0x05, 0x54, 0xAA]);
    const buffer = new ArrayBuffer(13 + audioPayload.length);
    const view = new DataView(buffer);

    view.setUint8(0, CHANNEL_AUDIO);
    const pts = 987654321n;
    view.setBigUint64(1, pts, false);
    view.setUint32(9, audioPayload.length, false);
    new Uint8Array(buffer, 13).set(audioPayload);

    const parsed = parseAudioMessage(buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.ptsMicroseconds).toBe(987654321);
    expect(parsed?.isConfig).toBe(false);
    expect(parsed?.packetSize).toBe(audioPayload.length);
    expect(parsed?.data).toEqual(audioPayload);
  });

  it('parses audio config packet (PTS_CONFIG_FLAG)', () => {
    const configPayload = new Uint8Array([0x12, 0x10]); // AAC AudioSpecificConfig
    const buffer = new ArrayBuffer(13 + configPayload.length);
    const view = new DataView(buffer);

    view.setUint8(0, CHANNEL_AUDIO);
    const ptsWithConfig = 500000n | PTS_CONFIG_FLAG;
    view.setBigUint64(1, ptsWithConfig, false);
    view.setUint32(9, configPayload.length, false);
    new Uint8Array(buffer, 13).set(configPayload);

    const parsed = parseAudioMessage(buffer);
    expect(parsed).not.toBeNull();
    expect(parsed?.isConfig).toBe(true);
    expect(parsed?.ptsMicroseconds).toBe(500000);
    expect(parsed?.data).toEqual(configPayload);
  });

  it('rejects corrupt or oversized audio packets', () => {
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);
    view.setUint8(0, CHANNEL_AUDIO);
    view.setBigUint64(1, 0n, false);
    view.setUint32(9, 1024 * 1024, false); // 1MB > 512KB limit

    expect(parseAudioMessage(buffer)).toBeNull();
  });
});
