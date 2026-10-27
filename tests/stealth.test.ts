import { describe, expect, it } from 'vitest';
import { countNearby, detectionRate, inCone, smokeBlocks } from '../src/systems/stealth';

describe('vision cone', () => {
  const half = (36 * Math.PI) / 180;
  it('sees in front within range', () => {
    expect(inCone(0, 0, 1, 100, 10, 260, half)).toBe(true);
  });
  it('does not see behind', () => {
    expect(inCone(0, 0, 1, -100, 0, 260, half)).toBe(false);
  });
  it('does not see beyond range or outside the angle', () => {
    expect(inCone(0, 0, 1, 300, 0, 260, half)).toBe(false);
    expect(inCone(0, 0, 1, 50, -150, 260, half)).toBe(false);
  });
  it('respects facing left', () => {
    expect(inCone(0, 0, -1, -100, 0, 260, half)).toBe(true);
  });
});

describe('detection', () => {
  const base = { range: 260, freerunning: false, climbing: false, restricted: false, districtAlert: false };
  it('fills faster when closer', () => {
    expect(detectionRate({ ...base, distance: 80 })).toBeGreaterThan(detectionRate({ ...base, distance: 240 }));
  });
  it('is near instant at point blank', () => {
    expect(detectionRate({ ...base, distance: 20 })).toBeGreaterThanOrEqual(10);
  });
  it('freerunning and restricted areas raise the rate', () => {
    const plain = detectionRate({ ...base, distance: 200 });
    expect(detectionRate({ ...base, distance: 200, freerunning: true })).toBeGreaterThan(plain);
    expect(detectionRate({ ...base, distance: 200, restricted: true })).toBeGreaterThan(plain);
  });
  it('counts nearby civilians for blending', () => {
    const civs = [
      { x: 100, y: 0 },
      { x: 120, y: 0 },
      { x: 90, y: 0 },
      { x: 400, y: 0 },
    ];
    expect(countNearby(105, 0, civs, 44)).toBe(3);
  });
  it('smoke blocks sight lines through it', () => {
    expect(smokeBlocks([{ x: 50, y: 0, r: 40, life: 1 }], 0, 0, 100, 0)).toBe(true);
    expect(smokeBlocks([{ x: 50, y: 200, r: 40, life: 1 }], 0, 0, 100, 0)).toBe(false);
  });
});
