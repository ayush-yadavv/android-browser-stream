// Single WebSocket 1-byte channel multiplexing prefixes
export const CHANNEL_VIDEO = 0x00;
export const CHANNEL_AUDIO = 0x01;
export const CHANNEL_CONTROL = 0x02;
export const CHANNEL_PING = 0x03;
export const CHANNEL_METADATA = 0x04;

// 16MB maximum single video packet threshold
export const MAX_VIDEO_PACKET_SIZE = 16 * 1024 * 1024;
// 512KB maximum single audio packet threshold
export const MAX_AUDIO_PACKET_SIZE = 512 * 1024;

// scrcpy 64-bit PTS flags
export const PTS_CONFIG_FLAG = 1n << 63n; // SPS/PPS parameter set or audio config
export const PTS_KEY_FLAG = 1n << 62n;    // IDR keyframe slice

export interface ParsedVideoHeader {
  ptsMicroseconds: number;
  isConfig: boolean;
  isKeyFrame: boolean;
  packetSize: number;
  nalData: Uint8Array;
}

export interface ParsedAudioHeader {
  ptsMicroseconds: number;
  isConfig: boolean;
  packetSize: number;
  data: Uint8Array;
}

export interface ParsedMetadataHeader {
  wireCodecId: number;
  width: number;
  height: number;
}

export interface ParsedClipboardMessage {
  text: string;
}

/**
 * Parses a binary scrcpy audio message received from the Go backend (Channel 0x01).
 * Layout: [channel: 1B (0x01)][pts_and_flags: 8B BE][packet_size: 4B BE][data: N B]
 */
export function parseAudioMessage(buffer: ArrayBuffer | ArrayBufferLike): ParsedAudioHeader | null {
  if (!buffer || buffer.byteLength < 13) return null;

  try {
    const view = new DataView(buffer as ArrayBuffer);
    const channel = view.getUint8(0);
    if (channel !== CHANNEL_AUDIO) return null;

    const ptsRaw = view.getBigUint64(1, false);
    const packetSize = view.getUint32(9, false);

    if (packetSize > MAX_AUDIO_PACKET_SIZE || buffer.byteLength < 13 + packetSize) {
      return null;
    }

    const isConfig = (ptsRaw & PTS_CONFIG_FLAG) !== 0n;
    const ptsMicroseconds = Number(ptsRaw & ~(PTS_CONFIG_FLAG | PTS_KEY_FLAG));
    const data = new Uint8Array(buffer as ArrayBuffer, 13, packetSize);

    return {
      ptsMicroseconds,
      isConfig,
      packetSize,
      data,
    };
  } catch {
    return null;
  }
}

/**
 * Parses a binary scrcpy video message received from the Go backend.
 * Message layout: [channel:1][pts_and_flags:8][packet_size:4][nal_data:N]
 */
export function parseVideoMessage(buffer: ArrayBuffer | ArrayBufferLike): ParsedVideoHeader | null {
  if (!buffer || buffer.byteLength < 13) return null;

  try {
    const view = new DataView(buffer as ArrayBuffer);
    const channel = view.getUint8(0);
    if (channel !== CHANNEL_VIDEO) return null;

    const ptsRaw = view.getBigUint64(1, false);
    const packetSize = view.getUint32(9, false);

    // Bounds and framing validation (Demuxer resilience)
    if (packetSize > MAX_VIDEO_PACKET_SIZE || buffer.byteLength < 13 + packetSize) {
      return null;
    }

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
  } catch {
    return null;
  }
}

/**
 * Parses a stream metadata handshake packet (Channel 0x04).
 * Layout: [channel: 0x04][wireCodecId: 1B][width: 2B BE][height: 2B BE]
 */
export function parseMetadataMessage(buffer: ArrayBuffer | ArrayBufferLike): ParsedMetadataHeader | null {
  if (!buffer || buffer.byteLength < 6) return null;

  const view = new DataView(buffer as ArrayBuffer);
  const channel = view.getUint8(0);
  if (channel !== CHANNEL_METADATA) return null;

  const wireCodecId = view.getUint8(1);
  const width = view.getUint16(2, false);
  const height = view.getUint16(4, false);

  return { wireCodecId, width, height };
}

/**
 * Parses a device-to-host clipboard message (scrcpy device msg type 0x00).
 * Layout: [channel: 0x02][type: 0x00][length: 4B BE][text: N B]
 */
export function parseClipboardDeviceMessage(buffer: ArrayBuffer | ArrayBufferLike): ParsedClipboardMessage | null {
  if (!buffer || buffer.byteLength < 6) return null;

  const view = new DataView(buffer as ArrayBuffer);
  const channel = view.getUint8(0);
  if (channel !== CHANNEL_CONTROL) return null;

  const msgType = view.getUint8(1);
  if (msgType !== 0x00) return null; // DEVICE_MSG_TYPE_CLIPBOARD

  const length = view.getUint32(2, false);
  if (length > 256 * 1024 || buffer.byteLength < 6 + length) return null;

  const textBytes = new Uint8Array(buffer as ArrayBuffer, 6, length);
  const text = new TextDecoder('utf-8').decode(textBytes);
  return { text };
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
  if (!buffer || buffer.byteLength < 9) return null;

  const view = new DataView(buffer as ArrayBuffer);
  const channel = view.getUint8(0);
  if (channel !== CHANNEL_PING) return null;

  const timestampUs = view.getBigUint64(1, false);
  return {
    timestampMs: Number(timestampUs) / 1000,
  };
}
