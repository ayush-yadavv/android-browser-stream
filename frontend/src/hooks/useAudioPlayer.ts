import { useCallback, useEffect, useRef, useState } from 'react';

export const STORAGE_MUTED_KEY = 'android_stream_muted';
export const STORAGE_VOLUME_KEY = 'android_stream_volume';

export function clampVolume(val: number): number {
  if (isNaN(val)) return 1.0;
  return Math.max(0, Math.min(1, val));
}

export function calculateTargetGain(isMuted: boolean, volume: number): number {
  return isMuted ? 0.0 : clampVolume(volume);
}

export function loadSavedMuted(storage?: Storage): boolean {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return true;
    const saved = s.getItem(STORAGE_MUTED_KEY);
    return saved !== null ? saved === 'true' : true;
  } catch {
    return true;
  }
}

export function loadSavedVolume(storage?: Storage): number {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return 1.0;
    const saved = s.getItem(STORAGE_VOLUME_KEY);
    if (saved !== null) {
      const val = parseFloat(saved);
      if (!isNaN(val)) return clampVolume(val);
    }
    return 1.0;
  } catch {
    return 1.0;
  }
}

export function calculateNextAudioPlayTime(
  currentTime: number,
  currentNextTime: number,
  minLeadSec = 0.03,
  maxLagSec = 0.25
): number {
  if (currentNextTime < currentTime || currentNextTime > currentTime + maxLagSec) {
    return currentTime + minLeadSec;
  }
  return currentNextTime;
}

export interface UseAudioPlayerReturn {
  isMuted: boolean;
  volume: number; // 0.0 to 1.0
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  playChunk: (data: Uint8Array, ptsUs: number, isConfig: boolean) => void;
  unlockAudio: () => Promise<void>;
  isAudioAvailable: boolean;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  // Load saved preferences from localStorage, defaulting to muted = true (Autoplay policy friendly)
  const [isMuted, setIsMutedState] = useState<boolean>(() => loadSavedMuted());
  const [volume, setVolumeState] = useState<number>(() => loadSavedVolume());

  const [isAudioAvailable, setIsAudioAvailable] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const decoderRef = useRef<AudioDecoder | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isMutedRef = useRef(isMuted);
  const volumeRef = useRef(volume);

  isMutedRef.current = isMuted;
  volumeRef.current = volume;

