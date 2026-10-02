import { describe, it, expect } from 'vitest';
import { calculateNormalizedCoordinates } from './useInputCapture';

describe('useInputCapture helpers', () => {
  it('calculates normalized coordinates correctly within device resolution', () => {
    const rect = {
      left: 100,
      top: 50,
      width: 540,
      height: 960,
    };

    // Center of canvas -> center of 1080x1920
    const coords = calculateNormalizedCoordinates(
      370, // 100 + 270
      530, // 50 + 480
      rect,
      1080,
      1920
    );

    expect(coords.x).toBe(540);
    expect(coords.y).toBe(960);
  });

  it('clamps coordinates to boundaries [0, W-1], [0, H-1]', () => {
    const rect = {
      left: 100,
      top: 50,
      width: 540,
      height: 960,
    };

    // Off canvas to left/top
    const topLeft = calculateNormalizedCoordinates(50, 20, rect, 1080, 1920);
    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);

    // Off canvas to right/bottom
    const bottomRight = calculateNormalizedCoordinates(1000, 2000, rect, 1080, 1920);
    expect(bottomRight.x).toBe(1079);
    expect(bottomRight.y).toBe(1919);
  });
});
