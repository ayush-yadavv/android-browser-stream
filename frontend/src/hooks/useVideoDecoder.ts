import React, { useCallback, useEffect, useRef } from 'react';
import { concatBuffers, extractCodecProfile, hasSps } from '../lib/h264';

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
  const currentCodecRef = useRef<string>('avc1.42e01f');
  const cachedConfigRef = useRef<Uint8Array | null>(null);
  const waitingForKey = useRef(true);
  const firstFrameReported = useRef(false);

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

      // Mandatory: release GPU hardware surface immediately
      frame.close();
      pendingFrame.current = null;
    }
  }, [canvasRef]);

  const configureDecoderSync = useCallback((codec: string) => {
    if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') return false;

    try {
      decoderRef.current.configure({
        codec,
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-hardware',
      });
      currentCodecRef.current = codec;
      configuredRef.current = true;
      return true;
    } catch (_) {
      try {
        decoderRef.current.configure({
          codec,
          optimizeForLatency: true,
        });
        currentCodecRef.current = codec;
        configuredRef.current = true;
        return true;
      } catch (err: any) {
        console.warn(`Failed to configure decoder with codec ${codec}:`, err);
        configuredRef.current = false;
        return false;
      }
    }
  }, []);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && !ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
    }

    try {
      if (decoderRef.current && (decoderRef.current.state as string) !== 'closed') {
        try {
          decoderRef.current.close();
        } catch (_) {}
      }

      decoderRef.current = new VideoDecoder({
        output: (frame) => {
          // Latest-frame-wins: discard unrendered frame if a newer frame arrived
          if (pendingFrame.current) {
            pendingFrame.current.close();
          }
          pendingFrame.current = frame;

          if (!rafId.current) {
            rafId.current = requestAnimationFrame(render);
          }
        },
        error: (e) => {
          console.error('WebCodecs VideoDecoder fatal error:', e);
          configuredRef.current = false;
          waitingForKey.current = true;
          onErrorRef.current?.(e);
        },
      });

      configureDecoderSync(currentCodecRef.current);
      waitingForKey.current = true;
      firstFrameReported.current = false;
    } catch (err: any) {
      console.error('Failed to initialize WebCodecs VideoDecoder:', err);
      onErrorRef.current?.(err);
    }
  }, [canvasRef, render, configureDecoderSync]);

  const feedPacket = useCallback(
    (nalData: Uint8Array, ptsUs: number, isKey: boolean, isConfig?: boolean) => {
      // 1. Handle SPS/PPS parameter set packets
      if (isConfig) {
        cachedConfigRef.current = nalData;
        if (hasSps(nalData)) {
          const detectedCodec = extractCodecProfile(nalData);
          if (detectedCodec !== currentCodecRef.current) {
            console.log(`Detected stream codec profile: ${detectedCodec}, reconfiguring decoder.`);
            configureDecoderSync(detectedCodec);
          }
        }
        return; // Config packets are parameter sets; do not decode directly
      }

      // Auto-recover decoder synchronously if in closed state or uninitialized
      if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') {
        init();
      }

      if (!configuredRef.current || decoderRef.current?.state !== 'configured') return;

      // 2. Prepend cached SPS/PPS to keyframe if missing parameter sets
      let payload = nalData;
      if (isKey) {
        waitingForKey.current = false;
        if (cachedConfigRef.current && !hasSps(nalData)) {
          payload = concatBuffers(cachedConfigRef.current, nalData);
        }
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
          }),
        );
      } catch (err: any) {
        console.error('Error decoding video chunk:', err);
        waitingForKey.current = true;
      }
    },
    [configureDecoderSync, init],
  );

  const destroy = useCallback(() => {
    if (pendingFrame.current) {
      pendingFrame.current.close();
      pendingFrame.current = null;
    }
    if (decoderRef.current && decoderRef.current.state !== 'closed') {
      try {
        decoderRef.current.close();
      } catch (_) {}
      decoderRef.current = null;
    }
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
    configuredRef.current = false;
    cachedConfigRef.current = null;
  }, []);

  return { init, feedPacket, destroy };
}
