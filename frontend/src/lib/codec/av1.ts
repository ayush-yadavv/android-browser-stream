import { CodecHandler } from './types';
import { isCodecSupported } from './support';

export class AV1Handler implements CodecHandler {
  readonly id = 'av1';
  readonly label = 'AV1';
  readonly wireId = 0x03;
  readonly defaultCodecString = 'av01.0.05M.08'; // Main Profile Level 3.1 8-bit

  async isSupported(): Promise<boolean> {
    return isCodecSupported(this.defaultCodecString);
  }

  extractCodecString(_configData: Uint8Array): string {
    return this.defaultCodecString;
  }

  prepareKeyframe(_configData: Uint8Array | null, keyframeData: Uint8Array): Uint8Array {
    // WebCodecs decodes raw AV1 OBU sequence natively
    return keyframeData;
  }
}

export const av1Handler = new AV1Handler();
