export interface CodecHandler {
  readonly id: string;           // 'h264' | 'h265' | 'av1'
  readonly label: string;        // 'H.264' | 'H.265 (HEVC)' | 'AV1'
  readonly wireId: number;       // 0x01 | 0x02 | 0x03
  readonly defaultCodecString: string;

  isSupported(): Promise<boolean>;
  extractCodecString(configData: Uint8Array): string;
  prepareKeyframe(configData: Uint8Array | null, keyframeData: Uint8Array): Uint8Array;
}
