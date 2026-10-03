import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHANNEL_CONTROL,
  buildPingPacket,
  parsePingMessage,
  parseVideoMessage,
  parseAudioMessage,
  parseMetadataMessage,
  parseClipboardDeviceMessage,
  ParsedMetadataHeader,
} from '../lib/protocol';
import { CodecFactory } from '../lib/codec/registry';

interface WebSocketHookProps {
  sessionId: string | null;
  onVideoPacket: (nalData: Uint8Array, ptsUs: number, isKey: boolean, isConfig: boolean) => void;
  onAudioPacket?: (data: Uint8Array, ptsUs: number, isConfig: boolean) => void;
  onMetadata?: (meta: ParsedMetadataHeader) => void;
  onClipboardReceived?: (text: string) => void;
  onPong?: (rttMs: number) => void;
  onBytesReceived?: (byteCount: number) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket({
  sessionId,
  onVideoPacket,
  onAudioPacket,
  onMetadata,
  onClipboardReceived,
  onPong,
  onBytesReceived,
  onOpen,
  onClose,
  onError,
}: WebSocketHookProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const isDisposedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest callbacks in ref to avoid bouncing socket connection on parent re-renders
  const callbacksRef = useRef({
    onVideoPacket,
    onAudioPacket,
    onMetadata,
    onClipboardReceived,
    onPong,
    onBytesReceived,
    onOpen,
    onClose,
    onError,
  });
  useEffect(() => {
    callbacksRef.current = {
      onVideoPacket,
      onAudioPacket,
      onMetadata,
      onClipboardReceived,
      onPong,
      onBytesReceived,
      onOpen,
      onClose,
      onError,
    };
  });

  const connect = useCallback(async () => {
    if (!sessionId) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // Capability negotiation: probe supported codecs (AV1, H265, H264)
    const supportedCodecs = await CodecFactory.probeSupported();
    if (isDisposedRef.current) {
      return;
    }

    // Build WebSocket URL with negotiated codecs query parameter
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/sessions/${sessionId}/stream?codecs=${encodeURIComponent(
      supportedCodecs.join(',')
    )}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      callbacksRef.current.onOpen?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'object' || !(event.data instanceof ArrayBuffer)) {
        return;
      }

      callbacksRef.current.onBytesReceived?.(event.data.byteLength);

      // Check if this is a stream metadata handshake packet (Channel 0x04)
      const meta = parseMetadataMessage(event.data);
      if (meta) {
        callbacksRef.current.onMetadata?.(meta);
        return;
      }

      // Check if this is an incoming device clipboard packet (Channel 0x02, type 0x00)
      const clipboard = parseClipboardDeviceMessage(event.data);
      if (clipboard) {
        callbacksRef.current.onClipboardReceived?.(clipboard.text);
        return;
      }

      // Check if this is a pong echo packet
      const ping = parsePingMessage(event.data);
      if (ping) {
        const rtt = Math.max(0, performance.now() - ping.timestampMs);
        callbacksRef.current.onPong?.(rtt);
        return;
      }

      // Check if this is an audio packet (Channel 0x01)
      const audio = parseAudioMessage(event.data);
      if (audio) {
        callbacksRef.current.onAudioPacket?.(audio.data, audio.ptsMicroseconds, audio.isConfig);
        return;
      }

      // Check if this is a video packet
      const video = parseVideoMessage(event.data);
      if (video) {
        callbacksRef.current.onVideoPacket(
          video.nalData,
          video.ptsMicroseconds,
          video.isKeyFrame,
          video.isConfig
        );
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket streaming transport error:', err);
      setError((prev) => prev || 'Connection interrupted');
      callbacksRef.current.onError?.(err);
    };

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false);
      if (event.reason) {
        setError(event.reason);
      }
      callbacksRef.current.onClose?.();
    };
  }, [sessionId]);

  const disconnect = useCallback(() => {
    isDisposedRef.current = true;
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
    setIsConnected(false);
  }, []);

  const sendControl = useCallback((payload: Uint8Array | ArrayBuffer) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const payloadBytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    const framed = new Uint8Array(1 + payloadBytes.byteLength);
    framed[0] = CHANNEL_CONTROL;
    framed.set(payloadBytes, 1);

    ws.send(framed);
  }, []);

  const sendPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const pingPacket = buildPingPacket(performance.now());
    ws.send(pingPacket.buffer);
  }, []);

  useEffect(() => {
    isDisposedRef.current = false;
    if (sessionId) {
      connect();
    }
    return () => {
      isDisposedRef.current = true;
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  return {
    isConnected,
    error,
    sendControl,
    sendPing,
    reconnect: connect,
    disconnect,
  };
}
