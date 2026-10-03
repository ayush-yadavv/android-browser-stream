import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findSupportedDecoderConfig,
  isCodecSupported,
  getCachedDecoderConfig,
  clearConfigCache,
  testConfigSupport,
} from './support';

describe('WebCodecs Decoder Configuration & Support Probing', () => {
  const originalVideoDecoder = globalThis.VideoDecoder;

  beforeEach(() => {
    clearConfigCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.VideoDecoder = originalVideoDecoder;
  });

  it('testConfigSupport returns original config if VideoDecoder is undefined', async () => {
    // @ts-ignore
    delete globalThis.VideoDecoder;
    const config: VideoDecoderConfig = { codec: 'avc1.42e01f', optimizeForLatency: true };
    const res = await testConfigSupport(config);
    expect(res).toEqual(config);
  });

  it('findSupportedDecoderConfig returns prefer-hardware when supported', async () => {
    const isConfigSupportedMock = vi.fn().mockImplementation(async (cfg: VideoDecoderConfig) => {
      if (cfg.hardwareAcceleration === 'prefer-hardware') {
        return { supported: true, config: cfg };
      }
      return { supported: false };
    });

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    const res = await findSupportedDecoderConfig('avc1.42e01f');
    expect(res).not.toBeNull();
    expect(res?.codec).toBe('avc1.42e01f');
    expect(res?.hardwareAcceleration).toBe('prefer-hardware');
  });

  it('cascades to no-preference when prefer-hardware is rejected', async () => {
    const isConfigSupportedMock = vi.fn().mockImplementation(async (cfg: VideoDecoderConfig) => {
      if (cfg.hardwareAcceleration === 'prefer-hardware') {
        return { supported: false };
      }
      if (cfg.hardwareAcceleration === 'no-preference') {
        return { supported: true, config: cfg };
      }
      return { supported: false };
    });

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    const res = await findSupportedDecoderConfig('avc1.42e01f');
    expect(res).not.toBeNull();
    expect(res?.hardwareAcceleration).toBe('no-preference');
    expect(getCachedDecoderConfig('avc1.42e01f')?.hardwareAcceleration).toBe('no-preference');
  });

  it('cascades to prefer-software when hardware decoding is unavailable (Linux VM/Docker)', async () => {
    const isConfigSupportedMock = vi.fn().mockImplementation(async (cfg: VideoDecoderConfig) => {
      if (cfg.hardwareAcceleration === 'prefer-software') {
        return { supported: true, config: cfg };
      }
      return { supported: false };
    });

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    const res = await findSupportedDecoderConfig('avc1.42e01f');
    expect(res).not.toBeNull();
    expect(res?.hardwareAcceleration).toBe('prefer-software');
  });

  it('falls back to baseline AVC profile when requested profile is unsupported', async () => {
    const isConfigSupportedMock = vi.fn().mockImplementation(async (cfg: VideoDecoderConfig) => {
      // Rejects exotic profile 'avc1.640028', supports baseline 'avc1.42e01f'
      if (cfg.codec === 'avc1.42e01f') {
        return { supported: true, config: cfg };
      }
      return { supported: false };
    });

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    const res = await findSupportedDecoderConfig('avc1.640028');
    expect(res).not.toBeNull();
    expect(res?.codec).toBe('avc1.42e01f');
  });

  it('falls back to universal H.264 when requested HEVC is unsupported by browser', async () => {
    const isConfigSupportedMock = vi.fn().mockImplementation(async (cfg: VideoDecoderConfig) => {
      // Chrome on Linux: HEVC is rejected, baseline H.264 supported
      if (cfg.codec.startsWith('hev1')) {
        return { supported: false };
      }
      if (cfg.codec === 'avc1.42e01f') {
        return { supported: true, config: cfg };
      }
      return { supported: false };
    });

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    const res = await findSupportedDecoderConfig('hev1.1.6.L93.B0');
    expect(res).not.toBeNull();
    expect(res?.codec).toBe('avc1.42e01f');
  });

  it('isCodecSupported returns true when supported and false when unsupported', async () => {
    const isConfigSupportedMock = vi.fn().mockImplementation(async (cfg: VideoDecoderConfig) => {
      return { supported: cfg.codec === 'avc1.42e01f' };
    });

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    expect(await isCodecSupported('avc1.42e01f')).toBe(true);
    expect(await isCodecSupported('hev1.1.6.L93.B0')).toBe(false);
  });

  it('handles exceptions thrown by isConfigSupported gracefully', async () => {
    const isConfigSupportedMock = vi.fn().mockRejectedValue(new Error('SyntaxError'));

    // @ts-ignore
    globalThis.VideoDecoder = class MockVideoDecoder {
      static isConfigSupported = isConfigSupportedMock;
    };

    const res = await findSupportedDecoderConfig('invalid-codec-string');
    expect(res).toBeNull();
  });
});
