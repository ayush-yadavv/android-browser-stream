import { describe, it, expect } from 'vitest';
import { CodecFactory } from './registry';

describe('CodecFactory', () => {
  it('returns H264Handler for wireId 0x01', () => {
    const handler = CodecFactory.getByWireId(0x01);
    expect(handler.id).toBe('h264');
    expect(handler.label).toBe('H.264 (AVC)');
  });

  it('returns H265Handler for wireId 0x02', () => {
    const handler = CodecFactory.getByWireId(0x02);
    expect(handler.id).toBe('h265');
    expect(handler.label).toBe('H.265 (HEVC)');
  });

  it('returns AV1Handler for wireId 0x03', () => {
    const handler = CodecFactory.getByWireId(0x03);
    expect(handler.id).toBe('av1');
    expect(handler.label).toBe('AV1');
  });

  it('defaults to H264 for unknown wireId or unknown id string', () => {
    expect(CodecFactory.getByWireId(99).id).toBe('h264');
    expect(CodecFactory.getById('unknown').id).toBe('h264');
  });

  it('probeSupported always contains h264 as universal floor', async () => {
    const supported = await CodecFactory.probeSupported();
    expect(supported).toContain('h264');
  });
});
