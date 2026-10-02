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

  it('handles invalid or zero-dimension rects gracefully', () => {
    const zeroRect = { left: 0, top: 0, width: 0, height: 0 };
    const result = calculateNormalizedCoordinates(100, 100, zeroRect, 1080, 1920);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('correctly rounds sub-pixel coordinates to integer device pixels', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 2000 };
    // clientX = 500.4 -> (500.4/1000)*1080 = 540.432 -> Math.round -> 540
    const coords1 = calculateNormalizedCoordinates(500.4, 1000, rect, 1080, 1920);
    expect(coords1.x).toBe(540);
    expect(coords1.y).toBe(960);

    // clientX = 500.6 -> (500.6/1000)*1080 = 540.648 -> Math.round -> 541
    const coords2 = calculateNormalizedCoordinates(500.6, 1000, rect, 1080, 1920);
    expect(coords2.x).toBe(541);
  });

  it('correctly compensates for pillarboxing when canvas is wider than device aspect ratio', () => {
    // Canvas container is 600x800. Aspect ratio of 1080x1920 is 9:16 (0.5625).
    // Rendered height is 800. Rendered width is 800 * 9 / 16 = 450.
    // Horizontal padding (offsetX) = (600 - 450) / 2 = 75px on left and right.
    const pillarboxRect = { left: 50, top: 0, width: 600, height: 800 };

    // Click exactly at the left edge of rendered video (clientX = 50 + 75 = 125)
    const leftEdge = calculateNormalizedCoordinates(125, 400, pillarboxRect, 1080, 1920);
    expect(leftEdge.x).toBe(0);
    expect(leftEdge.y).toBe(960);

    // Click at the center of rendered video (clientX = 50 + 75 + 225 = 350)
    const center = calculateNormalizedCoordinates(350, 400, pillarboxRect, 1080, 1920);
    expect(center.x).toBe(540);
    expect(center.y).toBe(960);

    // Click at the right edge of rendered video (clientX = 50 + 75 + 450 = 575)
    const rightEdge = calculateNormalizedCoordinates(575, 400, pillarboxRect, 1080, 1920);
    expect(rightEdge.x).toBe(1079);
    expect(rightEdge.y).toBe(960);
  });
});

