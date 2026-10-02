import { describe, expect, it } from 'vitest';
import { concatBuffers, extractCodecProfile, findNalUnits, hasSps } from './h264';

describe('h264 Annex B parser', () => {
  it('identifies SPS, PPS, and IDR NAL units in Annex B bitstream', () => {
    // 00 00 00 01 [67 42 e0 1f ...] (SPS: type 7)
    // 00 00 00 01 [68 ce 3c 80]     (PPS: type 8)
    // 00 00 00 01 [65 88 84 ...]    (IDR: type 5)
    const annexB = new Uint8Array([
      0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f, 0x12, 0x34,
      0, 0, 0, 1, 0x68, 0xce, 0x3c, 0x80,
      0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00,
    ]);

    const nals = findNalUnits(annexB);
    expect(nals.length).toBe(3);
    expect(nals[0].type).toBe(7); // SPS
    expect(nals[1].type).toBe(8); // PPS
    expect(nals[2].type).toBe(5); // IDR

    expect(hasSps(annexB)).toBe(true);
  });

  it('extracts correct avc1 codec string from SPS payload', () => {
    const sps = new Uint8Array([0x67, 0x42, 0xe0, 0x1f, 0xab, 0xcd]);
    const codec = extractCodecProfile(sps);
    expect(codec).toBe('avc1.42e01f');

    const highProfileSps = new Uint8Array([0x67, 0x64, 0x00, 0x28]);
    expect(extractCodecProfile(highProfileSps)).toBe('avc1.640028');
  });

  it('correctly detects absence of SPS in pure delta or IDR payload', () => {
    const idrOnly = new Uint8Array([0, 0, 0, 1, 0x65, 0x01, 0x02]);
    expect(hasSps(idrOnly)).toBe(false);

    const deltaOnly = new Uint8Array([0, 0, 0, 1, 0x41, 0x05, 0x06]);
    expect(hasSps(deltaOnly)).toBe(false);
  });

  it('concatenates two buffers correctly', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const combined = concatBuffers(a, b);
    expect(combined).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('extracts SPS profile when preceded by AUD or SEI NAL units', () => {
    // AUD: 00 00 00 01 09 f0
    // SPS: 00 00 00 01 67 4d 40 28 ...
    const stream = new Uint8Array([
      0, 0, 0, 1, 0x09, 0xf0,
      0, 0, 0, 1, 0x67, 0x4d, 0x40, 0x28, 0xaa, 0xbb,
    ]);
    expect(extractCodecProfile(stream)).toBe('avc1.4d4028');
  });

  it('returns default fallback on empty or truncated SPS buffers without crashing', () => {
    expect(extractCodecProfile(new Uint8Array([]))).toBe('avc1.42e01f');
    expect(extractCodecProfile(new Uint8Array([0, 0, 0, 1]))).toBe('avc1.42e01f');
    expect(extractCodecProfile(new Uint8Array([0, 0, 0, 1, 0x67, 0x42]))).toBe('avc1.42e01f');
  });
});
