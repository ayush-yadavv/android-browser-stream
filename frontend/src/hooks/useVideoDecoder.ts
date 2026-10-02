import React, { useCallback, useRef } from 'react';
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
  const reconfiguringRef = useRef<Promise<void> | null>(null);
  const waitingForKey = useRef(true);
  const firstFrameReported = useRef(false);

  const render = useCallback(() => {
    rafId.current = 0;
    const canvas = canvasRef.current;
    if (pendingFrame.current && ctxRef.current && canvas) {
      const frame = pendingFrame.current;

      // Dynamically adapt canvas buffer dimensions if resolution changes
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
      }

      ctxRef.current.drawImage(frame, 0, 0, canvas.width, canvas.height);

      onFrameRendered?.();

      if (!firstFrameReported.current) {
        firstFrameReported.current = true;
        onFirstFrame?.();
      }

      // Mandatory: release GPU hardware surface immediately
      frame.close();
      pendingFrame.current = null;
    }
  }, [canvasRef, onFirstFrame, onFrameRendered]);

  const configureDecoder = useCallback(async (codec: string) => {
    if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') return;

    try {
      const config: VideoDecoderConfig = {
        codec,
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-hardware',
      };

      const support = await VideoDecoder.isConfigSupported(config);
      if (decoderRef.current && (decoderRef.current.state as string) !== 'closed') {
        if (support.supported && support.config) {
          decoderRef.current.configure(support.config);
        } else {
          decoderRef.current.configure({
            ...config,
            hardwareAcceleration: 'no-preference',
          });
        }
        currentCodecRef.current = codec;
        configuredRef.current = true;
      }
    } catch (err: any) {
      console.warn(`Failed to configure decoder with codec ${codec}:`, err);
    }
  }, []);

  const init = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Desynchronized 2D canvas context bypasses OS compositor queue (~16ms latency reduction)
    ctxRef.current = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

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
          onError?.(e);
        },
      });

      await configureDecoder(currentCodecRef.current);
      waitingForKey.current = true;
      firstFrameReported.current = false;
    } catch (err: any) {
      console.error('Failed to initialize WebCodecs VideoDecoder:', err);
      onError?.(err);
    }
  }, [canvasRef, render, configureDecoder, onError]);

  const feedPacket = useCallback(
    async (nalData: Uint8Array, ptsUs: number, isKey: boolean, isConfig?: boolean) => {
      // 1. Handle SPS/PPS parameter set packets
      if (isConfig) {
        cachedConfigRef.current = nalData;
        if (hasSps(nalData)) {
          const detectedCodec = extractCodecProfile(nalData);
          if (detectedCodec !== currentCodecRef.current) {
            console.log(`Detected stream codec profile: ${detectedCodec}, reconfiguring decoder.`);
            reconfiguringRef.current = configureDecoder(detectedCodec).then(() => {
              reconfiguringRef.current = null;
            });
          }
        }
        return; // Config packets are parameter sets; do not decode directly
      }

      // If reconfiguring is in progress, await resolution so keyframe is decoded under the target codec
      if (reconfiguringRef.current) {
        await reconfiguringRef.current;
      }

      // Auto-recover decoder if in closed state
      if (!decoderRef.current || (decoderRef.current.state as string) === 'closed') {
        init();
        return;
      }

      if (!configuredRef.current || decoderRef.current.state !== 'configured') return;

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
    [configureDecoder, init],
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
