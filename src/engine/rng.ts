import type { DieValue } from "./types";

/**
 * Seedable PRNG using mulberry32 algorithm.
 * Produces deterministic sequences from a numeric seed.
 */
export class RNG {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === "string" ? RNG.hashString(seed) : seed;
    // Ensure non-zero state
    if (this.state === 0) this.state = 1;
  }

  /** Hash a string seed into a 32-bit integer */
  static hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return hash === 0 ? 1 : hash;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Roll a single d6 */
  rollD6(): DieValue {
    return this.nextInt(1, 6) as DieValue;
  }

  /** Roll N d6s */
  rollDice(count: number): DieValue[] {
    const results: DieValue[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollD6());
    }
    return results;
  }

  /** Shuffle an array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Pick one of the 6 hex directions */
  rollDirection(): "N" | "NE" | "SE" | "S" | "SW" | "NW" {
    const directions = ["N", "NE", "SE", "S", "SW", "NW"] as const;
    return directions[this.nextInt(0, 5)];
  }

  /** Get current internal state (for serialization) */
  getState(): number {
    return this.state;
  }

  /** Restore from serialized state */
  static fromState(state: number): RNG {
    const rng = new RNG(1);
    rng.state = state;
    return rng;
  }
}
