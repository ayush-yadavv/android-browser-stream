/**
 * WebCodecs Decoder Configuration & Support Probing
 *
 * Implements W3C WebCodecs compliant configuration resolution with graceful fallback.
 * Checks VideoDecoder.isConfigSupported() before any call to VideoDecoder.configure()
 * to prevent: "TypeError: Unsupported configuration. Check isConfigSupported() prior to calling configure()."
 */

// In-memory cache of validated, working configurations to avoid redundant async probing
const verifiedConfigCache = new Map<string, VideoDecoderConfig>();

// Fallback cascade for AVC (H.264) codec profiles
const AVC_FALLBACK_PROFILES = [
  'avc1.42e01f', // Constrained Baseline Profile, Level 3.1
  'avc1.42001e', // Baseline Profile, Level 3.0
  'avc1.42001f', // Baseline Profile, Level 3.1
  'avc1.4d001f', // Main Profile, Level 3.1
  'avc1.64001f', // High Profile, Level 3.1
  'avc1.640028', // High Profile, Level 4.0
];

const ACCELERATION_PREFERENCES: (HardwareAcceleration | undefined)[] = [
  'prefer-hardware',
  'no-preference',
  'prefer-software',
  undefined,
];

/**
 * Checks whether a specific VideoDecoderConfig is supported by the browser runtime.
 */
export async function testConfigSupport(config: VideoDecoderConfig): Promise<VideoDecoderConfig | null> {
  if (typeof VideoDecoder === 'undefined' || typeof VideoDecoder.isConfigSupported !== 'function') {
    return config;
  }

  try {
    const res = await VideoDecoder.isConfigSupported(config);
    if (res && res.supported) {
      return res.config || config;
    }
  } catch {
    // Some browser versions throw if the codec string syntax is unknown
  }
  return null;
}

/**
 * Resolves a supported VideoDecoderConfig for the given codec string,
 * trying prefer-hardware, no-preference, prefer-software, and profile fallbacks.
 */
export async function findSupportedDecoderConfig(requestedCodec: string): Promise<VideoDecoderConfig | null> {
  const normalizedCodec = requestedCodec.trim().toLowerCase();

  // 1. Fast path: check in-memory cache
  if (verifiedConfigCache.has(normalizedCodec)) {
    return verifiedConfigCache.get(normalizedCodec)!;
  }

  // 2. Probe requested codec across hardware acceleration tiers
  for (const hw of ACCELERATION_PREFERENCES) {
    const candidate: VideoDecoderConfig = {
      codec: normalizedCodec,
      optimizeForLatency: true,
      ...(hw ? { hardwareAcceleration: hw } : {}),
    };
    const supported = await testConfigSupport(candidate);
    if (supported) {
      verifiedConfigCache.set(normalizedCodec, supported);
      return supported;
    }
  }

  // 3. Fallback cascade if requested codec is an AVC variant
  if (normalizedCodec.startsWith('avc1.')) {
    for (const fallbackProfile of AVC_FALLBACK_PROFILES) {
      if (fallbackProfile === normalizedCodec) continue;
      for (const hw of ACCELERATION_PREFERENCES) {
        const candidate: VideoDecoderConfig = {
          codec: fallbackProfile,
          optimizeForLatency: true,
          ...(hw ? { hardwareAcceleration: hw } : {}),
        };
        const supported = await testConfigSupport(candidate);
        if (supported) {
          console.warn(`Requested AVC codec ${requestedCodec} unsupported; falling back to verified ${fallbackProfile}`);
          verifiedConfigCache.set(normalizedCodec, supported);
          return supported;
        }
      }
    }
  }

  // 4. Universal floor fallback: if requested codec is completely unsupported (e.g. HEVC on non-supporting browser),
  // fall back to baseline H.264
  for (const fallbackProfile of AVC_FALLBACK_PROFILES) {
    for (const hw of ACCELERATION_PREFERENCES) {
      const candidate: VideoDecoderConfig = {
        codec: fallbackProfile,
        optimizeForLatency: true,
        ...(hw ? { hardwareAcceleration: hw } : {}),
      };
      const supported = await testConfigSupport(candidate);
      if (supported) {
        console.warn(`Codec ${requestedCodec} completely unsupported; falling back to universal H.264 ${fallbackProfile}`);
        verifiedConfigCache.set(normalizedCodec, supported);
        return supported;
      }
    }
  }

  // 5. If VideoDecoder is not defined (tests/headless), return safe candidate
  if (typeof VideoDecoder === 'undefined' || typeof VideoDecoder.isConfigSupported !== 'function') {
    const fallback: VideoDecoderConfig = { codec: normalizedCodec, optimizeForLatency: true };
    verifiedConfigCache.set(normalizedCodec, fallback);
    return fallback;
  }

  return null;
}

/**
 * Synchronous cache lookup for immediate configuration if already probed.
 */
export function getCachedDecoderConfig(codec: string): VideoDecoderConfig | null {
  return verifiedConfigCache.get(codec.trim().toLowerCase()) || null;
}

/**
 * Checks if a specific codec is supported in any configuration mode.
 */
export async function isCodecSupported(codec: string): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined' || typeof VideoDecoder.isConfigSupported !== 'function') {
    return false;
  }

  for (const hw of ACCELERATION_PREFERENCES) {
    const candidate: VideoDecoderConfig = {
      codec,
      optimizeForLatency: true,
      ...(hw ? { hardwareAcceleration: hw } : {}),
    };
    const supported = await testConfigSupport(candidate);
    if (supported) {
      verifiedConfigCache.set(codec.trim().toLowerCase(), supported);
      return true;
    }
  }
  return false;
}

/**
 * Clears cache (primarily for unit testing different environment permutations).
 */
export function clearConfigCache(): void {
  verifiedConfigCache.clear();
}

// Pre-warm baseline H.264 support check asynchronously
if (typeof VideoDecoder !== 'undefined' && typeof VideoDecoder.isConfigSupported === 'function') {
  findSupportedDecoderConfig('avc1.42e01f').catch(() => {});
}
