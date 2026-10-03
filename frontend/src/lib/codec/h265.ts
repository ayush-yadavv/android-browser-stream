import { CodecHandler } from './types';
import { concatBuffers } from '../h264';
import { isCodecSupported } from './support';

export class H265Handler implements CodecHandler {
  readonly id = 'h265';
  readonly label = 'H.265 (HEVC)';
  readonly wireId = 0x02;
  readonly defaultCodecString = 'hev1.1.6.L93.B0'; // Main Profile Level 3.1 Main tier

  async isSupported(): Promise<boolean> {
    return isCodecSupported(this.defaultCodecString);
  }

  extractCodecString(_configData: Uint8Array): string {
    // Return standard HEVC Main profile string
    return this.defaultCodecString;
  }

  prepareKeyframe(configData: Uint8Array | null, keyframeData: Uint8Array): Uint8Array {
    if (configData && configData.length > 0) {
      // If keyframe doesn't start with VPS/SPS, prepend config
      return concatBuffers(configData, keyframeData);
    }
    return keyframeData;
  }
}

export const h265Handler = new H265Handler();
