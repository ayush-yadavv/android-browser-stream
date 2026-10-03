import React, { useCallback, useEffect, useRef } from 'react';
import { CodecFactory } from '../lib/codec/registry';
import { CodecHandler } from '../lib/codec/types';
import { findSupportedDecoderConfig, getCachedDecoderConfig } from '../lib/codec/support';

interface DecoderOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onFirstFrame?: () => void;
  onFrameRendered?: () => void;
  onError?: (err: DOMException | Error) => void;
}

export function useVideoDecoder({
  canvasRef,
  onFirstFrame,
  onFrameRendered,
  onError,
}: DecoderOptions) {
  const decoderRef = useRef<VideoDecoder | null>(null);
  const pendingFrame = useRef<VideoFrame | null>(null);
  const rafId = useRef<number>(0);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const configuredRef = useRef(false);
  const isConfiguringRef = useRef(false);
  const pendingPacketRef = useRef<{ nalData: Uint8Array; ptsUs: number; isKey: boolean } | null>(null);
  const codecHandlerRef = useRef<CodecHandler>(CodecFactory.getByWireId(0x01)); // Default H.264
  const currentCodecRef = useRef<string>(codecHandlerRef.current.defaultCodecString);
  const cachedConfigRef = useRef<Uint8Array | null>(null);
  const waitingForKey = useRef(true);
  const firstFrameReported = useRef(false);
  const recoveryAttemptsRef = useRef(0);
  const lastRecoveryTimeRef = useRef(0);

  const onFirstFrameRef = useRef(onFirstFrame);
  const onFrameRenderedRef = useRef(onFrameRendered);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
    onFrameRenderedRef.current = onFrameRendered;
    onErrorRef.current = onError;
  });

  const render = useCallback(() => {
    rafId.current = 0;
    const canvas = canvasRef.current;
    if (pendingFrame.current && canvas) {
      const frame = pendingFrame.current;

      if (!ctxRef.current) {
        ctxRef.current = canvas.getContext('2d', {
          alpha: false,
          desynchronized: true,
        });
      }

      if (ctxRef.current) {
        // Dynamically adapt canvas buffer dimensions if resolution changes
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
        }

        ctxRef.current.drawImage(frame, 0, 0, canvas.width, canvas.height);
      }

      onFrameRenderedRef.current?.();

      if (!firstFrameReported.current) {
        firstFrameReported.current = true;
        onFirstFrameRef.current?.();
      }

      // Reset recovery attempts on successful frame render
      if (recoveryAttemptsRef.current > 0) {
        recoveryAttemptsRef.current = 0;
      }

      // Mandatory: release GPU hardware surface immediately
      frame.close();
      pendingFrame.current = null;
    }
  }, [canvasRef]);

  /**
   * Fast synchronous configuration path when configuration was previously verified and cached.
   */
  const tryConfigureCached = useCallback((codec: string): boolean => {
    if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') return false;
    const cached = getCachedDecoderConfig(codec);
    if (!cached) return false;

    try {
      decoderRef.current.configure(cached);
      currentCodecRef.current = cached.codec;
      configuredRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Asynchronous, verified configuration path.
   * Resolves supported configuration via VideoDecoder.isConfigSupported() before calling configure().
   * Handles multi-tier hardware acceleration, profile fallbacks, and pending packet flushing.
   */
  const configureDecoder = useCallback(async (codec: string): Promise<boolean> => {
    if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') return false;

    isConfiguringRef.current = true;
    try {
      // 1. Resolve supported configuration validated via VideoDecoder.isConfigSupported()
      const validConfig = await findSupportedDecoderConfig(codec);
      if (!validConfig) {
        console.error(`No supported VideoDecoder configuration found for codec: ${codec}`);
        return false;
      }

      // Check if decoder was closed while awaiting support check
      if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') {
        return false;
      }

      // 2. Configure decoder with validated configuration
      try {
        decoderRef.current.configure(validConfig);
        currentCodecRef.current = validConfig.codec;
        configuredRef.current = true;
      } catch (confErr: any) {
        console.warn(
          `VideoDecoder.configure() threw despite isConfigSupported() passing for ${validConfig.codec}. Falling back to software AVC:`,
          confErr
        );
        // Resilient software fallback
        try {
          const swConfig: VideoDecoderConfig = {
            codec: 'avc1.42001e',
            optimizeForLatency: true,
            hardwareAcceleration: 'prefer-software',
          };
          decoderRef.current.configure(swConfig);
          currentCodecRef.current = swConfig.codec;
          configuredRef.current = true;
        } catch (fatalErr: any) {
          console.error('Fatal unrecoverable VideoDecoder configure error:', fatalErr);
          configuredRef.current = false;
          onErrorRef.current?.(fatalErr);
          return false;
        }
      }

      // 3. Process any keyframe that arrived while configuration was in-flight
      if (pendingPacketRef.current && configuredRef.current && decoderRef.current?.state === 'configured') {
        const { nalData, ptsUs, isKey } = pendingPacketRef.current;
        pendingPacketRef.current = null;
        try {
          const handler = codecHandlerRef.current;
          const payload = isKey ? handler.prepareKeyframe(cachedConfigRef.current, nalData) : nalData;
          decoderRef.current.decode(
            new EncodedVideoChunk({
              type: isKey ? 'key' : 'delta',
              timestamp: ptsUs,
              data: payload,
            })
          );
          if (isKey) {
            waitingForKey.current = false;
          }
        } catch (decodeErr: any) {
          console.warn('Failed to decode queued frame after configure:', decodeErr);
        }
      }

      return true;
    } finally {
      isConfiguringRef.current = false;
    }
  }, []);

  const init = useCallback(() => {
    if (typeof VideoDecoder === 'undefined') {
      const err = new Error('WebCodecs VideoDecoder API not supported in this browser.');
      onErrorRef.current?.(err);
      return;
    }

    try {
      decoderRef.current = new VideoDecoder({
        output: (frame) => {
          if (pendingFrame.current) {
            pendingFrame.current.close();
          }
          pendingFrame.current = frame;

          if (!rafId.current) {
            rafId.current = requestAnimationFrame(render);
          }
        },
        error: (e) => {
          console.warn('WebCodecs VideoDecoder hardware error encountered. Initiating auto-recovery...', e);
          configuredRef.current = false;
          waitingForKey.current = true;

          const now = performance.now();
          if (now - lastRecoveryTimeRef.current > 10000) {
            recoveryAttemptsRef.current = 0;
          }
          lastRecoveryTimeRef.current = now;
          recoveryAttemptsRef.current += 1;

          if (recoveryAttemptsRef.current <= 3) {
            console.log(`Auto-recovery attempt ${recoveryAttemptsRef.current}/3: Re-initializing VideoDecoder...`);
            try {
              if (decoderRef.current && (decoderRef.current.state as string) !== 'closed') {
                try {
                  decoderRef.current.close();
                } catch (_) {}
              }
              init();
              return;
            } catch (reinitErr) {
              console.error('Failed to re-initialize VideoDecoder during auto-recovery:', reinitErr);
            }
          }

          console.error('WebCodecs VideoDecoder fatal unrecoverable error:', e);
          onErrorRef.current?.(e);
        },
      });

      // Synchronous configuration if cached, or asynchronous configure pre-flight check
      if (!tryConfigureCached(currentCodecRef.current)) {
        configureDecoder(currentCodecRef.current);
      }
      waitingForKey.current = true;
      firstFrameReported.current = false;
    } catch (err: any) {
      console.error('Failed to initialize WebCodecs VideoDecoder:', err);
      onErrorRef.current?.(err);
    }
  }, [render, configureDecoder, tryConfigureCached]);

  const setCodec = useCallback(
    (wireId: number) => {
      const handler = CodecFactory.getByWireId(wireId);
      codecHandlerRef.current = handler;
      currentCodecRef.current = handler.defaultCodecString;
      cachedConfigRef.current = null;
      waitingForKey.current = true;
      if (!tryConfigureCached(handler.defaultCodecString)) {
        configureDecoder(handler.defaultCodecString);
      }
    },
    [configureDecoder, tryConfigureCached]
  );

  const feedPacket = useCallback(
    (nalData: Uint8Array, ptsUs: number, isKey: boolean, isConfig?: boolean) => {
      const handler = codecHandlerRef.current;

      // 1. Handle parameter set / configuration packets
      if (isConfig) {
        cachedConfigRef.current = nalData;
        const detectedCodec = handler.extractCodecString(nalData);
        if (detectedCodec !== currentCodecRef.current) {
          console.log(`Configuring decoder for ${handler.label}: ${detectedCodec}`);
          if (!tryConfigureCached(detectedCodec)) {
            configureDecoder(detectedCodec);
          }
        }
        return; // Config packets are parameter sets; do not decode directly
      }

      // Auto-recover decoder synchronously if in closed state or uninitialized
      if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') {
        init();
      }

      // If configuration is in-flight, buffer the keyframe so it can be decoded once configured
      if (isConfiguringRef.current) {
        if (isKey) {
          pendingPacketRef.current = { nalData, ptsUs, isKey };
        }
        return;
      }

      if (!configuredRef.current || decoderRef.current?.state !== 'configured') return;

      // 2. Prepare keyframe using active CodecHandler
      let payload = nalData;
      if (isKey) {
        waitingForKey.current = false;
        payload = handler.prepareKeyframe(cachedConfigRef.current, nalData);
      } else if (waitingForKey.current) {
        // Drop delta frames until a valid keyframe arrives
        return;
      }

      // 3. Backpressure management: drop delta frames if queue exceeds pipeline threshold
      const decoder = decoderRef.current;
      if (decoder.decodeQueueSize > 5) {
        console.warn(`Decoder queue saturated (${decoder.decodeQueueSize}), dropping until next keyframe.`);
        waitingForKey.current = true;
        return;
      }

      try {
        decoder.decode(
          new EncodedVideoChunk({
            type: isKey ? 'key' : 'delta',
            timestamp: ptsUs,
            data: payload,
          })
        );
      } catch (err: any) {
        console.warn('Decode frame error:', err);
      }
    },
    [init, configureDecoder, tryConfigureCached]
  );

  const destroy = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
    if (pendingFrame.current) {
      pendingFrame.current.close();
      pendingFrame.current = null;
    }
    pendingPacketRef.current = null;
    if (decoderRef.current) {
      if ((decoderRef.current.state as string) !== 'closed') {
        try {
          decoderRef.current.close();
        } catch (_) {}
      }
      decoderRef.current = null;
    }
    configuredRef.current = false;
    isConfiguringRef.current = false;
    ctxRef.current = null;
  }, []);

  // Internal lifecycle cleanup on unmount
  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    init,
    feedPacket,
    setCodec,
    destroy,
  };
}
