// Single WebSocket 1-byte channel multiplexing prefixes
export const CHANNEL_VIDEO = 0x00;
export const CHANNEL_AUDIO = 0x01;
export const CHANNEL_CONTROL = 0x02;
export const CHANNEL_PING = 0x03;

// scrcpy 64-bit PTS flags
export const PTS_CONFIG_FLAG = 1n << 63n; // SPS/PPS parameter set
export const PTS_KEY_FLAG = 1n << 62n;    // IDR keyframe slice

export interface ParsedVideoHeader {
  ptsMicroseconds: number;
  isConfig: boolean;
  isKeyFrame: boolean;
  packetSize: number;
  nalData: Uint8Array;
}

/**
 * Parses a binary scrcpy video message received from the Go backend.
 * Message layout: [channel:1][pts_and_flags:8][packet_size:4][nal_data:N]
 */
export function parseVideoMessage(buffer: ArrayBuffer | ArrayBufferLike): ParsedVideoHeader | null {
  if (buffer.byteLength < 13) return null;

  const view = new DataView(buffer as ArrayBuffer);
  const channel = view.getUint8(0);
  if (channel !== CHANNEL_VIDEO) return null;

  const ptsRaw = view.getBigUint64(1, false);
  const packetSize = view.getUint32(9, false);

  const isConfig = (ptsRaw & PTS_CONFIG_FLAG) !== 0n;
  const isKeyFrame = (ptsRaw & PTS_KEY_FLAG) !== 0n;
  const ptsMicroseconds = Number(ptsRaw & ~(PTS_CONFIG_FLAG | PTS_KEY_FLAG));

  const nalData = new Uint8Array(buffer as ArrayBuffer, 13, packetSize);

  return {
    ptsMicroseconds,
    isConfig,
    isKeyFrame,
    packetSize,
    nalData,
  };
}

/**
 * Builds a 9-byte binary ping packet for round-trip latency measurement.
 * Layout: [channel: 0x03][timestamp_microseconds: 8 bytes BigEndian]
 */
export function buildPingPacket(timestampMs: number): Uint8Array {
  const buf = new Uint8Array(9);
  const view = new DataView(buf.buffer);

  view.setUint8(0, CHANNEL_PING);
  const timestampUs = BigInt(Math.round(timestampMs * 1000));
  view.setBigUint64(1, timestampUs, false);

  return buf;
}

/**
 * Parses an echoed binary ping packet received from the Go backend.
 */
export function parsePingMessage(buffer: ArrayBuffer | ArrayBufferLike): { timestampMs: number } | null {
  if (buffer.byteLength < 9) return null;

  const view = new DataView(buffer as ArrayBuffer);
  const channel = view.getUint8(0);
  if (channel !== CHANNEL_PING) return null;

  const timestampUs = view.getBigUint64(1, false);
  return {
    timestampMs: Number(timestampUs) / 1000,
  };
}
