import type { PartSpec } from './types.js';

export function planParts(fileSize: number, chunkSize: number): PartSpec[] {
  if (!Number.isFinite(fileSize) || fileSize < 0) {
    throw new RangeError('fileSize must be a non-negative finite number.');
  }

  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError('chunkSize must be a positive finite number.');
  }

  if (!Number.isInteger(fileSize) || !Number.isInteger(chunkSize)) {
    throw new RangeError('fileSize and chunkSize must be integers.');
  }

  if (fileSize === 0) {
    return [];
  }

  const parts: PartSpec[] = [];
  let partNumber = 1;

  for (let startByte = 0; startByte < fileSize; startByte += chunkSize) {
    const endByteExclusive = Math.min(fileSize, startByte + chunkSize);
    parts.push({
      partNumber,
      startByte,
      endByteExclusive,
    });
    partNumber += 1;
  }

  return parts;
}
