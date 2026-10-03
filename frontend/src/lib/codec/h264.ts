import { CodecHandler } from './types';
import { extractCodecProfile, hasSps, concatBuffers } from '../h264';
import { isCodecSupported } from './support';

export class H264Handler implements CodecHandler {
  readonly id = 'h264';
  readonly label = 'H.264 (AVC)';
  readonly wireId = 0x01;
  readonly defaultCodecString = 'avc1.42e01f'; // Constrained Baseline Level 3.1

  async isSupported(): Promise<boolean> {
    return isCodecSupported(this.defaultCodecString);
  }

  extractCodecString(configData: Uint8Array): string {
    return extractCodecProfile(configData);
  }

  prepareKeyframe(configData: Uint8Array | null, keyframeData: Uint8Array): Uint8Array {
    if (configData && configData.length > 0 && !hasSps(keyframeData)) {
      return concatBuffers(configData, keyframeData);
    }
    return keyframeData;
  }
}

export const h264Handler = new H264Handler();
