export interface NalUnit {
  offset: number; // Offset of NAL header byte in buffer
  length: number; // Length of NAL payload (including header byte, excluding start code)
  type: number;   // NAL unit type (lower 5 bits of header byte)
}

/**
 * Scans an Annex B bytestream for 3-byte (00 00 01) or 4-byte (00 00 00 01) start codes
 * and returns the location and type of each NAL unit.
 */
export function findNalUnits(buffer: Uint8Array): NalUnit[] {
  const units: NalUnit[] = [];
  const len = buffer.length;
  let i = 0;

  let currentStart = -1;

  while (i < len - 2) {
    let startCodeLen = 0;
    if (buffer[i] === 0 && buffer[i + 1] === 0) {
      if (buffer[i + 2] === 1) {
        startCodeLen = 3;
      } else if (i < len - 3 && buffer[i + 2] === 0 && buffer[i + 3] === 1) {
        startCodeLen = 4;
      }
    }

    if (startCodeLen > 0) {
      if (currentStart !== -1) {
        units.push({
          offset: currentStart,
          length: i - currentStart,
          type: buffer[currentStart] & 0x1f,
        });
      }
      currentStart = i + startCodeLen;
      i += startCodeLen;
    } else {
      i++;
    }
  }

  if (currentStart !== -1 && currentStart < len) {
    units.push({
      offset: currentStart,
      length: len - currentStart,
      type: buffer[currentStart] & 0x1f,
    });
  }

  return units;
}

/**
 * Returns true if the buffer contains an H.264 Sequence Parameter Set (NAL type 7).
 */
export function hasSps(buffer: Uint8Array): boolean {
  const units = findNalUnits(buffer);
  return units.some((u) => u.type === 7);
}

/**
 * Extracts the avc1 codec string (e.g. 'avc1.42e01f') from an SPS NAL payload.
 * Byte 0 is NAL unit header (0x67).
 * Byte 1 is profile_idc.
 * Byte 2 is constraint_set_flags.
 * Byte 3 is level_idc.
 */
export function extractCodecProfile(buffer: Uint8Array): string {
  const units = findNalUnits(buffer);
  const sps = units.find((u) => u.type === 7);
  if (sps && sps.length >= 4 && sps.offset + 3 < buffer.length) {
    const p1 = buffer[sps.offset + 1].toString(16).padStart(2, '0');
    const p2 = buffer[sps.offset + 2].toString(16).padStart(2, '0');
    const p3 = buffer[sps.offset + 3].toString(16).padStart(2, '0');
    return `avc1.${p1}${p2}${p3}`.toLowerCase();
  }

  // Fallback: check if raw NAL without start code was provided
  if (buffer.length >= 4 && (buffer[0] & 0x1f) === 7) {
    const p1 = buffer[1].toString(16).padStart(2, '0');
    const p2 = buffer[2].toString(16).padStart(2, '0');
    const p3 = buffer[3].toString(16).padStart(2, '0');
    return `avc1.${p1}${p2}${p3}`.toLowerCase();
  }

  return 'avc1.42e01f'; // Fallback to Constrained Baseline Level 3.1
}

/**
 * Concatenates two Uint8Array buffers.
 */
export function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}
