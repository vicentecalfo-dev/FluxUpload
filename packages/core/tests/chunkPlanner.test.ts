import { describe, expect, it } from 'vitest';

import { planParts } from '../src/chunkPlanner';

describe('planParts', () => {
  it('returns empty array when file is empty', () => {
    expect(planParts(0, 1024)).toEqual([]);
  });

  it('creates a single part when file size is smaller than chunk size', () => {
    expect(planParts(10, 64)).toEqual([
      {
        partNumber: 1,
        startByte: 0,
        endByteExclusive: 10,
      },
    ]);
  });

  it('splits file into equal-sized parts', () => {
    const parts = planParts(20, 5);

    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ partNumber: 1, startByte: 0, endByteExclusive: 5 });
    expect(parts[3]).toEqual({ partNumber: 4, startByte: 15, endByteExclusive: 20 });
  });

  it('handles remainder in the last part', () => {
    const parts = planParts(21, 5);

    expect(parts).toHaveLength(5);
    expect(parts[4]).toEqual({ partNumber: 5, startByte: 20, endByteExclusive: 21 });
  });

  it('covers the full file without gaps or overlaps', () => {
    const parts = planParts(17, 4);

    expect(parts[0]?.startByte).toBe(0);
    expect(parts[parts.length - 1]?.endByteExclusive).toBe(17);

    for (let i = 1; i < parts.length; i += 1) {
      expect(parts[i]?.startByte).toBe(parts[i - 1]?.endByteExclusive);
    }
  });

  it('throws for invalid inputs', () => {
    expect(() => planParts(-1, 4)).toThrow();
    expect(() => planParts(10, 0)).toThrow();
    expect(() => planParts(10, -4)).toThrow();
    expect(() => planParts(10.5, 4)).toThrow();
  });
});
