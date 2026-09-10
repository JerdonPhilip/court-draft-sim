/**
 * Platform-agnostic secure randomness shared by the server and the offline
 * browser engine. Uses WebCrypto (`globalThis.crypto`), available in Node 18+
 * and all modern browsers — same CSPRNG quality as `node:crypto` with no
 * Node-only imports, so these services bundle cleanly for the PWA.
 */

/** Uniform integer in [0, max). Throws on non-positive max. */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error('secureRandomInt requires a positive integer max');
  }
  const gCrypto = (globalThis as { crypto?: { getRandomValues?: (arr: Uint32Array) => void } }).crypto;
  if (gCrypto?.getRandomValues) {
    // Rejection sampling to avoid modulo bias.
    const range = 0x100000000;
    const limit = range - (range % max);
    const buf = getRandomBuffer();
    for (;;) {
      const v = nextBufferedUint32(gCrypto, buf);
      if (v < limit) return v % max;
    }
  }
  // Non-secure fallback (should never trigger on supported platforms).
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn('secureRandomInt: WebCrypto unavailable, falling back to Math.random');
  }
  return Math.floor(Math.random() * max);
}

// Batch crypto calls: one getRandomValues fills 64 values, amortizing the
// overhead across hot sim loops (hundreds of draws per game).
const BUFFER_SIZE = 64;
const randomBuffer = new Uint32Array(BUFFER_SIZE);
let randomCursor = BUFFER_SIZE; // force refill on first use
let warnedFallback = false;

function getRandomBuffer(): Uint32Array {
  return randomBuffer;
}

function nextBufferedUint32(
  gCrypto: { getRandomValues?: (arr: Uint32Array) => void },
  buf: Uint32Array,
): number {
  if (randomCursor >= buf.length) {
    gCrypto.getRandomValues!(buf);
    randomCursor = 0;
  }
  return buf[randomCursor++]!;
}

/** Uniform float in [0, 1) via crypto for auditable fairness (draft + sim). */
export function secureRandom(): number {
  return secureRandomInt(1_000_000) / 1_000_000;
}