  // Initialize Web Audio Context and GainNode
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    if (typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    try {
      const ctx = new AudioContextClass({ latencyHint: 'interactive' });
      const gainNode = ctx.createGain();

      // Configure initial gain
      const initialGain = isMutedRef.current ? 0.0 : volumeRef.current;
      gainNode.gain.setValueAtTime(initialGain, ctx.currentTime);
      gainNode.connect(ctx.destination);

      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;
      setIsAudioAvailable(true);
    } catch (e) {
      console.warn('Failed to initialize Web Audio AudioContext:', e);
    }
  }, []);

  // Initialize WebCodecs AudioDecoder for AAC-LC
  const initDecoder = useCallback(() => {
    if (decoderRef.current) return;
    if (typeof window === 'undefined' || !('AudioDecoder' in window)) return;

    try {
      const decoder = new AudioDecoder({
        output: (audioData: AudioData) => {
          const ctx = audioCtxRef.current;
          const gainNode = gainNodeRef.current;
          if (!ctx || !gainNode) {
            audioData.close();
            return;
          }

          try {
            const numberOfChannels = audioData.numberOfChannels;
            const numberOfFrames = audioData.numberOfFrames;
            const sampleRate = audioData.sampleRate;

            const audioBuffer = ctx.createBuffer(numberOfChannels, numberOfFrames, sampleRate);
            for (let ch = 0; ch < numberOfChannels; ch++) {
              const channelData = audioBuffer.getChannelData(ch);
              audioData.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });
            }

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(gainNode);

            const currentTime = ctx.currentTime;
            nextPlayTimeRef.current = calculateNextAudioPlayTime(currentTime, nextPlayTimeRef.current);

            source.start(nextPlayTimeRef.current);
            nextPlayTimeRef.current += audioBuffer.duration;
          } catch (err) {
            console.error('Audio playback scheduling error:', err);
          } finally {
            audioData.close();
          }
        },
        error: (err: Error) => {
          console.warn('WebCodecs AudioDecoder runtime error:', err);
        },
      });

      // Default baseline AAC configuration
      decoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: 48000,
        numberOfChannels: 2,
      });

      decoderRef.current = decoder;
    } catch (e) {
      console.warn('WebCodecs AudioDecoder unsupported or failed to construct:', e);
    }
  }, []);

  // Update GainNode smoothly with setTargetAtTime (click-free / pop-free ramping)
  const applyGain = useCallback((muted: boolean, vol: number) => {
    const ctx = audioCtxRef.current;
    const gainNode = gainNodeRef.current;
    if (!ctx || !gainNode) return;

    const targetGain = calculateTargetGain(muted, vol);
    try {
      // 20ms time constant creates a gentle, pop-free logarithmic ramp
      gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.02);
    } catch {
      gainNode.gain.value = targetGain;
    }
  }, []);

  // Unlock AudioContext on user interaction
  const unlockAudio = useCallback(async () => {
    initAudio();
    initDecoder();

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('AudioContext resume rejected:', err);
      }
    }
  }, [initAudio, initDecoder]);

  // Set Mute state
  const setMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    isMutedRef.current = muted;
    try {
      localStorage.setItem(STORAGE_MUTED_KEY, String(muted));
    } catch {
      // Ignore localStorage errors
    }

    if (!muted) {
      unlockAudio();
    }
    applyGain(muted, volumeRef.current);
  }, [unlockAudio, applyGain]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    setMuted(!isMutedRef.current);
  }, [setMuted]);

  // Set Volume (0.0 to 1.0)
  const setVolume = useCallback((newVol: number) => {
    const clamped = clampVolume(newVol);
    setVolumeState(clamped);
    volumeRef.current = clamped;
    try {
      localStorage.setItem(STORAGE_VOLUME_KEY, String(clamped));
    } catch {
      // Ignore localStorage errors
    }

    if (clamped > 0 && isMutedRef.current) {
      // Automatically unmute if user increases volume from 0
      setMuted(false);
    } else {
      applyGain(isMutedRef.current, clamped);
    }
  }, [applyGain, setMuted]);

  // Feed incoming audio chunks from WebSocket
  const playChunk = useCallback((data: Uint8Array, ptsUs: number, isConfig: boolean) => {
    if (typeof window === 'undefined') return;

    if (!decoderRef.current) {
      initAudio();
      initDecoder();
    }

    const decoder = decoderRef.current;
    if (!decoder) return;

    if (isConfig) {
      // scrcpy sends AudioSpecificConfig packet with PTSConfigFlag
      try {
        decoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: 48000,
          numberOfChannels: 2,
          description: data,
        });
      } catch (err) {
        console.warn('Re-configuring AudioDecoder with AAC description failed:', err);
      }
      return;
    }

    if (decoder.state !== 'configured') {
      return;
    }

    try {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: ptsUs,
        data,
      });
      decoder.decode(chunk);
    } catch (err) {
      console.warn('Failed to decode audio chunk:', err);
    }
  }, [initAudio, initDecoder]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (decoderRef.current) {
        try {
          if (decoderRef.current.state !== 'closed') {
            decoderRef.current.close();
          }
        } catch {
          // Ignore
        }
        decoderRef.current = null;
      }

      if (audioCtxRef.current) {
        try {
          if (audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close();
          }
        } catch {
          // Ignore
        }
        audioCtxRef.current = null;
      }
    };
  }, []);

  return {
    isMuted,
    volume,
    toggleMute,
    setMuted,
    setVolume,
    playChunk,
    unlockAudio,
    isAudioAvailable,
  };
}
