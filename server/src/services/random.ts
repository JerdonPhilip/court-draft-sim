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
    const buf = new Uint32Array(1);
    for (;;) {
      gCrypto.getRandomValues(buf);
      const v = buf[0]!;
      if (v < limit) return v % max;
    }
  }
  // Non-secure fallback (should never trigger on supported platforms).
  return Math.floor(Math.random() * max);
}

/** Uniform float in [0, 1) via crypto for auditable fairness (draft + sim). */
export function secureRandom(): number {
  return secureRandomInt(1_000_000) / 1_000_000;
}
