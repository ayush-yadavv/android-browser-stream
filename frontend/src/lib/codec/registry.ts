import { CodecHandler } from './types';
import { h264Handler } from './h264';
import { h265Handler } from './h265';
import { av1Handler } from './av1';

const registry: Record<string, CodecHandler> = {
  h264: h264Handler,
  h265: h265Handler,
  av1: av1Handler,
};

const wireRegistry: Record<number, CodecHandler> = {
  0x01: h264Handler,
  0x02: h265Handler,
  0x03: av1Handler,
};

export class CodecFactory {
  static getById(id: string): CodecHandler {
    return registry[id.toLowerCase()] || h264Handler;
  }

  static getByWireId(wireId: number): CodecHandler {
    return wireRegistry[wireId] || h264Handler;
  }

  /**
   * Probes client browser support in order of compression efficiency: AV1 -> H.265 -> H.264 (baseline)
   */
  static async probeSupported(): Promise<string[]> {
    const handlers: CodecHandler[] = [av1Handler, h265Handler, h264Handler];
    const supported: string[] = [];

    for (const handler of handlers) {
      if (await handler.isSupported()) {
        supported.push(handler.id);
      }
    }

    // Universal baseline floor: always ensure h264 is included as fallback
    if (!supported.includes('h264')) {
      supported.push('h264');
    }

    return supported;
  }
}
